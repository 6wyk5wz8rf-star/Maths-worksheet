/**
 * Sparse, inherited worksheet versions for Build 3.
 *
 * The master worksheet remains the single source of questions and model data.
 * Variants store only adjustments, so a new master question appears in every
 * version until the teacher changes that specific version.
 */

const VERSION_TYPES = new Set(['master', 'supported', 'standard', 'assessment', 'homework', 'teacher-model', 'answer', 'custom']);
const OUTPUT_VIEWS = new Set(['pupil', 'teacher', 'answer']);
const WORKBOOK_BLOCK_KINDS = new Set(['question', 'heading', 'instruction']);

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asText(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function cloneValue(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(cloneValue);
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['__proto__', 'prototype', 'constructor'].includes(key))
    .map(([key, child]) => [key, cloneValue(child)]));
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mergeValue(base, patch) {
  if (patch === undefined) return cloneValue(base);
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return cloneValue(patch);
  const target = asObject(base);
  const result = { ...cloneValue(target) };
  for (const [key, value] of Object.entries(patch)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) continue;
    result[key] = mergeValue(target[key], value);
  }
  return result;
}

function diffValue(base, target) {
  if (sameValue(base, target)) return undefined;
  if (target === null || typeof target !== 'object' || Array.isArray(target) || base === null || typeof base !== 'object' || Array.isArray(base)) return cloneValue(target);
  const patch = {};
  for (const key of Object.keys(target)) {
    const difference = diffValue(base[key], target[key]);
    if (difference !== undefined) patch[key] = difference;
  }
  return Object.keys(patch).length ? patch : undefined;
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === 'string'))];
}

function workbookBlockKind(value) {
  return WORKBOOK_BLOCK_KINDS.has(value) ? value : 'question';
}

function normaliseWorkbookMasterBlockKinds(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return Object.fromEntries(Object.entries(value)
    .filter(([id, kind]) => typeof id === 'string'
      && !['__proto__', 'prototype', 'constructor'].includes(id)
      && WORKBOOK_BLOCK_KINDS.has(kind))
    .map(([id, kind]) => [id, kind]));
}

const VALID_STYLE_PRESETS = new Set(['calm', 'clear', 'compact', 'guided', 'assessment', 'homework']);
const VALID_RESPONSE_TYPES = new Set([
  'none', 'short-answer', 'answer-box', 'calculation-area', 'squared-working',
  'lined-explanation', 'unlined-thinking', 'two-methods', 'prove-it',
  'table-completion', 'diagram-construction', 'labelled-steps', 'rough-working',
  'model-completion', 'short-line', 'open-box', 'writing-lines', 'grid',
]);

function safeBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function safeNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function normaliseResolvedSettings(value, fallback = {}) {
  const source = { ...asObject(fallback), ...asObject(value) };
  const accentFallback = /^#[0-9a-f]{6}$/i.test(fallback.accentColor) ? fallback.accentColor : '#4f568f';
  const totalMarks = source.totalMarks == null ? null : safeNumber(source.totalMarks, null, 0, 999);
  return {
    ...source,
    accentColor: /^#[0-9a-f]{6}$/i.test(source.accentColor) ? source.accentColor : accentFallback,
    colorMode: ['colour', 'monochrome'].includes(source.colorMode) ? source.colorMode : (fallback.colorMode ?? 'colour'),
    columns: source.columns === 2 ? 2 : 1,
    density: ['compact', 'standard', 'spacious'].includes(source.density) ? source.density : (fallback.density ?? 'standard'),
    typeface: ['system', 'sans', 'rounded'].includes(source.typeface) ? source.typeface : (fallback.typeface ?? 'system'),
    workingSpaceStyle: ['lines', 'grid', 'open'].includes(source.workingSpaceStyle) ? source.workingSpaceStyle : (fallback.workingSpaceStyle ?? 'lines'),
    orientation: source.orientation === 'landscape' ? 'landscape' : 'portrait',
    pageSize: 'A4',
    marginMm: safeNumber(source.marginMm, fallback.marginMm ?? 12, 8, 25),
    stylePreset: VALID_STYLE_PRESETS.has(source.stylePreset) ? source.stylePreset : (fallback.stylePreset ?? 'calm'),
    sectionStyle: ['plain', 'line', 'band', 'stage'].includes(source.sectionStyle) ? source.sectionStyle : (fallback.sectionStyle ?? 'line'),
    bodyScale: ['small', 'standard', 'large'].includes(source.bodyScale) ? source.bodyScale : (fallback.bodyScale ?? 'standard'),
    lineWeight: ['light', 'standard', 'strong'].includes(source.lineWeight) ? source.lineWeight : (fallback.lineWeight ?? 'light'),
    workbookMode: safeBoolean(source.workbookMode, fallback.workbookMode ?? false),
    showNameField: safeBoolean(source.showNameField, fallback.showNameField ?? true),
    showDateField: safeBoolean(source.showDateField, fallback.showDateField ?? true),
    showClassField: safeBoolean(source.showClassField, fallback.showClassField ?? false),
    questionNumbering: safeBoolean(source.questionNumbering, fallback.questionNumbering ?? true),
    pageNumbers: safeBoolean(source.pageNumbers, fallback.pageNumbers ?? true),
    showMarks: safeBoolean(source.showMarks, fallback.showMarks ?? false),
    totalMarks,
  };
}

