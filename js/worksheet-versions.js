/**
 * Sparse, inherited worksheet versions for Build 3.
 *
 * The master worksheet remains the single source of questions and model data.
 * Variants store only adjustments, so a new master question appears in every
 * version until the teacher changes that specific version.
 */

const VERSION_TYPES = new Set(['master', 'supported', 'standard', 'assessment', 'homework', 'teacher-model', 'answer', 'custom']);
const OUTPUT_VIEWS = new Set(['pupil', 'teacher', 'answer']);

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asText(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function cloneValue(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(cloneValue);
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneValue(child)]));
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mergeValue(base, patch) {
  if (patch === undefined) return cloneValue(base);
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return cloneValue(patch);
  const target = asObject(base);
  const result = { ...cloneValue(target) };
  for (const [key, value] of Object.entries(patch)) result[key] = mergeValue(target[key], value);
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
    .map((block) => mergeValue(block, overrides.blockPatches[block.id]));
  for (const added of overrides.addedBlocks) {
    if (!added?.id || hidden.has(added.id) || baseById.has(added.id)) continue;
    blocks.push(mergeValue(added, overrides.blockPatches[added.id]));
  }
  const metadata = mergeValue(worksheet.metadata, overrides.metadata);
  const settings = mergeValue(worksheet.settings, overrides.settings);
  const architecture = mergeValue(worksheet.architecture, overrides.architecture);
  const pageArrangement = mergeValue(worksheet.pageArrangement, overrides.pageArrangement);
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
