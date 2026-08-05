import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addRationals,
  analyseQuestion,
  divideRationals,
  durationMinutes,
  formatPence,
  isModelContraindicated,
  parseMoneyToPence,
  parseNumberLinePrompt,
  parseRational,
  parseSimpleEquation,
  parseTimeToMinutes,
  rankModelRecommendations,
  rationalToString,
  roundingBounds,
  subtractRationals,
} from '../js/question-intelligence.js';
import { matchQuestionToModels } from '../js/matcher.js';
import { validateRecipe } from '../js/model-registry.js';
import { parseQuestions } from '../js/parser.js';

test('rational helpers keep Year 4 fractions exact instead of using decimal arithmetic', () => {
  assert.deepEqual(parseRational('1.25'), { numerator: 5, denominator: 4 });
  assert.deepEqual(addRationals('1/3', '1/6'), { numerator: 1, denominator: 2 });
  assert.deepEqual(subtractRationals('3/4', '1/6'), { numerator: 7, denominator: 12 });
  assert.equal(rationalToString(divideRationals('3/5', '9/10')), '2/3');
  assert.equal(parseRational('3/0'), null);
});

test('fraction locations are read as exact number-line tasks rather than generic word problems', () => {
  const examples = [
    ['Place 1 1/4 on a number line from 1 to 2 divided into quarters.', 1, 2, 4, 1.25],
    ['Place 2 3/5 on a number line from 2 to 3 divided into fifths.', 2, 3, 5, 2.6],
    ['Place 4 7/8 on a number line from 4 to 5 divided into eighths.', 4, 5, 8, 4.875],
  ];
  for (const [source, start, end, divisions, target] of examples) {
    assert.deepEqual(parseNumberLinePrompt(source), { start, end, divisions, step: (end - start) / divisions, target });
    const interpretation = analyseQuestion(source);
    assert.equal(interpretation.questionFamily, 'locate-on-number-line');
    assert.deepEqual(interpretation.mathematicalStructure.scale, { start, end, divisions, target });
    assert.ok(interpretation.answerProtection.prohibitedAutoFill.includes('line-position'));
    assert.equal(rankModelRecommendations(interpretation).recommendations[0].family, 'number-line');
    const matched = matchQuestionToModels(source);
    assert.equal(matched.provisionalRecipe?.family, 'number-line');
  }
});

test('mixed-number endpoints and targets retain one exact supplied scale', () => {
  const source = 'Place 1 3/4 on a number line from 1 1/2 to 2 1/2 divided into quarters.';
  assert.deepEqual(parseNumberLinePrompt(source), {
    start: 1.5,
    end: 2.5,
    divisions: 4,
    step: 0.25,
    target: 1.75,
  });

  const matched = matchQuestionToModels(source);
  assert.equal(matched.provisionalRecipe?.family, 'number-line');
  assert.deepEqual(matched.provisionalRecipe.values.ticks, [1.5, 1.75, 2, 2.25, 2.5]);
  assert.deepEqual(matched.provisionalRecipe.values.markers, [{ value: 1.75, label: '1 3/4' }]);
});

test('digit-value and error-analysis wording retain their actual task families', () => {
  assert.equal(analyseQuestion('What is the value of the digit 4 in 3,482?').questionFamily, 'identify-place-value');
  const source = 'A pupil places 2 1/3 before 2 on a number line. Explain the error.';
  const error = analyseQuestion(source);
  assert.equal(error.questionFamily, 'find-error');
  assert.equal(error.answerProtection.preserveSourceError, true);
  const matched = matchQuestionToModels(source);
  assert.equal(matched.provisionalRecipe, null);
  assert.equal(matched.noModelRecommended, true);
  assert.match(matched.warnings[0], /preserved/i);
});

test('fraction distance questions retain their benchmark and candidates on one exact scale', () => {
  const source = 'Which is closer to 3: 3 1/5 or 3 4/5?';
  const interpretation = analyseQuestion(source);
  const matched = matchQuestionToModels(source);
  assert.equal(interpretation.questionFamily, 'compare-fractions');
  assert.equal(matched.suggestions[0].family, 'number-line');
  const normalized = validateRecipe(matched.provisionalRecipe);
  assert.equal(normalized.valid, true);
  assert.deepEqual(normalized.normalizedRecipe.values, {
    start: 3,
    end: 4,
    divisions: 5,
    interval: 0.2,
    step: 0.2,
    ticks: [3, 3.2, 3.4, 3.6, 3.8, 4],
    points: [3, 3.2, 3.4, 3.6, 3.8, 4],
    markers: [
      { value: 3.2, label: '3 1/5' },
      { value: 3.8, label: '3 4/5' },
    ],
  });
});

