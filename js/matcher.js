import { extractMathInfo } from './parser.js';
import { analyseQuestion, rankModelRecommendations } from './question-intelligence.js';
import { createModelRecipe as createRegisteredRecipe, getModelDefinition, listModelDefinitions } from './model-registry.js';

/** Slugs are stable recipe identifiers shared by matching and rendering. */
export const BUILD1_MODEL_FAMILIES = Object.freeze([
  'place-value',
  'base-ten',
  'partition',
  'number-line',
  'part-whole',
  'comparison-bar',
  'equal-groups',
  'column-arithmetic',
  'area-model',
  'fraction-strip'
]);

const FAMILY_META = Object.freeze({
  'place-value': {
    label: 'Place-value chart',
    purpose: 'Organises each digit according to its value.'
  },
  'base-ten': {
    label: 'Base-ten representation',
    purpose: 'Represents a whole number with equal place-value units.'
  },
  partition: {
    label: 'Partitioning frame',
    purpose: 'Shows how a whole number is composed from place-value parts.'
  },
  'number-line': {
    label: 'Number line',
    purpose: 'Locates, orders or bridges between values at consistent intervals.'
  },
  'part-whole': {
    label: 'Part-whole bar model',
    purpose: 'Keeps an additive whole and its parts in one relationship.'
  },
  'comparison-bar': {
    label: 'Comparison bar model',
    purpose: 'Compares two quantities and makes their difference visible.'
  },
  'equal-groups': {
    label: 'Equal groups or array',
    purpose: 'Keeps every group the same size for multiplication or division.'
  },
  'column-arithmetic': {
    label: 'Column arithmetic frame',
    purpose: 'Aligns digits by place for addition or subtraction.'
  },
  'area-model': {
    label: 'Multiplication grid or area model',
    purpose: 'Represents a product through rows, columns or partitioned factors.'
  },
  'fraction-strip': {
    label: 'Fraction strip',
    purpose: 'Represents a whole divided into equal parts.'
  }
});

const COMPLETION_STATES = new Set(['blank', 'partly-completed', 'completed']);
const INTENTS = new Set(['practice', 'homework', 'assessment']);

function scoreConfidence(score) {
  if (score >= 82) return 'high';
  if (score >= 58) return 'medium';
  return 'low';
}

function familyCandidate(family, score, reason, explicit = false) {
  return { family, score, reason, explicit };
}

function wholeNumbers(info) {
  return info.numericValues.filter((value) => Number.isInteger(value));
}

function positiveWholeNumbers(info) {
  return wholeNumbers(info).filter((value) => value > 0);
}

function hasOperation(info, operation) {
  return info.operations.includes(operation);
}

