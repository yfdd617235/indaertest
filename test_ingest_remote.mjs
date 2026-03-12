import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testIngest() {
  const driveFileId = "11NQ7JSibRzzGO1DJccudv2hWPvcj7fIc";
  const fileName = "512187639.pdf";
  
  console.log(`Testing ingestion for ${fileName}...`);
  
  try {
    const res = await fetch('http://localhost:3000/api/ingest', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        driveFileId,
        fileName,
        mimeType: "application/pdf"
      })
    });
    
    console.log(`Status: ${res.status}`);
    const data = await res.json();
    console.log(`Response:`, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Fetch Error:`, err.message);
  }
}

testIngest();