test('money and time helpers use exact pence and valid minute arithmetic', () => {
  assert.equal(parseMoneyToPence('£3.45'), 345);
  assert.equal(parseMoneyToPence('2 pounds and 5p'), 205);
  assert.equal(parseMoneyToPence('45p'), 45);
  assert.equal(formatPence(7), '£0.07');
  assert.equal(parseTimeToMinutes('3:45 pm'), 945);
  assert.equal(durationMinutes('09:40', '11:05'), 85);
  assert.equal(durationMinutes('23:50', '00:10'), null);
  assert.equal(durationMinutes('23:50', '00:10', { allowNextDay: true }), 20);
});

test('equations distinguish every unknown position and retain derived answers privately', () => {
  const factor = parseSimpleEquation('□ × 7 = 56');
  assert.equal(factor.unknownPosition, 'first-factor');
  assert.equal(factor.privateDerivedAnswer, 8);

  const difference = parseSimpleEquation('1,204 − □ = 729');
  assert.equal(difference.unknownPosition, 'subtrahend');
  assert.equal(difference.privateDerivedAnswer, 475);

  const reversed = parseSimpleEquation('48 = 6 × □');
  assert.equal(reversed.unknownPosition, 'second-factor');
  assert.equal(reversed.privateDerivedAnswer, 8);

  const quotient = parseSimpleEquation('□ ÷ 8 = 7');
  assert.equal(quotient.unknownPosition, 'dividend');
  assert.equal(quotient.privateDerivedAnswer, 56);
});

test('rounding analysis calculates accurate boundaries and protects the rounded answer', () => {
  assert.deepEqual(roundingBounds(3462, 100), {
    lower: 3400,
    upper: 3500,
    midpoint: 3450,
    magnitude: 100,
    target: 3462,
  });
  const interpretation = analyseQuestion('Round 3,462 to the nearest hundred.');
  assert.equal(interpretation.curriculumDomain, 'Number and place value');
  assert.equal(interpretation.questionFamily, 'round');
  assert.equal(interpretation.mathematicalStructure.rounding.midpoint, 3450);
  assert.ok(interpretation.answerProtection.prohibitedAutoFill.includes('rounded-value'));
  assert.equal(rankModelRecommendations(interpretation).recommendations[0].family, 'rounding-number-line');
});

test('numeric rounding magnitudes with thousands separators retain exact boundaries', () => {
  const interpretation = analyseQuestion('Round 3,450 to the nearest 1,000.');

  assert.deepEqual(interpretation.mathematicalStructure.rounding, {
    lower: 3000,
    upper: 4000,
    midpoint: 3500,
    magnitude: 1000,
    target: 3450,
  });
  assert.equal(rankModelRecommendations(interpretation).recommendations[0].family, 'rounding-number-line');
});

test('rounding identifies target and magnitude by role rather than source order', () => {
  const leadingMagnitude = analyseQuestion('To the nearest 100, round 3,462.');
  assert.deepEqual(leadingMagnitude.mathematicalStructure.rounding, {
    lower: 3400,
    upper: 3500,
    midpoint: 3450,
    magnitude: 100,
    target: 3462,
  });
  assert.equal(matchQuestionToModels('To the nearest 100, round 3,462.').provisionalRecipe?.family, 'rounding-number-line');

  const batchSource = 'Round each number to the nearest 10: 36, 74 and 128.';
  const batch = analyseQuestion(batchSource);
  const batchMatch = matchQuestionToModels(batchSource);
  assert.deepEqual(batch.mathematicalStructure.roundingTargets, [36, 74, 128]);
  assert.equal(batch.mathematicalStructure.rounding, null);
  assert.equal(batch.needsReview, true);
  assert.equal(batchMatch.provisionalRecipe, null);
  assert.equal(batchMatch.noModelRecommended, true);
});

