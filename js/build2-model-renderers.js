/**
 * Maths Page Studio · Build 2 model renderers.
 *
 * Every renderer is deterministic, self-contained SVG or semantic HTML. The
 * renderer validates and normalises its recipe before drawing, so an unsafe
 * edit produces a calm safety message instead of distorted mathematical art.
 */

import {
  getBuild2ModelDefinition,
  validateBuild2ModelRecipe,
  describeBuild2Model,
} from './build2-model-bank.js';

const WIDTH = 640;
const HEIGHT = 236;
const ink = '#29283a';
const muted = '#6d6a7a';
const line = '#8d899a';
const pale = '#eef0f8';
const lavender = '#d9d7ec';
const green = '#dbe8dc';
const peach = '#f2dfd3';

const escapeMarkup = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const n = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const integer = (value, fallback = 0) => Math.round(n(value, fallback));
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const fmt = (value, places = 6) => {
  const numeric = n(value, null);
  if (numeric == null) return '';
  return Number.isInteger(numeric) ? String(numeric) : String(Number(numeric.toFixed(places)));
};

function svgIdFragment(value) {
  const fragment = String(value ?? '')
    .trim()
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '');
  return fragment || 'instance';
}

/**
 * SVG ids are document-global, even when the models sit in separate <svg>s.
 * Callers that render more than one model should therefore pass a stable
 * `instanceId` (normally the question-model block id).  The recipe metadata
 * fallbacks keep the API friendly for persisted and server-rendered recipes.
 */
function modelId(recipe, options = {}) {
  const family = svgIdFragment(recipe.family);
  const instance = options.instanceId
    ?? recipe.instanceId
    ?? recipe.metadata?.instanceId
    ?? recipe.metadata?.renderInstanceId;
  return `b2-${family}${instance == null || instance === '' ? '' : `-${svgIdFragment(instance)}`}`;
}

function hidden(recipe, key, options = {}) {
  if (options.outputView === 'teacher') return false;
  if (recipe.scaffoldState === 'blank') return true;
  const keys = new Set([...(Array.isArray(recipe.hidden) ? recipe.hidden : []), recipe.unknown].filter(Boolean).map(String));
  if (keys.has(key) || keys.has('all')) return true;
  // Intelligence speaks in task-level terms; renderers use small, structural
  // tokens. Keep the translation here too so a saved or manually edited
  // recipe cannot accidentally disclose chart data or a requested result.
  if (keys.has('chart-data') && (key === 'point' || /^(?:bar|symbol|point|category|tally|frequency):/.test(key))) return true;
  if (keys.has('clock-hands') && key === 'hands') return true;
  if (keys.has('fraction-of-quantity-result') && ['selected-total', 'selected'].includes(key)) return true;
  if (keys.has('rounded-value') && ['rounded-result', 'marker', 'target'].includes(key)) return true;
  // A question analysis normally names a mathematical role (for example
  // "digit" or "comparison-symbol"), while a renderer may address several
  // individual slots.  Translate those generic roles before drawing so a
  // saved recipe cannot leak the requested indexed value.
  if (keys.has('digit') && /^digit:\d+$/.test(key)) return true;
  if (keys.has('comparison-symbol') && /^comparison:\d+$/.test(key)) return true;
  if (keys.has('point') && /^point:\d+$/.test(key)) return true;
  if ((keys.has('label') || keys.has('interval')) && /^label:\d+$/.test(key)) return true;
  if (keys.has('numerator') && /^fraction:\d+:numerator$/.test(key)) return true;
  if (keys.has('denominator') && /^fraction:\d+:denominator$/.test(key)) return true;
  return false;
}

function shown(recipe, key, value, options, fallback = '?') {
  return hidden(recipe, key, options) ? fallback : fmt(value);
}

