import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createBuild2ModelRecipe,
  validateBuild2ModelRecipe,
} from '../js/build2-model-bank.js';
import { renderBuild2Model } from '../js/build2-model-renderers.js';
import { matchQuestionToModels } from '../js/matcher.js';

const render = (family, patch = {}) => renderBuild2Model(
  createBuild2ModelRecipe(family, patch),
  { outputView: 'pupil' },
);

test('area-grid honours its explicit answer-label setting', () => {
  const html = render('area-square-grid', {
    values: { width: 8, height: 4, showAreaLabel: false },
  });
  assert.doesNotMatch(html, /Area\s*=/);
});

test('a perimeter question binds its two stated dimensions and preserves the pupil unknown', () => {
  const match = matchQuestionToModels('A rectangle is 8 cm long and 4 cm wide. Find its perimeter.');
  const recipe = match.suggestions[0]?.recipe;
  assert.equal(recipe?.family, 'perimeter-trace');
  assert.equal(recipe.values.width, 8);
  assert.equal(recipe.values.height, 4);
  assert.equal(recipe.unknown, 'perimeter');
  assert.match(renderBuild2Model(recipe, { outputView: 'pupil' }), /Perimeter\s*=\s*____/);
});

test('perimeter trace has a distinct rectilinear variant rather than always drawing a rectangle', () => {
  const rectangle = render('perimeter-trace', { values: { width: 8, height: 4, kind: 'rectangle' }, unknown: 'perimeter' });
  const rectilinear = render('perimeter-trace', {
    values: { width: 8, height: 4, kind: 'rectilinear', sides: [8, 2, 3, 2, 5, 4] },
    unknown: 'perimeter',
  });
  assert.notEqual(rectilinear, rectangle);
  assert.match(rectilinear, /<polygon\b/);
});

test('a rectilinear perimeter trace rejects side lengths that cannot close its boundary', () => {
  const validation = validateBuild2ModelRecipe(createBuild2ModelRecipe('perimeter-trace', {
    values: { width: 8, height: 4, kind: 'rectilinear', sides: [8, 2, 3, 2, 4, 4] },
  }));
  assert.equal(validation.valid, false);
});

test('the shared chart-data protection token changes every construction chart', () => {
  for (const family of ['bar-chart', 'pictogram', 'line-graph']) {
    const ordinary = render(family);
    const protectedPupil = render(family, { unknown: 'chart-data' });
    assert.notEqual(protectedPupil, ordinary, `${family} must react to chart-data protection`);
  }
});

test('a fraction set cannot depict unequal denominator groups', () => {
  const validation = validateBuild2ModelRecipe(createBuild2ModelRecipe('fraction-set-model', {
    values: { total: 20, numerator: 1, denominator: 3 },
  }));
  assert.equal(validation.valid, false);
});

test('a fraction set does not silently omit collection objects beyond its printable limit', () => {
  const validation = validateBuild2ModelRecipe(createBuild2ModelRecipe('fraction-set-model', {
    values: { total: 100, numerator: 1, denominator: 5 },
  }));
  assert.equal(validation.valid, false);
});

test('grouping division rejects a quotient that would silently omit complete groups', () => {
  const recipe = createBuild2ModelRecipe('grouping-division', {
    values: { total: 100, groupSize: 2, showRemainder: true },
  });
  const validation = validateBuild2ModelRecipe(recipe);
  const html = renderBuild2Model(recipe, { outputView: 'pupil' });

  assert.equal(validation.valid, false);
  assert.match(html, /Model needs review/);
  assert.doesNotMatch(html, /leftover 76/);
});

test('division number lines use exact divisor jumps and a truthful remainder endpoint', () => {
  const html = render('division-number-line', {
    values: { total: 29, divisor: 4, direction: 'backward' },
  });

  for (const value of [0, 4, 8, 12, 16, 20, 24, 28, 29]) {
    assert.match(html, new RegExp(`>${value}<`));
  }
  assert.match(html, /remainder 1/);
  assert.match(html, /7 exact jumps of 4 from 0 to 28, then a remainder of 1 ending at 29/);
  assert.doesNotMatch(html, /4\.142857|8\.285714|12\.428571/);
});

test('answer output reveals fields in a completed Build 2 model just like teacher output', () => {
  const recipe = createBuild2ModelRecipe('duration-timeline', {
    values: { startMinutes: 690, endMinutes: 780, showJumps: true },
    unknown: 'duration',
    hidden: ['duration'],
    scaffoldState: 'modelled',
    completionState: 'completed',
  });
  const pupil = renderBuild2Model(recipe, { outputView: 'pupil' });
  const teacher = renderBuild2Model(recipe, { outputView: 'teacher' });
  const answer = renderBuild2Model(recipe, { outputView: 'answer' });

  assert.match(pupil, /duration: \?/);
  assert.match(teacher, /90 minutes/);
  assert.match(answer, /90 minutes/);
  assert.doesNotMatch(answer, /duration: \?/);
});

