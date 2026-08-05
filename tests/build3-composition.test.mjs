import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createModelRecipe,
  createQuestionBlock,
  createWorksheet,
  loadProject,
  migrateWorksheet,
  saveProject,
  worksheetActions,
  worksheetReducer,
} from '../js/state.js';
import { paginateWorksheet } from '../js/pagination.js';
import { suggestWorksheetArchitecture } from '../js/worksheet-architecture.js';
import {
  compareVersions,
  createWorkbookCutoutVariant,
  reconcileWorkbookCutoutVariant,
  resolveWorksheetVersion,
} from '../js/worksheet-versions.js';

const NOW = '2026-08-04T12:00:00.000Z';
const later = (minute) => `2026-08-04T12:${String(minute).padStart(2, '0')}:00.000Z`;
const ids = (() => {
  let value = 0;
  return (prefix) => `${prefix}_${++value}`;
})();

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
}

function question(id, text, overrides = {}) {
  return createQuestionBlock({
    id,
    originalText: text,
    displayText: text,
    response: { type: 'short-answer', size: 'small' },
    ...overrides,
  });
}

function worksheet(blocks, overrides = {}) {
  return createWorksheet({
    metadata: { id: 'build3_sheet', name: 'Build 3 sheet', title: 'Build 3 sheet', createdAt: NOW, updatedAt: NOW },
    originalImport: { rawText: blocks.map((block) => block.originalText).join('\n'), importedAt: NOW },
    blocks,
    ...overrides,
  }, { now: () => NOW, idFactory: ids });
}

test('architecture suggestions preserve imported question order while adding a purposeful structure', () => {
  const source = [
    question('f1', 'Calculate 3,482 + 2,135.'),
    question('f2', 'Complete 4,003 − 1,786.'),
    question('r1', 'Sam says 4,060 is greater than 4,600. Explain the mistake.'),
    question('p1', 'Draw a bar chart to show the data.'),
  ];
  const suggested = suggestWorksheetArchitecture(source, { purpose: 'guided-practice', idFactory: ids, forceSuggestions: true });
  const questionOrder = suggested.blocks.filter((block) => block.kind === 'question').map((block) => block.id);

  assert.deepEqual(questionOrder, ['f1', 'f2', 'r1', 'p1']);
  assert.ok(suggested.blocks.some((block) => block.kind === 'heading'));
  assert.equal(suggested.blocks.find((block) => block.id === 'f1').composition.footprint, 'standard');
  assert.equal(suggested.blocks.find((block) => block.id === 'r1').response.type, 'lined-explanation');
  assert.equal(suggested.blocks.find((block) => block.id === 'p1').response.type, 'diagram-construction');
  assert.equal(suggested.architecture.purpose, 'guided-practice');
  assert.equal(suggested.architecture.stylePreset, 'guided');
});

test('recognisable imported section headings retain their teacher wording and acquire the right architecture role', () => {
  const fluency = createQuestionBlock({ id: 'heading_fluency', kind: 'heading', originalText: 'Fluency', displayText: 'Fluency', section: 'heading_fluency' });
  const reasoning = createQuestionBlock({ id: 'heading_reasoning', kind: 'heading', originalText: 'Reasoning', displayText: 'Reasoning', section: 'heading_reasoning' });
  const problems = createQuestionBlock({ id: 'heading_problem', kind: 'heading', originalText: 'Problem solving', displayText: 'Problem solving', section: 'heading_problem' });
  const suggested = suggestWorksheetArchitecture([fluency, reasoning, problems], { purpose: 'practice', idFactory: ids, forceSuggestions: true });

  assert.deepEqual(suggested.architecture.sections.map((section) => [section.name, section.role, section.layout]), [
    ['Fluency', 'fluency', 'rows'],
    ['Reasoning', 'reasoning', 'flow'],
    ['Problem solving', 'problem-solving', 'flow'],
  ]);
  assert.equal(suggested.architecture.compositionMode, 'rows');
});

test('short direct fluency questions receive compact half-width answer space while written methods stay spacious enough', () => {
  const suggested = suggestWorksheetArchitecture([
    question('fact', '6 × 8 ='),
    question('method', 'Calculate 3,482 + 2,135.'),
  ], { purpose: 'practice', idFactory: ids, forceSuggestions: true });
  const fact = suggested.blocks.find((block) => block.id === 'fact');
  const method = suggested.blocks.find((block) => block.id === 'method');
  assert.equal(fact.composition.pattern, 'compact-question');
  assert.equal(fact.composition.footprint, 'half');
  assert.equal(fact.response.type, 'answer-box');
  assert.equal(method.composition.footprint, 'standard');
  assert.equal(method.response.type, 'calculation-area');
});

test('a pupil response model is the response route and does not receive a duplicate working box', () => {
  const source = question('plot', 'Plot the point (4, 6) on the coordinate grid.', {
    model: createModelRecipe('number-line', {
      purpose: 'response-model',
      completionState: 'blank',
    }),
    response: { type: 'open-box', size: 'standard' },
  });
  const suggested = suggestWorksheetArchitecture([source], {
    purpose: 'practice',
    idFactory: ids,
    forceSuggestions: true,
  });

  assert.equal(suggested.blocks.find((block) => block.id === 'plot').response.type, 'none');
});

test('Build 2 projects migrate into a structured Build 3 master without losing models or raw question data', () => {
  const migrated = migrateWorksheet({
    version: 2,
    metadata: { id: 'build2_saved', title: 'Old page', createdAt: NOW, updatedAt: NOW },
    originalImport: { rawText: 'Calculate 48 ÷ 6.' },
    blocks: [{
      id: 'old_q',
      text: 'Calculate 48 ÷ 6.',
      model: { family: 'short-division', values: { dividend: 48, divisor: 6 } },
      response: { type: 'open-box', size: 'standard' },
    }],
  }, { now: () => NOW, idFactory: ids });

  assert.equal(migrated.version, 3);
  assert.equal(migrated.migration.migratedFrom, 2);
  assert.equal(migrated.blocks[0].id, 'old_q');
  assert.equal(migrated.blocks[0].model.family, 'short-division');
  assert.equal(migrated.originalImport.rawText, 'Calculate 48 ÷ 6.');
  assert.equal(migrated.versions.items[0].id, 'master');
  assert.equal(migrated.architecture.compositionMode, 'flow');
});