function rankSignals(info) {
  const source = info.analysedText;
  const candidates = [];
  const integers = wholeNumbers(info);
  const positiveIntegers = positiveWholeNumbers(info);

  const add = (family, score, reason, explicit = false) => {
    const previous = candidates.find((item) => item.family === family);
    if (!previous) candidates.push(familyCandidate(family, score, reason, explicit));
    else if (score > previous.score) Object.assign(previous, { score, reason, explicit: previous.explicit || explicit });
  };

  if (/\bplace[- ]value chart\b/i.test(source)) {
    add('place-value', 100, 'The question explicitly names a place-value chart.', true);
  } else if (/\b(?:place value|value of (?:the )?(?:digit\s*)?\d|digit\s+\d|thousands|hundreds|tens|ones)\b/i.test(source) && integers.length) {
    add('place-value', 92, 'The wording focuses on the value and position of digits.');
  } else if (/\b(?:represent|show|write)\b/i.test(source) && integers.some((value) => Math.abs(value) >= 1000)) {
    add('place-value', 67, 'A place-value chart is a possible way to organise the whole number.');
  }

  if (/\b(?:base[- ]ten|dienes|place[- ]value blocks?)\b/i.test(source)) {
    add('base-ten', 100, 'The question explicitly requests base-ten or Dienes blocks.', true);
  } else if (/\b(?:represent|make|show)\b/i.test(source) && info.likelyDomains.some((item) => item.domain === 'place-value') && positiveIntegers.length) {
    add('base-ten', 77, 'Base-ten units offer a concrete alternative for this place-value question.');
  }

  if (/\b(?:partition|partitioning|expanded form|decompose|split into place values?)\b/i.test(source)) {
    add('partition', 100, 'The task explicitly asks for partitioning.', true);
  } else if (info.likelyDomains.some((item) => item.domain === 'place-value') && integers.length) {
    add('partition', 72, 'A partitioning frame is a valid place-value alternative.');
  }

  if (/\bnumber line\b/i.test(source)) {
    add('number-line', 100, 'The task explicitly names a number line.', true);
  } else if (/\bround(?:ed|ing)?\b/i.test(source)) {
    add('number-line', 88, 'A marked number line can support a rounding decision.');
  } else if ((/\b(?:estimate|interval|midpoint|count on|count back)\b/i.test(source)
    || /\bbetween\s+[\d,.]+\s+and\s+[\d,.]+\b/i.test(source)) && info.numericValues.length) {
    add('number-line', 77, 'The task depends on position, interval or distance between numbers.');
  } else if (/\b(?:order|compare)\b/i.test(source) && info.numericValues.length >= 2) {
    add('number-line', 62, 'A number line is a valid alternative for ordering these values.');
  }

  if (/\b(?:part[- ]whole|part whole)\s+(?:bar|model|diagram)?\b/i.test(source)) {
    add('part-whole', 100, 'The task explicitly names a part-whole representation.', true);
  } else if (/\b(?:altogether|total|sum|remaining|remain|left over|in all)\b/i.test(source)
    && !hasOperation(info, 'multiplication') && !hasOperation(info, 'division')
    && info.numericValues.length >= 2) {
    add('part-whole', 85, 'The wording describes an additive whole and its parts.');
  } else if (!hasOperation(info, 'multiplication') && !hasOperation(info, 'division')
    && (hasOperation(info, 'addition') || hasOperation(info, 'subtraction'))
    && info.numericValues.length >= 2 && !info.expression) {
    add('part-whole', 71, 'A part-whole relationship may support this additive word problem.');
  }

  if (/\bcomparison\s+(?:bar|model|diagram)\b/i.test(source)) {
    add('comparison-bar', 100, 'The task explicitly names a comparison representation.', true);
  } else if (/\b(?:difference between|how many more|how many fewer|more than|fewer than|less than)\b/i.test(source) && info.numericValues.length >= 2) {
    add('comparison-bar', 93, 'The question compares two quantities and their difference.');
  } else if (/\b(?:compare|greater than|less than)\b/i.test(source) && info.numericValues.length >= 2) {
    add('comparison-bar', 82, 'The two quantities are being compared.');
  }

  if (/\b(?:equal groups?|array|groups? of|lots? of|shared equally)\b/i.test(source)) {
    add('equal-groups', 96, 'The wording describes equal groups or an array.', true);
  } else if (/\beach\b/i.test(source) && hasOperation(info, 'multiplication') && positiveIntegers.length >= 2) {
    add('equal-groups', 90, 'The two quantities describe a number of equal groups and the amount in each group.');
  } else if ((hasOperation(info, 'multiplication') || hasOperation(info, 'division')) && positiveIntegers.length >= 2) {
    add('equal-groups', 82, 'Equal groups are compatible with the multiplication or division structure.');
  }

  if (/\b(?:column (?:addition|subtraction|method)|written method)\b/i.test(source)) {
    add('column-arithmetic', 100, 'The task explicitly requests a column method.', true);
  } else if (/\b(?:exchange|exchanging|regroup|regrouping)\b/i.test(source) && info.numericValues.length >= 2) {
    add('column-arithmetic', 96, 'A column frame preserves place-value alignment during exchange.', true);
  } else if (info.expression && (hasOperation(info, 'addition') || hasOperation(info, 'subtraction'))) {
    const digits = info.numericValues.reduce((max, value) => Math.max(max, String(Math.trunc(Math.abs(value))).length), 0);
    add('column-arithmetic', digits >= 3 ? 88 : 72, 'A column frame is compatible with this written calculation.');
  } else if (!hasOperation(info, 'multiplication') && !hasOperation(info, 'division')
    && (hasOperation(info, 'addition') || hasOperation(info, 'subtraction')) && info.numericValues.length >= 2) {
    add('column-arithmetic', 76, 'The values can be aligned safely in a column frame.');
  }

  if (/\b(?:area model|multiplication grid|grid method)\b/i.test(source)) {
    add('area-model', 100, 'The task explicitly names a multiplication grid or area model.', true);
  } else if (/\b(?:array|rows? of|columns? of|rows? and columns?)\b/i.test(source) && positiveIntegers.length >= 2) {
    add('area-model', 98, 'Rows and columns define a rectangular multiplication structure.', true);
  } else if (hasOperation(info, 'multiplication') && positiveIntegers.length >= 2) {
    add('area-model', 76, 'An area model is a valid alternative for these factors.');
  }

  if (/\b(?:fraction strip|fraction bar)\b/i.test(source)) {
    add('fraction-strip', 100, 'The task explicitly names a fraction strip or bar.', true);
  } else if (info.fractions.length || /\b(?:fraction|numerator|denominator|equivalent|halves|thirds|quarters|fifths|tenths)\b/i.test(source)) {
    add('fraction-strip', 92, 'Equal fraction parts are central to the question.');
  }

  return candidates;
}

/**
 * Build 2 keeps the compact Build 1 candidate vocabulary for now, while the
 * dedicated intelligence layer can describe a more specific future family.
 * This merge only ever adds a renderer that is known to exist, and never
 * displaces an explicit teacher/source request on an equal score.
 */
function mergeIntelligentCandidates(candidates, interpretation) {
  const ranked = rankModelRecommendations(interpretation, {
    availableFamilies: listModelDefinitions().map((definition) => definition.id),
    limit: 8,
  });
  const merged = candidates.map((candidate) => ({ ...candidate }));
  for (const recommendation of ranked.recommendations) {
    const existing = merged.find((candidate) => candidate.family === recommendation.family);
    const candidate = familyCandidate(
      recommendation.family,
      recommendation.score,
      recommendation.reason,
      false,
    );
    candidate.intelligent = true;
    candidate.idealFamily = recommendation.idealFamily;
    if (!existing) merged.push(candidate);
    else if (!existing.explicit && recommendation.score > existing.score) {
      Object.assign(existing, candidate);
    }
  }
  return { candidates: merged, ranked };
}

