/**
 * Maths Page Studio worksheet state.
 *
 * The module deliberately has no DOM dependency. It can be used by the browser
 * application, Node-based tests, or a future recipe exchange layer.
 */

export const WORKSHEET_SCHEMA = 'maths-page-studio/worksheet';
export const WORKSHEET_VERSION = 1;
export const STORAGE_PREFIX = 'maths-page-studio';
export const PROJECT_INDEX_KEY = `${STORAGE_PREFIX}:projects:v${WORKSHEET_VERSION}`;
export const CURRENT_PROJECT_KEY = `${STORAGE_PREFIX}:current-project`;

const VALID_INTENTS = new Set(['practice', 'homework', 'assessment']);
const VALID_OUTPUT_VIEWS = new Set(['pupil', 'teacher']);
const VALID_BLOCK_KINDS = new Set(['question', 'heading', 'instruction']);
const VALID_MODEL_STATES = new Set(['blank', 'partly-completed', 'completed']);
const VALID_MODEL_PURPOSES = new Set([
  'question-information',
  'thinking-model',
  'response-model',
  'worked-example',
]);
const VALID_MODEL_SIZES = new Set(['compact', 'standard', 'large']);
const VALID_MODEL_POSITIONS = new Set(['above', 'beside', 'beneath']);
const VALID_RESPONSE_TYPES = new Set([
  'none',
  'short-answer',
  'short-line',
  'writing-lines',
  'squared-grid',
  'open-box',
  'model-completion',
]);
const VALID_RESPONSE_SIZES = new Set(['compact', 'standard', 'generous']);

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

export function cloneValue(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(cloneValue);
  const output = {};
  for (const [key, child] of Object.entries(value)) output[key] = cloneValue(child);
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
  return {
    recipeVersion: Math.max(1, safeNumber(source.recipeVersion, 1)),
    family: canonicalFamily,
    variant: source.variant ?? 'default',
    values,
    labels: cloneValue(asObject(source.labels)),
    unit,
    units: unit ? [unit] : [],
    unknown: source.unknown ?? null,
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
    printHeightMm: safeNumber(source.printHeightMm),
    printMinWidthMm: safeNumber(source.printMinWidthMm),
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
  };
}

