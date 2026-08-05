/**
 * Deterministic Year 4 question intelligence.
 *
 * This module deliberately does not make a network request and does not alter
 * source wording. It turns the parser's signals into an inspectable
 * interpretation object that can be stored with a worksheet, used to bind a
 * model, or reviewed by a teacher. It is intentionally conservative: a weak
 * reading is surfaced as review rather than converted into a confident model.
 */

import { extractMathInfo } from './parser.js';

export const YEAR4_DOMAINS = Object.freeze([
  'Number and place value',
  'Addition',
  'Subtraction',
  'Multiplication',
  'Division',
  'Fractions',
  'Decimals',
  'Money',
  'Length',
  'Mass',
  'Capacity',
  'Time',
  'Perimeter',
  'Area',
  'Geometry',
  'Position and direction',
  'Statistics',
  'Mixed or multi-step',
]);

export const REPRESENTATION_PURPOSES = Object.freeze([
  'interpret-situation',
  'expose-structure',
  'support-calculation',
  'support-reasoning-or-proof',
  'record-thinking',
  'represent-supplied-data',
  'blank-pupil-workspace',
]);

export const QUESTION_FAMILIES = Object.freeze([
  'calculate',
  'represent',
  'partition',
  'compare',
  'order',
  'round',
  'estimate',
  'complete',
  'continue',
  'missing-number',
  'inverse',
  'fact-family',
  'word-problem',
  'identify-operation',
  'explain',
  'justify',
  'prove',
  'find-error',
  'correct-error',
  'match',
  'sort',
  'classify',
  'interpret-chart',
  'construct-chart',
  'find-fraction',
  'compare-fractions',
  'equivalent-fraction',
  'convert-measure',
  'calculate-duration',
  'find-perimeter',
  'find-area',
  'identify-property',
  'read-scale',
  'locate-on-number-line',
  'identify-place-value',
  'plot-coordinates',
  'draw-hands',
]);

const NUMBER_SOURCE = '[−-]?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?';
const EQUATION_TOKEN_SOURCE = `(?:${NUMBER_SOURCE}|\\?)`;
const RATIONAL_TOKEN_SOURCE = `(?:${NUMBER_SOURCE}\\s+\\d+\\s*\\/\\s*\\d+|[−-]?\\d+\\s*\\/\\s*\\d+|${NUMBER_SOURCE})`;

const NUMBER_WORDS = Object.freeze({
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
  twelve: 12,
});

const FRACTION_WORDS = Object.freeze({
  half: 2, halves: 2,
  third: 3, thirds: 3,
  quarter: 4, quarters: 4,
  fourth: 4, fourths: 4,
  fifth: 5, fifths: 5,
  sixth: 6, sixths: 6,
  seventh: 7, sevenths: 7,
  eighth: 8, eighths: 8,
  ninth: 9, ninths: 9,
  tenth: 10, tenths: 10,
  hundredth: 100, hundredths: 100,
});

/**
 * Build 2's desired model identifiers. The model registry can grow into this
 * vocabulary without changing the recommendation language. During migration,
 * callers can pass availableFamilies and receive a safe current-family
 * fallback instead of an unrenderable recommendation.
 */
export const MODEL_FAMILY_FALLBACKS = Object.freeze({
  'place-value-counters': 'base-ten',
  'arrow-card-builder': 'partition',
  'partition-tree': 'partition',
  'part-whole-number-bond': 'part-whole',
  'four-digit-number-line': 'number-line',
  'ordering-comparison-line': 'number-line',
  'rounding-number-line': 'number-line',
  'negative-number-line': 'number-line',
  'roman-numeral-builder': null,
  'expanded-column-addition': 'column-arithmetic',
  'expanded-column-subtraction': 'column-arithmetic',
  'place-value-exchange': 'base-ten',
  'empty-number-line': 'number-line',
  'change-bar': 'part-whole',
  'equation-balance': null,
  'fact-family': null,
  'missing-number-strip': null,
  array: 'equal-groups',
  'repeated-addition-number-line': 'number-line',
  'multiplication-bar': 'equal-groups',
  'place-value-multiplication': 'area-model',
  'short-multiplication': null,
  'factor-pair-array': 'area-model',
  'scaling-bar': 'comparison-bar',
  'sharing-division': 'equal-groups',
  'grouping-division': 'equal-groups',
  'division-number-line': 'number-line',
  'short-division': null,
  'remainder-model': 'equal-groups',
  'fraction-wall': 'fraction-strip',
  'fraction-area': 'fraction-strip',
  'fraction-set': 'fraction-strip',
  'fraction-number-line': 'number-line',
  'equivalent-fraction-strips': 'fraction-strip',
  'fraction-quantity-bar': 'part-whole',
  'fraction-add-sub-bar': 'fraction-strip',
  'tenths-hundredths-grid': 'fraction-strip',
  'decimal-place-value': 'place-value',
  'decimal-number-line': 'number-line',
  money: null,
  'unit-conversion-bridge': 'part-whole',
  'ruler-length-line': 'number-line',
  'reading-scale': 'number-line',
  clock: null,
  'duration-timeline': 'number-line',
  'perimeter-trace': null,
  'area-square-grid': 'area-model',
  'angle-comparator': null,
  'turn-model': null,
  'shape-property-model': null,
  'shape-sort-workspace': null,
  'symmetry-grid': null,
  'coordinate-grid': null,
  'tally-frequency-table': null,
  'bar-chart': null,
  pictogram: null,
  'line-graph': null,
  'squared-workspace': null,
  'lined-reasoning-space': null,
  'blank-diagram-frame': null,
  'show-your-method-space': null,
  'calculation-workspace': null,
  'two-method-comparison-space': null,
  'prove-it-evidence-space': null,
  'editable-table': null,
});

// Registry vocabulary is deliberately more specific than the recommendation
// language in a few places.  Resolve those names before considering a legacy
// fallback, so Build 2 uses its native model when it is installed.
const MODEL_FAMILY_ALIASES = Object.freeze({
  array: 'array-structure',
  clock: 'clock-model',
  'decimal-place-value': 'decimal-place-value-chart',
  'empty-number-line': 'empty-calculation-line',
  'fraction-area': 'fraction-area-model',
  'fraction-quantity-bar': 'fraction-of-quantity-bar',
  'fraction-set': 'fraction-set-model',
  'lined-reasoning-space': 'lined-explanation-area',
  money: 'money-representation',
  'place-value-exchange': 'place-value-exchange-workspace',
  'repeated-addition-number-line': 'repeated-addition-line',
  'squared-workspace': 'squared-working-area',
});

const ROUNDING_MAGNITUDES = Object.freeze({
  10: 10,
  100: 100,
  1000: 1000,
  ten: 10,
  tens: 10,
  hundred: 100,
  hundreds: 100,
  thousand: 1000,
  thousands: 1000,
});

function asInfo(input) {
  if (typeof input === 'string') return extractMathInfo(input);
  if (input?.analysedText !== undefined && input?.numericValues) return input;
  const text = input?.displayText ?? input?.text ?? input?.originalText ?? input?.rawText ?? '';
  return extractMathInfo(text);
}

function cleanNumber(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const number = Number(String(value).replace(/[\s,]/g, '').replace('−', '-'));
  return Number.isFinite(number) ? number : null;
}

function gcd(a, b) {
  let left = Math.abs(Math.trunc(a));
  let right = Math.abs(Math.trunc(b));
  while (right) [left, right] = [right, left % right];
  return left || 1;
}

function normaliseRational(numerator, denominator) {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator === 0) return null;
  const sign = denominator < 0 ? -1 : 1;
  const divisor = gcd(numerator, denominator);
  return {
    numerator: (numerator / divisor) * sign,
    denominator: Math.abs(denominator / divisor),
  };
}

function decimalAsRational(value) {
  const text = String(value).trim().replace(/,/g, '');
  const match = text.match(/^([−-]?)(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const fraction = match[3] ?? '';
  if (fraction.length > 12) return null;
  const denominator = 10 ** fraction.length;
  const numerator = Number(`${match[2]}${fraction}`) * (match[1] ? -1 : 1);
  return normaliseRational(numerator, denominator);
}

/** Parse a finite rational without converting it through a floating point value. */
export function parseRational(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return normaliseRational(cleanNumber(value.numerator), cleanNumber(value.denominator));
  }
  const text = String(value ?? '').trim().replace(/\s+/g, '');
  const fraction = text.match(/^([−-]?\d+)\/([−-]?\d+)$/);
  if (fraction) return normaliseRational(Number(fraction[1].replace('−', '-')), Number(fraction[2].replace('−', '-')));
  return decimalAsRational(text);
}

function rationalTokenValue(value) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  const mixed = text.match(/^([−-]?\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1].replace('−', '-'));
    const numerator = Number(mixed[2]);
    const denominator = Number(mixed[3]);
    if (!Number.isInteger(whole) || !Number.isInteger(numerator) || !Number.isInteger(denominator) || denominator <= 0) return null;
    const rational = normaliseRational((whole * denominator) + ((whole < 0 ? -1 : 1) * numerator), denominator);
    return {
      value: rational ? rational.numerator / rational.denominator : null,
      denominator,
      isFraction: true,
      rational,
    };
  }
  const fraction = text.match(/^([−-]?\d+)\s*\/\s*(\d+)$/);
  if (fraction) {
    const numerator = Number(fraction[1].replace('−', '-'));
    const denominator = Number(fraction[2]);
    if (!Number.isInteger(numerator) || !Number.isInteger(denominator) || denominator <= 0) return null;
    const rational = normaliseRational(numerator, denominator);
    return { value: numerator / denominator, denominator, isFraction: true, rational };
  }
  const rational = parseRational(text);
  const number = rational ? rational.numerator / rational.denominator : null;
  return Number.isFinite(number) ? { value: number, denominator: rational.denominator, isFraction: false, rational } : null;
}

/**
 * Parse a supplied number-line scale without relying on the generic number
 * token list.  The parser retains source wording, but a line needs the exact
 * endpoints, equal subdivisions and (where relevant) pupil target.
 */