test('linked versions inherit later master additions while preserving and resetting a local adjustment', () => {
  let state = worksheet([
    question('one', 'Calculate 234 × 3.', { model: createModelRecipe('short-multiplication', { values: { multiplicand: 234, multiplier: 3 } }) }),
    question('two', 'Round 3,462 to the nearest hundred.'),
  ]);
  state = worksheetReducer(state, {
    ...worksheetActions.createVersion({ type: 'supported' }),
    timestamp: later(1),
  }, { idFactory: ids });
  const supportedId = state.versions.activeId;
  let supported = resolveWorksheetVersion(state, supportedId);
  assert.equal(supported.activeVersion.type, 'supported');
  assert.equal(supported.blocks.find((block) => block.id === 'one').response.size, 'generous');
  assert.ok(supported.blocks.find((block) => block.id === 'one').composition.hint);

  state = worksheetReducer(state, {
    ...worksheetActions.applyVersionAction(supportedId, worksheetActions.updateBlock('one', { displayText: 'Calculate 123 × 3.' })),
    timestamp: later(2),
  }, { idFactory: ids });
  assert.equal(state.blocks.find((block) => block.id === 'one').displayText, 'Calculate 234 × 3.');
  supported = resolveWorksheetVersion(state, supportedId);
  assert.equal(supported.blocks.find((block) => block.id === 'one').displayText, 'Calculate 123 × 3.');

  state = worksheetReducer(state, {
    ...worksheetActions.addBlock(question('three', 'Find the perimeter of a rectangle 8 cm by 4 cm.')),
    timestamp: later(3),
  }, { idFactory: ids });
  supported = resolveWorksheetVersion(state, supportedId);
  assert.ok(supported.blocks.some((block) => block.id === 'three'), 'new master question appears in unchanged variants');

  state = worksheetReducer(state, {
    ...worksheetActions.resetVersionBlock(supportedId, 'one'),
    timestamp: later(4),
  }, { idFactory: ids });
  supported = resolveWorksheetVersion(state, supportedId);
  assert.equal(supported.blocks.find((block) => block.id === 'one').displayText, 'Calculate 234 × 3.');
  assert.ok(compareVersions(state, 'master', supportedId).some((entry) => entry.blockId === 'two'), 'the supported scaffold remains a meaningful version change');
});

test('rows composition pairs only deliberate half-width questions and safely fits a full-width block between rows', () => {
  const heading = createQuestionBlock({
    id: 'fluency', kind: 'heading', originalText: 'Fluency', displayText: 'Fluency', section: 'fluency',
    sectionMeta: { role: 'fluency' }, response: { type: 'none', size: 'small' }, layout: { keepWithNext: true },
  });
  const half = (id, text) => question(id, text, { section: 'fluency', composition: { footprint: 'half' }, layout: { columnSpan: 'half' } });
  const full = question('reason', 'Explain why both methods are correct.', {
    section: 'reasoning',
    composition: { footprint: 'full', pattern: 'reasoning' },
    layout: { columnSpan: 'full' },
    response: { type: 'lined-explanation', size: 'medium', lines: 4 },
  });
  const state = worksheet([heading, half('a', '6 × 8 ='), half('b', '48 ÷ 6 ='), full, half('c', '3,456 + 20 ='), half('d', '3,456 + 2 =')], {
    architecture: {
      compositionMode: 'rows',
      sections: [
        { id: 'fluency', headingId: 'fluency', name: 'Fluency', role: 'fluency', layout: 'rows' },
        { id: 'reasoning', name: 'Reasoning', role: 'reasoning', layout: 'flow' },
      ],
    },
  });
  const result = paginateWorksheet(state);
  const [a, b, reason, c, d] = ['a', 'b', 'reason', 'c', 'd'].map((id) => result.placements[id]);

  assert.equal(a.page, b.page);
  assert.equal(a.yMm, b.yMm);
  assert.notEqual(a.xMm, b.xMm);
  assert.equal(reason.page, a.page, 'a full-width block can remain on the same flowing page');
  assert.ok(reason.yMm >= a.yMm + a.heightMm);
  assert.equal(reason.widthMm, result.geometry.contentWidthMm);
  assert.equal(c.yMm, d.yMm);
  assert.ok(c.yMm >= reason.yMm + reason.heightMm);
  assert.equal(result.hasOverflow, false);
});

test('rows composition honours a section that explicitly flows at full width', () => {
  const half = (id) => question(id, '6 × 8 =', {
    section: 'reasoning',
    composition: { footprint: 'half' },
    layout: { columnSpan: 'half' },
  });
  const state = worksheet([half('flow-a'), half('flow-b')], {
    architecture: {
      compositionMode: 'rows',
      sections: [{ id: 'reasoning', name: 'Reasoning', role: 'reasoning', layout: 'flow' }],
    },
  });
  const result = paginateWorksheet(state);

  assert.notEqual(result.placements['flow-a'].yMm, result.placements['flow-b'].yMm);
  assert.equal(result.placements['flow-a'].widthMm, result.geometry.contentWidthMm);
  assert.equal(result.placements['flow-b'].widthMm, result.geometry.contentWidthMm);
});

