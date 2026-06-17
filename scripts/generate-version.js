const fs = require('fs');
const path = require('path');

try {
  const buildId = Date.now().toString();
  const publicDir = path.join(__dirname, '..', 'public');
  
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  
  const versionFilePath = path.join(publicDir, 'version.json');
  fs.writeFileSync(versionFilePath, JSON.stringify({ version: buildId }, null, 2));

  console.log(`[Version Generator] Generated public/version.json with version ${buildId}`);
} catch (error) {
  console.error('[Version Generator] Failed to generate version:', error);
  process.exit(1);
}