export function parseNumberLinePrompt(input) {
  const source = String(input ?? '');
  const range = source.match(new RegExp(`\\b(?:from|between)\\s+(${RATIONAL_TOKEN_SOURCE})(?:\\s*(?:km|m|cm|mm|l|ml|kg|g))?\\s+(?:to|and)\\s+(${RATIONAL_TOKEN_SOURCE})`, 'i'));
  if (!range) return null;
  const startInfo = rationalTokenValue(range[1]);
  const endInfo = rationalTokenValue(range[2]);
  const start = startInfo?.value ?? null;
  const end = endInfo?.value ?? null;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;

  const directTarget = source.match(new RegExp(`\\b(?:place|mark|locate|plot)\\s+(${RATIONAL_TOKEN_SOURCE})(?=\\s+(?:on|along)\\s+(?:an?\\s+)?number\\s+line\\b)`, 'i'));
  const tokenPattern = new RegExp(RATIONAL_TOKEN_SOURCE, 'gi');
  const fractionTargets = [...source.matchAll(tokenPattern)]
    .map((match) => rationalTokenValue(match[0]))
    .filter((value) => value?.isFraction
      && value.value >= start
      && value.value <= end
      && value.value !== start
      && value.value !== end);
  const targetInfo = rationalTokenValue(directTarget?.[1])
    ?? fractionTargets[0]
    ?? null;
  const target = targetInfo && targetInfo.value >= start && targetInfo.value <= end ? targetInfo.value : null;

  const namedParts = source.match(/\b(?:divided|split)\s+into\s+(?:equal\s+)?(halves|thirds|quarters|fourths|fifths|sixths|sevenths|eighths|ninths|tenths)\b/i);
  const numericParts = source.match(/\b(?:divided|split)\s+into\s+(\d+)\s+(?:equal\s+)?(?:parts?|sections?)\b/i);
  const intervalParts = source.match(new RegExp(`\\b(?:in\\s+)?(?:steps?|intervals?)\\s+of\\s+(${RATIONAL_TOKEN_SOURCE})`, 'i'));
  const requestedParts = namedParts ? FRACTION_WORDS[namedParts[1].toLowerCase()] : cleanNumber(numericParts?.[1]);
  const requestedStep = rationalTokenValue(intervalParts?.[1])?.value ?? null;
  const intervalDivisions = Number.isFinite(requestedStep) && requestedStep > 0
    ? (end - start) / requestedStep
    : null;
  const targetRatio = targetInfo?.rational && startInfo?.rational && endInfo?.rational
    ? divideRationals(
      subtractRationals(targetInfo.rational, startInfo.rational),
      subtractRationals(endInfo.rational, startInfo.rational),
    )
    : null;
  // When endpoints and one target are explicit, the reduced target ratio
  // supplies the smallest truthful equal-interval scale. This makes ordinary
  // integer prompts as exact as fraction prompts without inventing a step.
  const fallbackDivisions = targetRatio?.denominator ?? null;
  const divisions = Number.isInteger(requestedParts) && requestedParts > 0
    ? requestedParts
    : Number.isInteger(intervalDivisions) && intervalDivisions > 0
      ? intervalDivisions
      : Number.isInteger(fallbackDivisions) && fallbackDivisions > 0
        ? fallbackDivisions
        : null;
  if (!Number.isInteger(divisions) || divisions < 1 || divisions > 20) return null;
  const step = (end - start) / divisions;
  return { start, end, divisions, step, target };
}

export function rationalToNumber(value) {
  const rational = parseRational(value);
  return rational ? rational.numerator / rational.denominator : null;
}

export function rationalToString(value) {
  const rational = parseRational(value);
  if (!rational) return '';
  return rational.denominator === 1 ? String(rational.numerator) : `${rational.numerator}/${rational.denominator}`;
}

export function addRationals(left, right) {
  const a = parseRational(left);
  const b = parseRational(right);
  return a && b ? normaliseRational((a.numerator * b.denominator) + (b.numerator * a.denominator), a.denominator * b.denominator) : null;
}

export function subtractRationals(left, right) {
  const a = parseRational(left);
  const b = parseRational(right);
  return a && b ? normaliseRational((a.numerator * b.denominator) - (b.numerator * a.denominator), a.denominator * b.denominator) : null;
}

export function multiplyRationals(left, right) {
  const a = parseRational(left);
  const b = parseRational(right);
  return a && b ? normaliseRational(a.numerator * b.numerator, a.denominator * b.denominator) : null;
}

export function divideRationals(left, right) {
  const a = parseRational(left);
  const b = parseRational(right);
  return a && b && b.numerator !== 0 ? normaliseRational(a.numerator * b.denominator, a.denominator * b.numerator) : null;
}

/** Exact integer pence parsing for Year 4 money questions. */
export function parseMoneyToPence(value) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!text) return null;
  const pounds = text.match(/^£\s*(\d+)(?:\.(\d{1,2}))?$/i);
  if (pounds) {
    const pennies = String(pounds[2] ?? '').padEnd(2, '0') || '00';
    return (Number(pounds[1]) * 100) + Number(pennies);
  }
  const words = text.match(/^(\d+)\s*pounds?(?:\s+and)?(?:\s+(\d+)\s*(?:p|pence))?$/i);
  if (words) return (Number(words[1]) * 100) + Number(words[2] ?? 0);
  const pence = text.match(/^(\d+)\s*(?:p|pence)$/i);
  if (pence) return Number(pence[1]);
  return null;
}

export function formatPence(value) {
  const pence = Number(value);
  if (!Number.isInteger(pence)) return '';
  const sign = pence < 0 ? '−' : '';
  const absolute = Math.abs(pence);
  return `${sign}£${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
}

export function parseTimeToMinutes(value) {
  if (value && typeof value === 'object' && Number.isInteger(value.hours) && Number.isInteger(value.minutes)) {
    const meridiem = typeof value.meridiem === 'string' ? value.meridiem.toLowerCase() : null;
    let hours = Number.isInteger(value.sourceHours) ? value.sourceHours : value.hours;
    if (value.minutes < 0 || value.minutes >= 60) return null;
    if (meridiem) {
      if (!['am', 'pm'].includes(meridiem) || hours < 1 || hours > 12) return null;
      if (meridiem === 'pm' && hours !== 12) hours += 12;
      if (meridiem === 'am' && hours === 12) hours = 0;
    } else if (hours < 0 || hours > 23) return null;
    return (hours * 60) + value.minutes;
  }
  const match = String(value ?? '').trim().match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const suffix = match[3]?.toLowerCase();
  if (minutes > 59 || hours > 23) return null;
  if (suffix) {
    if (hours < 1 || hours > 12) return null;
    if (suffix === 'pm' && hours !== 12) hours += 12;
    if (suffix === 'am' && hours === 12) hours = 0;
  }
  return (hours * 60) + minutes;
}

export function durationMinutes(start, end, options = {}) {
  const from = parseTimeToMinutes(start);
  const to = parseTimeToMinutes(end);
  if (from === null || to === null) return null;
  if (to >= from) return to - from;
  return options.allowNextDay ? (to + (24 * 60)) - from : null;
}

export function roundingBounds(value, magnitude) {
  const number = cleanNumber(value);
  const step = Number(magnitude);
  if (!Number.isFinite(number) || !Number.isInteger(step) || step <= 0) return null;
  const lower = Math.floor(number / step) * step;
  const upper = lower + step;
  return { lower, upper, midpoint: lower + (step / 2), magnitude: step, target: number };
}

export function normaliseMathsText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\u2212/g, '-')
    .replace(/[□▢▭＿]/g, '?')
    .replace(/_{2,}/g, '?')
    .replace(/[×*]/g, ' × ')
    .replace(/÷/g, ' ÷ ')
    .replace(/\s+[xX]\s+/g, ' × ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseEquationValue(token) {
  const source = String(token ?? '').trim();
  if (source === '?') return { type: 'unknown', value: null };
  const value = cleanNumber(source);
  return value === null ? null : { type: 'number', value };
}

function canonicalOperator(operator) {
  if (operator === '+') return 'addition';
  if (operator === '-') return 'subtraction';
  if (operator === '×' || operator === '*' || operator.toLowerCase?.() === 'x') return 'multiplication';
  if (operator === '÷' || operator === '/') return 'division';
  return null;
}

function unknownName(operator, slot) {
  const names = {
    addition: ['first-addend', 'second-addend', 'sum'],
    subtraction: ['minuend', 'subtrahend', 'difference'],
    multiplication: ['first-factor', 'second-factor', 'product'],
    division: ['dividend', 'divisor', 'quotient'],
  };
  return names[operator]?.[slot] ?? 'unknown';
}

function deriveEquationAnswer(operator, left, right, result) {
  const values = [left, right, result].map((item) => item.type === 'number' ? item.value : null);
  const missingIndex = values.findIndex((value) => value === null);
  if (missingIndex < 0 || values.filter((value) => value === null).length !== 1) return null;
  const [a, b, c] = values;
  let answer = null;
  if (operator === 'addition') {
    if (missingIndex === 0) answer = c - b;
    if (missingIndex === 1) answer = c - a;
    if (missingIndex === 2) answer = a + b;
  } else if (operator === 'subtraction') {
    if (missingIndex === 0) answer = c + b;
    if (missingIndex === 1) answer = a - c;
    if (missingIndex === 2) answer = a - b;
  } else if (operator === 'multiplication') {
    if (missingIndex === 0 && b !== 0) answer = c / b;
    if (missingIndex === 1 && a !== 0) answer = c / a;
    if (missingIndex === 2) answer = a * b;
  } else if (operator === 'division') {
    if (missingIndex === 0) answer = c * b;
    if (missingIndex === 1 && c !== 0) answer = a / c;
    if (missingIndex === 2 && b !== 0) answer = a / b;
  }
  return Number.isFinite(answer) ? answer : null;
}

/**
 * Recognise one simple equality while preserving every source character in the
 * caller's question. The derived answer is deliberately marked private.
 */
export function parseSimpleEquation(value) {
  const source = normaliseMathsText(value);
  // A compact slash inside fraction arithmetic is not a division operator.
  // Do not let the tail of `3/4 + 1/4 = ?` masquerade as `1 ÷ 4 = ?`.
  if (/\d+\s*\/\s*\d+\s*[+\-×÷*xX]\s*\d+\s*\/\s*\d+\s*=/.test(source)
    || /\d+\s+\d+\s*\/\s*\d+\s*=/.test(source)) return null;
  const operator = '[+\\-×÷*/xX]';
  const forward = new RegExp(`(${EQUATION_TOKEN_SOURCE})\\s*(${operator})\\s*(${EQUATION_TOKEN_SOURCE})\\s*=\\s*(${EQUATION_TOKEN_SOURCE})`);
  const reverse = new RegExp(`(${EQUATION_TOKEN_SOURCE})\\s*=\\s*(${EQUATION_TOKEN_SOURCE})\\s*(${operator})\\s*(${EQUATION_TOKEN_SOURCE})`);
  let match = source.match(forward);
  let left;
  let right;
  let result;
  let operation;
  if (match) {
    left = parseEquationValue(match[1]);
    operation = canonicalOperator(match[2]);
    right = parseEquationValue(match[3]);
    result = parseEquationValue(match[4]);
  } else {
    match = source.match(reverse);
    if (!match) return null;
    result = parseEquationValue(match[1]);
    left = parseEquationValue(match[2]);
    operation = canonicalOperator(match[3]);
    right = parseEquationValue(match[4]);
  }
  if (!left || !right || !result || !operation) return null;
  const values = [left, right, result];
  const unknownIndex = values.findIndex((item) => item.type === 'unknown');
  const unknownCount = values.filter((item) => item.type === 'unknown').length;
  return {
    operator: operation,
    left,
    right,
    result,
    unknownPosition: unknownCount === 1 ? unknownName(operation, unknownIndex) : unknownCount ? 'ambiguous' : null,
    privateDerivedAnswer: unknownCount === 1 ? deriveEquationAnswer(operation, left, right, result) : null,
    exact: true,
  };
}

// A slash inside a fraction is not a division operation.  Detect equality of
// two fractions before the arithmetic-equation parser sees `1/2 = ?/4`, so a
// missing equivalent denominator is never misread as a quotient question.
function parseFractionEquality(value) {
  const source = normaliseMathsText(value);
  const token = '(?:\\d+|\\?)';
  const match = source.match(new RegExp(`(${token})\\s*\\/\\s*(${token})\\s*=\\s*(${token})\\s*\\/\\s*(${token})`));
  if (!match) return null;
  // The fraction token in a mixed number is not the whole left-hand operand.
  // Reject rather than silently reading `1 1/2` as `1/2`.
  if (/\d+\s+$/.test(source.slice(0, match.index))) return null;
  const values = match.slice(1).map((item) => item === '?' ? null : Number(item));
  if (values.filter((item) => item === null).length !== 1 || values.some((item) => item !== null && (!Number.isInteger(item) || item < 0))) return null;
  let [leftNumerator, leftDenominator, rightNumerator, rightDenominator] = values;
  if ((leftDenominator ?? rightDenominator ?? 0) < 1) return null;
  const missingIndex = values.findIndex((item) => item === null);
  const derived = missingIndex === 0 ? (leftDenominator * rightNumerator) / rightDenominator
    : missingIndex === 1 ? (leftNumerator * rightDenominator) / rightNumerator
      : missingIndex === 2 ? (rightDenominator * leftNumerator) / leftDenominator
        : (rightNumerator * leftDenominator) / leftNumerator;
  if (!Number.isInteger(derived) || derived < 0 || ((missingIndex === 1 || missingIndex === 3) && derived < 1)) return null;
  if (missingIndex === 0) leftNumerator = derived;
  if (missingIndex === 1) leftDenominator = derived;
  if (missingIndex === 2) rightNumerator = derived;
  if (missingIndex === 3) rightDenominator = derived;
  return {
    fractions: [
      { numerator: leftNumerator, denominator: leftDenominator },
      { numerator: rightNumerator, denominator: rightDenominator },
    ],
    unknownPosition: `fraction:${missingIndex < 2 ? 0 : 1}:${missingIndex % 2 === 0 ? 'numerator' : 'denominator'}`,
    unknownFractionIndex: missingIndex < 2 ? 0 : 1,
    unknownPart: missingIndex % 2 === 0 ? 'numerator' : 'denominator',
    exact: true,
  };
}

function fractionFromWords(source) {
  const match = source.match(new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')}|\\d+)\\s+(${Object.keys(FRACTION_WORDS).join('|')})\\b`, 'i'));
  if (!match) return null;
  const numerator = /^\d+$/.test(match[1]) ? Number(match[1]) : NUMBER_WORDS[match[1].toLowerCase()];
  const denominator = FRACTION_WORDS[match[2].toLowerCase()];
  return Number.isInteger(numerator) && denominator ? { numerator, denominator, source: match[0] } : null;
}