function svgText(x, y, value, options = {}) {
  const anchor = options.anchor ?? 'middle';
  const size = options.size ?? 14;
  const fill = options.fill ?? ink;
  const weight = options.weight ?? 500;
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeMarkup(value)}</text>`;
}

function svgFrame(recipe, definition, content, options = {}, viewBox = `0 0 ${WIDTH} ${HEIGHT}`) {
  const description = escapeMarkup(describeBuild2Model(recipe));
  const id = modelId(recipe, options);
  return `<figure class="mps-build2-model mps-build2-model--${escapeMarkup(recipe.family)}" data-build2-model="${escapeMarkup(recipe.family)}">
    <svg class="mps-build2-model__svg" viewBox="${viewBox}" role="img" aria-label="${description}" xmlns="http://www.w3.org/2000/svg">
      <title>${escapeMarkup(definition.name)}</title><desc>${description}</desc>
      <defs><pattern id="${id}-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="#6a6680" stroke-width="2"/></pattern><marker id="${id}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5 0 10z" fill="#4f568f"/></marker></defs>
      <rect x="1" y="1" width="${WIDTH - 2}" height="${HEIGHT - 2}" rx="10" fill="#fff" stroke="#d4d1dd"/>
      ${content}
    </svg>
    <figcaption class="sr-only">${description}</figcaption>
  </figure>`;
}

function safetyMessage(family, errors = []) {
  return `<figure class="mps-build2-model mps-build2-model--invalid" data-build2-model="${escapeMarkup(family ?? 'unknown')}"><div role="img" aria-label="Model needs review"><strong>Model needs review</strong><span>${escapeMarkup(errors[0] ?? 'Check its mathematical values before printing.')}</span></div></figure>`;
}

function labelEvery(divisions) {
  return Math.max(1, Math.ceil(divisions / 10));
}

function renderNumberLine(recipe, definition, options) {
  const v = recipe.values;
  if (recipe.family === 'ordering-comparison-line') {
    const supplied = Array.isArray(v.numbers) ? v.numbers.map((value) => n(value, null)).filter((value) => value != null) : [];
    const cards = v.order === 'ascending' ? [...supplied].sort((a, b) => a - b) : supplied;
    const cardWidth = Math.min(132, Math.max(82, 470 / Math.max(1, cards.length)));
    const startX = 320 - (cards.length * cardWidth + Math.max(0, cards.length - 1) * 14) / 2;
    const content = [svgText(WIDTH / 2, 30, 'Order and compare', { size: 16, weight: 700 }), '<line x1="80" y1="180" x2="560" y2="180" stroke="#8d899a" stroke-width="2"/>'];
    cards.forEach((value, index) => {
      const x = startX + index * (cardWidth + 14);
      const valueText = hidden(recipe, `card:${index}`, options) || v.order === 'blank' ? '?' : fmt(value);
      content.push(`<rect x="${x}" y="82" width="${cardWidth}" height="54" rx="8" fill="${index % 2 ? lavender : pale}" stroke="${ink}" stroke-width="2"/>${svgText(x + cardWidth / 2, 116, valueText, { size: 19, weight: 700 })}`);
      if (index < cards.length - 1) {
        const symbol = v.showSymbols && !hidden(recipe, `comparison:${index}`, options) ? (value < cards[index + 1] ? '<' : value > cards[index + 1] ? '>' : '=') : '□';
        content.push(svgText(x + cardWidth + 7, 116, symbol, { size: 20, weight: 700 }));
      }
    });
    return svgFrame(recipe, definition, content.join(''), options);
  }
  let start = n(v.start, 0);
  let end = n(v.end, 10);
  let divisions = Math.max(1, integer(v.divisions, 10));
  if (recipe.family === 'fraction-number-line') {
    const denominator = Math.max(1, integer(v.denominator, 1));
    divisions = denominator * Math.max(1, integer(v.maxWhole, 1));
    start = 0;
    end = Math.max(1, integer(v.maxWhole, 1));
  }
  if (recipe.family === 'repeated-addition-line') {
    start = n(v.start, 0); divisions = Math.max(1, integer(v.jumpCount, 1)); end = start + n(v.jumpSize, 1) * divisions;
  }
  if (recipe.family === 'division-number-line') {
    start = 0; end = Math.max(1, n(v.total, 1)); divisions = Math.max(1, Math.floor(end / Math.max(1, n(v.divisor, 1))));
  }
  const left = 64; const right = 586; const y = recipe.family === 'negative-number-line' && v.orientation === 'vertical' ? 28 : 124;
  if (recipe.family === 'negative-number-line' && v.orientation === 'vertical') {
    const top = 28; const bottom = 208; const x = 320;
    const ticks = Array.from({ length: divisions + 1 }, (_, index) => start + ((end - start) * index / divisions));
    const content = [`<line x1="${x}" y1="${bottom}" x2="${x}" y2="${top}" stroke="${ink}" stroke-width="3"/>`];
    ticks.forEach((value, index) => {
      const py = bottom - (bottom - top) * index / divisions;
      content.push(`<line x1="${x - 10}" y1="${py}" x2="${x + 10}" y2="${py}" stroke="${ink}" stroke-width="2"/>`);
      if (index % labelEvery(divisions) === 0) content.push(svgText(x + 22, py + 5, shown(recipe, `label:${index}`, value, options), { anchor: 'start', size: 13 }));
    });
    return svgFrame(recipe, definition, content.join(''), options);
  }
  const values = Array.from({ length: divisions + 1 }, (_, index) => start + ((end - start) * index / divisions));
  const content = [`<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="${ink}" stroke-width="3"/><path d="M${right} ${y}l-10 -6v12z" fill="${ink}"/>`];
  values.forEach((value, index) => {
    const x = left + (right - left) * index / divisions;
    content.push(`<line x1="${x}" y1="${y - 9}" x2="${x}" y2="${y + 9}" stroke="${ink}" stroke-width="2"/>`);
    if (index % labelEvery(divisions) === 0) content.push(svgText(x, y + 30, shown(recipe, `label:${index}`, value, options), { size: 12 }));
  });
  const target = recipe.family === 'rounding-number-line' ? n(v.number, null)
    : recipe.family === 'fraction-number-line' ? n(v.target, null) / Math.max(1, integer(v.denominator, 1))
      : n(v.target, null);
  if (target != null && target >= start && target <= end && !hidden(recipe, 'marker', options) && !hidden(recipe, 'target', options)) {
    const x = left + ((target - start) / (end - start)) * (right - left);
    content.push(`<line x1="${x}" y1="${y - 42}" x2="${x}" y2="${y - 10}" stroke="#4f568f" stroke-width="3"/><circle cx="${x}" cy="${y}" r="6" fill="#4f568f"/>${svgText(x, y - 52, fmt(target), { size: 13, fill: '#4f568f', weight: 700 })}`);
  }
  if (recipe.family === 'rounding-number-line') {
    const lower = Math.floor(n(v.number, 0) / Math.max(1, n(v.step, 1))) * Math.max(1, n(v.step, 1));
    const upper = lower + Math.max(1, n(v.step, 1));
    const mid = (lower + upper) / 2;
    content.push(svgText(left, 52, `between ${fmt(lower)} and ${fmt(upper)}`, { anchor: 'start', size: 14, weight: 700 }));
    if (v.showMidpoint && !hidden(recipe, 'midpoint', options)) {
      const mx = left + ((mid - start) / (end - start)) * (right - left);
      content.push(`<line x1="${mx}" y1="${y - 14}" x2="${mx}" y2="${y + 14}" stroke="#856153" stroke-width="2" stroke-dasharray="4 3"/>${svgText(mx, y - 25, fmt(mid), { size: 12, fill: '#856153' })}`);
    }
  }
  return svgFrame(recipe, definition, content.join(''), options);
}

function decimalColumns(value) {
  const safe = Math.abs(n(value, 0));
  const [wholePart, decimalPart] = safe.toFixed(2).split('.');
  const wholeDigits = wholePart.padStart(1, '0').slice(-4).split('');
  const placeNames = ['Thousands', 'Hundreds', 'Tens', 'Ones'].slice(-wholeDigits.length);
  return {
    headers: [...placeNames, '.', 'Tenths', 'Hundredths'],
    digits: [...wholeDigits, '.', ...decimalPart.split('')],
  };
}

function renderPlaceValue(recipe, definition, options) {
  const v = recipe.values;
  const decimal = recipe.family === 'decimal-place-value-chart';
  const decimalData = decimal ? decimalColumns(v.number) : null;
  const headers = decimalData?.headers ?? ['Thousands', 'Hundreds', 'Tens', 'Ones'];
  const digits = decimalData?.digits ?? String(Math.max(0, Math.trunc(n(v.number, 0)))).padStart(4, '0').slice(-4).split('');
  const x0 = 88; const width = 470 / headers.length; const y0 = 58;
  const content = [svgText(WIDTH / 2, 28, definition.name, { size: 16, weight: 700 })];
  headers.forEach((header, index) => {
    const x = x0 + index * width;
    content.push(`<rect x="${x}" y="${y0}" width="${width}" height="118" fill="${index % 2 ? '#fbfafc' : pale}" stroke="${line}"/>`);
    content.push(svgText(x + width / 2, y0 + 22, header, { size: 12, weight: 700 }));
    const digit = digits[index] ?? '';
    if (header === '.') {
      content.push(svgText(x + width / 2, y0 + 74, '.', { size: 32, weight: 700 }));
    } else if (v.mode === 'counters' || v.mode === 'both' || recipe.family === 'place-value-counters' || recipe.family === 'base-ten-exchange' || recipe.family === 'place-value-multiplication') {
      const count = Math.min(9, Math.max(0, integer(digit, 0)));
      for (let c = 0; c < count; c += 1) {
        const cx = x + 14 + (c % 3) * 22; const cy = y0 + 50 + Math.floor(c / 3) * 20;
        content.push(`<circle cx="${cx}" cy="${cy}" r="7" fill="${index % 2 ? green : lavender}" stroke="${ink}" stroke-width="1.2"/>`);
      }
      if (v.mode !== 'counters' && !hidden(recipe, `digit:${index}`, options)) content.push(svgText(x + width / 2, y0 + 108, digit, { size: 18, weight: 700 }));
    } else content.push(svgText(x + width / 2, y0 + 84, shown(recipe, `digit:${index}`, digit, options), { size: 26, weight: 700 }));
  });
  if (recipe.family === 'base-ten-exchange' || recipe.family === 'place-value-exchange-workspace') {
    content.push(`<path d="M300 198c22-24 50-24 72 0" fill="none" stroke="#4f568f" stroke-width="3" marker-end="url(#${modelId(recipe, options)}-arrow)"/><text x="320" y="218" text-anchor="middle" font-family="Arial" font-size="12" fill="#4f568f">exchange 10 for 1</text>`);
  }
  return svgFrame(recipe, definition, content.join(''), options);
}

function renderArrowCards(recipe, definition, options) {
  const number = String(Math.max(0, Math.trunc(n(recipe.values.number, 0)))).padStart(4, '0').slice(-4);
  const placeValues = [1000, 100, 10, 1];
  const hiddenCards = new Set(Array.isArray(recipe.values.hiddenCards) ? recipe.values.hiddenCards.map(integer) : []);
  const cards = number.split('').map((digit, index) => Number(digit) * placeValues[index]);
  const content = [svgText(WIDTH / 2, 30, 'Build the number', { size: 16, weight: 700 })];
  cards.forEach((value, index) => {
    const x = 76 + index * 126;
    const off = hiddenCards.has(index) || hidden(recipe, `card:${index}`, options);
    content.push(`<path d="M${x} 74h96v78H${x + 20}l-20 18z" fill="${index % 2 ? lavender : pale}" stroke="${ink}" stroke-width="2"/>${svgText(x + 51, 119, off ? '?' : fmt(value), { size: 22, weight: 700 })}`);
  });
  const total = cards.reduce((sum, value) => sum + value, 0);
  content.push(`<line x1="94" y1="180" x2="546" y2="180" stroke="${line}"/><text x="320" y="211" text-anchor="middle" font-family="Arial" font-size="20" font-weight="700" fill="${ink}">${hidden(recipe, 'whole', options) ? '?' : fmt(total)}</text>`);
  return svgFrame(recipe, definition, content.join(''), options);
}

function renderTree(recipe, definition, options) {
  const v = recipe.values;
  const parts = Array.isArray(v.parts) ? v.parts : (v.family === 'addition-subtraction' ? [n(v.a, 0), n(v.b, 0)] : []);
  const whole = n(v.whole, n(v.total, parts.reduce((sum, item) => sum + n(item, 0), 0)));
  const family = v.family;
  const content = [svgText(WIDTH / 2, 26, definition.name, { size: 16, weight: 700 })];
  if (recipe.family === 'inverse-fact-family') {
    const values = [n(v.a, 7), n(v.b, 5), n(v.total, 12)];
    const points = [[320, 58], [196, 162], [444, 162]];
    content.push(`<path d="M320 81L196 139M320 81l124 58M216 162h208" stroke="${line}" stroke-width="2"/>`);
    points.forEach(([x, y], index) => content.push(`<circle cx="${x}" cy="${y}" r="27" fill="${[lavender, green, peach][index]}" stroke="${ink}" stroke-width="2"/>${svgText(x, y + 6, shown(recipe, `value:${index}`, values[index], options), { size: 19, weight: 700 })}`));
    content.push(svgText(320, 211, family === 'multiplication-division' ? '×  and  ÷ facts' : '+  and  − facts', { size: 13, fill: muted }));
  } else {
    const branchCount = Math.max(2, Math.min(6, parts.length || 2));
    const xs = Array.from({ length: branchCount }, (_, index) => 116 + index * (408 / Math.max(1, branchCount - 1)));
    content.push(`<circle cx="320" cy="64" r="29" fill="${lavender}" stroke="${ink}" stroke-width="2"/>${svgText(320, 71, shown(recipe, 'whole', whole, options), { size: 20, weight: 700 })}`);
    xs.forEach((x, index) => {
      const y = 166;
      content.push(`<line x1="320" y1="93" x2="${x}" y2="${y - 28}" stroke="${line}" stroke-width="2"/><circle cx="${x}" cy="${y}" r="27" fill="${index % 2 ? green : peach}" stroke="${ink}" stroke-width="2"/>${svgText(x, y + 6, shown(recipe, `part:${index}`, parts[index] ?? '', options), { size: 17, weight: 700 })}`);
    });
  }
  return svgFrame(recipe, definition, content.join(''), options);
}

function roman(number) {
  const values = [[100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let remaining = clamp(integer(number, 1), 1, 100); let result = '';
  values.forEach(([value, symbol]) => { while (remaining >= value) { result += symbol; remaining -= value; } });
  return result;
}

function renderRoman(recipe, definition, options) {
  const value = clamp(integer(recipe.values.number, 1), 1, 100);
  const showArabic = recipe.values.showArabic !== false && !hidden(recipe, 'arabic', options);
  const showRoman = recipe.values.showRoman !== false && !hidden(recipe, 'roman', options);
  const content = [svgText(WIDTH / 2, 34, 'Roman numeral builder', { size: 16, weight: 700 })];
  ['I', 'V', 'X', 'L', 'C'].forEach((letter, index) => content.push(`<rect x="${106 + index * 88}" y="60" width="66" height="50" rx="7" fill="${index % 2 ? lavender : pale}" stroke="${line}"/>${svgText(139 + index * 88, 92, letter, { size: 25, weight: 700 })}`));
  content.push(`<line x1="136" y1="144" x2="504" y2="144" stroke="${line}"/><text x="230" y="193" text-anchor="middle" font-family="Arial" font-size="28" font-weight="700" fill="${ink}">${showArabic ? value : '?'}</text><text x="408" y="193" text-anchor="middle" font-family="Arial" font-size="28" font-weight="700" fill="${ink}">${showRoman ? roman(value) : '?'}</text>${svgText(320, 174, 'is written as', { size: 12, fill: muted })}`);
  return svgFrame(recipe, definition, content.join(''), options);
}

function renderColumn(recipe, definition, options) {
  const v = recipe.values;
  let operands = Array.isArray(v.operands) ? v.operands.map((item) => Math.max(0, Math.trunc(n(item, 0))) ) : [];
  if (!operands.length && v.number != null) operands = [Math.max(0, Math.trunc(n(v.number, 0))), Math.max(1, Math.trunc(n(v.multiplier, 1)))];
  if (!operands.length && v.dividend != null) operands = [Math.max(0, Math.trunc(n(v.dividend, 0))), Math.max(1, Math.trunc(n(v.divisor, 1)))];
  const operation = v.operation ?? (recipe.family.includes('subtraction') ? 'subtraction' : recipe.family.includes('multiplication') ? 'multiplication' : 'addition');
  const symbol = operation === 'subtraction' ? '−' : operation === 'multiplication' ? '×' : operation === 'division' ? '÷' : '+';
  const result = v.result ?? v.quotient ?? null;
  const digits = Math.max(3, ...operands.map((item) => String(item).length), result == null ? 0 : String(result).length);
  const x = 430; const cell = 32; const y = 58;
  const content = [svgText(WIDTH / 2, 27, definition.name, { size: 16, weight: 700 })];
  for (let col = 0; col < digits; col += 1) content.push(`<line x1="${x - col * cell - 16}" y1="${y}" x2="${x - col * cell - 16}" y2="${y + 132}" stroke="#e1dfe6"/>`);
  operands.slice(0, 4).forEach((value, row) => {
    const string = String(value).padStart(digits, ' ');
    content.push(svgText(x - digits * cell + 12, y + 35 + row * 26, row === operands.length - 1 ? symbol : '', { size: 18, anchor: 'end', weight: 700 }));
    string.split('').forEach((digit, index) => content.push(svgText(x - (digits - 1 - index) * cell, y + 35 + row * 26, digit.trim() ? digit : '', { size: 20, weight: 600 })));
  });
  const lineY = y + 43 + operands.length * 26;
  content.push(`<line x1="${x - digits * cell - 18}" y1="${lineY}" x2="${x + 18}" y2="${lineY}" stroke="${ink}" stroke-width="2"/>`);
  const answer = hidden(recipe, 'result', options) || result == null ? '?' : fmt(result);
  content.push(svgText(x, lineY + 32, answer, { size: 21, weight: 700 }));
  if (v.showExchangeRow || recipe.family.includes('expanded')) content.push(svgText(x - digits * cell / 2, y - 10, hidden(recipe, 'exchange', options) ? 'exchange: ____' : 'exchange / place value', { size: 12, fill: muted }));
  return svgFrame(recipe, definition, content.join(''), options);
}

function renderExchange(recipe, definition, options) {
  const before = n(recipe.values.before, n(recipe.values.number, 1286));
  const after = n(recipe.values.after, before);
  const from = recipe.values.fromPlace ?? recipe.values.exchangeFrom ?? 'tens';
  const content = [svgText(166, 34, 'Before', { size: 15, weight: 700 }), svgText(474, 34, 'After exchange', { size: 15, weight: 700 })];
  ['Thousands', 'Hundreds', 'Tens', 'Ones'].forEach((label, index) => {
    const x1 = 60 + index * 72; const x2 = 368 + index * 72;
    content.push(`<rect x="${x1}" y="58" width="64" height="94" fill="${index % 2 ? pale : '#fff'}" stroke="${line}"/><rect x="${x2}" y="58" width="64" height="94" fill="${index % 2 ? pale : '#fff'}" stroke="${line}"/>${svgText(x1 + 32, 78, label[0], { size: 12, weight: 700 })}${svgText(x2 + 32, 78, label[0], { size: 12, weight: 700 })}`);
    const digitsBefore = String(Math.abs(Math.trunc(before))).padStart(4, '0'); const digitsAfter = String(Math.abs(Math.trunc(after))).padStart(4, '0');
    content.push(svgText(x1 + 32, 125, digitsBefore[index], { size: 25, weight: 700 }), svgText(x2 + 32, 125, hidden(recipe, 'after-value', options) ? '?' : digitsAfter[index], { size: 25, weight: 700 }));
  });
  content.push(`<path d="M284 112h70" stroke="#4f568f" stroke-width="3"/><path d="M354 112l-10-7v14z" fill="#4f568f"/>${svgText(320, 182, hidden(recipe, 'exchange', options) ? 'Show the exchange' : `exchange from ${from}`, { size: 14, fill: '#4f568f', weight: 700 })}`);
  return svgFrame(recipe, definition, content.join(''), options);
}

function renderBar(recipe, definition, options) {
  const v = recipe.values; const left = 90; const width = 460; const baseY = 82;
  const content = [svgText(WIDTH / 2, 28, definition.name, { size: 16, weight: 700 })];
  if (recipe.family === 'fraction-of-quantity-bar') {
    const whole = Math.max(0, n(v.whole, 0)); const denominator = Math.max(1, integer(v.denominator, 1)); const numerator = clamp(integer(v.numerator, 1), 0, denominator); const onePart = n(v.onePart, whole / denominator); const selected = onePart * numerator; const sectionWidth = width / denominator;
    for (let index = 0; index < denominator; index += 1) {
      const filled = index < numerator && !hidden(recipe, 'selected-total', options) && !hidden(recipe, 'selected', options);
      content.push(`<rect x="${left + index * sectionWidth}" y="82" width="${sectionWidth}" height="48" fill="${filled ? lavender : '#fff'}" stroke="${ink}" stroke-width="2"/>${svgText(left + index * sectionWidth + sectionWidth / 2, 112, hidden(recipe, 'one-part', options) ? '?' : fmt(onePart), { size: 14, weight: 700 })}`);
    }
    content.push(svgText(left - 12, 112, hidden(recipe, 'whole', options) ? '?' : fmt(whole), { anchor: 'end', size: 18, weight: 700 }));
    content.push(svgText(WIDTH / 2, 180, hidden(recipe, 'selected-total', options) ? `${numerator}/${denominator} of ${fmt(whole)} = ____` : `${numerator}/${denominator} of ${fmt(whole)} = ${fmt(selected)}`, { size: 16, weight: 700 }));
  } else if (recipe.family === 'fraction-calculation-bar') {
    const denominator = Math.max(1, integer(v.denominator, 1)); const first = clamp(integer(v.firstNumerator, 0), 0, denominator); const second = clamp(integer(v.secondNumerator, 0), 0, denominator); const subtraction = v.operation === '−'; const result = subtraction ? first - second : first + second; const sectionWidth = width / denominator;
    for (let row = 0; row < 2; row += 1) {
      const selected = row === 0 ? first : second; const y = 55 + row * 48;
      for (let index = 0; index < denominator; index += 1) content.push(`<rect x="${left + index * sectionWidth}" y="${y}" width="${sectionWidth}" height="33" fill="${index < selected ? (row ? green : lavender) : '#fff'}" stroke="${ink}"/>`);
      content.push(svgText(left - 12, y + 23, `${selected}/${denominator}`, { anchor: 'end', size: 15, weight: 700 }));
    }
    content.push(svgText(WIDTH / 2, 188, hidden(recipe, 'result', options) || hidden(recipe, 'result-numerator', options) ? `${first}/${denominator} ${v.operation ?? '+'} ${second}/${denominator} = ____/${denominator}` : `${first}/${denominator} ${v.operation ?? '+'} ${second}/${denominator} = ${result}/${denominator}`, { size: 16, weight: 700 }));
  } else if (recipe.family === 'change-bar') {
    const start = n(v.start, 0); const change = n(v.change, 0); const result = n(v.result, start + change);
    const total = Math.max(1, Math.abs(start), Math.abs(result), Math.abs(change));
    const startW = Math.max(40, width * Math.abs(start) / total); const changeW = Math.max(36, width * Math.abs(change) / total);
    content.push(`<rect x="${left}" y="${baseY}" width="${startW}" height="38" fill="${lavender}" stroke="${ink}"/><rect x="${left + startW}" y="${baseY}" width="${changeW}" height="38" fill="${change >= 0 ? green : peach}" stroke="${ink}"/>${svgText(left + startW / 2, baseY + 25, shown(recipe, 'start', start, options), { size: 17, weight: 700 })}${svgText(left + startW + changeW / 2, baseY + 25, shown(recipe, 'change', Math.abs(change), options), { size: 17, weight: 700 })}${svgText(left + (startW + changeW) / 2, baseY + 72, hidden(recipe, 'result', options) ? 'result: ?' : `result: ${fmt(result)}`, { size: 15, weight: 700 })}`);
  } else if (recipe.family === 'scaling-bar') {
    const original = n(v.original, 1); const multiplier = Math.max(1, n(v.multiplier, 1)); const scaled = n(v.scaled, original * multiplier);
    const sections = Math.min(12, Math.max(1, Math.round(multiplier))); const w = width / sections;
    content.push(`<rect x="${left}" y="68" width="${w}" height="31" fill="${lavender}" stroke="${ink}"/>${svgText(left - 8, 89, shown(recipe, 'original-value', original, options), { anchor: 'end', size: 14 })}`);
    for (let i = 0; i < sections; i += 1) content.push(`<rect x="${left + i * w}" y="132" width="${w}" height="31" fill="${i % 2 ? green : peach}" stroke="${ink}"/>`);
    content.push(svgText(left - 8, 154, hidden(recipe, 'scaled-value', options) ? '?' : fmt(scaled), { anchor: 'end', size: 14 }), svgText(left + width / 2, 194, hidden(recipe, 'multiplier', options) ? 'times as many: ?' : `${fmt(multiplier)} times as many`, { size: 14, weight: 700 }));
  } else if (recipe.family === 'multiplication-bar') {
    const groups = Math.min(16, Math.max(1, integer(v.groups, 1))); const groupSize = n(v.groupSize, 1); const w = width / groups;
    for (let i = 0; i < groups; i += 1) content.push(`<rect x="${left + i * w}" y="88" width="${w}" height="44" fill="${i % 2 ? lavender : green}" stroke="${ink}"/>${svgText(left + i * w + w / 2, 116, shown(recipe, 'group-size', groupSize, options), { size: 15, weight: 700 })}`);
    content.push(svgText(left + width / 2, 164, hidden(recipe, 'groups', options) ? '? equal groups' : `${groups} equal groups`, { size: 14 }), svgText(left + width / 2, 195, hidden(recipe, 'total', options) ? 'total: ?' : `total: ${fmt(n(v.total, groups * groupSize))}`, { size: 16, weight: 700 }));
  } else {
    const larger = Math.max(n(v.start, 0), n(v.result, 0), 1); const smaller = Math.max(0, n(v.change, 0));
    const upper = width; const lower = Math.max(20, width * smaller / larger);
    content.push(`<rect x="${left}" y="70" width="${upper}" height="34" fill="${lavender}" stroke="${ink}"/><rect x="${left}" y="138" width="${lower}" height="34" fill="${green}" stroke="${ink}"/>${svgText(left - 8, 93, 'whole', { anchor: 'end', size: 13 })}${svgText(left - 8, 161, 'part', { anchor: 'end', size: 13 })}`);
  }
  return svgFrame(recipe, definition, content.join(''), options);
}

function renderBalance(recipe, definition, options) {
  const leftValue = hidden(recipe, 'left-expression', options) ? '□' : recipe.values.left ?? '□ + 376';
  const rightValue = hidden(recipe, 'right-expression', options) ? '□' : recipe.values.right ?? '900';
  const equals = recipe.values.showEquals === false || hidden(recipe, 'comparison-symbol', options) ? '□' : '=';
  const content = `<line x1="110" y1="152" x2="530" y2="152" stroke="${ink}" stroke-width="5" stroke-linecap="round"/><path d="M320 72l-38 78h76z" fill="${lavender}" stroke="${ink}" stroke-width="2"/><line x1="320" y1="150" x2="320" y2="192" stroke="${ink}" stroke-width="4"/><line x1="244" y1="193" x2="396" y2="193" stroke="${ink}" stroke-width="4"/>${svgText(190, 120, leftValue, { size: 22, weight: 700 })}${svgText(320, 120, equals, { size: 25, weight: 700 })}${svgText(450, 120, rightValue, { size: 22, weight: 700 })}`;
  return svgFrame(recipe, definition, content, options);
}

function renderEquationStrip(recipe, definition, options) {
  const v = recipe.values;
  const value = (key, fallback) => hidden(recipe, key, options) ? '□' : escapeMarkup(v[key] ?? fallback);
  const content = `<rect x="65" y="74" width="510" height="86" rx="12" fill="${pale}" stroke="${ink}" stroke-width="2"/>${svgText(154, 127, value('left', '□'), { size: 28, weight: 700 })}${svgText(252, 127, v.operation ?? '+', { size: 28, weight: 700 })}${svgText(350, 127, value('right', '376'), { size: 28, weight: 700 })}${svgText(445, 127, '=', { size: 28, weight: 700 })}${svgText(525, 127, value('result', '900'), { size: 28, weight: 700 })}`;
  return svgFrame(recipe, definition, content, options);
}

function renderGrid(recipe, definition, options) {
  const v = recipe.values; const rows = Math.min(20, Math.max(1, integer(v.rows ?? v.height, 4))); const cols = Math.min(20, Math.max(1, integer(v.columns ?? v.width, 4)));
  const maxSize = 148; const cell = Math.min(maxSize / rows, maxSize / cols); const x0 = 320 - cols * cell / 2; const y0 = 48;
  const content = [svgText(WIDTH / 2, 27, definition.name, { size: 16, weight: 700 })];
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
    const fill = recipe.family === 'area-square-grid' ? (r + c) % 2 ? '#fbfafc' : pale : '#fff';
    content.push(`<rect x="${x0 + c * cell}" y="${y0 + r * cell}" width="${cell}" height="${cell}" fill="${fill}" stroke="${line}" stroke-width="1"/>`);
  }
  const showDimensions = v.showDimensions !== false && !hidden(recipe, 'rows', options) && !hidden(recipe, 'columns', options);
  if (showDimensions) content.push(svgText(x0 + cols * cell / 2, y0 - 10, cols, { size: 14, weight: 700 }), svgText(x0 - 14, y0 + rows * cell / 2, rows, { size: 14, weight: 700 }));
  if (recipe.family === 'area-square-grid' && v.showAreaLabel !== false) content.push(svgText(WIDTH / 2, 222, hidden(recipe, 'area', options) ? 'Area = ____ square units' : `Area = ${rows * cols} square units`, { size: 15, weight: 700 }));
  return svgFrame(recipe, definition, content.join(''), options);
}

function renderAreaGrid(recipe, definition, options) {
  const rowParts = Array.isArray(recipe.values.rowParts) ? recipe.values.rowParts.map((x) => Math.max(1, integer(x, 1))) : [20, 3];
  const colParts = Array.isArray(recipe.values.columnParts) ? recipe.values.columnParts.map((x) => Math.max(1, integer(x, 1))) : [4];
  const totalRows = rowParts.reduce((a, b) => a + b, 0); const totalCols = colParts.reduce((a, b) => a + b, 0);
  const x0 = 120; const y0 = 54; const width = 390; const height = 132; let y = y0;
  const content = [svgText(WIDTH / 2, 27, definition.name, { size: 16, weight: 700 })];
  rowParts.forEach((rp, rIndex) => { let x = x0; const h = height * rp / totalRows;
    colParts.forEach((cp, cIndex) => { const w = width * cp / totalCols; const product = rp * cp;
      content.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${(rIndex + cIndex) % 2 ? lavender : green}" stroke="${ink}"/>${svgText(x + w / 2, y + h / 2 + 5, hidden(recipe, 'partial-product', options) || recipe.values.showPartialProducts === false ? '' : product, { size: 15, weight: 700 })}`); x += w; });
    content.push(svgText(x0 - 14, y + h / 2 + 5, hidden(recipe, `row:${rIndex}`, options) ? '?' : rp, { size: 14, weight: 700 })); y += h; });
  let x = x0; colParts.forEach((cp, index) => { const w = width * cp / totalCols; content.push(svgText(x + w / 2, y0 - 12, hidden(recipe, `column:${index}`, options) ? '?' : cp, { size: 14, weight: 700 })); x += w; });
  return svgFrame(recipe, definition, content.join(''), options);
}

