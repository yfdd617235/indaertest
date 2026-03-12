import { google } from 'googleapis';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testDirectFetch() {
  const fileId = "1tmjqqpjsjpUAcA5HjyqkCMky6QPuCpo1B";
  const credentialsJson = process.env.GOOGLE_DRIVE_CREDENTIALS_JSON;
  let credentials = JSON.parse(credentialsJson);
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  const accessToken = await auth.getAccessToken();

  console.log(`Testing direct fetch for fileId: ${fileId}...`);

  try {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      }
    });
    
    console.log(`Status: ${res.status}`);
    if (res.ok) {
        const buffer = await res.arrayBuffer();
        console.log(`Success! Downloaded ${buffer.byteLength} bytes.`);
    } else {
        const text = await res.text();
        console.log(`Error Body: ${text}`);
    }
  } catch (err) {
    console.error(`Fetch Failed:`, err);
  }
}

testDirectFetch();
