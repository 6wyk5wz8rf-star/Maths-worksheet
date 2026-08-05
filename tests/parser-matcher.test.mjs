import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractMathInfo,
  parseQuestions,
  readListMarker,
  splitQuestionAt
} from '../js/parser.js';
import {
  BUILD1_MODEL_FAMILIES,
  createModelRecipe,
  evaluateAnswerLeak,
  matchModels,
  matchQuestionToModels
} from '../js/matcher.js';
import { createModelRecipe as createRegisteredRecipe, validateRecipe } from '../js/model-registry.js';
import { renderModel } from '../js/model-renderers.js';

test('parses ten numbered questions into ten exact source cards', () => {
  const source = [
    '1. What is the value of 4 in 3,482?',
    '2) Partition 5,206.',
    '3. Compare 4,109 and 4,190.',
    '4. Calculate 3,482 + 2,109.',
    '5. Calculate 4,032 \u2212 1,875.',
    '6. There are 6 groups of 4 counters. How many altogether?',
    '7. Share 24 sweets equally between 6 children.',
    '8. Shade 3/4 of the fraction strip.',
    '9. Mark 350 on a number line from 300 to 400.',
    '10. Explain why a square is also a rectangle.'
  ].join('\n');
  const parsed = parseQuestions(source);

  assert.equal(parsed.questions.length, 10);
  assert.equal(parsed.originalText, source);
  assert.equal(parsed.questions[0].originalText, '1. What is the value of 4 in 3,482?');
  assert.equal(parsed.questions[0].displayText, 'What is the value of 4 in 3,482?');
  assert.equal(parsed.questions[9].sourceLabel, '10');
  for (const item of parsed.items) {
    assert.equal(source.slice(item.sourceRange.start, item.sourceRange.end), item.originalText);
  }
});

test('does not mistake decimals, thousands, times, currency, fractions or units for list markers', () => {
  for (const value of ['1.5 litres', '1,000 counters', '3:45 pm', '£1.25', '3/4', '2.4 km']) {
    assert.equal(readListMarker(value), null, value);
  }
  assert.equal(readListMarker('1. Calculate 1.5 + 2.25.')?.type, 'number');

  const parsed = parseQuestions([
    '1. A jug holds 1.5 litres and another holds 2.25 litres.',
    'How much water is there altogether?',
    '2. At 3:45 pm, Jo ran 2.4 km.',
    '3. A shop sold 1,000 pens for £1.25 each.',
    '4. Shade 3/4 of the strip.'
  ].join('\n'));
  assert.equal(parsed.questions.length, 4);
  assert.match(parsed.questions[0].originalText, /another holds 2\.25/);
});

test('blank lines split unnumbered questions while wrapped word problems remain joined', () => {
  const source = [
    'A coach has 48 seats.',
    'Six children sit in each row. How many rows are needed?',
    '',
    'Explain why zero is important in 4,005.'
  ].join('\n');
  const parsed = parseQuestions(source);
  assert.equal(parsed.questions.length, 2);
  assert.equal(parsed.questions[0].originalText,
    'A coach has 48 seats.\nSix children sit in each row. How many rows are needed?');
});

test('preserves lettered subparts as part of their numbered parent, including after a visual gap', () => {
  const source = [
    '1. Complete both parts:',
    '',
    '(a) Calculate 245 + 178.',
    '(b) Explain how you checked.',
    '2. Write the next number.'
  ].join('\n');
  const parsed = parseQuestions(source);
  assert.equal(parsed.questions.length, 2);
  assert.deepEqual(parsed.questions[0].subparts.map((part) => part.label), ['a', 'b']);
  assert.match(parsed.questions[0].originalText, /\(b\) Explain/);
});

