import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuestions } from '../js/parser.js';
import { matchQuestionToModels } from '../js/matcher.js';
import { createWorksheet, createQuestionBlock, createStore, worksheetActions } from '../js/state.js';
import { createModelRecipe, validateRecipe } from '../js/model-registry.js';
import { paginateWorksheet } from '../js/pagination.js';
import { MIXED_IMPORT } from './fixtures.mjs';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

test('complete Paste → Check → Make → Print data journey stays coherent', () => {
  const parsed = parseQuestions(MIXED_IMPORT);
  const blocks = parsed.items.map((item) => createQuestionBlock({
    kind: item.type === 'question' ? 'question' : item.type === 'section-heading' ? 'heading' : 'instruction',
    originalText: item.originalText,
    displayText: item.displayText,
    marks: item.marks,
    extracted: item.mathInfo ?? {},
    response: item.type === 'question' ? { type: 'open-box', size: 'compact' } : { type: 'none', size: 'compact' },
  }));
  let worksheet = createWorksheet({ originalImport: { rawText: MIXED_IMPORT }, blocks, intent: 'practice' });

  const drafted = worksheet.blocks.map((block) => {
    if (block.kind !== 'question') return block;
    const match = matchQuestionToModels(block.extracted, { intent: worksheet.intent });
    const model = match.provisionalRecipe ? createModelRecipe(match.provisionalRecipe.family, match.provisionalRecipe) : null;
    if (model) assert.equal(validateRecipe(model, { intent: worksheet.intent }).valid, true);
    return { ...block, model };
  });
  worksheet = createWorksheet({ ...worksheet, blocks: drafted });

  const storage = memoryStorage();
  const store = createStore(worksheet, { storage, autosave: true });
  const modelled = store.getState().blocks.find((block) => block.model);
  assert.ok(modelled);
  store.dispatch(worksheetActions.setResponse(modelled.id, { type: 'squared-grid', size: 'standard' }));
  store.dispatch(worksheetActions.reorderBlock(modelled.id, store.getState().blocks.length - 1));
  assert.equal(store.getState().blocks.at(-1).id, modelled.id);
  assert.ok(store.getState().blocks.at(-1).model, 'model moves with its question');
  assert.equal(store.getState().blocks.at(-1).response.type, 'squared-grid', 'response moves with its question');

  const pages = paginateWorksheet(store.getState(), { outputView: 'pupil' });
  assert.ok(pages.pageCount >= 1);
  assert.equal(pages.hasOverflow, false);
  assert.equal(Object.keys(pages.placements).length, store.getState().blocks.length);
  assert.ok(Object.values(pages.placements).every((placement) => placement.indivisible));
  store.flush();

  const reopened = createStore(null, { storage, autosave: false });
  assert.equal(reopened.load(store.getState().metadata.id), true);
  assert.equal(reopened.getState().originalImport.rawText, MIXED_IMPORT);
  assert.equal(reopened.getState().blocks.at(-1).id, modelled.id);
});

test('assessment first draft withholds structure-revealing automatic models', () => {
  const parsed = parseQuestions('1. Calculate 3,482 + 2,135. [2 marks]\n2. Explain why the answer is reasonable.');
  const matches = parsed.questions.map((question) => matchQuestionToModels(question, { intent: 'assessment' }));
  assert.equal(matches[0].provisionalRecipe, null);
  assert.equal(matches[1].noModelRecommended, true);
});
