/**
 * Constrained number variation for Maths Page Studio.
 *
 * This module intentionally supports a small set of unambiguous question
 * families.  It does not try to paraphrase word problems or make a plausible
 * looking number substitution.  A variant is produced only when the original
 * mathematical structure can be checked and preserved.
 *
 * The API is deterministic: pass a different `seed` when several versions of
 * the same question are needed.  No DOM, storage, or random global state is
 * used here, which keeps the results suitable for local persistence and tests.
 */

const NUMBER_TOKEN = '(?:0|[1-9]\\d{0,2}(?:,\\d{3})*|[1-9]\\d*)';
const TRAILING_MARKS = '(?:\\s*\\[\\s*\\d+\\s*(?:marks?|m)\\s*\\])?';
const TRAILING_PUNCTUATION = '(?:\\s*[.?!])?';

const DIRECT_OPERATION = new RegExp(
  `^\\s*(?:(?:calculate|work\\s*out|find|solve)\\s+)?(?<left>${NUMBER_TOKEN})\\s*(?<operator>[+−\\-×*xX÷/])\\s*(?<right>${NUMBER_TOKEN})(?:\\s*=\\s*(?:[?□_]+)?)?${TRAILING_PUNCTUATION}${TRAILING_MARKS}\\s*$`,
  'id'
);

const ROUNDING_PATTERNS = [
  new RegExp(
    `^\\s*round\\s+(?<target>${NUMBER_TOKEN})\\s+to\\s+(?:the\\s+)?nearest\\s+(?<magnitude>10|100|1,000|1000|ten|tens|hundred|hundreds|thousand|thousands)${TRAILING_PUNCTUATION}${TRAILING_MARKS}\\s*$`,
    'id'
  ),
  new RegExp(
    `^\\s*what\\s+is\\s+(?<target>${NUMBER_TOKEN})\\s+rounded\\s+to\\s+(?:the\\s+)?nearest\\s+(?<magnitude>10|100|1,000|1000|ten|tens|hundred|hundreds|thousand|thousands)${TRAILING_PUNCTUATION}${TRAILING_MARKS}\\s*$`,
    'id'
  ),
];

const FRACTION_WORD_NUMBERS = Object.freeze({
  a: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
});

const FRACTION_WORD_DENOMINATORS = Object.freeze({
  half: 2,
  halves: 2,
  third: 3,
  thirds: 3,
  quarter: 4,
  quarters: 4,
  fourth: 4,
  fourths: 4,
  fifth: 5,
  fifths: 5,
  sixth: 6,
  sixths: 6,
  seventh: 7,
  sevenths: 7,
  eighth: 8,
  eighths: 8,
  ninth: 9,
  ninths: 9,
  tenth: 10,
  tenths: 10,
  hundredth: 100,
  hundredths: 100,
});

const FRACTION_OF_NUMERIC = new RegExp(
  `^\\s*(?:(?:find|calculate|work\\s*out)\\s+|what\\s+is\\s+)?(?<numerator>\\d+)\\s*\\/\\s*(?<denominator>\\d+)\\s+of\\s+(?<whole>${NUMBER_TOKEN})${TRAILING_PUNCTUATION}${TRAILING_MARKS}\\s*$`,
  'id'
);

const FRACTION_OF_WORDS = new RegExp(
  `^\\s*(?:(?:find|calculate|work\\s*out)\\s+|what\\s+is\\s+)?(?<numeratorWord>${Object.keys(FRACTION_WORD_NUMBERS).join('|')})\\s+(?<denominatorWord>${Object.keys(FRACTION_WORD_DENOMINATORS).join('|')})\\s+of\\s+(?<whole>${NUMBER_TOKEN})${TRAILING_PUNCTUATION}${TRAILING_MARKS}\\s*$`,
  'id'
);

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

function unsupported(questionText, reason) {
  const originalText = String(questionText ?? '');
  return {
    supported: false,
    changed: false,
    type: 'unsupported',
    family: 'unsupported',
    originalText,
    questionText: originalText,
    variedText: originalText,
    text: originalText,
    reason,
    values: null,
    structure: null,
  };
}

function integerFromToken(token) {
  const compact = String(token ?? '').replace(/,/g, '');
  if (!/^\d+$/.test(compact)) return null;
  const value = Number(compact);
  return Number.isSafeInteger(value) ? value : null;
}