test('recognises bullets, section headings, shared instructions and mark allocations', () => {
  const source = [
    'SECTION A: PLACE VALUE',
    'Answer all questions. Show your working.',
    '',
    '• Partition 3,482. [1 mark]',
    '• Explain the value of the zero. (2 marks)'
  ].join('\n');
  const parsed = parseQuestions(source);
  assert.equal(parsed.sections.length, 1);
  assert.equal(parsed.instructions.length, 1);
  assert.equal(parsed.questions.length, 2);
  assert.equal(parsed.questions[0].marks, 1);
  assert.equal(parsed.questions[1].marks, 2);
  assert.equal(parsed.questions[0].sectionId, parsed.sections[0].id);
  assert.equal(parsed.questions[0].sharedInstructionId, parsed.instructions[0].id);
});

test('preserves an explicit copied section label even without a blank line before it', () => {
  const source = [
    '1. Complete: □ × 7 = 56.',
    'Reasoning',
    '2. Explain how you know.',
    'Statistics',
    '3. Construct a bar chart.'
  ].join('\n');
  const parsed = parseQuestions(source);

  assert.deepEqual(parsed.sections.map((section) => section.displayText), ['Reasoning', 'Statistics']);
  assert.equal(parsed.questions.length, 3);
  assert.equal(parsed.questions[0].displayText, 'Complete: □ × 7 = 56.');
  assert.equal(parsed.questions[1].sectionId, parsed.sections[0].id);
  assert.equal(parsed.questions[2].sectionId, parsed.sections[1].id);
});

test('splitQuestionAt performs an exact reversible split and rejects invalid indexes', () => {
  const source = 'First line\nSecond line';
  const [first, second] = splitQuestionAt(source, 11);
  assert.equal(first + second, source);
  assert.equal(first, 'First line\n');
  assert.throws(() => splitQuestionAt(source, -1), RangeError);
  assert.throws(() => splitQuestionAt(source, 1.5), RangeError);
});

test('extracts mathematical quantities without importing structural numbers or marks', () => {
  const info = extractMathInfo('7. At 3:45, 1/2 of 1,000 kg was sold for £2.50. [2 marks]');
  assert.deepEqual(info.numericValues, [1000, 2.5]);
  assert.deepEqual(info.fractions.map(({ numerator, denominator }) => [numerator, denominator]), [[1, 2]]);
  assert.equal(info.times[0].value, '3:45');
  assert.deepEqual(info.units, ['kg']);
  assert.equal(info.marks, 2);
  assert.ok(!info.numericValues.includes(7));
  assert.ok(!info.numericValues.includes(2) || info.numericValues.filter((value) => value === 2).length === 0);
});

test('a spaced slash is a division operator while compact and explicit fraction forms remain fractions', () => {
  const division = extractMathInfo('What is 12 / 3?');
  const compactFraction = extractMathInfo('Shade 3/4 of the strip.');
  const explicitSpacedFraction = extractMathInfo('Find the fraction 3 / 4 of 20.');

  assert.deepEqual(division.fractions, []);
  assert.deepEqual(division.numericValues, [12, 3]);
  assert.ok(division.operations.includes('division'));
  assert.deepEqual(compactFraction.fractions.map(({ numerator, denominator }) => [numerator, denominator]), [[3, 4]]);
  assert.deepEqual(explicitSpacedFraction.fractions.map(({ numerator, denominator }) => [numerator, denominator]), [[3, 4]]);
});

test('each only signals multiplication when its clause contains a repeated quantity', () => {
  const instruction = extractMathInfo('Put <, > or = between each pair: 3,405 ___ 3,450.');
  const repeatedQuantity = extractMathInfo('There are 6 bags with 8 apples in each bag. How many apples are there altogether?');

  assert.equal(instruction.operations.includes('multiplication'), false);
  assert.deepEqual(repeatedQuantity.operations, ['multiplication']);
  assert.equal(matchQuestionToModels(repeatedQuantity).provisionalRecipe?.family, 'equal-groups');
});