export function normaliseResponseRecipe(recipe) {
  return createResponseRecipe(recipe);
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
    section: source.section ?? source.sectionId ?? null,
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
    layout: {
      size: oneOf(layout.size, VALID_MODEL_SIZES, 'standard'),
      modelPosition: oneOf(layout.modelPosition, VALID_MODEL_POSITIONS, 'beneath'),
      manualBreakBefore: Boolean(layout.manualBreakBefore),
      pageHint: safeNumber(layout.pageHint),
      columnSpan: layout.columnSpan === 'full' ? 'full' : 'auto',
      keepWithNext: Boolean(layout.keepWithNext),
    },
    warnings: normaliseWarnings(source.warnings),
    teacher: {
      answer: teacher.answer ?? null,
      notes: asText(teacher.notes),
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

export function renumberBlocks(blocks, questionNumbering = true) {
  let nextNumber = 1;
  return blocks.map((block) => {
    if (block.kind !== 'question') return block.number == null ? block : { ...block, number: null };
    const number = questionNumbering ? nextNumber : null;
    nextNumber += 1;
    return block.number === number ? block : { ...block, number };
  });
}

export function createWorksheet(overrides = {}, options = {}) {
  const source = asObject(overrides);
  const now = options.now?.() ?? source.metadata?.createdAt ?? defaultNow();
  const idFactory = options.idFactory ?? createId;
  const intent = oneOf(source.intent, VALID_INTENTS, 'practice');
  const suppliedMetadata = asObject(source.metadata);
  const settings = {
    ...DEFAULT_GLOBAL_SETTINGS,
    ...cloneValue(asObject(source.settings ?? source.globalSettings)),
  };
  settings.columns = settings.columns === 2 ? 2 : 1;
  settings.orientation = 'portrait';
  settings.pageSize = 'A4';
  settings.marginMm = Math.min(25, Math.max(8, safeNumber(settings.marginMm, 12)));

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

  return {
    schema: WORKSHEET_SCHEMA,
    version: WORKSHEET_VERSION,
    revision: Math.max(0, safeNumber(source.revision, 0)),
    migration: {
      createdWith: WORKSHEET_VERSION,
      migratedFrom: source.migration?.migratedFrom ?? null,
      migratedAt: source.migration?.migratedAt ?? null,
    },
    metadata: {
      id: metadataId,
      name: asText(suppliedMetadata.name, asText(suppliedMetadata.title, defaultTitle(intent))),
      title: asText(suppliedMetadata.title, defaultTitle(intent)),
      shortInstruction: asText(suppliedMetadata.shortInstruction),
      className: asText(suppliedMetadata.className),
      createdAt: asText(suppliedMetadata.createdAt, now),
      updatedAt: asText(suppliedMetadata.updatedAt, now),
    },
    intent,
    outputView: oneOf(source.outputView ?? source.view, VALID_OUTPUT_VIEWS, 'pupil'),
    settings,
    originalImport: {
      rawText: originalRaw,
      importedAt: originalSource.importedAt ?? (originalRaw ? now : null),
      source: originalSource.source ?? 'plain-text',
    },
    blocks: renumberBlocks(blocks, settings.questionNumbering),
    pageArrangement: {
      ...cloneValue(DEFAULT_PAGE_ARRANGEMENT),
      ...cloneValue(pageSource),
      manualBreakBefore,
      pageOverrides: cloneValue(asObject(pageSource.pageOverrides)),
    },
    warnings: normaliseWarnings(source.warnings),
  };
}

/** Upgrade unknown/legacy persisted data without mutating it. */
export function migrateWorksheet(input, options = {}) {
  const source = asObject(input);
  const fromVersion = safeNumber(source.version ?? source.schemaVersion, 0);
  if (fromVersion > WORKSHEET_VERSION) {
    throw new Error(`Worksheet version ${fromVersion} is newer than supported version ${WORKSHEET_VERSION}.`);
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

function replaceBlockAt(blocks, index, replacement) {
  return [...blocks.slice(0, index), ...replacement, ...blocks.slice(index + 1)];
}

function mergeResponseRecipes(first, second) {
  const sizeRank = { compact: 0, standard: 1, generous: 2 };
  const firstRank = sizeRank[first?.size] ?? 1;
  const secondRank = sizeRank[second?.size] ?? 1;
  return cloneValue(firstRank >= secondRank ? first : second);
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
  SET_INTENT: 'worksheet/set-intent',
  SET_OUTPUT_VIEW: 'worksheet/set-output-view',
  UPDATE_SETTINGS: 'worksheet/update-settings',
  SET_ORIGINAL_IMPORT: 'worksheet/set-original-import',
  REPLACE_BLOCKS: 'worksheet/replace-blocks',
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
});

export const worksheetActions = Object.freeze({
  updateMetadata: (patch) => ({ type: ActionTypes.UPDATE_METADATA, patch }),
  setIntent: (intent) => ({ type: ActionTypes.SET_INTENT, intent }),
  setOutputView: (view) => ({ type: ActionTypes.SET_OUTPUT_VIEW, view }),
  updateSettings: (patch) => ({ type: ActionTypes.UPDATE_SETTINGS, patch }),
  setOriginalImport: (rawText, details = {}) => ({
    type: ActionTypes.SET_ORIGINAL_IMPORT,
    originalImport: { ...details, rawText },
  }),
  replaceBlocks: (blocks) => ({ type: ActionTypes.REPLACE_BLOCKS, blocks }),
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
});

export function worksheetReducer(state, action, options = {}) {
  if (!state || typeof state !== 'object') throw new TypeError('worksheetReducer requires a worksheet state.');
  if (!action || typeof action.type !== 'string') return state;
  const idFactory = options.idFactory ?? createId;
  let next = state;

  switch (action.type) {
    case ActionTypes.UPDATE_METADATA: {
      const patch = asObject(action.patch);
      const allowed = ['name', 'title', 'shortInstruction', 'className'];
      const metadataPatch = {};
      for (const key of allowed) if (key in patch) metadataPatch[key] = asText(patch[key]);
      if (!Object.keys(metadataPatch).length) break;
      next = { ...state, metadata: { ...state.metadata, ...metadataPatch } };
      break;
    }
    case ActionTypes.SET_INTENT: {
      const intent = oneOf(action.intent, VALID_INTENTS, null);
      if (!intent || intent === state.intent) break;
      next = { ...state, intent };
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
      settings.orientation = 'portrait';
      settings.marginMm = Math.min(25, Math.max(8, safeNumber(settings.marginMm, 12)));
      let blocks = state.blocks;
      if (settings.questionNumbering !== state.settings.questionNumbering) {
        blocks = renumberBlocks(blocks, Boolean(settings.questionNumbering));
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
      const blocks = (Array.isArray(action.blocks) ? action.blocks : [])
        .map((block) => normaliseQuestionBlock(block, { idFactory }));
      next = { ...state, blocks: renumberBlocks(blocks, state.settings.questionNumbering) };
      break;
    }
    case ActionTypes.ADD_BLOCK: {
      const block = normaliseQuestionBlock(action.block, { idFactory });
      const requested = Number.isInteger(action.index) ? action.index : state.blocks.length;
      const index = Math.max(0, Math.min(state.blocks.length, requested));
      const blocks = [...state.blocks.slice(0, index), block, ...state.blocks.slice(index)];
      next = { ...state, blocks: renumberBlocks(blocks, state.settings.questionNumbering) };
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
        layout: patch.layout ? { ...current.layout, ...patch.layout } : current.layout,
        warnings: patch.warnings ? normaliseWarnings(patch.warnings) : current.warnings,
        teacher: patch.teacher ? { ...current.teacher, ...patch.teacher } : current.teacher,
      };
      const block = normaliseQuestionBlock(candidate, { idFactory: () => current.id });
      const blocks = [...state.blocks];
      blocks[index] = block;
      next = { ...state, blocks: renumberBlocks(blocks, state.settings.questionNumbering) };
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
      next = { ...state, blocks: renumberBlocks(blocks, state.settings.questionNumbering) };
      break;
    }
    case ActionTypes.DUPLICATE_BLOCK: {
      const index = state.blocks.findIndex((block) => block.id === action.blockId);
      if (index < 0) break;
      const copy = cloneValue(state.blocks[index]);
      copy.id = asText(action.newId) || idFactory('question');
      copy.layout.manualBreakBefore = false;
      const blocks = [...state.blocks.slice(0, index + 1), copy, ...state.blocks.slice(index + 1)];
      next = { ...state, blocks: renumberBlocks(blocks, state.settings.questionNumbering) };
      break;
    }
    case ActionTypes.REMOVE_BLOCK: {
      if (!state.blocks.some((block) => block.id === action.blockId)) break;
      const blocks = state.blocks.filter((block) => block.id !== action.blockId);
      next = {
        ...state,
        blocks: renumberBlocks(blocks, state.settings.questionNumbering),
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
      next = { ...state, blocks: renumberBlocks(blocks, state.settings.questionNumbering) };
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
          answer: first.teacher.answer ?? second.teacher.answer,
          notes: [first.teacher.notes, second.teacher.notes].filter(Boolean).join('\n'),
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
        blocks: renumberBlocks(blocks, state.settings.questionNumbering),
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
  const index = readJson(storage, PROJECT_INDEX_KEY, []);
  return Array.isArray(index) ? index.filter((entry) => entry && typeof entry.id === 'string') : [];
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

export function saveProject(worksheet, storage = getDefaultStorage()) {
  if (!storage) return false;
  const normalised = migrateWorksheet(worksheet);
  const saved = writeJson(storage, projectStorageKey(normalised.metadata.id), normalised);
  if (!saved) return false;
  updateProjectIndex(storage, normalised);
  try {
    storage.setItem(CURRENT_PROJECT_KEY, normalised.metadata.id);
  } catch {
    // The project payload is still safely saved; current-project is convenience only.
  }
  return true;
}

export function loadProject(projectId, storage = getDefaultStorage(), options = {}) {
  const project = readJson(storage, projectStorageKey(projectId), null);
  return project ? migrateWorksheet(project, options) : null;
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
  try {
    storage.removeItem(projectStorageKey(projectId));
    const index = readProjectIndex(storage).filter((entry) => entry.id !== projectId);
    writeJson(storage, PROJECT_INDEX_KEY, index);
    if (storage.getItem(CURRENT_PROJECT_KEY) === projectId) storage.removeItem(CURRENT_PROJECT_KEY);
    return true;
  } catch {
    return false;
  }
}

export function duplicateProject(sourceOrId, options = {}, storage = getDefaultStorage()) {
  const source = typeof sourceOrId === 'string' ? loadProject(sourceOrId, storage, options) : sourceOrId;
  if (!source) return null;
  const idFactory = options.idFactory ?? createId;
  const now = options.now?.() ?? defaultNow();
  const duplicate = migrateWorksheet(cloneValue(source), options);
  duplicate.metadata.id = idFactory('worksheet');
  duplicate.metadata.name = options.name ?? `${source.metadata.name || source.metadata.title} copy`;
  duplicate.metadata.createdAt = now;
  duplicate.metadata.updatedAt = now;
  duplicate.revision = 0;
  duplicate.pageArrangement = cloneValue(source.pageArrangement);
  duplicate.blocks = source.blocks.map((block) => ({ ...cloneValue(block), id: idFactory('question') }));
  const idMap = new Map(source.blocks.map((block, index) => [block.id, duplicate.blocks[index].id]));
  duplicate.pageArrangement.manualBreakBefore = source.pageArrangement.manualBreakBefore
    .map((id) => idMap.get(id))
    .filter(Boolean);
  saveProject(duplicate, storage);
  return duplicate;
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
  let state = initialWorksheet
    ? migrateWorksheet(initialWorksheet, { now, idFactory })
    : createWorksheet({}, { now, idFactory });
  let past = [];
  let future = [];
  const listeners = new Set();
  let saveTimer = null;

  function notify(reason, action = null) {
    for (const listener of [...listeners]) listener(state, { reason, action, canUndo: past.length > 0, canRedo: future.length > 0 });
  }

  function scheduleSave() {
    if (!autosave || !storage) return;
    if (autosaveDelay === 0) {
      saveProject(state, storage);
      return;
    }
    if (saveTimer != null) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      saveProject(state, storage);
    }, autosaveDelay);
  }

  function commit(next, reason, action = null, recordHistory = true) {
    if (next === state) return false;
    if (recordHistory) {
      past.push(state);
      if (past.length > historyLimit) past = past.slice(-historyLimit);
      future = [];
    }
    state = next;
    scheduleSave();
    notify(reason, action);
    return true;
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
      return autosave && storage ? saveProject(state, storage) : false;
    },
    replace(nextWorksheet, { clearHistory = true } = {}) {
      const next = migrateWorksheet(nextWorksheet, { now, idFactory });
      if (clearHistory) {
        past = [];
        future = [];
      }
      return commit(next, 'replace', null, !clearHistory);
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
