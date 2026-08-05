import {
  BLOCK_FOOTPRINTS,
  QUESTION_BLOCK_PATTERNS,
  WORKING_SPACE_TYPES,
  normaliseArchitecture,
  normalisePurpose,
  presetSettings,
  purposeToIntent,
} from './worksheet-architecture.js?v=release-v5';
import {
  createPresetVariant,
  createVariant,
  deriveVersionOverrides,
  normaliseVersions,
  resolveWorksheetVersion,
} from './worksheet-versions.js?v=release-v5';

/**
 * Maths Page Studio worksheet state.
 *
 * The module deliberately has no DOM dependency. It can be used by the browser
 * application, Node-based tests, or a future recipe exchange layer.
 */

export const WORKSHEET_SCHEMA = 'maths-page-studio/worksheet';
export const WORKSHEET_VERSION = 3;
export const STORAGE_PREFIX = 'maths-page-studio';
export const PROJECT_INDEX_KEY = `${STORAGE_PREFIX}:projects:v${WORKSHEET_VERSION}`;
const LEGACY_PROJECT_INDEX_KEYS = Object.freeze([
  `${STORAGE_PREFIX}:projects:v2`,
  `${STORAGE_PREFIX}:projects:v1`,
]);
export const CURRENT_PROJECT_KEY = `${STORAGE_PREFIX}:current-project`;

const VALID_INTENTS = new Set(['practice', 'homework', 'assessment']);
const VALID_OUTPUT_VIEWS = new Set(['pupil', 'teacher', 'answer']);
const VALID_BLOCK_KINDS = new Set(['question', 'heading', 'instruction']);
const VALID_MODEL_STATES = new Set(['blank', 'partly-completed', 'completed']);
const VALID_MODEL_PURPOSES = new Set([
  'question-information',
  'thinking-model',
  'response-model',
  'worked-example',
]);
const VALID_MODEL_SIZES = new Set(['compact', 'standard', 'large', 'extra-large']);
const VALID_MODEL_POSITIONS = new Set(['above', 'beside', 'beneath']);
const VALID_BUILD2_SCAFFOLD_STATES = new Set(['blank', 'guided', 'modelled']);
const VALID_STYLE_PRESETS = new Set(['calm', 'clear', 'compact', 'guided', 'assessment', 'homework']);
const VALID_RESPONSE_TYPES = new Set([
  ...WORKING_SPACE_TYPES,
]);
const VALID_RESPONSE_SIZES = new Set(['small', 'compact', 'medium', 'standard', 'large', 'generous']);

export const DEFAULT_GLOBAL_SETTINGS = Object.freeze({
  accentColor: '#4f568f',
  colorMode: 'colour',
  columns: 1,
  density: 'standard',
  typeface: 'system',
  showNameField: true,
  showDateField: true,
  showClassField: false,
  questionNumbering: true,
  pageNumbers: true,
  workingSpaceStyle: 'lines',
  pageSize: 'A4',
  orientation: 'portrait',
  marginMm: 12,
  stylePreset: 'calm',
  sectionStyle: 'line',
  bodyScale: 'standard',
  lineWeight: 'light',
  showMarks: false,
  totalMarks: null,
  duplexPlan: 'single-sided',
});

export const DEFAULT_PAGE_ARRANGEMENT = Object.freeze({
  manualBreakBefore: [],
  pageOverrides: {},
});

let fallbackIdCounter = 0;

const MODEL_FAMILY_ALIASES = Object.freeze({
  'place-value-chart': 'place-value',
  'base-ten-dienes': 'base-ten',
  'partitioning-frame': 'partition',
  'part-whole-bar': 'part-whole',
  'equal-groups-array': 'equal-groups',
  'multiplication-grid': 'area-model',
});

function defaultNow() {
  return new Date().toISOString();
}

export function createId(prefix = 'item') {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID === 'function') {
    return `${prefix}_${randomUUID.call(globalThis.crypto)}`;
  }
  fallbackIdCounter += 1;
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 9);
  return `${prefix}_${time}_${fallbackIdCounter.toString(36)}_${random}`;
}

export function reorderInsertionIndex(sourceIndex, targetIndex, insertAfter = false) {
  if (!Number.isInteger(sourceIndex) || !Number.isInteger(targetIndex) || sourceIndex < 0 || targetIndex < 0) return -1;
  return targetIndex + (insertAfter ? 1 : 0) - (sourceIndex < targetIndex ? 1 : 0);
}

export function cloneValue(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(cloneValue);
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) continue;
    output[key] = cloneValue(child);
  }
  return output;
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asText(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function oneOf(value, valid, fallback) {
  return valid.has(value) ? value : fallback;
}

function safeNumber(value, fallback = null) {
  // `Number(null)` is zero, but an omitted optional print dimension is not a
  // request for an 8 mm model. Keep absent values absent so pagination can
  // use the model family's safe print metrics.
  if (value === null || value === undefined || value === '') return fallback;
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === 'string'))];
}

function normaliseWarning(warning) {
  if (typeof warning === 'string') return { code: warning, severity: 'warning' };
  if (!warning || typeof warning !== 'object' || typeof warning.code !== 'string') return null;
  return {
    ...cloneValue(warning),
    code: warning.code,
    severity: ['info', 'warning', 'error'].includes(warning.severity) ? warning.severity : 'warning',
  };
}

function normaliseWarnings(warnings) {
  const byCode = new Map();
  for (const warning of Array.isArray(warnings) ? warnings : []) {
    const normalised = normaliseWarning(warning);
    if (normalised) byCode.set(normalised.code, normalised);
  }
  return [...byCode.values()];
}

export function createModelRecipe(family, overrides = {}) {
  if (!family) return null;
  const source = asObject(overrides);
  const canonicalFamily = MODEL_FAMILY_ALIASES[asText(family)] ?? asText(family);
  const requestedCompletionState = source.completionState ?? source.state;
  const completionState = requestedCompletionState === 'partial'
    ? 'partly-completed'
    : requestedCompletionState;
  const scaffoldState = source.scaffoldState
    ?? (completionState === 'completed' ? 'modelled' : completionState === 'blank' ? 'blank' : 'guided');
  const unit = typeof source.unit === 'string'
    ? source.unit
    : Array.isArray(source.units) ? asText(source.units[0]) : asText(source.units);
  const values = cloneValue(asObject(source.values));
  if (canonicalFamily === 'comparison-bar' && Array.isArray(values.quantities)) {
    values.greater ??= values.quantities[0];
    values.lesser ??= values.quantities[1];
  }
  if (canonicalFamily === 'equal-groups') {
    values.groups ??= values.groupCount;
  }
  const suppliedPrintHeight = safeNumber(source.printHeightMm);
  const suppliedPrintMinWidth = safeNumber(source.printMinWidthMm);
  return {
    recipeVersion: Math.max(1, safeNumber(source.recipeVersion, 1)),
    family: canonicalFamily,
    variant: source.variant ?? 'default',
    values,
    labels: cloneValue(asObject(source.labels)),
    unit,
    units: unit ? [unit] : [],
    unknown: source.unknown ?? null,
    hidden: uniqueStrings(source.hidden),
    scaffoldState: oneOf(scaffoldState, VALID_BUILD2_SCAFFOLD_STATES, 'guided'),
    linked: source.linked !== false,
    teacherChosen: Boolean(source.teacherChosen),
    completionState: oneOf(completionState, VALID_MODEL_STATES, 'blank'),
    purpose: oneOf(source.purpose, VALID_MODEL_PURPOSES, 'thinking-model'),
    size: oneOf(source.size, VALID_MODEL_SIZES, 'standard'),
    position: oneOf(source.position, VALID_MODEL_POSITIONS, 'beneath'),
    locked: source.locked == null ? Boolean(source.lockState) : Boolean(source.locked),
    lockState: asText(source.lockState, 'mathematical'),
    answerRevealRisk: source.answerRevealRisk == null ? null : Boolean(source.answerRevealRisk),
    worksheetIntent: source.worksheetIntent ?? null,
    sourceHasDiagram: Boolean(source.sourceHasDiagram),
    colorOnlyEncoding: Boolean(source.colorOnlyEncoding),
    // Older saves could contain `0` after an absent dimension was coerced
    // through Number(null). Zero is not a usable print size, so migrate it
    // back to the registry-controlled default.
    printHeightMm: suppliedPrintHeight && suppliedPrintHeight > 0 ? suppliedPrintHeight : null,
    printMinWidthMm: suppliedPrintMinWidth && suppliedPrintMinWidth > 0 ? suppliedPrintMinWidth : null,
    metadata: cloneValue(asObject(source.metadata)),
  };
}

export function normaliseModelRecipe(recipe) {
  if (!recipe || typeof recipe !== 'object' || !recipe.family) return null;
  return createModelRecipe(recipe.family, recipe);
}