function digitWidth(value) {
  return String(Math.abs(value)).length;
}

function sameWidthRange(width, allowZero = false) {
  if (!Number.isInteger(width) || width < 1 || width > 15) return null;
  const min = width === 1 ? (allowZero ? 0 : 1) : 10 ** (width - 1);
  const max = (10 ** width) - 1;
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) return null;
  return { min, max };
}

function slotFromMatch(match, name, source) {
  const range = match.indices?.groups?.[name];
  if (!range) return null;
  return {
    role: name,
    start: range[0],
    end: range[1],
    raw: source.slice(range[0], range[1]),
  };
}

function formatLike(value, sourceToken) {
  const integer = Math.trunc(value);
  if (!Number.isSafeInteger(integer)) return String(value);
  return sourceToken.includes(',') ? integer.toLocaleString('en-GB') : String(integer);
}

function replaceSlots(source, replacements) {
  return [...replacements]
    .sort((left, right) => right.start - left.start)
    .reduce((text, replacement) => (
      `${text.slice(0, replacement.start)}${replacement.value}${text.slice(replacement.end)}`
    ), source);
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededIndex(length, seed, salt) {
  if (!length) return 0;
  return stableHash(`${seed}|${salt}`) % length;
}

function selectCandidate(candidates, seed, salt, predicate = () => true) {
  const eligible = candidates.filter(predicate);
  if (!eligible.length) return null;
  return eligible[seededIndex(eligible.length, seed, salt)];
}

function toLsdDigits(value, width) {
  const digits = String(value).padStart(width, '0').split('').map(Number);
  return digits.reverse();
}

function fromLsdDigits(digits) {
  const value = Number([...digits].reverse().join(''));
  return Number.isSafeInteger(value) ? value : null;
}

function digitChoices(value, width, position) {
  if (position >= width) return [0];
  if (value === 0 && width === 1) return [0];
  if (position === width - 1) return [1, 2, 3, 4, 5, 6, 7, 8, 9];
  return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
}

function profileSignature(columns) {
  return columns.map((column) => Number(column.out)).join('');
}

/** Return the carry-out pattern of a direct whole-number addition. */
export function additionCarryProfile(left, right) {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || left < 0 || right < 0) return null;
  const width = Math.max(digitWidth(left), digitWidth(right));
  const leftDigits = toLsdDigits(left, width);
  const rightDigits = toLsdDigits(right, width);
  const columns = [];
  let carryIn = 0;
  for (let position = 0; position < width; position += 1) {
    const total = leftDigits[position] + rightDigits[position] + carryIn;
    const carryOut = total >= 10 ? 1 : 0;
    columns.push({ position, carryIn, carryOut, out: carryOut });
    carryIn = carryOut;
  }
  return {
    kind: 'carry',
    columns,
    count: columns.filter((column) => column.carryOut).length,
    finalCarry: carryIn,
    signature: profileSignature(columns),
  };
}

/** Return the borrow-out pattern of a direct whole-number subtraction. */
export function subtractionBorrowProfile(minuend, subtrahend) {
  if (!Number.isSafeInteger(minuend) || !Number.isSafeInteger(subtrahend) || minuend < 0 || subtrahend < 0) return null;
  const width = Math.max(digitWidth(minuend), digitWidth(subtrahend));
  const topDigits = toLsdDigits(minuend, width);
  const bottomDigits = toLsdDigits(subtrahend, width);
  const columns = [];
  let borrowIn = 0;
  for (let position = 0; position < width; position += 1) {
    const adjustedTop = topDigits[position] - borrowIn;
    const borrowOut = adjustedTop < bottomDigits[position] ? 1 : 0;
    columns.push({ position, borrowIn, borrowOut, out: borrowOut });
    borrowIn = borrowOut;
  }
  return {
    kind: 'borrow',
    columns,
    count: columns.filter((column) => column.borrowOut).length,
    finalBorrow: borrowIn,
    signature: profileSignature(columns),
  };
}

