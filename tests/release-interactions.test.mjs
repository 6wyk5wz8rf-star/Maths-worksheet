import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { reorderInsertionIndex } from '../js/state.js';

test('touch reordering uses the final index after removing the dragged block', () => {
  assert.equal(reorderInsertionIndex(1, 2, true), 2, 'drag B after C');
  assert.equal(reorderInsertionIndex(1, 3, false), 2, 'drag B before D');
  assert.equal(reorderInsertionIndex(3, 1, true), 2, 'drag D after B');
  assert.equal(reorderInsertionIndex(3, 1, false), 1, 'drag D before B');
});

test('touch reordering rejects unresolved source or target indices', () => {
  assert.equal(reorderInsertionIndex(-1, 2, true), -1);
  assert.equal(reorderInsertionIndex(2, -1, false), -1);
});

test('destructive project actions are gated by a successful persistence flush', async () => {
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const loadProject = app.slice(app.indexOf("action === 'load-project'"), app.indexOf("action === 'duplicate-project'"));
  const newProjectStart = app.lastIndexOf("document.querySelector('#new-project-button')");
  const newProject = app.slice(newProjectStart, app.indexOf("document.querySelector('#undo-button')", newProjectStart));
  assert.match(loadProject, /flushBeforeDestructiveAction\('open another worksheet'\)/);
  assert.match(newProject, /flushBeforeDestructiveAction\('start a new worksheet'\)/);
  assert.match(app, /window\.addEventListener\('pagehide',[\s\S]*store\.flush\(\)/);
  assert.match(app, /document\.addEventListener\('visibilitychange',[\s\S]*document\.visibilityState === 'hidden'/);
});

test('editing stays pupil-safe and answer print cannot silently certify missing answers', async () => {
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(app, /paginateWorksheet\(worksheet, \{ outputView: 'pupil' \}\)/);
  assert.match(app, /renderPageStack\(worksheet, 'pupil', 'editor', pagination\)/);
  assert.match(app, /no stored answer or completed teacher model/);
  assert.match(app, /auditRenderedPageGeometry\(context\)/);
  assert.match(app, /block-collision/);
  assert.match(app, /pendingTeacherFieldSave\?\.details\?\.key/, 'unrelated print settings cannot dereference an absent teacher edit');
  const closePanel = app.slice(app.indexOf('function closeMobilePanels'), app.indexOf('function goStage'));
  assert.match(closePanel, /persistPendingTeacherField\(\)/, 'closing a drawer commits its pending teacher-only field before selection is cleared');
});