test('times tables and transformation wording do not become statistics or money', () => {
  const timesTable = analyseQuestion('Write the next three numbers in the 4 times table.');
  const fractionChange = analyseQuestion('Change 3/4 into a decimal.');
  const measureChange = analyseQuestion('Change 250 cm to metres.');

  assert.equal(timesTable.curriculumDomain, 'Multiplication');
  assert.notEqual(rankModelRecommendations(timesTable).recommendations[0]?.family, 'tally-frequency-table');
  assert.notEqual(fractionChange.curriculumDomain, 'Money');
  assert.notEqual(rankModelRecommendations(fractionChange).recommendations[0]?.family, 'money');
  assert.notEqual(measureChange.curriculumDomain, 'Money');
  assert.notEqual(rankModelRecommendations(measureChange).recommendations[0]?.family, 'money');
});

test('explicit pupil-created clocks, charts and comparison signs are resolved confidently', () => {
  const prompts = [
    ['Draw the hands to show 3:45.', 'draw-hands', 'clock-model'],
    ['Draw the hands to show quarter to four.', 'draw-hands', 'clock-model'],
    ['Draw a bar chart to show 4 red, 6 blue and 3 green votes.', 'construct-chart', 'bar-chart'],
    ['Put <, > or = between each pair: 3,405 ___ 3,450.', 'compare', 'ordering-comparison-line'],
  ];

  for (const [source, family, model] of prompts) {
    const interpretation = analyseQuestion(source);
    const matched = matchQuestionToModels(source);
    assert.equal(interpretation.questionFamily, family, source);
    assert.equal(interpretation.confidence, 'high', source);
    assert.equal(interpretation.status, 'resolved', source);
    assert.equal(matched.provisionalRecipe?.family, model, source);
  }
  const wordTime = matchQuestionToModels(prompts[1][0]).provisionalRecipe;
  assert.deepEqual(wordTime.values, { hour: 3, minute: 45, showHands: true, showDigital: false });
  assert.equal(wordTime.unknown, 'hands');
  assert.ok(wordTime.hidden.includes('hands'));
  const unspecifiedTime = matchQuestionToModels('Draw the hands to show the time.');
  assert.equal(unspecifiedTime.interpretation.needsReview, true);
  assert.equal(unspecifiedTime.provisionalRecipe, null);
  assert.equal(unspecifiedTime.noModelRecommended, true);
  const chart = matchQuestionToModels(prompts[2][0]).provisionalRecipe;
  assert.deepEqual(chart.values.rows, [
    { label: 'Red', value: 4 },
    { label: 'Blue', value: 6 },
    { label: 'Green', value: 3 },
  ]);
  assert.equal(chart.values.max, 10);
  assert.ok(chart.hidden.includes('all'));
  const missingChartData = matchQuestionToModels('Draw a bar chart to show the data.');
  assert.equal(missingChartData.provisionalRecipe, null);
  assert.equal(missingChartData.noModelRecommended, true);
  assert.deepEqual(matchQuestionToModels(prompts[3][0]).provisionalRecipe.values.numbers, [3405, 3450]);
});

test('spaced slash division and am/pm durations retain their intended mathematics', () => {
  const division = analyseQuestion('What is 12 / 3?');
  const duration = analyseQuestion('How long is it from 11:30 am to 1:00 pm?');
  const durationMatch = matchQuestionToModels('How long is it from 11:30 am to 1:00 pm?');

  assert.equal(division.curriculumDomain, 'Division');
  assert.equal(division.questionFamily, 'calculate');
  assert.deepEqual(division.numericalCharacteristics.fractions, []);
  assert.equal(duration.mathematicalStructure.measurement.durationMinutes, 90);
  assert.equal(durationMatch.suggestions[0].family, 'duration-timeline');
  assert.equal(durationMatch.suggestions[0].recipe.values.startMinutes, 690);
  assert.equal(durationMatch.suggestions[0].recipe.values.endMinutes, 780);
});

test('comparison subtraction puts the unknown smaller quantity in the correct bar-model position', () => {
  const interpretation = analyseQuestion('Mia has 846 stickers. Noah has 279 fewer. How many stickers does Noah have?');
  assert.equal(interpretation.curriculumDomain, 'Subtraction');
  assert.equal(interpretation.questionFamily, 'compare');
  assert.deepEqual(interpretation.mathematicalStructure.comparison, {
    greater: 846,
    lesser: null,
    difference: 279,
    type: 'reduction-or-comparison',
  });
  assert.equal(interpretation.mathematicalStructure.unknownPosition, 'smaller-quantity');
  assert.equal(rankModelRecommendations(interpretation).recommendations[0].family, 'comparison-bar');
});