/** Return the carry-out pattern for multiplication by one whole-number digit. */
export function multiplicationCarryProfile(multiplicand, multiplier) {
  if (!Number.isSafeInteger(multiplicand) || multiplicand < 0 || !Number.isInteger(multiplier) || multiplier < 1 || multiplier > 9) return null;
  const digits = toLsdDigits(multiplicand, digitWidth(multiplicand));
  const columns = [];
  let carryIn = 0;
  for (let position = 0; position < digits.length; position += 1) {
    const product = digits[position] * multiplier + carryIn;
    const carryOut = Math.floor(product / 10);
    columns.push({ position, carryIn, carryOut, out: carryOut });
    carryIn = carryOut;
  }
  return {
    kind: 'multiplication-carry',
    columns,
    count: columns.filter((column) => column.carryOut > 0).length,
    finalCarry: carryIn,
    signature: columns.map((column) => column.carryOut).join(','),
  };
}

/** Return exact bounds and the rounding side for a non-negative integer. */
export function roundingProfile(target, magnitude) {
  if (!Number.isSafeInteger(target) || target < 0 || ![10, 100, 1000].includes(magnitude)) return null;
  const lower = Math.floor(target / magnitude) * magnitude;
  const upper = lower + magnitude;
  const midpoint = lower + (magnitude / 2);
  const offset = target - lower;
  const relation = offset < magnitude / 2 ? 'down' : offset > magnitude / 2 ? 'up' : 'midpoint';
  return {
    magnitude,
    target,
    lower,
    upper,
    midpoint,
    offset,
    relation,
    roundedValue: relation === 'down' ? lower : upper,
  };
}

function operationAnalysis(questionText) {
  const match = DIRECT_OPERATION.exec(questionText);
  if (!match) return null;
  const left = integerFromToken(match.groups.left);
  const right = integerFromToken(match.groups.right);
  if (left === null || right === null) return null;
  const operator = match.groups.operator;
  const leftSlot = slotFromMatch(match, 'left', questionText);
  const rightSlot = slotFromMatch(match, 'right', questionText);
  if (!leftSlot || !rightSlot) return null;

  if (operator === '+') {
    const profile = additionCarryProfile(left, right);
    return {
      supported: true,
      type: 'addition',
      family: 'direct-addition',
      originalText: questionText,
      questionText,
      reason: null,
      values: { left, right, result: left + right },
      slots: [leftSlot, rightSlot],
      structure: {
        operation: 'addition',
        leftDigits: digitWidth(left),
        rightDigits: digitWidth(right),
        carryProfile: profile,
      },
    };
  }

  if (operator === '-' || operator === '−') {
    if (left < right) return unsupported(questionText, 'Subtraction would produce a negative result, so its borrow structure is not varied automatically.');
    const profile = subtractionBorrowProfile(left, right);
    return {
      supported: true,
      type: 'subtraction',
      family: 'direct-subtraction',
      originalText: questionText,
      questionText,
      reason: null,
      values: { minuend: left, subtrahend: right, result: left - right },
      slots: [leftSlot, rightSlot],
      structure: {
        operation: 'subtraction',
        minuendDigits: digitWidth(left),
        subtrahendDigits: digitWidth(right),
        borrowProfile: profile,
      },
    };
  }

  if (operator === '×' || operator === '*' || operator === 'x' || operator === 'X') {
    const leftIsOneDigit = left <= 9;
    const rightIsOneDigit = right <= 9;
    if (!leftIsOneDigit && !rightIsOneDigit) {
      return unsupported(questionText, 'Only multiplication with at least one one-digit factor is varied automatically.');
    }
    const multiplierSide = rightIsOneDigit ? 'right' : 'left';
    const multiplicand = multiplierSide === 'right' ? left : right;
    const multiplier = multiplierSide === 'right' ? right : left;
    if (multiplier === 0) return unsupported(questionText, 'A zero multiplier is preserved rather than varied automatically.');
    return {
      supported: true,
      type: 'multiplication',
      family: 'one-digit-multiplication',
      originalText: questionText,
      questionText,
      reason: null,
      values: { left, right, result: left * right, multiplicand, multiplier, multiplierSide },
      slots: [leftSlot, rightSlot],
      structure: {
        operation: 'multiplication',
        multiplierSide,
        multiplicandDigits: digitWidth(multiplicand),
        multiplierDigits: 1,
        carryProfile: multiplicationCarryProfile(multiplicand, multiplier),
      },
    };
  }

  if (operator === '÷' || operator === '/') {
    if (right > 9) return unsupported(questionText, 'Only division by a one-digit divisor is varied automatically.');
    if (right === 0) return unsupported(questionText, 'Division by zero cannot be varied.');
    if (left < right) return unsupported(questionText, 'Division with no complete group is preserved rather than varied automatically.');
    const quotient = Math.floor(left / right);
    const remainder = left % right;
    return {
      supported: true,
      type: 'division',
      family: 'one-digit-division',
      originalText: questionText,
      questionText,
      reason: null,
      values: { dividend: left, divisor: right, quotient, remainder },
      slots: [leftSlot, rightSlot],
      structure: {
        operation: 'division',
        dividendDigits: digitWidth(left),
        quotientDigits: digitWidth(quotient),
        divisorDigits: 1,
        remainder,
        intentionalRemainder: remainder === 0 ? 'none' : 'exact',
      },
    };
  }

  return null;
}

