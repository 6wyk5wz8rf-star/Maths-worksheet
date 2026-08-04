import test from 'node:test';
import assert from 'node:assert/strict';

import {
  additionCarryProfile,
  analyseSupportedVariation,
  createSafeNumberVariation,
  roundingProfile,
  subtractionBorrowProfile,
} from '../js/number-variation.js';

test('direct addition variation preserves every carry column and operand width', () => {
  const source = 'Calculate 3,482 + 2,135.';
  const analysis = analyseSupportedVariation(source);
  const result = createSafeNumberVariation(source, { seed: 'addition-profile' });

  assert.equal(analysis.supported, true);
  assert.equal(analysis.type, 'addition');
  assert.equal(result.changed, true);
  assert.notEqual(result.questionText, source);
  assert.equal(result.values.left + result.values.right, result.values.result);
  assert.equal(String(result.values.left).length, 4);
  assert.equal(String(result.values.right).length, 4);
  assert.equal(
    additionCarryProfile(result.values.left, result.values.right).signature,
    analysis.structure.carryProfile.signature
  );
});

test('direct subtraction variation preserves every borrow column and never creates a negative result', () => {
  const source = 'Calculate 4,003 − 1,786.';
  const analysis = analyseSupportedVariation(source);
  const result = createSafeNumberVariation(source, { seed: 'borrow-profile' });

  assert.equal(analysis.supported, true);
  assert.equal(analysis.type, 'subtraction');
  assert.equal(result.changed, true);
  assert.ok(result.values.minuend >= result.values.subtrahend);
  assert.equal(result.values.minuend - result.values.subtrahend, result.values.result);
  assert.equal(
    subtractionBorrowProfile(result.values.minuend, result.values.subtrahend).signature,
    analysis.structure.borrowProfile.signature
  );
});

test('one-digit multiplication keeps a one-digit multiplier and calculates a valid new answer', () => {
  const source = 'Calculate 234 × 3.';
  const result = createSafeNumberVariation(source, { seed: 'multiplication' });

  assert.equal(result.supported, true);
  assert.equal(result.type, 'multiplication');
  assert.equal(result.changed, true);
  assert.ok(result.values.multiplier >= 1 && result.values.multiplier <= 9);
  assert.equal(result.values.left * result.values.right, result.values.result);
  assert.equal(String(result.values.multiplicand).length, 3);
});

test('one-digit division preserves an intentional remainder exactly and exact division remains exact', () => {
  const withRemainder = createSafeNumberVariation('Calculate 29 ÷ 4.', { seed: 'remainder' });
  assert.equal(withRemainder.supported, true);
  assert.equal(withRemainder.values.remainder, 1);
  assert.ok(withRemainder.values.divisor >= 1 && withRemainder.values.divisor <= 9);
  assert.equal(
    withRemainder.values.dividend,
    (withRemainder.values.divisor * withRemainder.values.quotient) + withRemainder.values.remainder
  );

  const exact = createSafeNumberVariation('48 ÷ 6', { seed: 'exact-division' });
  assert.equal(exact.supported, true);
  assert.equal(exact.values.remainder, 0);
  assert.equal(exact.values.dividend % exact.values.divisor, 0);
});

test('rounding variation preserves magnitude and the target’s side of the midpoint', () => {
  const source = 'Round 3,462 to the nearest hundred.';
  const analysis = analyseSupportedVariation(source);
  const result = createSafeNumberVariation(source, { seed: 'rounding' });
  const variedProfile = roundingProfile(result.values.target, result.values.magnitude);

  assert.equal(analysis.type, 'rounding');
  assert.equal(result.changed, true);
  assert.equal(result.values.magnitude, 100);
  assert.equal(variedProfile.relation, analysis.structure.rounding.relation);
  assert.equal(result.values.result, variedProfile.roundedValue);
  assert.match(result.questionText, /nearest hundred/i);
});

test('fraction-of-quantity variation retains equal parts and an exact result', () => {
  const source = 'Find three fifths of 20.';
  const result = createSafeNumberVariation(source, { seed: 'fraction' });

  assert.equal(result.supported, true);
  assert.equal(result.type, 'fraction-of-quantity');
  assert.equal(result.values.numerator, 3);
  assert.equal(result.values.denominator, 5);
  assert.equal(result.values.whole % result.values.denominator, 0);
  assert.equal(result.values.result, (result.values.whole / 5) * 3);
  assert.notEqual(result.values.whole, 20);
  assert.match(result.questionText, /^Find three fifths of \d+\.$/);
});

test('unsupported or ambiguous wording is returned unchanged with a clear reason', () => {
  const source = 'Mia has 48 stickers and gives 6 to Noah. How many remain?';
  const result = createSafeNumberVariation(source);
  const multiDigit = createSafeNumberVariation('Calculate 23 × 14.');

  assert.equal(result.supported, false);
  assert.equal(result.changed, false);
  assert.equal(result.questionText, source);
  assert.match(result.reason, /unambiguous/i);
  assert.equal(multiDigit.supported, false);
  assert.equal(multiDigit.questionText, 'Calculate 23 × 14.');
});

test('a seed gives repeatable output without changing the source question', () => {
  const source = 'Calculate 3,482 + 2,135. [2 marks]';
  const first = createSafeNumberVariation(source, { seed: 'same-seed' });
  const second = createSafeNumberVariation(source, { seed: 'same-seed' });

  assert.equal(first.questionText, second.questionText);
  assert.equal(source, 'Calculate 3,482 + 2,135. [2 marks]');
  assert.match(first.questionText, /\[2 marks\]$/);
});
