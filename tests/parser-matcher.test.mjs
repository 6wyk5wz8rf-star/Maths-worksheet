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
