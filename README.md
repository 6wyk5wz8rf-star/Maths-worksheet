# Maths Page Studio

Maths Page Studio turns copied mathematical questions into accurate, editable and printable A4 pupil worksheets. Build 2 deepens the same complete journey: **Paste → Check → Make → Print**, adding local question interpretation, model recommendations and an expanded Year 4 model bank.

## Run locally

The application is static and has no runtime dependencies.

```bash
npm run serve
```

Open `http://localhost:4173`. Core functionality works offline after the first successful load. Worksheet projects remain on the current device through local browser storage.

The application is served from the repository root. Keep production asset paths relative (`./…`) so the same files work locally and at the GitHub Pages project path.

## Test

```bash
npm test
```

The test suite covers parsing, question interpretation and recommendation rules, model integrity, state history, persistence structures, A4 pagination and Build 2 GitHub Pages/offline-shell checks.

Run the test suite before publishing Build 2. The deployment test verifies that every statically imported local module is pre-cached and that the HTML, manifest and worker retain project-relative paths.

## Structure

- `index.html` — semantic application shell and dialogs
- `css/styles.css` — responsive editor, A4 worksheet and dedicated print styles
- `js/app.js` — four-stage interface and interaction orchestration
- `js/parser.js` — lossless question import and mathematical extraction
- `js/matcher.js` — deterministic local model matching
- `js/model-registry.js` — central declarations for the expandable mathematical model bank
- `js/model-renderers.js` — safe structured SVG/HTML renderers
- `js/state.js` — worksheet schema, undo/redo and local project persistence
- `js/pagination.js` — fixed A4 geometry and whole-block pagination
- `service-worker.js` — offline application shell
- `tests/` — deterministic Build 1 and Build 2 verification sets

## GitHub Pages and offline releases

Everything uses relative URLs and standard browser APIs. Publish the repository root from the `main` branch with GitHub Pages; no build step or server is required.

The deployed project path is:

`https://6wyk5wz8rf-star.github.io/Maths-worksheet/`

Use the trailing slash: GitHub Pages redirects the slashless path to it. The service worker pre-caches the application shell and uses a Build 2 cache namespace, so a new online visit refreshes the installed offline shell after deployment. Bump that namespace whenever a release changes the shell or adds a local module.

## Privacy

Questions, titles and project data stay in the browser. Maths Page Studio makes no external requests and has no accounts, analytics or cloud database.