export function createResponseRecipe(overrides = {}) {
  const source = asObject(overrides);
  return {
    type: oneOf(source.type, VALID_RESPONSE_TYPES, 'open-box'),
    size: oneOf(source.size, VALID_RESPONSE_SIZES, 'standard'),
    lines: safeNumber(source.lines),
    gridSizeMm: safeNumber(source.gridSizeMm, 5),
    label: asText(source.label),
    rows: Math.max(0, Math.min(20, safeNumber(source.rows, 0))),
    columns: Math.max(0, Math.min(8, safeNumber(source.columns, 0))),
    customRows: Math.max(0, Math.min(20, safeNumber(source.customRows, 0))),
    suggested: Boolean(source.suggested),
    teacherChosen: Boolean(source.teacherChosen),
  };
}

export function normaliseResponseRecipe(recipe) {
  return createResponseRecipe(recipe);
}

function normaliseComposition(value = {}) {
  const source = asObject(value);
  const footprint = source.footprint === 'half-width' ? 'half'
    : source.footprint === 'full-width' ? 'full'
      : source.footprint === 'full-page' ? 'page'
        : oneOf(source.footprint, new Set(BLOCK_FOOTPRINTS), 'standard');
  return {
    pattern: oneOf(source.pattern ?? source.blockType, new Set(QUESTION_BLOCK_PATTERNS), 'question-with-working'),
    footprint,
    keepTogether: source.keepTogether !== false,
    startOnNewPage: Boolean(source.startOnNewPage),
    keepWithNext: Boolean(source.keepWithNext),
    hint: asText(source.hint),
    vocabulary: uniqueStrings(source.vocabulary),
    sentenceStem: asText(source.sentenceStem),
    teacherChosen: Boolean(source.teacherChosen),
  };
}

export function createQuestionBlock(overrides = {}, options = {}) {
  const source = asObject(overrides);
  const idFactory = options.idFactory ?? createId;
  const originalText = asText(source.originalText ?? source.text);
  const displayText = asText(source.displayText, originalText);
  const suppliedKind = source.kind ?? source.type;
  const kindAlias = suppliedKind === 'section-heading'
    ? 'heading'
    : suppliedKind === 'shared-instruction' ? 'instruction' : suppliedKind;
  const kind = oneOf(kindAlias, VALID_BLOCK_KINDS, 'question');
  const layout = asObject(source.layout);
  const teacher = asObject(source.teacher);

  return {
    id: asText(source.id) || idFactory('question'),
    kind,
    originalText,
    displayText,
    number: kind === 'question' ? (source.number ?? source.questionNumber ?? null) : null,
    manualNumber: kind === 'question'
      ? (Object.hasOwn(source, 'manualNumber') ? source.manualNumber : source.number ?? source.questionNumber ?? null)
      : null,
    section: source.section ?? source.sectionId ?? null,
    sectionMeta: kind === 'heading'
      ? {
        role: ['fluency', 'guided-practice', 'independent-practice', 'reasoning', 'problem-solving', 'challenge', 'reflection', 'custom'].includes(source.sectionMeta?.role) ? source.sectionMeta.role : 'custom',
        style: ['inherit', 'plain', 'line', 'band', 'stage'].includes(source.sectionMeta?.style) ? source.sectionMeta.style : 'inherit',
        teacherChosen: Boolean(source.sectionMeta?.teacherChosen),
      }
      : null,
    marks: source.marks ?? null,
    extracted: cloneValue(asObject(source.extracted ?? source.extractedInfo ?? source.mathInfo)),
    source: {
      range: cloneValue(source.source?.range ?? source.sourceRange ?? null),
      label: source.source?.label ?? source.sourceLabel ?? null,
      marker: source.source?.marker ?? source.sourceMarker ?? null,
      sharedInstructionId: source.source?.sharedInstructionId ?? source.sharedInstructionId ?? null,
      markText: source.source?.markText ?? source.markText ?? null,
      subparts: cloneValue(source.source?.subparts ?? source.subparts ?? []),
    },
    model: normaliseModelRecipe(source.model ?? source.modelRecipe),
    response: normaliseResponseRecipe(source.response ?? source.responseRecipe),
    composition: normaliseComposition(source.composition ?? {
      blockType: source.blockType,
      footprint: source.footprint,
      keepTogether: source.keepTogether,
      startOnNewPage: source.startOnNewPage,
      keepWithNext: source.keepWithNext,
      hint: source.hint,
      vocabulary: source.vocabulary,
      sentenceStem: source.sentenceStem,
      teacherChosen: source.teacherChosen,
    }),
    layout: {
      size: oneOf(layout.size, VALID_MODEL_SIZES, 'standard'),
      modelPosition: oneOf(layout.modelPosition, VALID_MODEL_POSITIONS, 'beneath'),
      manualBreakBefore: Boolean(layout.manualBreakBefore),
      pageHint: safeNumber(layout.pageHint),
      columnSpan: ['full', 'half'].includes(layout.columnSpan) ? layout.columnSpan : 'auto',
      keepWithNext: Boolean(layout.keepWithNext),
    },
    warnings: normaliseWarnings(source.warnings),
    teacher: {
      answer: teacher.answer ?? null,
      notes: asText(teacher.notes),
      expectedMethod: asText(teacher.expectedMethod),
      misconception: asText(teacher.misconception),
      markingNote: asText(teacher.markingNote),
      completedModel: normaliseModelRecipe(teacher.completedModel),
    },
  };
}

export function normaliseQuestionBlock(block, options = {}) {
  return createQuestionBlock(block, options);
}

function defaultTitle(intent) {
  if (intent === 'homework') return 'Maths homework';
  if (intent === 'assessment') return 'Maths assessment';
  return 'Maths practice';
}

export function renumberBlocks(blocks, questionNumbering = true, numbering = {}) {
  const mode = numbering?.mode ?? 'automatic';
  const restartAtSections = Boolean(numbering?.restartAtSections);
  if (mode === 'manual' || !questionNumbering) {
    return blocks.map((block) => block.kind !== 'question'
      ? (block.number == null ? block : { ...block, number: null })
      : (mode === 'manual' ? { ...block, number: block.manualNumber ?? block.number ?? null } : { ...block, number: null }));
  }
  let nextNumber = 1;
  let currentSection = null;
  return blocks.map((block) => {
    if (block.kind !== 'question') return block.number == null ? block : { ...block, number: null };
    if (restartAtSections && block.section && block.section !== currentSection) nextNumber = 1;
    currentSection = block.section;
    const number = questionNumbering ? nextNumber : null;
    nextNumber += 1;
    return block.number === number ? block : { ...block, number };
  });
}