function roundingAnalysis(questionText) {
  for (const pattern of ROUNDING_PATTERNS) {
    const match = pattern.exec(questionText);
    if (!match) continue;
    const target = integerFromToken(match.groups.target);
    const magnitude = ROUNDING_MAGNITUDES[match.groups.magnitude.toLowerCase().replace(/,/g, '')];
    const targetSlot = slotFromMatch(match, 'target', questionText);
    const profile = roundingProfile(target, magnitude);
    if (!targetSlot || !profile) return unsupported(questionText, 'This rounding question has unsupported values.');
    return {
      supported: true,
      type: 'rounding',
      family: 'rounding',
      originalText: questionText,
      questionText,
      reason: null,
      values: { target, magnitude, result: profile.roundedValue },
      slots: [targetSlot],
      structure: {
        operation: 'rounding',
        targetDigits: digitWidth(target),
        rounding: profile,
      },
    };
  }
  return null;
}

function fractionOfQuantityAnalysis(questionText) {
  const numericMatch = FRACTION_OF_NUMERIC.exec(questionText);
  const wordsMatch = numericMatch ? null : FRACTION_OF_WORDS.exec(questionText);
  const match = numericMatch || wordsMatch;
  if (!match) return null;

  const numerator = numericMatch ? Number(match.groups.numerator) : FRACTION_WORD_NUMBERS[match.groups.numeratorWord.toLowerCase()];
  const denominator = numericMatch ? Number(match.groups.denominator) : FRACTION_WORD_DENOMINATORS[match.groups.denominatorWord.toLowerCase()];
  const whole = integerFromToken(match.groups.whole);
  const wholeSlot = slotFromMatch(match, 'whole', questionText);
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || !Number.isSafeInteger(whole) || !wholeSlot) {
    return unsupported(questionText, 'This fraction-of-quantity question has unsupported values.');
  }
  if (numerator < 1 || denominator < 2 || numerator > denominator) {
    return unsupported(questionText, 'Only proper or unit fraction-of-quantity questions are varied automatically.');
  }
  if (whole % denominator !== 0) {
    return unsupported(questionText, 'The whole is not exactly divisible by the denominator, so the fraction structure is preserved unchanged.');
  }

  return {
    supported: true,
    type: 'fraction-of-quantity',
    family: 'fraction-of-quantity',
    originalText: questionText,
    questionText,
    reason: null,
    values: {
      numerator,
      denominator,
      whole,
      onePart: whole / denominator,
      result: (whole / denominator) * numerator,
    },
    slots: [wholeSlot],
    structure: {
      operation: 'fraction-of-quantity',
      wholeDigits: digitWidth(whole),
      exactParts: true,
      fraction: { numerator, denominator },
    },
  };
}

/**
 * Analyse a question for a deliberately narrow, constraint-safe variation.
 * Unsupported and ambiguous wording is returned unchanged with a reason.
 */
export function analyseSupportedVariation(questionText) {
  const source = String(questionText ?? '');
  if (!source.trim()) return unsupported(source, 'There is no question to vary.');
  if (!source.includes('\n')) {
    const fraction = fractionOfQuantityAnalysis(source);
    if (fraction) return fraction;
    const rounding = roundingAnalysis(source);
    if (rounding) return rounding;
    const operation = operationAnalysis(source);
    if (operation) return operation;
  }
  return unsupported(source, 'Only one direct, unambiguous calculation, rounding question, or fraction-of-quantity question can be varied safely.');
}

