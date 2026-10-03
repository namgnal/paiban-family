import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const manifest = JSON.parse(await readFile('dist/build-files.json', 'utf8'));
assert.equal(new Set(manifest.files).size, manifest.files.length);
for (const file of manifest.files) await readFile('dist/' + file.replace(/^\.\//, ''));
assert.ok(manifest.files.some((file) => file.includes('worker-')));
const child = spawn(process.execPath, ['scripts/serve.mjs'], { env: { ...process.env, PAIBAN_PORT: '0' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
try {
  const port = await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error('Preview did not start')), 10000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => { clearTimeout(timeout); if (code) reject(new Error('Preview failed to start')); });
    child.stdout.on('data', (chunk) => {
      output += chunk.toString(); const match = output.match(/http:\/\/localhost:(\d+)\//);
      if (match) { clearTimeout(timeout); resolve(Number(match[1])); }
    });
  });
  const base = `http://localhost:${port}`;
  for (const file of ['/', ...manifest.files.map((file) => '/' + file.replace(/^\.\//, ''))]) {
    const response = await fetch(base + file);
    assert.equal(response.status, 200, file);
    assert.ok((await response.arrayBuffer()).byteLength > 0, file);
    if (file.endsWith('.js')) assert.match(response.headers.get('content-type'), /javascript/);
  }
  assert.equal((await fetch(base + '/%2e%2e%2fpackage.json')).status, 403);
  assert.equal((await fetch(base + '/missing-file')).status, 404);
  console.log(`Release verified: ${manifest.files.length} current files; preview HTTP, MIME, cache manifest and path boundaries passed.`);
} finally { child.kill(); }
