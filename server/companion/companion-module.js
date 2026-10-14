// Locates the built Bitfocus Companion module shipped with the app
// (companion-module/dist, produced by scripts/build-companion-module.mjs).
// Served to the control panel so the operator can see the module path and
// download the .tgz for Companion's "Import module package" — also from a
// browser on another machine, when Companion runs elsewhere.
import fs from 'node:fs';
import path from 'node:path';

export const COMPANION_MODULE_ID = 'web-title-pro';

export const getCompanionModuleInfo = (distDir) => {
  const folder = path.join(distDir, COMPANION_MODULE_ID);
  const manifestPath = path.join(folder, 'companion', 'manifest.json');

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const packageName = `${COMPANION_MODULE_ID}-${manifest.version}.tgz`;
    const packagePath = path.join(distDir, packageName);
    return {
      available: true,
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      apiVersion: manifest.runtime?.apiVersion || null,
      folder,
      packageName,
      packagePath: fs.existsSync(packagePath) ? packagePath : null,
    };
  } catch {
    return {
      available: false,
      id: COMPANION_MODULE_ID,
      folder,
      error: 'The Companion module is not built. Run: npm run build:companion',
    };
  }
};