test('flow composition honours a section that explicitly uses paired rows', () => {
  const half = (id) => question(id, '7 × 6 =', {
    section: 'fluency',
    composition: { footprint: 'half' },
    layout: { columnSpan: 'half' },
  });
  const reasoning = question('reasoning-full', 'Explain why the method works.', {
    section: 'reasoning',
    composition: { footprint: 'spacious' },
    layout: { columnSpan: 'full' },
  });
  const state = worksheet([half('row-a'), half('row-b'), reasoning], {
    architecture: {
      compositionMode: 'flow',
      sections: [
        { id: 'fluency', name: 'Fluency', role: 'fluency', layout: 'rows' },
        { id: 'reasoning', name: 'Reasoning', role: 'reasoning', layout: 'flow' },
      ],
    },
  });
  const result = paginateWorksheet(state);

  assert.equal(result.geometry.columns, 2);
  assert.equal(result.placements['row-a'].yMm, result.placements['row-b'].yMm);
  assert.deepEqual([result.placements['row-a'].column, result.placements['row-b'].column], [0, 1]);
  assert.equal(result.placements['reasoning-full'].widthMm, result.geometry.contentWidthMm);
  assert.ok(result.placements['reasoning-full'].yMm > result.placements['row-a'].yMm);
});

test('deliberate pages retain flowing placement instead of implicitly becoming two-column rows', () => {
  const half = (id) => question(id, '7 × 6 =', {
    section: 'fluency',
    composition: { footprint: 'half' },
    layout: { columnSpan: 'half' },
  });
  const state = worksheet([half('deliberate-a'), half('deliberate-b')], {
    architecture: {
      compositionMode: 'deliberate-pages',
      sections: [{ id: 'fluency', name: 'Fluency', role: 'fluency', layout: 'rows' }],
    },
  });
  const result = paginateWorksheet(state);

  assert.equal(result.geometry.columns, 1);
  assert.notEqual(result.placements['deliberate-a'].yMm, result.placements['deliberate-b'].yMm);
});

test('start section on a new page applies once to its heading rather than every section block', () => {
  const intro = question('intro-question', '4 + 5 =', { section: 'intro' });
  const heading = createQuestionBlock({
    id: 'new-section', kind: 'heading', originalText: 'Reasoning', displayText: 'Reasoning',
    section: 'new-section', layout: { keepWithNext: true },
  });
  const first = question('new-first', 'Explain why 4 + 5 = 9.', { section: 'new-section' });
  const second = question('new-second', 'Show another way to make 9.', { section: 'new-section' });
  const state = worksheet([intro, heading, first, second], {
    architecture: {
      compositionMode: 'flow',
      sections: [
        { id: 'intro', name: 'Fluency', role: 'fluency', layout: 'flow' },
        { id: 'new-section', headingId: 'new-section', name: 'Reasoning', role: 'reasoning', layout: 'flow', startOnNewPage: true },
      ],
    },
  });
  const result = paginateWorksheet(state);

  assert.equal(result.placements['intro-question'].page, 1);
  assert.equal(result.placements['new-section'].page, 2);
  assert.equal(result.placements['new-first'].page, 2);
  assert.equal(result.placements['new-second'].page, 2);
});

test('block footprints change printable height and a safe full-page block owns exactly one page', () => {
  const sized = (id, footprint) => question(id, 'What is 8 × 7?', {
    composition: { footprint },
    response: { type: 'short-answer', size: 'small' },
  });
  const compact = paginateWorksheet(worksheet([sized('compact', 'compact')])).placements.compact;
  const standard = paginateWorksheet(worksheet([sized('standard', 'standard')])).placements.standard;
  const spacious = paginateWorksheet(worksheet([sized('spacious', 'spacious')])).placements.spacious;
  assert.ok(compact.heightMm < standard.heightMm);
  assert.ok(standard.heightMm < spacious.heightMm);

  const fullPage = sized('full-page', 'page');
  const result = paginateWorksheet(worksheet([
    sized('before-page', 'standard'),
    fullPage,
  ]));
  const placement = result.placements['full-page'];
  const page = result.pages[placement.page - 1];
  assert.equal(result.pageCount, 2, 'a final full-page block must not create a trailing phantom page');
  assert.deepEqual(page.items.map((item) => item.blockId), ['full-page']);
  assert.equal(placement.heightMm, Math.round((page.bodyBottomMm - placement.yMm) * 100) / 100);
  assert.equal(result.hasOverflow, false);
});

test('workbook cut-outs clears inherited sections and breaks while keeping five wide response models readable on one page', () => {
  const heading = createQuestionBlock({
    id: 'workbook-heading',
    kind: 'heading',
    originalText: 'Reasoning',
    displayText: 'Reasoning',
    section: 'workbook-section',
  });
  const locations = Array.from({ length: 5 }, (_, index) => {
    const start = index % 5;
    const end = start + 1;
    return question(`location-${index}`, `Place ${start} 1/2 on a number line from ${start} to ${end}.`, {
      section: 'workbook-section',
      model: createModelRecipe('number-line', {
        values: { start, end, divisions: 2, markers: [{ value: start + 0.5, label: `${start + 0.5}` }] },
        unknown: 'marker:0',
        purpose: 'response-model',
        completionState: 'partly-completed',
        size: index === 0 ? 'large' : index === 1 ? 'compact' : 'standard',
      }),
      response: { type: 'answer-box', size: 'standard' },
      composition: { footprint: 'half', startOnNewPage: index === 2 },
      layout: { columnSpan: 'half', manualBreakBefore: index === 3, pageHint: index > 2 ? 3 : 0 },
    });
  });
  const master = worksheet([heading, ...locations], {
    architecture: {
      compositionMode: 'flow',
      sections: [{
        id: 'workbook-section', headingId: heading.id, name: 'Reasoning', role: 'reasoning',
        layout: 'flow', startOnNewPage: true,
      }],
    },
    pageArrangement: { manualBreakBefore: ['location-4'], pageOverrides: { 2: { note: 'old page' } } },
  });
  const workbook = createWorkbookCutoutVariant(master, { id: 'workbook' });
  const resolved = resolveWorksheetVersion({
    ...master,
    versions: { activeId: 'workbook', items: [workbook] },
  }, 'workbook');
  const result = paginateWorksheet(resolved, { outputView: 'pupil' });

  assert.equal(resolved.settings.columns, 2);
  assert.equal(resolved.settings.density, 'compact');
  assert.equal(resolved.settings.workbookMode, true);
  assert.equal(resolved.architecture.header.layout, 'compact');
  assert.deepEqual(resolved.architecture.sections, []);
  assert.ok(resolved.blocks.every((block) => block.kind === 'question'));
  assert.ok(resolved.blocks.every((block) => block.section === null));
  assert.deepEqual(resolved.pageArrangement.manualBreakBefore, []);
  assert.deepEqual(resolved.pageArrangement.pageOverrides, {});
  assert.equal(resolved.blocks[0].model.size, 'large', 'a deliberate Large choice must survive workbook packing');
  assert.equal(resolved.blocks[1].model.size, 'standard', 'only Compact is promoted to the readable normal size');
  assert.ok(resolved.blocks.every((block) => block.response.type === 'none'));
  assert.ok(resolved.blocks.every((block) => !block.composition.startOnNewPage && !block.layout.manualBreakBefore && block.layout.pageHint === 0));
  assert.ok(resolved.blocks.every((block) => result.placements[block.id].widthMm === result.geometry.contentWidthMm));
  assert.equal(result.pageCount, 1);
  assert.equal(result.hasOverflow, false);
  assert.equal(result.workbookMode, true);
  assert.equal(result.workbookFitsOnePage, true);
  assert.deepEqual(result.blocksWithoutResponseSpace, []);
});