function normaliseResolvedBlock(value, fallback = {}) {
  const source = asObject(value);
  const base = asObject(fallback);
  const responseSource = { ...asObject(base.response), ...asObject(source.response) };
  const compositionSource = { ...asObject(base.composition), ...asObject(source.composition) };
  const layoutSource = { ...asObject(base.layout), ...asObject(source.layout) };
  const teacherSource = { ...asObject(base.teacher), ...asObject(source.teacher) };
  const rawModel = source.model;
  const rawCompletedModel = teacherSource.completedModel;
  return {
    ...base,
    ...source,
    id: asText(source.id, asText(base.id)),
    kind: ['question', 'heading', 'instruction'].includes(source.kind) ? source.kind : (base.kind ?? 'question'),
    originalText: asText(source.originalText, asText(base.originalText)),
    displayText: asText(source.displayText, asText(base.displayText)),
    section: Object.hasOwn(source, 'section')
      ? (typeof source.section === 'string' ? source.section : null)
      : (typeof base.section === 'string' ? base.section : null),
    source: mergeValue(asObject(base.source), asObject(source.source)),
    extracted: mergeValue(asObject(base.extracted), asObject(source.extracted)),
    model: rawModel === null ? null : (rawModel && typeof rawModel === 'object' && !Array.isArray(rawModel) ? cloneValue(rawModel) : cloneValue(base.model ?? null)),
    response: {
      ...responseSource,
      type: VALID_RESPONSE_TYPES.has(responseSource.type) ? responseSource.type : (base.response?.type ?? 'open-box'),
      size: ['small', 'compact', 'medium', 'standard', 'large', 'generous'].includes(responseSource.size) ? responseSource.size : (base.response?.size ?? 'standard'),
      customRows: safeNumber(responseSource.customRows, 0, 0, 14),
      rows: safeNumber(responseSource.rows, base.response?.rows ?? 0, 0, 14),
      lines: safeNumber(responseSource.lines, base.response?.lines ?? 0, 0, 14),
    },
    composition: {
      ...compositionSource,
      footprint: ['compact', 'standard', 'spacious', 'half', 'full', 'page'].includes(compositionSource.footprint) ? compositionSource.footprint : (base.composition?.footprint ?? 'standard'),
      keepWithNext: safeBoolean(compositionSource.keepWithNext, base.composition?.keepWithNext ?? false),
    },
    layout: {
      ...layoutSource,
      columnSpan: ['auto', 'half', 'full'].includes(layoutSource.columnSpan) ? layoutSource.columnSpan : (base.layout?.columnSpan ?? 'auto'),
      pageHint: safeNumber(layoutSource.pageHint, 0, 0, 999),
      keepWithNext: safeBoolean(layoutSource.keepWithNext, base.layout?.keepWithNext ?? false),
      manualBreakBefore: safeBoolean(layoutSource.manualBreakBefore, base.layout?.manualBreakBefore ?? false),
    },
    warnings: Array.isArray(source.warnings) ? source.warnings.filter((warning) => warning && typeof warning === 'object').map(cloneValue) : cloneValue(base.warnings ?? []),
    teacher: {
      ...teacherSource,
      answer: teacherSource.answer ?? null,
      notes: asText(teacherSource.notes),
      expectedMethod: asText(teacherSource.expectedMethod),
      misconception: asText(teacherSource.misconception),
      markingNote: asText(teacherSource.markingNote),
      completedModel: rawCompletedModel === null ? null : (rawCompletedModel && typeof rawCompletedModel === 'object' && !Array.isArray(rawCompletedModel) ? cloneValue(rawCompletedModel) : cloneValue(base.teacher?.completedModel ?? null)),
    },
  };
}

