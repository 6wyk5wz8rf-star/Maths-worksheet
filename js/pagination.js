import { getBuild2ModelDefinition } from './build2-model-bank.js';

/**
 * Deterministic A4 portrait pagination for Maths Page Studio.
 *
 * All placement is calculated in millimetres. The renderer should use the
 * returned coordinates with CSS `mm` units, which keeps screen preview and
 * browser print geometry on the same coordinate system.
 */

export const MM_PER_INCH = 25.4;
export const CSS_DPI = 96;
export const PX_PER_MM = CSS_DPI / MM_PER_INCH;

export const A4_PORTRAIT = Object.freeze({
  name: 'A4',
  orientation: 'portrait',
  widthMm: 210,
  heightMm: 297,
  widthPx: 210 * PX_PER_MM,
  heightPx: 297 * PX_PER_MM,
});

export const A4_LANDSCAPE = Object.freeze({
  name: 'A4',
  orientation: 'landscape',
  widthMm: 297,
  heightMm: 210,
  widthPx: 297 * PX_PER_MM,
  heightPx: 210 * PX_PER_MM,
});

export const PAGINATION_DEFAULTS = Object.freeze({
  marginMm: 12,
  gutterMm: 7,
  blockGapMm: 4,
  footerHeightMm: 7,
  continuationHeaderHeightMm: 0,
  minimumRemainingMm: 0.25,
  overcrowdingThreshold: 0.97,
});

const SIZE_SCALE = Object.freeze({ compact: 0.82, standard: 1, large: 1.45, 'extra-large': 1.72 });
const DENSITY_SCALE = Object.freeze({ compact: 0.82, standard: 1, spacious: 1.2 });

// These values mirror the physical CSS box model used by the printed sheet.
// Keep them explicit: pagination is only trustworthy when it measures the
// same indents, margins and typography that the browser ultimately prints.
const PRINT_LAYOUT_MM = Object.freeze({
  modelIndent: 9,
  modelMarginTop: 3,
  modelMarginBottom: 1,
  modelAboveMarginBottom: 3,
  besideGap: 5,
  besideModelMinimum: 40,
  responseIndent: 9,
  responseMarginTop: 2.5,
  supportIndent: 9,
  supportMarginTop: 2.2,
  supportPaddingVertical: 3.6,
  supportPaddingHorizontal: 4.4,
  supportBorder: 0.8,
  supportItemGap: 1,
  teacherIndent: 9,
  teacherMarginTop: 2,
  teacherPaddingVertical: 4,
  teacherPaddingHorizontal: 5,
  teacherBorder: 1.2,
  answerBorder: 0.16,
});

const QUESTION_FONT_PT = Object.freeze({
  small: 10.2,
  standard: 11.2,
  large: 12,
  compactDensity: 10.4,
  spaciousDensity: 11.7,
});

// Labelled horizontal representations need substantially more physical width
// than a generic diagram. At the former half-column width their SVG labels
// could fall to roughly four-point type while still passing the old 62 mm
// family default.
const WIDE_MODEL_FAMILIES = new Set([
  'place-value-chart', 'place-value',
  'base-ten', 'dienes', 'base-ten-dienes',
  'partition', 'partitioning-frame', 'partitioning',
  'number-line', 'marked-number-line', 'empty-number-line',
  'part-whole-bar', 'part-whole-bar-model', 'comparison-bar', 'comparison-bar-model',
  'fraction-strip', 'fraction-bar',
  'four-digit-number-line', 'ordering-comparison-line', 'rounding-number-line',
  'negative-number-line', 'empty-calculation-line', 'repeated-addition-line',
  'division-number-line', 'fraction-number-line', 'decimal-number-line',
  'duration-timeline', 'ruler-length-line', 'fraction-wall',
  'equivalent-fraction-strips', 'fraction-of-quantity-bar', 'fraction-calculation-bar',
  'bar-chart', 'line-graph', 'tally-frequency-table', 'editable-table',
]);

// These labelled manipulatives become unreadably small when a saved "beside"
// choice gives their SVG only the secondary grid track. Their physical print
// contract is always a beneath/full-width slot, while the teacher's stored
// recipe remains unchanged.
const LABELLED_FULL_WIDTH_FAMILIES = new Set([
  'place-value-chart', 'place-value',
  'base-ten', 'dienes', 'base-ten-dienes',
  'partition', 'partitioning-frame', 'partitioning',
]);

// Build 2 uses a 640-unit-wide SVG. In a workbook half-column (roughly
// 80 mm after trim padding and the model indent), its common 10–22 px labels
// print at only about 3.5–7.8 pt. These four representations either contain
// no text or use 28 px equation glyphs that remain at least 9 pt at that
// width; every other Build 2 family needs a full workbook row.
const WORKBOOK_HALF_WIDTH_SAFE_BUILD2_FAMILIES = new Set([
  'missing-number-strip',
  'symmetry-grid',
  'squared-working-area',
  'lined-explanation-area',
]);

const WIDE_MODEL_MIN_WIDTH_MM = Object.freeze({
  compact: 120,
  standard: 160,
  large: 172,
  // 177 mm is the complete beneath-model slot on portrait A4 with the
  // standard safe margins. A larger minimum made "Extra large" impossible to
  // satisfy on the very page format it is intended for.
  'extra-large': 177,
});

// Heights are deliberately conservative: they include labels and safe SVG air.
export const MODEL_PRINT_METRICS = Object.freeze({
  'place-value-chart': { height: 27, minWidth: 76, minHeight: 18 },
  'place-value': { height: 27, minWidth: 76, minHeight: 18 },
  'base-ten': { height: 37, minWidth: 66, minHeight: 24 },
  dienes: { height: 37, minWidth: 66, minHeight: 24 },
  'base-ten-dienes': { height: 37, minWidth: 66, minHeight: 24 },
  'partitioning-frame': { height: 27, minWidth: 58, minHeight: 18 },
  partitioning: { height: 27, minWidth: 58, minHeight: 18 },
  'number-line': { height: 23, minWidth: 64, minHeight: 15 },
  'marked-number-line': { height: 23, minWidth: 64, minHeight: 15 },
  'empty-number-line': { height: 23, minWidth: 64, minHeight: 15 },
  'part-whole-bar': { height: 27, minWidth: 58, minHeight: 18 },
  'part-whole-bar-model': { height: 27, minWidth: 58, minHeight: 18 },
  'comparison-bar': { height: 33, minWidth: 62, minHeight: 22 },
  'comparison-bar-model': { height: 33, minWidth: 62, minHeight: 22 },
  'equal-groups': { height: 35, minWidth: 54, minHeight: 24 },
  array: { height: 35, minWidth: 54, minHeight: 24 },
  'equal-groups-array': { height: 35, minWidth: 54, minHeight: 24 },
  'column-arithmetic': { height: 40, minWidth: 45, minHeight: 27 },
  'column-addition': { height: 40, minWidth: 45, minHeight: 27 },
  'column-subtraction': { height: 40, minWidth: 45, minHeight: 27 },
  'multiplication-grid': { height: 36, minWidth: 58, minHeight: 24 },
  'area-model': { height: 36, minWidth: 58, minHeight: 24 },
  'fraction-strip': { height: 29, minWidth: 58, minHeight: 19 },
  'fraction-bar': { height: 29, minWidth: 58, minHeight: 19 },
  default: { height: 32, minWidth: 58, minHeight: 20 },
});