test('workbook response removal follows the model purpose and never a generic completion verb', () => {
  const calculation = question('complete-calculation', 'Complete the calculation 3,482 + 2,135.', {
    model: createModelRecipe('column-arithmetic', {
      values: { operation: 'addition', operands: [3482, 2135], result: null },
      purpose: 'thinking-model',
      completionState: 'partly-completed',
    }),
    response: { type: 'calculation-area', size: 'standard' },
  });
  const location = question('place-value', 'Place 2 1/2 on the number line.', {
    model: createModelRecipe('number-line', {
      values: { start: 2, end: 3, divisions: 2, markers: [{ value: 2.5, label: '2 1/2' }] },
      unknown: 'marker:0',
      purpose: 'response-model',
      completionState: 'partly-completed',
    }),
    response: { type: 'answer-box', size: 'standard' },
  });
  const master = worksheet([calculation, location]);
  const version = createWorkbookCutoutVariant(master, { id: 'workbook-purpose' });
  const resolved = resolveWorksheetVersion({
    ...master,
    versions: { activeId: version.id, items: [version] },
  }, version.id);

  assert.equal(resolved.blocks.find((block) => block.id === calculation.id).response.type, 'calculation-area');
  assert.equal(resolved.blocks.find((block) => block.id === location.id).response.type, 'none');
  assert.deepEqual(paginateWorksheet(resolved).blocksWithoutResponseSpace, []);
});

test('workbook pagination reports an honest failed one-page invariant without shrinking wide models', () => {
  const locations = Array.from({ length: 10 }, (_, index) => question(
    `many-location-${index}`,
    `Place ${index + 0.5} on the number line from ${index} to ${index + 1}.`,
    {
      model: createModelRecipe('number-line', {
        values: { start: index, end: index + 1, divisions: 2, markers: [{ value: index + 0.5, label: `${index + 0.5}` }] },
        unknown: 'marker:0',
        purpose: 'response-model',
        completionState: 'partly-completed',
        size: 'standard',
      }),
      response: { type: 'none', size: 'compact' },
    },
  ));
  const master = worksheet(locations);
  const version = createWorkbookCutoutVariant(master, { id: 'workbook-many' });
  const resolved = resolveWorksheetVersion({ ...master, versions: { activeId: version.id, items: [version] } }, version.id);
  const result = paginateWorksheet(resolved);

  assert.ok(result.pageCount > 1);
  assert.equal(result.workbookFitsOnePage, false);
  assert.ok(result.warnings.some((warning) => warning.code === 'workbook-page-count' && warning.pageCount === result.pageCount));
  assert.deepEqual(result.tooSmallModelBlockIds, []);
  assert.ok(resolved.blocks.every((block) => block.model.size === 'standard'));
});

