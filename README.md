# Maths Page Studio

Maths Page Studio turns copied mathematical questions into accurate, editable and printable A4 pupil worksheets. Build 1 establishes one complete journey: **Paste → Check → Make → Print**.

## Run locally

The application is static and has no runtime dependencies.

```bash
npm run serve
```

Open `http://localhost:4173`. Core functionality works offline after the first successful load. Worksheet projects remain on the current device through local browser storage.

## Test

```bash
npm test
```

The test suite covers parsing, mathematical matching, model integrity, state history, persistence structures and A4 pagination.

## Structure

- `index.html` — semantic application shell and dialogs
- `css/styles.css` — responsive editor, A4 worksheet and dedicated print styles
- `js/app.js` — four-stage interface and interaction orchestration
- `js/parser.js` — lossless question import and mathematical extraction
- `js/matcher.js` — deterministic local model matching
- `js/model-registry.js` — declarations for the ten Build 1 model families
- `js/model-renderers.js` — safe structured SVG/HTML renderers
- `js/state.js` — worksheet schema, undo/redo and local project persistence
- `js/pagination.js` — fixed A4 geometry and whole-block pagination
- `service-worker.js` — offline application shell
- `tests/` — internal Build 1 verification set

## GitHub Pages

Everything uses relative URLs and standard browser APIs. Publish the repository root from the `main` branch with GitHub Pages; no build step or server is required.

## Privacy

Questions, titles and project data stay in the browser. Maths Page Studio makes no external requests and has no accounts, analytics or cloud database.
