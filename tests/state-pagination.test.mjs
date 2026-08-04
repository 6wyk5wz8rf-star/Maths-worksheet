import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ActionTypes,
  WORKSHEET_SCHEMA,
  WORKSHEET_VERSION,
  createModelRecipe,
  createQuestionBlock,
  createStore,
  createWorksheet,
  deleteProject,
  duplicateProject,
  getCurrentProjectId,
  listProjects,
  loadCurrentProject,
  loadProject,
  migrateWorksheet,
  saveProject,
  worksheetActions,
  worksheetReducer,
} from '../js/state.js';
import {
  A4_LANDSCAPE,
  A4_PORTRAIT,
  estimateWrappedLines,
  getPageGeometry,
  mmToPx,
  pageCssVariables,
  paginateWorksheet,
  placementStyle,
  pxToMm,
} from '../js/pagination.js';
import { matchQuestionToModels } from '../js/matcher.js';

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(String(key), String(value));
  }

  removeItem(key) {
    this.values.delete(String(key));
  }

  clear() {
    this.values.clear();
  }
}

const NOW = '2026-08-04T12:00:00.000Z';
const later = (minute) => `2026-08-04T12:${String(minute).padStart(2, '0')}:00.000Z`;

function question(id, text, overrides = {}) {
  return createQuestionBlock({
    id,
    originalText: text,
    displayText: text,
    response: { type: 'open-box', size: 'standard' },
    ...overrides,
  });
}

function worksheetWith(blocks, overrides = {}) {
  return createWorksheet({
    metadata: { id: 'worksheet_one', name: 'Test sheet', title: 'Test sheet', createdAt: NOW, updatedAt: NOW },
    originalImport: { rawText: blocks.map((block) => block.originalText).join('\n'), importedAt: NOW },
    blocks,
    ...overrides,
  }, { now: () => NOW });
}

test('worksheet schema preserves the complete original import and normalises nested recipes', () => {
  const rawText = '1. What is the value of 4 in 3,482?\n2. Explain your reasoning.';
  const worksheet = createWorksheet({
    metadata: { id: 'sheet_schema', title: 'Place value', createdAt: NOW, updatedAt: NOW },
    intent: 'homework',
    originalImport: { rawText, source: 'maths-web', importedAt: NOW },
    blocks: [
      {
        id: 'q1',
        text: 'What is the value of 4 in 3,482?',
        modelRecipe: {
          family: 'place-value-chart',
          values: { number: 3482 },
          state: 'partly-completed',
          purpose: 'response-model',
        },
        responseRecipe: { type: 'model-completion', size: 'standard' },
      },
    ],
  }, { now: () => NOW });

  assert.equal(worksheet.schema, WORKSHEET_SCHEMA);
  assert.equal(worksheet.version, WORKSHEET_VERSION);
  assert.equal(worksheet.originalImport.rawText, rawText);
  assert.equal(worksheet.blocks[0].displayText, worksheet.blocks[0].originalText);
  assert.equal(worksheet.blocks[0].model.family, 'place-value');
  assert.equal(worksheet.blocks[0].model.completionState, 'partly-completed');
  assert.equal(worksheet.blocks[0].number, 1);
});

test('parser-shaped cards and matcher-shaped recipes normalise to the shared registry contract', () => {
  const worksheet = createWorksheet({
    metadata: { id: 'adapter', createdAt: NOW, updatedAt: NOW },
    blocks: [
      {
        id: 'section-1',
        type: 'section-heading',
        originalText: 'Place value',
        displayText: 'Place value',
        sourceRange: { start: 0, end: 11 },
      },
      {
        id: 'q-1',
        type: 'question',
        originalText: '1. What is the value of 4 in 3,482?',
        displayText: 'What is the value of 4 in 3,482?',
        questionNumber: 1,
        sectionId: 'section-1',
        mathInfo: { numericValues: [4, 3482], likelyDomains: [{ domain: 'place-value', score: 5 }] },
        model: {
          family: 'place-value',
          values: { number: 3482 },
          units: ['counters'],
          completionState: 'partly-completed',
          lockState: 'mathematical-structure-locked',
        },
      },
    ],
  }, { now: () => NOW });

  assert.equal(worksheet.blocks[0].kind, 'heading');
  assert.equal(worksheet.blocks[0].number, null);
  assert.deepEqual(worksheet.blocks[0].source.range, { start: 0, end: 11 });
  assert.equal(worksheet.blocks[1].kind, 'question');
  assert.equal(worksheet.blocks[1].section, 'section-1');
  assert.deepEqual(worksheet.blocks[1].extracted.numericValues, [4, 3482]);
  assert.equal(worksheet.blocks[1].model.family, 'place-value');
  assert.equal(worksheet.blocks[1].model.completionState, 'partly-completed');
  assert.equal(worksheet.blocks[1].model.unit, 'counters');
});