test('sharing division rejects a share too large to draw truthfully', () => {
  const recipe = createBuild2ModelRecipe('sharing-division', {
    values: { total: 100, groups: 2, showRemainder: true },
  });
  const validation = validateBuild2ModelRecipe(recipe);
  const html = renderBuild2Model(recipe, { outputView: 'pupil' });

  assert.equal(validation.valid, false);
  assert.match(html, /Model needs review/);
  assert.doesNotMatch(html, /mps-build2-model__svg/);
});

test('renderer capacity limits reject recipes instead of changing or omitting mathematics', () => {
  const unsafe = [
    createBuild2ModelRecipe('multiplication-bar', {
      values: { groups: 17, groupSize: 2, total: 34 },
    }),
    createBuild2ModelRecipe('area-square-grid', {
      values: { rows: 25, columns: 25, showAreaLabel: true },
    }),
    createBuild2ModelRecipe('bar-chart', {
      values: { rows: Array.from({ length: 9 }, (_, index) => ({ label: `Category ${index + 1}`, value: index + 1 })), max: 10 },
    }),
    createBuild2ModelRecipe('editable-table', {
      values: { headers: ['Item', 'Value'], rows: Array.from({ length: 9 }, (_, index) => ({ label: `Row ${index + 1}`, value: index + 1 })) },
    }),
    createBuild2ModelRecipe('pictogram', {
      values: { rows: Array.from({ length: 7 }, (_, index) => ({ label: `Row ${index + 1}`, value: 2 })), key: 2, symbol: '●' },
    }),
    createBuild2ModelRecipe('line-graph', {
      values: { rows: Array.from({ length: 11 }, (_, index) => ({ label: String(index), value: index })), yMax: 10 },
    }),
    createBuild2ModelRecipe('equivalent-fraction-strips', {
      values: { fractions: [{ numerator: 1, denominator: 2 }, { numerator: 2, denominator: 4 }, { numerator: 3, denominator: 6 }, { numerator: 4, denominator: 8 }, { numerator: 5, denominator: 10 }] },
    }),
    createBuild2ModelRecipe('expanded-column-addition', {
      values: { operands: [1, 2, 3, 4, 5], result: null, operation: 'addition' },
    }),
    createBuild2ModelRecipe('partition-tree', {
      values: { whole: 7, parts: [1, 1, 1, 1, 1, 1, 1] },
    }),
    createBuild2ModelRecipe('ordering-comparison-line', {
      values: { numbers: [1, 2, 3, 4, 5, 6], order: 'given' },
    }),
    createBuild2ModelRecipe('money-representation', {
      values: { amountPence: 2000, pricePence: null, tenderedPence: null },
    }),
  ];

  for (const recipe of unsafe) {
    const validation = validateBuild2ModelRecipe(recipe);
    const html = renderBuild2Model(recipe, { outputView: 'teacher' });
    assert.equal(validation.valid, false, `${recipe.family} must reject an over-cap recipe`);
    assert.match(html, /Model needs review/, `${recipe.family} must not draw truncated data`);
    assert.doesNotMatch(html, /mps-build2-model__svg/);
  }
});

test('partial short-division answers must agree with the exact quotient and remainder', () => {
  for (const values of [
    { dividend: 10, divisor: 3, quotient: null, remainder: 5 },
    { dividend: 10, divisor: 3, quotient: 99, remainder: null },
  ]) {
    const recipe = createBuild2ModelRecipe('short-division', { values });
    assert.equal(validateBuild2ModelRecipe(recipe).valid, false);
    assert.match(renderBuild2Model(recipe, { outputView: 'teacher' }), /Model needs review/);
  }

  assert.equal(validateBuild2ModelRecipe(createBuild2ModelRecipe('short-division', {
    values: { dividend: 10, divisor: 3, quotient: null, remainder: 1 },
  })).valid, true);
});

test('fraction walls reject unreadable or structurally impossible rows', () => {
  const unreadable = validateBuild2ModelRecipe(createBuild2ModelRecipe('fraction-wall', {
    values: { denominators: [2, 20], highlight: '1/2' },
  }));
  const impossibleHighlight = validateBuild2ModelRecipe(createBuild2ModelRecipe('fraction-wall', {
    values: { denominators: [2, 4], highlight: '5/4' },
  }));
  assert.equal(unreadable.valid, false);
  assert.equal(impossibleHighlight.valid, false);
});

