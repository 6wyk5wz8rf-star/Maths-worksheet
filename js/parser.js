/**
 * Maths Page Studio question import utilities.
 *
 * The parser is deliberately conservative: it records structure around the
 * teacher's text, but never rewrites the source. Every returned item has an
 * `originalText` slice and the complete import is retained as `originalText`
 * on the result.
 */

const TASK_VERBS = [
  'calculate', 'complete', 'compare', 'describe', 'draw', 'estimate',
  'explain', 'find', 'give', 'identify', 'mark', 'order', 'partition',
  'place', 'prove', 'represent', 'round', 'shade', 'share', 'show',
  'solve', 'subtract', 'tick', 'use', 'work out', 'write'
];

const UNIT_PATTERN =
  '(?:millimet(?:re|er)s?|centimet(?:re|er)s?|kilomet(?:re|er)s?|met(?:re|er)s?|kilograms?|grams?|millilit(?:re|er)s?|lit(?:re|er)s?|seconds?|minutes?|hours?|days?|weeks?|months?|years?|mm|cm|km|kg|mg|ml|m|g|l|p|%)';

const NUMBER_TOKEN_SOURCE =
  '[\u2212-]?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?';

const CLOCK_HOUR_WORDS = Object.freeze({
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

const MARK_PATTERNS = [
  /\[\s*(\d+)\s*(?:marks?|m)\s*\]/gi,
  /\(\s*(\d+)\s*(?:marks?|m)\s*\)/gi,
  /(?:^|[ \t])(\d+)\s+marks?\s*$/gim
];

// These short, familiar labels are safe to treat as section headings even
// when they appear directly after a numbered question. Copied web content
// often omits a blank line before the next label; without this explicit list
// a heading such as "Reasoning" would be accidentally appended to the
// previous question. Keep the list deliberately narrow so wrapped prose is
// still preserved intact.
const EXPLICIT_SECTION_HEADING = /^(?:section\s+[a-z0-9]+\b|place value|addition|subtraction|multiplication|division|fractions?|number|reasoning|problem solving|fluency|challenge|practice|explain|prove|stretch|extension|statistics|measurement|geometry|position and direction)(?:\s+questions?)?\s*:?$/i;

/** Return an exact two-part split. No trimming or normalisation is applied. */
export function splitQuestionAt(text, index) {
  const source = String(text ?? '');
  if (!Number.isInteger(index) || index < 0 || index > source.length) {
    throw new RangeError('Split position must be a valid character index.');
  }
  return [source.slice(0, index), source.slice(index)];
}

function makeLines(source) {
  if (!source) return [];
  const lines = [];
  let start = 0;
  while (start < source.length) {
    let cursor = start;
    while (cursor < source.length && source[cursor] !== '\n' && source[cursor] !== '\r') {
      cursor += 1;
    }
    const contentEnd = cursor;
    if (source[cursor] === '\r' && source[cursor + 1] === '\n') cursor += 2;
    else if (source[cursor] === '\r' || source[cursor] === '\n') cursor += 1;
    lines.push({
      text: source.slice(start, contentEnd),
      start,
      contentEnd,
      end: cursor,
      newline: source.slice(contentEnd, cursor)
    });
    start = cursor;
  }
  return lines;
}

/**
 * Recognise list punctuation only when it is followed by whitespace. This is
 * the key protection against treating `1.5`, `10.30`, `1,000`, `3/4`, or a
 * measurement such as `2.4 kg` as a list marker.
 */
export function readListMarker(line) {
  const value = String(line ?? '');
  const match = value.match(
    /^([ \t]*)(?:(\d{1,3})([.)])|\((\d{1,3}|[a-zA-Z])\)|([a-zA-Z])([.)])|([\u2022\u25cf\u25aa\u2023\u25e6*\-\u2013\u2014]))[ \t]+/
  );
  if (!match) return null;

  let type;
  let label = null;
  if (match[2]) {
    type = 'number';
    label = match[2];
  } else if (match[4]) {
    label = match[4];
    type = /^\d+$/.test(label) ? 'number' : 'subpart';
  } else if (match[5]) {
    type = 'subpart';
    label = match[5];
  } else {
    type = 'bullet';
  }

  return {
    type,
    label,
    marker: match[0].slice(match[1].length).trim(),
    indent: match[1],
    length: match[0].length,
    body: value.slice(match[0].length)
  };
}