test('mixed edits keep a question-model-response block intact and undo/redo in exact order', () => {
  const rawText = 'Question A\nQuestion B';
  const initial = worksheetWith([
    question('a', 'Question A', {
      model: createModelRecipe('number-line', { values: { start: 0, end: 100 } }),
      response: { type: 'short-line', size: 'compact' },
    }),
    question('b', 'Question B'),
  ], { originalImport: { rawText, importedAt: NOW } });
  const times = [later(1), later(2), later(3), later(4), later(5)];
  const store = createStore(initial, { autosave: false, now: () => times.shift() ?? later(9) });

  store.dispatch(worksheetActions.reorderBlock('a', 1));
  assert.deepEqual(store.getState().blocks.map((block) => block.id), ['b', 'a']);
  assert.equal(store.getState().blocks[1].model.family, 'number-line');
  assert.equal(store.getState().blocks[1].response.type, 'short-line');

  store.dispatch(worksheetActions.duplicateBlock('a', 'a_copy'));
  store.dispatch(worksheetActions.removeBlock('b'));
  assert.deepEqual(store.getState().blocks.map((block) => block.id), ['a', 'a_copy']);
  assert.deepEqual(store.getState().blocks.map((block) => block.number), [1, 2]);
  assert.equal(store.getState().originalImport.rawText, rawText);

  assert.equal(store.undo(), true);
  assert.deepEqual(store.getState().blocks.map((block) => block.id), ['b', 'a', 'a_copy']);
  assert.equal(store.undo(), true);
  assert.deepEqual(store.getState().blocks.map((block) => block.id), ['b', 'a']);
  assert.equal(store.undo(), true);
  assert.deepEqual(store.getState().blocks.map((block) => block.id), ['a', 'b']);
  assert.equal(store.canUndo(), false);

  assert.equal(store.redo(), true);
  assert.equal(store.redo(), true);
  assert.equal(store.redo(), true);
  assert.deepEqual(store.getState().blocks.map((block) => block.id), ['a', 'a_copy']);
  assert.equal(store.getState().originalImport.rawText, rawText);
});

test('split, join, settings, output view and manual breaks are pure reducer actions', () => {
  let state = worksheetWith([question('combined', 'First question. Second question.')]);
  state = worksheetReducer(state, {
    ...worksheetActions.splitBlock('combined', ['First question.', 'Second question.'], ['second']),
    timestamp: later(1),
  });
  assert.deepEqual(state.blocks.map((block) => block.id), ['combined', 'second']);
  assert.deepEqual(state.blocks.map((block) => block.displayText), ['First question.', 'Second question.']);

  state = worksheetReducer(state, { ...worksheetActions.setManualBreak('second', true), timestamp: later(2) });
  assert.deepEqual(state.pageArrangement.manualBreakBefore, ['second']);
  assert.equal(state.blocks[1].layout.manualBreakBefore, true);

  state = worksheetReducer(state, { ...worksheetActions.joinBlock('second', 'previous'), timestamp: later(3) });
  assert.equal(state.blocks.length, 1);
  assert.equal(state.blocks[0].displayText, 'First question.\nSecond question.');
  assert.deepEqual(state.pageArrangement.manualBreakBefore, []);

  state = worksheetReducer(state, { ...worksheetActions.updateSettings({ columns: 2, questionNumbering: false }), timestamp: later(4) });
  state = worksheetReducer(state, { ...worksheetActions.setOutputView('teacher'), timestamp: later(5) });
  assert.equal(state.settings.columns, 2);
  assert.equal(state.blocks[0].number, null);
  assert.equal(state.outputView, 'teacher');
});