test('a fewer-than comparison is independent of which named quantity appears first', () => {
  const first = analyseQuestion('Amy has 17 fewer stickers than Ben. Ben has 42 stickers. How many stickers does Amy have?');
  const second = analyseQuestion('Ben has 42 stickers. Amy has 17 fewer stickers than Ben. How many stickers does Amy have?');
  const expected = {
    greater: 42,
    lesser: null,
    difference: 17,
    type: 'reduction-or-comparison',
  };

  assert.deepEqual(first.mathematicalStructure.comparison, expected);
  assert.deepEqual(second.mathematicalStructure.comparison, expected);
  for (const source of [first.sourceText, second.sourceText]) {
    const recipe = matchQuestionToModels(source).suggestions[0]?.recipe;
    assert.equal(recipe.family, 'comparison-bar');
    assert.equal(recipe.values.greater, 42);
    assert.equal(recipe.values.lesser, 25);
    assert.equal(recipe.values.difference, 17);
  }
});

test('a teacher correction changes the structural recommendation without rewriting the question', () => {
  const source = 'Mia has 846 stickers. Noah has 279 fewer. How many stickers does Noah have?';
  const automatic = analyseQuestion(source);
  const calculation = analyseQuestion(source, { questionFamily: 'calculate', operation: 'subtraction' });
  const forcedComparison = analyseQuestion('Calculate 846 − 279.', { questionFamily: 'compare', operation: 'subtraction' });

  assert.ok(automatic.mathematicalStructure.comparison);
  assert.equal(calculation.mathematicalStructure.comparison, null);
  assert.notEqual(rankModelRecommendations(calculation).recommendations[0].family, 'comparison-bar');
  assert.equal(rankModelRecommendations(forcedComparison).recommendations[0].family, 'comparison-bar');
});

test('fraction-of-quantity analysis retains the equal-part structure without exposing the result', () => {
  const interpretation = analyseQuestion('Find three fifths of 20.');
  assert.equal(interpretation.curriculumDomain, 'Fractions');
  assert.equal(interpretation.mathematicalStructure.numerator, 3);
  assert.equal(interpretation.mathematicalStructure.denominator, 5);
  assert.equal(interpretation.mathematicalStructure.whole, 20);
  assert.equal(interpretation.mathematicalStructure.unknownPosition, 'fraction-of-quantity-result');
  assert.ok(interpretation.answerProtection.prohibitedAutoFill.includes('fraction-of-quantity-result'));
  assert.equal(rankModelRecommendations(interpretation).recommendations[0].family, 'fraction-quantity-bar');
});

test('perimeter is routed to a boundary model and rules out an area model', () => {
  const interpretation = analyseQuestion('A rectangle is 8 cm long and 4 cm wide. Find its perimeter.');
  assert.equal(interpretation.curriculumDomain, 'Perimeter');
  assert.equal(interpretation.questionFamily, 'find-perimeter');
  assert.deepEqual(interpretation.mathematicalStructure.measurement, { length: 8, width: 4, unit: 'cm' });
  assert.equal(rankModelRecommendations(interpretation).recommendations[0].family, 'perimeter-trace');
  assert.equal(isModelContraindicated('area-model', interpretation), true);
});

test('error-analysis preserves the misconception rather than silently correcting it', () => {
  const interpretation = analyseQuestion('Sam says 4,060 is greater than 4,600 because 6 is greater than 0. Explain the mistake.');
  assert.equal(interpretation.questionFamily, 'find-error');
  assert.equal(interpretation.answerProtection.preserveSourceError, true);
  assert.ok(interpretation.answerProtection.prohibitedAutoFill.includes('correction'));
  assert.equal(interpretation.representationPurpose, 'support-reasoning-or-proof');
});

test('correctness claims are preserved for review instead of becoming model dimensions', () => {
  const source = 'Ava says the perimeter is 24 cm. Is she correct? Explain.';
  const interpretation = analyseQuestion(source);
  const matched = matchQuestionToModels(source);

  assert.equal(interpretation.questionFamily, 'find-error');
  assert.equal(interpretation.answerProtection.preserveSourceError, true);
  assert.equal(interpretation.needsReview, true);
  assert.equal(matched.provisionalRecipe, null);
  assert.equal(matched.noModelRecommended, true);
});

