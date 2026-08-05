import { defineConfig } from 'vite';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

function copyOfflineRuntime() {
  return {
    name: 'copy-offline-runtime',
    async writeBundle(options, bundle) {
      const outputDirectory = options.dir ?? 'dist';
      await mkdir(`${outputDirectory}/assets`, { recursive: true });
      await Promise.all([
        copyFile('manifest.webmanifest', `${outputDirectory}/manifest.webmanifest`),
        copyFile('assets/icon.svg', `${outputDirectory}/assets/icon.svg`),
      ]);
      const builtAssets = Object.values(bundle)
        .map((item) => item.fileName)
        .filter((fileName) => /\.(?:css|js|svg|webmanifest)$/.test(fileName))
        .map((fileName) => `./${fileName}`);
      const shell = ['./', './index.html', './manifest.webmanifest', './assets/icon.svg', ...builtAssets];
      const worker = await readFile('service-worker.js', 'utf8');
      const productionWorker = worker.replace(
        /const SHELL = \[[\s\S]*?\n\];/,
        `const SHELL = [\n${[...new Set(shell)].map((item) => `  '${item}'`).join(',\n')}\n];`,
      );
      await writeFile(`${outputDirectory}/service-worker.js`, productionWorker);
    },
  };
}

export default defineConfig({
  // GitHub Pages serves this product from a project subpath. Relative bundle
  // URLs keep the production build portable there and in local previews.
  base: './',
  plugins: [copyOfflineRuntime()],
  server: {
    host: '0.0.0.0',
    allowedHosts: ['terminal.local'],
  },
});