test('assessment state adds a calm answer-reveal warning and removes it when risk is removed', () => {
  let state = worksheetWith([question('assessment_q', 'Complete 4,205 + 376.')], { intent: 'assessment' });
  state = worksheetReducer(state, {
    ...worksheetActions.setModel('assessment_q', createModelRecipe('column-addition', {
      completionState: 'completed',
      purpose: 'worked-example',
    })),
    timestamp: later(1),
  });
  assert.ok(state.blocks[0].warnings.some((warning) => warning.code === 'assessment-answer-reveal'));

  state = worksheetReducer(state, {
    ...worksheetActions.updateModel('assessment_q', { completionState: 'blank', purpose: 'response-model', answerRevealRisk: false }),
    timestamp: later(2),
  });
  assert.ok(!state.blocks[0].warnings.some((warning) => warning.code === 'assessment-answer-reveal'));
});

test('named project persistence can save, reopen, duplicate and delete without browser globals', () => {
  const storage = new MemoryStorage();
  const source = worksheetWith([
    question('persist_a', 'A'),
    question('persist_b', 'B'),
  ]);
  const withBreak = worksheetReducer(source, {
    ...worksheetActions.setManualBreak('persist_b'),
    timestamp: later(1),
  });

  assert.equal(saveProject(withBreak, storage), true);
  assert.equal(getCurrentProjectId(storage), 'worksheet_one');
  assert.equal(listProjects(storage).length, 1);
  assert.deepEqual(loadProject('worksheet_one', storage).blocks.map((block) => block.id), ['persist_a', 'persist_b']);
  assert.equal(loadCurrentProject(storage).originalImport.rawText, 'A\nB');

  let counter = 0;
  const duplicate = duplicateProject(withBreak, {
    name: 'Test sheet copy',
    now: () => later(2),
    idFactory: (prefix) => `${prefix}_copy_${counter += 1}`,
  }, storage);
  assert.notEqual(duplicate.metadata.id, withBreak.metadata.id);
  assert.equal(duplicate.metadata.name, 'Test sheet copy');
  assert.equal(new Set(duplicate.blocks.map((block) => block.id)).size, 2);
  assert.ok(duplicate.pageArrangement.manualBreakBefore.includes(duplicate.blocks[1].id));
  assert.equal(listProjects(storage).length, 2);

  assert.equal(deleteProject('worksheet_one', storage), true);
  assert.equal(loadProject('worksheet_one', storage), null);
  assert.equal(listProjects(storage).length, 1);
});

test('store autosaves each committed edit and reopens the edited worksheet', () => {
  const storage = new MemoryStorage();
  const initial = worksheetWith([question('autosave_q', 'Original wording')]);
  const store = createStore(initial, { storage, autosave: true, now: () => later(1) });
  store.dispatch(worksheetActions.updateBlock('autosave_q', { displayText: 'Teacher-edited wording' }));
  const reopened = loadCurrentProject(storage);
  assert.equal(reopened.blocks[0].displayText, 'Teacher-edited wording');
  assert.equal(reopened.blocks[0].originalText, 'Original wording');
  assert.equal(reopened.originalImport.rawText, 'Original wording');
});

test('version-zero persisted shapes migrate without losing raw text or question order', () => {
  const migrated = migrateWorksheet({
    version: 0,
    id: 'legacy',
    rawText: 'Legacy A\nLegacy B',
    globalSettings: { columns: 2 },
    questionBlocks: [
      { id: 'legacy_a', text: 'Legacy A' },
      { id: 'legacy_b', text: 'Legacy B' },
    ],
  }, { now: () => NOW });
  assert.equal(migrated.version, WORKSHEET_VERSION);
  assert.equal(migrated.migration.migratedFrom, 0);
  assert.equal(migrated.originalImport.rawText, 'Legacy A\nLegacy B');
  assert.deepEqual(migrated.blocks.map((block) => block.id), ['legacy_a', 'legacy_b']);
  assert.equal(migrated.settings.columns, 2);
});