test('short unit symbols never consume the beginning of ordinary words', () => {
  const more = extractMathInfo('What is 100 more than 3,506?');
  const less = extractMathInfo('What is 1,000 less than 7,230?');

  assert.deepEqual(more.units, []);
  assert.deepEqual(less.units, []);
});

test('time extraction retains meridiem and normalises it for exact duration arithmetic', () => {
  const info = extractMathInfo('How long is it from 11:30 am to 1:00 pm?');

  assert.equal(info.times[0].meridiem, 'am');
  assert.equal(info.times[0].hours, 11);
  assert.equal(info.times[1].meridiem, 'pm');
  assert.equal(info.times[1].sourceHours, 1);
  assert.equal(info.times[1].hours, 13);
});

test('exports exactly the ten Build 1 family identifiers', () => {
  assert.deepEqual(BUILD1_MODEL_FAMILIES, [
    'place-value', 'base-ten', 'partition', 'number-line', 'part-whole',
    'comparison-bar', 'equal-groups', 'column-arithmetic', 'area-model', 'fraction-strip'
  ]);
});

test('matches a four-digit digit-value question to a populated place-value recipe', () => {
  const result = matchModels('What is the value of 4 in 3,482?');
  assert.equal(result.confidence, 'high');
  assert.equal(result.suggestions[0].family, 'place-value');
  assert.equal(result.provisionalRecipe.family, 'place-value');
  assert.equal(result.provisionalRecipe.values.number, 3482);
  assert.deepEqual(result.provisionalRecipe.values.digits.map((entry) => entry.digit), [3, 4, 8, 2]);
});

test('matches explicit base-ten and partition tasks without fabricating a solution', () => {
  const base = matchModels('Use Dienes blocks to represent 2,304.');
  assert.equal(base.suggestions[0].family, 'base-ten');
  assert.equal(base.provisionalRecipe.values.thousands, 2);
  assert.equal(base.provisionalRecipe.values.hundreds, 3);
  assert.equal(base.provisionalRecipe.values.tens, 0);
  assert.equal(base.provisionalRecipe.values.ones, 4);

  const partition = matchModels('Partition 5,206.');
  assert.equal(partition.suggestions[0].family, 'partition');
  assert.deepEqual(partition.provisionalRecipe.values.parts, [5000, 200, 6]);
});

test('number-line recipes preserve consistent intervals', () => {
  const result = matchModels('Mark 350 on a number line from 300 to 400.');
  const recipe = result.suggestions[0].recipe;
  assert.equal(recipe.family, 'number-line');
  assert.equal(recipe.values.start, 300);
  assert.equal(recipe.values.end, 400);
  assert.equal(recipe.values.ticks.length, recipe.values.divisions + 1);
  const differences = recipe.values.ticks.slice(1)
    .map((tick, index) => Number((tick - recipe.values.ticks[index]).toFixed(8)));
  assert.ok(differences.every((difference) => difference === differences[0]));
});

test('mixed fraction location lines retain exact endpoints, intervals and a blank pupil target', () => {
  const source = 'Place 2 3/5 on a number line from 2 to 3 divided into fifths.';
  const info = extractMathInfo(source);
  assert.deepEqual(info.fractions.map((fraction) => ({ raw: fraction.raw, value: fraction.value, mixed: fraction.mixed })), [
    { raw: '2 3/5', value: 2.6, mixed: true },
  ]);
  assert.deepEqual(info.numericValues, [2, 3]);
  const result = matchModels(info);
  const recipe = result.suggestions[0].recipe;
  assert.equal(result.interpretation.questionFamily, 'locate-on-number-line');
  assert.equal(recipe.family, 'number-line');
  assert.deepEqual(recipe.values.ticks, [2, 2.2, 2.4, 2.6, 2.8, 3]);
  assert.deepEqual(recipe.values.markers, [{ value: 2.6, label: '2 3/5' }]);
  assert.equal(recipe.unknown, 'marker:0');
  assert.equal(recipe.purpose, 'response-model');

  const registered = createRegisteredRecipe('number-line', recipe);
  assert.equal(validateRecipe(registered).valid, true);
  const pupil = renderModel(registered);
  assert.match(pupil, /viewBox="0 0 900 120"/);
  assert.doesNotMatch(pupil, /<circle\b/, 'The pupil must choose the point instead of tracing a pre-positioned marker.');
  assert.doesNotMatch(pupil, />2\.6<|>2\.4<|>2\.8</);
  const teacher = renderModel({ ...registered, completionState: 'completed', purpose: 'thinking-model', unknown: null });
  assert.match(teacher, /<circle\b/);
  assert.match(teacher, />2\.6</);
});