export function createWorksheet(overrides = {}, options = {}) {
  const source = asObject(overrides);
  const now = options.now?.() ?? source.metadata?.createdAt ?? defaultNow();
  const idFactory = options.idFactory ?? createId;
  const purpose = normalisePurpose(source.architecture?.purpose ?? source.purpose ?? source.intent, 'practice');
  const intent = purposeToIntent(purpose);
  const suppliedMetadata = asObject(source.metadata);
  const settings = {
    ...DEFAULT_GLOBAL_SETTINGS,
    ...cloneValue(asObject(source.settings ?? source.globalSettings)),
  };
  settings.columns = settings.columns === 2 ? 2 : 1;
  settings.orientation = settings.orientation === 'landscape' ? 'landscape' : 'portrait';
  settings.pageSize = 'A4';
  settings.marginMm = Math.min(25, Math.max(8, safeNumber(settings.marginMm, 12)));
  settings.margins = settings.margins && typeof settings.margins === 'object' && !Array.isArray(settings.margins)
    ? Object.fromEntries(['top', 'right', 'bottom', 'left'].map((edge) => [edge, Math.min(25, Math.max(8, safeNumber(settings.margins[edge], settings.marginMm)))]))
    : null;
  settings.accentColor = /^#[0-9a-f]{6}$/i.test(settings.accentColor) ? settings.accentColor : DEFAULT_GLOBAL_SETTINGS.accentColor;
  settings.colorMode = ['colour', 'monochrome'].includes(settings.colorMode) ? settings.colorMode : 'colour';
  settings.density = ['compact', 'standard', 'spacious'].includes(settings.density) ? settings.density : 'standard';
  settings.typeface = ['system', 'sans', 'rounded'].includes(settings.typeface) ? settings.typeface : 'system';
  settings.workingSpaceStyle = ['lines', 'grid', 'open'].includes(settings.workingSpaceStyle) ? settings.workingSpaceStyle : 'lines';
  settings.stylePreset = ['calm', 'clear', 'compact', 'guided', 'assessment', 'homework'].includes(settings.stylePreset) ? settings.stylePreset : 'calm';
  settings.sectionStyle = ['plain', 'line', 'band', 'stage'].includes(settings.sectionStyle) ? settings.sectionStyle : 'line';
  settings.bodyScale = ['small', 'standard', 'large'].includes(settings.bodyScale) ? settings.bodyScale : 'standard';
  settings.lineWeight = ['light', 'standard', 'strong'].includes(settings.lineWeight) ? settings.lineWeight : 'light';
  settings.duplexPlan = ['single-sided', 'double-sided'].includes(settings.duplexPlan) ? settings.duplexPlan : 'single-sided';
  settings.showNameField = typeof settings.showNameField === 'boolean' ? settings.showNameField : DEFAULT_GLOBAL_SETTINGS.showNameField;
  settings.showDateField = typeof settings.showDateField === 'boolean' ? settings.showDateField : DEFAULT_GLOBAL_SETTINGS.showDateField;
  settings.showClassField = typeof settings.showClassField === 'boolean' ? settings.showClassField : DEFAULT_GLOBAL_SETTINGS.showClassField;
  settings.questionNumbering = typeof settings.questionNumbering === 'boolean' ? settings.questionNumbering : DEFAULT_GLOBAL_SETTINGS.questionNumbering;
  settings.pageNumbers = typeof settings.pageNumbers === 'boolean' ? settings.pageNumbers : DEFAULT_GLOBAL_SETTINGS.pageNumbers;
  settings.showMarks = typeof settings.showMarks === 'boolean' ? settings.showMarks : DEFAULT_GLOBAL_SETTINGS.showMarks;
  const totalMarks = safeNumber(settings.totalMarks, null);
  settings.totalMarks = totalMarks == null ? null : Math.max(0, Math.min(999, totalMarks));

  const blocks = (Array.isArray(source.blocks) ? source.blocks : source.questionBlocks ?? [])
    .map((block) => normaliseQuestionBlock(block, { idFactory }));
  const metadataId = asText(suppliedMetadata.id ?? source.id) || idFactory('worksheet');
  const originalSource = source.originalImport ?? source.import ?? {};
  const originalRaw = typeof originalSource === 'string'
    ? originalSource
    : asText(originalSource.rawText ?? source.originalText);
  const pageSource = asObject(source.pageArrangement);
  const knownIds = new Set(blocks.map((block) => block.id));
  const manualBreakBefore = uniqueStrings(pageSource.manualBreakBefore)
    .filter((id) => knownIds.has(id));
  for (const block of blocks) {
    if (block.layout.manualBreakBefore && !manualBreakBefore.includes(block.id)) {
      manualBreakBefore.push(block.id);
    }
  }

  const architecture = normaliseArchitecture({ ...asObject(source.architecture), purpose }, blocks);
  const numberedBlocks = renumberBlocks(blocks, settings.questionNumbering, architecture.numbering);
  const metadata = {
    id: metadataId,
    name: asText(suppliedMetadata.name, asText(suppliedMetadata.title, defaultTitle(intent))),
    title: asText(suppliedMetadata.title, defaultTitle(intent)),
    topic: asText(suppliedMetadata.topic),
    learningIntention: asText(suppliedMetadata.learningIntention),
    successCriteria: asText(suppliedMetadata.successCriteria),
    teacher: asText(suppliedMetadata.teacher),
    shortInstruction: asText(suppliedMetadata.shortInstruction),
    className: asText(suppliedMetadata.className),
    createdAt: asText(suppliedMetadata.createdAt, now),
    updatedAt: asText(suppliedMetadata.updatedAt, now),
  };
  const versions = normaliseVersions(source.versions, { metadata }, { idFactory });

  return {
    schema: WORKSHEET_SCHEMA,
    version: WORKSHEET_VERSION,
    revision: Math.max(0, safeNumber(source.revision, 0)),
    migration: {
      createdWith: WORKSHEET_VERSION,
      migratedFrom: source.migration?.migratedFrom ?? null,
      migratedAt: source.migration?.migratedAt ?? null,
    },
    metadata,
    purpose,
    intent,
    outputView: oneOf(source.outputView ?? source.view, VALID_OUTPUT_VIEWS, 'pupil'),
    settings,
    architecture,
    versions,
    originalImport: {
      rawText: originalRaw,
      importedAt: originalSource.importedAt ?? (originalRaw ? now : null),
      source: originalSource.source ?? 'plain-text',
    },
    blocks: numberedBlocks,
    pageArrangement: {
      ...cloneValue(DEFAULT_PAGE_ARRANGEMENT),
      ...cloneValue(pageSource),
      manualBreakBefore,
      pageOverrides: cloneValue(asObject(pageSource.pageOverrides)),
    },
    printSettings: {
      selectedVersionId: asText(source.printSettings?.selectedVersionId, versions.activeId),
      includeAnswerPages: Boolean(source.printSettings?.includeAnswerPages),
      duplexPlan: ['single-sided', 'double-sided'].includes(source.printSettings?.duplexPlan) ? source.printSettings.duplexPlan : settings.duplexPlan,
    },
    warnings: normaliseWarnings(source.warnings),
  };
}

/** Upgrade unknown/legacy persisted data without mutating it. */
export function migrateWorksheet(input, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Worksheet data must be an object.');
  }
  const source = input;
  const fromVersion = safeNumber(source.version ?? source.schemaVersion, 0);
  if (Object.hasOwn(source, 'schema') && source.schema !== WORKSHEET_SCHEMA) {
    throw new Error('This data is not a Maths Page Studio worksheet.');
  }
  if (fromVersion > WORKSHEET_VERSION) {
    throw new Error(`Worksheet version ${fromVersion} is newer than supported version ${WORKSHEET_VERSION}.`);
  }
  if (fromVersion === WORKSHEET_VERSION) {
    const metadata = source.metadata;
    if (source.schema !== WORKSHEET_SCHEMA
      || !metadata || typeof metadata !== 'object' || Array.isArray(metadata)
      || typeof metadata.id !== 'string' || !metadata.id.trim()
      || !Array.isArray(source.blocks)) {
      throw new Error('The saved worksheet is incomplete or malformed.');
    }
  }

  // Version 0 covered early internal shapes (questionBlocks/globalSettings/rawText).
  const migrated = createWorksheet({
    ...cloneValue(source),
    settings: source.settings ?? source.globalSettings,
    originalImport: source.originalImport ?? {
      rawText: source.rawText ?? source.originalText ?? '',
      importedAt: source.importedAt ?? null,
      source: source.importSource ?? 'plain-text',
    },
    blocks: source.blocks ?? source.questionBlocks ?? [],
  }, options);

  if (fromVersion < WORKSHEET_VERSION) {
    migrated.migration = {
      createdWith: safeNumber(source.migration?.createdWith, Math.max(0, fromVersion)),
      migratedFrom: fromVersion,
      migratedAt: options.now?.() ?? defaultNow(),
    };
  }
  return migrated;
}

function tryMigrateWorksheet(input, options = {}) {
  try {
    return migrateWorksheet(input, options);
  } catch {
    // A newer or malformed local payload must never prevent the application
    // shell from opening. The stored value is left untouched so a newer build
    // or a future recovery tool can still read it.
    return null;
  }
}

function replaceBlockAt(blocks, index, replacement) {
  return [...blocks.slice(0, index), ...replacement, ...blocks.slice(index + 1)];
}

function mergeResponseRecipes(first, second) {
  const sizeRank = { compact: 0, standard: 1, generous: 2 };
  const firstRank = sizeRank[first?.size] ?? 1;
  const secondRank = sizeRank[second?.size] ?? 1;
  return cloneValue(firstRank >= secondRank ? first : second);
}

function mergeTeacherText(first, second) {
  const values = [first, second]
    .filter((value) => value != null && String(value).length)
    .map((value) => String(value));
  return [...new Set(values)].join('\n');
}

function mergeTeacherAnswer(first, second) {
  if (first == null || String(first).length === 0) return cloneValue(second ?? null);
  if (second == null || String(second).length === 0) return cloneValue(first);
  if (String(first) === String(second)) return cloneValue(first);
  return `${first}\n${second}`;
}

function replaceStructure(state, blocksInput, architectureInput, idFactory) {
  const blocks = (Array.isArray(blocksInput) ? blocksInput : [])
    .map((block) => normaliseQuestionBlock(block, { idFactory }));
  const architecture = normaliseArchitecture(architectureInput ?? state.architecture, blocks);
  const knownIds = new Set(blocks.map((block) => block.id));
  const manualBreakBefore = uniqueStrings([
    ...(state.pageArrangement?.manualBreakBefore ?? []),
    ...blocks.filter((block) => block.layout?.manualBreakBefore).map((block) => block.id),
  ]).filter((id) => knownIds.has(id));
  return {
    ...state,
    purpose: architecture.purpose,
    intent: purposeToIntent(architecture.purpose),
    architecture,
    blocks: renumberBlocks(blocks, state.settings.questionNumbering, architecture.numbering),
    pageArrangement: {
      ...state.pageArrangement,
      manualBreakBefore,
    },
  };
}

function refreshSafetyWarnings(worksheet) {
  const assessment = worksheet.intent === 'assessment';
  const blocks = worksheet.blocks.map((block) => {
    const retained = block.warnings.filter((warning) => warning.code !== 'assessment-answer-reveal');
    const model = block.model;
    const likelyLeak = assessment && model && (
      model.answerRevealRisk === true ||
      model.completionState === 'completed' ||
      model.purpose === 'worked-example'
    );
    if (likelyLeak) {
      retained.push({
        code: 'assessment-answer-reveal',
        severity: 'warning',
        message: 'This model may reveal part of the answer in an assessment.',
      });
    }
    return retained.length === block.warnings.length && retained.every((warning, i) => warning === block.warnings[i])
      ? block
      : { ...block, warnings: retained };
  });
  return blocks.every((block, index) => block === worksheet.blocks[index]) ? worksheet : { ...worksheet, blocks };
}

