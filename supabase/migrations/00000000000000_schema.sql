-- Habilitar pgvector
create extension if not exists vector;

-- Tabla principal de documentos
create table documents (
    id uuid primary key default gen_random_uuid(),
    drive_file_id text not null unique,
    name text not null,
    original_path text not null,
    tags jsonb default '[]'::jsonb, -- ['Form One', 'Logbook', 'AD']
    metadata jsonb default '{}'::jsonb, -- Para Part Numbers (PN), Serial Numbers (SN), etc.
    status text default 'processing', -- processing, complete, error
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabla de chunks para búsqueda semántica (Vector)
create table document_chunks (
    id uuid primary key default gen_random_uuid(),
    document_id uuid references documents(id) on delete cascade not null,
    content text not null, -- El texto de este chunk o fila específica
    context jsonb default '{}'::jsonb, -- Contexto adicional para este chunk (Ej: Cabeceras de la tabla)
    embedding vector(1536), -- Ajustado para el modelo de OpenAI o similar (o 768 / 1024 dependiendo del modelo embedding). Usaremos 1536 como estándar por ahora.
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Index para búsqueda semántica más rápida
create index on document_chunks using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

-- Trigger para updated_at en documents
create or replace function update_modified_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language 'plpgsql';

create trigger update_documents_modtime
before update on documents
for each row execute procedure update_modified_column();

-- Función para búsqueda híbrida (Vector + Metadata Filtering)
create or replace function match_document_chunks_v1(
    query_embedding vector(1536),
    match_threshold float,
    match_count int,
    filter_pn text default null,
    filter_sn text default null
)
returns table (
    id uuid,
    document_id uuid,
    content text,
    document_name text,
    drive_file_id text,
    similarity float
)
language sql stable
as $$
select
    dc.id,
    dc.document_id,
    dc.content,
    d.name as document_name,
    d.drive_file_id,
    1 - (dc.embedding <=> query_embedding) as similarity
from document_chunks dc
join documents d on d.id = dc.document_id
where 1 - (dc.embedding <=> query_embedding) > match_threshold
  and (filter_pn is null or d.metadata->>'PN' = filter_pn)
  and (filter_sn is null or d.metadata->>'SN' = filter_sn)
order by dc.embedding <=> query_embedding
limit match_count;
$$;