function factorPairs(value) {
  const nValue = Math.max(1, integer(value, 1)); const pairs = [];
  for (let factor = 1; factor * factor <= nValue; factor += 1) if (nValue % factor === 0) pairs.push([factor, nValue / factor]);
  return pairs;
}

function renderFactorPairs(recipe, definition, options) {
  const pairs = factorPairs(recipe.values.number); const hiddenIndex = integer(recipe.values.hiddenPairIndex, -1);
  const content = [svgText(WIDTH / 2, 28, `Factor pairs of ${fmt(recipe.values.number)}`, { size: 16, weight: 700 })];
  pairs.forEach(([a, b], index) => {
    const x = 82 + (index % 3) * 172; const y = 65 + Math.floor(index / 3) * 72;
    const hide = index === hiddenIndex || hidden(recipe, `factor-pair:${index}`, options);
    content.push(`<rect x="${x}" y="${y}" width="142" height="48" rx="8" fill="${index % 2 ? lavender : pale}" stroke="${line}"/>${svgText(x + 71, y + 31, hide ? '□ × □' : `${a} × ${b}`, { size: 18, weight: 700 })}`);
  });
  return svgFrame(recipe, definition, content.join(''), options);
}

function renderGroups(recipe, definition, options) {
  const v = recipe.values; const total = Math.max(0, integer(v.total, 0));
  const sharing = recipe.family === 'sharing-division'; const size = Math.max(1, integer(sharing ? Math.ceil(total / Math.max(1, integer(v.groups, 1))) : v.groupSize, 1));
  const groupCount = Math.min(12, Math.max(1, sharing ? integer(v.groups, 1) : Math.floor(total / size)));
  const remainder = total - (sharing ? Math.floor(total / groupCount) * groupCount : groupCount * size);
  const hideQuotient = sharing ? hidden(recipe, 'group-size', options) : hidden(recipe, 'group-count', options);
  const content = [svgText(WIDTH / 2, 27, definition.name, { size: 16, weight: 700 })];
  for (let g = 0; g < groupCount; g += 1) {
    const x = 54 + (g % 4) * 142; const y = 54 + Math.floor(g / 4) * 70; const dots = hideQuotient ? 0 : Math.min(16, Math.max(0, sharing ? Math.floor(total / groupCount) : size));
    content.push(`<rect x="${x}" y="${y}" width="116" height="50" rx="8" fill="${g % 2 ? pale : green}" stroke="${line}"/>`);
    for (let i = 0; i < dots; i += 1) content.push(`<circle cx="${x + 15 + (i % 8) * 13}" cy="${y + 18 + Math.floor(i / 8) * 17}" r="4" fill="${ink}"/>`);
    if (hideQuotient) content.push(svgText(x + 58, y + 31, '?', { size: 21, weight: 700 }));
  }
  if (remainder > 0 && v.showRemainder !== false) content.push(`<rect x="${492}" y="178" width="102" height="32" rx="7" fill="${peach}" stroke="${ink}"/><text x="543" y="200" text-anchor="middle" font-family="Arial" font-size="13" font-weight="700" fill="${ink}">${hidden(recipe, 'remainder', options) ? 'leftover ?' : `leftover ${remainder}`}</text>`);
  return svgFrame(recipe, definition, content.join(''), options);
}