function stripOpeningMarker(text) {
  const source = String(text ?? '');
  const firstBreak = source.search(/[\r\n]/);
  const firstLine = firstBreak === -1 ? source : source.slice(0, firstBreak);
  const marker = readListMarker(firstLine);
  if (!marker) return source;
  return source.slice(0, marker.indent.length) + source.slice(marker.length);
}

function findMarkAllocation(text) {
  const allocations = [];
  for (const pattern of MARK_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const leading = match[0].length - match[0].trimStart().length;
      allocations.push({
        marks: Number(match[1]),
        raw: match[0].trimStart(),
        start: match.index + leading,
        end: match.index + match[0].length
      });
      if (!match[0]) pattern.lastIndex += 1;
    }
  }
  allocations.sort((a, b) => a.start - b.start);
  return allocations.length ? allocations[allocations.length - 1] : null;
}

function extractSubparts(text) {
  const source = String(text ?? '');
  const markers = [];
  // Copied UK worksheets commonly use all three forms: (a), a) and a.
  // readListMarker already accepts them, so retain the same punctuation here
  // when the parent question is assembled from several source lines.
  const pattern = /(^|\r?\n|[ \t]+)(\(([a-z])\)|([a-z])[.)])[ \t]+/gim;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const markerOffset = match[1].length;
    markers.push({
      label: (match[3] || match[4]).toLowerCase(),
      marker: match[2],
      start: match.index + markerOffset,
      contentStart: match.index + match[0].length
    });
    if (!match[0]) pattern.lastIndex += 1;
  }
  return markers.map((marker, index) => {
    const next = markers[index + 1];
    return {
      label: marker.label,
      marker: marker.marker,
      text: source.slice(marker.contentStart, next ? next.start : source.length).trim(),
      sourceIndex: marker.start
    };
  });
}

function textHasMath(text) {
  return /\d|[+\u2212\-\u00d7\u00f7=<>\u2264\u2265]|\b(?:fraction|number|digit|calculate|total|difference|sum|product)\b/i.test(text);
}

