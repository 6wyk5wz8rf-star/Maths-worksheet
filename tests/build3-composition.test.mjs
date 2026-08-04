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
import { compareVersions, resolveWorksheetVersion } from '../js/worksheet-versions.js';

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