export const RESPONSE_HEIGHT_MM = Object.freeze({
  none: { compact: 0, standard: 0, generous: 0 },
  'short-answer': { compact: 6, standard: 8, generous: 11 },
  'short-line': { compact: 6, standard: 8, generous: 11 },
  'answer-box': { compact: 8, standard: 11, generous: 15 },
  'writing-lines': { compact: 15, standard: 25, generous: 38 },
  'lined-explanation': { compact: 18, standard: 29, generous: 43 },
  'squared-grid': { compact: 23, standard: 35, generous: 51 },
  'squared-working': { compact: 23, standard: 36, generous: 54 },
  'calculation-area': { compact: 22, standard: 34, generous: 51 },
  'open-box': { compact: 24, standard: 38, generous: 58 },
  'unlined-thinking': { compact: 22, standard: 36, generous: 54 },
  'model-completion': { compact: 19, standard: 29, generous: 43 },
  'two-methods': { compact: 30, standard: 43, generous: 62 },
  'prove-it': { compact: 25, standard: 39, generous: 58 },
  'table-completion': { compact: 22, standard: 32, generous: 46 },
  'diagram-construction': { compact: 30, standard: 44, generous: 66 },
  'labelled-steps': { compact: 27, standard: 38, generous: 56 },
  'rough-working': { compact: 19, standard: 29, generous: 42 },
});

