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

function withoutReleaseQuery(path) {
  return path.split(/[?#]/, 1)[0];
}

function cachePathForImport(sourcePath, specifier) {
  const queryIndex = specifier.search(/[?#]/);
  const suffix = queryIndex >= 0 ? specifier.slice(queryIndex) : '';
  const modulePath = queryIndex >= 0 ? specifier.slice(0, queryIndex) : specifier;
  const absoluteModulePath = resolve(dirname(resolve(rootDirectory, sourcePath)), modulePath);
  const projectRelativePath = relative(rootDirectory, absoluteModulePath).replaceAll('\\', '/');
  assert.ok(!projectRelativePath.startsWith('../'), `Local module ${specifier} must remain inside the project.`);
  return `./${projectRelativePath}${suffix}`;
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
      const absoluteModulePath = resolve(currentDirectory, withoutReleaseQuery(specifier));
      const projectRelativePath = relative(rootDirectory, absoluteModulePath).replaceAll('\\', '/');
      assert.ok(!projectRelativePath.startsWith('../'), `Local module ${specifier} must remain inside the project.`);
      pending.push(projectRelativePath);
    }
  }

  return visited;
}

test('release v4 uses a product-scoped cache namespace', async () => {
  const worker = await readProjectFile('service-worker.js');
  assert.match(worker, /const CACHE_PREFIX = 'maths-page-studio-';/);
  assert.match(worker, /const CACHE = `\$\{CACHE_PREFIX\}release-v4`;/);
  assert.match(worker, /await self\.skipWaiting\(\)/);
  assert.match(worker, /await self\.clients\.claim\(\)/);
  assert.match(worker, /key\.startsWith\(CACHE_PREFIX\) && key !== CACHE/);
  assert.doesNotMatch(worker, /filter\(\(key\) => key !== CACHE\)/, 'Activation must not delete unrelated origin caches.');
});

test('release v4 addresses the complete changed asset and module graph', async () => {
  const [html, app, state, worker] = await Promise.all([
    readProjectFile('index.html'),
    readProjectFile('js/app.js'),
    readProjectFile('js/state.js'),
    readProjectFile('service-worker.js'),
  ]);
  const release = 'release-v4';
  assert.match(html, new RegExp(`\\./css/styles\\.css\\?v=${release}`));
  assert.match(worker, new RegExp(`\\./css/styles\\.css\\?v=${release}`));
  assert.match(html, new RegExp(`\\./js/app\\.js\\?v=${release}`));
  assert.match(worker, new RegExp(`\\./js/app\\.js\\?v=${release}`));

  assert.match(app, new RegExp(`\\?v=${release}`), 'The release entry module must address its changed dependencies.');
  const cached = new Set(cacheEntries(worker));
  for (const [sourcePath, source] of [['js/app.js', app], ['js/state.js', state]]) {
    for (const specifier of localImportSpecifiers(source).filter((path) => /[?#]/.test(path))) {
      const cachePath = cachePathForImport(sourcePath, specifier);
      assert.ok(cached.has(cachePath), `${cachePath} must be pre-cached because ${sourcePath} imports it.`);
    }
  }
});

test('runtime cache writes are awaited and document fallback is navigation-only', async () => {
  const worker = await readProjectFile('service-worker.js');
  assert.match(worker, /await cache\.addAll\(SHELL\)/);
  assert.match(worker, /await cache\.put\(event\.request, response\.clone\(\)\)/);
  assert.match(worker, /if \(event\.request\.mode === 'navigate'\)/);
  assert.match(worker, /return Response\.error\(\)/);
  const navigationCheck = worker.indexOf("event.request.mode === 'navigate'");
  const documentFallback = worker.indexOf('caches.match(OFFLINE_DOCUMENT)');
  assert.ok(navigationCheck >= 0 && documentFallback > navigationCheck, 'The HTML fallback must be reached only inside navigation handling.');
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
    await access(resolve(rootDirectory, withoutReleaseQuery(path.slice(2))));
  }

  assert.match(app, /register\('\.\/service-worker\.js'\)/, 'The app must register the worker relative to the project path.');
  assert.equal(manifest.id, './');
});