test('unknown actions are strict no-ops', () => {
  const state = worksheetWith([question('noop', 'No-op')]);
  assert.equal(worksheetReducer(state, { type: 'unknown/action' }), state);
  assert.equal(ActionTypes.REMOVE_BLOCK, 'worksheet/remove-block');
});

test('A4 geometry and unit helpers are exact enough to share between preview and print', () => {
  const geometry = getPageGeometry({ marginMm: 12, columns: 2 });
  assert.equal(geometry.page.widthMm, A4_PORTRAIT.widthMm);
  assert.equal(geometry.page.heightMm, 297);
  assert.equal(geometry.contentWidthMm, 186);
  assert.equal(geometry.columns, 2);
  assert.ok(Math.abs(pxToMm(mmToPx(210)) - 210) < 1e-9);
  assert.equal(pageCssVariables(geometry)['--mps-page-width'], '210mm');
  assert.ok(estimateWrappedLines('A deliberately long sentence that wraps.', 20) > 1);
});

test('pagination keeps every question-model-response block indivisible across multiple pages', () => {
  const blocks = Array.from({ length: 9 }, (_, index) => question(
    `page_q_${index + 1}`,
    `${index + 1}. Explain how you know this calculation is correct and show your working.`,
    {
      model: createModelRecipe(index % 2 ? 'number-line' : 'part-whole-bar', { size: 'standard' }),
      response: { type: 'open-box', size: 'generous' },
    },
  ));
  const result = paginateWorksheet(worksheetWith(blocks));
  assert.ok(result.pageCount >= 3);
  assert.equal(Object.keys(result.placements).length, blocks.length);
  for (const block of blocks) {
    const placement = result.placements[block.id];
    assert.equal(placement.indivisible, true);
    assert.equal(placement.measurement.indivisible, true);
    assert.ok(placement.heightMm > placement.measurement.breakdown.questionMm);
    assert.equal(result.pages[placement.page - 1].items.filter((item) => item.blockId === block.id).length, 1);
    assert.ok(placement.yMm + placement.heightMm <= result.pages[placement.page - 1].bodyBottomMm + 0.02);
  }
});

test('manual page breaks are honoured without generating an empty leading page', () => {
  let worksheet = worksheetWith([
    question('break_a', 'First question'),
    question('break_b', 'Second question'),
    question('break_c', 'Third question'),
  ]);
  worksheet = worksheetReducer(worksheet, {
    ...worksheetActions.setManualBreak('break_b', true),
    timestamp: later(1),
  });
  const result = paginateWorksheet(worksheet);
  assert.equal(result.placements.break_a.page, 1);
  assert.equal(result.placements.break_b.page, 2);
  assert.equal(result.placements.break_c.page, 2);

  worksheet = worksheetReducer(worksheet, {
    ...worksheetActions.setManualBreak('break_a', true),
    timestamp: later(2),
  });
  const firstBreak = paginateWorksheet(worksheet);
  assert.equal(firstBreak.placements.break_a.page, 1);
  assert.equal(firstBreak.pages[0].items.length, 1);
});

test('pagination warns rather than splitting an oversized block', () => {
  const hugeText = Array.from({ length: 260 }, () => 'mathematical reasoning').join(' ');
  const block = question('oversized', hugeText, { response: { type: 'open-box', size: 'generous' } });
  const result = paginateWorksheet(worksheetWith([block]));
  assert.equal(result.pageCount, 1, 'a block too tall for any page remains intact and is flagged in place');
  assert.equal(result.placements.oversized.indivisible, true);
  assert.ok(result.placements.oversized.overflowMm > 0);
  assert.equal(result.hasOverflow, true);
  assert.ok(result.warnings.some((warning) => warning.code === 'block-overcrowded'));
});

test('two-column beside-model layouts flag illegible model widths and expose placement styles', () => {
  const block = question('small_model', 'Represent 3,482 in the place-value chart.', {
    model: createModelRecipe('place-value-chart', { position: 'beside', size: 'compact' }),
    response: { type: 'none', size: 'compact' },
  });
  const worksheet = worksheetWith([block], { settings: { columns: 2, marginMm: 12 } });
  const result = paginateWorksheet(worksheet);
  assert.deepEqual(result.tooSmallModelBlockIds, ['small_model']);
  assert.ok(result.blocksWithoutResponseSpace.includes('small_model'));
  const style = placementStyle(result.placements.small_model);
  assert.equal(style.breakInside, 'avoid');
  assert.match(style.left, /mm$/);
  assert.match(style.height, /mm$/);
});