test('mixed-fraction ordering keeps the complete 2 to 3 quarter scale without inventing markers', () => {
  const result = matchModels('Order 2 1/4, 2 3/4 and 2 1/2 by position on a number line.');
  const recipe = result.suggestions[0].recipe;
  assert.equal(recipe.family, 'number-line');
  assert.deepEqual(recipe.values, {
    start: 2,
    end: 3,
    divisions: 4,
    step: 0.25,
    ticks: [2, 2.25, 2.5, 2.75, 3],
    points: [],
    markers: [],
  });
  assert.equal(recipe.purpose, 'response-model');
});

test('distinguishes additive part-whole and comparison bar relationships', () => {
  const additive = matchModels('Mia has 245 red beads and 178 blue beads. How many beads altogether?');
  assert.equal(additive.suggestions[0].family, 'part-whole');
  assert.deepEqual(additive.suggestions[0].recipe.values.parts, [245, 178]);
  assert.equal(additive.suggestions[0].recipe.values.whole, null);

  const comparison = matchModels('Aisha has 342 stickers. Ben has 278. How many more does Aisha have?');
  assert.equal(comparison.suggestions[0].family, 'comparison-bar');
  assert.deepEqual(comparison.suggestions[0].recipe.values.quantities, [342, 278]);
  assert.equal(comparison.suggestions[0].recipe.values.proportional, true);
});

test('distinguishes sharing, grouping and ambiguous symbolic division', () => {
  const sharing = matchModels('24 sweets are shared equally between 6 children. How many does each receive?');
  assert.equal(sharing.suggestions[0].family, 'sharing-division');
  assert.equal(sharing.suggestions[0].recipe.values.total, 24);
  assert.equal(sharing.suggestions[0].recipe.values.groups, 6);
  assert.equal(sharing.suggestions[0].recipe.unknown, 'group-size');

  const grouping = matchModels('How many groups of 6 can be made from 48 counters?');
  assert.equal(grouping.suggestions[0].family, 'grouping-division');
  assert.equal(grouping.suggestions[0].recipe.values.total, 48);
  assert.equal(grouping.suggestions[0].recipe.values.groupSize, 6);
  assert.equal(grouping.suggestions[0].recipe.unknown, 'group-count');

  const ambiguous = matchModels('Calculate 48 ÷ 6.');
  assert.equal(ambiguous.confidence, 'medium');
  assert.match(ambiguous.clarification, /sharing.*groups|groups.*sharing/i);
  assert.equal(ambiguous.provisionalRecipe, null);
});

test('column arithmetic recipes preserve place-value alignment and do not derive an answer', () => {
  const result = matchModels('Use column subtraction with exchange to calculate 4,032 − 1,875.');
  const recipe = result.suggestions[0].recipe;
  assert.equal(recipe.family, 'column-arithmetic');
  assert.equal(recipe.variant, 'subtraction');
  assert.deepEqual(recipe.values.operands, [4032, 1875]);
  assert.equal(recipe.values.columns.wholeDigits, 4);
  assert.equal(recipe.values.alignment, 'place-value');
  assert.equal(recipe.values.result, null);
});

test('rows and columns select an equal-cell area model', () => {
  const result = matchModels('Draw an array with 6 rows and 4 columns.');
  assert.equal(result.suggestions[0].family, 'area-model');
  assert.deepEqual(result.suggestions[0].recipe.values,
    { rows: 6, columns: 4, product: null, equalCells: true });
});