function normaliseResolvedArchitecture(value, fallback = {}) {
  const source = { ...asObject(fallback), ...asObject(value) };
  const fallbackHeader = asObject(fallback.header);
  const header = asObject(source.header);
  const fallbackFooter = asObject(fallback.footer);
  const footer = asObject(source.footer);
  const fallbackNumbering = asObject(fallback.numbering);
  const numbering = asObject(source.numbering);
  const headerFields = header.fields && typeof header.fields === 'object' && !Array.isArray(header.fields)
    ? header.fields
    : asObject(fallbackHeader.fields);
  const footerFields = Array.isArray(footer.fields)
    ? uniqueStrings(footer.fields)
    : Array.isArray(fallbackFooter.fields) ? uniqueStrings(fallbackFooter.fields) : ['title', 'page-number'];
  return {
    ...source,
    compositionMode: ['flow', 'rows', 'deliberate-pages'].includes(source.compositionMode)
      ? source.compositionMode
      : (['flow', 'rows', 'deliberate-pages'].includes(fallback.compositionMode) ? fallback.compositionMode : 'flow'),
    stylePreset: VALID_STYLE_PRESETS.has(source.stylePreset)
      ? source.stylePreset
      : (VALID_STYLE_PRESETS.has(fallback.stylePreset) ? fallback.stylePreset : 'calm'),
    sections: Array.isArray(source.sections)
      ? source.sections.filter((section) => section && typeof section === 'object').map((section) => ({
        ...section,
        id: asText(section.id),
        headingId: typeof section.headingId === 'string' ? section.headingId : null,
        name: asText(section.name, 'Section'),
        layout: ['flow', 'rows', 'deliberate-pages'].includes(section.layout) ? section.layout : 'flow',
        startOnNewPage: safeBoolean(section.startOnNewPage, false),
      })).filter((section) => section.id)
      : cloneValue(fallback.sections ?? []),
    numbering: {
      ...numbering,
      mode: ['automatic', 'manual'].includes(numbering.mode) ? numbering.mode : (['automatic', 'manual'].includes(fallbackNumbering.mode) ? fallbackNumbering.mode : 'automatic'),
      restartAtSections: safeBoolean(numbering.restartAtSections, safeBoolean(fallbackNumbering.restartAtSections, false)),
    },
    header: {
      ...header,
      layout: ['compact', 'standard', 'spacious'].includes(header.layout)
        ? header.layout
        : (['compact', 'standard', 'spacious'].includes(fallbackHeader.layout) ? fallbackHeader.layout : 'standard'),
      fields: cloneValue(headerFields),
    },
    footer: {
      ...footer,
      fields: footerFields,
    },
  };
}

function normaliseResolvedPageArrangement(value, fallback = {}) {
  const source = { ...asObject(fallback), ...asObject(value) };
  return {
    ...source,
    manualBreakBefore: uniqueStrings(source.manualBreakBefore),
    pageOverrides: cloneValue(asObject(source.pageOverrides)),
  };
}

export function createEmptyOverrides() {
  return {
    metadata: {},
    settings: {},
    architecture: {},
    pageArrangement: {},
    blockPatches: {},
    hiddenBlockIds: [],
    addedBlocks: [],
    order: null,
    outputView: null,
    workbookMasterBlockIds: null,
    workbookMasterBlockKinds: null,
    workbookAutoHiddenBlockIds: null,
  };
}

export function normaliseVersionOverrides(value) {
  const source = asObject(value);
  const patches = Object.fromEntries(Object.entries(asObject(source.blockPatches)).filter(([id, patch]) => typeof id === 'string' && patch && typeof patch === 'object').map(([id, patch]) => [id, cloneValue(patch)]));
  return {
    ...createEmptyOverrides(),
    metadata: cloneValue(asObject(source.metadata)),
    settings: cloneValue(asObject(source.settings)),
    architecture: cloneValue(asObject(source.architecture)),
    pageArrangement: cloneValue(asObject(source.pageArrangement)),
    blockPatches: patches,
    hiddenBlockIds: uniqueStrings(source.hiddenBlockIds),
    addedBlocks: Array.isArray(source.addedBlocks) ? source.addedBlocks.filter((block) => block && typeof block === 'object').map(cloneValue) : [],
    order: Array.isArray(source.order) ? uniqueStrings(source.order) : null,
    outputView: OUTPUT_VIEWS.has(source.outputView) ? source.outputView : null,
    workbookMasterBlockIds: Array.isArray(source.workbookMasterBlockIds)
      ? uniqueStrings(source.workbookMasterBlockIds)
      : null,
    workbookMasterBlockKinds: normaliseWorkbookMasterBlockKinds(source.workbookMasterBlockKinds),
    workbookAutoHiddenBlockIds: Array.isArray(source.workbookAutoHiddenBlockIds)
      ? uniqueStrings(source.workbookAutoHiddenBlockIds)
      : null,
  };
}

export function createMasterVersion(worksheet = {}) {
  return {
    id: 'master',
    name: 'Standard',
    type: 'master',
    baseId: null,
    createdAt: worksheet.metadata?.createdAt ?? new Date().toISOString(),
    outputView: 'pupil',
    overrides: null,
  };
}

export function createVariant(overrides = {}, options = {}) {
  const type = VERSION_TYPES.has(options.type) && options.type !== 'master' ? options.type : 'custom';
  const id = asText(options.id) || options.idFactory?.('version') || `version_${Math.random().toString(36).slice(2, 9)}`;
  const defaults = {
    supported: ['More support', 'pupil'],
    standard: ['Standard', 'pupil'],
    assessment: ['Assessment', 'pupil'],
    homework: ['Homework', 'pupil'],
    'teacher-model': ['Teacher model', 'teacher'],
    answer: ['Answer version', 'answer'],
    custom: ['Custom version', 'pupil'],
  }[type] ?? ['Custom version', 'pupil'];
  return {
    id,
    name: asText(options.name, defaults[0]),
    type,
    baseId: 'master',
    createdAt: options.now ?? new Date().toISOString(),
    outputView: OUTPUT_VIEWS.has(options.outputView) ? options.outputView : defaults[1],
    overrides: normaliseVersionOverrides(overrides),
  };
}