function compatibilityFor(family, info) {
  const values = info.numericValues;
  const integers = wholeNumbers(info);
  const positives = positiveWholeNumbers(info);
  if (!BUILD1_MODEL_FAMILIES.includes(family) && getModelDefinition(family)) {
    // The Build 2 registry validates its own structured recipe. At this point
    // we only need to ensure the family is installed, not force it through a
    // Build 1-only numeric gate.
    return { compatible: true };
  }
  switch (family) {
    case 'place-value':
      return integers.some((value) => value >= 0)
        ? { compatible: true }
        : { compatible: false, reason: 'A whole number is needed for this place-value chart.' };
    case 'base-ten':
      return positives.some((value) => value <= 9999)
        ? { compatible: true }
        : { compatible: false, reason: 'Base-ten blocks support positive whole numbers up to 9,999.' };
    case 'partition':
      return integers.some((value) => value >= 0)
        ? { compatible: true }
        : { compatible: false, reason: 'A whole number is needed for a place-value partition.' };
    case 'number-line':
      return values.length
        ? { compatible: true }
        : { compatible: false, reason: 'No reliable values were found for the number line.' };
    case 'part-whole':
    case 'comparison-bar':
      return values.length >= 2
        ? { compatible: true }
        : { compatible: false, reason: 'At least two known quantities are needed.' };
    case 'equal-groups':
    case 'area-model':
      return positives.length >= 2
        ? { compatible: true }
        : { compatible: false, reason: 'Two positive whole-number quantities are needed.' };
    case 'column-arithmetic':
      return values.length >= 2 && (hasOperation(info, 'addition') || hasOperation(info, 'subtraction'))
        ? { compatible: true }
        : { compatible: false, reason: 'Two values and a clear addition or subtraction operation are needed.' };
    case 'fraction-strip': {
      const validFractions = info.fractions.filter((fraction) => fraction.denominator > 0 && fraction.numerator >= 0);
      return validFractions.length
        ? { compatible: true }
        : { compatible: false, reason: 'A valid fraction with a positive denominator is needed.' };
    }
    default:
      return { compatible: false, reason: 'Unknown model family.' };
  }
}

function placeDigits(value) {
  const names = ['ones', 'tens', 'hundreds', 'thousands', 'ten-thousands', 'hundred-thousands', 'millions'];
  const characters = String(Math.trunc(Math.abs(value))).split('').reverse();
  return characters.map((digit, index) => ({
    column: names[index] || `10^${index}`,
    digit: Number(digit),
    value: Number(digit) * (10 ** index)
  })).reverse();
}

function partitionValue(value) {
  return placeDigits(value).map((entry) => entry.value).filter((part) => part !== 0);
}

function primaryPlaceValueNumber(info) {
  const candidates = wholeNumbers(info).filter((value) => value >= 0);
  return candidates.sort((a, b) => Math.abs(b) - Math.abs(a))[0];
}

function decimalPlaces(value) {
  const text = String(value);
  return text.includes('.') ? text.length - text.indexOf('.') - 1 : 0;
}

function safeRound(value, places = 10) {
  return Number(value.toFixed(Math.min(places, 10)));
}

function numberLineValues(info) {
  const values = [...new Set(info.numericValues)].sort((a, b) => a - b);
  if (!values.length) return null;
  let start;
  let end;

  if (values.length >= 2 && values[0] !== values[values.length - 1]) {
    start = values[0];
    end = values[values.length - 1];
  } else {
    const value = values[0];
    const magnitude = 10 ** Math.max(0, String(Math.trunc(Math.abs(value))).length - 1);
    start = Math.floor(value / magnitude) * magnitude;
    end = start + magnitude;
    if (start === value && value !== 0) start -= magnitude;
  }

  if (!(end > start)) return null;
  const span = end - start;
  let divisions = Number.isInteger(span) && span <= 10 ? span : 10;
  const stepPhrase = info.analysedText.match(/\b(?:steps?|intervals?)\s+of\s+([\d,.]+)/i);
  if (stepPhrase) {
    const requestedStep = Number(stepPhrase[1].replace(/,/g, ''));
    const requestedDivisions = span / requestedStep;
    if (requestedStep > 0 && Number.isInteger(requestedDivisions) && requestedDivisions <= 20) {
      divisions = requestedDivisions;
    }
  }
  divisions = Math.max(1, Math.min(20, divisions));
  const places = Math.max(decimalPlaces(start), decimalPlaces(end)) + 2;
  const step = safeRound(span / divisions, places);
  if (!(step > 0)) return null;
  return {
    start,
    end,
    divisions,
    step,
    ticks: Array.from({ length: divisions + 1 }, (_, index) => safeRound(start + (step * index), places)),
    points: values.filter((value) => value > start && value < end)
  };
}

function inferPurpose(info, intent) {
  if (info.hasExistingRepresentation) return 'question-information';
  const taskText = info.analysedText
    .replace(/\[\s*\d+\s*(?:marks?|m)\s*\]/gi, ' ')
    .replace(/\(\s*\d+\s*(?:marks?|m)\s*\)/gi, ' ')
    .replace(/\b\d+\s+marks?\s*$/gi, ' ');
  if (/\b(?:complete|draw|mark|place|shade|label|use)\b/i.test(taskText)) return 'response-model';
  if (intent === 'assessment') return 'response-model';
  return 'thinking-model';
}

function requestedCompletion(intent, supplied) {
  if (COMPLETION_STATES.has(supplied)) return supplied;
  if (intent === 'assessment') return 'blank';
  if (intent === 'homework') return 'partly-completed';
  return 'partly-completed';
}

function operationForColumn(info) {
  if (hasOperation(info, 'addition') && !hasOperation(info, 'subtraction')) return 'addition';
  if (hasOperation(info, 'subtraction') && !hasOperation(info, 'addition')) return 'subtraction';
  if (info.expression) return /[+]/.test(info.expression.operator) ? 'addition' : 'subtraction';
  return null;
}

function literalValue(raw) {
  if (!raw) return null;
  const value = Number(raw.replace(/,/g, '').replace('\u2212', '-'));
  return Number.isFinite(value) ? value : null;
}

