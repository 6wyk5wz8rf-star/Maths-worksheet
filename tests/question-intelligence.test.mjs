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
  parseRational,
  parseSimpleEquation,
  parseTimeToMinutes,
  rankModelRecommendations,
  rationalToString,
  roundingBounds,
  subtractRationals,
} from '../js/question-intelligence.js';
import { matchQuestionToModels } from '../js/matcher.js';

test('rational helpers keep Year 4 fractions exact instead of using decimal arithmetic', () => {
  assert.deepEqual(parseRational('1.25'), { numerator: 5, denominator: 4 });
  assert.deepEqual(addRationals('1/3', '1/6'), { numerator: 1, denominator: 2 });
  assert.deepEqual(subtractRationals('3/4', '1/6'), { numerator: 7, denominator: 12 });
  assert.equal(rationalToString(divideRationals('3/5', '9/10')), '2/3');
  assert.equal(parseRational('3/0'), null);
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