export function normaliseVersions(value, worksheet = {}, options = {}) {
  const source = asObject(value);
  const idFactory = options.idFactory;
  const supplied = Array.isArray(source.items) ? source.items : [];
  const items = [createMasterVersion(worksheet)];
  const seen = new Set(['master']);
  for (const item of supplied) {
    if (!item || typeof item !== 'object' || item.id === 'master') continue;
    const version = createVariant(item.overrides, {
      id: item.id,
      type: item.type,
      name: item.name,
      outputView: item.outputView,
      now: item.createdAt,
      idFactory,
    });
    if (seen.has(version.id)) continue;
    seen.add(version.id);
    items.push(version);
  }
  return {
    activeId: seen.has(source.activeId) ? source.activeId : 'master',
    items,
  };
}

function reorderBlocks(blocks, order) {
  if (!Array.isArray(order) || !order.length) return blocks;
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const ordered = [];
  for (const id of order) {
    const block = byId.get(id);
    if (!block) continue;
    ordered.push(block);
    byId.delete(id);
  }
  for (const block of blocks) if (byId.has(block.id)) ordered.push(block);
  return ordered;
}

function renumberResolvedBlocks(blocks, settings, architecture) {
  const mode = architecture?.numbering?.mode ?? 'automatic';
  if (mode === 'manual' || settings?.questionNumbering === false) return blocks;
  let next = 1;
  let section = null;
  return blocks.map((block) => {
    if (block.kind !== 'question') return { ...block, number: null };
    if (architecture?.numbering?.restartAtSections && block.section && block.section !== section) next = 1;
    section = block.section;
    return { ...block, number: next++ };
  });
}

/** Resolve a master worksheet into one immutable version for render/pagination. */
export function resolveWorksheetVersion(worksheet, versionId = worksheet?.versions?.activeId ?? 'master') {
  if (!worksheet || typeof worksheet !== 'object') return worksheet;
  const versions = normaliseVersions(worksheet.versions, worksheet);
  const version = versions.items.find((item) => item.id === versionId) ?? versions.items[0];
  if (version.id === 'master') {
    return { ...worksheet, versions, activeVersion: version, activeVersionId: version.id, outputView: worksheet.outputView ?? 'pupil' };
  }
  const overrides = normaliseVersionOverrides(version.overrides);
  const masterBlocks = Array.isArray(worksheet.blocks) ? worksheet.blocks.map(cloneValue) : [];
  const baseById = new Map(masterBlocks.map((block) => [block.id, block]));
  const hidden = new Set(overrides.hiddenBlockIds);
  const orphanedBlockIds = Object.keys(overrides.blockPatches).filter((id) => !baseById.has(id) && !overrides.addedBlocks.some((block) => block.id === id));
  const blocks = masterBlocks
    .filter((block) => !hidden.has(block.id))
    .map((block) => normaliseResolvedBlock(mergeValue(block, overrides.blockPatches[block.id]), block));
  for (const added of overrides.addedBlocks) {
    if (!added?.id || hidden.has(added.id) || baseById.has(added.id)) continue;
    const resolvedAdded = normaliseResolvedBlock(mergeValue(added, overrides.blockPatches[added.id]), added);
    if (resolvedAdded.id) blocks.push(resolvedAdded);
  }
  const rawMetadata = mergeValue(worksheet.metadata, overrides.metadata);
  const metadata = {
    ...asObject(worksheet.metadata),
    ...asObject(rawMetadata),
    name: asText(rawMetadata?.name, asText(worksheet.metadata?.name, 'Untitled worksheet')),
    title: asText(rawMetadata?.title, asText(worksheet.metadata?.title, 'Maths worksheet')),
    topic: asText(rawMetadata?.topic),
    learningIntention: asText(rawMetadata?.learningIntention),
    successCriteria: asText(rawMetadata?.successCriteria),
    teacher: asText(rawMetadata?.teacher),
    shortInstruction: asText(rawMetadata?.shortInstruction),
    className: asText(rawMetadata?.className),
  };
  const settings = normaliseResolvedSettings(mergeValue(worksheet.settings, overrides.settings), worksheet.settings);
  const architecture = normaliseResolvedArchitecture(mergeValue(worksheet.architecture, overrides.architecture), worksheet.architecture);
  const pageArrangement = normaliseResolvedPageArrangement(mergeValue(worksheet.pageArrangement, overrides.pageArrangement), worksheet.pageArrangement);
  const ordered = renumberResolvedBlocks(reorderBlocks(blocks, overrides.order), settings, architecture);
  return {
    ...worksheet,
    metadata: { ...metadata, versionLabel: version.name },
    settings,
    architecture,
    pageArrangement,
    blocks: ordered,
    outputView: overrides.outputView ?? version.outputView ?? worksheet.outputView ?? 'pupil',
    versions,
    activeVersion: version,
    activeVersionId: version.id,
    versionDiagnostics: { orphanedBlockIds },
  };
}

