import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = path.resolve('dist');
async function filesIn(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory()
    ? filesIn(path.join(dir, entry.name)) : path.join(dir, entry.name)))).flat();
}
const allFiles = (await filesIn(root)).filter((file) => !file.endsWith('sw.js') && !file.endsWith('build-files.json'));
// Keep old generated chunks on disk if another preview still references them,
// but only precache chunks reachable from this build's HTML/JS/CSS.
const assets = allFiles.filter((file) => file.startsWith(path.join(root, 'assets') + path.sep));
const included = new Set(allFiles.filter((file) => !assets.includes(file)));
const queue = [...included];
while (queue.length) {
  const file = queue.shift();
  if (!['.html', '.js', '.css', '.json', '.webmanifest'].includes(path.extname(file))) continue;
  const source = await readFile(file, 'utf8');
  for (const asset of assets) if (!included.has(asset) && source.includes(path.basename(asset))) { included.add(asset); queue.push(asset); }
}
const files = [...included];
const hash = createHash('sha256');
for (const file of files.sort()) hash.update(await readFile(file));
const cache = `paiban-${hash.digest('hex').slice(0, 12)}`;
const urls = ['./', ...files.map((file) => './' + path.relative(root, file).replaceAll('\\', '/'))];
await writeFile(path.join(root, 'build-files.json'), JSON.stringify({ cache, files: [...urls.slice(1), './sw.js'] }, null, 2));
await writeFile(path.join(root, 'sw.js'), `
const CACHE = ${JSON.stringify(cache)};
const FILES = ${JSON.stringify(urls)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('paiban-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(event.request);
    if (cached) return cached;
    try { return await fetch(event.request); }
    catch (error) {
      if (event.request.mode === 'navigate') return cache.match('./index.html');
      throw error;
    }
  }));
});
`);
console.log(`Offline cache generated: ${files.length} files (${cache}).`);