test('workbook reconciliation changes only later master additions and preserves every existing workbook edit', () => {
  const originalHeading = createQuestionBlock({
    id: 'original-heading',
    kind: 'heading',
    originalText: 'Original section',
    displayText: 'Original section',
    section: 'original-section',
  });
  const resetQuestion = question('reset-question', 'What is 6 × 7?', {
    section: 'original-section',
    composition: { footprint: 'spacious', startOnNewPage: true },
    layout: { columnSpan: 'full', manualBreakBefore: true, pageHint: 2 },
  });
  const editedQuestion = question('edited-question', 'Place 1/2 on a number line.', {
    section: 'original-section',
    model: createModelRecipe('number-line', {
      purpose: 'response-model',
      completionState: 'partly-completed',
      size: 'standard',
    }),
  });
  const removedQuestion = question('removed-question', 'What is 8 × 8?');
  const originalMaster = worksheet([originalHeading, resetQuestion, editedQuestion, removedQuestion]);
  const existing = createWorkbookCutoutVariant(originalMaster, { id: 'reconciled-workbook' });

  // These are all deliberate edits made only inside the existing workbook.
  // Resetting the first question removes its generated patch entirely, which
  // is why reconciliation needs the creation-time master ID baseline.
  delete existing.overrides.blockPatches[resetQuestion.id];
  existing.overrides.blockPatches[editedQuestion.id] = {
    ...existing.overrides.blockPatches[editedQuestion.id],
    displayText: 'Teacher-edited workbook wording',
    model: { size: 'extra-large', position: 'beneath' },
  };
  existing.overrides.hiddenBlockIds.push(removedQuestion.id);
  const workbookOnly = question('workbook-only', 'A workbook-only prompt.', {
    response: { type: 'lined-explanation', size: 'compact' },
  });
  existing.overrides.addedBlocks.push(workbookOnly);
  existing.overrides.order = [editedQuestion.id, resetQuestion.id, workbookOnly.id];
  assert.strictEqual(
    reconcileWorkbookCutoutVariant(originalMaster, existing),
    existing,
    'an already-current workbook returns the same object and cannot create a fake edit',
  );

  const newHeading = createQuestionBlock({
    id: 'later-heading',
    kind: 'heading',
    originalText: 'Later section',
    displayText: 'Later section',
    section: 'later-section',
  });
  const newInstruction = createQuestionBlock({
    id: 'later-instruction',
    kind: 'instruction',
    originalText: 'Show your method.',
    displayText: 'Show your method.',
    section: 'later-section',
  });
  const newCompactQuestion = question('later-compact-question', 'Place 2 1/2 on the number line.', {
    section: 'later-section',
    model: createModelRecipe('number-line', {
      purpose: 'response-model',
      completionState: 'partly-completed',
      size: 'compact',
    }),
    response: { type: 'answer-box', size: 'standard' },
    composition: { footprint: 'spacious', startOnNewPage: true },
    layout: { columnSpan: 'full', keepWithNext: true, manualBreakBefore: true, pageHint: 5 },
  });
  const newLargeQuestion = question('later-large-question', 'Use the bar model.', {
    section: 'later-section',
    model: createModelRecipe('comparison-bar', {
      purpose: 'thinking-model',
      completionState: 'partly-completed',
      size: 'large',
    }),
    response: { type: 'lined-explanation', size: 'standard' },
    composition: { footprint: 'full', startOnNewPage: true },
    layout: { columnSpan: 'full', manualBreakBefore: true, pageHint: 6 },
  });
  const expandedMaster = {
    ...originalMaster,
    blocks: [
      ...originalMaster.blocks,
      newHeading,
      newInstruction,
      newCompactQuestion,
      newLargeQuestion,
    ],
  };
  const before = structuredClone(existing);
  const reconciled = reconcileWorkbookCutoutVariant(expandedMaster, existing);

  assert.deepEqual(existing, before, 'the helper must not mutate the supplied sparse version');
  assert.equal(reconciled.id, existing.id);
  assert.equal(reconciled.name, existing.name);
  assert.equal(reconciled.overrides.blockPatches[resetQuestion.id], undefined, 'an intentional reset-to-master remains reset');
  assert.deepEqual(reconciled.overrides.blockPatches[editedQuestion.id], existing.overrides.blockPatches[editedQuestion.id]);
  assert.deepEqual(reconciled.overrides.addedBlocks, existing.overrides.addedBlocks);
  assert.deepEqual(reconciled.overrides.order, existing.overrides.order);
  assert.ok(reconciled.overrides.hiddenBlockIds.includes(removedQuestion.id));
  assert.ok(reconciled.overrides.hiddenBlockIds.includes(newHeading.id));
  assert.ok(reconciled.overrides.hiddenBlockIds.includes(newInstruction.id));

  const resolved = resolveWorksheetVersion({
    ...expandedMaster,
    versions: { activeId: reconciled.id, items: [reconciled] },
  }, reconciled.id);
  assert.deepEqual(resolved.blocks.map((block) => block.id), [
    editedQuestion.id,
    resetQuestion.id,
    workbookOnly.id,
    newCompactQuestion.id,
    newLargeQuestion.id,
  ]);
  assert.equal(resolved.blocks.find((block) => block.id === editedQuestion.id).displayText, 'Teacher-edited workbook wording');
  assert.equal(resolved.blocks.find((block) => block.id === editedQuestion.id).model.size, 'extra-large');
  assert.equal(resolved.blocks.find((block) => block.id === resetQuestion.id).composition.footprint, 'spacious');

  const compact = resolved.blocks.find((block) => block.id === newCompactQuestion.id);
  assert.equal(compact.section, null);
  assert.equal(compact.model.size, 'standard');
  assert.equal(compact.model.position, 'beneath');
  assert.equal(compact.response.type, 'none');
  assert.equal(compact.composition.footprint, 'half');
  assert.equal(compact.composition.startOnNewPage, false);
  assert.equal(compact.layout.columnSpan, 'half');
  assert.equal(compact.layout.keepWithNext, false);
  assert.equal(compact.layout.manualBreakBefore, false);
  assert.equal(compact.layout.pageHint, 0);

  const large = resolved.blocks.find((block) => block.id === newLargeQuestion.id);
  assert.equal(large.section, null);
  assert.equal(large.model.size, 'large');
  assert.equal(large.response.type, 'lined-explanation');
  assert.equal(large.response.size, 'compact');
  assert.equal(large.composition.startOnNewPage, false);
  assert.equal(large.layout.manualBreakBefore, false);
  assert.strictEqual(
    reconcileWorkbookCutoutVariant(expandedMaster, reconciled),
    reconciled,
    'reconciliation is an identity-preserving no-op once the baseline is current',
  );
});