test('pupil and teacher pagination can differ without mutating the worksheet', () => {
  const block = question('views', 'Calculate 4,205 − 786.', {
    model: createModelRecipe('column-subtraction', { completionState: 'blank' }),
    teacher: {
      answer: '3,419',
      notes: 'Check that the pupil exchanged across the tens column.',
      completedModel: createModelRecipe('column-subtraction', { completionState: 'completed', size: 'large' }),
    },
  });
  const worksheet = worksheetWith([block]);
  const pupil = paginateWorksheet(worksheet, { outputView: 'pupil' });
  const teacher = paginateWorksheet(worksheet, { outputView: 'teacher' });
  assert.ok(teacher.placements.views.heightMm > pupil.placements.views.heightMm);
  assert.equal(worksheet.outputView, 'pupil');
  assert.equal(worksheet.blocks[0].model.completionState, 'blank');
});

test('Build 2 preserves landscape A4 settings and uses genuine landscape geometry', () => {
  const worksheet = worksheetWith([question('landscape', 'Explain your method.')], {
    settings: { orientation: 'landscape', columns: 2, marginMm: 12 },
  });
  const geometry = getPageGeometry(worksheet);
  assert.equal(worksheet.settings.orientation, 'landscape');
  assert.equal(geometry.page, A4_LANDSCAPE);
  assert.equal(geometry.page.widthMm, 297);
  assert.equal(geometry.page.heightMm, 210);
  assert.ok(geometry.contentWidthMm > A4_PORTRAIT.widthMm - 24);
});

test('unconfigured Build 2 print dimensions use their safe registry metrics rather than an 8 mm fallback', () => {
  const match = matchQuestionToModels('Round 3,462 to the nearest hundred.', { intent: 'practice' });
  const block = question('rounding-safe', 'Round 3,462 to the nearest hundred.', {
    model: match.provisionalRecipe,
    response: { type: 'short-answer', size: 'standard' },
  });
  const worksheet = worksheetWith([block], { settings: { orientation: 'landscape', columns: 1, marginMm: 12 } });
  const result = paginateWorksheet(worksheet);

  assert.equal(block.model.printHeightMm, null);
  assert.equal(block.model.printMinWidthMm, null);
  assert.ok(result.placements['rounding-safe'].measurement.breakdown.modelMm >= 24);
  assert.deepEqual(result.tooSmallModelBlockIds, []);

  const migratedZeroDimensions = createQuestionBlock({
    id: 'legacy-zero-dimensions', text: 'Round 3,462 to the nearest hundred.',
    model: { ...match.provisionalRecipe, printHeightMm: 0, printMinWidthMm: 0 },
  });
  assert.equal(migratedZeroDimensions.model.printHeightMm, null);
  assert.equal(migratedZeroDimensions.model.printMinWidthMm, null);
});

test('Build 2 project index retains a Build 1 project when first saving an upgraded worksheet', () => {
  const storage = new MemoryStorage();
  storage.setItem('maths-page-studio:projects:v1', JSON.stringify([{ id: 'build1-sheet', name: 'Build 1 sheet', updatedAt: NOW }]));
  storage.setItem('maths-page-studio:project:build1-sheet', JSON.stringify({
    version: 1,
    metadata: { id: 'build1-sheet', name: 'Build 1 sheet', title: 'Build 1 sheet', createdAt: NOW, updatedAt: NOW },
    originalImport: { rawText: '1. Calculate 2 + 2.' },
    blocks: [],
  }));
  const build2 = worksheetWith([question('new-question', 'Calculate 3 + 4.')], {
    metadata: { id: 'build2-sheet', name: 'Build 2 sheet', title: 'Build 2 sheet', createdAt: NOW, updatedAt: later(1) },
  });
  assert.equal(saveProject(build2, storage), true);
  assert.deepEqual(listProjects(storage).map((item) => item.id).sort(), ['build1-sheet', 'build2-sheet']);
  assert.equal(loadProject('build1-sheet', storage).version, WORKSHEET_VERSION);
});
