const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;
const releaseDir = path.join(rootDir, 'release');
const versionedExePath = path.join(releaseDir, `WebTitlePro-${version}.exe`);
const stableExePath = path.join(releaseDir, 'WebTitlePro.exe');

if (!fs.existsSync(versionedExePath)) {
  console.error(`Portable build was not found: ${versionedExePath}`);
  process.exit(1);
}

fs.copyFileSync(versionedExePath, stableExePath);
console.log(`Created stable launcher executable: ${stableExePath}`);