test('workbook reconciliation follows stable-ID kind transitions without revealing teacher-hidden questions', () => {
  const becomesHeading = question('kind-question-to-heading', 'What is 7 × 8?');
  const becomesQuestion = createQuestionBlock({
    id: 'kind-heading-to-question',
    kind: 'heading',
    originalText: 'Reasoning',
    displayText: 'Reasoning',
  });
  const instructionBecomesQuestion = createQuestionBlock({
    id: 'kind-instruction-to-question',
    kind: 'instruction',
    originalText: 'Show your method.',
    displayText: 'Show your method.',
  });
  const teacherHidden = question('kind-teacher-hidden', 'What is 9 × 9?');
  const originalMaster = worksheet([becomesHeading, becomesQuestion, instructionBecomesQuestion, teacherHidden]);
  const existing = createWorkbookCutoutVariant(originalMaster, { id: 'kind-workbook' });
  existing.overrides.hiddenBlockIds.push(teacherHidden.id);

  const changedMaster = {
    ...originalMaster,
    blocks: [
      createQuestionBlock({
        ...becomesHeading,
        kind: 'heading',
        originalText: 'New heading',
        displayText: 'New heading',
      }),
      question(becomesQuestion.id, 'Place 3/4 on the number line.', {
        section: 'new-section',
        model: createModelRecipe('number-line', {
          purpose: 'response-model',
          completionState: 'partly-completed',
          size: 'compact',
        }),
        response: { type: 'answer-box', size: 'standard' },
        composition: { startOnNewPage: true },
        layout: { manualBreakBefore: true, pageHint: 4 },
      }),
      question(instructionBecomesQuestion.id, 'Explain why 4 × 6 = 24.', {
        section: 'new-section',
        response: { type: 'lined-explanation', size: 'standard' },
        composition: { startOnNewPage: true },
        layout: { manualBreakBefore: true, pageHint: 5 },
      }),
      teacherHidden,
    ],
  };
  const reconciled = reconcileWorkbookCutoutVariant(changedMaster, existing);
  const resolved = resolveWorksheetVersion({
    ...changedMaster,
    versions: { activeId: reconciled.id, items: [reconciled] },
  }, reconciled.id);

  assert.notStrictEqual(reconciled, existing);
  assert.ok(reconciled.overrides.hiddenBlockIds.includes(becomesHeading.id));
  assert.ok(!reconciled.overrides.hiddenBlockIds.includes(becomesQuestion.id));
  assert.ok(!reconciled.overrides.hiddenBlockIds.includes(instructionBecomesQuestion.id));
  assert.ok(reconciled.overrides.hiddenBlockIds.includes(teacherHidden.id), 'a same-kind teacher-hidden question stays hidden');
  assert.ok(reconciled.overrides.workbookAutoHiddenBlockIds.includes(becomesHeading.id));
  assert.ok(!reconciled.overrides.workbookAutoHiddenBlockIds.includes(becomesQuestion.id));
  assert.ok(!reconciled.overrides.workbookAutoHiddenBlockIds.includes(instructionBecomesQuestion.id));
  assert.ok(!reconciled.overrides.workbookAutoHiddenBlockIds.includes(teacherHidden.id));
  assert.deepEqual(resolved.blocks.map((block) => block.id), [becomesQuestion.id, instructionBecomesQuestion.id]);

  const located = resolved.blocks.find((block) => block.id === becomesQuestion.id);
  assert.equal(located.section, null);
  assert.equal(located.model.size, 'standard');
  assert.equal(located.response.type, 'none');
  assert.equal(located.composition.footprint, 'half');
  assert.equal(located.composition.startOnNewPage, false);
  assert.equal(located.layout.manualBreakBefore, false);
  assert.equal(located.layout.pageHint, 0);

  const explanation = resolved.blocks.find((block) => block.id === instructionBecomesQuestion.id);
  assert.equal(explanation.section, null);
  assert.equal(explanation.response.type, 'lined-explanation');
  assert.equal(explanation.response.size, 'compact');
  assert.equal(explanation.composition.footprint, 'half');
  assert.equal(reconciled.overrides.workbookMasterBlockKinds[becomesHeading.id], 'heading');
  assert.equal(reconciled.overrides.workbookMasterBlockKinds[becomesQuestion.id], 'question');
  assert.equal(reconciled.overrides.workbookMasterBlockKinds[instructionBecomesQuestion.id], 'question');
  assert.strictEqual(reconcileWorkbookCutoutVariant(changedMaster, reconciled), reconciled);
});

test('a teacher-hidden question stays hidden through a question-heading-question round trip', () => {
  const original = question('teacher-hidden-round-trip', 'What is 7 × 6?', {
    response: { type: 'lined-explanation', size: 'standard' },
  });
  const master = worksheet([original]);
  const workbook = createWorkbookCutoutVariant(master, { id: 'hidden-round-trip-workbook' });
  workbook.overrides.hiddenBlockIds.push(original.id);

  const asHeading = createQuestionBlock({
    ...original,
    kind: 'heading',
    originalText: 'Reasoning',
    displayText: 'Reasoning',
  });
  const headingMaster = { ...master, blocks: [asHeading] };
  const afterHeading = reconcileWorkbookCutoutVariant(headingMaster, workbook);
  assert.ok(afterHeading.overrides.hiddenBlockIds.includes(original.id));
  assert.ok(!afterHeading.overrides.workbookAutoHiddenBlockIds.includes(original.id), 'an existing teacher hide never becomes system-owned');

  const backToQuestion = question(original.id, 'Explain why 7 × 6 = 42.', {
    section: 'reasoning-section',
    response: { type: 'lined-explanation', size: 'standard' },
    composition: { startOnNewPage: true },
    layout: { manualBreakBefore: true, pageHint: 3 },
  });
  const questionMaster = { ...master, blocks: [backToQuestion] };
  const afterQuestion = reconcileWorkbookCutoutVariant(questionMaster, afterHeading);
  const resolved = resolveWorksheetVersion({
    ...questionMaster,
    versions: { activeId: afterQuestion.id, items: [afterQuestion] },
  }, afterQuestion.id);

  assert.ok(afterQuestion.overrides.hiddenBlockIds.includes(original.id));
  assert.ok(!afterQuestion.overrides.workbookAutoHiddenBlockIds.includes(original.id));
  assert.deepEqual(resolved.blocks, [], 'the teacher-hidden question must not be exposed after its kind returns');
  assert.equal(afterQuestion.overrides.blockPatches[original.id].section, null);
  assert.equal(afterQuestion.overrides.blockPatches[original.id].composition.startOnNewPage, false);
  assert.equal(afterQuestion.overrides.blockPatches[original.id].layout.manualBreakBefore, false);
  assert.strictEqual(reconcileWorkbookCutoutVariant(questionMaster, afterQuestion), afterQuestion);
});

