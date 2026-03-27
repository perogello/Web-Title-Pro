const path = require('node:path');
const { spawn } = require('node:child_process');

const electronPath = require('electron');
const appEntry = path.resolve(__dirname, '..', 'desktop', 'main.cjs');
const childEnv = { ...process.env };

delete childEnv.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, [appEntry], {
  stdio: 'inherit',
  env: childEnv,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