test('equivalent-fraction strips reject fractions that are not actually equivalent', () => {
  const validation = validateBuild2ModelRecipe(createBuild2ModelRecipe('equivalent-fraction-strips', {
    values: { fractions: [{ numerator: 1, denominator: 2 }, { numerator: 2, denominator: 5 }] },
  }));
  assert.equal(validation.valid, false);
});

test('equivalent-fraction pupil strips keep the completion strip blank while retaining the known reference', () => {
  const html = render('equivalent-fraction-strips', {
    values: { fractions: [{ numerator: 1, denominator: 2 }, { numerator: 2, denominator: 4 }] },
    unknown: 'equivalent-fraction',
  });
  assert.match(html, />1\/2</);
  assert.match(html, />□\/4</);
  assert.doesNotMatch(html, />2\/4</);
});

test('a missing equivalent-fraction denominator keeps its blank in an equivalent-strip model', () => {
  const match = matchQuestionToModels('Complete: 1/2 = □/4.');
  const recipe = match.suggestions[0]?.recipe;
  assert.equal(recipe?.family, 'equivalent-fraction-strips');
  assert.ok(recipe.unknown, 'The pupil-equivalence blank must remain protected');
});

test('a ruler keeps its supplied centimetre endpoint through normalisation', () => {
  const validation = validateBuild2ModelRecipe(createBuild2ModelRecipe('ruler-length-line', {
    values: { startCm: 0, endCm: 12, segmentStart: 1.2, segmentEnd: 8.7 },
  }));
  assert.equal(validation.valid, true);
  assert.equal(validation.normalizedRecipe.values.start, 0);
  assert.equal(validation.normalizedRecipe.values.end, 12);
});

test('money change model shows the tender and price but keeps the requested change blank', () => {
  const html = render('money-representation', {
    values: { amountPence: 275, pricePence: 275, tenderedPence: 500 },
    unknown: 'change',
  });
  assert.match(html, /£2\.75/);
  assert.match(html, /£5\.00/);
  assert.doesNotMatch(html, /£2\.25/);
});

test('a general money model does not invent a price, payment or change transaction', () => {
  const recipe = createBuild2ModelRecipe('money-representation');
  assert.equal(recipe.values.pricePence, null);
  assert.equal(recipe.values.tenderedPence, null);
  const html = renderBuild2Model(recipe, { outputView: 'pupil' });
  assert.doesNotMatch(html, />Price</);
  assert.doesNotMatch(html, />Paid</);
  assert.doesNotMatch(html, />Change</);
});

test('money recipes use exact non-negative integer pence values', () => {
  for (const values of [
    { amountPence: 275.5 },
    { amountPence: 275, pricePence: 300, tenderedPence: 275 },
  ]) {
    const validation = validateBuild2ModelRecipe(createBuild2ModelRecipe('money-representation', { values }));
    assert.equal(validation.valid, false);
  }
});

test('ordering and comparison line renders its supplied number cards, not a generic 0–10 line', () => {
  const html = render('ordering-comparison-line', {
    values: { numbers: [4060, 4600, 4006], showSymbols: false, order: 'given' },
  });
  for (const value of ['4060', '4600', '4006']) assert.match(html, new RegExp(`>${value}<`));
});

test('generic indexed answer-protection roles hide digits and comparison symbols', () => {
  const placeValue = render('place-value-counters', {
    values: { number: 3462, mode: 'digits' },
    unknown: 'digit',
  });
  for (const digit of ['3', '4', '6', '2']) assert.doesNotMatch(placeValue, new RegExp(`>${digit}<`));

  const comparison = render('ordering-comparison-line', {
    values: { numbers: [3, 7], showSymbols: true, order: 'given' },
    unknown: 'comparison-symbol',
  });
  assert.match(comparison, />□</);
  assert.doesNotMatch(comparison, /&lt;|&gt;/);
});

test('fraction calculation bar shows both same-denominator operands while result remains blank', () => {
  const html = render('fraction-calculation-bar', {
    values: { firstNumerator: 2, secondNumerator: 1, denominator: 5, operation: '+' },
    unknown: 'result',
  });
  assert.match(html, />2\/5</);
  assert.match(html, />1\/5</);
  assert.doesNotMatch(html, />3\/5</);
});

test('fraction area model renders a readable circle variant when explicitly selected', () => {
  const rectangle = render('fraction-area-model', { values: { numerator: 3, denominator: 5, shape: 'rectangle' } });
  const circle = render('fraction-area-model', { values: { numerator: 3, denominator: 5, shape: 'circle' } });
  assert.notEqual(circle, rectangle);
  assert.match(circle, /<(?:circle|path)\b/);
});

