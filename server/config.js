import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dataDir = process.env.WEB_TITLE_PRO_DATA_DIR || path.join(rootDir, 'data');
const storageDir = process.env.WEB_TITLE_PRO_STORAGE_DIR || path.join(rootDir, 'storage');

// When packaged, server code runs from inside app.asar (rootDir ends with
// "app.asar"). The builtin template/plugin dirs are asarUnpack'd to
// app.asar.unpacked, so they exist as real files there. Point the dirs we
// *scan* at that real location: fs-extra's readdir/stat do NOT go through
// Electron's asar layer (unlike core fs used by express.static), so a virtual
// app.asar path makes every builtin template and plugin silently invisible.
const builtinRootDir = rootDir.endsWith('app.asar') ? `${rootDir}.unpacked` : rootDir;

export const config = {
  port: Number(process.env.PORT || 4000),
  rootDir,
  clientDistDir: path.join(rootDir, 'dist'),
  rendererDir: path.join(rootDir, 'renderer'),
  builtinTemplatesDir: path.join(builtinRootDir, 'templates'),
  customTemplatesDir: path.join(storageDir, 'templates'),
  builtinPluginsDir: path.join(builtinRootDir, 'plugins'),
  customPluginsDir: path.join(storageDir, 'plugins'),
  stateFile: path.join(dataDir, 'state.json'),
};
