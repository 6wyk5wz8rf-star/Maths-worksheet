import { extractMathInfo } from './parser.js';

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

function compatibilityFor(family, info) {
  const values = info.numericValues;
  const integers = wholeNumbers(info);
  const positives = positiveWholeNumbers(info);
  switch (family) {
    case 'place-value':
      return integers.some((value) => value >= 0)
        ? { compatible: true }
        : { compatible: false, reason: 'A whole number is needed for this place-value chart.' };
    case 'base-ten':
      return positives.some((value) => value <= 9999)
        ? { compatible: true }
        : { compatible: false, reason: 'Build 1 base-ten blocks support positive whole numbers up to 9,999.' };
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

/** Build a structured, non-distortable recipe from extracted values. */
export function createModelRecipe(family, infoOrText, options = {}) {
  const info = typeof infoOrText === 'string' ? extractMathInfo(infoOrText) : infoOrText;
  if (!BUILD1_MODEL_FAMILIES.includes(family) || !info) return null;
  if (!compatibilityFor(family, info).compatible) return null;

  const intent = INTENTS.has(options.intent) ? options.intent : 'practice';
  const completionState = requestedCompletion(intent, options.completionState);
  const purpose = options.purpose || inferPurpose(info, intent);
  const values = info.numericValues;
  const integers = wholeNumbers(info);
  const positives = positiveWholeNumbers(info);
  const unit = info.units[0] ?? null;
  let variant;
  let recipeValues;

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
    case 'comparison-bar':
      variant = 'difference';
      recipeValues = {
        quantities: values.slice(0, 2),
        difference: null,
        proportional: true
      };
      break;
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
    unknown: info.unknowns[0] ?? null,
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

  let candidates = rankSignals(info)
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
    const recipe = createModelRecipe(candidate.family, info, { ...options, intent });
    const leak = evaluateAnswerLeak(recipe, { intent });
    return {
      family: candidate.family,
      label: FAMILY_META[candidate.family].label,
      mathematicalPurpose: FAMILY_META[candidate.family].purpose,
      score: candidate.score,
      confidence: scoreConfidence(candidate.score),
      reason: candidate.reason,
      explicit: candidate.explicit,
      recipe,
      answerRevealRisk: leak.risk,
      answerRevealReasons: leak.reasons
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
    && top.answerRevealRisk === 'none';
  const safeHighMatch = confidence === 'high'
    && top?.recipe
    && !clarification
    && !info.hasExistingRepresentation
    && top.answerRevealRisk !== 'high'
    && (intent !== 'assessment' || assessmentAllowsBlankExplicitResponse);

  const provisionalRecipe = safeHighMatch ? top.recipe : null;
  const noModelRecommended = !top || confidence === 'low' || info.hasExistingRepresentation;
  if (!top) warnings.push('No Build 1 model can be matched reliably; leaving the question unmodelled is safest.');

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
    extracted: info
  };
}

/** Short alias used by UI code. */
export const matchModels = matchQuestionToModels;