test('chart construction and clock drawing protect pupil-created visual information', () => {
  const chart = analyseQuestion('Draw a bar chart to show the data.');
  assert.equal(chart.questionFamily, 'construct-chart');
  assert.ok(chart.answerProtection.prohibitedAutoFill.includes('chart-data'));
  assert.equal(rankModelRecommendations(chart).recommendations[0].family, 'bar-chart');

  const tableToBarChart = analyseQuestion('Use the table to construct a bar chart for Apples 6, Pears 4 and Plums 8.');
  assert.equal(rankModelRecommendations(tableToBarChart).recommendations[0].family, 'bar-chart');

  const clock = analyseQuestion('Draw the hands on a clock to show 3:45.');
  assert.equal(clock.curriculumDomain, 'Time');
  assert.ok(clock.answerProtection.prohibitedAutoFill.includes('clock-hands'));
});

test('matcher delegates to the new interpretation layer while retaining a current, renderable fallback', () => {
  const match = matchQuestionToModels('Round 3,462 to the nearest hundred.');
  assert.equal(match.interpretation.questionFamily, 'round');
  assert.equal(match.suggestions[0].family, 'rounding-number-line');
  assert.equal(match.suggestions[0].idealFamily, 'rounding-number-line');
  assert.ok(match.extracted.interpretation.answerProtection.prohibitedAutoFill.includes('rounded-value'));
});

test('interval-sized number lines retain their exact supplied scale', () => {
  const source = 'Mark 275 on a number line from 250 to 300 in intervals of 5.';
  assert.deepEqual(parseNumberLinePrompt(source), {
    start: 250,
    end: 300,
    divisions: 10,
    step: 5,
    target: 275,
  });
  const match = matchQuestionToModels(source);
  assert.deepEqual(match.provisionalRecipe?.values.ticks, [250, 255, 260, 265, 270, 275, 280, 285, 290, 295, 300]);
  assert.deepEqual(match.provisionalRecipe?.values.markers, [{ value: 275, label: '275' }]);
});

test('an integer target and endpoints derive the smallest exact equal-interval scale', () => {
  const source = 'Mark 2,750 on a number line from 2,000 to 3,000.';
  assert.deepEqual(parseNumberLinePrompt(source), {
    start: 2000,
    end: 3000,
    divisions: 4,
    step: 250,
    target: 2750,
  });
  const match = matchQuestionToModels(source);
  assert.equal(match.confidence, 'high');
  assert.equal(match.provisionalRecipe?.family, 'number-line');
  assert.deepEqual(match.provisionalRecipe?.values.ticks, [2000, 2250, 2500, 2750, 3000]);
  assert.equal(match.provisionalRecipe?.unknown, 'marker:0');
  assert.equal(match.provisionalRecipe?.purpose, 'response-model');
});

test('fraction addition cannot be reinterpreted as division by a slash', () => {
  const source = 'Complete: 3/4 + 1/4 = ___.';
  assert.equal(parseSimpleEquation(source), null);
  const interpretation = analyseQuestion(source);
  assert.equal(interpretation.curriculumDomain, 'Fractions');
  assert.notEqual(interpretation.equation?.operator, 'division');
  assert.notEqual(matchQuestionToModels(source).suggestions[0]?.family, 'equation-balance');
});

test('mixed-number equalities stop for review instead of losing the whole number', () => {
  const match = matchQuestionToModels('Complete: 1 1/2 = □/2.');
  assert.equal(match.interpretation.status, 'compound');
  assert.equal(match.interpretation.needsReview, true);
  assert.equal(match.provisionalRecipe, null);
});

test('explicit am and pm allow a truthful next-day duration', () => {
  for (const source of [
    'How long is it from 11:50 pm to 12:10 am?',
    'How long is it from 23:50 to 00:10?',
  ]) {
    const interpretation = analyseQuestion(source);
    assert.equal(interpretation.mathematicalStructure.measurement.durationMinutes, 20, source);
    assert.equal(interpretation.mathematicalStructure.measurement.crossesMidnight, true, source);
    const recipe = matchQuestionToModels(source).provisionalRecipe;
    assert.equal(recipe?.values.startMinutes, 1430, source);
    assert.equal(recipe?.values.endMinutes, 1450, source);
  }
});

