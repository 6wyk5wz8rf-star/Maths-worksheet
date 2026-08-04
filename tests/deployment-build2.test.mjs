import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = fileURLToPath(new URL('../', import.meta.url));

async function readProjectFile(path) {
  return readFile(resolve(rootDirectory, path), 'utf8');
}

function cacheEntries(workerSource) {
  const shell = workerSource.match(/const SHELL = \[([\s\S]*?)\];/);
  assert.ok(shell, 'The service worker needs one explicit SHELL cache list.');
  return [...shell[1].matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

function localImportSpecifiers(source) {
  const specifiers = new Set();
  const patterns = [
    /\bfrom\s+['"](\.[^'"]+)['"]/g,
    /\bimport\s*['"](\.[^'"]+)['"]/g,
    /\bimport\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.add(match[1]);
  }
  return [...specifiers];
}

async function moduleDependencyPaths(entryPath) {
  const pending = [entryPath];
  const visited = new Set();

  while (pending.length) {
    const currentPath = pending.pop();
    if (visited.has(currentPath)) continue;
    visited.add(currentPath);

    const source = await readProjectFile(currentPath);
    const currentDirectory = dirname(resolve(rootDirectory, currentPath));
    for (const specifier of localImportSpecifiers(source)) {
      const absoluteModulePath = resolve(currentDirectory, specifier);
      const projectRelativePath = relative(rootDirectory, absoluteModulePath).replaceAll('\\', '/');
      assert.ok(!projectRelativePath.startsWith('../'), `Local module ${specifier} must remain inside the project.`);
      pending.push(projectRelativePath);
    }
  }

  return visited;
}

test('Build 2 uses a fresh, explicit cache namespace', async () => {
  const worker = await readProjectFile('service-worker.js');
  assert.match(worker, /const CACHE = 'maths-page-studio-build-2-v\d+';/);
  assert.match(worker, /self\.skipWaiting\(\)/);
  assert.match(worker, /self\.clients\.claim\(\)/);
});

test('the offline shell pre-caches every statically imported local application module', async () => {
  const worker = await readProjectFile('service-worker.js');
  const cached = new Set(cacheEntries(worker));
  const modulePaths = await moduleDependencyPaths('js/app.js');

  for (const modulePath of modulePaths) {
    assert.ok(cached.has(`./${modulePath}`), `${modulePath} must be pre-cached for offline use.`);
  }
});

test('Pages shell, manifest and worker paths remain project-relative and resolve locally', async () => {
  const [html, app, worker, manifestSource] = await Promise.all([
    readProjectFile('index.html'),
    readProjectFile('js/app.js'),
    readProjectFile('service-worker.js'),
    readProjectFile('manifest.webmanifest'),
  ]);
  const manifest = JSON.parse(manifestSource);
  const assetPaths = [
    ...[...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map((match) => match[1]),
    ...cacheEntries(worker),
    manifest.id,
    manifest.start_url,
    manifest.scope,
    ...manifest.icons.map((icon) => icon.src),
  ];

  for (const path of assetPaths) {
    assert.ok(path.startsWith('./'), `${path} must be relative to the GitHub Pages project path.`);
    if (path === './') continue;
    await access(resolve(rootDirectory, path.slice(2)));
  }

  assert.match(app, /register\('\.\/service-worker\.js'\)/, 'The app must register the worker relative to the project path.');
  assert.equal(manifest.id, './');
});