function integerDigitCount(value) {
  if (!Number.isFinite(value)) return 0;
  return String(Math.trunc(Math.abs(value))).length;
}

function decimalPlacesFromText(value) {
  const source = String(value ?? '');
  const decimal = source.match(/\.([0-9]+)/);
  return decimal ? decimal[1].length : 0;
}

function scoreMapToRankedArray(scores) {
  return [...scores.entries()]
    .map(([domain, score]) => ({ domain, score }))
    .sort((a, b) => b.score - a.score || a.domain.localeCompare(b.domain));
}

function addScore(scores, domain, amount) {
  scores.set(domain, (scores.get(domain) ?? 0) + amount);
}

function detectDomains(info, source, equation = null) {
  const lower = source.toLowerCase();
  const scores = new Map();
  const has = (pattern) => pattern.test(lower);
  const timesTable = has(/\b(?:\d+\s+)?times\s+tables?\b/);
  if (has(/\b(?:place value|digit|thousands?|hundreds?|tens?|ones?|partition|expanded form|roman numeral|negative number|base[- ]ten|dienes?)\b/)
    || has(/\bvalue\s+of\s+(?:the\s+)?(?:digit\s*)?\d/)) addScore(scores, 'Number and place value', 8);
  if (has(/\b(?:round|nearest)\b/)) addScore(scores, 'Number and place value', 8);
  if (has(/\bnumber\s+line\b/) && !info.fractions.length) addScore(scores, 'Number and place value', 8);
  if (has(/\b(?:order|compare|greater than|less than)\b/) || (info.comparisonLanguage?.length ?? 0) > 0) {
    addScore(scores, 'Number and place value', 8);
  }
  if (info.operations.includes('addition') || has(/\b(?:add|sum|altogether|combined)\b/)) addScore(scores, 'Addition', 7);
  if (info.operations.includes('subtraction') || has(/\b(?:subtract|take away|fewer|difference|remain)\b/)) addScore(scores, 'Subtraction', 7);
  if (info.operations.includes('multiplication') || has(/\b(?:multiply|times|twice|double|product|groups? of)\b/)) addScore(scores, 'Multiplication', 7);
  if (info.operations.includes('division') || has(/\b(?:divide|share|shared|grouping|remainder)\b/)) addScore(scores, 'Division', 7);
  // Boxed equations do not always make it through the lightweight importer as
  // an operation token. The local equation parser is exact, so it is safe to
  // use it as an additional domain signal rather than guessing from a word.
  if (equation?.operator === 'addition') addScore(scores, 'Addition', 9);
  if (equation?.operator === 'subtraction') addScore(scores, 'Subtraction', 9);
  if (equation?.operator === 'multiplication') addScore(scores, 'Multiplication', 9);
  if (equation?.operator === 'division') addScore(scores, 'Division', 9);
  if (info.fractions.length || fractionFromWords(lower) || has(/\b(?:fraction|numerator|denominator|equivalent|halves|quarters|fifths|tenths)\b/)) addScore(scores, 'Fractions', 9);
  if (has(/\b(?:decimal|tenths|hundredths)\b/) || info.numbers?.some((number) => number.decimal)) addScore(scores, 'Decimals', 7);
  if (has(/[£]|\b(?:pence|pounds?|coins?)\b|\d\s*p\b/)) addScore(scores, 'Money', 10);
  if (has(/\b(?:perimeter|boundary)\b/)) addScore(scores, 'Perimeter', 12);
  if (has(/\b(?:area|square centimetres?|cm²|square units?)\b/)) addScore(scores, 'Area', 12);
  if (has(/\b(?:angle|triangle|quadrilateral|polygon|parallel|perpendicular|symmetry|reflect)\b/)) addScore(scores, 'Geometry', 10);
  if (has(/\b(?:coordinate|axis|axes|clockwise|anticlockwise|turn)\b/)) addScore(scores, 'Position and direction', 10);
  if (has(/\b(?:chart|graph|pictogram|frequency|tally|data)\b/)
    || (!timesTable && has(/\b(?:use|read|complete)\s+the\s+table\b|\btable\s+(?:below|above|shown|provided|gives?|shows?)\b/))) addScore(scores, 'Statistics', 10);
  // A single explicit time is enough for a clock-drawing task.  Requiring two
  // times here would leave "Draw the hands to show 14:35" without a Time
  // domain or a safe blank clock.
  if (has(/\b(?:clock|time|duration|minutes?|hours?|am|pm|hands?)\b/) || info.times?.length >= 1) addScore(scores, 'Time', 9);
  if (has(/\b(?:kilometres?|km|metres?|m|centimetres?|cm|millimetres?|mm|length|ruler)\b/)) addScore(scores, 'Length', 8);
  if (has(/\b(?:kilograms?|kg|grams?|mass|weigh)\b/)) addScore(scores, 'Mass', 8);
  if (has(/\b(?:litres?|l|millilitres?|ml|capacity|volume)\b/)) addScore(scores, 'Capacity', 8);
  if (info.operations.length > 1 || has(/\b(?:two-step|multi-step)\b/)) addScore(scores, 'Mixed or multi-step', 11);
  return scoreMapToRankedArray(scores);
}

function inferQuestionFamily(source, info, equation) {
  const lower = source.toLowerCase();
  const includes = (pattern) => pattern.test(lower);
  if (includes(/\b(?:find|spot|identify|explain)\s+(?:the )?(?:mistake|error)\b/)
    || includes(/\b(?:says?|thinks?|claims?|believes?)\b[\s\S]*\b(?:because|but|correct|right|agree|true|false)\b/)) return 'find-error';
  if (includes(/\bcorrect (?:the )?(?:mistake|error)\b/)) return 'correct-error';
  if (includes(/\b(?:prove|convince)\b/)) return 'prove';
  if (includes(/\b(?:justify|explain why|explain how)\b/)) return 'justify';
  if (includes(/\b(?:draw|construct|complete|make)\b.*\b(?:chart|graph|pictogram|bar chart)\b/)) return 'construct-chart';
  if (includes(/\b(?:read|interpret|use)\b.*\b(?:chart|graph|pictogram|table)\b/)) return 'interpret-chart';
  if (includes(/\b(?:plot|coordinate)\b/)) return 'plot-coordinates';
  if (includes(/\b(?:perimeter)\b/)) return 'find-perimeter';
  if (includes(/\b(?:area)\b/)) return 'find-area';
  if (includes(/\b(?:duration|elapsed time)\b/)
    || (includes(/\bhow long\b/) && (info.times?.length ?? 0) >= 2)) return 'calculate-duration';
  if (includes(/\b(?:convert|conversion)\b/)) return 'convert-measure';
  if (includes(/\b(?:equivalent)\b.*\b(?:fraction|fractions)\b/)) return 'equivalent-fraction';
  // “Which is closer to 3?” is a comparison of fractional distance, even
  // where the teacher does not repeat the word “fraction” in the sentence.
  // Keeping this ahead of generic comparison means the reading and the model
  // recommendation agree on the actual mathematical task.
  if (includes(/\bcloser\s+to\b/) && (info.fractions?.length >= 2 || /\b(?:half|third|quarter|fifth|sixth|seventh|eighth|ninth|tenth)s?\b/.test(lower))) return 'compare-fractions';
  if (includes(/\b(?:compare|greater|less)\b.*\b(?:fraction|fractions)\b/)) return 'compare-fractions';
  if (includes(/\b(?:find|shade)\b.*\b(?:fraction|half|third|quarter|fifth|sixth|seventh|eighth|ninth|tenth)\b/)) return 'find-fraction';
  if (includes(/\b(?:round|nearest)\b/)) return 'round';
  if (includes(/\b(?:draw|show)\b.*\b(?:hands?|clock)\b/)) return 'draw-hands';
  if (includes(/\b(?:place|mark|locate|plot)\b.*\b(?:on|along)\s+(?:a\s+)?number\s+line\b/)
    || includes(/\b(?:mark|place|locate)\s+where\s+it\s+belongs\s+between\b/)) return 'locate-on-number-line';
  if (includes(/\b(?:what is|find)\s+the\s+value\s+of\s+(?:the\s+)?(?:digit\s*)?\d/)) return 'identify-place-value';
  if (includes(/\b(?:order|arrange)\b/)) return 'order';
  if ((info.comparisonLanguage?.length ?? 0) > 0
    && includes(/\b(?:put|write|choose|insert|place)\b[\s\S]*\b(?:between|symbol|sign|pair)\b/)) return 'compare';
  if (directMoreLessChange(lower)) return 'calculate';
  if (includes(/\b(?:compare|greater than|less than|how many more|how many fewer|difference)\b/)
    || includes(/\b(?:has|have|is)\s+\d[\d,]*(?:\.\d+)?\s+(?:fewer|less)\b/)) return 'compare';
  if (includes(/\b(?:partition|expanded form|decompose)\b/)) return 'partition';
  // Equations with a box are more structurally informative than the generic
  // instruction verb which often introduces them (for example, “Complete”).
  if (equation?.unknownPosition || includes(/\bmissing\b/)) return 'missing-number';
  if (includes(/\b(?:represent|show|make)\b/)) return 'represent';
  // A sentence-final question mark is not a mathematical unknown. Explicit
  // boxes are converted to `?` by normaliseMathsText, but a simple equation
  // catches the important structured cases without treating ordinary wording
  // as a missing-number question.
  if (includes(/\b(?:inverse|check)\b/)) return 'inverse';
  if (includes(/\bfact family\b/)) return 'fact-family';
  if (includes(/\b(?:estimate)\b/)) return 'estimate';
  if (includes(/\b(?:sort)\b/)) return 'sort';
  if (includes(/\b(?:classify)\b/)) return 'classify';
  if (includes(/\b(?:match)\b/)) return 'match';
  if (includes(/\b(?:continue|next number)\b/)) return 'continue';
  if (includes(/\b(?:complete)\b/)) return 'complete';
  if (includes(/\b(?:calculate|work out|solve|find)\b/) || info.operations.length) return 'calculate';
  if (includes(/\b(?:explain|describe)\b/)) return 'explain';
  return info.numericValues?.length >= 2 ? 'word-problem' : 'explain';
}

