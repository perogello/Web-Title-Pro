import fs from 'node:fs';
import { createProjectBundleStream, importProjectBundle } from '../server/templates/bundle-service.js';

// Stub a minimal template service — just enough for the bundle code.
const fakeTemplateService = {
  customTemplatesDir: '/tmp/bundle-test-customs',
  getTemplates: () => [
    { id: 't-1', slug: 't-1', source: 'custom', directory: '/tmp/bundle-test-templates/t-1' },
    { id: 't-builtin', slug: 't-builtin', source: 'builtin', directory: '/tmp/bundle-test-templates/t-builtin' },
  ],
  scanTemplates: async () => {},
};

fs.rmSync('/tmp/bundle-test-templates', { recursive: true, force: true });
fs.rmSync('/tmp/bundle-test-customs', { recursive: true, force: true });
fs.mkdirSync('/tmp/bundle-test-templates/t-1', { recursive: true });
fs.writeFileSync('/tmp/bundle-test-templates/t-1/index.html', '<div>Hello t-1</div>');
fs.writeFileSync('/tmp/bundle-test-templates/t-1/template.json', '{"name":"T-1"}');
fs.mkdirSync('/tmp/bundle-test-customs', { recursive: true });

const project = {
  version: 1,
  meta: { name: 'TestProject' },
  state: { entries: [{ id: 'e-1', templateId: 't-1' }] },
  sources: { items: [] },
};

const { stream, manifest } = createProjectBundleStream({ project, templateService: fakeTemplateService });
console.log('Manifest:', JSON.stringify(manifest));

const chunks = [];
for await (const chunk of stream) chunks.push(chunk);
const zipBuf = Buffer.concat(chunks);
console.log('Bundle size:', zipBuf.length, 'bytes');

const result = await importProjectBundle({ buffer: zipBuf, templateService: fakeTemplateService });
console.log('Import result:', JSON.stringify(result, null, 2));
console.log('Extracted contents of t-1:', fs.readdirSync('/tmp/bundle-test-customs/t-1'));
console.log('index.html content:', fs.readFileSync('/tmp/bundle-test-customs/t-1/index.html', 'utf8'));