/** Create sparse version overrides by comparing an adjusted resolved worksheet with its master. */
export function deriveVersionOverrides(master, adjusted) {
  const base = master ?? {};
  const target = adjusted ?? {};
  const baseBlocks = Array.isArray(base.blocks) ? base.blocks : [];
  const targetBlocks = Array.isArray(target.blocks) ? target.blocks : [];
  const baseById = new Map(baseBlocks.map((block) => [block.id, block]));
  const targetById = new Map(targetBlocks.map((block) => [block.id, block]));
  const blockPatches = {};
  for (const [id, targetBlock] of targetById) {
    const baseBlock = baseById.get(id);
    if (!baseBlock) continue;
    const patch = diffValue(baseBlock, targetBlock);
    if (patch !== undefined) {
      // Automatic question numbers are recalculated once an override order is
      // resolved. Storing them would make simple reorders brittle.
      if (patch && typeof patch === 'object' && !Array.isArray(patch)) delete patch.number;
      if (patch && typeof patch === 'object' && Object.keys(patch).length) blockPatches[id] = patch;
    }
  }
  const hiddenBlockIds = baseBlocks.filter((block) => !targetById.has(block.id)).map((block) => block.id);
  const addedBlocks = targetBlocks.filter((block) => !baseById.has(block.id)).map(cloneValue);
  const baseVisibleOrder = baseBlocks.filter((block) => !hiddenBlockIds.includes(block.id)).map((block) => block.id);
  const targetOrder = targetBlocks.map((block) => block.id);
  const order = sameValue(baseVisibleOrder, targetOrder) ? null : targetOrder;
  // `resolveWorksheetVersion` adds the visible version label for rendering.
  // It is not teacher-authored metadata and must never become a persistent
  // override merely because another edit happened in that version.
  const metadataPatch = diffValue(base.metadata ?? {}, target.metadata ?? {}) ?? {};
  if (metadataPatch && typeof metadataPatch === 'object' && !Array.isArray(metadataPatch)) {
    delete metadataPatch.versionLabel;
    delete metadataPatch.updatedAt;
    delete metadataPatch.createdAt;
    delete metadataPatch.id;
  }
  return normaliseVersionOverrides({
    metadata: metadataPatch,
    settings: diffValue(base.settings ?? {}, target.settings ?? {}) ?? {},
    architecture: diffValue(base.architecture ?? {}, target.architecture ?? {}) ?? {},
    pageArrangement: diffValue(base.pageArrangement ?? {}, target.pageArrangement ?? {}) ?? {},
    blockPatches,
    hiddenBlockIds,
    addedBlocks,
    order,
    outputView: target.outputView !== base.outputView ? target.outputView : null,
  });
}

function supportHint(block) {
  const text = `${block.displayText ?? ''}`.toLowerCase();
  if (/round/.test(text)) return 'Mark the neighbouring multiples first.';
  if (/remainder/.test(text)) return 'Explain what the remainder represents.';
  if (/fraction/.test(text)) return 'Which value is the whole?';
  if (/interval|scale|chart/.test(text)) return 'Check that the intervals are equal.';
  if (/place value|digit/.test(text)) return 'Name the value of the digit, not just the digit.';
  if (/inverse|check/.test(text)) return 'Use the inverse to check.';
  return 'Choose a representation before calculating.';
}

/** Generate a linked variant preset without duplicating the master worksheet. */
export function createPresetVariant(master, type, options = {}) {
  const base = resolveWorksheetVersion({ ...master, versions: { activeId: 'master', items: [createMasterVersion(master)] } }, 'master');
  const target = cloneValue(base);
  const version = createVariant({}, { ...options, type });
  if (type === 'supported') {
    target.blocks = target.blocks.map((block) => {
      if (block.kind !== 'question') return block;
      const model = block.model ? {
        ...block.model,
        scaffoldState: 'guided',
        completionState: block.model.completionState === 'completed' ? 'partly-completed' : block.model.completionState,
      } : null;
      return {
        ...block,
        model,
        response: { ...block.response, size: 'generous', lines: Math.max(5, Number(block.response?.lines) || 0) },
        composition: { ...(block.composition ?? {}), hint: block.composition?.hint || supportHint(block) },
      };
    });
    target.settings = { ...target.settings, density: 'spacious' };
  } else if (type === 'assessment') {
    target.blocks = target.blocks.map((block) => block.kind !== 'question' ? block : ({
      ...block,
      model: block.model ? { ...block.model, scaffoldState: 'blank', completionState: 'blank', purpose: 'response-model' } : null,
      response: { ...block.response, type: 'rough-working', size: 'standard', label: 'Rough working' },
      composition: { ...(block.composition ?? {}), hint: '', sentenceStem: '', vocabulary: [] },
    }));
    target.settings = { ...target.settings, colorMode: 'monochrome', stylePreset: 'assessment' };
  } else if (type === 'teacher-model' || type === 'answer') {
    target.blocks = target.blocks.map((block) => block.kind !== 'question' ? block : ({
      ...block,
      teacher: {
        ...(block.teacher ?? {}),
        completedModel: block.model ? { ...block.model, scaffoldState: 'modelled', completionState: 'completed' } : block.teacher?.completedModel ?? null,
      },
    }));
    target.outputView = type === 'answer' ? 'answer' : 'teacher';
  } else if (type === 'homework') {
    target.settings = { ...target.settings, density: 'spacious', stylePreset: 'homework' };
  }
  version.overrides = deriveVersionOverrides(master, target);
  return version;
}

