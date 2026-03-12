import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testExport() {
  // Use a known complete document from previous check: 0003010968.pdf
  // Drive ID: let's find it.
  
  const driveFileId = "11NQ7JSibRzzGO1DJccudv2hWPvcj7fIc"; // Testing with the one that failed too
  const fileName = "512187639.pdf";
  
  console.log(`Testing export for ${fileName}...`);
  
  try {
    const res = await fetch('http://localhost:3000/api/extract-table', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        driveFileId,
        fileName
      })
    });
    
    console.log(`Status: ${res.status}`);
    if (res.ok) {
        console.log("Success! Headers:");
        console.log("- Content-Type:", res.headers.get('Content-Type'));
        console.log("- X-Table-Name:", res.headers.get('X-Table-Name'));
        console.log("- X-Row-Count:", res.headers.get('X-Row-Count'));
    } else {
        const text = await res.text();
        console.log("Error body:", text);
    }
  } catch (err) {
    console.error(`Fetch Error:`, err.message);
  }
}

testExport();