test('circle fraction areas reject unreadably fine partitions', () => {
  const validation = validateBuild2ModelRecipe(createBuild2ModelRecipe('fraction-area-model', {
    values: { numerator: 3, denominator: 13, shape: 'circle' },
  }));
  assert.equal(validation.valid, false);
});

test('fraction-of-quantity bar shows the known whole and one exact equal part without its requested result', () => {
  const html = render('fraction-of-quantity-bar', {
    values: { whole: 20, numerator: 3, denominator: 5 },
    unknown: 'fraction-of-quantity-result',
  });
  assert.match(html, />20</);
  assert.match(html, />4</);
  assert.doesNotMatch(html, />12</);
});

test('editable tables turn their requested blank-row count into printable rows', () => {
  const validation = validateBuild2ModelRecipe(createBuild2ModelRecipe('editable-table', {
    values: { headers: ['Value', 'Working', 'Answer'], rows: 4 },
  }));
  assert.equal(validation.valid, true);
  assert.equal(validation.normalizedRecipe.values.rows.length, 4);
});

test('exchange arrows never reference a missing SVG marker definition', () => {
  const html = render('base-ten-exchange');
  const references = [...html.matchAll(/marker-end="url\(#([^)]*)\)"/g)].map((match) => match[1]);
  for (const id of references) assert.match(html, new RegExp(`<marker id="${id}"`));
});