function workbookUsesAttachedModelAsResponse(block) {
  // Wording alone is not enough to remove the pupil's answer space.  For
  // example, "Complete the calculation" may have a thinking model beside it
  // and still needs somewhere to calculate.  The attached recipe is the
  // source of truth because matching/interpretation has already assigned its
  // mathematical purpose.
  return block.model?.purpose === 'response-model';
}

function workbookModelSize(model) {
  if (!model) return null;
  // Compact models are promoted to the normal readable print size.  A
  // teacher's deliberate Large or Extra large choice is never downgraded in
  // pursuit of a one-page result.
  return model.size === 'compact' || !model.size ? 'standard' : model.size;
}

function compactWorkbookResponse(response = {}, modelIsResponse = false) {
  if (modelIsResponse) return { ...response, type: 'none', size: 'compact', customRows: 0, rows: 0, lines: 0 };
  const extended = new Set(['writing-lines', 'lined-explanation', 'unlined-thinking', 'two-methods', 'prove-it', 'table-completion', 'diagram-construction', 'labelled-steps', 'rough-working', 'squared-working', 'calculation-area', 'open-box']);
  // A one-page sheet is never allowed to turn a reasoning task into a tiny
  // answer line. Keep its required working type and let pagination honestly
  // report that it needs another page if the writing space remains essential.
  if (extended.has(response.type)) return { ...response, size: 'compact' };
  return { ...response, type: 'short-answer', size: 'compact', customRows: 0, rows: 0, lines: 0 };
}

function compactWorkbookQuestion(block) {
  const modelIsResponse = workbookUsesAttachedModelAsResponse(block);
  return {
    ...block,
    section: null,
    model: block.model ? { ...block.model, size: workbookModelSize(block.model), position: 'beneath' } : null,
    response: compactWorkbookResponse(block.response, modelIsResponse),
    composition: {
      ...(block.composition ?? {}),
      pattern: 'compact-question',
      footprint: 'half',
      keepWithNext: false,
      startOnNewPage: false,
      hint: '',
      sentenceStem: '',
      vocabulary: [],
    },
    layout: { ...(block.layout ?? {}), columnSpan: 'half', keepWithNext: false, manualBreakBefore: false, pageHint: 0 },
  };
}

/**
 * Create a linked, pupil-only compact worksheet version for trimming or
 * pasting into a workbook. It deliberately changes density and response
 * duplication, never the source questions or their mathematics. Callers must
 * paginate the result and tell the teacher when the selected material still
 * needs more than one readable page.
 */
export function createWorkbookCutoutVariant(master, options = {}) {
  const base = resolveWorksheetVersion({
    ...master,
    versions: { activeId: 'master', items: [createMasterVersion(master)] },
  }, 'master');
  const target = cloneValue(base);
  target.settings = {
    ...target.settings,
    workbookMode: true,
    columns: 2,
    density: 'compact',
    bodyScale: 'small',
    marginMm: 8,
    margins: { top: 8, right: 8, bottom: 8, left: 8 },
    stylePreset: 'compact',
    sectionStyle: 'plain',
    showNameField: false,
    showDateField: false,
    showClassField: false,
    pageNumbers: false,
    showMarks: false,
  };
  target.architecture = {
    ...target.architecture,
    compositionMode: 'rows',
    // Workbook packing is a fresh physical arrangement.  Source section flow
    // and "start on a new page" rules must not leak into this one-page mode.
    sections: [],
    stylePreset: 'compact',
    header: {
      ...(target.architecture?.header ?? {}),
      layout: 'compact',
      fields: {
        ...(target.architecture?.header?.fields ?? {}),
        topic: false,
        learningIntention: false,
        successCriteria: false,
        shortInstruction: false,
        teacher: false,
      },
    },
    footer: { ...(target.architecture?.footer ?? {}), fields: [] },
  };
  // `null` is an explicit sparse-version reset; an empty object would merge
  // with inherited override keys rather than removing them.
  target.pageArrangement = { ...target.pageArrangement, manualBreakBefore: [], pageOverrides: null };
  target.outputView = 'pupil';
  // Section headings and imported spacer/instruction cards are useful in the
  // full worksheet but are decorative overhead on a sheet of trim-to-workbook
  // question blocks.  The master remains untouched; these become sparse hidden
  // block ids in the linked variant.
  target.blocks = target.blocks.filter((block) => block.kind === 'question').map(compactWorkbookQuestion);
  const version = createVariant({}, {
    ...options,
    type: 'custom',
    name: options.name ?? 'Workbook cut-outs',
    outputView: 'pupil',
  });
  version.overrides = deriveVersionOverrides(master, target);
  // A sparse version otherwise cannot distinguish a later master addition
  // from an original question that the teacher deliberately reset to master.
  version.overrides.workbookMasterBlockIds = uniqueStrings((master.blocks ?? []).map((block) => block?.id));
  // Stable IDs can survive a fresh interpretation while the block changes
  // between question and decorative content. Persist the original kind so a
  // later reconciliation can update visibility without guessing.
  version.overrides.workbookMasterBlockKinds = normaliseWorkbookMasterBlockKinds(Object.fromEntries((master.blocks ?? [])
    .filter((block) => block && typeof block.id === 'string')
    .map((block) => [block.id, workbookBlockKind(block.kind)])));
  version.overrides.workbookAutoHiddenBlockIds = uniqueStrings((master.blocks ?? [])
    .filter((block) => block && typeof block.id === 'string' && workbookBlockKind(block.kind) !== 'question')
    .map((block) => block.id));
  return version;
}