function renderDivisionFrame(recipe, definition, options) {
  const dividend = Math.max(0, integer(recipe.values.dividend, 0)); const divisor = Math.max(1, integer(recipe.values.divisor, 1));
  const quotient = recipe.values.quotient == null ? null : Math.floor(dividend / divisor); const remainder = recipe.values.remainder == null ? dividend % divisor : integer(recipe.values.remainder, 0);
  const content = `<text x="124" y="128" font-family="Arial" font-size="28" font-weight="700" fill="${ink}">${divisor}</text><path d="M158 70v94h332" fill="none" stroke="${ink}" stroke-width="3"/><text x="190" y="128" font-family="Arial" font-size="30" font-weight="700" fill="${ink}">${dividend}</text><text x="340" y="56" text-anchor="middle" font-family="Arial" font-size="26" font-weight="700" fill="${ink}">${hidden(recipe, 'quotient', options) || quotient == null ? '?' : quotient}</text><text x="340" y="196" text-anchor="middle" font-family="Arial" font-size="14" fill="${muted}">${hidden(recipe, 'remainder', options) ? 'remainder: ?' : `remainder: ${remainder}`}</text>`;
  return svgFrame(recipe, definition, content, options);
}

function renderFractionWall(recipe, definition, options) {
  const denoms = (Array.isArray(recipe.values.denominators) ? recipe.values.denominators : [2, 3, 4, 5]).map((d) => clamp(integer(d, 1), 1, 16)).slice(0, 8);
  const x0 = 88; const width = 470; const rowH = Math.min(24, 148 / denoms.length); const highlight = String(recipe.values.highlight ?? '');
  const content = [svgText(WIDTH / 2, 27, definition.name, { size: 16, weight: 700 })];
  denoms.forEach((denom, row) => {
    const y = 50 + row * rowH; const selected = highlight.match(/^(\d+)\/(\d+)$/); const selectedCount = selected && Number(selected[2]) === denom ? Number(selected[1]) : 0;
    for (let i = 0; i < denom; i += 1) {
      const w = width / denom; const fill = i < selectedCount ? `url(#${modelId(recipe, options)}-hatch)` : '#fff';
      content.push(`<rect x="${x0 + i * w}" y="${y}" width="${w}" height="${rowH - 2}" fill="${fill}" stroke="${ink}" stroke-width="1"/>`);
    }
    if (recipe.values.showLabels !== false) content.push(svgText(x0 - 12, y + rowH * .68, `1/${denom}`, { anchor: 'end', size: 11 }));
  });
  return svgFrame(recipe, definition, content.join(''), options);
}

