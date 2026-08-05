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

test('the teacher gets one direct paste action instead of a clickable stage dashboard', async () => {
  const html = await source('index.html');
  assert.doesNotMatch(html, /data-stage-target=/);
  const app = await source('js/app.js');
  assert.match(app, /Paste your questions/);
  assert.match(app, /Create worksheet/);
  assert.match(app, /function renderMake\(/);
  assert.match(app, /function renderPrint\(/);
});

test('first-draft composition is one atomic structure and style command', async () => {
  const app = await source('js/app.js');
  assert.match(app, /worksheetActions\.replaceStructure\(structured\.blocks, structured\.architecture,\s*\{\s*stylePreset:\s*structured\.architecture\.stylePreset/);
  assert.doesNotMatch(app, /worksheetActions\.replaceBlocks\(structured\.blocks\)/);
  assert.doesNotMatch(app, /worksheetActions\.updateArchitecture\(structured\.architecture\)/);
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

test('release UI keeps worksheet controls contextual and tablet navigation reachable', async () => {
  const [css, app] = await Promise.all([
    source('css/styles.css'),
    source('js/app.js')
  ]);
  assert.match(css, /\.block-screen-tools\.screen-only\s*\{\s*display:\s*none;/);
  assert.match(css, /\.question-block\.is-selected \.block-screen-tools\.screen-only\s*\{\s*display:\s*grid;/);
  assert.match(css, /\.print-preview-panel \.block-screen-tools\.screen-only\s*\{\s*display:\s*none\s*!important;/);
  assert.match(css, /\.mobile-panel-tabs\s*\{\s*display:\s*none;/);
  assert.match(css, /\.mobile-navigator-sheet\s*\{[\s\S]*?display:\s*none;/);
  assert.match(css, /\.mobile-navigator-sheet\.is-open\s*\{\s*display:\s*block;/);
  assert.match(css, /\.make-layout\s*\{[\s\S]*?display:\s*block;/);
  assert.match(css, /\.inspector\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?display:\s*none;/);
  assert.match(css, /\.inspector\.is-open\s*\{\s*display:\s*block;/);

  const finalTabletStart = css.lastIndexOf('@media (max-width: 980px)');
  const bottomSheetStart = css.indexOf('@media (max-width: 820px)', finalTabletStart);
  const tabletCss = css.slice(finalTabletStart, bottomSheetStart);
  assert.match(tabletCss, /\.mobile-panel-tabs\s*\{\s*display:\s*none;/);
  assert.match(tabletCss, /\.make-toolbar\s*\{[\s\S]*?height:\s*60px;/);
  assert.match(tabletCss, /\.make-layout\s*\{[\s\S]*?display:\s*block;/);
  assert.doesNotMatch(css, /\.view-toggle\s*\{\s*display:\s*none;/);
  assert.doesNotMatch(css, /\.card-tools \.move-tool\s*\{\s*display:\s*none;/);
  assert.match(app, /data-action="set-sheet-format" data-value="workbook"/);
  assert.match(app, /Workbook cut-outs need \$\{pagination\.pageCount\} pages at a readable size\. Nothing has been shrunk\./);
  assert.match(app, /data-role="model-size-select"/);
  assert.match(app, /value="extra-large"/);
  assert.match(app, /function questionNeedsReview/);
  assert.match(app, /function readableQuestionFamily/);
});

test('automatic reanalysis fails closed and reopening workbook format preserves its edits', async () => {
  const app = await source('js/app.js');
  const safeBinding = app.slice(app.indexOf('function safeBoundRecipe'), app.indexOf('function reanalyseQuestionBlock'));
  assert.match(safeBinding, /match\.confidence === 'high'/);
  assert.match(safeBinding, /match\.interpretation\?\.status === 'resolved'/);
  assert.match(safeBinding, /match\.suggestions\.some\(\(suggestion\) => suggestion\.family === currentFamily && suggestion\.recipe\)/);

  const workbook = app.slice(app.indexOf('function createWorkbookCutoutVersion'), app.indexOf('function renderProjectList'));
  assert.match(workbook, /if \(existing\)[\s\S]*?reconcileWorkbookCutoutVariant\(master, existing\)/);
  assert.match(workbook, /reconciled !== existing[\s\S]*?updateVersion\(existing\.id, \{ overrides: reconciled\.overrides \}\)/);
  assert.match(workbook, /setActiveVersion\(existing\.id\)/);
  assert.match(app, /if \(isWorkbookSheet\(store\.getState\(\)\)\) return;/);
  const loadRefresh = app.slice(app.indexOf('function refreshAutomaticReadingsOnLoad'), app.indexOf('function buildFirstDraft'));
  assert.match(loadRefresh, /modelBindingMode\(block\.model\) === 'bound' && !teacherChoseModel/);
  assert.match(loadRefresh, /safeBoundRecipe\(match, worksheet\)/);
  assert.match(loadRefresh, /reconcileWorkbookCutoutVariant\(refreshedWorksheet, version\)/);
  assert.match(loadRefresh, /store\.replaceBaseline\(\{ \.\.\.refreshedWorksheet, versions \}\)/);
  assert.doesNotMatch(loadRefresh, /dispatchMaster\(/);
  const projectLoad = app.slice(app.indexOf("action === 'load-project'"), app.indexOf("action === 'duplicate-project'"));
  assert.match(projectLoad, /store\.load\(id\)[\s\S]*?refreshAutomaticReadingsOnLoad\(\)/);
  assert.match(app, /refreshAutomaticReadingsOnLoad\(\);\s*store\.subscribe/);
});

test('tablet sheets expose their state and move focus into and back from the active region', async () => {
  const app = await source('js/app.js');
  assert.match(app, /id="mobile-question-navigator" role="region" aria-labelledby="mobile-question-navigator-title" tabindex="-1"/);
  assert.match(app, /id="question-inspector"[\s\S]*?role="region" aria-labelledby="question-inspector-title" tabindex="-1"/);
  assert.match(app, /data-action="open-navigator" aria-controls="mobile-question-navigator" aria-expanded="\$\{ui\.navigatorOpen\}"/);
  assert.match(app, /ui\.selectedId = worksheetBlock\.dataset\.blockId;[\s\S]*?openMobilePanel\('inspector'\);/);
  assert.match(app, /function openMobilePanel\(panelName, returnSelector = null\)[\s\S]*?render\(\);[\s\S]*?focusAfterRender\(`#\$\{CSS\.escape\(config\.id\)\}`\);/);
  assert.match(app, /function closeMobilePanels\(\)[\s\S]*?render\(\);[\s\S]*?focusAfterRender\(returnSelector\);/);
  assert.match(app, /event\.key === 'Escape'[\s\S]*?closeMobilePanels\(\)/);
});

test('release accessibility exposes dialog names, focus and touch-sized controls', async () => {
  const [html, css] = await Promise.all([source('index.html'), source('css/styles.css')]);
  for (const id of ['confirm-title', 'project-dialog-title', 'settings-dialog-title', 'versions-dialog-title']) {
    assert.match(html, new RegExp(`aria-labelledby="${id}"`));
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /id="header-print-button" aria-label="Print worksheet"/);
  assert.match(css, /\.switch input:focus-visible \+ span\s*\{[^}]*outline:/);
  assert.match(css, /\.page-overview button\s*\{[^}]*min-width:\s*var\(--tap\);[^}]*min-height:\s*var\(--tap\);/);
  assert.match(css, /\.paste-area::placeholder\s*\{\s*color:\s*var\(--muted\);\s*opacity:\s*1;/);
});

test('editing keeps native undo, focus and save failure feedback', async () => {
  const app = await source('js/app.js');
  assert.match(app, /function captureInteraction\(/);
  assert.match(app, /function restoreInteraction\(/);
  assert.match(app, /target\.matches\('input, textarea, select, \[contenteditable="true"\]'\)/);
  assert.match(app, /if \(editable && \(key === 'z' \|\| key === 'y'\)\) return;/);
  assert.match(app, /getPersistenceStatus/);
  assert.match(app, /Saving…/);
  assert.match(app, /Not saved/);
  assert.doesNotMatch(app, /data-role="keep-together"/, 'The always-indivisible layout must not expose an inert switch.');
  assert.match(app, /footprintForPattern\(target\.value, block\)/, 'Choosing a block structure must update its real footprint.');

  const switches = [...app.matchAll(/<label class="switch"><input type="checkbox"([^>]*)>/g)];
  assert.ok(switches.length >= 4, 'Only meaningful switches should remain in the quiet interface.');
  assert.ok(switches.every((match) => /aria-label=/.test(match[1])), 'Every custom switch needs an accessible name.');
});

test('every print route synchronously commits the focused teacher field', async () => {
  const app = await source('js/app.js');
  assert.match(app, /let pendingTeacherFieldSave = null;/);
  assert.match(app, /function preparePrintState\(\)[\s\S]*?persistPendingTeacherField\(\);[\s\S]*?store\.flush\(\);/);
  assert.match(app, /function goStage\(stage\)\s*\{\s*if \(stage === 'print'\) preparePrintState\(\);/);
  assert.match(app, /action === 'print-now'\)[\s\S]*?preparePrintState\(\);[\s\S]*?window\.print\(\)/);
  const printShortcut = app.slice(app.indexOf("else if (key === 'p'"), app.indexOf("window.addEventListener('resize'"));
  assert.ok(printShortcut.indexOf('preparePrintState();') < printShortcut.indexOf("ui.stage = 'print';"), 'The print shortcut must commit the field before replacing Compose.');
  assert.match(app, /window\.addEventListener\('beforeprint',[\s\S]*?preparePrintState\(\);[\s\S]*?render\(\);/);
});

test('browser print can release the Compose workspace without app chrome or viewport clamps', async () => {
  const css = await source('css/styles.css');
  const printCss = css.slice(css.indexOf('@media print'));
  for (const selector of ['.question-navigator', '.inspector', '.mobile-navigator-sheet', '.mobile-panel-tabs']) {
    assert.ok(printCss.includes(selector), `${selector} must be hidden from direct browser printing.`);
  }
  for (const selector of ['.make-stage', '.make-layout', '.workspace-scroll']) {
    assert.ok(printCss.includes(selector), `${selector} must be unclamped for direct browser printing.`);
  }
  assert.match(printCss, /overflow:\s*visible\s*!important/);
  assert.match(printCss, /\.a4-shell:has\(\.worksheet-page\.orientation-landscape\)\s*\{\s*page:\s*mps-landscape;/);
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
