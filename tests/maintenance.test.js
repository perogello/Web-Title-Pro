import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { collectCleanupTargets, buildCleanupScript, UPDATE_LEFTOVER_PREFIX } =
  require('../desktop/integrations/maintenance.cjs');

test('collectCleanupTargets: userData + fixed portable unpack dir', () => {
  const targets = collectCleanupTargets({
    userDataDir: 'C:\\Users\\op\\AppData\\Roaming\\Web Title Pro',
    tempDir: 'C:\\Users\\op\\AppData\\Local\\Temp',
  });
  assert.equal(targets.length, 2);
  assert.ok(targets[0].includes('Web Title Pro'));
  assert.ok(targets[1].endsWith('WebTitlePro'));
});

test('collectCleanupTargets: tolerates missing paths', () => {
  assert.deepEqual(collectCleanupTargets({}), []);
});

test('buildCleanupScript: reset waits for pid, wipes targets, relaunches, self-deletes', () => {
  const script = buildCleanupScript({
    mode: 'reset',
    pid: 4242,
    targets: ['C:\\Users\\op\\AppData\\Roaming\\Web Title Pro'],
    relaunchExePath: 'D:\\Apps\\WebTitlePro.exe',
    tempDir: 'C:\\Users\\op\\AppData\\Local\\Temp',
  });
  assert.ok(script.includes('$appPid = 4242'));
  assert.ok(script.includes("Remove-WithRetry 'C:\\Users\\op\\AppData\\Roaming\\Web Title Pro'"));
  assert.ok(script.includes(UPDATE_LEFTOVER_PREFIX));
  assert.ok(script.includes("Start-Process -FilePath 'D:\\Apps\\WebTitlePro.exe'"));
  assert.ok(script.includes('Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force'));
  // Reset must NOT delete the exe or show the farewell box.
  assert.ok(!script.includes('MessageBox'));
});

test('buildCleanupScript: uninstall deletes exes, shows farewell, no relaunch', () => {
  const script = buildCleanupScript({
    mode: 'uninstall',
    pid: 7,
    targets: ['C:\\data'],
    exePaths: ['D:\\Apps\\WebTitlePro-0.4.10.exe', 'D:\\Apps\\WebTitlePro.exe'],
    tempDir: 'C:\\Temp',
  });
  assert.ok(script.includes("Remove-WithRetry 'D:\\Apps\\WebTitlePro-0.4.10.exe'"));
  assert.ok(script.includes("Remove-WithRetry 'D:\\Apps\\WebTitlePro.exe'"));
  assert.ok(script.includes('MessageBox'));
  assert.ok(!script.includes('Start-Process'));
});

test('buildCleanupScript: single quotes in paths are escaped for PowerShell', () => {
  const script = buildCleanupScript({
    mode: 'reset',
    pid: 1,
    targets: ["C:\\User's Data\\app"],
  });
  assert.ok(script.includes("'C:\\User''s Data\\app'"));
});
