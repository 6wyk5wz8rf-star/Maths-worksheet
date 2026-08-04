import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('GitHub Pages shell uses only local relative production assets', async () => {
  const html = await source('index.html');
  const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(urls.length >= 4);
  assert.ok(urls.every((url) => url.startsWith('./') || url.startsWith('#')));
  await Promise.all(urls.filter((url) => url.startsWith('./')).map((url) => access(new URL(url.slice(2), root))));
});

test('the four quiet stages and one dominant paste action are present', async () => {
  const html = await source('index.html');
  for (const stage of ['paste', 'check', 'make', 'print']) assert.match(html, new RegExp(`data-stage-target="${stage}"`));
  const app = await source('js/app.js');
  assert.match(app, /Paste your questions/);
  assert.match(app, /Make my worksheet/);
  assert.match(app, /Ready to print/);
});

test('A4 preview and browser print share exact fixed geometry', async () => {
  const css = await source('css/styles.css');
  assert.match(css, /@page\s*\{\s*size:\s*A4 portrait;\s*margin:\s*0;/);
  assert.match(css, /width:\s*210mm/);
  assert.match(css, /height:\s*297mm/);
  assert.match(css, /page-break-inside:\s*avoid/);
  assert.match(css, /print-color-adjust:\s*exact/);
});

test('touch, reduced motion and iPad-width layouts have explicit support', async () => {
  const css = await source('css/styles.css');
  assert.match(css, /--tap:\s*44px/);
  assert.match(css, /@media \(max-width:\s*980px\)/);
  assert.match(css, /@media \(max-width:\s*760px\)/);
  assert.match(css, /prefers-reduced-motion/);
  const app = await source('js/app.js');
  assert.match(app, /data-action="move-block"/);
  assert.match(app, /data-action="attach-model"/);
});

test('offline shell contains every core module and uses network-first updates', async () => {
  const worker = await source('service-worker.js');
  for (const asset of ['parser.js', 'matcher.js', 'model-registry.js', 'model-renderers.js', 'state.js', 'pagination.js']) {
    assert.match(worker, new RegExp(asset.replace('.', '\\.')));
  }
  assert.ok(worker.indexOf('fetch(event.request)') < worker.indexOf('caches.match(event.request)'));
});

test('core product has no external runtime request or service dependency', async () => {
  const files = await Promise.all(['index.html', 'js/app.js', 'js/parser.js', 'js/matcher.js', 'js/model-registry.js', 'js/model-renderers.js', 'js/state.js', 'js/pagination.js'].map(source));
  const combined = files.join('\n');
  assert.doesNotMatch(combined, /https?:\/\/(?!www\.w3\.org\/2000\/svg)/);
  assert.doesNotMatch(combined, /fetch\s*\(/);
});