function circleSectorPath(cx, cy, radius, startAngle, endAngle) {
  const startX = cx + Math.cos(startAngle) * radius;
  const startY = cy + Math.sin(startAngle) * radius;
  const endX = cx + Math.cos(endAngle) * radius;
  const endY = cy + Math.sin(endAngle) * radius;
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M${cx} ${cy}L${startX} ${startY}A${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY}Z`;
}

function fractionPartHidden(recipe, row, part, options) {
  if (hidden(recipe, part, options) || hidden(recipe, `fraction:${row}:${part}`, options)) return true;
  // For a general "equivalent fraction" prompt, the first supplied strip is
  // the known reference and the next strip is the pupil completion.  The
  // engine can still use a precise fraction:N:numerator/denominator token for
  // any other arrangement.
  return recipe.family === 'equivalent-fraction-strips'
    && row > 0
    && part === 'numerator'
    && hidden(recipe, 'equivalent-fraction', options);
}

function renderFractionArea(recipe, definition, options) {
  const v = recipe.values;
  const fractions = Array.isArray(v.fractions) && v.fractions.length
    ? v.fractions
    : [{ numerator: n(v.numerator ?? v.firstNumerator, 0), denominator: n(v.denominator, 1) }];
  const visibleFractions = fractions.slice(0, 4);
  const useCircle = recipe.family === 'fraction-area-model' && v.shape === 'circle';
  const hatch = `url(#${modelId(recipe, options)}-hatch)`;
  const content = [svgText(WIDTH / 2, 28, definition.name, { size: 16, weight: 700 })];

  if (useCircle) {
    const rowH = visibleFractions.length === 1 ? 142 : Math.min(68, 144 / visibleFractions.length);
    visibleFractions.forEach((fraction, row) => {
      const denominator = Math.max(1, integer(fraction.denominator, 1));
      const numerator = clamp(integer(fraction.numerator, 0), 0, denominator);
      const numeratorHidden = fractionPartHidden(recipe, row, 'numerator', options);
      const denominatorHidden = fractionPartHidden(recipe, row, 'denominator', options);
      const cy = 52 + row * rowH + rowH / 2;
      const radius = Math.max(20, Math.min(52, rowH * 0.38));
      const cx = 330;
      if (denominator === 1) {
        content.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${numerator > 0 && !numeratorHidden ? hatch : '#fff'}" stroke="${ink}" stroke-width="1.5"/>`);
      } else {
        const step = (Math.PI * 2) / denominator;
        for (let i = 0; i < denominator; i += 1) {
          const fill = i < numerator && !numeratorHidden ? hatch : '#fff';
          content.push(`<path d="${circleSectorPath(cx, cy, radius, -Math.PI / 2 + i * step, -Math.PI / 2 + (i + 1) * step)}" fill="${fill}" stroke="${ink}" stroke-width="1.2"/>`);
        }
      }
      const label = `${numeratorHidden ? '□' : numerator}/${denominatorHidden ? '□' : denominator}`;
      if (v.showLabels !== false) content.push(svgText(cx - radius - 18, cy + 5, label, { anchor: 'end', size: 15, weight: 700 }));
    });
  } else {
    const width = 466;
    const x0 = 87;
    const rowH = Math.min(56, 132 / visibleFractions.length);
    visibleFractions.forEach((fraction, row) => {
      const denominator = Math.max(1, integer(fraction.denominator, 1));
      const numerator = clamp(integer(fraction.numerator, 0), 0, denominator);
      const y = 58 + row * rowH;
      const w = width / denominator;
      const numeratorHidden = fractionPartHidden(recipe, row, 'numerator', options);
      const denominatorHidden = fractionPartHidden(recipe, row, 'denominator', options);
      for (let i = 0; i < denominator; i += 1) {
        const fill = i < numerator && !numeratorHidden ? hatch : '#fff';
        content.push(`<rect x="${x0 + i * w}" y="${y}" width="${w}" height="${rowH - 9}" fill="${fill}" stroke="${ink}"/>`);
      }
      const label = `${numeratorHidden ? '□' : numerator}/${denominatorHidden ? '□' : denominator}`;
      if (v.showLabels !== false) content.push(svgText(x0 - 14, y + rowH * .45, label, { anchor: 'end', size: 14, weight: 700 }));
    });
  }
  return svgFrame(recipe, definition, content.join(''), options);
}

function renderFractionSet(recipe, definition, options) {
  const total = Math.min(80, Math.max(1, integer(recipe.values.total, 20))); const denom = Math.max(1, integer(recipe.values.denominator, 5)); const numerator = clamp(integer(recipe.values.numerator, 1), 0, denom);
  const perPart = Math.floor(total / denom); const selected = perPart * numerator; const content = [svgText(WIDTH / 2, 28, definition.name, { size: 16, weight: 700 })];
  for (let i = 0; i < total; i += 1) {
    const x = 92 + (i % 16) * 29; const y = 58 + Math.floor(i / 16) * 31; const fill = i < selected && !hidden(recipe, 'selected', options) ? lavender : '#fff';
    content.push(`<circle cx="${x}" cy="${y}" r="9" fill="${fill}" stroke="${ink}"/>`);
  }
  content.push(svgText(WIDTH / 2, 220, hidden(recipe, 'numerator', options) ? `□/${denom} of ${total}` : `${numerator}/${denom} of ${total}`, { size: 16, weight: 700 }));
  return svgFrame(recipe, definition, content.join(''), options);
}

function renderDecimalGrid(recipe, definition, options) {
  const selected = clamp(integer(recipe.values.hundredths, 0), 0, 100); const mode = recipe.values.mode ?? 'hundredths'; const cols = mode === 'tenths' ? 10 : 10; const rows = mode === 'tenths' ? 1 : 10; const total = cols * rows; const cell = Math.min(24, 180 / Math.max(cols, rows)); const x0 = 320 - cols * cell / 2; const y0 = 44;
  const content = [svgText(WIDTH / 2, 25, definition.name, { size: 16, weight: 700 })];
  for (let i = 0; i < total; i += 1) {
    const x = x0 + (i % cols) * cell; const y = y0 + Math.floor(i / cols) * cell; const fill = i < (mode === 'tenths' ? Math.round(selected / 10) : selected) && !hidden(recipe, 'selected-cells', options) ? `url(#${modelId(recipe, options)}-hatch)` : '#fff';
    content.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${fill}" stroke="${ink}" stroke-width="1"/>`);
  }
  if (recipe.values.showNotation) content.push(svgText(WIDTH / 2, 222, hidden(recipe, 'decimal', options) ? 'decimal: ?' : `${fmt(selected / 100)} = ${selected}/100`, { size: 15, weight: 700 }));
  return svgFrame(recipe, definition, content.join(''), options);
}

function formatPence(value) {
  const pence = Math.max(0, integer(value, 0));
  return `£${Math.floor(pence / 100)}.${String(pence % 100).padStart(2, '0')}`;
}

function renderMoney(recipe, definition, options) {
  const amount = Math.max(0, integer(recipe.values.amountPence, 0));
  const optionalPence = (value) => value == null || value === '' ? null : n(value, null);
  const price = optionalPence(recipe.values.pricePence);
  const tendered = optionalPence(recipe.values.tenderedPence);
  const hasChange = price != null && tendered != null;
  const content = [svgText(WIDTH / 2, 27, definition.name, { size: 16, weight: 700 })];

  if (hasChange) {
    const safePrice = Math.max(0, integer(price, 0));
    const safeTendered = Math.max(0, integer(tendered, 0));
    const change = safeTendered - safePrice;
    const changeHidden = hidden(recipe, 'change', options)
      || (options.outputView !== 'teacher' && recipe.scaffoldState !== 'modelled');
    const cards = [
      { heading: 'Price', value: hidden(recipe, 'price', options) ? '£____' : formatPence(safePrice), fill: peach },
      { heading: 'Paid', value: hidden(recipe, 'tendered', options) ? '£____' : formatPence(safeTendered), fill: lavender },
      { heading: 'Change', value: changeHidden ? '£____' : formatPence(change), fill: green },
    ];
    cards.forEach((card, index) => {
      const x = 58 + index * 194;
      content.push(`<rect x="${x}" y="75" width="170" height="87" rx="11" fill="${card.fill}" stroke="${ink}" stroke-width="2"/>`);
      content.push(svgText(x + 85, 105, card.heading, { size: 15, weight: 700 }));
      content.push(svgText(x + 85, 140, card.value, { size: 23, weight: 700 }));
      if (index < cards.length - 1) content.push(`<path d="M${x + 174} 119h12l-6-6m6 6-6 6" fill="none" stroke="#4f568f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`);
    });
    content.push(svgText(WIDTH / 2, 203, 'Work out the change in exact pounds and pence.', { size: 13, fill: muted, weight: 500 }));
    return svgFrame(recipe, definition, content.join(''), options);
  }

  const coins = [200, 100, 50, 20, 10, 5, 2, 1]; let rest = amount;
  coins.forEach((coin, index) => {
    const count = Math.min(4, Math.floor(rest / coin)); rest -= count * coin;
    for (let i = 0; i < count; i += 1) { const x = 100 + index * 55 + (i % 2) * 8; const y = 88 + Math.floor(i / 2) * 45; content.push(`<circle cx="${x}" cy="${y}" r="21" fill="${coin >= 100 ? lavender : peach}" stroke="${ink}" stroke-width="1.5"/>${svgText(x, y + 5, coin >= 100 ? `£${coin / 100}` : `${coin}p`, { size: 10, weight: 700 })}`); }
  });
  content.push(svgText(WIDTH / 2, 202, hidden(recipe, 'total', options) ? 'Total: £____' : `Total: ${formatPence(amount)}`, { size: 20, weight: 700 }));
  return svgFrame(recipe, definition, content.join(''), options);
}

function conversionFactor(from, to) {
  return { 'km:m': 1000, 'm:cm': 100, 'cm:mm': 10, 'kg:g': 1000, 'l:ml': 1000, 'h:min': 60, '£:p': 100 }[`${from}:${to}`] ?? 1;
}

function renderBridge(recipe, definition, options) {
  const v = recipe.values; const factor = conversionFactor(v.fromUnit, v.toUnit); const from = n(v.fromValue, 0); const to = from * factor;
  const content = `<rect x="68" y="82" width="180" height="66" rx="12" fill="${lavender}" stroke="${ink}" stroke-width="2"/>${svgText(158, 108, `${fmt(from)} ${v.fromUnit}`, { size: 21, weight: 700 })}<path d="M270 115h98" stroke="#4f568f" stroke-width="4"/><path d="M368 115l-14-9v18z" fill="#4f568f"/>${svgText(319, 92, `× ${factor}`, { size: 15, fill: '#4f568f', weight: 700 })}<rect x="392" y="82" width="180" height="66" rx="12" fill="${green}" stroke="${ink}" stroke-width="2"/>${svgText(482, 108, hidden(recipe, 'converted-value', options) ? `? ${v.toUnit}` : `${fmt(to)} ${v.toUnit}`, { size: 21, weight: 700 })}`;
  return svgFrame(recipe, definition, content, options);
}

function renderScale(recipe, definition, options) {
  const v = recipe.values; const start = n(v.start ?? v.startCm, 0); const end = n(v.end ?? v.endCm, 10); const divisions = Math.max(1, integer(v.divisions, Math.round((end - start) || 10))); const x0 = 66; const x1 = 580; const y = 122; const content = [svgText(WIDTH / 2, 28, definition.name, { size: 16, weight: 700 })];
  content.push(`<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${ink}" stroke-width="3"/>`);
  for (let i = 0; i <= divisions; i += 1) { const x = x0 + (x1 - x0) * i / divisions; const value = start + (end - start) * i / divisions; content.push(`<line x1="${x}" y1="${y - 14}" x2="${x}" y2="${y + 14}" stroke="${ink}" stroke-width="${i % Math.max(1, Math.floor(divisions / 5)) === 0 ? 2 : 1}"/>`); if (i % labelEvery(divisions) === 0) content.push(svgText(x, y + 34, hidden(recipe, `label:${i}`, options) ? '?' : fmt(value), { size: 12 })); }
  const pointer = n(v.pointer ?? v.segmentStart, null); if (pointer != null && pointer >= start && pointer <= end && !hidden(recipe, 'pointer-value', options)) { const x = x0 + (pointer - start) / (end - start) * (x1 - x0); content.push(`<path d="M${x} 56l-9 21h18z" fill="#4f568f"/>`); }
  const segmentEnd = n(v.segmentEnd, null); if (pointer != null && segmentEnd != null) { const xA = x0 + (pointer - start) / (end - start) * (x1 - x0); const xB = x0 + (segmentEnd - start) / (end - start) * (x1 - x0); content.push(`<line x1="${xA}" y1="76" x2="${xB}" y2="76" stroke="#856153" stroke-width="5" stroke-linecap="round"/>`); }
  return svgFrame(recipe, definition, content.join(''), options);
}

function renderClock(recipe, definition, options) {
  const hour = ((integer(recipe.values.hour, 0) % 24) + 24) % 24; const minute = ((integer(recipe.values.minute, 0) % 60) + 60) % 60; const cx = 250; const cy = 120; const r = 78;
  const content = [`<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="${ink}" stroke-width="3"/>`];
  for (let i = 0; i < 12; i += 1) { const angle = (i / 12) * Math.PI * 2 - Math.PI / 2; const x1 = cx + Math.cos(angle) * (r - 4); const y1 = cy + Math.sin(angle) * (r - 4); const x2 = cx + Math.cos(angle) * (r - 14); const y2 = cy + Math.sin(angle) * (r - 14); content.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${ink}" stroke-width="2"/>${svgText(cx + Math.cos(angle) * (r - 25), cy + Math.sin(angle) * (r - 25) + 5, i === 0 ? 12 : i, { size: 11, weight: 700 })}`); }
  if (recipe.values.showHands !== false && !hidden(recipe, 'hands', options)) { const minuteA = minute / 60 * Math.PI * 2 - Math.PI / 2; const hourA = ((hour % 12) + minute / 60) / 12 * Math.PI * 2 - Math.PI / 2; content.push(`<line x1="${cx}" y1="${cy}" x2="${cx + Math.cos(hourA) * 43}" y2="${cy + Math.sin(hourA) * 43}" stroke="${ink}" stroke-width="5" stroke-linecap="round"/><line x1="${cx}" y1="${cy}" x2="${cx + Math.cos(minuteA) * 63}" y2="${cy + Math.sin(minuteA) * 63}" stroke="#4f568f" stroke-width="3" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="5" fill="${ink}"/>`); }
  const digital = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  content.push(`<rect x="404" y="90" width="160" height="58" rx="9" fill="${pale}" stroke="${line}"/>${svgText(484, 127, recipe.values.showDigital && !hidden(recipe, 'digital-time', options) ? digital : '____', { size: 25, weight: 700 })}`);
  return svgFrame(recipe, definition, content.join(''), options);
}

function timeLabel(minutes) {
  const total = ((integer(minutes, 0) % 1440) + 1440) % 1440; return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function renderTimeline(recipe, definition, options) {
  const start = integer(recipe.values.startMinutes, 0); const end = integer(recipe.values.endMinutes, start + 60); const x0 = 82; const x1 = 558; const y = 125; const duration = Math.max(0, end - start);
  const content = [`<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${ink}" stroke-width="3"/><circle cx="${x0}" cy="${y}" r="6" fill="${lavender}" stroke="${ink}"/><circle cx="${x1}" cy="${y}" r="6" fill="${green}" stroke="${ink}"/>${svgText(x0, 92, hidden(recipe, 'start', options) ? '?' : timeLabel(start), { size: 18, weight: 700 })}${svgText(x1, 92, hidden(recipe, 'end', options) ? '?' : timeLabel(end), { size: 18, weight: 700 })}${svgText((x0 + x1) / 2, 172, hidden(recipe, 'duration', options) ? 'duration: ?' : `${duration} minutes`, { size: 16, weight: 700 })}`];
  if (recipe.values.showJumps) for (let i = 1; i < Math.min(5, Math.ceil(duration / 30)); i += 1) { const x = x0 + (x1 - x0) * i / Math.ceil(duration / 30); content.push(`<path d="M${x - 16} ${y - 18}q16 -22 32 0" fill="none" stroke="#4f568f" stroke-width="2"/>`); }
  return svgFrame(recipe, definition, content.join(''), options);
}

function renderPerimeter(recipe, definition, options) {
  const v = recipe.values;
  const width = Math.max(1, n(v.width, 8));
  const height = Math.max(1, n(v.height, 4));
  const unit = String(v.unit ?? 'cm');
  const sideHidden = hidden(recipe, 'side-length', options);
  const boundaryStroke = v.showBoundary === false ? ink : '#4f568f';
  const boundaryWidth = v.showBoundary === false ? 2 : 6;
  const content = [];

  if (v.kind === 'rectilinear') {
    const sides = Array.isArray(v.sides) ? v.sides.map((side) => Math.max(0.000001, n(side, 0))) : [];
    const [top, outerRight, inset, innerDown, bottom, outerLeft] = sides;
    const shapeWidth = top;
    const shapeHeight = outerLeft;
    const scale = Math.min(34, 260 / Math.max(shapeWidth, shapeHeight));
    const w = shapeWidth * scale;
    const h = shapeHeight * scale;
    const x = 320 - w / 2;
    const y = 120 - h / 2;
    const points = [
      [0, 0],
      [top, 0],
      [top, outerRight],
      [top - inset, outerRight],
      [top - inset, outerRight + innerDown],
      [0, outerLeft],
    ];
    const pointText = points.map(([pointX, pointY]) => `${x + pointX * scale},${y + pointY * scale}`).join(' ');
    const label = (index) => sideHidden ? '?' : `${fmt(sides[index])} ${unit}`;
    content.push(`<polygon points="${pointText}" fill="#fff" stroke="${boundaryStroke}" stroke-width="${boundaryWidth}" stroke-linejoin="round"/>`);
    content.push(svgText(x + w / 2, y - 12, label(0), { size: 12, weight: 700 }));
    content.push(svgText(x + w + 13, y + outerRight * scale / 2 + 4, label(1), { anchor: 'start', size: 12, weight: 700 }));
    content.push(svgText(x + (top - inset / 2) * scale, y + outerRight * scale - 9, label(2), { size: 12, weight: 700 }));
    content.push(svgText(x + (top - inset) * scale + 12, y + (outerRight + innerDown / 2) * scale + 4, label(3), { anchor: 'start', size: 12, weight: 700 }));
    content.push(svgText(x + (top - inset) * scale / 2, y + h + 20, label(4), { size: 12, weight: 700 }));
    content.push(svgText(x - 12, y + h / 2 + 4, label(5), { anchor: 'end', size: 12, weight: 700 }));
    const perimeter = sides.reduce((sum, side) => sum + side, 0);
    content.push(svgText(320, 220, hidden(recipe, 'perimeter', options) ? `Perimeter = ____ ${unit}` : `Perimeter = ${fmt(perimeter)} ${unit}`, { size: 16, weight: 700 }));
  } else {
    const scale = Math.min(38, 260 / Math.max(width, height));
    const w = width * scale;
    const h = height * scale;
    const x = 320 - w / 2;
    const y = 118 - h / 2;
    content.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="${boundaryStroke}" stroke-width="${boundaryWidth}"/>`);
    content.push(svgText(x + w / 2, y - 12, sideHidden ? '?' : `${fmt(width)} ${unit}`, { size: 14, weight: 700 }));
    content.push(svgText(x - 12, y + h / 2 + 5, sideHidden ? '?' : `${fmt(height)} ${unit}`, { anchor: 'end', size: 14, weight: 700 }));
    content.push(svgText(320, 214, hidden(recipe, 'perimeter', options) ? `Perimeter = ____ ${unit}` : `Perimeter = ${fmt(2 * (width + height))} ${unit}`, { size: 16, weight: 700 }));
  }
  return svgFrame(recipe, definition, content.join(''), options);
}

function renderAngle(recipe, definition, options) {
  const degrees = clamp(n(recipe.values.degrees, 90), 0, 360); const cx = 300; const cy = 172; const r = 110; const endA = -Math.PI / 2 + degrees * Math.PI / 180; const endX = cx + Math.cos(endA) * r; const endY = cy + Math.sin(endA) * r;
  const label = degrees < 90 ? 'acute' : degrees === 90 ? 'right angle' : degrees < 180 ? 'obtuse' : 'reflex';
  let content = `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - r}" stroke="${ink}" stroke-width="4"/><line x1="${cx}" y1="${cy}" x2="${endX}" y2="${endY}" stroke="${ink}" stroke-width="4"/><path d="M${cx} ${cy - 46}A46 46 0 ${degrees > 180 ? 1 : 0} 1 ${cx + Math.cos(endA) * 46} ${cy + Math.sin(endA) * 46}" fill="none" stroke="#4f568f" stroke-width="3"/>`;
  if (recipe.values.showRightReference) content += `<path d="M${cx} ${cy - 25}h25v25" fill="none" stroke="#856153" stroke-width="3"/>`;
  const classificationHidden = hidden(recipe, 'classification', options) || hidden(recipe, 'angle', options);
  const annotation = recipe.values.showLabel && !classificationHidden
    ? label
    : classificationHidden ? '?' : 'Compare with a right angle';
  content += svgText(480, 88, annotation, { size: annotation.length > 12 ? 13 : 18, weight: 700 });
  return svgFrame(recipe, definition, content, options);
}

function renderTurn(recipe, definition, options) {
  const degreesByTurn = { quarter: 90, half: 180, 'three-quarter': 270, full: 360 }; const degrees = degreesByTurn[recipe.values.turn] ?? 90; const clockwise = recipe.values.direction !== 'anticlockwise'; const startMap = { north: -90, east: 0, south: 90, west: 180 }; const start = startMap[recipe.values.start] ?? -90; const end = start + (clockwise ? degrees : -degrees); const cx = 320; const cy = 122; const arrow = (a, colour) => { const rad = a * Math.PI / 180; return `<line x1="${cx}" y1="${cy}" x2="${cx + Math.cos(rad) * 64}" y2="${cy + Math.sin(rad) * 64}" stroke="${colour}" stroke-width="5" stroke-linecap="round"/>`; };
  const turnLabel = hidden(recipe, 'turn', options) ? 'Turn: ?' : `${recipe.values.turn} turn ${clockwise ? 'clockwise' : 'anticlockwise'}`;
  const content = `${arrow(start, ink)}${hidden(recipe, 'end-direction', options) ? '' : arrow(end, '#4f568f')}<circle cx="${cx}" cy="${cy}" r="8" fill="${ink}"/><path d="M${cx - 84} ${cy - 28}A90 90 0 ${degrees > 180 ? 1 : 0} ${clockwise ? 1 : 0} ${cx + Math.cos(end * Math.PI / 180) * 84} ${cy + Math.sin(end * Math.PI / 180) * 84}" fill="none" stroke="#856153" stroke-width="3"/>${svgText(320, 216, turnLabel, { size: 17, weight: 700 })}`;
  return svgFrame(recipe, definition, content, options);
}

function shapeVertices(shape, orientation) {
  // The quadrilateral is a true parallelogram: opposite side vectors are
  // exact negatives.  This is essential before drawing parallel-side marks.
  const base = shape === 'triangle'
    ? [[0, -72], [72, 58], [-72, 58]]
    : shape === 'pentagon'
      ? [[0, -78], [74, -20], [45, 70], [-45, 70], [-74, -20]]
      : shape === 'hexagon'
        ? [[-60, -64], [60, -64], [88, 0], [60, 64], [-60, 64], [-88, 0]]
        : [[-78, -42], [62, -62], [82, 48], [-58, 68]];
  const angle = orientation === 'rotated' ? .45 : orientation === 'irregular' ? .2 : 0;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return base.map(([x, y]) => [320 + x * cosine - y * sine, 123 + x * sine + y * cosine]);
}

function polygonPoints(shape, orientation) {
  return shapeVertices(shape, orientation).map(([x, y]) => `${x},${y}`).join(' ');
}

function equalSideMark(start, end, offset = 0) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length; const uy = dy / length;
  const nx = -uy; const ny = ux;
  const cx = (start[0] + end[0]) / 2 + ux * offset;
  const cy = (start[1] + end[1]) / 2 + uy * offset;
  return `<path data-shape-mark="equal-side" d="M${cx - nx * 6} ${cy - ny * 6}L${cx + nx * 6} ${cy + ny * 6}" fill="none" stroke="#4f568f" stroke-width="3" stroke-linecap="round"/>`;
}

function parallelSideMark(start, end, count = 1) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length; const uy = dy / length;
  const nx = -uy; const ny = ux;
  return Array.from({ length: count }, (_, index) => {
    const shift = (index - (count - 1) / 2) * 10;
    const cx = (start[0] + end[0]) / 2 + ux * shift;
    const cy = (start[1] + end[1]) / 2 + uy * shift;
    const tailX = cx - ux * 5; const tailY = cy - uy * 5;
    const tipX = cx + ux * 5; const tipY = cy + uy * 5;
    return `<path data-shape-mark="parallel-side" d="M${tailX + nx * 4} ${tailY + ny * 4}L${tipX} ${tipY}L${tailX - nx * 4} ${tailY - ny * 4}" fill="none" stroke="#4f568f" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join('');
}

function shapePropertyMarks(shape, orientation) {
  const vertices = shapeVertices(shape, orientation);
  const edge = (index) => [vertices[index], vertices[(index + 1) % vertices.length]];
  if (shape === 'triangle') {
    const [firstStart, firstEnd] = edge(0);
    const [secondStart, secondEnd] = edge(2);
    return `${equalSideMark(firstStart, firstEnd)}${equalSideMark(secondStart, secondEnd)}`;
  }
  if (shape === 'quadrilateral') {
    const [topStart, topEnd] = edge(0);
    const [rightStart, rightEnd] = edge(1);
    const [bottomStart, bottomEnd] = edge(2);
    const [leftStart, leftEnd] = edge(3);
    return `${parallelSideMark(topStart, topEnd)}${parallelSideMark(bottomStart, bottomEnd)}${parallelSideMark(rightStart, rightEnd, 2)}${parallelSideMark(leftStart, leftEnd, 2)}`;
  }
  return '';
}

function renderShape(recipe, definition, options) {
  const v = recipe.values;
  const shape = ['triangle', 'quadrilateral', 'pentagon', 'hexagon'].includes(v.shape) ? v.shape : 'quadrilateral';
  const orientation = ['upright', 'rotated', 'irregular'].includes(v.orientation) ? v.orientation : 'upright';
  const content = `<polygon points="${polygonPoints(shape, orientation)}" fill="${pale}" stroke="${ink}" stroke-width="3"/>${v.showMarks !== false ? shapePropertyMarks(shape, orientation) : ''}${svgText(320, 215, hidden(recipe, 'shape-name', options) ? 'Name the shape' : shape, { size: 16, weight: 700 })}`;
  return svgFrame(recipe, definition, content, options);
}

function renderShapeSort(recipe, definition, options) {
  const venn = recipe.values.kind !== 'carroll'; const left = escapeMarkup(recipe.values.leftHeading ?? 'Has right angles'); const right = escapeMarkup(recipe.values.rightHeading ?? 'Has parallel sides');
  const content = venn ? `<circle cx="245" cy="126" r="77" fill="${lavender}" fill-opacity=".55" stroke="${ink}" stroke-width="2"/><circle cx="395" cy="126" r="77" fill="${green}" fill-opacity=".55" stroke="${ink}" stroke-width="2"/>${svgText(205, 43, left, { size: 13, weight: 700 })}${svgText(435, 43, right, { size: 13, weight: 700 })}<text x="320" y="132" text-anchor="middle" font-family="Arial" font-size="22" fill="${muted}">?</text>` : `<rect x="112" y="54" width="416" height="136" fill="#fff" stroke="${ink}" stroke-width="2"/><line x1="320" y1="54" x2="320" y2="190" stroke="${ink}"/><line x1="112" y1="102" x2="528" y2="102" stroke="${ink}"/>${svgText(216, 85, left, { size: 13, weight: 700 })}${svgText(424, 85, right, { size: 13, weight: 700 })}`;
  return svgFrame(recipe, definition, content, options);
}

function renderSymmetry(recipe, definition, options) {
  const size = clamp(integer(recipe.values.size, 8), 4, 16); const cell = Math.min(20, 160 / size); const x0 = 320 - size * cell / 2; const y0 = 36; const axis = recipe.values.axis ?? 'vertical'; const content = [];
  for (let r = 0; r < size; r += 1) for (let c = 0; c < size; c += 1) content.push(`<rect x="${x0+c*cell}" y="${y0+r*cell}" width="${cell}" height="${cell}" fill="#fff" stroke="#c8c5d0"/>`);
  const mid = size / 2; if (axis === 'horizontal') content.push(`<line x1="${x0}" y1="${y0+mid*cell}" x2="${x0+size*cell}" y2="${y0+mid*cell}" stroke="#4f568f" stroke-width="3" stroke-dasharray="6 4"/>`); else if (axis === 'diagonal') content.push(`<line x1="${x0}" y1="${y0+size*cell}" x2="${x0+size*cell}" y2="${y0}" stroke="#4f568f" stroke-width="3" stroke-dasharray="6 4"/>`); else content.push(`<line x1="${x0+mid*cell}" y1="${y0}" x2="${x0+mid*cell}" y2="${y0+size*cell}" stroke="#4f568f" stroke-width="3" stroke-dasharray="6 4"/>`);
  if (recipe.values.showHalf) { const cells = [[1,1],[2,1],[2,2],[3,2]]; cells.forEach(([c,r]) => content.push(`<rect x="${x0+c*cell+2}" y="${y0+r*cell+2}" width="${cell-4}" height="${cell-4}" fill="${lavender}"/>`)); }
  return svgFrame(recipe, definition, content.join(''), options);
}

function renderCoordinates(recipe, definition, options) {
  const max = clamp(integer(recipe.values.max, 10), 4, 20); const size = 174; const cell = size / max; const x0 = 180; const y0 = 198; const content = [`<line x1="${x0}" y1="${y0}" x2="${x0+size+12}" y2="${y0}" stroke="${ink}" stroke-width="2"/><line x1="${x0}" y1="${y0}" x2="${x0}" y2="${y0-size-12}" stroke="${ink}" stroke-width="2"/>`];
  for (let i = 0; i <= max; i += 1) { const x=x0+i*cell; const y=y0-i*cell; content.push(`<line x1="${x}" y1="${y0}" x2="${x}" y2="${y0-size}" stroke="#d8d5df"/><line x1="${x0}" y1="${y}" x2="${x0+size}" y2="${y}" stroke="#d8d5df"/>`); if (i>0) { content.push(svgText(x,y0+18,i,{size:10}),svgText(x0-13,y+4,i,{size:10})); } }
  (Array.isArray(recipe.values.points) ? recipe.values.points : []).forEach((p,index)=>{const x=x0+clamp(n(p.x,0),0,max)*cell;const y=y0-clamp(n(p.y,0),0,max)*cell; if(!hidden(recipe,`point:${index}`,options)){content.push(`<circle cx="${x}" cy="${y}" r="5" fill="#4f568f"/>${recipe.values.showLabels?svgText(x+9,y-8,p.label,{anchor:'start',size:12,weight:700}):''}`);}});
  content.push(svgText(x0+size+20,y0+5,'x',{size:14,weight:700}),svgText(x0-3,y0-size-20,'y',{size:14,weight:700}));
  return svgFrame(recipe, definition, content.join(''), options);
}

function tally(value) { const number = Math.max(0, integer(value, 0)); let out=''; for(let i=0;i<number;i+=1){out += i%5===4 ? '╱ ' : '| ';} return out.trim(); }

function renderTable(recipe, definition, options) {
  const v=recipe.values; const headers=Array.isArray(v.headers)?v.headers:['Category','Tally','Frequency']; const rows=Array.isArray(v.rows)?v.rows:Array.from({length:Math.max(1,integer(v.rows,4))},(_,i)=>({label:`Row ${i+1}`,value:''})); const x=70; const width=500; const colW=width/headers.length; const rowH=Math.min(29,150/(rows.length+1)); const content=[];
  headers.forEach((head,index)=>content.push(`<rect x="${x+index*colW}" y="48" width="${colW}" height="${rowH}" fill="${lavender}" stroke="${ink}"/>${svgText(x+index*colW+colW/2,48+rowH*.66,head,{size:13,weight:700})}`));
  rows.slice(0,8).forEach((row,r)=>headers.forEach((head,c)=>{let value=c===0?row.label:c===1&&recipe.family==='tally-frequency-table'?tally(row.value):row.value; if(hidden(recipe,`${c===0?'category':c===1?'tally':'frequency'}:${r}`,options))value='';const y=48+(r+1)*rowH;content.push(`<rect x="${x+c*colW}" y="${y}" width="${colW}" height="${rowH}" fill="#fff" stroke="${line}"/>${svgText(x+c*colW+colW/2,y+rowH*.66,value,{size:13})}`)}));
  return svgFrame(recipe,definition,content.join(''),options);
}

function chartAxes(x,y,width,height,maxValue,steps=5){let out=`<line x1="${x}" y1="${y}" x2="${x+width}" y2="${y}" stroke="${ink}" stroke-width="2"/><line x1="${x}" y1="${y}" x2="${x}" y2="${y-height}" stroke="${ink}" stroke-width="2"/>`;for(let i=0;i<=steps;i+=1){const py=y-height*i/steps;out+=`<line x1="${x}" y1="${py}" x2="${x+width}" y2="${py}" stroke="#e0dde6"/>${svgText(x-9,py+4,fmt(maxValue*i/steps),{anchor:'end',size:10})}`;}return out;}

function renderBarChart(recipe, definition, options) {
  const rows=(recipe.values.rows??[]).slice(0,8); const max=Math.max(1,n(recipe.values.max,Math.max(...rows.map(r=>n(r.value,0)),1))); const x=86,y=194,w=468,h=128;
  let content = '';
  if (recipe.values.orientation === 'horizontal') {
    const rowHeight = h / Math.max(1, rows.length);
    content = `<line x1="${x}" y1="${y}" x2="${x+w}" y2="${y}" stroke="${ink}" stroke-width="2"/><line x1="${x}" y1="${y}" x2="${x}" y2="${y-h}" stroke="${ink}" stroke-width="2"/>`;
    rows.forEach((row,index)=>{const value=clamp(n(row.value,0),0,max);const bw=w*value/max;const by=y-h+(index+.16)*rowHeight;content+=`<rect x="${x}" y="${by}" width="${hidden(recipe,`bar:${index}`,options)?0:bw}" height="${rowHeight*.64}" fill="${index%2?lavender:green}" stroke="${ink}"/><text x="${x-10}" y="${by+rowHeight*.44}" text-anchor="end" font-family="Arial" font-size="11" fill="${ink}">${escapeMarkup(row.label)}</text>`;});
  } else {
    content=chartAxes(x,y,w,h,max); const barW=w/Math.max(1,rows.length)*.62;
    rows.forEach((row,index)=>{const value=clamp(n(row.value,0),0,max);const bh=h*value/max;const bx=x+(index+.5)*w/rows.length-barW/2;content+=`<rect x="${bx}" y="${y-bh}" width="${barW}" height="${hidden(recipe,`bar:${index}`,options)?0:bh}" fill="${index%2?lavender:green}" stroke="${ink}"/><text x="${bx+barW/2}" y="${y+18}" text-anchor="middle" font-family="Arial" font-size="11" fill="${ink}">${escapeMarkup(row.label)}</text>`;});
  }
  return svgFrame(recipe,definition,content,options);
}

function renderPictogram(recipe, definition, options) {
  const rows=(recipe.values.rows??[]).slice(0,6);const key=Math.max(1,integer(recipe.values.key,1));const symbol=escapeMarkup(recipe.values.symbol??'●');let content=svgText(96,32,`${symbol} = ${key}`,{anchor:'start',size:15,weight:700});
  rows.forEach((row,index)=>{const y=66+index*28;const quantity=Math.max(0,n(row.value,0));const count=Math.floor(quantity/key);const remainder=quantity-(count*key);content+=svgText(102,y,row.label,{anchor:'start',size:13,weight:700});for(let i=0;i<Math.min(20,count);i+=1)content+=svgText(240+i*17,y,hidden(recipe,`symbol:${index}:${i}`,options)?'□':symbol,{size:16});if(remainder&& !hidden(recipe,`symbol:${index}:${count}`,options)){const partial = Math.abs(remainder/key-.5)<1e-9 ? '◐' : '?';content+=svgText(240+count*17,y,partial,{size:16});}});
  return svgFrame(recipe,definition,content,options);
}

function renderLineGraph(recipe, definition, options) {
  const rows=(recipe.values.rows??[]).slice(0,10);const max=Math.max(1,n(recipe.values.yMax,Math.max(...rows.map(r=>n(r.value,0)),1)));const x=86,y=194,w=468,h=128;let content=chartAxes(x,y,w,h,max);const pts=rows.map((row,index)=>[x+(rows.length===1?w/2:index*w/(rows.length-1)),y-h*clamp(n(row.value,0),0,max)/max]);if(recipe.values.showPoints!==false&&!hidden(recipe,'point',options)&&pts.length){content+=`<polyline points="${pts.map(p=>p.join(',')).join(' ')}" fill="none" stroke="#4f568f" stroke-width="3"/>`;pts.forEach(([px,py],i)=>content+=`<circle cx="${px}" cy="${py}" r="4" fill="#4f568f"/>${svgText(px,y+18,rows[i].label,{size:10})}`);}return svgFrame(recipe,definition,content,options);
}

function renderWorkspace(recipe, definition, options) {
  const v=recipe.values;let content='';
  if(recipe.family==='squared-working-area'){const cols=clamp(integer(v.columns,16),4,24);const rows=clamp(integer(v.rows,8),3,16);const cell=Math.min(20,420/cols,150/rows);const x=320-cols*cell/2,y=42;for(let r=0;r<rows;r+=1)for(let c=0;c<cols;c+=1)content+=`<rect x="${x+c*cell}" y="${y+r*cell}" width="${cell}" height="${cell}" fill="#fff" stroke="#d5d2db"/>`;}
  else if(recipe.family==='lined-explanation-area'){const lines=clamp(integer(v.lines,5),2,10);for(let i=0;i<lines;i+=1)content+=`<line x1="84" y1="${58+i*25}" x2="556" y2="${58+i*25}" stroke="#c9c6d0"/>`;}
  else if(recipe.family==='two-method-comparison'){content=`<rect x="58" y="50" width="244" height="138" fill="#fff" stroke="${line}"/><rect x="338" y="50" width="244" height="138" fill="#fff" stroke="${line}"/>${svgText(180,40,v.leftLabel??'Method one',{size:14,weight:700})}${svgText(460,40,v.rightLabel??'Method two',{size:14,weight:700})}`;}
  else if(recipe.family==='prove-it-space'){content=`<rect x="65" y="43" width="510" height="150" fill="#fff" stroke="${line}"/><line x1="65" y1="83" x2="575" y2="83" stroke="${line}"/><line x1="65" y1="135" x2="575" y2="135" stroke="${line}"/>${svgText(82,69,v.claimLabel??'Claim',{anchor:'start',size:13,weight:700})}${svgText(82,115,'Evidence',{anchor:'start',size:13,weight:700})}${svgText(82,169,'Conclusion',{anchor:'start',size:13,weight:700})}`;}
  else {const label=v.label??(recipe.family==='blank-diagram-box'?'Draw a diagram':recipe.family==='show-method-space'?'Show your method':'Working');content=`<rect x="74" y="48" width="492" height="142" rx="7" fill="#fff" stroke="${line}" stroke-width="2"/>${svgText(91,72,label,{anchor:'start',size:14,weight:700,fill:muted})}`;}
  return svgFrame(recipe,definition,content,options);
}

export const BUILD2_RENDERERS = Object.freeze({
  'place-value': renderPlaceValue,
  'arrow-cards': renderArrowCards,
  tree: renderTree,
  'number-line': renderNumberLine,
  roman: renderRoman,
  column: renderColumn,
  exchange: renderExchange,
  bar: renderBar,
  balance: renderBalance,
  'equation-strip': renderEquationStrip,
  grid: renderGrid,
  'area-grid': renderAreaGrid,
  'factor-pairs': renderFactorPairs,
  groups: renderGroups,
  'division-frame': renderDivisionFrame,
  'fraction-wall': renderFractionWall,
  'fraction-area': renderFractionArea,
  'fraction-set': renderFractionSet,
  'fraction-line': renderNumberLine,
  'decimal-grid': renderDecimalGrid,
  money: renderMoney,
  bridge: renderBridge,
  scale: renderScale,
  clock: renderClock,
  timeline: renderTimeline,
  perimeter: renderPerimeter,
  angle: renderAngle,
  turn: renderTurn,
  shape: renderShape,
  'shape-sort': renderShapeSort,
  symmetry: renderSymmetry,
  coordinates: renderCoordinates,
  table: renderTable,
  'bar-chart': renderBarChart,
  pictogram: renderPictogram,
  'line-graph': renderLineGraph,
  workspace: renderWorkspace,
});

export function renderBuild2Model(input, options = {}) {
  const validation = validateBuild2ModelRecipe(input, options);
  if (!validation.valid) return safetyMessage(input?.family, validation.errors);
  const recipe = validation.normalizedRecipe;
  const definition = getBuild2ModelDefinition(recipe.family);
  const renderer = BUILD2_RENDERERS[definition.renderer];
  if (!renderer) return safetyMessage(recipe.family, [`No renderer is registered for ${definition.name}.`]);
  return renderer(recipe, definition, options);
}

export function renderBuild2ModelPreview(input, options = {}) {
  return renderBuild2Model({ ...input, size: 'compact' }, options);
}

export {
  escapeMarkup,
  renderNumberLine,
  renderBar,
  renderGrid,
  renderClock,
  renderTable,
  renderWorkspace,
};
