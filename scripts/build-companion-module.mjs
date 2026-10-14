// Builds the Bitfocus Companion connection module (companion-module/) into
//   companion-module/dist/web-title-pro/           — "developer modules" folder layout
//   companion-module/dist/web-title-pro-<ver>.tgz  — for Companion's "Import module package"
//
// Same recipe Companion uses for its own test modules: one esbuild bundle (CJS,
// node18) with @companion-module/base inside, so the module needs no
// node_modules. API 1.11.3 + node18 runs on Companion 3.5 and newer (4.x, 5.x).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import * as esbuild from 'esbuild';
import { TarArchive } from 'archiver';

const require = createRequire(import.meta.url);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const moduleRoot = path.join(rootDir, 'companion-module');
const distRoot = path.join(moduleRoot, 'dist');
export const COMPANION_MODULE_ID = 'web-title-pro';
const outDir = path.join(distRoot, COMPANION_MODULE_ID);

const appPackage = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const baseVersion = require('@companion-module/base/package.json').version;
const version = appPackage.version;

const manifest = {
  id: COMPANION_MODULE_ID,
  name: 'Web Title Pro',
  shortname: 'WebTitlePro',
  description: 'Control Web Title Pro titles, outputs and timers with live on-air feedback.',
  version,
  license: 'MIT',
  repository: 'git+https://github.com/perogello/Web-Title-Pro.git',
  bugs: 'https://github.com/perogello/Web-Title-Pro/issues',
  maintainers: [{ name: 'perogello' }],
  legacyIds: [],
  runtime: {
    type: 'node18',
    api: 'nodejs-ipc',
    apiVersion: baseVersion,
    entrypoint: 'main.js',
  },
  manufacturer: 'Web Title Pro',
  products: ['Web Title Pro'],
  keywords: ['titles', 'graphics', 'lower third', 'vmix', 'obs', 'timer'],
};

fs.rmSync(distRoot, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, 'companion'), { recursive: true });

await esbuild.build({
  entryPoints: [path.join(moduleRoot, 'src', 'main.js')],
  bundle: true,
  minify: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  // ws's optional native speed-ups; it falls back to pure JS without them.
  external: ['bufferutil', 'utf-8-validate'],
  // The module compares this with the module version bundled in the WTP it
  // connects to and warns when they differ (e.g. an old .tgz on another PC).
  define: { __WTP_MODULE_VERSION__: JSON.stringify(version) },
  outfile: path.join(outDir, 'companion', 'main.js'),
  banner: { js: `/* Web Title Pro Companion module ${version} (@companion-module/base ${baseVersion}). Generated — edit companion-module/src. */` },
  logLevel: 'warning',
});

fs.writeFileSync(path.join(outDir, 'companion', 'manifest.json'), `${JSON.stringify(manifest, null, '\t')}\n`);
fs.copyFileSync(path.join(moduleRoot, 'companion', 'HELP.md'), path.join(outDir, 'companion', 'HELP.md'));
// type=commonjs pins the bundle's module type; no @companion-module/base
// dependency is declared, so Companion treats it as a packaged module and the
// manifest apiVersion is authoritative.
fs.writeFileSync(
  path.join(outDir, 'package.json'),
  `${JSON.stringify({ name: `companion-module-${COMPANION_MODULE_ID}`, version, private: true, type: 'commonjs' }, null, '\t')}\n`,
);

// .tgz: Companion expects the FIRST tar entry to be the root directory and
// strips it on import, so add that directory entry explicitly.
const tgzPath = path.join(distRoot, `${COMPANION_MODULE_ID}-${version}.tgz`);
await new Promise((resolve, reject) => {
  const output = fs.createWriteStream(tgzPath);
  const archive = new TarArchive({ gzip: true, gzipOptions: { level: 9 } });
  output.on('close', resolve);
  archive.on('error', reject);
  archive.pipe(output);
  archive.append(null, { name: 'pkg/', type: 'directory' });
  archive.directory(outDir, 'pkg');
  archive.finalize();
});

const size = (file) => `${(fs.statSync(file).size / 1024).toFixed(0)} KB`;
console.log(`Companion module ${version} (API ${baseVersion}, node18)`);
console.log(`  folder: ${path.relative(rootDir, outDir)}  (main.js ${size(path.join(outDir, 'companion', 'main.js'))})`);
console.log(`  package: ${path.relative(rootDir, tgzPath)}  (${size(tgzPath)})`);