test('real workbook edits and resets retain reconciliation provenance for later master additions', () => {
  const original = question('provenance-original', 'Explain why 8 × 4 = 32.', {
    response: { type: 'lined-explanation', size: 'generous' },
    composition: { pattern: 'reasoning', footprint: 'spacious' },
    layout: { columnSpan: 'full' },
  });
  const master = worksheet([original]);
  const workbook = createWorkbookCutoutVariant(master, { id: 'provenance-workbook' });
  let state = {
    ...master,
    versions: { activeId: workbook.id, items: [workbook] },
  };

  state = worksheetReducer(state, {
    ...worksheetActions.applyVersionAction(
      workbook.id,
      worksheetActions.updateBlock(original.id, { displayText: 'Workbook-only wording.' }),
    ),
    timestamp: later(1),
  });
  let savedWorkbook = state.versions.items.find((version) => version.id === workbook.id);
  assert.deepEqual(savedWorkbook.overrides.workbookMasterBlockIds, workbook.overrides.workbookMasterBlockIds);
  assert.deepEqual(savedWorkbook.overrides.workbookMasterBlockKinds, workbook.overrides.workbookMasterBlockKinds);
  assert.deepEqual(savedWorkbook.overrides.workbookAutoHiddenBlockIds, workbook.overrides.workbookAutoHiddenBlockIds);

  state = worksheetReducer(state, {
    ...worksheetActions.resetVersionBlock(workbook.id, original.id),
    timestamp: later(2),
  });
  state = worksheetReducer(state, {
    ...worksheetActions.setActiveVersion('master'),
    timestamp: later(3),
  });
  const laterQuestion = question('provenance-later', 'What is 7 × 6?', {
    response: { type: 'lined-explanation', size: 'generous' },
    composition: { pattern: 'reasoning', footprint: 'spacious', startOnNewPage: true },
    layout: { columnSpan: 'full', manualBreakBefore: true, pageHint: 3 },
  });
  state = worksheetReducer(state, {
    ...worksheetActions.addBlock(laterQuestion),
    timestamp: later(4),
  });

  savedWorkbook = state.versions.items.find((version) => version.id === workbook.id);
  assert.equal(savedWorkbook.overrides.blockPatches[original.id], undefined, 'the deliberate reset stays reset');
  const reconciled = reconcileWorkbookCutoutVariant(state, savedWorkbook);
  const resolved = resolveWorksheetVersion({
    ...state,
    versions: { activeId: reconciled.id, items: [reconciled] },
  }, reconciled.id);
  const reset = resolved.blocks.find((block) => block.id === original.id);
  const added = resolved.blocks.find((block) => block.id === laterQuestion.id);

  assert.equal(reset.response.size, 'generous');
  assert.equal(reset.composition.footprint, 'spacious');
  assert.equal(reset.layout.columnSpan, 'full');
  assert.equal(added.response.size, 'compact');
  assert.equal(added.composition.footprint, 'half');
  assert.equal(added.composition.startOnNewPage, false);
  assert.equal(added.layout.columnSpan, 'half');
  assert.equal(added.layout.manualBreakBefore, false);
});

test('workbook reconciliation safely migrates real pre-v4 visible decorative blocks', () => {
  const visibleHeading = createQuestionBlock({
    id: 'legacy-visible-heading',
    kind: 'heading',
    originalText: 'Reasoning',
    displayText: 'Reasoning',
  });
  const visibleInstruction = createQuestionBlock({
    id: 'legacy-visible-instruction',
    kind: 'instruction',
    originalText: 'Show your method.',
    displayText: 'Show your method.',
  });
  const visibleQuestion = question('legacy-visible-question', 'What is 9 × 4?');
  const resetQuestion = question('legacy-reset-question', 'Explain why 5 × 6 = 30.', {
    section: 'teacher-section',
    response: { type: 'lined-explanation', size: 'generous' },
    composition: { pattern: 'reasoning', footprint: 'spacious', startOnNewPage: true },
    layout: { columnSpan: 'full', manualBreakBefore: true, pageHint: 4 },
  });
  const teacherHidden = question('legacy-teacher-hidden-question', 'What is 12 × 3?');
  const master = worksheet([visibleHeading, visibleInstruction, visibleQuestion, resetQuestion, teacherHidden]);
  // Old workbook generation retained headings/instructions as visible full
  // width patched blocks and had neither workbookMode nor provenance fields.
  const legacy = {
    id: 'legacy-workbook',
    name: 'Workbook cut-outs',
    type: 'custom',
    baseId: 'master',
    createdAt: NOW,
    outputView: 'pupil',
    overrides: {
      settings: { columns: 2, density: 'compact' },
      architecture: { compositionMode: 'rows' },
      pageArrangement: {},
      blockPatches: {
        [visibleHeading.id]: { composition: { footprint: 'compact' }, layout: { columnSpan: 'full' } },
        [visibleInstruction.id]: { composition: { footprint: 'compact' }, layout: { columnSpan: 'full' } },
        [visibleQuestion.id]: { composition: { footprint: 'half' }, layout: { columnSpan: 'half' } },
      },
      hiddenBlockIds: [teacherHidden.id],
      addedBlocks: [],
      order: null,
      outputView: 'pupil',
    },
  };
  const before = structuredClone(legacy);
  const reconciled = reconcileWorkbookCutoutVariant(master, legacy);
  const resolved = resolveWorksheetVersion({
    ...master,
    versions: { activeId: reconciled.id, items: [reconciled] },
  }, reconciled.id);

  assert.deepEqual(legacy, before);
  assert.ok(reconciled.overrides.hiddenBlockIds.includes(visibleHeading.id));
  assert.ok(reconciled.overrides.hiddenBlockIds.includes(visibleInstruction.id));
  assert.ok(reconciled.overrides.hiddenBlockIds.includes(teacherHidden.id), 'migration never exposes a teacher-hidden current question');
  assert.deepEqual(resolved.blocks.map((block) => block.id), [visibleQuestion.id, resetQuestion.id]);
  const preservedReset = resolved.blocks.find((block) => block.id === resetQuestion.id);
  assert.equal(reconciled.overrides.blockPatches[resetQuestion.id], undefined);
  assert.equal(preservedReset.section, 'teacher-section');
  assert.equal(preservedReset.response.type, 'lined-explanation');
  assert.equal(preservedReset.response.size, 'generous');
  assert.equal(preservedReset.composition.pattern, 'reasoning');
  assert.equal(preservedReset.composition.footprint, 'spacious');
  assert.equal(preservedReset.composition.startOnNewPage, true);
  assert.equal(preservedReset.layout.columnSpan, 'full');
  assert.equal(preservedReset.layout.manualBreakBefore, true);
  assert.equal(preservedReset.layout.pageHint, 4);
  assert.deepEqual(reconciled.overrides.workbookMasterBlockIds, master.blocks.map((block) => block.id));
  assert.deepEqual(reconciled.overrides.workbookMasterBlockKinds, {
    [visibleHeading.id]: 'heading',
    [visibleInstruction.id]: 'instruction',
    [visibleQuestion.id]: 'question',
    [resetQuestion.id]: 'question',
    [teacherHidden.id]: 'question',
  });
  assert.deepEqual(reconciled.overrides.workbookAutoHiddenBlockIds, [visibleHeading.id, visibleInstruction.id]);
  assert.strictEqual(reconcileWorkbookCutoutVariant(master, reconciled), reconciled);
});

