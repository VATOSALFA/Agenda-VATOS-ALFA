const fs = require('fs');
const path = require('path');

try {
  const buildId = Date.now().toString();
  const publicDir = path.join(__dirname, '..', 'public');
  const rootDir = path.join(__dirname, '..');
  
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  let releaseData = {
    title: "Nueva actualización disponible",
    summary: "Mejoras de rendimiento y nuevas funciones.",
    notes: [
      "Optimización de velocidad y rendimiento.",
      "Correcciones y mejoras en la interfaz."
    ]
  };

  const releaseNotesPath = path.join(rootDir, 'release-notes.json');
  if (fs.existsSync(releaseNotesPath)) {
    try {
      const rawContent = fs.readFileSync(releaseNotesPath, 'utf8').replace(/^\uFEFF/, '').trim();
      const fileContent = JSON.parse(rawContent);
      releaseData = { ...releaseData, ...fileContent };
    } catch (e) {
      console.warn('[Version Generator] Could not parse release-notes.json:', e);
    }
  }

  const versionPayload = {
    version: buildId,
    timestamp: new Date().toISOString(),
    ...releaseData
  };
  
  const versionFilePath = path.join(publicDir, 'version.json');
  fs.writeFileSync(versionFilePath, JSON.stringify(versionPayload, null, 2));

  console.log(`[Version Generator] Generated public/version.json with version ${buildId}`);
} catch (error) {
  console.error('[Version Generator] Failed to generate version:', error);
  process.exit(1);
}
