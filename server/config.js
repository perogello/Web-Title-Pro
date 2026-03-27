import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dataDir = process.env.WEB_TITLE_PRO_DATA_DIR || path.join(rootDir, 'data');
const storageDir = process.env.WEB_TITLE_PRO_STORAGE_DIR || path.join(rootDir, 'storage');

export const config = {
  port: Number(process.env.PORT || 4000),
  rootDir,
  clientDistDir: path.join(rootDir, 'dist'),
  rendererDir: path.join(rootDir, 'renderer'),
  builtinTemplatesDir: path.join(rootDir, 'templates'),
  customTemplatesDir: path.join(storageDir, 'templates'),
  stateFile: path.join(dataDir, 'state.json'),
};
