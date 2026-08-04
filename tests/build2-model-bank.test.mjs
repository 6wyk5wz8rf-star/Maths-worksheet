import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BUILD1_FAMILY_REFERENCES,
  BUILD2_MODEL_IDS,
  getBuild2ModelDefinition,
  createBuild2ModelRecipe,
  validateBuild2ModelRecipe,
  searchBuild2Models,
} from '../js/build2-model-bank.js';
import { BUILD2_RENDERERS, renderBuild2Model } from '../js/build2-model-renderers.js';

test('Build 2 bank supplies a broad additional Year 4 model set without replacing Build 1 ids', () => {
  assert.ok(BUILD2_MODEL_IDS.length >= 60);
  assert.ok(BUILD2_MODEL_IDS.every((id) => !BUILD1_FAMILY_REFERENCES.includes(id)));
  for (const id of BUILD2_MODEL_IDS) {
    const definition = getBuild2ModelDefinition(id);
    assert.ok(definition.name && definition.category && definition.accessibleDescription);
    assert.ok(definition.domains.length && definition.compatibleQuestionFamilies.length);
    assert.ok(definition.contraindications.length || definition.category === 'General Workspaces');
    assert.ok(definition.editorFields.length >= 3);
    assert.ok(definition.print.minWidthMm > 0 && definition.print.monochrome);
    assert.equal(typeof BUILD2_RENDERERS[definition.renderer], 'function', `${id} needs a renderer`);
  }
});

test('every Build 2 default recipe validates and renders as a semantic model', () => {
  for (const id of BUILD2_MODEL_IDS) {
    const recipe = createBuild2ModelRecipe(id);
    const validation = validateBuild2ModelRecipe(recipe);
    assert.equal(validation.valid, true, `${id}: ${validation.errors.join('; ')}`);
    const rendered = renderBuild2Model(recipe, { outputView: 'pupil' });
    assert.match(rendered, /<figure[\s>]/);
    assert.match(rendered, /<svg[\s>]/);
    assert.doesNotMatch(rendered, /placeholder/i);
  }
});

test('number-line normalisation makes visual intervals exact and keeps a blank pupil target protected', () => {
  const recipe = createBuild2ModelRecipe('rounding-number-line', {
    values: { number: 3462, step: 100, showMidpoint: true },
    unknown: 'marker',
  });
  const validation = validateBuild2ModelRecipe(recipe);
  assert.equal(validation.valid, true);
  assert.equal(validation.normalizedRecipe.values.interval, 10);
  const pupil = renderBuild2Model(validation.normalizedRecipe, { outputView: 'pupil' });
  assert.doesNotMatch(pupil, /3462/);
});

test('search understands ordinary teacher language and answer protection hides pupil clock hands', () => {
  assert.ok(searchBuild2Models('bar chart').some((model) => model.id === 'bar-chart'));
  assert.ok(searchBuild2Models('place value counters').some((model) => model.id === 'place-value-counters'));
  const clock = createBuild2ModelRecipe('clock-model', { values: { hour: 14, minute: 35, showHands: true, showDigital: true }, unknown: 'hands' });
  const pupil = renderBuild2Model(clock, { outputView: 'pupil' });
  assert.doesNotMatch(pupil, /<line x1="250" y1="120" x2=/);
});