test('multiplicative altogether wording stays equal-groups rather than becoming an additive bar', () => {
  const match = matchQuestionToModels('There are 6 bags with 8 apples in each bag. How many apples are there altogether?', { intent: 'practice' });
  assert.equal(match.suggestions[0].family, 'equal-groups');
  assert.equal(match.provisionalRecipe?.family, 'equal-groups');
});

test('fraction comparisons use an exact fraction number line while fraction strips remain valid', () => {
  const result = matchModels('Which is greater, 3/4 or 2/3? Use fraction strips.');
  const recipe = result.suggestions[0].recipe;
  assert.equal(recipe.family, 'fraction-number-line');
  assert.equal(recipe.values.denominator, 4);
  assert.equal(recipe.values.maxWhole, 1);

  const invalid = matchModels('Show the fraction 3/0.');
  assert.equal(invalid.suggestions.length, 0);
  assert.equal(invalid.noModelRecommended, true);
  assert.match(invalid.warnings.join(' '), /undefined fraction/i);
  assert.equal(createModelRecipe('fraction-strip', extractMathInfo('3/0')), null);
});

test('keeps no-model visible for out-of-coverage reasoning', () => {
  const result = matchQuestionToModels('Explain why every square is also a rectangle.');
  assert.equal(result.confidence, 'low');
  assert.equal(result.suggestions.length, 0);
  assert.equal(result.noModelRecommended, true);
  assert.equal(result.noModelOption.label, 'No model');
});

test('never returns more than three suggestions', () => {
  const result = matchModels('Use an array and a number line to show 6 groups of 4, then find the total.');
  assert.ok(result.suggestions.length <= 3);
});

test('assessment mode withholds a structure-revealing automatic attachment', () => {
  const result = matchModels('Calculate 4,532 + 2,109.', { intent: 'assessment' });
  assert.equal(result.suggestions[0].family, 'column-arithmetic');
  assert.equal(result.provisionalRecipe, null);
  assert.equal(result.suggestions[0].answerRevealRisk, 'medium');
  assert.match(result.warnings.join(' '), /reveal the operation|solution structure/i);
});

test('completed assessment models trigger a clear answer-leak warning', () => {
  const result = matchModels('Complete the fraction strip to show 3/4.', {
    intent: 'assessment', completionState: 'completed'
  });
  assert.equal(result.provisionalRecipe, null);
  assert.equal(result.suggestions[0].answerRevealRisk, 'high');
  assert.match(result.warnings.join(' '), /completed model may reveal an answer/i);

  const leak = evaluateAnswerLeak(result.suggestions[0].recipe, { intent: 'assessment' });
  assert.equal(leak.risk, 'high');
});

test('a mark allocation never turns an ordinary model into a pupil response model', () => {
  const match = matchQuestionToModels('What is the value of the digit 4 in 3,482? [1 mark]', { intent: 'practice' });
  assert.equal(match.suggestions[0].family, 'place-value');
  assert.equal(match.suggestions[0].recipe.purpose, 'thinking-model');
});

test('a blank explicitly requested response model can remain safe in assessment', () => {
  const result = matchModels('Complete the fraction strip to show 3/4.', { intent: 'assessment' });
  assert.equal(result.confidence, 'high');
  assert.equal(result.provisionalRecipe.family, 'fraction-strip');
  assert.equal(result.provisionalRecipe.completionState, 'blank');
  assert.equal(result.provisionalRecipe.purpose, 'response-model');
});

test('does not automatically duplicate a representation referenced in the source', () => {
  const result = matchModels('Use the number line shown below to mark 350 between 300 and 400.');
  assert.equal(result.provisionalRecipe, null);
  assert.equal(result.noModelRecommended, true);
  assert.match(result.warnings.join(' '), /duplicate model/i);
});

