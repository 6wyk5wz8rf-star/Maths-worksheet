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

const SIZE_SCALE = Object.freeze({ compact: 0.82, standard: 1, large: 1.28 });
const DENSITY_SCALE = Object.freeze({ compact: 0.82, standard: 1, spacious: 1.2 });

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
  'writing-lines': { compact: 15, standard: 25, generous: 38 },
  'squared-grid': { compact: 23, standard: 35, generous: 51 },
  'open-box': { compact: 24, standard: 38, generous: 58 },
  'model-completion': { compact: 19, standard: 29, generous: 43 },
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
  return units * emMm * 0.5;
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
  const titleLines = estimateWrappedLines(metadata.title || metadata.name || 'Maths worksheet', widthMm, { fontSizePt: 18 });
  const instructionLines = metadata.shortInstruction
    ? estimateWrappedLines(metadata.shortInstruction, widthMm, { fontSizePt: 9.5 })
    : 0;
  const fieldCount = [settings.showNameField, settings.showClassField, settings.showDateField].filter(Boolean).length;
  const fieldsHeight = fieldCount ? 9 : 0;
  return 7 + titleLines * 7.2 + instructionLines * 4.7 + fieldsHeight + 4;
}

function responseHeightMm(response = {}, density = 'standard') {
  const type = RESPONSE_HEIGHT_MM[response.type] ? response.type : 'open-box';
  const size = ['compact', 'standard', 'generous'].includes(response.size) ? response.size : 'standard';
  let height = RESPONSE_HEIGHT_MM[type][size];
  if (type === 'writing-lines' && Number.isFinite(Number(response.lines))) {
    height = clamp(Number(response.lines), 1, 14) * 6;
  }
  return height * (DENSITY_SCALE[density] ?? 1);
}