test('labelled wide models remain full width on ordinary worksheets too', () => {
  const location = question('ordinary-wide-line', 'Place 2 1/2 on the number line from 2 to 3.', {
    model: createModelRecipe('number-line', {
      values: { start: 2, end: 3, divisions: 4, markers: [{ value: 2.5, label: '2 1/2' }] },
      unknown: 'marker:0',
      purpose: 'response-model',
      completionState: 'partly-completed',
      size: 'standard',
    }),
    response: { type: 'none', size: 'compact' },
    composition: { footprint: 'half' },
    layout: { columnSpan: 'half' },
  });
  const state = worksheet([location], {
    settings: { columns: 2 },
    architecture: { compositionMode: 'rows' },
  });
  const result = paginateWorksheet(state);

  assert.equal(result.placements[location.id].widthMm, result.geometry.contentWidthMm);
  assert.deepEqual(result.tooSmallModelBlockIds, []);
});

test('teacher-only wide models use the same full-width print rule as pupil models', () => {
  const blocks = [1, 2].map((number) => question(`teacher-line-${number}`, `Teacher example ${number}.`, {
    model: null,
    teacher: {
      completedModel: createModelRecipe('number-line', {
        values: { start: 0, end: 100, divisions: 10, markers: [{ value: number * 25, label: String(number * 25) }] },
        purpose: 'worked-example',
        completionState: 'completed',
        size: 'standard',
      }),
    },
    composition: { footprint: 'half' },
    layout: { columnSpan: 'half' },
  }));
  const state = worksheet(blocks, {
    settings: { columns: 2 },
    architecture: { compositionMode: 'rows' },
  });
  const result = paginateWorksheet(state, { outputView: 'teacher' });

  assert.ok(blocks.every((block) => result.placements[block.id].widthMm === result.geometry.contentWidthMm));
  assert.deepEqual(result.tooSmallModelBlockIds, []);
});

test('fourteen-row table and labelled-step spaces reserve every fixed-height print row', () => {
  for (const type of ['table-completion', 'labelled-steps']) {
    const block = question(`rows-${type}`, 'Complete every row.', {
      response: { type, size: 'standard', rows: 14 },
    });
    const state = worksheet([block], { settings: { density: 'compact' } });
    const result = paginateWorksheet(state);
    const responseMm = result.placements[block.id].measurement.breakdown.responseMm;

    assert.equal(responseMm, 98, `${type} needs 14 × 7 mm even at compact density`);
    assert.equal(result.hasOverflow, false);
  }
});

test('manual numbering accepts nested labels and answer output gets its own print-safe measurement', () => {
  let state = worksheet([
    question('multi', 'Complete each calculation.', { manualNumber: '4a', response: { type: 'answer-box', size: 'small' }, teacher: { answer: '3,656' } }),
  ], { architecture: { numbering: { mode: 'manual', restartAtSections: false } } });
  state = worksheetReducer(state, {
    ...worksheetActions.updateBlock('multi', { manualNumber: '4b' }),
    timestamp: later(1),
  });
  assert.equal(state.blocks[0].number, '4b');
  const pupil = paginateWorksheet(state, { outputView: 'pupil' });
  const answer = paginateWorksheet(state, { outputView: 'answer' });
  assert.ok(answer.placements.multi.heightMm > pupil.placements.multi.heightMm);
});

test('Build 3 architecture, safe margins and sparse versions survive a project reopen', () => {
  let state = worksheet([
    question('persisted', 'Round 3,462 to the nearest hundred.'),
  ], {
    settings: { margins: { top: 11, right: 14, bottom: 13, left: 18 } },
    architecture: { purpose: 'assessment', compositionMode: 'deliberate-pages' },
  });
  state = worksheetReducer(state, {
    ...worksheetActions.createVersion({ type: 'assessment', name: 'Assessment copy' }),
    timestamp: later(1),
  }, { idFactory: ids });
  const assessmentId = state.versions.activeId;
  state = worksheetReducer(state, {
    ...worksheetActions.applyVersionAction(assessmentId, worksheetActions.updateBlock('persisted', {
      composition: { hint: 'Mark the two neighbouring hundreds first.' },
    })),
    timestamp: later(2),
  }, { idFactory: ids });

  const storage = new MemoryStorage();
  assert.equal(saveProject(state, storage), true);
  const reopened = loadProject('build3_sheet', storage, { now: () => NOW, idFactory: ids });
  assert.equal(reopened.architecture.purpose, 'assessment');
  assert.equal(reopened.settings.margins.left, 18);
  assert.equal(reopened.versions.items.find((version) => version.id === assessmentId).name, 'Assessment copy');
  assert.equal(resolveWorksheetVersion(reopened, assessmentId).blocks[0].composition.hint, 'Mark the two neighbouring hundreds first.');
});