/**
 * Bring later master additions into an existing Workbook cut-outs version
 * without rebuilding that version or changing any of its teacher-authored
 * sparse overrides. New decorative blocks are hidden; new questions receive
 * only the same physical workbook defaults used at creation.
 */
export function reconcileWorkbookCutoutVariant(master, existingVersion) {
  if (!existingVersion || typeof existingVersion !== 'object' || Array.isArray(existingVersion)) return existingVersion;

  const overrides = normaliseVersionOverrides(existingVersion.overrides);
  const isWorkbook = overrides.settings.workbookMode === true
    || Array.isArray(overrides.workbookMasterBlockIds)
    || overrides.workbookMasterBlockKinds !== null
    || Array.isArray(overrides.workbookAutoHiddenBlockIds)
    || existingVersion.name === 'Workbook cut-outs';
  if (!isWorkbook) return existingVersion;

  const masterBlocks = Array.isArray(master?.blocks)
    ? master.blocks.filter((block) => block && typeof block === 'object' && typeof block.id === 'string')
    : [];
  const masterIds = new Set(masterBlocks.map((block) => block.id));
  const recordedIds = Array.isArray(overrides.workbookMasterBlockIds)
    ? new Set(overrides.workbookMasterBlockIds)
    : null;
  const recordedKinds = overrides.workbookMasterBlockKinds;
  const recordedAutoHidden = Array.isArray(overrides.workbookAutoHiddenBlockIds)
    ? new Set(overrides.workbookAutoHiddenBlockIds)
    : null;
  // The normal open/switch path must be a true no-op. Returning the exact
  // object avoids creating an undo/autosave entry merely because a teacher
  // chose an already-current Workbook cut-outs version. Both the ID and its
  // recorded kind must match because interpretation may reuse a stable ID.
  if (recordedIds && recordedKinds && recordedAutoHidden && masterBlocks.every((block) => (
    recordedIds.has(block.id) && recordedKinds[block.id] === workbookBlockKind(block.kind)
  ))) return existingVersion;

  const knownIds = new Set((overrides.workbookMasterBlockIds ?? []).filter((id) => masterIds.has(id)));

  // Versions created before the baseline marker can still be reconciled
  // safely in the common case: every original workbook question had a patch,
  // while original decorative blocks were hidden. Explicit edits/removals and
  // order entries also prove that a block was already known to this version.
  for (const id of Object.keys(overrides.blockPatches)) if (masterIds.has(id)) knownIds.add(id);
  for (const id of overrides.hiddenBlockIds) if (masterIds.has(id)) knownIds.add(id);
  for (const id of overrides.order ?? []) if (masterIds.has(id)) knownIds.add(id);
  for (const block of overrides.addedBlocks) if (masterIds.has(block?.id)) knownIds.add(block.id);
  if (!recordedIds && !recordedKinds) {
    // With neither provenance field there is no safe way to tell a genuinely
    // later question from an original question deliberately reset to master.
    // Fail closed: preserve every current question as an existing workbook
    // item, hide only current decorative blocks, and establish the baseline
    // from which future additions can be reconciled precisely.
    for (const block of masterBlocks) knownIds.add(block.id);
  }

  const hidden = new Set(overrides.hiddenBlockIds);
  const autoHidden = new Set(overrides.workbookAutoHiddenBlockIds ?? []);
  const blockPatches = cloneValue(overrides.blockPatches);
  // Real pre-v4 workbook saves have no kind provenance and may have kept
  // decorative blocks visible with ordinary patches. Migrate them by hiding
  // every current non-question. For current questions, infer "question" so
  // an ambiguous teacher-hidden question can never be exposed by migration.
  const previousKinds = recordedKinds ? { ...recordedKinds } : Object.fromEntries(masterBlocks
    .map((block) => [block.id, workbookBlockKind(block.kind)]));

  for (const block of masterBlocks) {
    const currentKind = workbookBlockKind(block.kind);
    const previousKind = previousKinds[block.id] ?? null;
    const kindChanged = knownIds.has(block.id) && previousKind !== null && previousKind !== currentKind;
    const isNewMasterBlock = recordedIds ? !recordedIds.has(block.id) : false;

    if (kindChanged && currentKind !== 'question') {
      // A visible former question is being hidden by the system, so remember
      // that ownership. If it was already hidden and was not auto-hidden, the
      // teacher owns that state and a later round-trip must preserve it.
      const wasHidden = hidden.has(block.id);
      hidden.add(block.id);
      if (!wasHidden) autoHidden.add(block.id);
      continue;
    }
    if (kindChanged && previousKind !== 'question' && currentKind === 'question') {
      // Replace any stale decorative patch with the current workbook
      // transform. Reveal only a system-owned hide; a teacher-owned hide is
      // deliberately retained.
      if (autoHidden.has(block.id)) {
        hidden.delete(block.id);
        autoHidden.delete(block.id);
      }
      const patch = diffValue(block, compactWorkbookQuestion(block));
      if (patch && typeof patch === 'object' && !Array.isArray(patch) && Object.keys(patch).length) blockPatches[block.id] = patch;
      else delete blockPatches[block.id];
      continue;
    }

    if (isNewMasterBlock) {
      if (currentKind !== 'question') {
        hidden.add(block.id);
        autoHidden.add(block.id);
        continue;
      }
      // If the teacher has already edited or hidden this inherited question,
      // preserve that workbook-only decision. Otherwise apply the default
      // compact transform exactly once.
      if (knownIds.has(block.id)) continue;
      const patch = diffValue(block, compactWorkbookQuestion(block));
      if (patch && typeof patch === 'object' && !Array.isArray(patch) && Object.keys(patch).length) blockPatches[block.id] = patch;
      continue;
    }

    if (knownIds.has(block.id)) {
      // Legacy provenance cannot safely distinguish an old automatically
      // hidden heading from a teacher-hidden question after a kind change.
      // Hiding all current decorative blocks is safe; same-kind questions keep
      // their exact teacher visibility and overrides.
      if (currentKind !== 'question') {
        hidden.add(block.id);
        if (!recordedAutoHidden) autoHidden.add(block.id);
      }
      continue;
    }
    if (currentKind !== 'question') {
      hidden.add(block.id);
      autoHidden.add(block.id);
      continue;
    }
    const patch = diffValue(block, compactWorkbookQuestion(block));
    if (patch && typeof patch === 'object' && !Array.isArray(patch) && Object.keys(patch).length) {
      blockPatches[block.id] = patch;
    }
  }

  return {
    ...cloneValue(existingVersion),
    overrides: normaliseVersionOverrides({
      ...overrides,
      blockPatches,
      hiddenBlockIds: [...hidden],
      // Retain historical IDs as well as the current snapshot. If a master
      // block is temporarily removed and restored with its stable ID, it is
      // still an inherited original rather than a fresh workbook addition.
      workbookMasterBlockIds: uniqueStrings([
        ...(overrides.workbookMasterBlockIds ?? []),
        ...masterBlocks.map((block) => block.id),
      ]),
      workbookMasterBlockKinds: Object.fromEntries([
        ...Object.entries(recordedKinds ?? {}),
        ...masterBlocks.map((block) => [block.id, workbookBlockKind(block.kind)]),
      ]),
      workbookAutoHiddenBlockIds: [...autoHidden],
    }),
  };
}

export function compareVersions(master, firstId, secondId) {
  const first = resolveWorksheetVersion(master, firstId);
  const second = resolveWorksheetVersion(master, secondId);
  const firstById = new Map(first.blocks.map((block) => [block.id, block]));
  const secondById = new Map(second.blocks.map((block) => [block.id, block]));
  const ids = [...new Set([...firstById.keys(), ...secondById.keys()])];
  return ids.map((id) => {
    const left = firstById.get(id);
    const right = secondById.get(id);
    const differences = [];
    if (!left || !right) differences.push(!left ? 'shown only in the second version' : 'shown only in the first version');
    else {
      if (!sameValue(left.model, right.model)) differences.push('model or scaffold changed');
      if (!sameValue(left.response, right.response)) differences.push('working space changed');
      if (!sameValue(left.composition?.hint, right.composition?.hint)) differences.push('prompt changed');
      if (!sameValue(left.displayText, right.displayText)) differences.push('question values or wording changed');
      if (!sameValue(left.layout, right.layout)) differences.push('page layout changed');
    }
    return { blockId: id, label: left?.displayText ?? right?.displayText ?? id, differences };
  }).filter((entry) => entry.differences.length);
}