function constructAddition(analysis, seed) {
  const { left, right } = analysis.values;
  const leftWidth = analysis.structure.leftDigits;
  const rightWidth = analysis.structure.rightDigits;
  const width = Math.max(leftWidth, rightWidth);
  const originalLeftDigits = toLsdDigits(left, width);
  const originalRightDigits = toLsdDigits(right, width);
  const chosen = [];
  let carryIn = 0;

  for (let position = 0; position < width; position += 1) {
    const desiredCarry = analysis.structure.carryProfile.columns[position].carryOut;
    const candidates = [];
    for (const leftDigit of digitChoices(left, leftWidth, position)) {
      for (const rightDigit of digitChoices(right, rightWidth, position)) {
        if ((leftDigit === 0) !== (originalLeftDigits[position] === 0)
          || (rightDigit === 0) !== (originalRightDigits[position] === 0)) continue;
        const carryOut = leftDigit + rightDigit + carryIn >= 10 ? 1 : 0;
        if (carryOut === desiredCarry) candidates.push({ leftDigit, rightDigit });
      }
    }
    if (!candidates.length) return null;
    const current = { leftDigit: originalLeftDigits[position], rightDigit: originalRightDigits[position] };
    const candidate = selectCandidate(candidates, seed, `addition:${position}`) || current;
    chosen.push({ candidates, current, candidate });
    carryIn = desiredCarry;
  }

  const changed = chosen.some(({ candidate, current }) => candidate.leftDigit !== current.leftDigit || candidate.rightDigit !== current.rightDigit);
  if (!changed) {
    const mutable = chosen.find(({ candidates, current }) => candidates.some((candidate) => candidate.leftDigit !== current.leftDigit || candidate.rightDigit !== current.rightDigit));
    if (!mutable) return null;
    mutable.candidate = selectCandidate(
      mutable.candidates,
      seed,
      'addition:force-change',
      (candidate) => candidate.leftDigit !== mutable.current.leftDigit || candidate.rightDigit !== mutable.current.rightDigit
    );
  }

  const variedLeft = fromLsdDigits(chosen.map(({ candidate }) => candidate.leftDigit));
  const variedRight = fromLsdDigits(chosen.map(({ candidate }) => candidate.rightDigit));
  if (variedLeft === null || variedRight === null || (variedLeft === left && variedRight === right)) return null;
  return { left: variedLeft, right: variedRight, result: variedLeft + variedRight };
}

function constructSubtraction(analysis, seed) {
  const { minuend, subtrahend } = analysis.values;
  const topWidth = analysis.structure.minuendDigits;
  const bottomWidth = analysis.structure.subtrahendDigits;
  const width = Math.max(topWidth, bottomWidth);
  const originalTopDigits = toLsdDigits(minuend, width);
  const originalBottomDigits = toLsdDigits(subtrahend, width);
  const chosen = [];
  let borrowIn = 0;

  for (let position = 0; position < width; position += 1) {
    const desiredBorrow = analysis.structure.borrowProfile.columns[position].borrowOut;
    const candidates = [];
    for (const topDigit of digitChoices(minuend, topWidth, position)) {
      for (const bottomDigit of digitChoices(subtrahend, bottomWidth, position)) {
        if ((topDigit === 0) !== (originalTopDigits[position] === 0)
          || (bottomDigit === 0) !== (originalBottomDigits[position] === 0)) continue;
        const borrowOut = topDigit - borrowIn < bottomDigit ? 1 : 0;
        if (borrowOut === desiredBorrow) candidates.push({ topDigit, bottomDigit });
      }
    }
    if (!candidates.length) return null;
    const current = { topDigit: originalTopDigits[position], bottomDigit: originalBottomDigits[position] };
    const candidate = selectCandidate(candidates, seed, `subtraction:${position}`) || current;
    chosen.push({ candidates, current, candidate });
    borrowIn = desiredBorrow;
  }

  if (chosen.at(-1).candidate && analysis.structure.borrowProfile.finalBorrow !== 0) return null;
  const changed = chosen.some(({ candidate, current }) => candidate.topDigit !== current.topDigit || candidate.bottomDigit !== current.bottomDigit);
  if (!changed) {
    const mutable = chosen.find(({ candidates, current }) => candidates.some((candidate) => candidate.topDigit !== current.topDigit || candidate.bottomDigit !== current.bottomDigit));
    if (!mutable) return null;
    mutable.candidate = selectCandidate(
      mutable.candidates,
      seed,
      'subtraction:force-change',
      (candidate) => candidate.topDigit !== mutable.current.topDigit || candidate.bottomDigit !== mutable.current.bottomDigit
    );
  }

  const variedMinuend = fromLsdDigits(chosen.map(({ candidate }) => candidate.topDigit));
  const variedSubtrahend = fromLsdDigits(chosen.map(({ candidate }) => candidate.bottomDigit));
  if (variedMinuend === null || variedSubtrahend === null || variedMinuend < variedSubtrahend) return null;
  if (variedMinuend === minuend && variedSubtrahend === subtrahend) return null;
  return { minuend: variedMinuend, subtrahend: variedSubtrahend, result: variedMinuend - variedSubtrahend };
}