function finiteNumber(value, fallback) {
  // Optional recipe values use null to mean “use the model default”.  Coercing
  // null with Number() would turn that into zero and collapse every model to
  // the minimum 8 mm print box.
  if (value === null || value === undefined || value === '') return fallback;
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function ptToMm(value) {
  return Number(value) * (MM_PER_INCH / 72);
}

function effectiveQuestionFontPt(options = {}) {
  if (options.bodyScale === 'small') return QUESTION_FONT_PT.small;
  if (options.bodyScale === 'large') return QUESTION_FONT_PT.large;
  if (options.density === 'compact') return QUESTION_FONT_PT.compactDensity;
  if (options.density === 'spacious') return QUESTION_FONT_PT.spaciousDensity;
  return QUESTION_FONT_PT.standard;
}

function blockPaddingMm(density, footprint) {
  const densityPaddingMm = density === 'compact' ? 3 : density === 'spacious' ? 5 : 4;
  if (footprint === 'compact') return Math.max(2, densityPaddingMm - 2);
  if (footprint === 'spacious') return densityPaddingMm + 4;
  return densityPaddingMm;
}

function blockBorderMm(options = {}, kind = 'question') {
  const workbook = Boolean(options.workbookMode);
  const bottomPt = options.lineWeight === 'strong' ? 0.8 : options.lineWeight === 'standard' ? 0.55 : 0.35;
  const sideMm = workbook ? ptToMm(0.55) : 0;
  // Banded headings explicitly remove their border in the print stylesheet.
  const bottomMm = kind === 'heading' && options.sectionStyle === 'band' ? 0 : ptToMm(bottomPt);
  return {
    horizontalMm: sideMm * 2,
    verticalMm: (workbook ? sideMm : 0) + bottomMm,
  };
}

function normaliseFamily(family) {
  return String(family || 'default')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function modelMetrics(family) {
  return MODEL_PRINT_METRICS[normaliseFamily(family)] ?? MODEL_PRINT_METRICS.default;
}

function isWideModel(model) {
  return Boolean(model && WIDE_MODEL_FAMILIES.has(normaliseFamily(model.family)));
}

function usesLabelledFullWidthSlot(model) {
  return Boolean(model && LABELLED_FULL_WIDTH_FAMILIES.has(normaliseFamily(model.family)));
}

function isBuild2Model(model) {
  return Boolean(model && getBuild2ModelDefinition(model.family));
}

function build2NeedsFullWorkbookRow(model) {
  const definition = model && getBuild2ModelDefinition(model.family);
  return Boolean(definition && !WORKBOOK_HALF_WIDTH_SAFE_BUILD2_FAMILIES.has(definition.id));
}

function modelRequiresFullWidth(model, worksheet = null) {
  if (!model) return false;
  if (model.metadata?.requiresFullWidth === true) return true;
  if (model.size === 'large' || model.size === 'extra-large') return true;
  // A labelled horizontal model is not a safe half-column object.  This is a
  // print-legibility rule, not a workbook-only preference: at the old 84 mm
  // slot, number-line labels could fall below five-point type.
  if (isWideModel(model)) return true;
  if (worksheet?.settings?.workbookMode && build2NeedsFullWorkbookRow(model)) return true;
  return Boolean(worksheet?.settings?.workbookMode && model.metadata?.workbookFullWidth);
}

export function mmToPx(mm) {
  return Number(mm) * PX_PER_MM;
}

export function pxToMm(px) {
  return Number(px) / PX_PER_MM;
}

function normaliseMargins(value) {
  if (typeof value === 'number' || typeof value === 'string') {
    const margin = clamp(finiteNumber(value, PAGINATION_DEFAULTS.marginMm), 8, 25);
    return { top: margin, right: margin, bottom: margin, left: margin };
  }
  const source = value && typeof value === 'object' ? value : {};
  return {
    top: clamp(finiteNumber(source.top, PAGINATION_DEFAULTS.marginMm), 8, 25),
    right: clamp(finiteNumber(source.right, PAGINATION_DEFAULTS.marginMm), 8, 25),
    bottom: clamp(finiteNumber(source.bottom, PAGINATION_DEFAULTS.marginMm), 8, 25),
    left: clamp(finiteNumber(source.left, PAGINATION_DEFAULTS.marginMm), 8, 25),
  };
}

/** Resolve fixed A4 geometry. Both orientations use the same millimetre layout engine. */
export function getPageGeometry(worksheetOrSettings = {}, options = {}) {
  const settings = worksheetOrSettings.settings ?? worksheetOrSettings;
  const margins = normaliseMargins(options.margins ?? settings.margins ?? settings.marginMm);
  const columns = (options.columns ?? settings.columns) === 2 ? 2 : 1;
  const orientation = (options.orientation ?? settings.orientation) === 'landscape' ? 'landscape' : 'portrait';
  const page = orientation === 'landscape' ? A4_LANDSCAPE : A4_PORTRAIT;
  const gutterMm = clamp(finiteNumber(options.gutterMm, PAGINATION_DEFAULTS.gutterMm), 4, 12);
  const contentWidthMm = page.widthMm - margins.left - margins.right;
  const contentHeightMm = page.heightMm - margins.top - margins.bottom;
  const columnWidthMm = (contentWidthMm - (columns - 1) * gutterMm) / columns;
  return {
    page,
    margins,
    columns,
    gutterMm,
    contentXmm: margins.left,
    contentYmm: margins.top,
    contentWidthMm,
    contentHeightMm,
    columnWidthMm,
    columnXmm: Array.from({ length: columns }, (_, index) => margins.left + index * (columnWidthMm + gutterMm)),
  };
}

function glyphUnits(character) {
  if (/\s/.test(character)) return 0.34;
  if (/[ilI1'.,:;|!]/.test(character)) return 0.42;
  if (/[mwMW@%&]/.test(character)) return 1.13;
  if (/[0-9]/.test(character)) return 0.82;
  if (/[+−–—=÷×<>≤≥£$€]/.test(character)) return 0.92;
  if (character.charCodeAt(0) > 255) return 1;
  return 0.78;
}

export function estimateTextWidthMm(text, fontSizePt = 10.5) {
  const emMm = fontSizePt * (MM_PER_INCH / 72);
  let units = 0;
  for (const character of String(text ?? '')) units += glyphUnits(character);
  // Calibrated against the actual Georgia question face in Chromium's A4
  // layout. The former 0.5 multiplier under-measured ordinary question text
  // by roughly one third, so a two- or three-line workbook prompt could be
  // allocated only one or two lines and cross its trim boundary.
  return units * emMm * 0.78;
}

function lineCountForParagraph(paragraph, widthMm, fontSizePt) {
  if (!paragraph.length) return 1;
  const words = paragraph.split(/(\s+)/).filter(Boolean);
  let lines = 1;
  let used = 0;
  for (const word of words) {
    const width = estimateTextWidthMm(word, fontSizePt);
    if (/^\s+$/.test(word)) {
      used += width;
      continue;
    }
    if (width > widthMm) {
      const pieces = Math.max(1, Math.ceil(width / widthMm));
      if (used > 0) lines += 1;
      lines += pieces - 1;
      used = width % widthMm;
    } else if (used > 0 && used + width > widthMm) {
      lines += 1;
      used = width;
    } else {
      used += width;
    }
  }
  return lines;
}

/** A deterministic wrap count used by both preview and pagination. */
export function estimateWrappedLines(text, widthMm, options = {}) {
  const safeWidth = Math.max(10, finiteNumber(widthMm, 100));
  const fontSizePt = clamp(finiteNumber(options.fontSizePt, 10.5), 7, 24);
  const paragraphs = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  return paragraphs.reduce((total, paragraph) => total + lineCountForParagraph(paragraph, safeWidth, fontSizePt), 0);
}

export function estimateHeaderHeight(worksheet, widthMm) {
  if (!worksheet?.metadata) return 0;
  const metadata = worksheet.metadata;
  const settings = worksheet.settings ?? {};
  const headerFields = worksheet.architecture?.header?.fields ?? {};
  const headerLayout = worksheet.architecture?.header?.layout ?? 'standard';
  const workbook = Boolean(settings.workbookMode);
  const compact = workbook || headerLayout === 'compact';
  const titleFontPt = compact ? 15 : 21;
  // Workbook headers share the line with a fixed "Workbook cut-outs" label.
  // Reserve its track before estimating title wrapping.
  const titleWidthMm = workbook ? Math.max(40, widthMm - 40) : widthMm;
  const titleLines = estimateWrappedLines(metadata.title || metadata.name || 'Maths worksheet', titleWidthMm, { fontSizePt: titleFontPt });
  const headerText = workbook ? '' : [
    metadata.topic && headerFields.topic !== false ? metadata.topic : '',
    metadata.learningIntention && headerFields.learningIntention !== false ? metadata.learningIntention : '',
    metadata.successCriteria && headerFields.successCriteria === true ? metadata.successCriteria : '',
    metadata.shortInstruction && headerFields.shortInstruction !== false ? metadata.shortInstruction : '',
  ].filter(Boolean).join('\n');
  const instructionFontPt = compact ? 8.5 : 9.5;
  const instructionLines = headerText ? estimateWrappedLines(headerText, widthMm, { fontSizePt: instructionFontPt }) : 0;
  const fieldCount = workbook ? 0 : [settings.showNameField, settings.showClassField, settings.showDateField, metadata.teacher && headerFields.teacher === true, settings.showMarks && settings.totalMarks].filter(Boolean).length;
  const titleHeightMm = titleLines * ptToMm(titleFontPt) * 1.1;
  const instructionHeightMm = instructionLines
    ? (compact ? 1 : 1.8) + instructionLines * ptToMm(instructionFontPt) * 1.35
    : 0;
  const fieldsHeightMm = fieldCount ? (compact ? 2 : 4) + ptToMm(9) * 1.25 : 0;
  const kickerHeightMm = compact ? 0 : 1 + ptToMm(8.5) * 1.2;
  const bottomSpaceMm = compact ? 3.5 : headerLayout === 'spacious' ? 12 : 8.5;
  // A small sub-millimetre allowance protects against browser font metrics
  // differing slightly from the deterministic wrapper.
  return Math.ceil((kickerHeightMm + titleHeightMm + instructionHeightMm + fieldsHeightMm + bottomSpaceMm + 0.5) * 100) / 100;
}

function responseHeightMm(response = {}, density = 'standard') {
  const type = RESPONSE_HEIGHT_MM[response.type] ? response.type : 'open-box';
  const size = ({ small: 'compact', medium: 'standard', large: 'generous' })[response.size] ?? (['compact', 'standard', 'generous'].includes(response.size) ? response.size : 'standard');
  let height = RESPONSE_HEIGHT_MM[type][size];
  let fixedRowMinimumMm = 0;
  if (['writing-lines', 'lined-explanation', 'prove-it'].includes(type) && Number.isFinite(Number(response.lines))) {
    // The renderer always emits at least two rules, even for malformed or
    // older saved data that asks for one.
    height = clamp(Number(response.lines), 2, 14) * 6;
  }
  const fixedTrackResponse = ['table-completion', 'labelled-steps'].includes(type);
  const maximumCustomRows = fixedTrackResponse ? 20 : 14;
  const customRows = Number.isFinite(Number(response.customRows)) && Number(response.customRows) > 0
    ? clamp(Number(response.customRows), 1, maximumCustomRows)
    : 0;
  if (customRows) {
    const renderedRows = ['writing-lines', 'lined-explanation', 'prove-it'].includes(type)
      ? Math.max(2, customRows)
      : customRows;
    height = renderedRows * 6;
  }
  const suppliedRows = customRows || (Number.isFinite(Number(response.rows)) && Number(response.rows) > 0 ? Number(response.rows) : 0);
  if (suppliedRows && ['table-completion', 'diagram-construction', 'labelled-steps'].includes(type)) {
    const rowCount = clamp(suppliedRows, fixedTrackResponse ? 2 : 1, fixedTrackResponse ? 20 : 14);
    // Table and labelled-step rows have a fixed 7 mm CSS minimum. Density may
    // add space but must never scale the container below the sum of its rows.
    fixedRowMinimumMm = ['table-completion', 'labelled-steps'].includes(type) ? rowCount * 7 : 0;
    height = Math.max(height, fixedRowMinimumMm || rowCount * 5.4);
  }
  return Math.max(fixedRowMinimumMm, height * (DENSITY_SCALE[density] ?? 1));
}

function selectedModelForView(block, outputView) {
  if ((outputView === 'teacher' || outputView === 'answer') && block.teacher?.completedModel) return block.teacher.completedModel;
  return block.model;
}

export function estimateModelBox(model, availableWidthMm) {
  if (!model) return { heightMm: 0, widthMm: 0, warnings: [], metrics: null };
  const build2 = getBuild2ModelDefinition(model.family);
  // The Build 2 renderer uses a consistent landscape SVG viewBox.  Reserve a
  // height derived from the actual allotted width rather than squeezing it
  // into the old Build 1 default box.  That keeps labels crisp in both A4
  // orientations and when a model sits beside a question.
  const metrics = build2
    ? {
      height: Math.min(62, Math.max(build2.print.minHeightMm ?? 24, Math.round(availableWidthMm * 0.34))),
      minWidth: build2.print.minWidthMm ?? 62,
      minHeight: build2.print.minHeightMm ?? 24,
    }
    : modelMetrics(model.family);
  const scale = SIZE_SCALE[model.size] ?? 1;
  const specifiedHeight = finiteNumber(model.printHeightMm, null);
  const heightMm = specifiedHeight == null ? metrics.height * scale : clamp(specifiedHeight, 8, 120);
  const declaredMinWidthMm = finiteNumber(model.printMinWidthMm, metrics.minWidth);
  const physicalWideMinimumMm = isWideModel(model)
    ? WIDE_MODEL_MIN_WIDTH_MM[model.size] ?? WIDE_MODEL_MIN_WIDTH_MM.standard
    : 0;
  const minWidthMm = Math.max(declaredMinWidthMm, physicalWideMinimumMm);
  const warnings = [];
  if (availableWidthMm + 0.01 < minWidthMm || heightMm + 0.01 < metrics.minHeight) {
    warnings.push({
      code: 'model-too-small',
      severity: 'warning',
      message: 'The model may be too small to read reliably when printed.',
      requiredWidthMm: minWidthMm,
      availableWidthMm,
    });
  }
  return { heightMm, widthMm: availableWidthMm, minWidthMm, warnings, metrics };
}

function blockWarning(code, message, details = {}) {
  return { code, severity: 'warning', message, ...details };
}

/**
 * Measure a complete question-model-response block. It is intentionally one
 * indivisible measurement; the paginator never places its pieces separately.
 */
export function measureQuestionBlock(block, availableWidthMm, options = {}) {
  const density = options.density ?? 'standard';
  const outputView = options.outputView ?? 'pupil';
  const footprint = compositionFootprint(block);
  const paddingMm = blockPaddingMm(density, footprint);
  const borderMm = blockBorderMm(options, block.kind);
  // Normal worksheets deliberately use vertical-only block padding. Workbook
  // cut-outs use the same padding on all four sides inside their trim border.
  const horizontalPaddingMm = options.workbookMode ? paddingMm : 0;
  const innerWidthMm = Math.max(20, availableWidthMm - horizontalPaddingMm * 2 - borderMm.horizontalMm);
  const questionFontPt = effectiveQuestionFontPt(options);
  const questionLineHeightMm = ptToMm(questionFontPt) * 1.44;
  const warnings = [];

  if (block.kind === 'heading') {
    const style = options.sectionStyle ?? 'line';
    const horizontalInsetMm = style === 'band' ? 6 : 0;
    const iconAllowanceMm = style === 'stage' ? 7 : 6.6;
    const lines = estimateWrappedLines(block.displayText, innerWidthMm - horizontalInsetMm - iconAllowanceMm, { fontSizePt: 9.5 });
    const verticalPaddingMm = style === 'band' ? 4.8 : style === 'plain' ? 3.7 : style === 'stage' ? 4.3 : 4;
    const headingMm = verticalPaddingMm + lines * ptToMm(9.5) * 1.2 + borderMm.verticalMm + 0.2;
    return {
      blockId: block.id,
      heightMm: Math.round(headingMm * 100) / 100,
      widthMm: availableWidthMm,
      indivisible: true,
      breakdown: { headingMm, paddingMm: 0, questionMm: 0, modelMm: 0, responseMm: 0, teacherMm: 0, innerWidthMm },
      warnings,
    };
  }
  if (block.kind === 'instruction') {
    const lines = estimateWrappedLines(block.displayText, innerWidthMm, { fontSizePt: questionFontPt });
    const instructionMm = paddingMm * 2 + lines * questionLineHeightMm + borderMm.verticalMm + 0.2;
    return {
      blockId: block.id,
      heightMm: Math.round(instructionMm * 100) / 100,
      widthMm: availableWidthMm,
      indivisible: true,
      breakdown: { instructionMm, paddingMm, questionMm: 0, modelMm: 0, responseMm: 0, teacherMm: 0, innerWidthMm, questionFontPt },
      warnings,
    };
  }

  const numberAllowance = block.number == null ? 0 : 9;
  const marksAllowance = !options.showMarks || block.marks == null
    ? 0
    : estimateTextWidthMm(`[${block.marks} ${Number(block.marks) === 1 ? 'mark' : 'marks'}]`, 7.8) + 3;
  const model = selectedModelForView(block, outputView);
  const requestedPosition = model?.position ?? block.layout?.modelPosition ?? 'beneath';
  const forceBeneath = usesLabelledFullWidthSlot(model)
    || options.workbookMode && isBuild2Model(model);
  const position = requestedPosition === 'beside' && forceBeneath ? 'beneath' : requestedPosition;
  const beside = model && position === 'beside';
  const besideRemainingMm = Math.max(0, innerWidthMm - PRINT_LAYOUT_MM.besideGap);
  const besideModelWidthMm = Math.min(
    besideRemainingMm,
    Math.max(PRINT_LAYOUT_MM.besideModelMinimum, besideRemainingMm * (0.8 / 1.8)),
  );
  const questionTrackWidthMm = beside ? Math.max(10, besideRemainingMm - besideModelWidthMm) : innerWidthMm;
  const questionWidthMm = Math.max(10, questionTrackWidthMm - numberAllowance - marksAllowance);
  const questionLines = estimateWrappedLines(block.displayText, questionWidthMm, { fontSizePt: questionFontPt });
  const numberLineHeightMm = ptToMm(10.5) * 1.45;
  const questionMm = Math.max(numberLineHeightMm, questionLines * questionLineHeightMm) + 0.25;
  // Beneath/above slots retain their 9 mm CSS indent. Beside slots explicitly
  // remove that margin and use the second grid track calculated above.
  const modelWidthMm = model
    ? beside
      ? besideModelWidthMm
      : Math.max(0, innerWidthMm - PRINT_LAYOUT_MM.modelIndent)
    : 0;
  const modelBox = estimateModelBox(model, modelWidthMm);
  warnings.push(...modelBox.warnings);
  const responseMm = responseHeightMm(block.response, density);
  let coreMm;
  if (!model) coreMm = questionMm;
  else if (beside) coreMm = Math.max(questionMm, modelBox.heightMm);
  else if (position === 'above') coreMm = modelBox.heightMm + PRINT_LAYOUT_MM.modelAboveMarginBottom + questionMm;
  else coreMm = questionMm + PRINT_LAYOUT_MM.modelMarginTop + modelBox.heightMm + PRINT_LAYOUT_MM.modelMarginBottom;

  let supportMm = 0;
  if (outputView === 'pupil' && (block.composition?.hint || block.composition?.sentenceStem || block.composition?.vocabulary?.length)) {
    const supportItems = [
      block.composition?.hint ? { text: block.composition.hint, iconAllowanceMm: 3.2 } : null,
      block.composition?.sentenceStem ? { text: `Stem: ${block.composition.sentenceStem}`, iconAllowanceMm: 0 } : null,
      block.composition?.vocabulary?.length ? { text: `Words: ${block.composition.vocabulary.join(', ')}`, iconAllowanceMm: 0 } : null,
    ].filter(Boolean);
    const supportContentWidthMm = Math.max(
      10,
      innerWidthMm
        - PRINT_LAYOUT_MM.supportIndent
        - PRINT_LAYOUT_MM.supportPaddingHorizontal
        - PRINT_LAYOUT_MM.supportBorder,
    );
    const supportLines = supportItems.reduce((total, item) => total + estimateWrappedLines(
      item.text,
      supportContentWidthMm - item.iconAllowanceMm,
      { fontSizePt: 7.8 },
    ), 0);
    supportMm = PRINT_LAYOUT_MM.supportMarginTop
      + PRINT_LAYOUT_MM.supportPaddingVertical
      + supportLines * ptToMm(7.8) * 1.35
      + Math.max(0, supportItems.length - 1) * PRINT_LAYOUT_MM.supportItemGap;
  }

  let teacherMm = 0;
  if (outputView === 'teacher') {
    const teacherLines = [
      block.teacher?.answer != null && String(block.teacher.answer).length ? `Answer: ${block.teacher.answer}` : '',
      block.teacher?.expectedMethod ? `Expected method: ${block.teacher.expectedMethod}` : '',
      block.teacher?.misconception ? `Watch for: ${block.teacher.misconception}` : '',
      block.teacher?.notes ?? '',
      block.teacher?.markingNote ? `Marking: ${block.teacher.markingNote}` : '',
    ].filter(Boolean);
    if (teacherLines.length) {
      const teacherContentWidthMm = Math.max(
        10,
        innerWidthMm
          - PRINT_LAYOUT_MM.teacherIndent
          - PRINT_LAYOUT_MM.teacherPaddingHorizontal
          - PRINT_LAYOUT_MM.teacherBorder,
      );
      const lineCount = teacherLines.reduce(
        (total, line) => total + estimateWrappedLines(line, teacherContentWidthMm, { fontSizePt: 7.8 }),
        0,
      );
      teacherMm = PRINT_LAYOUT_MM.teacherMarginTop
        + PRINT_LAYOUT_MM.teacherPaddingVertical
        + lineCount * ptToMm(7.8) * 1.35;
    }
  } else if (outputView === 'answer' && block.teacher?.answer != null && String(block.teacher.answer).length) {
    const answerContentWidthMm = Math.max(
      10,
      innerWidthMm
        - PRINT_LAYOUT_MM.teacherIndent
        - PRINT_LAYOUT_MM.teacherPaddingHorizontal
        - PRINT_LAYOUT_MM.answerBorder * 2,
    );
    teacherMm = PRINT_LAYOUT_MM.teacherMarginTop
      + PRINT_LAYOUT_MM.teacherPaddingVertical
      + estimateWrappedLines(`Answer: ${block.teacher.answer}`, answerContentWidthMm, { fontSizePt: 8 }) * ptToMm(8) * 1.35;
  }

  const responseMissing = (block.response?.type ?? 'open-box') === 'none'
    && model?.purpose !== 'response-model'
    && block.extracted?.responseNeeded !== false;
  if (responseMissing) {
    warnings.push(blockWarning(
      'no-meaningful-response-space',
      'This question has no clear pupil response space.',
    ));
  }

  for (const warning of block.warnings ?? []) {
    if (!warning?.code || warnings.some((existing) => existing.code === warning.code)) continue;
    warnings.push({ ...warning });
  }

  const responseTotalMm = responseMm ? PRINT_LAYOUT_MM.responseMarginTop + responseMm : 0;
  const responseWidthMm = responseMm ? Math.max(0, innerWidthMm - PRINT_LAYOUT_MM.responseIndent) : 0;
  const heightMm = paddingMm * 2 + borderMm.verticalMm + coreMm + supportMm + responseTotalMm + teacherMm;
  return {
    blockId: block.id,
    heightMm: Math.round(heightMm * 100) / 100,
    widthMm: availableWidthMm,
    indivisible: true,
    breakdown: {
      paddingMm,
      horizontalPaddingMm,
      innerWidthMm,
      questionFontPt,
      questionMm,
      modelMm: modelBox.heightMm,
      modelWidthMm,
      supportMm,
      responseMm,
      responseTotalMm,
      responseWidthMm,
      teacherMm,
      position,
      requestedPosition,
      footprint,
    },
    warnings,
  };
}

function createPage(pageNumber, geometry, worksheet, options) {
  const firstPage = pageNumber === 1;
  const headerHeightMm = firstPage
    ? estimateHeaderHeight(worksheet, geometry.contentWidthMm)
    : finiteNumber(options.continuationHeaderHeightMm, PAGINATION_DEFAULTS.continuationHeaderHeightMm);
  const footerHeightMm = worksheet.settings?.pageNumbers === false
    ? 0
    : finiteNumber(options.footerHeightMm, PAGINATION_DEFAULTS.footerHeightMm);
  const bodyTopMm = geometry.contentYmm + headerHeightMm;
  const bodyBottomMm = geometry.contentYmm + geometry.contentHeightMm - footerHeightMm;
  return {
    number: pageNumber,
    widthMm: geometry.page.widthMm,
    heightMm: geometry.page.heightMm,
    headerHeightMm,
    footerHeightMm,
    bodyTopMm,
    bodyBottomMm,
    bodyHeightMm: Math.max(0, bodyBottomMm - bodyTopMm),
    columns: Array.from({ length: geometry.columns }, (_, index) => ({
      index,
      xMm: geometry.columnXmm[index],
      widthMm: geometry.columnWidthMm,
      items: [],
      usedHeightMm: 0,
    })),
    items: [],
    warnings: [],
    utilisation: 0,
  };
}

function warningKey(warning) {
  return `${warning.code}|${warning.blockId ?? ''}|${warning.page ?? ''}`;
}

function dedupeWarnings(warnings) {
  const seen = new Set();
  return warnings.filter((warning) => {
    const key = warningKey(warning);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compositionFootprint(block) {
  const footprint = block?.composition?.footprint;
  if (footprint === 'half-width') return 'half';
  if (footprint === 'full-width') return 'full';
  if (footprint === 'full-page') return 'page';
  return ['compact', 'standard', 'spacious', 'half', 'full', 'page'].includes(footprint) ? footprint : 'standard';
}

function sectionStartRule(worksheet, block) {
  const section = (worksheet.architecture?.sections ?? []).find((item) => item.id === block.section);
  if (!section?.startOnNewPage) return false;
  const heading = section.headingId
    ? worksheet.blocks.find((candidate) => candidate.id === section.headingId)
    : null;
  const first = heading ?? worksheet.blocks.find((candidate) => candidate.section === section.id);
  return first?.id === block.id;
}

function sectionUsesRows(worksheet, block) {
  const section = (worksheet.architecture?.sections ?? []).find((item) => item.id === block.section);
  if (section) return section.layout === 'rows';
  return worksheet.architecture?.compositionMode === 'rows';
}

function needsFullWidth(block, worksheet = null, outputView = 'pupil') {
  const footprint = compositionFootprint(block);
  return block.kind !== 'question'
    || footprint === 'full'
    || footprint === 'page'
    || block.layout?.columnSpan === 'full'
    || modelRequiresFullWidth(selectedModelForView(block, outputView), worksheet);
}

function mayUseHalfWidth(block, worksheet = null, outputView = 'pupil') {
  if (block?.kind !== 'question' || needsFullWidth(block, worksheet, outputView)) return false;
  if (worksheet && !sectionUsesRows(worksheet, block)) return false;
  return compositionFootprint(block) === 'half' || block.layout?.columnSpan === 'half';
}

function fillPageMeasurement(block, measurement, availableHeightMm) {
  if (compositionFootprint(block) !== 'page' || !Number.isFinite(availableHeightMm)) return measurement;
  const heightMm = Math.max(measurement.heightMm, Math.max(0, availableHeightMm));
  return {
    ...measurement,
    heightMm: Math.round(heightMm * 100) / 100,
    breakdown: {
      ...measurement.breakdown,
      footprint: 'page',
      footprintFillMm: Math.max(0, Math.round((heightMm - measurement.heightMm) * 100) / 100),
    },
  };
}

function addPlacementWarning(page, warnings, blockId, placement, measurement) {
  const overflowMm = Math.max(0, placement.heightMm - (page.bodyBottomMm - placement.yMm));
  if (overflowMm > 0.01) {
    const warning = blockWarning(
      'block-overcrowded',
      'This complete question block is taller than the printable page body.',
      { blockId, page: page.number, overflowMm: Math.round(overflowMm * 100) / 100 },
    );
    measurement.warnings.push(warning);
    page.warnings.push(warning);
    warnings.push(warning);
  }
  for (const sourceWarning of measurement.warnings) {
    const warning = { ...sourceWarning, blockId, page: page.number };
    page.warnings.push(warning);
    warnings.push(warning);
  }
}

function buildPaginationResult(geometry, outputView, pages, placements, warnings, worksheet = null) {
  for (const currentPage of pages) {
    const used = currentPage.columns.reduce((sum, column) => sum + column.usedHeightMm, 0);
    const capacity = currentPage.bodyHeightMm * geometry.columns;
    currentPage.utilisation = capacity > 0 ? Math.min(1, used / capacity) : 1;
    if (currentPage.utilisation >= PAGINATION_DEFAULTS.overcrowdingThreshold && !currentPage.warnings.some((warning) => warning.code === 'page-near-capacity')) {
      const warning = blockWarning(
        'page-near-capacity',
        'This page is very full; check the final PDF before printing.',
        { page: currentPage.number },
      );
      currentPage.warnings.push(warning);
      warnings.push(warning);
    }
    if (!currentPage.items.length && pages.length > 1) {
      const warning = blockWarning(
        'page-empty',
        'This page contains no question blocks. Reduce the next block or adjust its working space before printing.',
        { page: currentPage.number },
      );
      currentPage.warnings.push(warning);
      warnings.push(warning);
    } else if (currentPage.items.length && currentPage.utilisation < 0.16 && currentPage.number !== pages.length) {
      const warning = blockWarning(
        'page-nearly-empty',
        'This page has a large amount of unused space.',
        { page: currentPage.number },
      );
      currentPage.warnings.push(warning);
      warnings.push(warning);
    }
    const onlyHeading = currentPage.items.length === 1 && currentPage.items[0]?.measurement?.breakdown?.headingMm;
    if (onlyHeading) {
      const warning = blockWarning(
        'orphaned-heading',
        'A section heading is alone on this page.',
        { page: currentPage.number, blockId: currentPage.items[0].blockId },
      );
      currentPage.warnings.push(warning);
      warnings.push(warning);
    }
    currentPage.warnings = dedupeWarnings(currentPage.warnings);
  }

  const workbookMode = Boolean(worksheet?.settings?.workbookMode);
  if (workbookMode && pages.length !== 1) {
    warnings.push(blockWarning(
      'workbook-page-count',
      `This workbook sheet needs ${pages.length} readable A4 pages; it has not been shrunk to force one page.`,
      { pageCount: pages.length },
    ));
  }

  const finalWarnings = dedupeWarnings(warnings);
  const hasOverflow = finalWarnings.some((warning) => warning.code === 'block-overcrowded');
  const tooSmallModelBlockIds = finalWarnings
    .filter((warning) => warning.code === 'model-too-small')
    .map((warning) => warning.blockId);
  const blocksWithoutResponseSpace = finalWarnings
    .filter((warning) => warning.code === 'no-meaningful-response-space')
    .map((warning) => warning.blockId);
  return {
    geometry,
    outputView,
    pages,
    placements,
    pageCount: pages.length,
    warnings: finalWarnings,
    hasOverflow,
    hasAnswerRevealRisk: finalWarnings.some((warning) => warning.code === 'assessment-answer-reveal'),
    tooSmallModelBlockIds,
    blocksWithoutResponseSpace,
    workbookMode,
    workbookFitsOnePage: workbookMode
      ? pages.length === 1 && !hasOverflow && !tooSmallModelBlockIds.length && !blocksWithoutResponseSpace.length
      : null,
    crowdedPageNumbers: finalWarnings.filter((warning) => ['page-near-capacity', 'block-overcrowded'].includes(warning.code)).map((warning) => warning.page).filter(Boolean),
    sparsePageNumbers: finalWarnings.filter((warning) => ['page-empty', 'page-nearly-empty'].includes(warning.code)).map((warning) => warning.page).filter(Boolean),
    orphanedHeadingBlockIds: finalWarnings.filter((warning) => warning.code === 'orphaned-heading').map((warning) => warning.blockId).filter(Boolean),
  };
}

/**
 * A bounded row composer for Build 3. It pairs only deliberate half-width
 * question blocks. Full-width blocks can sit between rows on the same page;
 * no object ever becomes independently draggable or overlaps another.
 */
function paginateRowsWorksheet(worksheet, options = {}) {
  const geometry = getPageGeometry(worksheet, { ...options, columns: 2 });
  const density = worksheet.settings?.density ?? 'standard';
  const outputView = options.outputView ?? worksheet.outputView ?? 'pupil';
  const measurementOptions = {
    density,
    outputView,
    bodyScale: worksheet.settings?.bodyScale ?? 'standard',
    workbookMode: Boolean(worksheet.settings?.workbookMode),
    sectionStyle: worksheet.settings?.sectionStyle ?? 'line',
    lineWeight: worksheet.settings?.lineWeight ?? 'light',
    showMarks: Boolean(worksheet.settings?.showMarks),
  };
  const blockGapMm = finiteNumber(options.blockGapMm, PAGINATION_DEFAULTS.blockGapMm * (DENSITY_SCALE[density] ?? 1));
  const manualBreaks = new Set([
    ...(worksheet.pageArrangement?.manualBreakBefore ?? []),
    ...worksheet.blocks.filter((block) => block.layout?.manualBreakBefore || block.composition?.startOnNewPage || sectionStartRule(worksheet, block)).map((block) => block.id),
  ]);
  const pages = [];
  const placements = {};
  const warnings = [];
  let page = createPage(1, geometry, worksheet, options);
  pages.push(page);
  let cursorY = page.bodyTopMm;

  const newPage = () => {
    page = createPage(pages.length + 1, geometry, worksheet, options);
    pages.push(page);
    cursorY = page.bodyTopMm;
  };
  const remainingHeight = () => page.bodyBottomMm - cursorY;
  const hasItems = () => page.items.length > 0;
  const addPlacement = (block, index, column, widthMm, measurement, rowHeight) => {
    const placement = {
      blockId: block.id,
      orderIndex: index,
      page: page.number,
      column,
      xMm: column == null ? geometry.contentXmm : geometry.columnXmm[column],
      yMm: cursorY,
      widthMm,
      heightMm: rowHeight ?? measurement.heightMm,
      indivisible: true,
      overflowMm: Math.max(0, measurement.heightMm - remainingHeight()),
      measurement,
    };
    page.items.push(placement);
    if (column == null) {
      for (const entry of page.columns) {
        entry.items.push(placement);
        entry.usedHeightMm = Math.max(entry.usedHeightMm, cursorY + placement.heightMm - page.bodyTopMm);
      }
    } else {
      const entry = page.columns[column];
      entry.items.push(placement);
      entry.usedHeightMm = Math.max(entry.usedHeightMm, cursorY + placement.heightMm - page.bodyTopMm);
    }
    placements[block.id] = placement;
    addPlacementWarning(page, warnings, block.id, placement, measurement);
  };

  for (let index = 0; index < worksheet.blocks.length; index += 1) {
    const block = worksheet.blocks[index];
    const pageFootprint = compositionFootprint(block) === 'page';
    const pageHint = Math.max(0, Math.floor(finiteNumber(block.layout?.pageHint, 0)));
    if (manualBreaks.has(block.id) && hasItems()) newPage();
    while (pageHint > page.number) newPage();
    if (pageHint && pageHint < page.number) warnings.push(blockWarning('page-hint-unavailable', 'This block could not move backwards without changing worksheet order.', { blockId: block.id, requestedPage: pageHint, page: page.number }));
    if (pageFootprint && hasItems()) newPage();

    const nextBlock = worksheet.blocks[index + 1];
    const paired = mayUseHalfWidth(block, worksheet, outputView)
      && nextBlock
      && mayUseHalfWidth(nextBlock, worksheet, outputView)
      && !manualBreaks.has(nextBlock.id)
      && (nextBlock.section === block.section || !nextBlock.section || !block.section);

    if (paired) {
      const leftMeasurement = measureQuestionBlock(block, geometry.columnWidthMm, measurementOptions);
      const rightMeasurement = measureQuestionBlock(nextBlock, geometry.columnWidthMm, measurementOptions);
      const rowHeight = Math.max(leftMeasurement.heightMm, rightMeasurement.heightMm);
      if (rowHeight > remainingHeight() + PAGINATION_DEFAULTS.minimumRemainingMm && hasItems()) newPage();
      addPlacement(block, index, 0, geometry.columnWidthMm, leftMeasurement, rowHeight);
      addPlacement(nextBlock, index + 1, 1, geometry.columnWidthMm, rightMeasurement, rowHeight);
      cursorY += rowHeight + blockGapMm;
      index += 1;
      continue;
    }

    const full = needsFullWidth(block, worksheet, outputView) || !mayUseHalfWidth(block, worksheet, outputView);
    const widthMm = full ? geometry.contentWidthMm : geometry.columnWidthMm;
    let measurement = measureQuestionBlock(block, widthMm, measurementOptions);
    if (!pageFootprint && block.layout?.keepWithNext && nextBlock) {
      const nextWidth = mayUseHalfWidth(nextBlock, worksheet, outputView) ? geometry.columnWidthMm : geometry.contentWidthMm;
      const nextMeasurement = measureQuestionBlock(nextBlock, nextWidth, measurementOptions);
      if (measurement.heightMm + blockGapMm + nextMeasurement.heightMm > remainingHeight() && hasItems()) newPage();
    }
    if (measurement.heightMm > remainingHeight() + PAGINATION_DEFAULTS.minimumRemainingMm && hasItems()) newPage();
    measurement = measureQuestionBlock(block, widthMm, measurementOptions);
    measurement = fillPageMeasurement(block, measurement, remainingHeight());
    addPlacement(block, index, full ? null : 0, widthMm, measurement);
    cursorY += measurement.heightMm + blockGapMm;
  }

  return buildPaginationResult(geometry, outputView, pages, placements, warnings, worksheet);
}

/**
 * Paginate without mutating the worksheet. A placement is always for a complete
 * block; no question, model, or response area is ever split between pages.
 */
export function paginateWorksheet(worksheet, options = {}) {
  if (!worksheet || !Array.isArray(worksheet.blocks)) {
    throw new TypeError('paginateWorksheet requires a worksheet with an ordered blocks array.');
  }
  const compositionMode = options.compositionMode ?? worksheet.architecture?.compositionMode;
  const hasRowsSection = compositionMode === 'flow'
    && (worksheet.architecture?.sections ?? []).some((section) => section?.layout === 'rows');
  if (compositionMode === 'rows' || hasRowsSection) {
    return paginateRowsWorksheet(worksheet, options);
  }
  const geometry = getPageGeometry(worksheet, options);
  const density = worksheet.settings?.density ?? 'standard';
  const outputView = options.outputView ?? worksheet.outputView ?? 'pupil';
  const measurementOptions = {
    density,
    outputView,
    bodyScale: worksheet.settings?.bodyScale ?? 'standard',
    workbookMode: Boolean(worksheet.settings?.workbookMode),
    sectionStyle: worksheet.settings?.sectionStyle ?? 'line',
    lineWeight: worksheet.settings?.lineWeight ?? 'light',
    showMarks: Boolean(worksheet.settings?.showMarks),
  };
  const blockGapMm = finiteNumber(options.blockGapMm,
    PAGINATION_DEFAULTS.blockGapMm * (DENSITY_SCALE[density] ?? 1));
  const manualBreaks = new Set([
    ...(worksheet.pageArrangement?.manualBreakBefore ?? []),
    ...worksheet.blocks
      .filter((block) => block.layout?.manualBreakBefore || block.composition?.startOnNewPage || sectionStartRule(worksheet, block))
      .map((block) => block.id),
  ]);
  const pages = [];
  const placements = {};
  const warnings = [];
  let page = createPage(1, geometry, worksheet, options);
  pages.push(page);
  let columnIndex = 0;
  let cursorY = page.bodyTopMm;
  let dedicatedPageFilled = false;

  function newPage() {
    page = createPage(pages.length + 1, geometry, worksheet, options);
    pages.push(page);
    columnIndex = 0;
    cursorY = page.bodyTopMm;
    dedicatedPageFilled = false;
  }

  function advanceColumnOrPage() {
    if (columnIndex < geometry.columns - 1) {
      columnIndex += 1;
      cursorY = page.bodyTopMm + page.columns[columnIndex].usedHeightMm;
    } else {
      newPage();
    }
  }

  function currentColumnHasItems() {
    return page.columns[columnIndex].items.length > 0;
  }

  function pageHasItems() {
    return page.items.length > 0;
  }

  function remainingHeight() {
    return page.bodyBottomMm - cursorY;
  }

  for (let index = 0; index < worksheet.blocks.length; index += 1) {
    if (dedicatedPageFilled) newPage();
    const block = worksheet.blocks[index];
    const footprint = compositionFootprint(block);
    const pageFootprint = footprint === 'page';
    const wantsFullWidth = geometry.columns === 2 && needsFullWidth(block, worksheet, outputView);
    const pageHint = Math.max(0, Math.floor(finiteNumber(block.layout?.pageHint, 0)));

    if (manualBreaks.has(block.id) && pageHasItems()) newPage();
    while (pageHint > page.number) newPage();
    if (pageHint && pageHint < page.number) {
      warnings.push(blockWarning(
        'page-hint-unavailable',
        'This block could not move backwards without changing worksheet order.',
        { blockId: block.id, requestedPage: pageHint, page: page.number },
      ));
    }
    if (pageFootprint && pageHasItems()) newPage();

    if (wantsFullWidth && pageHasItems()) newPage();
    if (wantsFullWidth) {
      columnIndex = 0;
      cursorY = page.bodyTopMm;
    }

    let widthMm = wantsFullWidth ? geometry.contentWidthMm : geometry.columnWidthMm;
    let measurement = measureQuestionBlock(block, widthMm, measurementOptions);

    // Keep a heading/instruction with its next block where this is possible.
    if (!pageFootprint && block.layout?.keepWithNext && worksheet.blocks[index + 1]) {
      const nextMeasurement = measureQuestionBlock(worksheet.blocks[index + 1], widthMm, measurementOptions);
      if (measurement.heightMm + blockGapMm + nextMeasurement.heightMm > remainingHeight() && currentColumnHasItems()) {
        advanceColumnOrPage();
      }
    }

    if (measurement.heightMm > remainingHeight() + PAGINATION_DEFAULTS.minimumRemainingMm) {
      if (currentColumnHasItems() || pageHasItems() && wantsFullWidth) {
        if (wantsFullWidth) newPage();
        else advanceColumnOrPage();
      }
      widthMm = wantsFullWidth ? geometry.contentWidthMm : geometry.columnWidthMm;
      measurement = measureQuestionBlock(block, widthMm, measurementOptions);
    }
    measurement = fillPageMeasurement(block, measurement, remainingHeight());

    const availableHeightMm = page.bodyBottomMm - cursorY;
    const overflowMm = Math.max(0, measurement.heightMm - availableHeightMm);
    const xMm = wantsFullWidth ? geometry.contentXmm : geometry.columnXmm[columnIndex];
    const placement = {
      blockId: block.id,
      orderIndex: index,
      page: page.number,
      column: wantsFullWidth ? null : columnIndex,
      xMm,
      yMm: cursorY,
      widthMm,
      heightMm: measurement.heightMm,
      indivisible: true,
      overflowMm: Math.round(overflowMm * 100) / 100,
      measurement,
    };

    if (overflowMm > 0.01) {
      const warning = blockWarning(
        'block-overcrowded',
        'This complete question block is taller than the printable page body.',
        { blockId: block.id, page: page.number, overflowMm: placement.overflowMm },
      );
      measurement.warnings.push(warning);
      page.warnings.push(warning);
      warnings.push(warning);
    }
    for (const sourceWarning of measurement.warnings) {
      const warning = { ...sourceWarning, blockId: block.id, page: page.number };
      page.warnings.push(warning);
      warnings.push(warning);
    }

    page.items.push(placement);
    if (wantsFullWidth) {
      for (const column of page.columns) {
        column.items.push(placement);
        column.usedHeightMm = Math.max(column.usedHeightMm, cursorY + measurement.heightMm - page.bodyTopMm);
      }
    } else {
      const column = page.columns[columnIndex];
      column.items.push(placement);
      column.usedHeightMm = Math.max(column.usedHeightMm, cursorY + measurement.heightMm - page.bodyTopMm);
    }
    placements[block.id] = placement;
    cursorY += measurement.heightMm + blockGapMm;
    if (pageFootprint) dedicatedPageFilled = true;

    if (wantsFullWidth) {
      // Further two-column content begins below the spanning item.
      for (const column of page.columns) column.usedHeightMm = cursorY - page.bodyTopMm;
      columnIndex = 0;
    }
  }

  return buildPaginationResult(geometry, outputView, pages, placements, warnings, worksheet);
}

/** CSS variables shared by an on-screen page and its @media print rule. */
export function pageCssVariables(geometry = getPageGeometry()) {
  return {
    '--mps-page-width': `${geometry.page.widthMm}mm`,
    '--mps-page-height': `${geometry.page.heightMm}mm`,
    '--mps-page-margin-top': `${geometry.margins.top}mm`,
    '--mps-page-margin-right': `${geometry.margins.right}mm`,
    '--mps-page-margin-bottom': `${geometry.margins.bottom}mm`,
    '--mps-page-margin-left': `${geometry.margins.left}mm`,
    '--mps-column-width': `${geometry.columnWidthMm}mm`,
    '--mps-column-gutter': `${geometry.gutterMm}mm`,
  };
}

export function placementStyle(placement) {
  return {
    position: 'absolute',
    left: `${placement.xMm}mm`,
    top: `${placement.yMm}mm`,
    width: `${placement.widthMm}mm`,
    height: `${placement.heightMm}mm`,
    breakInside: 'avoid',
    pageBreakInside: 'avoid',
  };
}