test('a proportional calculation binds source values rather than model defaults', () => {
  for (const source of [
    'Calculate 3 times as many as 12.',
    'Amy has 12 stickers. Ben has 3 times as many as Amy. How many stickers does Ben have?',
    'A ribbon is three times as long as a 12 cm ribbon. How long is it?',
  ]) {
    const match = matchQuestionToModels(source);
    assert.equal(match.provisionalRecipe?.family, 'scaling-bar', source);
    assert.equal(match.provisionalRecipe?.values.original, 12, source);
    assert.equal(match.provisionalRecipe?.values.multiplier, 3, source);
    assert.equal(match.provisionalRecipe?.values.scaled, 36, source);
    assert.equal(match.provisionalRecipe?.unknown, 'scaled-value', source);
  }
});

test('the shipped sample receives only its three exact, closed answers', () => {
  const sample = `Place value

1. What is the value of the digit 4 in 3,482? [1 mark]
2. Partition 6,407 in two different ways.
3. Mark 2,750 on a number line from 2,000 to 3,000.

Calculations

4. Calculate 4,003 − 1,786. [2 marks]
5. There are 6 bags with 8 apples in each bag. How many apples are there altogether?
6. Shade 3/8 of the fraction strip.`;
  const readings = parseQuestions(sample).questions.map((question) => matchQuestionToModels(question));
  const answers = readings.map((reading) => reading.interpretation.privateDerived);
  assert.deepEqual(answers, [
    { answer: 400, source: 'digit-value', pupilVisible: false },
    null,
    null,
    { answer: 2217, source: 'direct-calculation', pupilVisible: false },
    { answer: 48, source: 'repeated-groups', pupilVisible: false },
    null,
  ]);
  for (const index of [0, 3, 4]) {
    assert.equal(readings[index].confidence, 'high');
    assert.equal(readings[index].interpretation.status, 'resolved');
    assert.equal(readings[index].interpretation.needsReview, false);
  }
});

test('resolved single-task calculations derive exact private answers', () => {
  const cases = [
    ['Calculate 245 + 178.', 423, 'direct-calculation'],
    ['Calculate 4,003 − 1,786.', 2217, 'direct-calculation'],
    ['Calculate 23 × 4.', 92, 'direct-calculation'],
    ['Calculate 56 ÷ 8.', 7, 'direct-calculation'],
    ['□ ÷ 8 = 7', 56, 'simple-equation'],
    ['Round 3,450 to the nearest 100.', 3500, 'rounding'],
    ['How long is it from 23:50 to 00:10?', 20, 'duration'],
    ['Amy has 12 stickers. Ben has 3 times as many as Amy. How many does Ben have?', 36, 'scaling'],
    ['What is 100 more than 3,456?', 3556, 'direct-change'],
  ];
  for (const [source, answer, answerSource] of cases) {
    const interpretation = analyseQuestion(source);
    assert.equal(interpretation.confidence, 'high', source);
    assert.equal(interpretation.privateDerived?.answer, answer, source);
    assert.equal(interpretation.privateDerived?.source, answerSource, source);
    assert.equal(interpretation.privateDerived?.pupilVisible, false, source);
  }
});

test('private answer derivation fails closed for ambiguous, compound and response tasks', () => {
  const sources = [
    'Partition 6,407 in two different ways.',
    'Mark 2,750 on a number line from 2,000 to 3,000.',
    'Shade 3/8 of the fraction strip.',
    'Calculate 245 + 178 and 620 + 389.',
    '□ × 7 = 56 and □ × 8 = 64.',
    'Complete □ × 7 = 56 and explain your reasoning.',
    'What is the value of the digit 4 in 3,482? Explain how you know.',
    'Calculate 245 + 178, then round the answer to the nearest 10.',
    'Calculate 245 + 178 and add 10.',
    'There are 6 bags with 8 apples each. How many apples and how many bags are there?',
    'What is the value of the digit 4 in 4,434?',
    'Round each number to the nearest 10: 36, 74 and 128.',
    'Calculate 7 ÷ 2.',
    'Calculate 3/4 + 1/4.',
    'Use the diagram to calculate 24 ÷ 6.',
    'There are 6 bags with 8 apples each and 2 loose apples. How many apples are there altogether?',
  ];
  for (const source of sources) {
    assert.equal(analyseQuestion(source).privateDerived, null, source);
  }

  const subparts = parseQuestions('1. a. Calculate 245 + 178.\n   b. Calculate 620 + 389.').questions[0];
  assert.equal(analyseQuestion(subparts).privateDerived, null);
});