function finaliseChange(previous, next, action) {
  if (next === previous) return previous;
  const timestamp = action.timestamp ?? previous.metadata.updatedAt;
  const changed = {
    ...next,
    revision: previous.revision + 1,
    metadata: { ...next.metadata, updatedAt: timestamp },
  };
  return refreshSafetyWarnings(changed);
}

export const ActionTypes = Object.freeze({
  UPDATE_METADATA: 'worksheet/update-metadata',
  SET_PURPOSE: 'worksheet/set-purpose',
  SET_INTENT: 'worksheet/set-intent',
  SET_OUTPUT_VIEW: 'worksheet/set-output-view',
  UPDATE_SETTINGS: 'worksheet/update-settings',
  SET_ORIGINAL_IMPORT: 'worksheet/set-original-import',
  REPLACE_BLOCKS: 'worksheet/replace-blocks',
  REPLACE_STRUCTURE: 'worksheet/replace-structure',
  ADD_BLOCK: 'worksheet/add-block',
  UPDATE_BLOCK: 'worksheet/update-block',
  SET_MODEL: 'worksheet/set-model',
  UPDATE_MODEL: 'worksheet/update-model',
  SET_RESPONSE: 'worksheet/set-response',
  REORDER_BLOCK: 'worksheet/reorder-block',
  DUPLICATE_BLOCK: 'worksheet/duplicate-block',
  REMOVE_BLOCK: 'worksheet/remove-block',
  SPLIT_BLOCK: 'worksheet/split-block',
  JOIN_BLOCK: 'worksheet/join-block',
  SET_MANUAL_BREAK: 'worksheet/set-manual-break',
  UPDATE_PAGE_ARRANGEMENT: 'worksheet/update-page-arrangement',
  UPDATE_ARCHITECTURE: 'worksheet/update-architecture',
  APPLY_STYLE_PRESET: 'worksheet/apply-style-preset',
  UPDATE_PRINT_SETTINGS: 'worksheet/update-print-settings',
  SET_ACTIVE_VERSION: 'worksheet/set-active-version',
  CREATE_VERSION: 'worksheet/create-version',
  UPDATE_VERSION: 'worksheet/update-version',
  REMOVE_VERSION: 'worksheet/remove-version',
  RESET_VERSION_BLOCK: 'worksheet/reset-version-block',
  APPLY_VERSION_ACTION: 'worksheet/apply-version-action',
});

export const worksheetActions = Object.freeze({
  updateMetadata: (patch) => ({ type: ActionTypes.UPDATE_METADATA, patch }),
  setPurpose: (purpose) => ({ type: ActionTypes.SET_PURPOSE, purpose }),
  setIntent: (intent) => ({ type: ActionTypes.SET_INTENT, intent }),
  setOutputView: (view) => ({ type: ActionTypes.SET_OUTPUT_VIEW, view }),
  updateSettings: (patch) => ({ type: ActionTypes.UPDATE_SETTINGS, patch }),
  setOriginalImport: (rawText, details = {}) => ({
    type: ActionTypes.SET_ORIGINAL_IMPORT,
    originalImport: { ...details, rawText },
  }),
  replaceBlocks: (blocks) => ({ type: ActionTypes.REPLACE_BLOCKS, blocks }),
  replaceStructure: (blocks, architecture, options = {}) => ({
    type: ActionTypes.REPLACE_STRUCTURE,
    blocks,
    architecture,
    ...(VALID_STYLE_PRESETS.has(options?.stylePreset) ? { stylePreset: options.stylePreset } : {}),
  }),
  addBlock: (block, index) => ({ type: ActionTypes.ADD_BLOCK, block, index }),
  updateBlock: (blockId, patch) => ({ type: ActionTypes.UPDATE_BLOCK, blockId, patch }),
  setModel: (blockId, model) => ({ type: ActionTypes.SET_MODEL, blockId, model }),
  updateModel: (blockId, patch) => ({ type: ActionTypes.UPDATE_MODEL, blockId, patch }),
  setResponse: (blockId, response) => ({ type: ActionTypes.SET_RESPONSE, blockId, response }),
  reorderBlock: (blockId, toIndex) => ({ type: ActionTypes.REORDER_BLOCK, blockId, toIndex }),
  duplicateBlock: (blockId, newId) => ({ type: ActionTypes.DUPLICATE_BLOCK, blockId, newId }),
  removeBlock: (blockId) => ({ type: ActionTypes.REMOVE_BLOCK, blockId }),
  splitBlock: (blockId, offsetOrParts, newIds) => ({
    type: ActionTypes.SPLIT_BLOCK,
    blockId,
    ...(Array.isArray(offsetOrParts) ? { parts: offsetOrParts } : { offset: offsetOrParts }),
    newIds,
  }),
  joinBlock: (blockId, direction = 'next') => ({ type: ActionTypes.JOIN_BLOCK, blockId, direction }),
  setManualBreak: (blockId, enabled = true) => ({ type: ActionTypes.SET_MANUAL_BREAK, blockId, enabled }),
  updatePageArrangement: (patch) => ({ type: ActionTypes.UPDATE_PAGE_ARRANGEMENT, patch }),
  updateArchitecture: (patch) => ({ type: ActionTypes.UPDATE_ARCHITECTURE, patch }),
  applyStylePreset: (preset) => ({ type: ActionTypes.APPLY_STYLE_PRESET, preset }),
  updatePrintSettings: (patch) => ({ type: ActionTypes.UPDATE_PRINT_SETTINGS, patch }),
  setActiveVersion: (versionId) => ({ type: ActionTypes.SET_ACTIVE_VERSION, versionId }),
  createVersion: (options) => ({ type: ActionTypes.CREATE_VERSION, options }),
  updateVersion: (versionId, patch) => ({ type: ActionTypes.UPDATE_VERSION, versionId, patch }),
  removeVersion: (versionId) => ({ type: ActionTypes.REMOVE_VERSION, versionId }),
  resetVersionBlock: (versionId, blockId) => ({ type: ActionTypes.RESET_VERSION_BLOCK, versionId, blockId }),
  applyVersionAction: (versionId, action) => ({ type: ActionTypes.APPLY_VERSION_ACTION, versionId, action }),
});