function inferEqualGroupValues(info) {
  const source = info.analysedText;
  const positives = positiveWholeNumbers(info);
  const numberLiteral = '([\\d]+(?:,[\\d]{3})*)';
  if (info.divisionInterpretation === 'sharing') {
    const groupMatch = source.match(new RegExp(`\\b(?:between|among)\\s+${numberLiteral}`, 'i'));
    const groupCount = literalValue(groupMatch?.[1]) ?? positives[1] ?? null;
    const total = positives.find((value) => value !== groupCount) ?? positives[0] ?? null;
    return { total, groupCount, groupSize: null };
  }
  if (info.divisionInterpretation === 'grouping') {
    const sizeMatch = source.match(new RegExp(`\\bgroups?\\s+of\\s+${numberLiteral}`, 'i'));
    const totalMatch = source.match(new RegExp(`\\b(?:from|into|within|total(?:\\s+of)?)\\s+${numberLiteral}`, 'i'));
    const groupSize = literalValue(sizeMatch?.[1]) ?? positives[1] ?? null;
    const total = literalValue(totalMatch?.[1])
      ?? positives.find((value) => value !== groupSize)
      ?? positives[0]
      ?? null;
    return { total, groupCount: null, groupSize };
  }
  const groupsMatch = source.match(new RegExp(`${numberLiteral}\\s+groups?\\s+of\\s+${numberLiteral}`, 'i'));
  return {
    total: null,
    groupCount: literalValue(groupsMatch?.[1]) ?? positives[0] ?? null,
    groupSize: literalValue(groupsMatch?.[2]) ?? positives[1] ?? null
  };
}

function scaffoldStateFor(intent, supplied) {
  const completion = requestedCompletion(intent, supplied);
  return completion === 'completed' ? 'modelled' : completion === 'blank' ? 'blank' : 'guided';
}

function legacyPurposeFor(interpretation) {
  const purpose = interpretation?.representationPurpose;
  if (['record-thinking', 'blank-pupil-workspace', 'pupil-workspace'].includes(purpose)) return 'response-model';
  if (['interpret-situation', 'represent-supplied-data', 'represent-data'].includes(purpose)) return 'question-information';
  if (['support-reasoning-or-proof', 'support-reasoning'].includes(purpose)) return 'thinking-model';
  return 'thinking-model';
}

function equationDisplayValue(value) {
  return value?.type === 'number' && Number.isFinite(value.value) ? String(value.value) : '□';
}

function equationOperationSymbol(operation) {
  return ({ addition: '+', subtraction: '−', multiplication: '×', division: '÷' })[operation] ?? '+';
}

function privateTimeMinutes(time) {
  if (!time || !Number.isInteger(time.hours) || !Number.isInteger(time.minutes)) return null;
  return (time.hours * 60) + time.minutes;
}