test('common referenced visuals fail closed instead of creating demonstration data', () => {
  const sources = [
    'What time does this clock show?',
    'Use the table to answer the question. How many children chose red?',
    'The pictogram shows favourite pets. How many children chose cats?',
    'What fraction of this shape is shaded?',
    'What time is shown?',
    'What time is it?',
    'What fraction is shaded?',
    'Complete the table.',
    'Use the information in the table to find the total.',
  ];

  for (const source of sources) {
    const info = extractMathInfo(source);
    const result = matchQuestionToModels(info);
    assert.equal(info.hasExistingRepresentation, true, source);
    assert.equal(result.interpretation.status, 'needs-referenced-visual', source);
    assert.equal(result.provisionalRecipe, null, source);
    assert.equal(result.noModelRecommended, true, source);
    assert.deepEqual(result.suggestions, [], source);
  }
});

test('a sharing remainder question uses an exact protected sharing model', () => {
  const source = 'Share 27 sweets equally between 4 children. How many are left over?';
  const info = extractMathInfo(source);
  const result = matchQuestionToModels(info);

  assert.deepEqual(info.operations, ['division']);
  assert.equal(info.divisionInterpretation, 'sharing');
  assert.equal(result.interpretation.status, 'resolved');
  assert.equal(result.interpretation.mathematicalStructure.unknownPosition, 'remainder');
  assert.equal(result.provisionalRecipe?.family, 'sharing-division');
  assert.equal(result.provisionalRecipe?.values.total, 27);
  assert.equal(result.provisionalRecipe?.values.groups, 4);
  assert.equal(result.provisionalRecipe?.unknown, 'remainder');
  assert.ok(result.provisionalRecipe?.hidden.includes('remainder'));

  const validation = validateRecipe(result.provisionalRecipe);
  assert.equal(validation.valid, true);
  const pupil = renderModel(validation.normalizedRecipe);
  assert.equal((pupil.match(/<circle\b/g) ?? []).length, 24);
  assert.match(pupil, /leftover \?/);
  assert.doesNotMatch(pupil, /leftover 3/);
});

test('low-confidence or compound readings never become automatic models', () => {
  const sources = [
    'Use 100 and 3,506. What could the answer be?',
    'There are 32 children. They sit at tables of 6. How many tables are needed?',
    'There are 5 boxes. Each box holds 8 pencils. Then 7 pencils are used. How many remain?',
  ];
  const rank = { low: 0, medium: 1, high: 2 };

  for (const source of sources) {
    const result = matchQuestionToModels(source);
    assert.ok(rank[result.confidence] <= rank[result.interpretation.confidence], source);
    assert.equal(result.interpretation.needsReview, true, source);
    assert.equal(result.provisionalRecipe, null, source);
    assert.equal(result.noModelRecommended, true, source);
  }
  assert.notEqual(matchQuestionToModels(sources[1]).suggestions[0]?.family, 'bar-chart');
});

test('direct more-or-less transformations use a truthful change model', () => {
  const increase = matchQuestionToModels('What is 100 more than 3,506?');
  const decrease = matchQuestionToModels('What is 1,000 less than 7,230?');

  assert.equal(increase.provisionalRecipe?.family, 'change-bar');
  assert.equal(increase.interpretation.status, 'resolved');
  assert.deepEqual(increase.provisionalRecipe?.values, {
    start: 3506, change: 100, result: 3606, direction: 'increase', greater: 3506, lesser: 100,
  });
  assert.equal(increase.provisionalRecipe?.unknown, 'result');
  assert.equal(decrease.provisionalRecipe?.family, 'change-bar');
  assert.equal(decrease.provisionalRecipe?.values.start, 7230);
  assert.equal(decrease.provisionalRecipe?.values.change, -1000);
  assert.equal(decrease.provisionalRecipe?.values.result, 6230);
  assert.equal(decrease.provisionalRecipe?.unknown, 'result');
});