function directMoreLessChange(source) {
  const match = String(source).match(new RegExp(`\\b(?:what\\s+is|find|calculate)\\s+(${NUMBER_SOURCE})\\s+(more|less|fewer)\\s+than\\s+(${NUMBER_SOURCE})\\b`, 'i'));
  if (!match) return null;
  return {
    change: cleanNumber(match[1]),
    operation: match[2].toLowerCase() === 'more' ? 'addition' : 'subtraction',
    start: cleanNumber(match[3]),
  };
}

function proportionalScaleDetails(source, info = null) {
  const text = String(source ?? '').toLowerCase();
  const numberWords = Object.keys(NUMBER_WORDS).join('|');
  const multiplierToken = `(?:${NUMBER_SOURCE}|${numberWords}|twice)`;
  const relationMatch = text.match(new RegExp(`\\b(${multiplierToken})(?:\\s+times)?\\s+as\\s+(?:many|much|long)(?:\\s+[a-z][a-z'-]*){0,3}\\s+as\\b`, 'i'));
  if (!relationMatch) return null;
  const directOriginal = text.slice(relationMatch.index + relationMatch[0].length)
    .match(new RegExp(`^\\s+(?:an?\\s+)?(${NUMBER_SOURCE})\\b`, 'i'));
  const rawMultiplier = relationMatch[1].toLowerCase();
  const multiplier = rawMultiplier === 'twice'
    ? 2
    : NUMBER_WORDS[rawMultiplier] ?? cleanNumber(rawMultiplier);
  const relationStart = relationMatch.index;
  const relationEnd = relationStart + relationMatch[0].length;
  const otherQuantities = (info?.numbers ?? [])
    .filter((quantity) => quantity.end <= relationStart || quantity.start >= relationEnd)
    .map((quantity) => quantity.value)
    .filter(Number.isFinite);
  const original = cleanNumber(directOriginal?.[1])
    ?? (otherQuantities.length === 1 ? otherQuantities[0] : null);
  if (!Number.isInteger(multiplier) || multiplier < 1 || !Number.isFinite(original)) return null;
  return { original, multiplier, scaled: original * multiplier };
}

function inferRepresentationPurpose(family, source, info) {
  const lower = source.toLowerCase();
  if (family === 'partition' && /\b(?:partition|expanded form|decompose)\b/.test(lower)) return 'record-thinking';
  if (family === 'represent' && /\b(?:draw|use|represent|show|make)\b/.test(lower)) return 'record-thinking';
  if (['find-error', 'correct-error', 'justify', 'prove', 'explain'].includes(family)) return 'support-reasoning-or-proof';
  if (['construct-chart', 'plot-coordinates', 'sort', 'classify', 'complete', 'missing-number', 'draw-hands', 'locate-on-number-line'].includes(family)) return 'record-thinking';
  if (['interpret-chart'].includes(family)) return 'represent-supplied-data';
  if (['represent', 'partition', 'compare', 'round', 'find-fraction', 'equivalent-fraction'].includes(family)) return 'expose-structure';
  if (info.hasExistingRepresentation) return 'interpret-situation';
  if (/\b(?:draw|show your method|working space)\b/.test(lower)) return 'blank-pupil-workspace';
  if (info.operations.length || /\b(?:calculate|work out|solve|find)\b/.test(lower)) return 'support-calculation';
  return 'blank-pupil-workspace';
}

function nearestMagnitudeDetails(source) {
  const match = source.match(/\bnearest\s+(10|100|1,?000|ten|tens|hundred|hundreds|thousand|thousands)\b/i);
  const key = match?.[1].toLowerCase().replace(/,/g, '');
  const magnitude = key ? ROUNDING_MAGNITUDES[key] ?? null : null;
  return magnitude && match ? {
    magnitude,
    start: match.index,
    end: match.index + match[0].length,
  } : null;
}

function roundingTargetValues(info, magnitudeDetails) {
  const values = (info.numbers ?? [])
    .filter((quantity) => !magnitudeDetails
      || quantity.start < magnitudeDetails.start
      || quantity.end > magnitudeDetails.end)
    .map((quantity) => quantity.value)
    .filter(Number.isFinite);
  return values;
}

