import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ActionTypes,
  PROJECT_INDEX_KEY,
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
import { resolveWorksheetVersion } from '../js/worksheet-versions.js';
import {
  A4_LANDSCAPE,
  A4_PORTRAIT,
  estimateWrappedLines,
  getPageGeometry,
  measureQuestionBlock,
  mmToPx,
  pageCssVariables,
  paginateWorksheet,
  placementStyle,
  pxToMm,
} from '../js/pagination.js';
import { matchQuestionToModels } from '../js/matcher.js';
import { createBuild2ModelRecipe } from '../js/build2-model-bank.js';

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

class FailableStorage extends MemoryStorage {
  constructor() {
    super();
    this.failAllWrites = false;
    this.failWriteKeys = new Set();
    this.failRemovals = false;
  }

  setItem(key, value) {
    if (this.failAllWrites || this.failWriteKeys.has(String(key))) throw new Error('Storage write failed.');
    super.setItem(key, value);
  }

  removeItem(key) {
    if (this.failRemovals) throw new Error('Storage removal failed.');
    super.removeItem(key);
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

test('replaceBaseline installs a migrated worksheet without retaining stale undo or redo snapshots', () => {
  const initial = worksheetWith([question('old_question', 'Old question')]);
  const store = createStore(initial, { autosave: false, storage: null, now: () => later(1) });
  const events = [];
  store.subscribe((_state, details) => events.push(details));

  store.dispatch(worksheetActions.updateBlock('old_question', { displayText: 'Edited old question' }));
  assert.equal(store.canUndo(), true);
  assert.equal(store.undo(), true);
  assert.equal(store.canRedo(), true, 'the stale edit exists before the baseline is replaced');

  const migrated = {
    version: 0,
    id: 'migrated_baseline',
    rawText: 'Fresh A\nFresh B',
    questionBlocks: [
      { id: 'fresh_a', text: 'Fresh A' },
      { id: 'fresh_b', text: 'Fresh B' },
    ],
  };
  assert.equal(store.replaceBaseline(migrated), true);
  assert.equal(store.getState().version, WORKSHEET_VERSION);
  assert.deepEqual(store.getState().blocks.map((block) => block.id), ['fresh_a', 'fresh_b']);
  assert.equal(store.canUndo(), false);
  assert.equal(store.canRedo(), false);
  assert.equal(store.undo(), false, 'Undo cannot resurrect the pre-migration worksheet');
  assert.equal(store.redo(), false, 'Redo cannot resurrect a discarded edit');
  assert.deepEqual(events.at(-1), {
    reason: 'replace-baseline',
    action: null,
    canUndo: false,
    canRedo: false,
    persistenceStatus: 'unavailable',
    persistenceOnly: false,
  });

  store.dispatch(worksheetActions.updateBlock('fresh_a', { displayText: 'Fresh edit' }));
  assert.equal(store.undo(), true);
  assert.equal(store.getState().blocks[0].displayText, 'Fresh A');
  assert.deepEqual(store.getState().blocks.map((block) => block.id), ['fresh_a', 'fresh_b']);
});

test('replaceBaseline validates before clearing the current worksheet or its history', () => {
  const store = createStore(
    worksheetWith([question('safe_question', 'Safe question')]),
    { autosave: false, storage: null, now: () => later(1) },
  );
  store.dispatch(worksheetActions.updateBlock('safe_question', { displayText: 'Current edit' }));
  const before = store.getState();

  assert.equal(store.replaceBaseline({
    schema: WORKSHEET_SCHEMA,
    version: WORKSHEET_VERSION,
    metadata: { id: 'invalid_replacement' },
    blocks: 'not-an-array',
  }), false);
  assert.equal(store.getState(), before);
  assert.equal(store.canUndo(), true, 'a rejected replacement leaves existing edit history intact');
  assert.equal(store.undo(), true);
  assert.equal(store.getState().blocks[0].displayText, 'Safe question');
});

test('replace structure updates blocks and architecture atomically and prunes stale page breaks', () => {
  const first = question('first', 'First question');
  const removed = question('removed', 'Question that will be removed');
  const initial = worksheetWith([first, removed], {
    pageArrangement: { manualBreakBefore: ['removed'] },
    settings: { density: 'compact', stylePreset: 'compact' },
    architecture: { stylePreset: 'compact' },
  });
  const store = createStore(initial, { autosave: false, storage: null, now: () => later(1) });
  const heading = createQuestionBlock({
    id: 'section_new',
    kind: 'heading',
    originalText: 'Reasoning',
    displayText: 'Reasoning',
    section: 'section_new',
    layout: { keepWithNext: true },
  });
  const retained = { ...first, section: 'section_new' };
  const architecture = {
    purpose: 'reasoning',
    compositionMode: 'flow',
    sections: [{ id: 'section_new', headingId: 'section_new', name: 'Reasoning', role: 'reasoning', layout: 'flow' }],
  };

  store.dispatch(worksheetActions.replaceStructure([heading, retained], architecture, { stylePreset: 'guided' }));
  assert.deepEqual(store.getState().blocks.map((block) => block.id), ['section_new', 'first']);
  assert.deepEqual(store.getState().architecture.sections.map((section) => section.id), ['section_new']);
  assert.deepEqual(store.getState().pageArrangement.manualBreakBefore, []);
  assert.equal(store.getState().purpose, 'reasoning');
  assert.equal(store.getState().architecture.stylePreset, 'guided');
  assert.equal(store.getState().settings.stylePreset, 'guided');
  assert.equal(store.getState().settings.density, 'spacious');

  assert.equal(store.undo(), true, 'one undo reverses the complete structure and style command');
  assert.deepEqual(store.getState().blocks.map((block) => block.id), ['first', 'removed']);
  assert.deepEqual(store.getState().pageArrangement.manualBreakBefore, ['removed']);
  assert.equal(store.getState().purpose, 'practice');
  assert.equal(store.getState().architecture.stylePreset, 'compact');
  assert.equal(store.getState().settings.stylePreset, 'compact');
  assert.equal(store.getState().settings.density, 'compact');
  assert.equal(store.canUndo(), false);
});

test('joining blocks preserves all teacher-only fields from both questions', () => {
  const first = question('teacher_a', 'First', {
    teacher: {
      answer: '12',
      notes: 'Use counters.',
      expectedMethod: 'Partition first.',
      misconception: 'Treats tens as ones.',
      markingNote: 'Award one mark for the method.',
    },
  });
  const second = question('teacher_b', 'Second', {
    teacher: {
      answer: '18',
      notes: 'Check the inverse.',
      expectedMethod: 'Recombine.',
      misconception: 'Forgets the exchange.',
      markingNote: 'Accept an equivalent method.',
    },
  });
  const joined = worksheetReducer(worksheetWith([first, second]), {
    ...worksheetActions.joinBlock('teacher_a', 'next'),
    timestamp: later(1),
  });

  assert.deepEqual(joined.blocks[0].teacher, {
    answer: '12\n18',
    notes: 'Use counters.\nCheck the inverse.',
    expectedMethod: 'Partition first.\nRecombine.',
    misconception: 'Treats tens as ones.\nForgets the exchange.',
    markingNote: 'Award one mark for the method.\nAccept an equivalent method.',
    completedModel: null,
  });
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
  assert.equal(getCurrentProjectId(storage), 'worksheet_one', 'creating a copy must not switch the worksheet reopened on refresh');

  assert.equal(deleteProject('worksheet_one', storage), true);
  assert.equal(loadProject('worksheet_one', storage), null);
  assert.equal(listProjects(storage).length, 1);
});

test('future and malformed saved projects fail closed without throwing or overwriting their payload', () => {
  const storage = new MemoryStorage();
  const futureKey = 'maths-page-studio:project:future_sheet';
  const futurePayload = JSON.stringify({
    schema: WORKSHEET_SCHEMA,
    version: WORKSHEET_VERSION + 1,
    metadata: { id: 'future_sheet' },
    blocks: [],
  });
  storage.setItem(futureKey, futurePayload);
  storage.setItem('maths-page-studio:project:malformed_sheet', '{not valid JSON');
  const invalidCurrentKey = 'maths-page-studio:project:invalid_current';
  const invalidCurrentPayload = JSON.stringify({
    schema: WORKSHEET_SCHEMA,
    version: WORKSHEET_VERSION,
    metadata: { id: 'invalid_current' },
    blocks: 'not-an-array',
  });
  storage.setItem(invalidCurrentKey, invalidCurrentPayload);

  assert.doesNotThrow(() => loadProject('future_sheet', storage));
  assert.equal(loadProject('future_sheet', storage), null);
  assert.equal(loadProject('malformed_sheet', storage), null);
  assert.equal(loadProject('invalid_current', storage), null);
  assert.equal(storage.getItem(futureKey), futurePayload, 'the newer payload remains available to a newer build');
  assert.equal(storage.getItem(invalidCurrentKey), invalidCurrentPayload, 'invalid current data is retained instead of becoming an empty worksheet');
  assert.equal(saveProject(JSON.parse(invalidCurrentPayload), storage), false);
  assert.equal(storage.getItem(invalidCurrentKey), invalidCurrentPayload, 'a failed recovery must not overwrite the source payload');
  assert.equal(saveProject({ version: WORKSHEET_VERSION + 1 }, storage), false);

  let recoveredStore;
  assert.doesNotThrow(() => {
    recoveredStore = createStore({ version: WORKSHEET_VERSION + 1 }, { storage: null, autosave: false, now: () => NOW });
  });
  assert.equal(recoveredStore.getState().version, WORKSHEET_VERSION);
  assert.equal(recoveredStore.getPersistenceStatus(), 'unavailable');
});

test('malformed master and version style data is normalised before rendering or pagination', () => {
  const master = createWorksheet({
    metadata: { id: 'defensive_settings', name: 'Defensive settings', title: 'Defensive settings' },
    settings: {
      accentColor: 'red;display:none',
      colorMode: 'neon',
      density: 'microscopic',
      typeface: 'script',
      questionNumbering: 'false',
      pageNumbers: 'true',
    },
    blocks: [question('defensive_q', 'Calculate 8 + 7.')],
  }, { now: () => NOW });

  assert.equal(master.settings.accentColor, '#4f568f');
  assert.equal(master.settings.colorMode, 'colour');
  assert.equal(master.settings.density, 'standard');
  assert.equal(master.settings.typeface, 'system');
  assert.equal(master.settings.questionNumbering, true);
  assert.equal(master.settings.pageNumbers, true);

  master.versions = {
    activeId: 'malformed_variant',
    items: [
      master.versions.items[0],
      {
        id: 'malformed_variant',
        name: 'Malformed variant',
        type: 'custom',
        baseId: 'master',
        createdAt: NOW,
        outputView: 'pupil',
        overrides: {
          settings: { accentColor: '#fff;clip:rect(0)', density: 'zero', orientation: 'sideways' },
          architecture: {
            compositionMode: 'canvas',
            sections: 'not-an-array',
            header: { layout: 'poster', fields: ['not', 'a', 'map'] },
            footer: { fields: { unexpected: true } },
            numbering: { mode: 'random', restartAtSections: 'yes' },
          },
          pageArrangement: { manualBreakBefore: 'defensive_q' },
          blockPatches: {
            defensive_q: {
              teacher: null,
              response: 'not-a-response',
              composition: { footprint: 'pixels' },
              layout: { columnSpan: 'floating' },
            },
          },
        },
      },
    ],
  };

  const resolved = resolveWorksheetVersion(master, 'malformed_variant');
  assert.equal(resolved.settings.accentColor, '#4f568f');
  assert.equal(resolved.settings.density, 'standard');
  assert.equal(resolved.settings.orientation, 'portrait');
  assert.equal(resolved.architecture.compositionMode, 'flow');
  assert.equal(resolved.architecture.header.layout, 'standard');
  assert.deepEqual(resolved.architecture.header.fields, {});
  assert.deepEqual(resolved.architecture.footer.fields, ['title', 'page-number']);
  assert.equal(resolved.architecture.footer.fields.includes('version-label'), false);
  assert.deepEqual(resolved.architecture.numbering, { mode: 'automatic', restartAtSections: false });
  assert.deepEqual(resolved.pageArrangement.manualBreakBefore, []);
  assert.equal(resolved.blocks[0].composition.footprint, 'standard');
  assert.equal(resolved.blocks[0].layout.columnSpan, 'auto');
  assert.equal(resolved.blocks[0].teacher.notes, '');
  assert.doesNotThrow(() => paginateWorksheet(resolved));
});

test('removing an active teacher or answer version returns the master to pupil output', () => {
  for (const type of ['teacher-model', 'answer']) {
    const versionId = `${type}_version`;
    let state = worksheetWith([question('version_output_q', 'Calculate 6 × 7.', {
      teacher: { answer: '42' },
    })]);
    state = worksheetReducer(state, {
      ...worksheetActions.createVersion({ id: versionId, type }),
      timestamp: later(1),
    }, { idFactory: (prefix) => `${prefix}_fallback` });
    assert.equal(state.versions.activeId, versionId);
    assert.equal(state.outputView, type === 'answer' ? 'answer' : 'teacher');

    state = worksheetReducer(state, {
      ...worksheetActions.removeVersion(versionId),
      timestamp: later(2),
    });
    assert.equal(state.versions.activeId, 'master');
    assert.equal(state.outputView, 'pupil');
    assert.equal(state.printSettings.selectedVersionId, 'master');
  }
});

test('persistence status reports successful, failed and unavailable autosave states', () => {
  const initial = worksheetWith([question('status_q', 'Original')]);
  const storage = new MemoryStorage();
  const store = createStore(initial, { storage, autosave: true, now: () => later(1) });
  const events = [];
  store.subscribe((_state, details) => events.push(details));

  store.dispatch(worksheetActions.updateBlock('status_q', { displayText: 'Saved edit' }));
  assert.equal(store.getPersistenceStatus(), 'saved');
  assert.deepEqual(events.filter((event) => event.persistenceOnly).map((event) => event.persistenceStatus), ['saving', 'saved']);
  assert.ok(events.find((event) => event.reason === 'dispatch' && event.persistenceOnly === false));

  const failingStorage = new FailableStorage();
  failingStorage.failAllWrites = true;
  const failingStore = createStore(initial, { storage: failingStorage, autosave: true, now: () => later(2) });
  const failureEvents = [];
  failingStore.subscribe((_state, details) => failureEvents.push(details));
  failingStore.dispatch(worksheetActions.updateBlock('status_q', { displayText: 'Unsaved edit' }));
  assert.equal(failingStore.getPersistenceStatus(), 'error');
  assert.deepEqual(failureEvents.filter((event) => event.persistenceOnly).map((event) => event.persistenceStatus), ['saving', 'error']);

  const unavailable = createStore(initial, { storage: null, autosave: true, now: () => later(3) });
  assert.equal(unavailable.getPersistenceStatus(), 'unavailable');
  assert.equal(unavailable.flush(), false);
});

test('project saves and destructive helpers report partial storage failures accurately', () => {
  const worksheet = worksheetWith([question('failure_q', 'Question')]);
  const indexFailure = new FailableStorage();
  indexFailure.failWriteKeys.add(PROJECT_INDEX_KEY);
  assert.equal(saveProject(worksheet, indexFailure), false, 'a payload without a discoverable index is not reported as a complete save');
  assert.ok(indexFailure.getItem('maths-page-studio:project:worksheet_one'), 'the recoverable payload is retained');

  const totalFailure = new FailableStorage();
  totalFailure.failAllWrites = true;
  assert.equal(duplicateProject(worksheet, { idFactory: (prefix) => `${prefix}_copy`, now: () => later(1) }, totalFailure), null);

  const removalFailure = new FailableStorage();
  assert.equal(saveProject(worksheet, removalFailure), true);
  removalFailure.failRemovals = true;
  assert.equal(deleteProject(worksheet.metadata.id, removalFailure), false);
  assert.ok(removalFailure.getItem('maths-page-studio:project:worksheet_one'));

  const deleteIndexFailure = new FailableStorage();
  assert.equal(saveProject(worksheet, deleteIndexFailure), true);
  deleteIndexFailure.failWriteKeys.add(PROJECT_INDEX_KEY);
  assert.equal(deleteProject(worksheet.metadata.id, deleteIndexFailure), false);
  assert.ok(deleteIndexFailure.getItem('maths-page-studio:project:worksheet_one'), 'an index failure must not delete the worksheet payload');
  assert.ok(listProjects(deleteIndexFailure).some((entry) => entry.id === worksheet.metadata.id), 'the failed deletion stays discoverable');
});

test('duplicating a linked version remaps every block and manual-break reference', () => {
  const section = createQuestionBlock({
    id: 'source_section',
    kind: 'heading',
    originalText: 'Reasoning',
    displayText: 'Reasoning',
    section: 'source_section',
  });
  let source = worksheetWith([
    section,
    question('source_a', 'Question A', { section: 'source_section' }),
    question('source_b', 'Question B', { section: 'source_section' }),
  ], {
    architecture: {
      sections: [{ id: 'source_section', headingId: 'source_section', name: 'Reasoning', role: 'reasoning', layout: 'flow' }],
    },
  });
  source = worksheetReducer(source, {
    ...worksheetActions.createVersion({
      id: 'source_variant',
      type: 'custom',
      name: 'Reordered',
      preset: false,
      overrides: {
        pageArrangement: { manualBreakBefore: ['source_b'] },
        blockPatches: { source_b: { section: 'source_section' } },
        addedBlocks: [question('variant_added', 'Variant-only question', { section: 'source_section' })],
        order: ['source_section', 'source_b', 'source_a', 'variant_added'],
        workbookMasterBlockIds: ['source_section', 'source_a', 'source_b'],
        workbookMasterBlockKinds: { source_section: 'heading', source_a: 'question', source_b: 'question' },
        workbookAutoHiddenBlockIds: ['source_section'],
      },
    }),
    timestamp: later(1),
  }, { idFactory: (prefix) => `${prefix}_fallback` });

  const storage = new MemoryStorage();
  let counter = 0;
  const duplicate = duplicateProject(source, {
    name: 'Linked copy',
    now: () => later(2),
    idFactory: (prefix) => `${prefix}_duplicate_${counter += 1}`,
  }, storage);
  assert.ok(duplicate);
  const resolved = resolveWorksheetVersion(duplicate, duplicate.versions.activeId);
  const liveIds = new Set(resolved.blocks.map((block) => block.id));
  assert.ok(resolved.pageArrangement.manualBreakBefore.every((id) => liveIds.has(id)));
  assert.ok(!resolved.pageArrangement.manualBreakBefore.includes('source_b'));
  assert.ok(!liveIds.has('variant_added'));
  const copiedHeading = resolved.blocks.find((block) => block.kind === 'heading');
  const copiedQuestionB = resolved.blocks.find((block) => block.displayText === 'Question B');
  const copiedAdded = resolved.blocks.find((block) => block.displayText === 'Variant-only question');
  assert.equal(copiedQuestionB.section, copiedHeading.id);
  assert.equal(copiedAdded.section, copiedHeading.id);
  const copiedVersion = duplicate.versions.items.find((version) => version.id === duplicate.versions.activeId);
  assert.ok(copiedVersion.overrides.workbookMasterBlockIds.every((id) => liveIds.has(id)));
  assert.ok(!copiedVersion.overrides.workbookMasterBlockIds.includes('source_a'));
  assert.ok(Object.keys(copiedVersion.overrides.workbookMasterBlockKinds).every((id) => liveIds.has(id)));
  assert.ok(!Object.hasOwn(copiedVersion.overrides.workbookMasterBlockKinds, 'source_section'));
  assert.ok(copiedVersion.overrides.workbookAutoHiddenBlockIds.every((id) => liveIds.has(id)));
  assert.ok(!copiedVersion.overrides.workbookAutoHiddenBlockIds.includes('source_section'));
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
  assert.equal(
    estimateWrappedLines('Mark 2,750 on a number line from 2,000 to 3,000.', 78, { fontSizePt: 10.2 }),
    2,
    'half-width workbook questions reserve the same wrap seen in the printed Georgia face',
  );
  assert.equal(
    estimateWrappedLines('There are 6 bags with 8 apples in each bag. How many apples are there altogether?', 78, { fontSizePt: 10.2 }),
    3,
    'long workbook questions cannot under-reserve a response area beneath wrapped text',
  );
});

test('pagination measures the printed body scale rather than a fixed smaller question font', () => {
  const text = 'Explain why the answer is correct using place value and compare it with another efficient mathematical method. '.repeat(2).slice(0, 120);
  const block = question('scaled-copy', text, { response: { type: 'short-answer', size: 'compact' } });
  const standard = measureQuestionBlock(block, 90, { density: 'standard', bodyScale: 'standard' });
  const large = measureQuestionBlock(block, 90, { density: 'standard', bodyScale: 'large' });

  assert.equal(standard.breakdown.questionFontPt, 11.2);
  assert.equal(large.breakdown.questionFontPt, 12);
  assert.ok(large.breakdown.questionMm > standard.breakdown.questionMm + 5, 'large printed copy wraps to the additional line that pagination reserves');
});

test('wide-model legibility uses the rendered slot after its physical indent and workbook chrome', () => {
  const block = question('wide-model', 'Mark the value on the number line.', {
    model: createModelRecipe('number-line', { size: 'extra-large' }),
    response: { type: 'short-answer', size: 'compact' },
  });
  const normal = paginateWorksheet(worksheetWith([block], {
    settings: { marginMm: 12, columns: 1 },
  }));
  assert.equal(normal.geometry.contentWidthMm, 186);
  assert.equal(normal.placements['wide-model'].measurement.breakdown.modelWidthMm, 177, 'the 9 mm model indent is not offered to the SVG');
  assert.deepEqual(normal.tooSmallModelBlockIds, [], 'extra-large is achievable in the complete portrait A4 slot');

  const workbook = paginateWorksheet(worksheetWith([{
    ...block,
    composition: { ...block.composition, footprint: 'full' },
  }], {
    settings: {
      workbookMode: true,
      marginMm: 8,
      margins: { top: 8, right: 8, bottom: 8, left: 8 },
      density: 'compact',
      bodyScale: 'small',
      pageNumbers: false,
    },
    architecture: { compositionMode: 'rows', sections: [], header: { layout: 'compact', fields: {} } },
  }));
  const workbookMeasurement = workbook.placements['wide-model'].measurement;
  assert.ok(workbookMeasurement.breakdown.modelWidthMm >= 177, 'the full-width cut-out slot reaches the achievable extra-large minimum');
  assert.equal(workbook.pageCount, 1);
  assert.equal(workbook.workbookFitsOnePage, true, 'one physical page is certified when the representation reaches its readable minimum');
});

test('workbook promotes label-bearing Build 2 models while retaining readable two-up equations', () => {
  const workbookSettings = {
    workbookMode: true,
    columns: 2,
    density: 'compact',
    bodyScale: 'small',
    marginMm: 8,
    margins: { top: 8, right: 8, bottom: 8, left: 8 },
    pageNumbers: false,
    showNameField: false,
    showClassField: false,
    showDateField: false,
  };
  const architecture = { compositionMode: 'rows', sections: [], header: { layout: 'compact', fields: {} } };
  const build2Block = (family, id) => question(id, `Use the ${family} model.`, {
    model: { ...createBuild2ModelRecipe(family), position: 'beside', size: 'standard' },
    response: { type: 'short-answer', size: 'compact' },
    composition: { footprint: 'half' },
    layout: { columnSpan: 'half' },
  });

  const labelled = paginateWorksheet(worksheetWith([
    build2Block('sharing-division', 'workbook-sharing'),
    build2Block('clock-model', 'workbook-clock'),
  ], { settings: workbookSettings, architecture }));
  for (const id of ['workbook-sharing', 'workbook-clock']) {
    const placement = labelled.placements[id];
    assert.equal(placement.column, null, `${id} receives a full workbook row`);
    assert.equal(placement.widthMm, 194);
    assert.equal(placement.measurement.breakdown.requestedPosition, 'beside');
    assert.equal(placement.measurement.breakdown.position, 'beneath');
    assert.ok(placement.measurement.breakdown.modelWidthMm > 170, `${id} labels use the readable full-width SVG scale`);
  }
  assert.equal(labelled.pageCount, 1, 'full-width promotion does not add a page when the readable models still fit');
  assert.equal(labelled.workbookFitsOnePage, true);

  const readableTwoUp = paginateWorksheet(worksheetWith([
    build2Block('missing-number-strip', 'workbook-equation-a'),
    build2Block('missing-number-strip', 'workbook-equation-b'),
  ], { settings: workbookSettings, architecture }));
  assert.deepEqual(
    ['workbook-equation-a', 'workbook-equation-b'].map((id) => readableTwoUp.placements[id].column),
    [0, 1],
    '28 px equation glyphs retain the compact two-up workbook layout',
  );
  for (const id of ['workbook-equation-a', 'workbook-equation-b']) {
    const measurement = readableTwoUp.placements[id].measurement;
    assert.equal(measurement.breakdown.position, 'beneath', 'a safe half-width model still escapes the 40 mm beside track');
    assert.ok(measurement.breakdown.modelWidthMm >= 78, '28 px glyphs remain above nine-point print size');
  }
  assert.equal(readableTwoUp.pageCount, 1);
  assert.equal(readableTwoUp.workbookFitsOnePage, true);
});

test('normal and one-page workbook placements remain inside A4 and never collide', () => {
  const assertSafePlacements = (result) => {
    assert.equal(result.hasOverflow, false);
    for (const page of result.pages) {
      for (const item of page.items) {
        assert.ok(item.yMm >= page.bodyTopMm - 0.01);
        assert.ok(item.yMm + item.heightMm <= page.bodyBottomMm + 0.01, `${item.blockId} stays inside page ${page.number}`);
      }
      for (let leftIndex = 0; leftIndex < page.items.length; leftIndex += 1) {
        const left = page.items[leftIndex];
        for (let rightIndex = leftIndex + 1; rightIndex < page.items.length; rightIndex += 1) {
          const right = page.items[rightIndex];
          const horizontalOverlap = left.xMm < right.xMm + right.widthMm - 0.01
            && right.xMm < left.xMm + left.widthMm - 0.01;
          const verticalOverlap = left.yMm < right.yMm + right.heightMm - 0.01
            && right.yMm < left.yMm + left.heightMm - 0.01;
          assert.ok(!(horizontalOverlap && verticalOverlap), `${left.blockId} and ${right.blockId} do not overlap`);
        }
      }
    }
  };

  const normalBlocks = Array.from({ length: 10 }, (_, index) => question(
    `normal-boundary-${index}`,
    'Explain how you know the calculation is correct, compare both methods, and show every exchange clearly.',
    { response: { type: 'writing-lines', size: 'standard', customRows: 7 } },
  ));
  const normal = paginateWorksheet(worksheetWith(normalBlocks, { settings: { bodyScale: 'large', marginMm: 12 } }));
  assert.ok(normal.pageCount > 1);
  assertSafePlacements(normal);

  const workbookBlocks = Array.from({ length: 8 }, (_, index) => question(
    `workbook-boundary-${index}`,
    `Calculate ${index + 2} × ${index + 3}.`,
    {
      response: { type: 'short-answer', size: 'compact' },
      composition: { footprint: 'half' },
      layout: { columnSpan: 'half' },
    },
  ));
  const workbook = paginateWorksheet(worksheetWith(workbookBlocks, {
    settings: {
      workbookMode: true,
      columns: 2,
      density: 'compact',
      bodyScale: 'small',
      marginMm: 8,
      margins: { top: 8, right: 8, bottom: 8, left: 8 },
      pageNumbers: false,
      showNameField: false,
      showClassField: false,
      showDateField: false,
    },
    architecture: { compositionMode: 'rows', sections: [], header: { layout: 'compact', fields: {} } },
  }));
  assert.equal(workbook.pageCount, 1);
  assert.equal(workbook.workbookFitsOnePage, true);
  assertSafePlacements(workbook);
});

test('fixed table and labelled-step rows reserve their exact printed seven-millimetre tracks', () => {
  for (const type of ['table-completion', 'labelled-steps']) {
    const block = question(`rows-${type}`, 'Complete every row.', {
      response: { type, size: 'standard', rows: 4, customRows: 14 },
    });
    const measured = measureQuestionBlock(block, 186, { density: 'standard', bodyScale: 'standard' });
    assert.equal(measured.breakdown.responseMm, 98);
    assert.equal(measured.breakdown.responseTotalMm, 100.5, 'the 2.5 mm response margin is outside the exact row box');

    const legacyTwentyRows = question(`rows-twenty-${type}`, 'Complete every row.', {
      response: { type, size: 'standard', rows: 4, customRows: 20 },
    });
    assert.equal(
      measureQuestionBlock(legacyTwentyRows, 186, { density: 'standard', bodyScale: 'standard' }).breakdown.responseMm,
      140,
      'valid older saves with twenty rendered fixed rows are measured without truncation',
    );
  }

  const minimumWritingLines = question('minimum-writing-lines', 'Explain.', {
    response: { type: 'prove-it', size: 'standard', lines: 1, customRows: 1 },
  });
  assert.equal(
    measureQuestionBlock(minimumWritingLines, 186, { density: 'standard', bodyScale: 'standard' }).breakdown.responseMm,
    12,
    'the two writing lines emitted by the renderer fit even when saved data requests one',
  );
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

test('an unusually large first task is placed once with overflow instead of creating a title-only page', () => {
  const longPrompt = `Explain ${Array.from({ length: 380 }, (_, index) => `word${index}`).join(' ')}`;
  const block = question('title_page_task', longPrompt, {
    response: { type: 'labelled-steps', size: 'large', rows: 14 },
  });
  const result = paginateWorksheet(worksheetWith([block]));
  assert.equal(result.pageCount, 1);
  assert.deepEqual(result.pages[0].items.map((item) => item.blockId), ['title_page_task']);
  assert.equal(result.hasOverflow, true);
  assert.ok(result.crowdedPageNumbers.includes(1));
  assert.ok(result.warnings.some((warning) => warning.code === 'block-overcrowded' && warning.page === 1));
  assert.ok(!result.warnings.some((warning) => warning.code === 'page-empty'));
});

test('labelled manipulatives override legacy beside layouts with a readable full-width slot', () => {
  for (const [family, id] of [['place-value-chart', 'place'], ['base-ten', 'dienes'], ['partitioning-frame', 'partition']]) {
    const block = question(`labelled-${id}`, 'Represent the number using the labelled model.', {
      model: createModelRecipe(family, { position: 'beside', size: 'compact' }),
      response: { type: 'short-answer', size: 'compact' },
    });
    const worksheet = worksheetWith([block], { settings: { columns: 2, marginMm: 12 } });
    const result = paginateWorksheet(worksheet);
    const placement = result.placements[`labelled-${id}`];
    assert.equal(placement.column, null);
    assert.equal(placement.widthMm, 186);
    assert.equal(placement.measurement.breakdown.requestedPosition, 'beside');
    assert.equal(placement.measurement.breakdown.position, 'beneath');
    assert.equal(placement.measurement.breakdown.modelWidthMm, 177);
    assert.deepEqual(result.tooSmallModelBlockIds, []);
    const style = placementStyle(placement);
    assert.equal(style.breakInside, 'avoid');
    assert.match(style.left, /mm$/);
    assert.match(style.height, /mm$/);
  }
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