function selectedModelForView(block, outputView) {
  if (outputView === 'teacher' && block.teacher?.completedModel) return block.teacher.completedModel;
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
  const minWidthMm = finiteNumber(model.printMinWidthMm, metrics.minWidth);
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
  const innerWidthMm = Math.max(20, availableWidthMm - 6);
  const warnings = [];

  if (block.kind === 'heading') {
    const lines = estimateWrappedLines(block.displayText, innerWidthMm, { fontSizePt: 13 });
    return {
      blockId: block.id,
      heightMm: 6 + lines * 6.2,
      widthMm: availableWidthMm,
      indivisible: true,
      breakdown: { headingMm: 6 + lines * 6.2, questionMm: 0, modelMm: 0, responseMm: 0, teacherMm: 0 },
      warnings,
    };
  }
  if (block.kind === 'instruction') {
    const lines = estimateWrappedLines(block.displayText, innerWidthMm, { fontSizePt: 9.5 });
    return {
      blockId: block.id,
      heightMm: 5 + lines * 4.8,
      widthMm: availableWidthMm,
      indivisible: true,
      breakdown: { instructionMm: 5 + lines * 4.8, questionMm: 0, modelMm: 0, responseMm: 0, teacherMm: 0 },
      warnings,
    };
  }

  const numberAllowance = block.number == null ? 0 : 9;
  const marksAllowance = block.marks == null ? 0 : 10;
  const model = selectedModelForView(block, outputView);
  const position = model?.position ?? block.layout?.modelPosition ?? 'beneath';
  const beside = model && position === 'beside';
  const questionWidthMm = beside ? Math.max(28, innerWidthMm * 0.5 - 2) : innerWidthMm - marksAllowance;
  const questionLines = estimateWrappedLines(block.displayText, questionWidthMm - numberAllowance, { fontSizePt: 10.5 });
  const questionMm = Math.max(6.2, questionLines * 5.25 + 1.5);
  const modelWidthMm = model ? (beside ? Math.max(26, innerWidthMm * 0.5 - 2) : innerWidthMm) : 0;
  const modelBox = estimateModelBox(model, modelWidthMm);
  warnings.push(...modelBox.warnings);
  const responseMm = responseHeightMm(block.response, density);
  const gapMm = density === 'compact' ? 2.2 : density === 'spacious' ? 4 : 3;
  let coreMm;
  if (!model) coreMm = questionMm;
  else if (beside) coreMm = Math.max(questionMm, modelBox.heightMm);
  else coreMm = questionMm + gapMm + modelBox.heightMm;

  let teacherMm = 0;
  if (outputView === 'teacher') {
    if (block.teacher?.answer != null && String(block.teacher.answer).length) {
      teacherMm += 5.5 * estimateWrappedLines(`Answer: ${block.teacher.answer}`, innerWidthMm, { fontSizePt: 9 });
    }
    if (block.teacher?.notes) {
      teacherMm += 4.8 * estimateWrappedLines(block.teacher.notes, innerWidthMm, { fontSizePt: 8.5 });
    }
    if (teacherMm) teacherMm += 2;
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

  const paddingMm = density === 'compact' ? 3 : density === 'spacious' ? 5 : 4;
  const heightMm = paddingMm * 2 + coreMm + (responseMm ? gapMm + responseMm : 0) + teacherMm;
  return {
    blockId: block.id,
    heightMm: Math.round(heightMm * 100) / 100,
    widthMm: availableWidthMm,
    indivisible: true,
    breakdown: {
      paddingMm,
      questionMm,
      modelMm: modelBox.heightMm,
      responseMm,
      teacherMm,
      position,
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

/**
 * Paginate without mutating the worksheet. A placement is always for a complete
 * block; no question, model, or response area is ever split between pages.
 */
export function paginateWorksheet(worksheet, options = {}) {
  if (!worksheet || !Array.isArray(worksheet.blocks)) {
    throw new TypeError('paginateWorksheet requires a worksheet with an ordered blocks array.');
  }
  const geometry = getPageGeometry(worksheet, options);
  const density = worksheet.settings?.density ?? 'standard';
  const outputView = options.outputView ?? worksheet.outputView ?? 'pupil';
  const blockGapMm = finiteNumber(options.blockGapMm,
    PAGINATION_DEFAULTS.blockGapMm * (DENSITY_SCALE[density] ?? 1));
  const manualBreaks = new Set([
    ...(worksheet.pageArrangement?.manualBreakBefore ?? []),
    ...worksheet.blocks.filter((block) => block.layout?.manualBreakBefore).map((block) => block.id),
  ]);
  const pages = [];
  const placements = {};
  const warnings = [];
  let page = createPage(1, geometry, worksheet, options);
  pages.push(page);
  let columnIndex = 0;
  let cursorY = page.bodyTopMm;

  function newPage() {
    page = createPage(pages.length + 1, geometry, worksheet, options);
    pages.push(page);
    columnIndex = 0;
    cursorY = page.bodyTopMm;
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
    const block = worksheet.blocks[index];
    const wantsFullWidth = geometry.columns === 2 && (
      block.layout?.columnSpan === 'full' || block.model?.metadata?.requiresFullWidth === true
    );
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

    if (wantsFullWidth && pageHasItems()) newPage();
    if (wantsFullWidth) {
      columnIndex = 0;
      cursorY = page.bodyTopMm;
    }

    let widthMm = wantsFullWidth ? geometry.contentWidthMm : geometry.columnWidthMm;
    let measurement = measureQuestionBlock(block, widthMm, { density, outputView });

    // Keep a heading/instruction with its next block where this is possible.
    if (block.layout?.keepWithNext && worksheet.blocks[index + 1]) {
      const nextMeasurement = measureQuestionBlock(worksheet.blocks[index + 1], widthMm, { density, outputView });
      if (measurement.heightMm + blockGapMm + nextMeasurement.heightMm > remainingHeight() && currentColumnHasItems()) {
        advanceColumnOrPage();
      }
    }

    if (measurement.heightMm > remainingHeight() + PAGINATION_DEFAULTS.minimumRemainingMm) {
      if (currentColumnHasItems() || pageHasItems() && wantsFullWidth) {
        if (wantsFullWidth) newPage();
        else advanceColumnOrPage();
      } else if (page.number === 1 && measurement.heightMm <= geometry.contentHeightMm - page.footerHeightMm) {
        // A large intact block may not fit below the title but can fit safely on page 2.
        newPage();
      }
      widthMm = wantsFullWidth ? geometry.contentWidthMm : geometry.columnWidthMm;
      measurement = measureQuestionBlock(block, widthMm, { density, outputView });
    }

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

    if (wantsFullWidth) {
      // Further two-column content begins below the spanning item.
      for (const column of page.columns) column.usedHeightMm = cursorY - page.bodyTopMm;
      columnIndex = 0;
    }
  }

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
    currentPage.warnings = dedupeWarnings(currentPage.warnings);
  }

  const finalWarnings = dedupeWarnings(warnings);
  return {
    geometry,
    outputView,
    pages,
    placements,
    pageCount: pages.length,
    warnings: finalWarnings,
    hasOverflow: finalWarnings.some((warning) => warning.code === 'block-overcrowded'),
    hasAnswerRevealRisk: finalWarnings.some((warning) => warning.code === 'assessment-answer-reveal'),
    tooSmallModelBlockIds: finalWarnings
      .filter((warning) => warning.code === 'model-too-small')
      .map((warning) => warning.blockId),
    blocksWithoutResponseSpace: finalWarnings
      .filter((warning) => warning.code === 'no-meaningful-response-space')
      .map((warning) => warning.blockId),
  };
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