function moneyPence(quantity) {
  const raw = String(quantity?.raw ?? '').trim();
  if (/^£/.test(raw)) {
    const match = raw.match(/^£\s*(\d+)(?:\.(\d{1,2}))?$/);
    if (match) return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0') || 0);
  }
  if (/p(?:ence)?$/i.test(raw) || quantity?.unit === 'p') {
    const value = Number(quantity?.value);
    return Number.isFinite(value) ? Math.round(value) : null;
  }
  const value = Number(quantity?.value);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

function moneyValueNear(source, pattern) {
  const match = String(source ?? '').match(pattern);
  if (!match) return null;
  const pounds = Number(match[1]);
  const pence = match[2] == null ? 0 : Number(String(match[2]).padEnd(2, '0'));
  return Number.isFinite(pounds) && Number.isFinite(pence) ? pounds * 100 + pence : null;
}

/** Translate intelligence vocabulary into the exact renderer blanks. */
function protectedTokensFor(family, interpretation) {
  const structure = interpretation?.mathematicalStructure ?? {};
  const equation = interpretation?.equation;
  const requested = new Set([
    structure.unknownPosition,
    ...(interpretation?.answerProtection?.prohibitedAutoFill ?? []),
  ].filter(Boolean));
  const hidden = new Set();

  if (requested.has('clock-hands') || requested.has('hands')) hidden.add('hands');
  if (requested.has('chart-data')) hidden.add('all');
  if (requested.has('rounded-value')) hidden.add('rounded-result');
  if (requested.has('fraction-of-quantity-result')) hidden.add('selected-total');
  if (requested.has('equivalent-fraction') || (family === 'equivalent-fraction-strips' && ['numerator', 'denominator'].includes(structure.unknownPosition))) hidden.add('equivalence');
  if (requested.has('comparison-symbol')) hidden.add('comparison-symbol');
  if (requested.has('perimeter')) hidden.add('perimeter');
  if (requested.has('area')) hidden.add('area');
  if (requested.has('duration')) hidden.add('duration');
  if (requested.has('converted-value')) hidden.add('converted-value');
  if (requested.has('change')) hidden.add('change');
  if (requested.has('start')) hidden.add('start');
  if (requested.has('end')) hidden.add('end');
  if (requested.has('remainder')) hidden.add('remainder');

  if (family === 'equation-balance' && equation?.unknownPosition) {
    hidden.add(equation.unknownPosition.startsWith('first') || equation.unknownPosition === 'minuend' || equation.unknownPosition === 'dividend' ? 'left-expression' : equation.unknownPosition === 'sum' || equation.unknownPosition === 'difference' || equation.unknownPosition === 'product' || equation.unknownPosition === 'quotient' ? 'right-expression' : 'left-expression');
  }
  if (family === 'missing-number-strip' && equation?.unknownPosition) {
    hidden.add(equation.unknownPosition.startsWith('first') || equation.unknownPosition === 'minuend' || equation.unknownPosition === 'dividend' ? 'left' : equation.unknownPosition === 'second-addend' || equation.unknownPosition === 'subtrahend' || equation.unknownPosition === 'second-factor' || equation.unknownPosition === 'divisor' ? 'right' : 'result');
  }
  if (family === 'array-structure' && equation?.unknownPosition) {
    hidden.add(equation.unknownPosition === 'first-factor' ? 'rows' : equation.unknownPosition === 'second-factor' ? 'columns' : 'total');
  }
  if (family === 'fraction-of-quantity-bar') hidden.add('selected-total');
  return [...hidden];
}

function primaryUnknownFor(family, interpretation, hidden) {
  if (family === 'clock-model' && hidden.includes('hands')) return 'hands';
  if (family === 'bar-chart' || family === 'pictogram' || family === 'line-graph') return 'chart-data';
  if (family === 'equation-balance' || family === 'missing-number-strip') return hidden[0] ?? null;
  if (family === 'fraction-of-quantity-bar') return 'selected-total';
  if (family === 'unit-conversion-bridge' && hidden.includes('converted-value')) return 'converted-value';
  return interpretation?.mathematicalStructure?.unknownPosition ?? hidden[0] ?? null;
}

function build2ValuesFor(family, info, interpretation) {
  const structure = interpretation?.mathematicalStructure ?? {};
  const equation = interpretation?.equation;
  const values = [...(info.numericValues ?? [])].filter(Number.isFinite);
  const first = values[0] ?? 0;
  const second = values[1] ?? 0;
  const positive = values.filter((value) => value > 0);
  const base = {};
  if (equation) {
    const left = equationDisplayValue(equation.left);
    const right = equationDisplayValue(equation.right);
    const result = equationDisplayValue(equation.result);
    const symbol = equationOperationSymbol(equation.operator);
    Object.assign(base, { left, right, result, operation: symbol });
    if (family === 'equation-balance') {
      Object.assign(base, { left: `${left} ${symbol} ${right}`, right: result, showEquals: true });
    }
    if (family === 'missing-number-strip') Object.assign(base, { left, right, result, operation: symbol });
    if (family === 'array-structure') {
      const rows = equation.left.type === 'number' ? equation.left.value : equation.privateDerivedAnswer ?? 1;
      const columns = equation.right.type === 'number' ? equation.right.value : 1;
      Object.assign(base, { rows, columns });
    }
  }
  if (family.includes('number-line') || family.includes('calculation-line') || family.includes('timeline') || family === 'reading-scale') {
    const rounding = structure.rounding;
    const start = rounding?.lower ?? Math.min(...values, 0);
    const end = rounding?.upper ?? Math.max(...values, start + 10);
    Object.assign(base, {
      start,
      end: end > start ? end : start + 10,
      divisions: rounding ? 2 : Math.max(2, Math.min(20, Number(structure.interval ? (end - start) / structure.interval : 10) || 10)),
      target: rounding?.target ?? (values.length === 1 ? first : null),
      number: rounding?.target ?? first,
      step: structure.interval ?? null,
    });
  }
  if (family.includes('fraction')) {
    Object.assign(base, {
      numerator: structure.numerator ?? info.fractions?.[0]?.numerator ?? 1,
      denominator: structure.denominator ?? info.fractions?.[0]?.denominator ?? 4,
      whole: structure.whole ?? null,
      fractions: (structure.fractions ?? info.fractions ?? []).map(({ numerator, denominator }) => ({ numerator, denominator })),
    });
    if (family === 'fraction-of-quantity-bar') {
      const whole = structure.whole ?? positive.at(-1) ?? 0;
      const denominator = structure.denominator ?? info.fractions?.[0]?.denominator ?? 1;
      const numerator = structure.numerator ?? info.fractions?.[0]?.numerator ?? 1;
      Object.assign(base, {
        whole,
        denominator,
        numerator,
        onePart: Number.isFinite(whole / denominator) ? whole / denominator : null,
        selectedTotal: Number.isFinite(whole / denominator) ? (whole / denominator) * numerator : null,
      });
    }
  }
  if (family.includes('column') || family.includes('multiplication') || family.includes('division') || family === 'array-structure' || family === 'equal-groups') {
    Object.assign(base, {
      left: first,
      right: second,
      operands: values.slice(0, 3),
      groups: structure.numberOfGroups ?? (positive[0] ?? 2),
      groupSize: structure.groupSize ?? (positive[1] ?? 2),
      total: structure.whole ?? null,
      rows: structure.numberOfGroups ?? (positive[0] ?? 4),
      columns: structure.groupSize ?? (positive[1] ?? 3),
    });
  }
  if (family.includes('place-value') || family.includes('arrow-card') || family.includes('partition') || family === 'number-bond') {
    Object.assign(base, {
      number: Math.max(0, Math.trunc(first)),
      whole: structure.whole ?? Math.max(0, Math.trunc(first)),
      parts: structure.parts?.length ? structure.parts : [],
    });
  }
  if (family === 'comparison-bar' || family === 'change-bar' || family === 'scaling-bar') {
    Object.assign(base, {
      greater: structure.comparison?.greater ?? Math.max(first, second),
      lesser: structure.comparison?.lesser ?? Math.min(first, second),
      difference: structure.comparison?.difference ?? null,
      start: structure.startValue ?? first,
      change: structure.change ?? second,
      result: structure.endValue ?? null,
    });
  }
  if (family === 'clock-model') {
    const time = info.times?.[0];
    Object.assign(base, { hour: time?.hours ?? 9, minute: time?.minutes ?? 0 });
  }
  if (family === 'duration-timeline' && structure.measurement) {
    const startMinutes = privateTimeMinutes(info.times?.[0]);
    const endMinutes = privateTimeMinutes(info.times?.[1]);
    Object.assign(base, {
      startMinutes: startMinutes ?? 635,
      endMinutes: endMinutes ?? 730,
      showJumps: true,
    });
  }
  if (family === 'perimeter-trace' || family === 'area-square-grid') {
    Object.assign(base, {
      width: structure.measurement?.length ?? first ?? 8,
      height: structure.measurement?.width ?? second ?? 4,
      rows: (structure.measurement?.width ?? second) || 4,
      columns: (structure.measurement?.length ?? first) || 8,
      unit: structure.measurement?.unit ?? info.units?.[0] ?? 'cm',
    });
  }
  if (family === 'money-representation') {
    const quantities = (info.quantities ?? []).filter((quantity) => quantity?.kind === 'currency' || quantity?.unit === 'p');
    const penceValues = quantities.map(moneyPence).filter(Number.isFinite);
    const source = interpretation?.normalisedText ?? info.analysedText ?? '';
    const pricePence = moneyValueNear(source, /\b(?:costs?|price(?: is)?|priced at)\s*£\s*(\d+)(?:\.(\d{1,2}))?/i)
      ?? (structure.unknownPosition === 'change' ? penceValues[0] ?? null : null);
    const tenderedPence = moneyValueNear(source, /\b(?:pay(?:s|ing)?|paid|gives?|tender(?:s|ed)?)\s*£\s*(\d+)(?:\.(\d{1,2}))?/i)
      ?? (structure.unknownPosition === 'change' ? penceValues[1] ?? null : null);
    Object.assign(base, {
      amountPence: pricePence ?? penceValues[0] ?? Math.round(first * 100),
      pricePence,
      tenderedPence,
    });
  }
  if (family === 'unit-conversion-bridge') {
    const measure = structure.measurement ?? {};
    Object.assign(base, {
      fromValue: measure.fromValue ?? first,
      fromUnit: measure.fromUnit ?? info.units?.[0] ?? 'm',
      toUnit: measure.toUnit ?? 'cm',
    });
  }
  if (['bar-chart', 'pictogram', 'line-graph', 'tally-frequency-table'].includes(family) && structure.chart?.construction) {
    Object.assign(base, { rows: [], max: 10, yMax: 10, showPoints: false });
  }
  return Object.fromEntries(Object.entries(base).filter(([, value]) => value !== null && value !== undefined));
}

function createBuild2Recipe(family, info, options) {
  const definition = getModelDefinition(family);
  if (!definition) return null;
  const intent = INTENTS.has(options.intent) ? options.intent : 'practice';
  const interpretation = options.interpretation ?? analyseQuestion(info, options.interpretationOverrides ?? {});
  const constructionTask = interpretation.questionFamily === 'construct-chart'
    || interpretation.questionFamily === 'draw-hands'
    || interpretation.questionFamily === 'plot-coordinates';
  const completionState = options.completionState
    ? requestedCompletion(intent, options.completionState)
    : constructionTask ? 'blank' : requestedCompletion(intent, options.completionState);
  const hidden = protectedTokensFor(family, interpretation);
  return createRegisteredRecipe(family, {
    values: build2ValuesFor(family, info, interpretation),
    unknown: primaryUnknownFor(family, interpretation, hidden),
    hidden,
    scaffoldState: completionState === 'blank' ? 'blank' : scaffoldStateFor(intent, options.completionState),
    completionState,
    purpose: options.purpose ?? legacyPurposeFor(interpretation),
    size: options.size ?? 'standard',
    position: options.position ?? definition.print?.preferredPosition ?? 'beneath',
    linked: true,
    teacherChosen: false,
    metadata: { recommendation: 'build-2', binding: { mode: 'bound', source: 'question' }, linked: true, teacherChosen: false },
  });
}

/** Build a structured, non-distortable recipe from extracted values. */
export function createModelRecipe(family, infoOrText, options = {}) {
  const info = typeof infoOrText === 'string' ? extractMathInfo(infoOrText) : infoOrText;
  if (!info) return null;
  if (!BUILD1_MODEL_FAMILIES.includes(family)) return createBuild2Recipe(family, info, options);
  if (!compatibilityFor(family, info).compatible) return null;

  const intent = INTENTS.has(options.intent) ? options.intent : 'practice';
  const completionState = requestedCompletion(intent, options.completionState);
  const purpose = options.purpose || inferPurpose(info, intent);
  const values = info.numericValues;
  const integers = wholeNumbers(info);
  const positives = positiveWholeNumbers(info);
  const unit = info.units[0] ?? null;
  const interpretation = options.interpretation ?? null;
  let variant;
  let recipeValues;
  let unknown = info.unknowns[0] ?? null;

  switch (family) {
    case 'place-value': {
      const number = primaryPlaceValueNumber(info);
      variant = 'whole-number';
      recipeValues = { number, digits: placeDigits(number) };
      break;
    }
    case 'base-ten': {
      const number = positives.filter((value) => value <= 9999).sort((a, b) => b - a)[0];
      const powers = Object.fromEntries(placeDigits(number).map((entry) => [entry.column, entry.digit]));
      variant = 'place-value-units';
      recipeValues = { number, ...powers };
      break;
    }
    case 'partition': {
      const whole = primaryPlaceValueNumber(info);
      variant = 'place-value-partition';
      recipeValues = { whole, parts: partitionValue(whole) };
      break;
    }
    case 'number-line': {
      const line = numberLineValues(info);
      if (!line) return null;
      variant = /\bround/i.test(info.analysedText) ? 'rounding' : 'marked-or-empty';
      recipeValues = line;
      break;
    }
    case 'part-whole': {
      const subtraction = hasOperation(info, 'subtraction') && !hasOperation(info, 'addition');
      variant = subtraction ? 'missing-part' : 'additive-whole';
      recipeValues = subtraction
        ? { whole: values[0], parts: [values[1], null] }
        : { whole: null, parts: values.slice(0, 2) };
      break;
    }
    case 'comparison-bar': {
      const comparison = interpretation?.mathematicalStructure?.comparison;
      const greater = comparison?.greater ?? Math.max(values[0] ?? 0, values[1] ?? 0);
      const difference = comparison?.difference ?? null;
      const lesser = comparison?.lesser ?? (difference != null ? greater - difference : Math.min(values[0] ?? 0, values[1] ?? 0));
      variant = 'difference';
      recipeValues = {
        quantities: [greater, lesser],
        greater,
        lesser,
        difference: difference ?? greater - lesser,
        proportional: true
      };
      const requested = interpretation?.mathematicalStructure?.unknownPosition;
      unknown = requested === 'smaller-quantity' ? 'lesser'
        : requested === 'larger-quantity' ? 'greater'
          : requested === 'difference' ? 'difference'
            : requested === 'comparison-symbol' ? 'comparison-symbol' : unknown;
      break;
    }
    case 'equal-groups': {
      const interpretation = info.divisionInterpretation || (hasOperation(info, 'multiplication') ? 'multiplication' : null);
      variant = interpretation || 'equal-groups';
      recipeValues = inferEqualGroupValues(info);
      break;
    }
    case 'column-arithmetic': {
      const operation = operationForColumn(info);
      if (!operation) return null;
      const operands = values.slice(0, 2);
      const maxPlaces = Math.max(...operands.map((value) => decimalPlaces(value)));
      const maxWholeDigits = Math.max(...operands.map((value) => String(Math.trunc(Math.abs(value))).length));
      variant = operation;
      recipeValues = {
        operation,
        operands,
        result: null,
        alignment: 'place-value',
        columns: { wholeDigits: maxWholeDigits, decimalPlaces: maxPlaces }
      };
      break;
    }
    case 'area-model':
      variant = /\b(?:grid method|partition)/i.test(info.analysedText) ? 'partitioned-factors' : 'rows-columns';
      recipeValues = { rows: positives[0], columns: positives[1], product: null, equalCells: true };
      break;
    case 'fraction-strip': {
      const valid = info.fractions.filter((fraction) => fraction.denominator > 0 && fraction.numerator >= 0);
      const maxDenominator = Math.max(...valid.map((fraction) => fraction.denominator));
      variant = valid.length > 1 ? 'comparison' : 'single-fraction';
      recipeValues = {
        fractions: valid.map(({ numerator, denominator }) => ({ numerator, denominator })),
        equalParts: true,
        sameWhole: true,
        divisions: maxDenominator
      };
      break;
    }
    default:
      return null;
  }

  return {
    family,
    variant,
    values: recipeValues,
    labels: [],
    units: unit ? [unit] : [],
    unknown,
    completionState,
    purpose,
    size: options.size || 'standard',
    position: options.position || 'beneath',
    lockState: 'mathematical-structure-locked'
  };
}

/** Assess likely answer/structure leakage without claiming to know the answer. */
export function evaluateAnswerLeak(recipe, options = {}) {
  if (!recipe) return { risk: 'none', reasons: [] };
  const intent = INTENTS.has(options.intent) ? options.intent : 'practice';
  const reasons = [];
  if (recipe.completionState === 'completed') reasons.push('The model is completed.');
  if (recipe.completionState === 'partly-completed' && intent === 'assessment') {
    reasons.push('A partly completed model may supply assessed reasoning.');
  }
  if (intent === 'assessment' && ['part-whole', 'comparison-bar', 'equal-groups', 'column-arithmetic', 'area-model'].includes(recipe.family)) {
    reasons.push('This representation may reveal the operation or solution structure.');
  }
  const definition = getModelDefinition(recipe.family);
  if (intent === 'assessment' && definition?.answerRevealRisk?.level && definition.answerRevealRisk.level !== 'none') {
    reasons.push('This representation may supply assessed mathematical structure.');
  }
  if (recipe.purpose === 'worked-example') reasons.push('A worked example can reveal a method or answer.');
  const risk = reasons.some((reason) => /completed|worked example/i.test(reason))
    ? 'high'
    : reasons.length ? 'medium' : 'none';
  return { risk, reasons };
}

function asInfo(questionOrInfo) {
  if (typeof questionOrInfo === 'string') return extractMathInfo(questionOrInfo);
  if (questionOrInfo?.numericValues && questionOrInfo?.analysedText !== undefined) return questionOrInfo;
  if (questionOrInfo?.mathInfo) return questionOrInfo.mathInfo;
  const text = questionOrInfo?.displayText ?? questionOrInfo?.text ?? questionOrInfo?.originalText ?? '';
  return extractMathInfo(text);
}

/**
 * Rank mathematically compatible Build 1 models.
 *
 * The result never contains more than three suggestions and only creates an
 * automatic provisional recipe when the match is high-confidence and safe.
 */
export function matchQuestionToModels(questionOrInfo, options = {}) {
  const info = asInfo(questionOrInfo);
  const intent = INTENTS.has(options.intent) ? options.intent : 'practice';
  const warnings = [...info.warnings];
  let clarification = null;
  const interpretation = analyseQuestion(info, options.interpretationOverrides ?? {});

  // A denominator of zero has no faithful fraction representation.  Do not
  // let a generic area model paper over an invalid source question: preserve
  // its wording and hand the decision back to the teacher.
  if ((info.fractions ?? []).some((fraction) => !Number.isInteger(Number(fraction.denominator)) || Number(fraction.denominator) <= 0)) {
    warnings.push('The fraction has no valid positive denominator, so no model has been attached.');
    return {
      confidence: 'low',
      suggestions: [],
      provisionalRecipe: null,
      warnings: [...new Set(warnings)],
      clarification: null,
      noModelRecommended: true,
      noModelOption: { family: null, label: 'No model', reason: 'The source fraction needs teacher review before it can be represented safely.' },
      extracted: { ...info, interpretation },
      interpretation,
      intelligentRecommendations: [],
      contraindicatedFamilies: ['fraction-strip', 'fraction-area-model', 'fraction-wall'],
    };
  }

  const intelligent = mergeIntelligentCandidates(rankSignals(info), interpretation);
  let candidates = intelligent.candidates
    .map((candidate) => ({ ...candidate, ...compatibilityFor(candidate.family, info) }))
    .filter((candidate) => candidate.compatible)
    .sort((a, b) => b.score - a.score || a.family.localeCompare(b.family));

  if (info.likelyDomain && ['geometry', 'statistics', 'time'].includes(info.likelyDomain)) {
    // Named models are still allowed, but weak incidental matches should not
    // override an out-of-coverage domain.
    candidates = candidates.filter((candidate) => candidate.explicit || candidate.score >= 90);
  }

  if (info.divisionInterpretation === 'ambiguous' && candidates.some((item) => item.family === 'equal-groups')) {
    clarification = 'Are we sharing between the groups, or making groups of this size?';
    candidates = candidates.map((candidate) => candidate.family === 'equal-groups'
      ? { ...candidate, score: Math.min(candidate.score, 76), reason: `${candidate.reason} The division interpretation needs checking.` }
      : candidate
    ).sort((a, b) => b.score - a.score || a.family.localeCompare(b.family));
  }

  if (info.hasExistingRepresentation) {
    warnings.push('The question appears to refer to a representation already provided; check before adding a duplicate model.');
  }

  const suggestions = candidates.slice(0, 3).map((candidate) => {
    const recipe = createModelRecipe(candidate.family, info, { ...options, intent, interpretation });
    const leak = evaluateAnswerLeak(recipe, { intent, interpretation });
    const definition = getModelDefinition(candidate.family);
    return {
      family: candidate.family,
      label: FAMILY_META[candidate.family]?.label ?? definition?.name ?? candidate.family,
      mathematicalPurpose: FAMILY_META[candidate.family]?.purpose ?? definition?.mathematicalPurpose ?? definition?.purpose ?? '',
      score: candidate.score,
      confidence: scoreConfidence(candidate.score),
      reason: candidate.reason,
      explicit: candidate.explicit,
      recipe,
      answerRevealRisk: leak.risk,
      answerRevealReasons: leak.reasons,
      idealFamily: candidate.idealFamily ?? candidate.family,
      answerProtection: interpretation.answerProtection,
    };
  });

  const top = suggestions[0];
  const gap = top ? top.score - (suggestions[1]?.score ?? 0) : 0;
  let confidence = !top ? 'low' : scoreConfidence(top.score);
  if (confidence === 'high' && !top.explicit && suggestions.length > 1 && gap < 7) confidence = 'medium';
  if (clarification || info.hasExistingRepresentation) confidence = confidence === 'low' ? 'low' : 'medium';

  if (intent === 'assessment' && top?.answerRevealRisk !== 'none') {
    warnings.push('Assessment mode has kept this model provisional because it may reveal the operation or solution structure.');
  }
  if (intent === 'assessment' && options.completionState === 'completed') {
    warnings.push('A completed model may reveal an answer in the pupil assessment version.');
  }

  const assessmentAllowsBlankExplicitResponse = intent === 'assessment'
    && top?.explicit
    && top.recipe?.completionState === 'blank'
    && top.recipe?.purpose === 'response-model'
    // An explicitly requested blank response structure (for example, a
    // fraction strip pupils are asked to complete) can remain available in an
    // assessment.  It still carries a calm medium-risk warning; only a
    // completed/worked high-risk model is withheld automatically.
    && top.answerRevealRisk !== 'high';
  const safeHighMatch = confidence === 'high'
    && top?.recipe
    && !clarification
    && !info.hasExistingRepresentation
    && top.answerRevealRisk !== 'high'
    && (intent !== 'assessment' || assessmentAllowsBlankExplicitResponse);

  const provisionalRecipe = safeHighMatch ? top.recipe : null;
  const noModelRecommended = !top || confidence === 'low' || info.hasExistingRepresentation;
  if (!top) warnings.push('No model can be matched reliably; leaving the question unmodelled is safest.');

  return {
    confidence,
    suggestions,
    provisionalRecipe,
    warnings: [...new Set(warnings)],
    clarification,
    noModelRecommended,
    noModelOption: {
      family: null,
      label: 'No model',
      reason: noModelRecommended
        ? 'No model is the most reliable current choice.'
        : 'Keep the question clear without adding a representation.'
    },
    extracted: { ...info, interpretation },
    interpretation,
    intelligentRecommendations: intelligent.ranked.recommendations,
    contraindicatedFamilies: intelligent.ranked.contraindicatedFamilies,
  };
}

/** Short alias used by UI code. */
export const matchModels = matchQuestionToModels;