function chooseSameWidthInteger(original, width, seed, salt, { min = null, max = null } = {}) {
  const range = sameWidthRange(width, original === 0);
  if (!range) return null;
  const lower = Math.max(range.min, min ?? range.min);
  const upper = Math.min(range.max, max ?? range.max);
  if (lower > upper) return null;
  const length = upper - lower + 1;
  const cap = Math.min(length, 4096);
  const candidate = lower + seededIndex(cap, seed, salt);
  if (candidate !== original) return candidate;
  if (candidate < upper) return candidate + 1;
  if (candidate > lower) return candidate - 1;
  return null;
}

function constructMultiplication(analysis, seed, options) {
  const { multiplicand, multiplier, multiplierSide } = analysis.values;
  const multiplicandWidth = analysis.structure.multiplicandDigits;
  const preserveMultiplier = options.preserveMultiplier === true;
  const multiplierOptions = preserveMultiplier ? [multiplier] : [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const range = sameWidthRange(multiplicandWidth, multiplicand === 0);
  const desiredProfile = analysis.structure.carryProfile?.signature;
  const originalZeroMask = String(Math.abs(multiplicand)).padStart(multiplicandWidth, '0')
    .split('')
    .map((digit) => digit === '0');
  if (!range || !desiredProfile) return null;
  const candidates = [];
  for (const candidateMultiplier of multiplierOptions) {
    const rangeLength = range.max - range.min + 1;
    const checks = Math.min(rangeLength, 4096);
    const start = seededIndex(checks, seed, `multiplication:multiplicand:${candidateMultiplier}`);
    for (let offset = 0; offset < checks; offset += 1) {
      const candidateMultiplicand = range.min + ((start + offset) % checks);
      if (candidateMultiplicand === multiplicand && candidateMultiplier === multiplier) continue;
      const candidateZeroMask = String(candidateMultiplicand).padStart(multiplicandWidth, '0')
        .split('')
        .map((digit) => digit === '0');
      if (candidateZeroMask.some((zero, index) => zero !== originalZeroMask[index])) continue;
      const profile = multiplicationCarryProfile(candidateMultiplicand, candidateMultiplier);
      if (profile?.signature !== desiredProfile) continue;
      candidates.push({ multiplicand: candidateMultiplicand, multiplier: candidateMultiplier });
      // A small deterministic sample is sufficient; retaining every possible
      // number would add work without improving the mathematical constraint.
      if (candidates.length >= 64) break;
    }
    if (candidates.length >= 64) break;
  }
  const chosen = selectCandidate(candidates, seed, 'multiplication:pair', (candidate) => (
    candidate.multiplicand !== multiplicand || candidate.multiplier !== multiplier
  ));
  if (!chosen) return null;
  const left = multiplierSide === 'left' ? chosen.multiplier : chosen.multiplicand;
  const right = multiplierSide === 'right' ? chosen.multiplier : chosen.multiplicand;
  return {
    left,
    right,
    multiplicand: chosen.multiplicand,
    multiplier: chosen.multiplier,
    multiplierSide,
    result: left * right,
  };
}

function constructDivision(analysis, seed) {
  const { dividend, divisor, quotient, remainder } = analysis.values;
  const dividendRange = sameWidthRange(analysis.structure.dividendDigits, dividend === 0);
  const quotientRange = sameWidthRange(analysis.structure.quotientDigits, quotient === 0);
  if (!dividendRange || !quotientRange) return null;
  const candidates = [];
  for (let candidateDivisor = Math.max(1, remainder + 1); candidateDivisor <= 9; candidateDivisor += 1) {
    const minimumQuotient = Math.max(
      quotientRange.min,
      Math.ceil((dividendRange.min - remainder) / candidateDivisor)
    );
    const maximumQuotient = Math.min(
      quotientRange.max,
      Math.floor((dividendRange.max - remainder) / candidateDivisor)
    );
    if (minimumQuotient > maximumQuotient) continue;
    const rangeLength = maximumQuotient - minimumQuotient + 1;
    const candidateQuotient = minimumQuotient + seededIndex(Math.min(rangeLength, 4096), seed, `division:q:${candidateDivisor}`);
    const candidateDividend = candidateDivisor * candidateQuotient + remainder;
    if (candidateDividend >= dividendRange.min && candidateDividend <= dividendRange.max) {
      candidates.push({ dividend: candidateDividend, divisor: candidateDivisor, quotient: candidateQuotient, remainder });
    }
    if (candidateQuotient !== quotient) {
      const nearbyDividend = candidateDivisor * minimumQuotient + remainder;
      if (nearbyDividend >= dividendRange.min && nearbyDividend <= dividendRange.max) {
        candidates.push({ dividend: nearbyDividend, divisor: candidateDivisor, quotient: minimumQuotient, remainder });
      }
    }
  }
  return selectCandidate(candidates, seed, 'division:pair', (candidate) => (
    candidate.dividend !== dividend || candidate.divisor !== divisor
  ));
}

function constructRounding(analysis, seed) {
  const { target, magnitude } = analysis.values;
  const width = analysis.structure.targetDigits;
  const range = sameWidthRange(width, target === 0);
  if (!range) return null;
  const original = analysis.structure.rounding;
  const candidates = [];

  // First retain the exact position within a rounding interval.  This keeps
  // both the boundary relationship and the mental strategy identical.
  for (let step = 1; step <= 32; step += 1) {
    for (const direction of [-1, 1]) {
      const candidate = target + (direction * step * magnitude);
      if (candidate >= range.min && candidate <= range.max) candidates.push({ target: candidate, exactOffset: true });
    }
  }

  // Near number-size boundaries, retaining the same offset can be impossible
  // (for example, a one-digit number rounded to the nearest ten).  Retain the
  // rounding side instead, never changing the requested magnitude.
  if (!candidates.length) {
    const maxChecks = Math.min(range.max - range.min + 1, 10000);
    const start = range.min + seededIndex(maxChecks, seed, 'rounding:relation');
    for (let offset = 0; offset < maxChecks; offset += 1) {
      const candidate = range.min + ((start - range.min + offset) % maxChecks);
      if (candidate === target) continue;
      const profile = roundingProfile(candidate, magnitude);
      if (profile?.relation === original.relation) candidates.push({ target: candidate, exactOffset: false });
    }
  }

  const chosen = selectCandidate(candidates, seed, 'rounding:target', (candidate) => candidate.target !== target);
  if (!chosen) return null;
  const profile = roundingProfile(chosen.target, magnitude);
  return { target: chosen.target, magnitude, result: profile.roundedValue, profile, exactOffset: chosen.exactOffset };
}

function constructFractionOfQuantity(analysis, seed) {
  const { numerator, denominator, whole } = analysis.values;
  const range = sameWidthRange(analysis.structure.wholeDigits, whole === 0);
  if (!range) return null;
  const minimumUnit = Math.ceil(range.min / denominator);
  const maximumUnit = Math.floor(range.max / denominator);
  const originalUnit = whole / denominator;
  if (minimumUnit > maximumUnit) return null;
  const candidateUnit = chooseSameWidthInteger(
    originalUnit,
    digitWidth(originalUnit),
    seed,
    'fraction-of-quantity:unit',
    { min: minimumUnit, max: maximumUnit }
  );
  if (candidateUnit === null) {
    // The range for equal parts may have a different width to one part (e.g.
    // fifths of a two-digit number), so select directly from its valid range.
    const rangeLength = maximumUnit - minimumUnit + 1;
    const selected = minimumUnit + seededIndex(Math.min(rangeLength, 4096), seed, 'fraction-of-quantity:whole');
    if (selected === originalUnit && rangeLength === 1) return null;
    const safeUnit = selected === originalUnit ? (selected < maximumUnit ? selected + 1 : selected - 1) : selected;
    const variedWhole = denominator * safeUnit;
    return { numerator, denominator, whole: variedWhole, onePart: safeUnit, result: safeUnit * numerator };
  }
  const variedWhole = denominator * candidateUnit;
  if (variedWhole < range.min || variedWhole > range.max || variedWhole === whole) return null;
  return { numerator, denominator, whole: variedWhole, onePart: candidateUnit, result: candidateUnit * numerator };
}

function buildResult(analysis, variation, questionText, preserved) {
  return {
    supported: true,
    changed: true,
    type: analysis.type,
    family: analysis.family,
    originalText: analysis.originalText,
    questionText,
    variedText: questionText,
    text: questionText,
    reason: null,
    original: {
      values: analysis.values,
      structure: analysis.structure,
    },
    variation: {
      values: variation,
    },
    values: variation,
    preserved,
  };
}

/**
 * Create one safe, deterministic variation of a supported question.
 *
 * `options.seed` changes the deterministic candidate selection.  By default
 * number widths, direct operation type, and all listed mathematical profiles
 * are preserved.  Unsupported wording is returned untouched with `changed`
 * set to false.
 */
export function createSafeNumberVariation(questionText, options = {}) {
  const analysis = analyseSupportedVariation(questionText);
  if (!analysis.supported) return analysis;
  const seed = options.seed ?? analysis.originalText;
  let variation = null;
  let replacements = [];
  let preserved = [];

  if (analysis.type === 'addition') {
    variation = constructAddition(analysis, seed);
    if (variation) {
      replacements = [
        { ...analysis.slots[0], value: formatLike(variation.left, analysis.slots[0].raw) },
        { ...analysis.slots[1], value: formatLike(variation.right, analysis.slots[1].raw) },
      ];
      preserved = ['direct addition', 'operand digit widths', 'zero-placeholder positions', 'carry profile'];
    }
  } else if (analysis.type === 'subtraction') {
    variation = constructSubtraction(analysis, seed);
    if (variation) {
      replacements = [
        { ...analysis.slots[0], value: formatLike(variation.minuend, analysis.slots[0].raw) },
        { ...analysis.slots[1], value: formatLike(variation.subtrahend, analysis.slots[1].raw) },
      ];
      preserved = ['direct subtraction', 'operand digit widths', 'zero-placeholder positions', 'borrow profile'];
    }
  } else if (analysis.type === 'multiplication') {
    variation = constructMultiplication(analysis, seed, options);
    if (variation) {
      replacements = [
        { ...analysis.slots[0], value: formatLike(variation.left, analysis.slots[0].raw) },
        { ...analysis.slots[1], value: formatLike(variation.right, analysis.slots[1].raw) },
      ];
      preserved = ['direct multiplication', 'one-digit multiplier', 'multiplicand digit width', 'zero-placeholder positions', 'carry profile'];
    }
  } else if (analysis.type === 'division') {
    variation = constructDivision(analysis, seed);
    if (variation) {
      replacements = [
        { ...analysis.slots[0], value: formatLike(variation.dividend, analysis.slots[0].raw) },
        { ...analysis.slots[1], value: formatLike(variation.divisor, analysis.slots[1].raw) },
      ];
      preserved = ['direct division', 'one-digit divisor', analysis.values.remainder === 0 ? 'exact division' : `remainder ${analysis.values.remainder}`];
    }
  } else if (analysis.type === 'rounding') {
    variation = constructRounding(analysis, seed);
    if (variation) {
      replacements = [{ ...analysis.slots[0], value: formatLike(variation.target, analysis.slots[0].raw) }];
      preserved = ['rounding magnitude', 'rounding direction'];
      if (variation.exactOffset) preserved.push('position within rounding interval');
    }
  } else if (analysis.type === 'fraction-of-quantity') {
    variation = constructFractionOfQuantity(analysis, seed);
    if (variation) {
      replacements = [{ ...analysis.slots[0], value: formatLike(variation.whole, analysis.slots[0].raw) }];
      preserved = ['fraction', 'whole-number digit width', 'equal parts', 'exact fractional result'];
    }
  }

  if (!variation || !replacements.length) {
    return {
      ...unsupported(analysis.originalText, 'No different value can preserve this question’s required mathematical structure safely.'),
      type: analysis.type,
      family: analysis.family,
      analysis,
    };
  }
  return buildResult(analysis, variation, replaceSlots(analysis.originalText, replacements), preserved);
}
