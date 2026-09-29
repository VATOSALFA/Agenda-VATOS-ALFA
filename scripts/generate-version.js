const fs = require('fs');
const path = require('path');

try {
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

  let buildId = Date.now().toString();
  const versionFilePath = path.join(publicDir, 'version.json');

  // Si se solicita lanzamiento silencioso o preservar versión para no mostrar modal
  if (releaseData.silent || releaseData.showModal === false || releaseData.preserveVersion) {
    if (fs.existsSync(versionFilePath)) {
      try {
        const oldVersionData = JSON.parse(fs.readFileSync(versionFilePath, 'utf8'));
        if (oldVersionData.version) {
          buildId = oldVersionData.version;
          console.log(`[Version Generator] Silent release active. Preserving version ${buildId}`);
        }
      } catch (_) {}
    }
  }

  const versionPayload = {
    version: releaseData.version || buildId,
    timestamp: new Date().toISOString(),
    ...releaseData
  };
  
  fs.writeFileSync(versionFilePath, JSON.stringify(versionPayload, null, 2));

  console.log(`[Version Generator] Generated public/version.json with version ${versionPayload.version} (silent: ${Boolean(releaseData.silent || releaseData.showModal === false)})`);
} catch (error) {
  console.error('[Version Generator] Failed to generate version:', error);
  process.exit(1);
}