function looksLikeHeading(text) {
  const clean = text.trim();
  if (!clean || clean.length > 90 || /[?.!]$/.test(clean)) return false;
  if (EXPLICIT_SECTION_HEADING.test(clean)) return true;

  const words = clean.replace(/[:\u2013\u2014-]+$/, '').split(/\s+/);
  const hasTaskVerb = TASK_VERBS.some((verb) => new RegExp(`^${escapeRegExp(verb)}\\b`, 'i').test(clean));
  if (hasTaskVerb || textHasMath(clean)) return false;
  const letters = clean.replace(/[^a-z]/gi, '');
  if (letters && clean === clean.toUpperCase()) return true;
  const titleCase = words.length <= 8 && words.every((word) =>
    /^(?:and|of|the|to|with|in|for)$/i.test(word) || /^[A-Z][a-z'\u2019-]*$/.test(word)
  );
  return titleCase || (clean.endsWith(':') && words.length <= 10);
}

function looksLikeSharedInstruction(text, followedByList = false) {
  const clean = text.trim();
  if (!clean) return false;
  if (/^(?:answer|complete|solve|attempt)\s+(?:all|each|the following)\b/i.test(clean)) return true;
  if (/^(?:show|write)\s+(?:all|each|your)\s+(?:working|answers?)\b/i.test(clean)) return true;
  if (/^(?:use|choose from)\s+the\s+(?:information|words?|numbers?|table|diagram)\b/i.test(clean) && followedByList) return true;
  if (followedByList && /:$/.test(clean) && TASK_VERBS.some((verb) =>
    new RegExp(`^${escapeRegExp(verb)}\\b`, 'i').test(clean)
  )) return true;
  if (followedByList && !textHasMath(clean) && /\b(?:questions?|each|following)\b/i.test(clean)) return true;
  return false;
}

function nextNonBlankLine(lines, from) {
  for (let index = from; index < lines.length; index += 1) {
    if (lines[index].text.trim()) return lines[index];
  }
  return null;
}

function classifyLooseLine(text, followedByList) {
  if (looksLikeHeading(text)) return 'section-heading';
  if (looksLikeSharedInstruction(text, followedByList)) return 'shared-instruction';
  return 'question';
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function makeItem(builder, source, counters, activeContext) {
  const originalText = source.slice(builder.start, builder.end);
  const displayText = builder.type === 'question' ? stripOpeningMarker(originalText) : originalText;
  const marker = builder.marker;
  let id;

  if (builder.type === 'question') id = `q-${++counters.question}`;
  else if (builder.type === 'section-heading') id = `section-${++counters.section}`;
  else id = `instruction-${++counters.instruction}`;

  const base = {
    id,
    type: builder.type,
    originalText,
    displayText,
    sourceRange: { start: builder.start, end: builder.end }
  };

  if (builder.type !== 'question') return base;

  const marks = findMarkAllocation(displayText);
  const mathInfo = extractMathInfo(displayText);
  const subparts = extractSubparts(displayText);
  return {
    ...base,
    sourceLabel: marker?.label ?? null,
    sourceMarker: marker?.marker ?? null,
    questionNumber: counters.question,
    sectionId: activeContext.sectionId,
    sharedInstructionId: activeContext.instructionId,
    marks: marks?.marks ?? null,
    markText: marks?.raw ?? null,
    subparts,
    mathInfo: { ...mathInfo, subparts },
  };
}

/**
 * Parse pasted question text into conservative structural cards.
 *
 * Return shape:
 * `{ originalText, items, questions, sections, instructions, warnings }`.
 */
export function parseQuestions(rawText) {
  const originalText = String(rawText ?? '');
  const lines = makeLines(originalText);
  const builders = [];
  let current = null;

  const finishCurrent = () => {
    if (!current) return;
    builders.push(current);
    current = null;
  };

  const addStandalone = (type, line) => {
    builders.push({ type, start: line.start, end: line.contentEnd, marker: null });
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const clean = line.text.trim();
    if (!clean) {
      const next = nextNonBlankLine(lines, index + 1);
      const nextMarker = next ? readListMarker(next.text) : null;
      if (current?.marker?.type === 'number' && nextMarker?.type === 'subpart') {
        // A visual gap before (a), (b), ... is common in copied worksheets;
        // keep those parts attached to their numbered parent.
        continue;
      }
      finishCurrent();
      continue;
    }

    const marker = readListMarker(line.text);
    if (marker) {
      // Lettered parts belong to the current numbered question when adjacent.
      if (marker.type === 'subpart' && current?.marker?.type === 'number') {
        current.end = line.contentEnd;
        continue;
      }
      finishCurrent();
      current = {
        type: 'question',
        start: line.start,
        end: line.contentEnd,
        marker
      };
      continue;
    }

    if (current) {
      // An explicit label on its own line is structural rather than a wrapped
      // continuation of the preceding question. This keeps copied section
      // headings attached to the worksheet, not to the question above.
      if (EXPLICIT_SECTION_HEADING.test(clean)) {
        finishCurrent();
        addStandalone('section-heading', line);
        continue;
      }
      // An unmarked line adjacent to a question is preserved as part of that
      // question, which protects wrapped and multi-line word problems.
      current.end = line.contentEnd;
      continue;
    }

    const next = nextNonBlankLine(lines, index + 1);
    const followedByList = Boolean(next && readListMarker(next.text));
    const type = classifyLooseLine(line.text, followedByList);
    if (type !== 'question') {
      addStandalone(type, line);
      continue;
    }

    current = {
      type: 'question',
      start: line.start,
      end: line.contentEnd,
      marker: null
    };
  }
  finishCurrent();

  const counters = { question: 0, section: 0, instruction: 0 };
  const context = { sectionId: null, instructionId: null };
  const items = [];
  for (const builder of builders) {
    const item = makeItem(builder, originalText, counters, context);
    items.push(item);
    if (item.type === 'section-heading') {
      context.sectionId = item.id;
      context.instructionId = null;
    } else if (item.type === 'shared-instruction') {
      context.instructionId = item.id;
    }
  }

  const questions = items.filter((item) => item.type === 'question');
  const warnings = [];
  if (originalText.trim() && !questions.length) warnings.push('No questions could be identified.');
  if (questions.length === 1 && /\n\s*\n/.test(originalText) && !readListMarker(originalText.trimStart())) {
    warnings.push('The import contains one question card; check whether a manual split is needed.');
  }

  return {
    originalText,
    items,
    questions,
    sections: items.filter((item) => item.type === 'section-heading'),
    instructions: items.filter((item) => item.type === 'shared-instruction'),
    warnings
  };
}

function rangesOverlap(start, end, occupied) {
  return occupied.some((range) => start < range.end && end > range.start);
}

function normaliseNumber(raw) {
  const cleaned = raw
    .replace(/[\u00a0\s]/g, '')
    .replace(/[,£$€%]/g, '')
    .replace('\u2212', '-');
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function collectPattern(source, pattern, kind, occupied, quantities, toRecord) {
  pattern.lastIndex = 0;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (!rangesOverlap(start, end, occupied)) {
      const record = toRecord(match, start, end);
      if (record) {
        quantities.push({ kind, ...record, start, end });
        occupied.push({ start, end });
      }
    }
    if (!match[0]) pattern.lastIndex += 1;
  }
}

function detectWords(source, definitions) {
  const matches = [];
  for (const [name, pattern] of definitions) {
    if (pattern.test(source)) matches.push(name);
  }
  return matches;
}

/**
 * `each` is common classroom instruction language ("check each answer",
 * "compare each pair") and is not, by itself, evidence of multiplication.
 * Only promote it when the surrounding clause actually supplies a repeated
 * quantity relationship.
 */
function hasMultiplicativeEachContext(source) {
  const number = NUMBER_TOKEN_SOURCE;
  const item = '[A-Za-z][A-Za-z\u2019\'-]*';
  const patterns = [
    new RegExp(`\\b${number}\\s+${item}(?:\\s+${item}){0,2}\\s+(?:with|holding|containing|of)\\s+${number}\\b[^.?!\\n]*\\b(?:in\\s+)?each\\b`, 'i'),
    new RegExp(`\\b${number}\\s+${item}(?:\\s+${item}){0,2}\\s+each\\s+(?:has|have|holds?|contains?|gets?|costs?|weighs?|measures?|needs?)\\s+${number}\\b`, 'i'),
    new RegExp(`\\beach\\s+${item}(?:\\s+${item}){0,2}\\s+(?:has|have|holds?|contains?|gets?|costs?|weighs?|measures?|needs?)\\s+${number}\\b`, 'i'),
    new RegExp(`\\b${number}\\s+${item}(?:\\s+${item}){0,2}\\s+(?:are|is|were|was)?\\s*(?:placed|put|packed|shared|given)?\\s*(?:in|into|for)\\s+each\\s+(?:of\\s+)?${number}\\b`, 'i'),
    new RegExp(`\\beach\\s+of\\s+${number}\\s+${item}(?:\\s+${item}){0,2}\\s+(?:has|have|holds?|contains?|gets?|costs?|weighs?|measures?|needs?)\\s+${number}\\b`, 'i'),
    new RegExp(`\\b${number}\\s+(?:packs?|trays?|boxes?|bags?)\\s+of\\s+${number}\\b`, 'i'),
  ];
  return patterns.some((pattern) => pattern.test(source));
}

/** Extract deterministic mathematical signals without changing the question. */
export function extractMathInfo(text) {
  const rawText = String(text ?? '');
  const source = stripOpeningMarker(rawText);
  const occupied = [];
  const quantities = [];
  const warnings = [];

  const marks = findMarkAllocation(source);
  if (marks) occupied.push({ start: marks.start, end: marks.end });

  collectPattern(
    source,
    /\b([01]?\d|2[0-3]):([0-5]\d)(?:\s*(am|pm))?\b/gi,
    'time',
    occupied,
    quantities,
    (match) => {
      const sourceHours = Number(match[1]);
      const minutes = Number(match[2]);
      const meridiem = match[3]?.toLowerCase() ?? null;
      if (meridiem && (sourceHours < 1 || sourceHours > 12)) return null;
      let hours = sourceHours;
      if (meridiem === 'pm' && hours !== 12) hours += 12;
      if (meridiem === 'am' && hours === 12) hours = 0;
      return { raw: match[0], hours, sourceHours, minutes, meridiem, value: match[0] };
    }
  );

  // Common UK primary clock wording carries an exact time even when it has no
  // digits. Parse only unambiguous quarter/half-hour forms; looser language is
  // deliberately left for teacher review rather than converted by guesswork.
  collectPattern(
    source,
    /\b(quarter|half)\s+(past|to)\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|(?:1[0-2]|[1-9]))\b/gi,
    'time',
    occupied,
    quantities,
    (match) => {
      const fraction = match[1].toLowerCase();
      const direction = match[2].toLowerCase();
      if (fraction === 'half' && direction === 'to') return null;
      const namedHour = CLOCK_HOUR_WORDS[match[3].toLowerCase()] ?? Number(match[3]);
      if (!Number.isInteger(namedHour) || namedHour < 1 || namedHour > 12) return null;
      const minutes = fraction === 'half' ? 30 : direction === 'past' ? 15 : 45;
      const sourceHours = direction === 'to' ? ((namedHour + 10) % 12) + 1 : namedHour;
      return {
        raw: match[0],
        hours: sourceHours,
        sourceHours,
        minutes,
        meridiem: null,
        value: `${sourceHours}:${String(minutes).padStart(2, '0')}`,
      };
    }
  );

  // Read mixed numbers before ordinary fractions.  Leaving `2 3/5` as a
  // separate `2` and `3/5` makes a number-line task look as though it has two
  // unrelated values, which is both mathematically false and especially
  // harmful when the pupil is meant to locate that exact value.
  collectPattern(
    source,
    /\b([\u2212-]?\d+)\s+(\d+)\s*\/\s*(\d+)\b/g,
    'fraction',
    occupied,
    quantities,
    (match) => {
      const whole = normaliseNumber(match[1]);
      const numerator = normaliseNumber(match[2]);
      const denominator = normaliseNumber(match[3]);
      if (denominator === 0) warnings.push(`The source contains an undefined fraction: ${match[0]}.`);
      if (!Number.isFinite(whole) || !Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
      const sign = whole < 0 ? -1 : 1;
      return {
        raw: match[0], whole, numerator, denominator,
        value: denominator ? whole + (sign * (numerator / denominator)) : null,
        mixed: true,
      };
    }
  );

  collectPattern(
    source,
    /\b([\u2212-]?\d+)\s*\/\s*([\u2212-]?\d+)\b/g,
    'fraction',
    occupied,
    quantities,
    (match) => {
      const operatorSpaced = /\s\/\s/.test(match[0]);
      const after = source.slice(match.index + match[0].length);
      const explicitFractionContext = /^\s+of\b/i.test(after)
        || /\b(?:fraction|numerator|denominator|equivalent)\b/i.test(source);
      // In a direct calculation, whitespace on both sides makes `/` an
      // operator. Compact forms such as 3/4 remain fractions, as do explicit
      // fraction-of-quantity and fraction-vocabulary questions.
      if (operatorSpaced && !explicitFractionContext) return null;
      const numerator = normaliseNumber(match[1]);
      const denominator = normaliseNumber(match[2]);
      if (denominator === 0) warnings.push(`The source contains an undefined fraction: ${match[0]}.`);
      return {
        raw: match[0], numerator, denominator,
        value: denominator ? numerator / denominator : null
      };
    }
  );

  collectPattern(
    source,
    new RegExp(`[\u00a3$\u20ac]\\s*${NUMBER_TOKEN_SOURCE}`, 'g'),
    'currency',
    occupied,
    quantities,
    (match) => ({
      raw: match[0],
      value: normaliseNumber(match[0]),
      currency: match[0].trim()[0]
    })
  );

  collectPattern(
    source,
    new RegExp(`${NUMBER_TOKEN_SOURCE}(?:\\s*${UNIT_PATTERN}(?![A-Za-z]))?`, 'gi'),
    'number',
    occupied,
    quantities,
    (match, start) => {
      let raw = match[0];
      // `3-5` is a range, not positive three followed by negative five.
      if (/^[\u2212-]/.test(raw) && start > 0 && /\d/.test(source[start - 1])) raw = raw.slice(1);
      const numberMatch = raw.match(new RegExp(NUMBER_TOKEN_SOURCE));
      if (!numberMatch) return null;
      const unitMatch = raw.slice(numberMatch[0].length).trim().match(new RegExp(`^${UNIT_PATTERN}$`, 'i'));
      return {
        raw: match[0],
        value: normaliseNumber(numberMatch[0]),
        unit: unitMatch?.[0]?.toLowerCase() ?? null,
        decimal: /\./.test(numberMatch[0]),
        thousandsSeparated: /,/.test(numberMatch[0])
      };
    }
  );

  quantities.sort((a, b) => a.start - b.start);
  const fractions = quantities.filter((item) => item.kind === 'fraction');
  const times = quantities.filter((item) => item.kind === 'time');
  const numberQuantities = quantities.filter((item) => item.kind === 'number' || item.kind === 'currency');
  const numericValues = numberQuantities.map((item) => item.value).filter(Number.isFinite);
  const unitsAfterFractions = [];
  const unitScan = new RegExp(`(?:${NUMBER_TOKEN_SOURCE}|\\d+\\s*\\/\\s*\\d+)\\s*(${UNIT_PATTERN})(?![A-Za-z])`, 'gi');
  let unitMatch;
  while ((unitMatch = unitScan.exec(source)) !== null) {
    if (unitMatch[1]) unitsAfterFractions.push(unitMatch[1].toLowerCase());
    if (!unitMatch[0]) unitScan.lastIndex += 1;
  }
  const units = [...new Set([
    ...numberQuantities.map((item) => item.unit).filter(Boolean),
    ...unitsAfterFractions
  ])];

  let operationLanguage = detectWords(source, [
    ['addition', /\b(?:add|added|addition|altogether|combined|in all|sum|total|bought|received|collected|gained)\b/i],
    ['subtraction', /\b(?:subtract|subtraction|take away|difference|remain(?:ing)?|left over|fewer|sold|spent|used|gave away|removed|lost)\b/i],
    ['multiplication', /\b(?:multiply|multiplication|product|times|twice|double|groups? of|lots? of|rows? of|packs? of|trays? of)\b/i],
    ['division', /\b(?:divide|division|share|shared|sharing|equally|groups? can|groups? are|how many\s+\d+(?:s|'s)?\s+(?:are there|in))\b/i]
  ]);
  if (hasMultiplicativeEachContext(source) && !operationLanguage.includes('multiplication')) {
    operationLanguage.push('multiplication');
  }
  const clearDivisionContext = /\b(?:share|shared|sharing|divide|division|how many\s+groups?|groups?\s+can\s+be\s+made|how many\s+\d+(?:s|'s)?\s+(?:are there|in)|(?:put|placed|packed)\s+into\s+(?:bags?|boxes?|packs?)\s+of)\b/i.test(source);
  if (clearDivisionContext && !operationLanguage.includes('division')) operationLanguage.push('division');
  if (clearDivisionContext && !/\b(?:multiply|multiplication|product|times)\b|\u00d7/i.test(source)) {
    operationLanguage = operationLanguage.filter((operation) => operation !== 'multiplication');
  }
  // In a sharing/grouping question, "left over" names the division
  // remainder; it is not evidence of a second subtraction step. Preserve a
  // genuine compound reading when subtraction is stated independently.
  const divisionRemainderContext = clearDivisionContext && /\b(?:remainder|left over)\b/i.test(source);
  const explicitSubtractionContext = /\b(?:subtract|subtraction|take away|difference|fewer)\b|\d\s*[\u2212-]\s*\d/i.test(source);
  if (divisionRemainderContext && !explicitSubtractionContext) {
    operationLanguage = operationLanguage.filter((operation) => operation !== 'subtraction');
  }
  const clearMultiplicationContext = /\b(?:multiply|multiplication|product|times|twice|double|groups? of|rows? of|lots? of)\b|\u00d7/i.test(source)
    || hasMultiplicativeEachContext(source);
  if (clearMultiplicationContext
    && !/\b(?:add|added|addition|sum|combined|in all)\b|\+/i.test(source)) {
    operationLanguage = operationLanguage.filter((operation) => operation !== 'addition');
  }

  const symbolicOperations = [];
  if (/\d\s*\+\s*(?:[£$€]\s*)?[\d?]/.test(source)) symbolicOperations.push('addition');
  if (/\d\s*[\u2212-]\s*(?:[£$€]\s*)?[\d?]/.test(source)) symbolicOperations.push('subtraction');
  if (/\d\s*(?:\u00d7|[x*])\s*[\d?]/i.test(source)) symbolicOperations.push('multiplication');
  if (/\d\s*(?:\u00f7|\/)\s*[\d?]/.test(source) && !fractions.length) symbolicOperations.push('division');
  const operations = [...new Set([...symbolicOperations, ...operationLanguage])];

  const comparisonLanguage = detectWords(source, [
    ['greater-than', /\b(?:greater than|more than|larger than)\b|>/i],
    ['less-than', /\b(?:less than|fewer than|smaller than)\b|</i],
    ['difference', /\b(?:difference between|how many more|how many fewer)\b/i],
    ['compare', /\b(?:compare|comparison|order)\b/i],
    ['equal', /\b(?:equal to|same as|equivalent)\b|=/i]
  ]);

  const taskVerbs = TASK_VERBS.filter((verb) =>
    new RegExp(`\\b${escapeRegExp(verb)}\\b`, 'i').test(source)
  );

  let divisionInterpretation = null;
  if (operations.includes('division')) {
    const sharing = /\b(?:share|shared|sharing|divide|split)\b[^.?!\n]*\b(?:between|among|equally|each gets?)\b|\bshared equally\b/i.test(source);
    const grouping = /\b(?:how many|make|made into|form)\s+groups?\b|\bgroups? of\s+\d|\bhow many\s+\d+(?:s|'s)?\s+(?:are there|in)\b|\b(?:put|placed|packed)\s+into\s+(?:bags?|boxes?|packs?)\s+of\s+\d/i.test(source);
    if (sharing && !grouping) divisionInterpretation = 'sharing';
    else if (grouping && !sharing) divisionInterpretation = 'grouping';
    else divisionInterpretation = 'ambiguous';
  }

  const representationNoun = '(?:diagram|model|chart|graph|pictogram|number line|array|grid|table|clock|shape|triangle|quadrilateral|polygon|angle|jug|container|measuring cylinder|thermometer|scale|ruler|picture|image|figure)';
  const hasExistingRepresentation = [
    new RegExp(`\\b${representationNoun}\\s+(?:below|above|shown|provided|given)\\b`, 'i'),
    new RegExp(`\\b${representationNoun}\\s+(?:is|are|was|were)\\s+(?:shown|provided|given)\\b`, 'i'),
    new RegExp(`\\bshown\\s+(?:in|on|by)\\s+(?:the|this|that|these|those)\\s+${representationNoun}\\b`, 'i'),
    new RegExp(`\\b(?:use|read|look\\s+at|refer\\s+to|from)\\s+(?:the|this|that|these|those|following)\\s+${representationNoun}\\b`, 'i'),
    new RegExp(`\\b(?:the|this|that|these|those)\\s+${representationNoun}\\s+(?:shows?|represents?|gives?|contains?|has|is)\\b`, 'i'),
    new RegExp(`\\b(?:what|which|how\\s+many|how\\s+much)\\b[^.?!\\n]*\\b(?:this|that|the)\\s+${representationNoun}\\b`, 'i'),
    new RegExp('\\b(?:use|read)\\s+(?:the\\s+)?information\\s+(?:in|on|from)\\s+(?:the|this|that|following)\\s+' + representationNoun + '\\b', 'i'),
    new RegExp('\\b(?:complete|fill\\s+in)\\s+(?:the|this|that|following)\\s+' + representationNoun + '\\b', 'i'),
    /\bwhat\s+time\s+(?:is|was)\s+(?:shown|displayed|indicated)\b/i,
    /^\s*what\s+time\s+is\s+it\s*[?.!]?\s*$/i,
    /\bwhat\s+fraction\b[^.?!\n]*\b(?:is|has\s+been)\s+(?:shaded|colou?red|highlighted)\b/i,
    /\b(?:underlined|shaded|colou?red|highlighted)\s+(?:digit|number|part|section|region|shape)\b|\b(?:digit|number|part|section|region|shape)\s+(?:underlined|shaded|colou?red|highlighted)\b/i,
  ].some((pattern) => pattern.test(source));

  const domainScores = new Map();
  const scoreDomain = (domain, score) => domainScores.set(domain, (domainScores.get(domain) || 0) + score);
  if (fractions.length || /\b(?:fraction|numerator|denominator|equivalent|halves|thirds|quarters)\b/i.test(source)) scoreDomain('fractions', 5);
  if (/\b(?:place value|digit|partition|expanded form|thousands|hundreds|tens|ones)\b/i.test(source)) scoreDomain('place-value', 5);
  if (operations.length) scoreDomain('calculation', 3 + operations.length);
  if (comparisonLanguage.length) scoreDomain('comparison', 3);
  if (units.length) scoreDomain('measurement', 4);
  if (times.length || /\b(?:time|clock|minutes?|hours?)\b/i.test(source)) scoreDomain('time', 5);
  if (/\b(?:shape|angle|perimeter|area|vertex|vertices|parallel|perpendicular)\b/i.test(source)) scoreDomain('geometry', 5);
  if (/\b(?:chart|graph|pictogram|data|frequency|tally)\b|\b(?:use|read|complete)\s+the\s+table\b|\btable\s+(?:below|above|shown|provided|gives?|shows?)\b/i.test(source)) scoreDomain('statistics', 4);
  const likelyDomains = [...domainScores]
    .map(([domain, score]) => ({ domain, score }))
    .sort((a, b) => b.score - a.score || a.domain.localeCompare(b.domain));

  const expressionMatch = source.match(
    new RegExp(`(${NUMBER_TOKEN_SOURCE})\\s*([+\u2212\u00d7\u00f7x*]|-)\\s*(${NUMBER_TOKEN_SOURCE})(?:\\s*=\\s*(${NUMBER_TOKEN_SOURCE}|[?＿_\\u25a1]+))?`, 'i')
  );
  const expression = expressionMatch ? {
    left: normaliseNumber(expressionMatch[1]),
    operator: expressionMatch[2],
    right: normaliseNumber(expressionMatch[3]),
    result: expressionMatch[4] && !/[?＿_\u25a1]/.test(expressionMatch[4])
      ? normaliseNumber(expressionMatch[4])
      : null,
    resultUnknown: !expressionMatch[4] || /[?＿_\u25a1]/.test(expressionMatch[4])
  } : null;

  const unknowns = [];
  if (/[?]/.test(source)) unknowns.push('question');
  if (/[＿_]{2,}|\u25a1/.test(source)) unknowns.push('blank');
  if (/\b(?:missing|unknown|find|calculate|work out|how many|what is)\b/i.test(source)) unknowns.push('requested-value');

  if (operations.length > 1 && !/\b(?:two-step|multi-step)\b/i.test(source)) {
    warnings.push('More than one possible operation was detected; check the mathematical structure.');
  }

  return {
    rawText,
    analysedText: source,
    quantities,
    numbers: numberQuantities,
    numericValues,
    fractions,
    times,
    units,
    operations,
    operationLanguage,
    comparisonLanguage,
    taskVerbs,
    divisionInterpretation,
    likelyDomains,
    likelyDomain: likelyDomains[0]?.domain ?? null,
    expression,
    unknowns: [...new Set(unknowns)],
    marks: marks?.marks ?? null,
    subparts: extractSubparts(source),
    hasExistingRepresentation,
    warnings
  };
}