test('two instances use distinct SVG definition ids so print pages cannot cross-reference patterns', () => {
  const recipe = createBuild2ModelRecipe('fraction-wall');
  const first = renderBuild2Model(recipe, { outputView: 'pupil', instanceId: 'first-wall' });
  const second = renderBuild2Model(recipe, { outputView: 'pupil', instanceId: 'second-wall' });
  const ids = [...`${first}${second}`.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test('free-text equation fields remain SVG text, never executable markup', () => {
  const html = render('equation-balance', {
    values: { left: '<img src=x onerror=alert(1)>', right: '900', showEquals: true },
  });
  assert.doesNotMatch(html, /<img\b/i);
  assert.match(html, /&lt;img/);
});

test('turn labels escape malformed persisted text instead of injecting SVG markup', () => {
  const html = render('turn-model', {
    values: { turn: '<script>alert(1)</script>', direction: 'clockwise', start: 'north' },
  });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test('horizontal bar charts use a distinct, horizontal rendering', () => {
  const rows = [{ label: 'A', value: 4 }, { label: 'B', value: 8 }];
  const vertical = render('bar-chart', { values: { rows, max: 10, orientation: 'vertical' } });
  const horizontal = render('bar-chart', { values: { rows, max: 10, orientation: 'horizontal' } });
  assert.notEqual(horizontal, vertical);
});

test('graph models refuse a scale that would clip supplied data to a false maximum', () => {
  for (const [family, scale] of [['bar-chart', 'max'], ['line-graph', 'yMax']]) {
    const validation = validateBuild2ModelRecipe(createBuild2ModelRecipe(family, {
      values: { rows: [{ label: 'A', value: 12 }], [scale]: 10 },
    }));
    assert.equal(validation.valid, false, family);
  }
});

test('tenths grids do not silently round a hundredths value to a different decimal', () => {
  const validation = validateBuild2ModelRecipe(createBuild2ModelRecipe('tenths-hundredths-grid', {
    values: { mode: 'tenths', hundredths: 37, showNotation: true },
  }));
  assert.equal(validation.valid, false);
});

test('decimal place-value charts retain tens and ones around a fixed decimal point', () => {
  const html = render('decimal-place-value-chart', { values: { number: 10.05, mode: 'digits' } });
  assert.match(html, />Tens</);
  assert.match(html, />Ones</);
  assert.match(html, />Tenths</);
  assert.match(html, />Hundredths</);
  assert.doesNotMatch(html, /NaN/);
  const unsafePrecision = validateBuild2ModelRecipe(createBuild2ModelRecipe('decimal-place-value-chart', {
    values: { number: 3.456, mode: 'digits' },
  }));
  assert.equal(unsafePrecision.valid, false);
});

test('structural bar, bond and division recipes reject arithmetic contradictions', () => {
  const invalidRecipes = [
    createBuild2ModelRecipe('number-bond', { values: { whole: 100, parts: [60, 30] } }),
    createBuild2ModelRecipe('change-bar', { values: { start: 100, change: -20, result: 90 } }),
    createBuild2ModelRecipe('multiplication-bar', { values: { groups: 3, groupSize: 4, total: 13 } }),
    createBuild2ModelRecipe('scaling-bar', { values: { original: 8, multiplier: 3, scaled: 25 } }),
    createBuild2ModelRecipe('short-division', { values: { dividend: 10, divisor: 4, quotient: 2, remainder: 3 } }),
  ];
  for (const recipe of invalidRecipes) {
    const validation = validateBuild2ModelRecipe(recipe);
    assert.equal(validation.valid, false, `${recipe.family} must not render a false relationship`);
  }
});

test('sharing and grouping models change their pupil display when the quotient structure is unknown', () => {
  for (const [family, unknown] of [['sharing-division', 'group-size'], ['grouping-division', 'group-count']]) {
    const ordinary = render(family, { values: { total: 29, ...(family === 'sharing-division' ? { groups: 4 } : { groupSize: 4 }) } });
    const protectedPupil = render(family, { values: { total: 29, ...(family === 'sharing-division' ? { groups: 4 } : { groupSize: 4 }) }, unknown });
    assert.notEqual(protectedPupil, ordinary, `${family} must not draw the requested quotient for the pupil`);
  }
});

test('grouping division binds total, group size and unknown group count in their correct structural positions', () => {
  const match = matchQuestionToModels('How many groups of 4 can be made from 29?');
  const recipe = match.suggestions[0]?.recipe;
  assert.equal(recipe?.family, 'grouping-division');
  assert.equal(recipe.values.total, 29);
  assert.equal(recipe.values.groupSize, 4);
  assert.equal(recipe.unknown, 'group-count');
});

test('a direct Year 4 unit conversion receives an exact conversion bridge', () => {
  const match = matchQuestionToModels('Convert 3 kg to g.');
  const recipe = match.suggestions[0]?.recipe;
  assert.equal(recipe?.family, 'unit-conversion-bridge');
  assert.equal(recipe.values.fromValue, 3);
  assert.equal(recipe.values.fromUnit, 'kg');
  assert.equal(recipe.values.toUnit, 'g');
  assert.equal(recipe.unknown, 'converted-value');
});

test('a coordinate plotting task does not pre-plot the point pupils are asked to place', () => {
  const match = matchQuestionToModels('Plot (2, 3) on a coordinate grid.');
  const recipe = match.suggestions[0]?.recipe;
  assert.equal(recipe?.family, 'coordinate-grid');
  const html = renderBuild2Model(recipe, { outputView: 'pupil' });
  assert.doesNotMatch(html, /<circle cx="[^\"]+" cy="[^\"]+" r="5" fill="#4f568f"/);
});

test('a clock-drawing prompt receives a blank-hands clock rather than no model', () => {
  const match = matchQuestionToModels('Draw the hands to show 14:35.');
  const recipe = match.suggestions[0]?.recipe;
  assert.equal(recipe?.family, 'clock-model');
  const html = renderBuild2Model(recipe, { outputView: 'pupil' });
  assert.doesNotMatch(html, /<line x1="250" y1="120" x2=/);
});

test('a place-value misconception is not reduced to a generic comparison bar', () => {
  const match = matchQuestionToModels('Sam says 4,060 is greater than 4,600 because 6 is greater than 0. Explain the mistake.');
  const family = match.suggestions[0]?.family;
  assert.ok(['place-value', 'place-value-counters'].includes(family), `${family} should expose the aligned places`);
});

test('a pictogram does not silently discard a mathematically valid half-symbol value', () => {
  const two = render('pictogram', { values: { rows: [{ label: 'Apples', value: 2 }], key: 2, symbol: '●' } });
  const three = render('pictogram', { values: { rows: [{ label: 'Apples', value: 3 }], key: 2, symbol: '●' } });
  assert.notEqual(three, two, '3 with a key of 2 needs a partial symbol or a safe review state');
});

test('a pictogram rejects a remainder that cannot be represented by a valid partial symbol', () => {
  const validation = validateBuild2ModelRecipe(createBuild2ModelRecipe('pictogram', {
    values: { rows: [{ label: 'Apples', value: 1 }], key: 4, symbol: '●' },
  }));
  assert.equal(validation.valid, false);
});

test('angle comparators do not print the degree or classification pupils are meant to determine', () => {
  const html = render('angle-comparator', { values: { degrees: 120, showLabel: false, showRightReference: true } });
  assert.doesNotMatch(html, /120°/);
  assert.match(html, /Compare with a right angle/);
  const hidden = render('angle-comparator', { values: { degrees: 120, showLabel: true }, unknown: 'classification' });
  assert.doesNotMatch(hidden, /obtuse/);
  assert.match(hidden, />\?</);
});