function deriveWordStructure(info, source, family, equation) {
  const lower = source.toLowerCase();
  const values = (info.numericValues ?? []).filter(Number.isFinite);
  const wholeNumbers = values.filter(Number.isInteger);
  const first = values[0] ?? null;
  const second = values[1] ?? null;
  const asksForRemainder = (info.operations?.includes('division') || info.divisionInterpretation)
    && /\bhow\s+many(?:\s+\w+){0,3}\s+(?:are\s+)?left over\b|\b(?:what(?:'s| is)|find|give)\s+(?:the\s+)?remainder\b/i.test(lower);
  const result = {
    whole: null,
    parts: [],
    groups: null,
    groupSize: null,
    numberOfGroups: null,
    difference: null,
    change: null,
    startValue: null,
    endValue: null,
    multiplier: null,
    originalValue: null,
    scaledValue: null,
    divisor: null,
    quotient: null,
    remainder: /\bremainder|left over\b/i.test(lower) ? null : undefined,
    numerator: null,
    denominator: null,
    interval: null,
    midpoint: null,
    scale: null,
    unit: info.units?.[0] ?? null,
    unknownPosition: equation?.unknownPosition ?? (asksForRemainder ? 'remainder' : null),
    equality: equation ? { operator: equation.operator, privateDerivedAnswer: equation.privateDerivedAnswer } : null,
    comparison: null,
    rounding: null,
    roundingTargets: [],
    measurement: null,
    chart: null,
  };

  const numberLine = parseNumberLinePrompt(source);
  if (family === 'locate-on-number-line' && numberLine) {
    result.startValue = numberLine.start;
    result.endValue = numberLine.end;
    result.interval = numberLine.step;
    result.scale = {
      start: numberLine.start,
      end: numberLine.end,
      divisions: numberLine.divisions,
      target: numberLine.target,
    };
    result.unknownPosition ??= 'line-position';
  }

  if (family === 'round') {
    const magnitudeDetails = nearestMagnitudeDetails(info.analysedText ?? lower);
    const targets = roundingTargetValues(info, magnitudeDetails);
    const target = targets.length === 1 ? targets[0] : null;
    result.roundingTargets = targets;
    result.rounding = magnitudeDetails && target !== null ? roundingBounds(target, magnitudeDetails.magnitude) : null;
    result.interval = magnitudeDetails?.magnitude ?? null;
    result.midpoint = result.rounding?.midpoint ?? null;
    result.unknownPosition ??= targets.length > 1 ? 'rounded-values' : 'rounded-value';
  }

  const directChange = family === 'calculate' ? directMoreLessChange(lower) : null;
  if (directChange) {
    result.startValue = directChange.start;
    result.change = directChange.change;
    result.operation = directChange.operation;
    result.unknownPosition ??= 'result';
  }

  const proportionalScale = proportionalScaleDetails(lower, info);
  if (proportionalScale) {
    result.originalValue = proportionalScale.original;
    result.multiplier = proportionalScale.multiplier;
    result.scaledValue = proportionalScale.scaled;
    result.unknownPosition ??= 'scaled-value';
  }

  const fraction = info.fractions?.[0] ?? fractionFromWords(lower);
  if (fraction) {
    result.numerator = fraction.numerator;
    result.denominator = fraction.denominator;
  }

  const fractionOf = lower.match(new RegExp(`\\b(?:${Object.keys(NUMBER_WORDS).join('|')}|\\d+)\\s+(?:${Object.keys(FRACTION_WORDS).join('|')})\\s+of\\s+(${NUMBER_SOURCE})`, 'i'))
    || lower.match(new RegExp(`\\b${NUMBER_SOURCE}\\s*\\/\\s*${NUMBER_SOURCE}\\s+of\\s+(${NUMBER_SOURCE})`, 'i'));
  if (fractionOf) {
    const quantity = cleanNumber(fractionOf[1]);
    result.whole = quantity;
    result.unknownPosition ??= 'fraction-of-quantity-result';
  }

  const comparisonWords = /\b(?:how many more|how many fewer|difference between|more than|fewer than|less than|greater than)\b/i.test(lower)
    || new RegExp(`\\b(?:has|have|is)\\s+${NUMBER_SOURCE}\\s+(?:fewer|less)\\b`, 'i').test(lower);
  // A teacher’s correction from calculation/take-away to comparison must
  // alter the structure, not merely relabel the same bar. Conversely, a
  // correction away from comparison stops source wording such as “fewer”
  // from forcing comparison bars back onto the block.
  if ((comparisonWords && family === 'compare') || (family === 'compare' && values.length >= 2)) {
    const fewerPattern = new RegExp(`\\b(?:has|have|is)\\s+(${NUMBER_SOURCE})\\b\\s+(?:fewer|less)\\b`, 'i');
    const fewerStatement = lower.match(fewerPattern);
    if (fewerStatement) {
      const difference = cleanNumber(fewerStatement[1]);
      // Resolve the known comparison quantity from its own clause rather than
      // trusting numeric source order. This handles both “Ben has 42. Amy has
      // 17 fewer” and “Amy has 17 fewer ... Ben has 42” identically.
      const knownPattern = new RegExp(`\\b(?:has|have|is)\\s+(${NUMBER_SOURCE})\\b(?!\\s+(?:fewer|less)\\b)`, 'gi');
      const knownQuantities = [...lower.matchAll(knownPattern)]
        .map((match) => cleanNumber(match[1]))
        .filter((value) => Number.isFinite(value));
      const greater = knownQuantities[0]
        ?? values.find((value) => value !== difference)
        ?? null;
      result.comparison = { greater, lesser: null, difference, type: 'reduction-or-comparison' };
      result.difference = difference;
      result.unknownPosition ??= 'smaller-quantity';
    } else {
      const greater = Math.max(first, second);
      const lesser = Math.min(first, second);
      result.comparison = { greater, lesser, difference: null, type: 'comparison' };
      result.unknownPosition ??= /how many (?:more|fewer)|difference/.test(lower) ? 'difference' : 'comparison-symbol';
    }
  }

  if (/\b(?:altogether|in all|combined|total)\b/i.test(lower) && values.length >= 2 && !/\b(?:groups?|each|times|multiply)\b/i.test(lower)) {
    result.parts = [first, second];
    result.whole = null;
    result.unknownPosition ??= 'whole';
  }

  const groupsPattern = lower.match(new RegExp(`\\b(${NUMBER_SOURCE})\\s+(?:bags?|boxes?|packs?|trays?|groups?|rows?)\\s+(?:with|of)\\s+(${NUMBER_SOURCE})\\b`, 'i'))
    || lower.match(new RegExp(`\\beach\\s+of\\s+(${NUMBER_SOURCE})\\s+[a-z][a-z'-]*(?:\\s+[a-z][a-z'-]*){0,2}\\s+(?:has|have|holds?|contains?)\\s+(${NUMBER_SOURCE})\\b`, 'i'));
  if (groupsPattern) {
    result.numberOfGroups = cleanNumber(groupsPattern[1]);
    result.groups = result.numberOfGroups;
    result.groupSize = cleanNumber(groupsPattern[2]);
    result.multiplier = result.numberOfGroups;
    result.unknownPosition ??= /\b(?:how many|altogether|total|in all)\b/.test(lower) ? 'product' : null;
  }

  if (info.divisionInterpretation === 'sharing') {
    result.whole = first;
    result.numberOfGroups = second;
    result.groups = second;
    result.divisor = second;
    result.unknownPosition ??= 'group-size';
  } else if (info.divisionInterpretation === 'grouping') {
    const groupMatch = lower.match(new RegExp(`\\b(?:groups?|bags?|boxes?|packs?)\\s+of\\s+(${NUMBER_SOURCE})`, 'i'))
      || lower.match(new RegExp(`\\bhow\\s+many\\s+(${NUMBER_SOURCE})(?:s|'s)?\\s+(?:are\\s+there\\s+)?(?:in|from)\\b`, 'i'));
    const totalMatch = lower.match(new RegExp(`\\b(?:from|out of)\\s+(${NUMBER_SOURCE})`, 'i'));
    const groupSize = cleanNumber(groupMatch?.[1]) ?? first;
    const total = cleanNumber(totalMatch?.[1])
      ?? values.find((value) => value !== groupSize)
      ?? second;
    result.whole = total;
    result.groupSize = groupSize;
    result.divisor = groupSize;
    result.unknownPosition ??= 'group-count';
  }

  if (equation) {
    if (equation.operator === 'multiplication') {
      result.multiplier = equation.right.type === 'number' ? equation.right.value : result.multiplier;
    }
    if (equation.operator === 'division') {
      result.divisor = equation.right.type === 'number' ? equation.right.value : result.divisor;
      result.quotient = equation.result.type === 'number' ? equation.result.value : null;
    }
  }

  const dimensions = [...lower.matchAll(new RegExp(`(${NUMBER_SOURCE})\\s*(mm|cm|m|km)?\\s*(?:long|length|wide|width)`, 'gi'))];
  if (dimensions.length >= 2) {
    const lengthMatch = dimensions.find((match) => /long|length/i.test(match[0]));
    const widthMatch = dimensions.find((match) => /wide|width/i.test(match[0]));
    const length = cleanNumber(lengthMatch?.[1] ?? dimensions[0]?.[1]);
    const width = cleanNumber(widthMatch?.[1] ?? dimensions[1]?.[1]);
    result.measurement = { length, width, unit: (lengthMatch?.[2] ?? widthMatch?.[2] ?? result.unit ?? '').toLowerCase() || null };
    if (family === 'find-perimeter') result.unknownPosition ??= 'perimeter';
    if (family === 'find-area') result.unknownPosition ??= 'area';
  }

  if (family === 'calculate-duration' && info.times?.length >= 2) {
    const start = `${String(info.times[0].hours).padStart(2, '0')}:${String(info.times[0].minutes).padStart(2, '0')}`;
    const end = `${String(info.times[1].hours).padStart(2, '0')}:${String(info.times[1].minutes).padStart(2, '0')}`;
    const explicit24HourNextDay = !info.times[0]?.meridiem && !info.times[1]?.meridiem
      && info.times[0]?.sourceHours >= 12 && info.times[1]?.sourceHours < 12;
    const explicitNextDay = Boolean(info.times[0]?.meridiem && info.times[1]?.meridiem)
      || explicit24HourNextDay;
    result.measurement = {
      startTime: start,
      endTime: end,
      durationMinutes: durationMinutes(start, end, { allowNextDay: explicitNextDay }),
      crossesMidnight: explicitNextDay && parseTimeToMinutes(end) < parseTimeToMinutes(start),
      unit: 'minutes',
    };
    result.unknownPosition ??= 'duration';
  }

  if (family === 'draw-hands') result.unknownPosition ??= 'hands';
  if (family === 'plot-coordinates') result.unknownPosition ??= 'point';
  if (/\b(?:change|how much back)\b/i.test(lower) && /(?:£|\bp(?:ence)?\b|pounds?)/i.test(lower)) {
    result.unknownPosition ??= 'change';
  }
  if (family === 'convert-measure') {
    // Template literals require the doubled slash: a lone `\b` becomes a
    // backspace character before RegExp sees it.  Order compound units first
    // so `cm`, `kg` and `min` cannot be shortened to a one-letter unit.
    const units = 'km|cm|mm|kg|ml|min|m|g|l|h|£|p';
    const conversion = lower.match(new RegExp(`\\b(${NUMBER_SOURCE})\\s*(${units})\\s+to\\s+(${units})\\b`, 'i'));
    if (conversion) {
      result.measurement = {
        fromValue: cleanNumber(conversion[1]),
        fromUnit: conversion[2],
        toUnit: conversion[3],
        unit: conversion[2],
      };
    }
    result.unknownPosition ??= 'converted-value';
  }

  if (family === 'read-scale') {
    const intervalMatch = lower.match(new RegExp(`(?:intervals?|steps?)\\s+(?:of|represent)\\s+(${NUMBER_SOURCE})`, 'i'));
    result.interval = cleanNumber(intervalMatch?.[1]) ?? null;
    result.scale = result.interval ? { interval: result.interval, unit: result.unit } : null;
    result.unknownPosition ??= 'scale-value';
  }
  if (family.includes('chart')) {
    result.chart = { construction: family === 'construct-chart', suppliedData: family === 'interpret-chart' };
    if (family === 'construct-chart') result.unknownPosition ??= 'chart-data';
  }
  if (wholeNumbers.some((number) => String(Math.abs(number)).includes('0'))) result.zeroPlaceholder = true;
  return result;
}

function numericCharacteristics(info, source, structure) {
  const numbers = info.numbers ?? [];
  const rawNumbers = numbers.map((item) => item.raw ?? String(item.value));
  const values = info.numericValues ?? [];
  const zeroInside = values.some((value) => Number.isInteger(value) && String(Math.abs(value)).slice(1, -1).includes('0'));
  const decimals = rawNumbers.map(decimalPlacesFromText).filter((places) => places > 0);
  const requiresExchange = /\b(?:exchange|regroup)\b/i.test(source)
    || (info.operations.includes('addition') && values.length >= 2 && Number.isInteger(values[0]) && Number.isInteger(values[1])
      && String(Math.abs(values[0] + values[1])).length > Math.max(integerDigitCount(values[0]), integerDigitCount(values[1])));
  return {
    numberOfValues: values.length,
    digitCounts: values.map(integerDigitCount),
    maximumDigits: Math.max(0, ...values.map(integerDigitCount)),
    hasZeroPlaceholder: zeroInside || Boolean(structure.zeroPlaceholder),
    decimalPlaces: decimals,
    hasDecimals: decimals.length > 0,
    fractions: (info.fractions ?? []).map(({ numerator, denominator }) => ({ numerator, denominator })),
    hasCommonDenominator: (info.fractions ?? []).length > 1 && new Set(info.fractions.map((fraction) => fraction.denominator)).size === 1,
    requiresExchange,
    crossesPlaceValueBoundary: /\b(?:bridge|cross(?:ing)? (?:a )?(?:ten|hundred|thousand)|through zero)\b/i.test(source),
    hasRemainder: structure.remainder !== undefined,
    usesNegativeValues: values.some((value) => value < 0),
    unitConversion: /\b(?:convert|conversion)\b/i.test(source),
    proportionalRelationship: /\b(?:times as (?:many|much|long)|scaled|twice|three times)\b/i.test(source),
    exactVisualScalingReasonable: values.length >= 2 && values.every((value) => value >= 0) && Math.max(...values, 1) / Math.max(1, Math.min(...values.filter((value) => value > 0), 1)) <= 12,
  };
}

function answerProtection(family, source, structure, equation) {
  const prohibited = new Set();
  const reasons = [];
  const add = (token, reason) => { prohibited.add(token); reasons.push(reason); };
  if (equation?.unknownPosition) add(equation.unknownPosition, 'The equation’s missing value is the pupil task.');
  if (family === 'round') add('rounded-value', 'The rounded value must remain a pupil decision.');
  if (family === 'compare') add(structure.unknownPosition ?? 'comparison-symbol', 'The comparison relationship must not be completed for the pupil.');
  if (family === 'construct-chart') add('chart-data', 'A construction chart must keep the required bars, points or labels blank.');
  if (family === 'equivalent-fraction') add(structure.unknownPosition ?? 'equivalent-fraction', 'Only the requested equivalent-fraction slot may be hidden.');
  if (/\b(?:draw|show)\b.*\b(?:hands?|clock)\b/i.test(source)) add('clock-hands', 'The pupil is being asked to set the clock hands.');
  if (family === 'find-area') add('area', 'The calculated area must not be printed in the model.');
  if (family === 'find-perimeter') add('perimeter', 'The calculated perimeter must not be printed in the model.');
  if (family === 'locate-on-number-line') add('line-position', 'The pupil must choose the position on the supplied scale.');
  if (structure.unknownPosition === 'fraction-of-quantity-result') add('fraction-of-quantity-result', 'The selected fraction of the quantity is the pupil calculation.');
  if (structure.unknownPosition === 'remainder') add('remainder', 'The leftover quantity is the pupil calculation.');
  if (family === 'find-error' || family === 'correct-error') add('correction', 'The source misconception must remain visible for analysis.');
  const risk = prohibited.size >= 2 || equation?.unknownPosition ? 'high' : prohibited.size ? 'medium' : 'low';
  return {
    risk,
    prohibitedAutoFill: [...prohibited],
    reasons: [...new Set(reasons)],
    preserveSourceError: family === 'find-error' || family === 'correct-error',
  };
}

function interpretationConfidence(info, family, structure, domains, equation) {
  let score = 0;
  if (domains.length && domains[0].score >= 7) score += 3;
  if (equation?.exact) score += 3;
  if (structure.comparison || structure.rounding || structure.measurement || structure.scale
    || structure.numerator !== null || structure.numberOfGroups !== null
    || (Number.isFinite(structure.originalValue) && Number.isInteger(structure.multiplier) && Number.isFinite(structure.scaledValue))) score += 2;
  if (info.operations.length === 1) score += 1;
  const source = info.analysedText ?? '';
  const explicitTaskStructure =
    (family === 'identify-place-value' && /\bvalue\s+of\s+(?:the\s+)?(?:digit\s*)?\d/i.test(source))
    || (family === 'partition' && /\b(?:partition|expanded form|decompose)\b/i.test(source))
    || (family === 'represent' && /\b(?:dienes?|base[- ]ten|place[- ]value blocks?|array|number line|fraction strip|bar model)\b/i.test(source))
    || (family === 'compare' && (info.comparisonLanguage?.length ?? 0) > 0 && /\b(?:put|write|choose|insert|place)\b/i.test(source))
    || (family === 'construct-chart' && /\b(?:draw|construct|complete|make)\b[\s\S]*\b(?:chart|graph|pictogram)\b/i.test(source))
    || (family === 'draw-hands' && /\b(?:draw|show)\b[\s\S]*\b(?:hands?|clock)\b/i.test(source) && (info.times?.length ?? 0) >= 1)
    || (family === 'calculate' && info.operations.length === 1 && (/\b(?:calculate|work out|solve|find)\b|\d\s*[+\u2212\-\u00d7\u00f7]\s*\d/i.test(source) || directMoreLessChange(source)));
  if (explicitTaskStructure) score += 2;
  if (info.operations.length > 1 && !/\b(?:two-step|multi-step)\b/i.test(info.analysedText)) score -= 2;
  if (family === 'word-problem' || family === 'explain') score -= 1;
  if (score >= 5) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}

function compoundTaskSignals(info, source) {
  const signals = [];
  const arithmeticExpressions = source.match(/(?:\d[\d,]*(?:\.\d+)?)\s*[+−\-×÷]\s*(?:\d[\d,]*(?:\.\d+)?)/g) ?? [];
  if (arithmeticExpressions.length > 1) signals.push('multiple-calculations');
  if ((source.match(/=/g) ?? []).length > 1) signals.push('multiple-equations');
  if ((info.subparts?.length ?? 0) > 1) signals.push('multiple-subparts');
  if (/(?:\b(?:and|then)\b|[.?!])\s*(?:explain|justify|prove|describe|show\s+(?:your\s+)?(?:method|working)|give\s+(?:a\s+)?reason)\b/i.test(source)) {
    signals.push('calculation-and-reasoning');
  }
  if (/\b(?:and(?:\s+then)?|then)\s+(?:calculate|work\s+out|find|round|convert|compare|order|mark|plot|draw|complete|add|subtract|multiply|divide|double|halve)\b/i.test(source)) {
    signals.push('sequential-tasks');
  }
  if ((source.match(/\b(?:how\s+many|how\s+much|what\s+is|what\s+are)\b/gi) ?? []).length > 1) {
    signals.push('multiple-questions');
  }
  if (/\bbetween\s+each\s+pair\b/i.test(source) && (info.numericValues?.length ?? 0) > 2) signals.push('multiple-comparison-pairs');
  const locationTask = source.match(/\b(?:mark|place|locate|plot)\s+([\s\S]*?)\s+(?:on|along)\s+(?:an?\s+)?number\s+line\b/i);
  if (locationTask && /\band\b/i.test(locationTask[1])) signals.push('multiple-line-targets');
  const fractionOfTasks = source.match(/\b\d+\s*\/\s*\d+\s+of\s+\d[\d,]*/gi) ?? [];
  if (fractionOfTasks.length > 1) signals.push('multiple-fraction-calculations');
  if (/\b\d+\s+\d+\s*\/\s*\d+\s*=/.test(source)) signals.push('mixed-fraction-equality');
  if (/\barea\b[\s\S]*\bperimeter\b|\bperimeter\b[\s\S]*\barea\b/i.test(source)) signals.push('area-and-perimeter');
  return [...new Set(signals)];
}

function rationalAnswerValue(value) {
  const rational = parseRational(value);
  if (!rational) return null;
  if (rational.denominator === 1) return rational.numerator;
  let finiteDenominator = rational.denominator;
  while (finiteDenominator % 2 === 0) finiteDenominator /= 2;
  while (finiteDenominator % 5 === 0) finiteDenominator /= 5;
  return finiteDenominator === 1 ? rational.numerator / rational.denominator : null;
}

function directBinaryAnswer(source, info, family) {
  if (family !== 'calculate') return null;
  const pattern = new RegExp(`(^|[^\\d/.,])(${NUMBER_SOURCE})\\s*([+\\-×÷]|\\s/\\s)\\s*(${NUMBER_SOURCE})(?![\\d/,])`, 'g');
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) return null;
  const match = matches[0];
  const expressionEnd = match.index + match[0].length;
  const trailing = source.slice(expressionEnd);
  if (/^\s*=\s*[−-]?\d/.test(trailing)) return null;
  const directPrompt = /\b(?:calculate|work out|solve|find|what is|give the answer)\b/i.test(source)
    || /^\s*[−-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*[+\-×÷]/.test(source);
  if (!directPrompt || (info.fractions?.length ?? 0) > 0) return null;
  const left = parseRational(match[2].replaceAll(',', ''));
  const right = parseRational(match[4].replaceAll(',', ''));
  if (!left || !right) return null;
  const operator = match[3].trim();
  const result = operator === '+' ? addRationals(left, right)
    : operator === '-' ? subtractRationals(left, right)
      : operator === '×' ? multiplyRationals(left, right)
        : divideRationals(left, right);
  if (!result) return null;
  // A whole-number division with a remainder may require a remainder, a
  // fraction or a decimal depending on wording. Never choose one silently.
  if ((operator === '÷' || operator === '/')
    && left.denominator === 1 && right.denominator === 1
    && result.denominator !== 1) return null;
  const answer = rationalAnswerValue(result);
  return answer === null ? null : { answer, source: 'direct-calculation' };
}

function uniqueDigitValueAnswer(source, info, family) {
  if (family !== 'identify-place-value' || (info.numericValues?.length ?? 0) !== 2) return null;
  const match = source.match(/\bvalue\s+of\s+(?:the\s+)?(?:digit\s*)?(\d)\s+in\s+(\d[\d,]*(?:\.\d+)?)/i);
  if (!match) return null;
  const target = match[1];
  const numeral = match[2].replaceAll(',', '');
  if ([...numeral].filter((character) => character === target).length !== 1) return null;
  const decimalIndex = numeral.indexOf('.');
  const digitIndex = numeral.indexOf(target);
  const exponent = decimalIndex < 0
    ? numeral.length - digitIndex - 1
    : digitIndex < decimalIndex ? decimalIndex - digitIndex - 1 : decimalIndex - digitIndex;
  const answer = Number(target) * (10 ** exponent);
  return Number.isFinite(answer) ? { answer, source: 'digit-value' } : null;
}

function derivedAnswerForResolvedQuestion({ source, info, family, structure, equation, directCalculation = null }) {
  if (equation?.privateDerivedAnswer !== null && equation?.privateDerivedAnswer !== undefined) {
    return { answer: equation.privateDerivedAnswer, source: 'simple-equation' };
  }

  const direct = directCalculation ?? directBinaryAnswer(source, info, family);
  if (direct) return direct;

  const digitValue = uniqueDigitValueAnswer(source, info, family);
  if (digitValue) return digitValue;

  if (family === 'round' && structure.rounding && structure.roundingTargets?.length === 1) {
    const { target, lower, upper, midpoint } = structure.rounding;
    if ([target, lower, upper, midpoint].every(Number.isFinite) && target >= 0) {
      return { answer: target < midpoint ? lower : upper, source: 'rounding' };
    }
  }

  if (family === 'calculate-duration' && Number.isFinite(structure.measurement?.durationMinutes)) {
    return { answer: structure.measurement.durationMinutes, source: 'duration' };
  }

  if (family === 'calculate'
    && structure.unknownPosition === 'scaled-value'
    && Number.isFinite(structure.originalValue)
    && Number.isInteger(structure.multiplier)
    && Number.isFinite(structure.scaledValue)
    && /\b(?:calculate|work out|find|how many|how much|how long)\b|\?/i.test(source)) {
    const exact = structure.originalValue * structure.multiplier;
    if (Number.isFinite(exact) && exact === structure.scaledValue) {
      return { answer: exact, source: 'scaling' };
    }
  }

  if (family === 'calculate'
    && structure.unknownPosition === 'product'
    && Number.isSafeInteger(structure.numberOfGroups)
    && Number.isSafeInteger(structure.groupSize)
    && structure.numberOfGroups >= 0
    && structure.groupSize >= 0
    && (info.numericValues?.length ?? 0) === 2) {
    const product = structure.numberOfGroups * structure.groupSize;
    if (Number.isSafeInteger(product)) return { answer: product, source: 'repeated-groups' };
  }

  if (family === 'calculate'
    && structure.unknownPosition === 'result'
    && Number.isFinite(structure.startValue)
    && Number.isFinite(structure.change)
    && ['addition', 'subtraction'].includes(structure.operation)
    && (info.numericValues?.length ?? 0) === 2) {
    const signedChange = structure.operation === 'subtraction' ? -structure.change : structure.change;
    const answer = structure.startValue + signedChange;
    if (Number.isFinite(answer)) return { answer, source: 'direct-change' };
  }

  return null;
}

/**
 * Return an immutable-by-convention, serialisable interpretation. No property
 * here changes question wording or makes a private answer pupil-visible.
 */
export function analyseQuestion(input, overrides = {}) {
  const parsedInfo = asInfo(input);
  const source = normaliseMathsText(parsedInfo.analysedText ?? parsedInfo.rawText ?? '');
  const directChange = directMoreLessChange(source);
  const info = directChange && !(parsedInfo.operations ?? []).length
    ? { ...parsedInfo, operations: [directChange.operation] }
    : parsedInfo;
  const fractionEquality = parseFractionEquality(source);
  const equation = fractionEquality ? null : parseSimpleEquation(source);
  let domains = detectDomains(info, source, equation);
  if (fractionEquality) {
    const domainScores = new Map(domains.map((item) => [item.domain, item.score]));
    domainScores.set('Fractions', Math.max(domainScores.get('Fractions') ?? 0, 20));
    domains = scoreMapToRankedArray(domainScores);
  }
  const operationOverride = ['addition', 'subtraction', 'multiplication', 'division'].includes(overrides.operation)
    ? overrides.operation
    : null;
  if (operationOverride) {
    const operationDomain = {
      addition: 'Addition', subtraction: 'Subtraction', multiplication: 'Multiplication', division: 'Division',
    }[operationOverride];
    const domainScores = new Map(domains.map((item) => [item.domain, item.score]));
    domainScores.set(operationDomain, Math.max(domainScores.get(operationDomain) ?? 0, 20));
    domains = scoreMapToRankedArray(domainScores);
  }
  const questionFamily = overrides.questionFamily && QUESTION_FAMILIES.includes(overrides.questionFamily)
    ? overrides.questionFamily
    : fractionEquality ? 'equivalent-fraction' : inferQuestionFamily(source, info, equation);
  const structure = deriveWordStructure(info, source, questionFamily, equation);
  if (fractionEquality) {
    structure.fractions = fractionEquality.fractions;
    structure.unknownPosition = fractionEquality.unknownPosition;
    structure.equality = { operator: 'equivalent-fractions', privateDerivedAnswer: null };
  }
  if (operationOverride) structure.operation = operationOverride;
  if (overrides.unknownPosition) structure.unknownPosition = overrides.unknownPosition;
  const purpose = overrides.representationPurpose && REPRESENTATION_PURPOSES.includes(overrides.representationPurpose)
    ? overrides.representationPurpose
    : inferRepresentationPurpose(questionFamily, source, info);
  const protection = answerProtection(questionFamily, source, structure, equation);
  const confidence = overrides.confidence && ['high', 'medium', 'low'].includes(overrides.confidence)
    ? overrides.confidence
    : interpretationConfidence(info, questionFamily, structure, domains, equation);
  const numerical = numericCharacteristics(info, source, structure);
  const compoundSignals = compoundTaskSignals(info, source);
  const directCalculation = directBinaryAnswer(source, info, questionFamily);
  const exactArithmeticAnswer = directCalculation
    || (equation?.privateDerivedAnswer !== null && equation?.privateDerivedAnswer !== undefined);
  const needsReview = confidence === 'low'
    || info.operations.length > 1
    || (info.divisionInterpretation === 'ambiguous' && !exactArithmeticAnswer)
    || info.hasExistingRepresentation
    || (info.subparts?.length ?? 0) > 1
    || ['find-error', 'correct-error'].includes(questionFamily)
    || (questionFamily === 'round' && !structure.rounding)
    || (questionFamily === 'draw-hands' && (info.times?.length ?? 0) !== 1)
    || compoundSignals.length > 0
    || (questionFamily === 'calculate-duration' && !Number.isFinite(structure.measurement?.durationMinutes))
    || (questionFamily === 'word-problem' && !structure.comparison && !structure.numberOfGroups && !structure.whole);
  const status = info.hasExistingRepresentation
    ? 'needs-referenced-visual'
    : compoundSignals.length > 0 || (info.subparts?.length ?? 0) > 1 || info.operations.length > 1
      ? 'compound'
      : needsReview ? 'ambiguous' : 'resolved';
  const derived = confidence === 'high'
    && status === 'resolved'
    && !needsReview
    && compoundSignals.length === 0
    && !info.hasExistingRepresentation
    ? derivedAnswerForResolvedQuestion({ source, info, family: questionFamily, structure, equation, directCalculation })
    : null;
  return {
    version: 2,
    sourceText: info.rawText ?? source,
    normalisedText: source,
    curriculumDomain: overrides.domain && YEAR4_DOMAINS.includes(overrides.domain) ? overrides.domain : domains[0]?.domain ?? 'Mixed or multi-step',
    domains,
    questionFamily,
    mathematicalStructure: structure,
    numericalCharacteristics: numerical,
    representationPurpose: purpose,
    answerProtection: protection,
    confidence,
    needsReview,
    status,
    compoundSignals,
    correctionOptions: ['domain', 'operation', 'questionFamily', 'unknownPosition', 'representationPurpose'],
    privateDerived: derived ? { ...derived, pupilVisible: false } : null,
    equation,
    parserWarnings: [...(info.warnings ?? [])],
  };
}

export const interpretQuestion = analyseQuestion;

function isFamilyContraindicated(family, interpretation) {
  const questionFamily = interpretation.questionFamily;
  const purpose = interpretation.representationPurpose;
  const source = interpretation.normalisedText;
  const comparisonSignTask = questionFamily === 'compare'
    && /(?:<|>|≤|≥|=)[\s\S]*\b(?:between|symbol|sign|pair)\b|\b(?:between|symbol|sign|pair)\b[\s\S]*(?:<|>|≤|≥|=)/i.test(source);
  if (questionFamily === 'find-perimeter' && ['area-model', 'area-square-grid', 'fraction-wall', 'fraction-strip'].includes(family)) return true;
  if (questionFamily === 'find-area' && ['perimeter-trace', 'comparison-bar', 'fraction-wall'].includes(family)) return true;
  if (questionFamily === 'compare' && ['part-whole', 'part-whole-number-bond'].includes(family)) return true;
  if (comparisonSignTask && ['comparison-bar', 'comparison-bar-model', 'empty-number-line', 'empty-calculation-line'].includes(family)) return true;
  if (questionFamily === 'calculate'
    && interpretation.mathematicalStructure.startValue !== null
    && interpretation.mathematicalStructure.change !== null
    && ['comparison-bar', 'place-value-exchange', 'place-value-exchange-workspace'].includes(family)) return true;
  if (questionFamily === 'equivalent-fraction' && ['fraction-set', 'fraction-quantity-bar'].includes(family)) return true;
  if (questionFamily === 'construct-chart' && ['line-graph', 'bar-chart', 'pictogram'].includes(family) && !/\b(?:blank|construct|draw|complete)\b/i.test(source)) return true;
  if (purpose === 'support-reasoning-or-proof' && ['column-arithmetic', 'short-multiplication', 'short-division'].includes(family)) return true;
  if (interpretation.numericalCharacteristics.proportionalRelationship && family === 'part-whole') return true;
  return false;
}

function candidate(family, score, reason, purpose, options = {}) {
  return { family, score, reason, purpose, ...options };
}

function rankedIdealCandidates(interpretation) {
  const structure = interpretation.mathematicalStructure;
  const family = interpretation.questionFamily;
  const domain = interpretation.curriculumDomain;
  const candidates = [];
  const add = (id, score, reason, purpose = interpretation.representationPurpose, options = {}) => {
    if (!isFamilyContraindicated(id, interpretation)) candidates.push(candidate(id, score, reason, purpose, options));
  };

  if (family === 'calculate' && structure.startValue !== null && structure.change !== null) {
    add('change-bar', 104, 'Shows the known starting value and exact increase or decrease, with the result left blank.');
  } else if (family === 'locate-on-number-line' && structure.scale) {
    add('number-line', 100, 'Uses the exact endpoints and equal fraction intervals named in the question.', 'record-thinking');
  } else if (family === 'round') {
    if (structure.rounding) {
      add('rounding-number-line', 100, 'Shows the two neighbouring multiples and the exact midpoint.');
      add('four-digit-number-line', 74, 'Offers a broader number-line alternative when the surrounding interval matters.');
    }
  } else if (domain === 'Number and place value') {
    if (family === 'find-error') {
      add('place-value', 101, 'Aligns the digits so the stated place-value misconception remains visible for discussion.');
      add('place-value-counters', 89, 'Offers a concrete alternative without silently correcting the pupil’s misconception.');
    } else if (/\broman numeral/i.test(interpretation.normalisedText)) add('roman-numeral-builder', 100, 'Links Roman and Arabic numeral structures without decorative pseudo-Roman text.');
    else if (/\b(?:negative|temperature|below zero)\b/i.test(interpretation.normalisedText)) add('negative-number-line', 98, 'Keeps intervals equal while making movement through zero visible.');
    else if (family === 'order' || family === 'compare') add('ordering-comparison-line', 94, 'Places the values on one ordered scale while keeping the required comparison blank.');
    else if (family === 'partition') {
      add('partition-tree', 98, 'Connects the whole to editable place-value parts.');
      add('arrow-card-builder', 83, 'Makes recombination and expanded notation visible.');
      add('place-value', 78, 'Keeps every digit aligned by place.');
    } else {
      add('place-value', 96, 'Keeps each digit aligned to its place value.');
      add('place-value-counters', 82, 'Offers a countable concrete alternative without relying on colour.');
      add('base-ten', 76, 'Shows powers-of-ten units where the visual quantity remains manageable.');
    }
  }

  if (Number.isFinite(structure.originalValue)
    && Number.isInteger(structure.multiplier)
    && Number.isFinite(structure.scaledValue)) {
    add('scaling-bar', 103, 'Binds the known original, multiplicative scale factor and protected result without substituting defaults.');
  }

  if (structure.comparison) {
    add('comparison-bar', 99, 'Aligns the two quantities and keeps the unknown comparison relationship in the correct position.', 'expose-structure');
    add('empty-number-line', 73, 'Offers a distance-on-a-scale alternative for comparison subtraction.', 'support-calculation');
  } else if (structure.parts.length >= 2) {
    add('part-whole', 97, 'Shows the additive whole and its known parts without filling the unknown.', 'expose-structure');
    add('column-arithmetic', 74, 'Provides a place-value-aligned calculation scaffold where a written method helps.', 'support-calculation');
  }

  if (structure.numberOfGroups !== null || domain === 'Multiplication' || domain === 'Division') {
    const division = domain === 'Division' || interpretation.equation?.operator === 'division';
    if (division && structure.unknownPosition === 'remainder' && structure.numberOfGroups !== null) {
      add('sharing-division', 104, 'Shows the exact equal shares and keeps the leftover quantity blank.');
      add('division-number-line', 82, 'Offers an exact equal-jump alternative with the remainder protected.');
    } else if (division && structure.unknownPosition === 'remainder' && structure.groupSize !== null) {
      add('grouping-division', 104, 'Shows complete groups of the stated size and keeps the leftover quantity blank.');
      add('division-number-line', 82, 'Offers an exact equal-jump alternative with the remainder protected.');
    } else if (division && structure.unknownPosition === 'group-size') {
      add('sharing-division', 99, 'Represents a total shared between a known number of equal groups.');
      add('equal-groups', 82, 'Provides a compact equal-groups alternative.');
    } else if (division && structure.unknownPosition === 'group-count') {
      add('grouping-division', 99, 'Shows how many equal groups of the stated size can be made.');
      add('division-number-line', 82, 'Uses equal jumps to make the grouping count visible.');
    } else if (interpretation.numericalCharacteristics.proportionalRelationship) {
      add('scaling-bar', 98, 'Shows multiplicative scaling rather than treating it as repeated addition.');
      add('multiplication-bar', 78, 'Keeps equal sections and the unknown total structurally clear.');
    } else if (/\b(?:array|rows?|columns?)\b/i.test(interpretation.normalisedText)) {
      add('array', 98, 'Rows and columns define the multiplicative structure.');
      add('area-model', 87, 'Connects the factors to a rectangular grid.');
    } else if (interpretation.equation?.operator === 'multiplication' && interpretation.numericalCharacteristics.maximumDigits >= 2) {
      add('area-model', 92, 'Partitions the factors while retaining their place-value meaning.');
      add('short-multiplication', 80, 'Provides a formal-method frame after the structure is established.');
    } else {
      add('equal-groups', 95, 'Keeps the number of groups and group size distinct.');
      add('array', 83, 'Offers a rotated, commutative alternative.');
      add('repeated-addition-number-line', 74, 'Shows equal jumps without implying unequal groups.');
    }
  }

  if (domain === 'Addition' || domain === 'Subtraction' || (family === 'missing-number' && interpretation.equation)) {
    if (family === 'missing-number' || interpretation.equation?.unknownPosition) {
      add('equation-balance', 97, 'Keeps both sides of the equality linked while leaving the unknown blank.');
      add('missing-number-strip', 91, 'Places the unknown in its exact equation position.');
    } else if (/\b(?:exchange|regroup|column|written method)\b/i.test(interpretation.normalisedText) || interpretation.numericalCharacteristics.maximumDigits >= 3) {
      add('column-arithmetic', 91, 'Aligns digits by place and leaves the answer and exchanges for the pupil where needed.');
      add(domain === 'Addition' ? 'expanded-column-addition' : 'expanded-column-subtraction', 82, 'Makes place-value contributions and exchanges explicit.');
      add('place-value-exchange', 76, 'Shows why an exchange preserves value.');
    } else {
      add('empty-number-line', 84, 'Supports counting on, counting back or finding a difference with editable jumps.');
      add('part-whole', 73, 'Offers an additive relationship scaffold when the question is not comparison-based.');
    }
  }

  if (domain === 'Fractions') {
    // A supplied fraction scale is already the exact representation for a
    // locating task. Do not dilute it with a generic strip: that can make a
    // high-confidence number-line task look ambiguous and prevent a safe
    // first draft from attaching the model at all.
    if (family === 'locate-on-number-line') {
      // The exact number-line candidate was added above.
    } else if (family === 'equivalent-fraction') {
      add('equivalent-fraction-strips', 100, 'Vertically aligns equal wholes so equivalent points can be compared accurately.');
      add('fraction-wall', 91, 'Shows denominator rows on a constant whole.');
    } else if (family === 'compare-fractions') {
      const benchmarkDistance = /\bcloser\s+to\b/i.test(interpretation.normalisedText);
      add('fraction-number-line', benchmarkDistance ? 100 : 96, benchmarkDistance
        ? 'Shows the benchmark and both fractions on one consistently partitioned scale.'
        : 'Locates both fractions on one consistently partitioned scale.');
      add('fraction-wall', 88, 'Provides an equal-whole comparison alternative.');
    } else if (structure.whole !== null && structure.denominator !== null) {
      add('fraction-quantity-bar', 98, 'Divides the known quantity into equal denominator parts while keeping the selected result hidden.');
      add('fraction-set', 84, 'Offers a collection-based alternative when discrete objects suit the context.');
    } else {
      add('fraction-strip', 96, 'Uses genuinely equal parts and can hide the required numerator or denominator.');
      add('fraction-area', 80, 'Offers an area alternative where the partition remains readable.');
    }
  }

  if (domain === 'Decimals') {
    if (/\b(?:number line|order|compare)\b/i.test(interpretation.normalisedText)) add('decimal-number-line', 96, 'Keeps decimal intervals exact on a zoomed scale.');
    else {
      add('decimal-place-value', 95, 'Keeps the decimal point, tenths and hundredths aligned.');
      add('tenths-hundredths-grid', 84, 'Connects decimal notation to a printable shaded grid.');
    }
  }

  if (domain === 'Money') {
    add('money', 98, 'Represents pounds and pence clearly without tiny photographic coins.');
    if (/\b(?:change|how much more|difference)\b/i.test(interpretation.normalisedText)) add('comparison-bar', 74, 'Supports the change or difference relationship while retaining the result blank.');
  }

  if (domain === 'Time') {
    if (family === 'calculate-duration') {
      add('duration-timeline', 99, 'Shows start, end and equal time jumps without crossing-hour errors.');
      add('clock', 82, 'Links the timeline to an analogue representation where useful.');
    } else {
      add('clock', 96, 'Links analogue and digital time while keeping required hands or labels blank.');
    }
  }

  if (['Length', 'Mass', 'Capacity'].includes(domain)) {
    if (family === 'convert-measure') add('unit-conversion-bridge', 98, 'Shows the exact multiplicative unit relationship without inventing a quantity.');
    else if (family === 'read-scale') add('reading-scale', 96, 'Uses mathematically consistent intervals and a pointer at a valid value.');
    else if (domain === 'Length') add('ruler-length-line', 88, 'Provides an exact ticked line for measuring a segment.');
  }

  if (family === 'find-perimeter') add('perimeter-trace', 100, 'Highlights the boundary rather than the surface of the shape.');
  if (family === 'find-area') add('area-square-grid', 100, 'Uses square units and makes area distinct from perimeter.');

  if (domain === 'Geometry') {
    if (/\bsymmetry|reflect/i.test(interpretation.normalisedText)) add('symmetry-grid', 97, 'Keeps matching reflected distances on either side of the mirror line.');
    else if (/\b(?:sort|classify)\b/i.test(interpretation.normalisedText)) add('shape-sort-workspace', 96, 'Provides a blank Carroll or Venn structure for pupil classification.');
    else if (/\bangle/i.test(interpretation.normalisedText)) add('angle-comparator', 96, 'Compares the angle to a right angle without pre-labelling the classification.');
    else add('shape-property-model', 88, 'Marks sides, angles and parallel relationships across varied orientations.');
  }

  if (domain === 'Position and direction') {
    if (/\b(?:clockwise|anticlockwise|turn)\b/i.test(interpretation.normalisedText)) add('turn-model', 98, 'Shows start and end directions for the requested turn.');
    else add('coordinate-grid', 98, 'Uses correctly labelled first-quadrant axes and exact intervals.');
  }

  if (domain === 'Statistics') {
    if (/\bpictogram/i.test(interpretation.normalisedText)) add('pictogram', 98, 'Keeps the key explicit and only uses partial symbols when the key supports them.');
    else if (/\b(?:line graph|time graph|continuous)\b/i.test(interpretation.normalisedText)) add('line-graph', 98, 'Uses a continuous scale and preserves the supplied order of data.');
    // When the task explicitly asks pupils to construct a bar chart, the
    // chart is the required recording scaffold. A source table may supply the
    // data, but it must not divert the recommendation back to another table.
    else if (family === 'construct-chart' && /\bbar\s+chart\b/i.test(interpretation.normalisedText)) add('bar-chart', 100, 'Supplies blank, consistently scaled axes so pupils construct the requested bar chart.');
    else if (/\b(?:tally|frequency|table)\b/i.test(interpretation.normalisedText)) add('tally-frequency-table', 96, 'Provides editable categories and frequencies without completing pupil entries.');
    else add('bar-chart', 96, 'Uses consistent axes, gaps and scale for categorical data.');
  }

  if (!candidates.length) {
    // A broad assertion such as “explain why every square is a rectangle”
    // should not receive an arbitrary picture merely because it asks for
    // reasoning. The existing writing space remains available on the block.
    if (interpretation.questionFamily !== 'justify' && interpretation.representationPurpose === 'support-reasoning-or-proof') add('lined-reasoning-space', 70, 'Provides deliberate room for explanation rather than a misleading decorative model.');
    else if (interpretation.representationPurpose === 'blank-pupil-workspace') add('squared-workspace', 65, 'Provides a neutral mathematical workspace when a supplied model would be unhelpful.');
  }
  return candidates;
}

function availableFamilyFor(idealFamily, available) {
  if (!available || !available.size) return idealFamily;
  if (available.has(idealFamily)) return idealFamily;
  const alias = MODEL_FAMILY_ALIASES[idealFamily];
  if (alias && available.has(alias)) return alias;
  const fallback = MODEL_FAMILY_FALLBACKS[idealFamily];
  return fallback && available.has(fallback) ? fallback : null;
}

/**
 * Rank deep model recommendations. With `availableFamilies`, results are
 * translated only where a renderer exists; `idealFamily` preserves the more
 * specific Build 2 target for later registry expansion.
 */
export function rankModelRecommendations(input, options = {}) {
  const interpretation = input?.mathematicalStructure ? input : analyseQuestion(input, options.overrides);
  const available = options.availableFamilies
    ? new Set(Array.isArray(options.availableFamilies) ? options.availableFamilies : [...options.availableFamilies])
    : null;
  const byFamily = new Map();
  const contraindicatedFamilies = new Set();
  for (const ideal of rankedIdealCandidates(interpretation)) {
    if (isFamilyContraindicated(ideal.family, interpretation)) {
      contraindicatedFamilies.add(ideal.family);
      continue;
    }
    const family = availableFamilyFor(ideal.family, available);
    if (!family) continue;
    const candidateForAvailable = {
      ...ideal,
      family,
      idealFamily: ideal.family,
      fallback: family !== ideal.family,
      answerProtection: interpretation.answerProtection,
    };
    const existing = byFamily.get(family);
    if (!existing || candidateForAvailable.score > existing.score) byFamily.set(family, candidateForAvailable);
  }
  const recommendations = [...byFamily.values()]
    .sort((a, b) => b.score - a.score || a.family.localeCompare(b.family))
    .slice(0, options.limit ?? 3);
  return {
    interpretation,
    recommendations,
    contraindicatedFamilies: [...contraindicatedFamilies],
    noModelRecommended: recommendations.length === 0 || interpretation.confidence === 'low',
  };
}

export function isModelContraindicated(family, input) {
  const interpretation = input?.mathematicalStructure ? input : analyseQuestion(input);
  return isFamilyContraindicated(family, interpretation);
}