export function worksheetReducer(state, action, options = {}) {
  if (!state || typeof state !== 'object') throw new TypeError('worksheetReducer requires a worksheet state.');
  if (!action || typeof action.type !== 'string') return state;
  const idFactory = options.idFactory ?? createId;
  let next = state;

  switch (action.type) {
    case ActionTypes.UPDATE_METADATA: {
      const patch = asObject(action.patch);
      const allowed = ['name', 'title', 'topic', 'learningIntention', 'successCriteria', 'teacher', 'shortInstruction', 'className'];
      const metadataPatch = {};
      for (const key of allowed) if (key in patch) metadataPatch[key] = asText(patch[key]);
      if (!Object.keys(metadataPatch).length) break;
      next = { ...state, metadata: { ...state.metadata, ...metadataPatch } };
      break;
    }
    case ActionTypes.SET_PURPOSE: {
      const purpose = normalisePurpose(action.purpose, null);
      if (!purpose || purpose === state.purpose) break;
      next = {
        ...state,
        purpose,
        intent: purposeToIntent(purpose),
        architecture: normaliseArchitecture({ ...state.architecture, purpose }, state.blocks),
      };
      break;
    }
    case ActionTypes.SET_INTENT: {
      const intent = oneOf(action.intent, VALID_INTENTS, null);
      if (!intent || intent === state.intent) break;
      next = {
        ...state,
        intent,
        purpose: intent,
        architecture: normaliseArchitecture({ ...state.architecture, purpose: intent }, state.blocks),
      };
      break;
    }
    case ActionTypes.SET_OUTPUT_VIEW: {
      const outputView = oneOf(action.view, VALID_OUTPUT_VIEWS, null);
      if (!outputView || outputView === state.outputView) break;
      next = { ...state, outputView };
      break;
    }
    case ActionTypes.UPDATE_SETTINGS: {
      const patch = asObject(action.patch);
      const settings = { ...state.settings, ...cloneValue(patch) };
      settings.columns = settings.columns === 2 ? 2 : 1;
      settings.pageSize = 'A4';
      settings.orientation = settings.orientation === 'landscape' ? 'landscape' : 'portrait';
      settings.marginMm = Math.min(25, Math.max(8, safeNumber(settings.marginMm, 12)));
      settings.margins = settings.margins && typeof settings.margins === 'object' && !Array.isArray(settings.margins)
        ? Object.fromEntries(['top', 'right', 'bottom', 'left'].map((edge) => [edge, Math.min(25, Math.max(8, safeNumber(settings.margins[edge], settings.marginMm)))]))
        : null;
      settings.accentColor = /^#[0-9a-f]{6}$/i.test(settings.accentColor) ? settings.accentColor : state.settings.accentColor;
      settings.colorMode = ['colour', 'monochrome'].includes(settings.colorMode) ? settings.colorMode : state.settings.colorMode;
      settings.density = ['compact', 'standard', 'spacious'].includes(settings.density) ? settings.density : state.settings.density;
      settings.typeface = ['system', 'sans', 'rounded'].includes(settings.typeface) ? settings.typeface : state.settings.typeface;
      settings.workingSpaceStyle = ['lines', 'grid', 'open'].includes(settings.workingSpaceStyle) ? settings.workingSpaceStyle : state.settings.workingSpaceStyle;
      settings.stylePreset = ['calm', 'clear', 'compact', 'guided', 'assessment', 'homework'].includes(settings.stylePreset) ? settings.stylePreset : state.settings.stylePreset;
      settings.sectionStyle = ['plain', 'line', 'band', 'stage'].includes(settings.sectionStyle) ? settings.sectionStyle : 'line';
      settings.bodyScale = ['small', 'standard', 'large'].includes(settings.bodyScale) ? settings.bodyScale : 'standard';
      settings.lineWeight = ['light', 'standard', 'strong'].includes(settings.lineWeight) ? settings.lineWeight : 'light';
      settings.duplexPlan = ['single-sided', 'double-sided'].includes(settings.duplexPlan) ? settings.duplexPlan : 'single-sided';
      settings.showNameField = typeof settings.showNameField === 'boolean' ? settings.showNameField : state.settings.showNameField;
      settings.showDateField = typeof settings.showDateField === 'boolean' ? settings.showDateField : state.settings.showDateField;
      settings.showClassField = typeof settings.showClassField === 'boolean' ? settings.showClassField : state.settings.showClassField;
      settings.questionNumbering = typeof settings.questionNumbering === 'boolean' ? settings.questionNumbering : state.settings.questionNumbering;
      settings.pageNumbers = typeof settings.pageNumbers === 'boolean' ? settings.pageNumbers : state.settings.pageNumbers;
      settings.showMarks = typeof settings.showMarks === 'boolean' ? settings.showMarks : state.settings.showMarks;
      const totalMarks = safeNumber(settings.totalMarks, null);
      settings.totalMarks = totalMarks == null ? null : Math.max(0, Math.min(999, totalMarks));
      let blocks = state.blocks;
      if (settings.questionNumbering !== state.settings.questionNumbering) {
        blocks = renumberBlocks(blocks, Boolean(settings.questionNumbering), state.architecture?.numbering);
      }
      next = { ...state, settings, blocks };
      break;
    }
    case ActionTypes.SET_ORIGINAL_IMPORT: {
      const imported = asObject(action.originalImport);
      next = {
        ...state,
        originalImport: {
          rawText: asText(imported.rawText),
          importedAt: imported.importedAt ?? action.timestamp ?? state.metadata.updatedAt,
          source: imported.source ?? 'plain-text',
        },
      };
      break;
    }
    case ActionTypes.REPLACE_BLOCKS: {
      next = replaceStructure(state, action.blocks, state.architecture, idFactory);
      break;
    }
    case ActionTypes.REPLACE_STRUCTURE: {
      next = replaceStructure(state, action.blocks, action.architecture, idFactory);
      if (VALID_STYLE_PRESETS.has(action.stylePreset)) {
        next = {
          ...next,
          settings: {
            ...next.settings,
            ...presetSettings(action.stylePreset),
            stylePreset: action.stylePreset,
          },
          architecture: {
            ...next.architecture,
            stylePreset: action.stylePreset,
          },
        };
      }
      break;
    }
    case ActionTypes.ADD_BLOCK: {
      const block = normaliseQuestionBlock(action.block, { idFactory });
      const requested = Number.isInteger(action.index) ? action.index : state.blocks.length;
      const index = Math.max(0, Math.min(state.blocks.length, requested));
      const blocks = [...state.blocks.slice(0, index), block, ...state.blocks.slice(index)];
      next = { ...state, blocks: renumberBlocks(blocks, state.settings.questionNumbering, state.architecture?.numbering) };
      break;
    }
    case ActionTypes.UPDATE_BLOCK: {
      const index = state.blocks.findIndex((block) => block.id === action.blockId);
      if (index < 0) break;
      const current = state.blocks[index];
      const patch = cloneValue(asObject(action.patch));
      // Identity is stable; recipes use their dedicated safe normalisers.
      delete patch.id;
      const candidate = {
        ...current,
        ...patch,
        id: current.id,
        model: 'model' in patch ? normaliseModelRecipe(patch.model) : current.model,
        response: 'response' in patch ? normaliseResponseRecipe(patch.response) : current.response,
        composition: patch.composition ? { ...current.composition, ...patch.composition } : current.composition,
        layout: patch.layout ? { ...current.layout, ...patch.layout } : current.layout,
        sectionMeta: patch.sectionMeta ? { ...current.sectionMeta, ...patch.sectionMeta } : current.sectionMeta,
        warnings: patch.warnings ? normaliseWarnings(patch.warnings) : current.warnings,
        teacher: patch.teacher ? { ...current.teacher, ...patch.teacher } : current.teacher,
      };
      const block = normaliseQuestionBlock(candidate, { idFactory: () => current.id });
      const blocks = [...state.blocks];
      blocks[index] = block;
      next = { ...state, blocks: renumberBlocks(blocks, state.settings.questionNumbering, state.architecture?.numbering) };
      break;
    }
    case ActionTypes.SET_MODEL: {
      const index = state.blocks.findIndex((block) => block.id === action.blockId);
      if (index < 0) break;
      const blocks = [...state.blocks];
      const model = normaliseModelRecipe(action.model);
      blocks[index] = {
        ...blocks[index],
        model,
        layout: model ? { ...blocks[index].layout, modelPosition: model.position } : blocks[index].layout,
      };
      next = { ...state, blocks };
      break;
    }
    case ActionTypes.UPDATE_MODEL: {
      const index = state.blocks.findIndex((block) => block.id === action.blockId);
      if (index < 0 || !state.blocks[index].model) break;
      const blocks = [...state.blocks];
      const model = normaliseModelRecipe({ ...blocks[index].model, ...cloneValue(asObject(action.patch)) });
      blocks[index] = {
        ...blocks[index],
        model,
        layout: { ...blocks[index].layout, modelPosition: model.position },
      };
      next = { ...state, blocks };
      break;
    }
    case ActionTypes.SET_RESPONSE: {
      const index = state.blocks.findIndex((block) => block.id === action.blockId);
      if (index < 0) break;
      const blocks = [...state.blocks];
      blocks[index] = { ...blocks[index], response: normaliseResponseRecipe(action.response) };
      next = { ...state, blocks };
      break;
    }
    case ActionTypes.REORDER_BLOCK: {
      const fromIndex = state.blocks.findIndex((block) => block.id === action.blockId);
      if (fromIndex < 0 || !Number.isInteger(action.toIndex)) break;
      const toIndex = Math.max(0, Math.min(state.blocks.length - 1, action.toIndex));
      if (fromIndex === toIndex) break;
      const blocks = [...state.blocks];
      const [block] = blocks.splice(fromIndex, 1);
      blocks.splice(toIndex, 0, block);
      next = { ...state, blocks: renumberBlocks(blocks, state.settings.questionNumbering, state.architecture?.numbering) };
      break;
    }
    case ActionTypes.DUPLICATE_BLOCK: {
      const index = state.blocks.findIndex((block) => block.id === action.blockId);
      if (index < 0) break;
      const copy = cloneValue(state.blocks[index]);
      copy.id = asText(action.newId) || idFactory('question');
      copy.layout.manualBreakBefore = false;
      const blocks = [...state.blocks.slice(0, index + 1), copy, ...state.blocks.slice(index + 1)];
      next = { ...state, blocks: renumberBlocks(blocks, state.settings.questionNumbering, state.architecture?.numbering) };
      break;
    }
    case ActionTypes.REMOVE_BLOCK: {
      if (!state.blocks.some((block) => block.id === action.blockId)) break;
      const blocks = state.blocks.filter((block) => block.id !== action.blockId);
      next = {
        ...state,
        blocks: renumberBlocks(blocks, state.settings.questionNumbering, state.architecture?.numbering),
        pageArrangement: {
          ...state.pageArrangement,
          manualBreakBefore: state.pageArrangement.manualBreakBefore.filter((id) => id !== action.blockId),
        },
      };
      break;
    }
    case ActionTypes.SPLIT_BLOCK: {
      const index = state.blocks.findIndex((block) => block.id === action.blockId);
      if (index < 0) break;
      const current = state.blocks[index];
      let parts = Array.isArray(action.parts)
        ? action.parts.map((part) => asText(part)).filter((part) => part.trim().length)
        : null;
      if (!parts) {
        const offset = Number(action.offset);
        if (!Number.isInteger(offset) || offset <= 0 || offset >= current.displayText.length) break;
        parts = [current.displayText.slice(0, offset), current.displayText.slice(offset)]
          .map((part) => part.trim())
          .filter(Boolean);
      }
      if (parts.length < 2) break;
      const suppliedIds = Array.isArray(action.newIds) ? action.newIds : [];
      const replacements = parts.map((part, partIndex) => {
        const block = cloneValue(current);
        block.id = partIndex === 0 ? current.id : (asText(suppliedIds[partIndex - 1]) || idFactory('question'));
        block.originalText = part;
        block.displayText = part;
        if (partIndex > 0) {
          block.marks = null;
          block.model = null;
          block.teacher = { answer: null, notes: '', completedModel: null };
          block.layout.manualBreakBefore = false;
          block.warnings = [];
        }
        return block;
      });
      const blocks = replaceBlockAt(state.blocks, index, replacements);
      next = { ...state, blocks: renumberBlocks(blocks, state.settings.questionNumbering, state.architecture?.numbering) };
      break;
    }
    case ActionTypes.JOIN_BLOCK: {
      const index = state.blocks.findIndex((block) => block.id === action.blockId);
      if (index < 0) break;
      const otherIndex = action.direction === 'previous' ? index - 1 : index + 1;
      if (otherIndex < 0 || otherIndex >= state.blocks.length) break;
      const firstIndex = Math.min(index, otherIndex);
      const secondIndex = Math.max(index, otherIndex);
      const first = state.blocks[firstIndex];
      const second = state.blocks[secondIndex];
      const modelConflict = first.model && second.model;
      const joined = {
        ...cloneValue(first),
        originalText: [first.originalText, second.originalText].filter(Boolean).join('\n'),
        displayText: [first.displayText, second.displayText].filter(Boolean).join('\n'),
        marks: first.marks ?? second.marks,
        model: cloneValue(first.model ?? second.model),
        response: mergeResponseRecipes(first.response, second.response),
        warnings: normaliseWarnings([
          ...first.warnings,
          ...second.warnings,
          ...(modelConflict ? [{
            code: 'joined-models-review',
            severity: 'warning',
            message: 'Two modelled questions were joined; review the retained model.',
          }] : []),
        ]),
        teacher: {
          answer: mergeTeacherAnswer(first.teacher.answer, second.teacher.answer),
          notes: mergeTeacherText(first.teacher.notes, second.teacher.notes),
          expectedMethod: mergeTeacherText(first.teacher.expectedMethod, second.teacher.expectedMethod),
          misconception: mergeTeacherText(first.teacher.misconception, second.teacher.misconception),
          markingNote: mergeTeacherText(first.teacher.markingNote, second.teacher.markingNote),
          completedModel: first.teacher.completedModel ?? second.teacher.completedModel,
        },
      };
      const blocks = [
        ...state.blocks.slice(0, firstIndex),
        joined,
        ...state.blocks.slice(secondIndex + 1),
      ];
      next = {
        ...state,
        blocks: renumberBlocks(blocks, state.settings.questionNumbering, state.architecture?.numbering),
        pageArrangement: {
          ...state.pageArrangement,
          manualBreakBefore: state.pageArrangement.manualBreakBefore.filter((id) => id !== second.id),
        },
      };
      break;
    }
    case ActionTypes.SET_MANUAL_BREAK: {
      const index = state.blocks.findIndex((block) => block.id === action.blockId);
      if (index < 0) break;
      const enabled = action.enabled !== false;
      const breakSet = new Set(state.pageArrangement.manualBreakBefore);
      if (enabled) breakSet.add(action.blockId);
      else breakSet.delete(action.blockId);
      const blocks = [...state.blocks];
      blocks[index] = {
        ...blocks[index],
        layout: { ...blocks[index].layout, manualBreakBefore: enabled },
      };
      next = {
        ...state,
        blocks,
        pageArrangement: { ...state.pageArrangement, manualBreakBefore: [...breakSet] },
      };
      break;
    }
    case ActionTypes.UPDATE_PAGE_ARRANGEMENT: {
      const patch = cloneValue(asObject(action.patch));
      const manualBreakBefore = 'manualBreakBefore' in patch
        ? uniqueStrings(patch.manualBreakBefore).filter((id) => state.blocks.some((block) => block.id === id))
        : state.pageArrangement.manualBreakBefore;
      next = {
        ...state,
        pageArrangement: {
          ...state.pageArrangement,
          ...patch,
          manualBreakBefore,
          pageOverrides: patch.pageOverrides
            ? cloneValue(asObject(patch.pageOverrides))
            : state.pageArrangement.pageOverrides,
        },
      };
      break;
    }
    case ActionTypes.UPDATE_ARCHITECTURE: {
      const architecture = normaliseArchitecture({ ...state.architecture, ...cloneValue(asObject(action.patch)) }, state.blocks);
      const blocks = renumberBlocks(state.blocks, state.settings.questionNumbering, architecture.numbering);
      next = { ...state, purpose: architecture.purpose, intent: purposeToIntent(architecture.purpose), architecture, blocks };
      break;
    }
    case ActionTypes.APPLY_STYLE_PRESET: {
      const preset = typeof action.preset === 'string' ? action.preset : 'calm';
      const presetPatch = presetSettings(preset);
      const settings = { ...state.settings, ...presetPatch, stylePreset: preset };
      const architecture = normaliseArchitecture({ ...state.architecture, stylePreset: preset }, state.blocks);
      next = { ...state, settings, architecture };
      break;
    }
    case ActionTypes.UPDATE_PRINT_SETTINGS: {
      const patch = asObject(action.patch);
      const printSettings = {
        ...state.printSettings,
        ...cloneValue(patch),
      };
      printSettings.duplexPlan = ['single-sided', 'double-sided'].includes(printSettings.duplexPlan) ? printSettings.duplexPlan : 'single-sided';
      printSettings.includeAnswerPages = Boolean(printSettings.includeAnswerPages);
      const knownVersions = new Set((state.versions?.items ?? []).map((version) => version.id));
      if (!knownVersions.has(printSettings.selectedVersionId)) printSettings.selectedVersionId = state.versions?.activeId ?? 'master';
      next = { ...state, printSettings };
      break;
    }
    case ActionTypes.SET_ACTIVE_VERSION: {
      const versions = normaliseVersions(state.versions, state, { idFactory });
      const version = versions.items.find((item) => item.id === action.versionId);
      if (!version || version.id === versions.activeId) break;
      next = {
        ...state,
        outputView: version.outputView ?? state.outputView,
        versions: { ...versions, activeId: version.id },
        printSettings: { ...state.printSettings, selectedVersionId: version.id },
      };
      break;
    }
    case ActionTypes.CREATE_VERSION: {
      const options = asObject(action.options);
      const versions = normaliseVersions(state.versions, state, { idFactory });
      const type = typeof options.type === 'string' ? options.type : 'custom';
      const version = options.preset === false
        ? createVariant(options.overrides, { ...options, now: action.timestamp, idFactory })
        : createPresetVariant(state, type, { ...options, now: action.timestamp, idFactory });
      if (versions.items.some((item) => item.id === version.id)) break;
      next = {
        ...state,
        outputView: version.outputView ?? state.outputView,
        versions: { activeId: version.id, items: [...versions.items, version] },
        printSettings: { ...state.printSettings, selectedVersionId: version.id },
      };
      break;
    }
    case ActionTypes.UPDATE_VERSION: {
      const versions = normaliseVersions(state.versions, state, { idFactory });
      const index = versions.items.findIndex((item) => item.id === action.versionId && item.id !== 'master');
      if (index < 0) break;
      const patch = asObject(action.patch);
      const current = versions.items[index];
      const updated = createVariant({ ...current.overrides, ...asObject(patch.overrides) }, {
        ...current,
        ...patch,
        id: current.id,
        now: current.createdAt,
        idFactory,
      });
      const items = [...versions.items];
      items[index] = updated;
      next = { ...state, versions: { ...versions, items } };
      break;
    }
    case ActionTypes.REMOVE_VERSION: {
      const versions = normaliseVersions(state.versions, state, { idFactory });
      if (action.versionId === 'master' || !versions.items.some((item) => item.id === action.versionId)) break;
      const items = versions.items.filter((item) => item.id !== action.versionId);
      const activeId = versions.activeId === action.versionId ? 'master' : versions.activeId;
      next = {
        ...state,
        versions: { activeId, items },
        outputView: activeId === 'master' ? 'pupil' : items.find((item) => item.id === activeId)?.outputView ?? state.outputView,
        printSettings: { ...state.printSettings, selectedVersionId: state.printSettings.selectedVersionId === action.versionId ? activeId : state.printSettings.selectedVersionId },
      };
      break;
    }
    case ActionTypes.RESET_VERSION_BLOCK: {
      const versions = normaliseVersions(state.versions, state, { idFactory });
      const index = versions.items.findIndex((item) => item.id === action.versionId && item.id !== 'master');
      if (index < 0 || !state.blocks.some((block) => block.id === action.blockId)) break;
      const current = versions.items[index];
      const overrides = cloneValue(current.overrides);
      delete overrides.blockPatches[action.blockId];
      overrides.hiddenBlockIds = overrides.hiddenBlockIds.filter((id) => id !== action.blockId);
      overrides.addedBlocks = overrides.addedBlocks.filter((block) => block.id !== action.blockId);
      if (Array.isArray(overrides.order)) overrides.order = overrides.order.filter((id) => id !== action.blockId);
      const items = [...versions.items];
      items[index] = { ...current, overrides };
      next = { ...state, versions: { ...versions, items } };
      break;
    }
    case ActionTypes.APPLY_VERSION_ACTION: {
      const versions = normaliseVersions(state.versions, state, { idFactory });
      const versionId = action.versionId ?? versions.activeId;
      const index = versions.items.findIndex((item) => item.id === versionId && item.id !== 'master');
      const inner = action.action;
      if (index < 0 || !inner || typeof inner.type !== 'string' || inner.type === ActionTypes.APPLY_VERSION_ACTION) break;
      const current = versions.items[index];
      const base = { ...state, versions };
      const effective = resolveWorksheetVersion(base, versionId);
      const adjusted = worksheetReducer(effective, { ...inner, timestamp: action.timestamp }, options);
      if (adjusted === effective) break;
      const overrides = deriveVersionOverrides(base, adjusted);
      // Workbook reconciliation metadata describes the master snapshot used
      // to create the linked format. Re-deriving sparse overrides for an
      // ordinary workbook edit must not discard that provenance, otherwise a
      // later master addition can cause deliberately reset blocks to be
      // compacted again.
      for (const key of ['workbookMasterBlockIds', 'workbookMasterBlockKinds', 'workbookAutoHiddenBlockIds']) {
        if (current.overrides?.[key] != null) overrides[key] = cloneValue(current.overrides[key]);
      }
      const items = [...versions.items];
      items[index] = { ...items[index], overrides };
      next = { ...state, versions: { ...versions, items } };
      break;
    }
    default:
      return state;
  }

  return finaliseChange(state, next, action);
}

function getDefaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function projectStorageKey(projectId) {
  return `${STORAGE_PREFIX}:project:${projectId}`;
}

function readJson(storage, key, fallback) {
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(storage, key, value) {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function readProjectIndex(storage = getDefaultStorage()) {
  const indexes = [PROJECT_INDEX_KEY, ...LEGACY_PROJECT_INDEX_KEYS]
    .map((key) => readJson(storage, key, []))
    .filter(Array.isArray);
  const byId = new Map();
  for (const index of indexes) {
    for (const entry of index) {
      if (!entry || typeof entry.id !== 'string') continue;
      const existing = byId.get(entry.id);
      if (!existing || String(entry.updatedAt ?? '').localeCompare(String(existing.updatedAt ?? '')) > 0) {
        byId.set(entry.id, entry);
      }
    }
  }
  return [...byId.values()];
}

function updateProjectIndex(storage, worksheet) {
  const existing = readProjectIndex(storage).filter((entry) => entry.id !== worksheet.metadata.id);
  const entry = {
    id: worksheet.metadata.id,
    name: worksheet.metadata.name || worksheet.metadata.title,
    title: worksheet.metadata.title,
    intent: worksheet.intent,
    blockCount: worksheet.blocks.length,
    createdAt: worksheet.metadata.createdAt,
    updatedAt: worksheet.metadata.updatedAt,
  };
  existing.push(entry);
  existing.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return writeJson(storage, PROJECT_INDEX_KEY, existing);
}

export function saveProject(worksheet, storage = getDefaultStorage(), options = {}) {
  if (!storage) return false;
  const normalised = tryMigrateWorksheet(worksheet);
  if (!normalised) return false;
  const saved = writeJson(storage, projectStorageKey(normalised.metadata.id), normalised);
  if (!saved) return false;
  const indexed = updateProjectIndex(storage, normalised);
  if (options.setCurrent !== false) {
    try {
      storage.setItem(CURRENT_PROJECT_KEY, normalised.metadata.id);
    } catch {
      // The project payload is still safely saved; current-project is convenience only.
    }
  }
  return indexed;
}

export function loadProject(projectId, storage = getDefaultStorage(), options = {}) {
  const project = readJson(storage, projectStorageKey(projectId), null);
  return project ? tryMigrateWorksheet(project, options) : null;
}

export function listProjects(storage = getDefaultStorage()) {
  return cloneValue(readProjectIndex(storage));
}

export function getCurrentProjectId(storage = getDefaultStorage()) {
  try {
    return storage?.getItem(CURRENT_PROJECT_KEY) ?? null;
  } catch {
    return null;
  }
}

export function loadCurrentProject(storage = getDefaultStorage(), options = {}) {
  const projectId = getCurrentProjectId(storage);
  return projectId ? loadProject(projectId, storage, options) : null;
}

/** Caller owns destructive-action confirmation. */
export function deleteProject(projectId, storage = getDefaultStorage()) {
  if (!storage || !projectId) return false;
  const projectKey = projectStorageKey(projectId);
  const trackedKeys = [PROJECT_INDEX_KEY, ...LEGACY_PROJECT_INDEX_KEYS, CURRENT_PROJECT_KEY, projectKey];
  const before = new Map();
  try {
    for (const key of trackedKeys) before.set(key, storage.getItem(key));
    const index = readProjectIndex(storage).filter((entry) => entry.id !== projectId);
    if (!writeJson(storage, PROJECT_INDEX_KEY, index)) return false;
    for (const key of LEGACY_PROJECT_INDEX_KEYS) {
      const legacy = readJson(storage, key, []);
      if (Array.isArray(legacy) && legacy.some((entry) => entry?.id === projectId)) {
        if (!writeJson(storage, key, legacy.filter((entry) => entry?.id !== projectId))) throw new Error('Could not update a legacy project index.');
      }
    }
    if (storage.getItem(CURRENT_PROJECT_KEY) === projectId) storage.removeItem(CURRENT_PROJECT_KEY);
    storage.removeItem(projectKey);
    if (storage.getItem(projectKey) != null) throw new Error('Project payload remains after deletion.');
    return true;
  } catch {
    // Best-effort rollback keeps a partially failed delete recoverable and
    // discoverable instead of losing the payload while reporting failure.
    for (const [key, value] of before) {
      try {
        if (value == null) storage.removeItem(key);
        else storage.setItem(key, value);
      } catch { /* the original failure is still reported to the caller */ }
    }
    return false;
  }
}

function remapId(value, idMap) {
  return typeof value === 'string' ? (idMap.get(value) ?? value) : value;
}

function remapIdList(values, idMap) {
  return (Array.isArray(values) ? values : []).map((value) => remapId(value, idMap));
}

function remapPageArrangementReferences(value, idMap) {
  const source = cloneValue(asObject(value));
  const pageOverrides = asObject(source.pageOverrides);
  return {
    ...source,
    manualBreakBefore: remapIdList(source.manualBreakBefore, idMap),
    pageOverrides: Object.fromEntries(Object.entries(pageOverrides).map(([id, override]) => [remapId(id, idMap), cloneValue(override)])),
  };
}

function remapArchitectureReferences(value, idMap) {
  const source = cloneValue(asObject(value));
  if (!Array.isArray(source.sections)) return source;
  return {
    ...source,
    sections: source.sections.map((section) => ({
      ...section,
      id: remapId(section.id, idMap),
      headingId: remapId(section.headingId, idMap),
      ...(Array.isArray(section.blockIds) ? { blockIds: remapIdList(section.blockIds, idMap) } : {}),
    })),
  };
}

function remapBlockReferences(block, idMap, { remapIdentity = true } = {}) {
  const copy = cloneValue(block);
  if (remapIdentity) copy.id = remapId(copy.id, idMap);
  copy.section = remapId(copy.section, idMap);
  if (copy.source && typeof copy.source === 'object') {
    copy.source.sharedInstructionId = remapId(copy.source.sharedInstructionId, idMap);
  }
  return copy;
}

function remapBlockPatchReferences(patch, idMap) {
  const copy = cloneValue(patch);
  if (!copy || typeof copy !== 'object' || Array.isArray(copy)) return copy;
  if (Object.hasOwn(copy, 'id')) copy.id = remapId(copy.id, idMap);
  if (Object.hasOwn(copy, 'section')) copy.section = remapId(copy.section, idMap);
  if (copy.source && typeof copy.source === 'object') {
    copy.source.sharedInstructionId = remapId(copy.source.sharedInstructionId, idMap);
  }
  return copy;
}

export function duplicateProject(sourceOrId, options = {}, storage = getDefaultStorage()) {
  const loaded = typeof sourceOrId === 'string' ? loadProject(sourceOrId, storage, options) : sourceOrId;
  const source = loaded ? tryMigrateWorksheet(loaded, options) : null;
  if (!source) return null;
  const idFactory = options.idFactory ?? createId;
  const now = options.now?.() ?? defaultNow();
  const duplicate = tryMigrateWorksheet(cloneValue(source), options);
  if (!duplicate) return null;
  duplicate.metadata.id = idFactory('worksheet');
  duplicate.metadata.name = options.name ?? `${source.metadata.name || source.metadata.title} copy`;
  duplicate.metadata.createdAt = now;
  duplicate.metadata.updatedAt = now;
  duplicate.revision = 0;
  const sourceVersions = normaliseVersions(source.versions, source, { idFactory });
  const idMap = new Map(source.blocks.map((block) => [block.id, idFactory('question')]));
  for (const version of sourceVersions.items) {
    for (const block of version.overrides?.addedBlocks ?? []) {
      if (typeof block?.id === 'string' && !idMap.has(block.id)) idMap.set(block.id, idFactory('question'));
    }
  }
  duplicate.blocks = source.blocks.map((block) => remapBlockReferences(block, idMap));
  duplicate.pageArrangement = remapPageArrangementReferences(source.pageArrangement, idMap);
  duplicate.architecture = remapArchitectureReferences(source.architecture, idMap);
  const versionIdMap = new Map();
  const copiedVersions = sourceVersions.items.map((version) => {
    if (version.id === 'master') return version;
    const nextId = idFactory('version');
    versionIdMap.set(version.id, nextId);
    const overrides = cloneValue(version.overrides);
    overrides.blockPatches = Object.fromEntries(Object.entries(overrides.blockPatches ?? {}).map(([id, patch]) => [remapId(id, idMap), remapBlockPatchReferences(patch, idMap)]));
    overrides.hiddenBlockIds = remapIdList(overrides.hiddenBlockIds, idMap);
    overrides.addedBlocks = (overrides.addedBlocks ?? []).map((block) => remapBlockReferences(block, idMap));
    overrides.order = Array.isArray(overrides.order) ? remapIdList(overrides.order, idMap) : null;
    overrides.workbookMasterBlockIds = Array.isArray(overrides.workbookMasterBlockIds)
      ? remapIdList(overrides.workbookMasterBlockIds, idMap)
      : null;
    overrides.workbookMasterBlockKinds = overrides.workbookMasterBlockKinds && typeof overrides.workbookMasterBlockKinds === 'object'
      ? Object.fromEntries(Object.entries(overrides.workbookMasterBlockKinds)
        .map(([id, kind]) => [remapId(id, idMap), kind]))
      : null;
    overrides.workbookAutoHiddenBlockIds = Array.isArray(overrides.workbookAutoHiddenBlockIds)
      ? remapIdList(overrides.workbookAutoHiddenBlockIds, idMap)
      : null;
    overrides.pageArrangement = remapPageArrangementReferences(overrides.pageArrangement, idMap);
    overrides.architecture = remapArchitectureReferences(overrides.architecture, idMap);
    return { ...version, id: nextId, overrides };
  });
  const activeVersionId = sourceVersions.activeId === 'master' ? 'master' : versionIdMap.get(sourceVersions.activeId) ?? 'master';
  duplicate.versions = { activeId: activeVersionId, items: copiedVersions };
  duplicate.printSettings = {
    ...duplicate.printSettings,
    selectedVersionId: source.printSettings?.selectedVersionId === 'master'
      ? 'master'
      : versionIdMap.get(source.printSettings?.selectedVersionId) ?? activeVersionId,
  };
  duplicate.blocks = renumberBlocks(duplicate.blocks, duplicate.settings.questionNumbering, duplicate.architecture.numbering);
  return saveProject(duplicate, storage, { setCurrent: false }) ? duplicate : null;
}

export function createNamedProject(options = {}, storage = getDefaultStorage()) {
  const worksheet = createWorksheet(options, options);
  saveProject(worksheet, storage);
  return worksheet;
}

/**
 * Small framework-neutral store with bounded snapshot history.
 * Autosave is immediate by default; pass autosaveDelay > 0 to debounce writes.
 */
export function createStore(initialWorksheet, options = {}) {
  const now = options.now ?? defaultNow;
  const idFactory = options.idFactory ?? createId;
  const historyLimit = Math.max(1, Number(options.historyLimit) || 100);
  const storage = options.storage === undefined ? getDefaultStorage() : options.storage;
  const autosave = options.autosave !== false;
  const autosaveDelay = Math.max(0, Number(options.autosaveDelay) || 0);
  const migratedInitial = initialWorksheet
    ? tryMigrateWorksheet(initialWorksheet, { now, idFactory })
    : null;
  const initialRecoveryFailed = Boolean(initialWorksheet && !migratedInitial);
  let state = migratedInitial ?? createWorksheet({}, { now, idFactory });
  let past = [];
  let future = [];
  const listeners = new Set();
  let saveTimer = null;
  let persistenceStatus = !autosave || !storage
    ? 'unavailable'
    : initialRecoveryFailed ? 'error' : 'saved';

  function notify(reason, action = null, details = {}) {
    for (const listener of [...listeners]) listener(state, {
      reason,
      action,
      canUndo: past.length > 0,
      canRedo: future.length > 0,
      persistenceStatus,
      persistenceOnly: false,
      ...details,
    });
  }

  function setPersistenceStatus(status) {
    if (status === persistenceStatus) return;
    persistenceStatus = status;
    notify('persistence', null, { persistenceOnly: true });
  }

  function completeSave() {
    let saved = false;
    try {
      saved = saveProject(state, storage);
    } catch {
      saved = false;
    }
    setPersistenceStatus(saved ? 'saved' : 'error');
    return saved;
  }

  function scheduleSave() {
    if (!autosave || !storage) {
      setPersistenceStatus('unavailable');
      return false;
    }
    setPersistenceStatus('saving');
    if (autosaveDelay === 0) {
      return completeSave();
    }
    if (saveTimer != null) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      completeSave();
    }, autosaveDelay);
    return true;
  }

  function commit(next, reason, action = null, recordHistory = true) {
    if (next === state) return false;
    if (recordHistory) {
      past.push(state);
      if (past.length > historyLimit) past = past.slice(-historyLimit);
      future = [];
    }
    state = next;
    notify(reason, action);
    scheduleSave();
    return true;
  }

  /**
   * Install a loaded or repaired worksheet as the new history baseline.
   *
   * This is intentionally separate from reducer dispatch: a migration is not
   * a teacher edit, and Undo must never be able to restore the stale payload it
   * replaced. Validation happens before history is cleared, so a malformed
   * replacement leaves both the current worksheet and its history untouched.
   */
  function replaceBaseline(nextWorksheet, reason = 'replace-baseline') {
    const next = tryMigrateWorksheet(nextWorksheet, { now, idFactory });
    if (!next) return false;
    past = [];
    future = [];
    return commit(next, reason, null, false);
  }

  const store = {
    getState: () => state,
    dispatch(action) {
      const stamped = action.timestamp ? action : { ...action, timestamp: now() };
      const next = worksheetReducer(state, stamped, { idFactory });
      commit(next, 'dispatch', stamped, true);
      return stamped;
    },
    undo() {
      if (!past.length) return false;
      const previous = past[past.length - 1];
      past = past.slice(0, -1);
      future = [state, ...future].slice(0, historyLimit);
      return commit(previous, 'undo', null, false);
    },
    redo() {
      if (!future.length) return false;
      const next = future[0];
      future = future.slice(1);
      past = [...past, state].slice(-historyLimit);
      return commit(next, 'redo', null, false);
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    getPersistenceStatus: () => persistenceStatus,
    subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('subscribe requires a function.');
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    flush() {
      if (saveTimer != null) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      if (!autosave || !storage) {
        setPersistenceStatus('unavailable');
        return false;
      }
      setPersistenceStatus('saving');
      return completeSave();
    },
    replaceBaseline(nextWorksheet) {
      return replaceBaseline(nextWorksheet);
    },
    replace(nextWorksheet, { clearHistory = true } = {}) {
      if (clearHistory) return replaceBaseline(nextWorksheet, 'replace');
      const next = tryMigrateWorksheet(nextWorksheet, { now, idFactory });
      return next ? commit(next, 'replace', null, true) : false;
    },
    load(projectId) {
      const loaded = loadProject(projectId, storage, { now, idFactory });
      if (!loaded) return false;
      past = [];
      future = [];
      return commit(loaded, 'load', null, false);
    },
    newProject(projectOptions = {}) {
      const fresh = createWorksheet(projectOptions, { now, idFactory });
      past = [];
      future = [];
      commit(fresh, 'new-project', null, false);
      return fresh;
    },
    duplicate(name) {
      const duplicate = duplicateProject(state, { name, now, idFactory }, storage);
      if (!duplicate) return null;
      past = [];
      future = [];
      commit(duplicate, 'duplicate-project', null, false);
      return duplicate;
    },
    destroy() {
      if (saveTimer != null) clearTimeout(saveTimer);
      listeners.clear();
    },
  };

  if (autosave && options.saveInitial === true) scheduleSave();
  return store;
}
