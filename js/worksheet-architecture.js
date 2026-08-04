/**
 * Build 3 worksheet architecture helpers.
 *
 * This module deliberately has no DOM dependency.  It turns the existing
 * ordered Build 2 blocks into a guided page structure without treating a
 * worksheet as a free-positioned canvas.
 */

export const WORKSHEET_PURPOSES = Object.freeze([
  'practice',
  'guided-practice',
  'independent-practice',
  'reasoning',
  'assessment',
  'homework',
  'intervention',
  'mixed-lesson-sheet',
]);

export const COMPOSITION_MODES = Object.freeze(['flow', 'rows', 'deliberate-pages']);

export const SECTION_ROLES = Object.freeze([
  'fluency',
  'guided-practice',
  'independent-practice',
  'reasoning',
  'problem-solving',
  'challenge',
  'reflection',
  'custom',
]);

export const QUESTION_BLOCK_PATTERNS = Object.freeze([
  'compact-question',
  'question-with-working',
  'question-with-model',
  'large-model',
  'reasoning',
  'problem-solving',
  'compare-methods',
  'worked-example',
  'pupil-completion',
  'data',
  'multi-part',
  'challenge',
]);

export const BLOCK_FOOTPRINTS = Object.freeze(['compact', 'standard', 'spacious', 'half', 'full', 'page']);

export const WORKING_SPACE_TYPES = Object.freeze([
  'none',
  'short-answer',
  'short-line',
  'answer-box',
  'writing-lines',
  'lined-explanation',
  'squared-grid',
  'squared-working',
  'calculation-area',
  'open-box',
  'unlined-thinking',
  'model-completion',
  'two-methods',
  'prove-it',
  'table-completion',
  'diagram-construction',
  'labelled-steps',
  'rough-working',
]);

export const STYLE_PRESETS = Object.freeze({
  calm: {
    label: 'Calm',
    settings: { density: 'standard', typeface: 'system', sectionStyle: 'line', lineWeight: 'light', bodyScale: 'standard' },
  },
  clear: {
    label: 'Clear',
    settings: { density: 'standard', typeface: 'sans', sectionStyle: 'line', lineWeight: 'strong', bodyScale: 'standard' },
  },
  compact: {
    label: 'Compact',
    settings: { density: 'compact', typeface: 'sans', sectionStyle: 'plain', lineWeight: 'light', bodyScale: 'small' },
  },
  guided: {
    label: 'Guided',
    settings: { density: 'spacious', typeface: 'system', sectionStyle: 'band', lineWeight: 'standard', bodyScale: 'standard' },
  },
  assessment: {
    label: 'Assessment',
    settings: { density: 'standard', typeface: 'sans', sectionStyle: 'plain', lineWeight: 'strong', bodyScale: 'standard', colorMode: 'monochrome' },
  },
  homework: {
    label: 'Homework',
    settings: { density: 'spacious', typeface: 'system', sectionStyle: 'line', lineWeight: 'standard', bodyScale: 'standard' },
  },
});

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

function oneOf(value, values, fallback) {
  return values.includes(value) ? value : fallback;
}

function words(block) {
  return `${block?.displayText ?? ''} ${block?.extracted?.interpretation?.questionFamily ?? ''}`.toLowerCase();
}

function isCompactFluency(block) {
  const source = String(block?.displayText ?? '').trim();
  const direct = /^(?:(?:calculate|work\s*out|find|solve)\s+)?(\d[\d,]*)\s*[+−\-×*xX÷/]\s*(\d[\d,]*)(?:\s*=\s*(?:[?□_]+)?)?[.?!]?$/i.exec(source);
  if (!direct) return false;
  return direct.slice(1).every((value) => value.replace(/,/g, '').length <= 2);
}

export function purposeToIntent(purpose) {
  if (purpose === 'assessment') return 'assessment';
  if (purpose === 'homework') return 'homework';
  return 'practice';
}

export function normalisePurpose(value, fallback = 'practice') {
  return WORKSHEET_PURPOSES.includes(value) ? value : fallback;
}

export function sectionRoleForBlock(block) {
  const text = words(block);
  // Imported headings are already a useful piece of teacher intent.  Read
  // them directly before falling back to a question's vocabulary, otherwise
  // a concise heading such as “Problem solving” would become a generic
  // custom section simply because it has no question-length context.
  if (/^(?:warm[- ]?up|fluency|quick practice|facts?)\b/.test(text)) return 'fluency';
  if (/^(?:guided practice|guided|worked example|we do)\b/.test(text)) return 'guided-practice';
  if (/^(?:independent practice|independent|you do)\b/.test(text)) return 'independent-practice';
  if (/^(?:reasoning|explain|justify|prove it?)\b/.test(text)) return 'reasoning';
  if (/^(?:problem[ -]?solving|problems?)\b/.test(text)) return 'problem-solving';
  if (/^(?:challenge|stretch|extension)\b/.test(text)) return 'challenge';
  if (/^(?:reflection|review|check)\b/.test(text)) return 'reflection';
  if (/\b(challenge|stretch|deepen|extension)\b/.test(text)) return 'challenge';
  if (/\b(explain|justify|prove|reason|convince|error analysis|mistake|counterexample|compare methods?)\b/.test(text)) return 'reasoning';
  if (/\b(problem|word problem|altogether|how many|how much|context|journey|cost|perimeter|area)\b/.test(text) && text.length > 70) return 'problem-solving';
  if (/\b(modelled|worked example|we do|guided|complete the model)\b/.test(text)) return 'guided-practice';
  if (/\b(calculate|work out|find|complete|round|order|compare|partition|times table|missing number)\b/.test(text) || /[+−×÷]/.test(text)) return 'fluency';
  return 'independent-practice';
}

export function sectionLabel(role) {
  return {
    fluency: 'Fluency',
    'guided-practice': 'Guided practice',
    'independent-practice': 'Independent practice',
    reasoning: 'Reasoning',
    'problem-solving': 'Problem solving',
    challenge: 'Challenge',
    reflection: 'Reflection',
    custom: 'Practice',
  }[role] ?? 'Practice';
}

const PROGRESSION_RANK = Object.freeze({
  'guided-practice': 1,
  fluency: 2,
  'independent-practice': 3,
  reasoning: 4,
  'problem-solving': 5,
  challenge: 6,
  reflection: 7,
  custom: 8,
});

/**
 * Return an explicit, stable progression suggestion. It is never applied
 * implicitly. Existing headings move with their complete group, so imported
 * instructions and section labels do not get separated from their questions.
 */
export function suggestNewQuestionOrder(blocks) {
  const source = Array.isArray(blocks) ? blocks : [];
  const hasHeadings = source.some((block) => block.kind === 'heading');
  const rankFor = (block) => PROGRESSION_RANK[sectionRoleForBlock(block)] ?? PROGRESSION_RANK.custom;
  if (!hasHeadings) {
    return source
      .map((block, index) => ({ block, index }))
      .sort((left, right) => rankFor(left.block) - rankFor(right.block) || left.index - right.index)
      .map((entry) => entry.block);
  }
  const leading = [];
  const groups = [];
  let current = null;
  for (const block of source) {
    if (block.kind === 'heading') {
      current = { blocks: [block], rank: rankFor(block), index: groups.length };
      groups.push(current);
    } else if (current) {
      current.blocks.push(block);
    } else {
      leading.push(block);
    }
  }
  return [
    ...leading,
    ...groups
      .sort((left, right) => left.rank - right.rank || left.index - right.index)
      .flatMap((group) => group.blocks),
  ];
}

export function blockPatternFor(block, purpose = 'practice') {
  const text = words(block);
  const family = block?.extracted?.interpretation?.questionFamily ?? block?.extracted?.recommendation?.family ?? '';
  const subparts = block?.source?.subparts;
  if (Array.isArray(subparts) && subparts.length > 1) return 'multi-part';
  if (/\b(challenge|stretch|extension)\b/.test(text)) return 'challenge';
  if (/\b(compare.*method|two methods|both methods)\b/.test(text)) return 'compare-methods';
  if (/\b(explain|justify|prove|convince|error analysis|mistake|counterexample)\b/.test(text)) return 'reasoning';
  if (/\b(graph|chart|coordinate|construct|draw|plot|shape|perimeter|area)\b/.test(text)) return family.includes('chart') || family.includes('coordinate') ? 'large-model' : 'problem-solving';
  if (/\b(complete.*model|shade|mark.*number line|draw.*hands)\b/.test(text)) return 'pupil-completion';
  if (block?.model) return purpose === 'guided-practice' ? 'question-with-model' : 'question-with-model';
  if (isCompactFluency(block)) return 'compact-question';
  if (/\b(calculate|work out|solve|column|equation|missing number)\b|[+−×÷]/.test(text)) return 'question-with-working';
  return 'compact-question';
}

export function footprintForPattern(pattern, block) {
  if (isCompactFluency(block) && ['compact-question', 'question-with-model'].includes(pattern)) return 'half';
  if (pattern === 'large-model' || pattern === 'problem-solving') return 'full';
  if (pattern === 'reasoning' || pattern === 'compare-methods') return 'spacious';
  if (pattern === 'worked-example') return 'full';
  if (pattern === 'multi-part') return 'full';
  if (pattern === 'challenge') return 'full';
  if (pattern === 'pupil-completion') return 'full';
  if (pattern === 'compact-question' && !(block?.model)) return 'half';
  return 'standard';
}

export function suggestedWorkingSpace(block, purpose = 'practice') {
  const text = words(block);
  const family = block?.extracted?.interpretation?.questionFamily ?? '';
  const assessment = purpose === 'assessment';
  // A response model is itself the place where the pupil records the answer
  // (for example a blank clock, graph or completion diagram). Adding a second
  // generic box wastes page space and makes the intended response route less
  // clear.
  if (block?.model?.purpose === 'response-model') return { type: 'none', size: 'compact', label: '' };
  if (/\b(explain|justify|prove|convince|error analysis|mistake|counterexample)\b/.test(text)) {
    return { type: /\bprove|counterexample\b/.test(text) ? 'prove-it' : 'lined-explanation', size: assessment ? 'standard' : 'generous', lines: assessment ? 4 : 6, label: 'Explain your thinking' };
  }
  if (/\b(compare.*method|two methods)\b/.test(text)) return { type: 'two-methods', size: 'generous', lines: 4, label: 'Show two methods' };
  if (/\b(table|frequency|tally)\b/.test(text)) return { type: 'table-completion', size: 'standard', rows: 4, columns: 3, label: 'Complete the table' };
  if (/\b(graph|chart|plot|coordinate|construct|draw|shade|label.*diagram)\b/.test(text) || /chart|coordinate|symmetry|area-grid/.test(family)) {
    return { type: 'diagram-construction', size: 'generous', rows: 8, label: 'Use the space to construct your model' };
  }
  if (isCompactFluency(block)) return { type: 'answer-box', size: 'small', label: 'Answer' };
  if (/\b(calculate|work out|solve|column|add|subtract|multiply|divide|perimeter|area|duration)\b|[+−×÷]/.test(text)) {
    return { type: assessment ? 'rough-working' : 'calculation-area', size: assessment ? 'standard' : 'medium', rows: assessment ? 5 : 6, label: assessment ? 'Rough working' : 'Show your method' };
  }
  if (/\b(compare|greater|less|equal|which number|what is the value)\b/.test(text)) return { type: 'answer-box', size: 'small', label: 'Answer' };
  if (purpose === 'intervention' || purpose === 'guided-practice') return { type: 'unlined-thinking', size: 'medium', rows: 5, label: 'Show your thinking' };
  return { type: 'short-answer', size: 'small', label: 'Answer' };
}

function normaliseSection(section, blocks) {
  const source = asObject(section);
  const heading = blocks.find((block) => block.id === source.headingId || block.id === source.id);
  const id = asText(source.id, heading?.section ?? heading?.id ?? '');
  if (!id) return null;
  const suppliedRole = oneOf(source.role, SECTION_ROLES, null);
  const role = suppliedRole && (suppliedRole !== 'custom' || source.teacherChosen || heading?.sectionMeta?.teacherChosen)
    ? suppliedRole
    : heading ? sectionRoleForBlock(heading) : 'custom';
  return {
    id,
    headingId: asText(source.headingId, heading?.id ?? id),
    name: asText(source.name, heading?.displayText ?? 'Practice'),
    role,
    layout: oneOf(source.layout, COMPOSITION_MODES, 'flow'),
    startOnNewPage: Boolean(source.startOnNewPage),
    restartNumbering: Boolean(source.restartNumbering),
    style: oneOf(source.style, ['inherit', 'plain', 'line', 'band', 'stage'], 'inherit'),
  };
}

/** Normalise the persisted architecture while retaining Build 2 headings. */
export function normaliseArchitecture(value, blocks = []) {
  const source = asObject(value);
  const declared = Array.isArray(source.sections) ? source.sections.map((section) => normaliseSection(section, blocks)).filter(Boolean) : [];
  const known = new Set(declared.map((section) => section.id));
  const derived = [];
  let current = null;
  for (const block of blocks) {
    if (block.kind === 'heading') {
      const id = block.section || block.id;
      current = id;
      if (!known.has(id)) {
        const section = normaliseSection({ id, headingId: block.id, name: block.displayText, role: block.sectionMeta?.role, teacherChosen: block.sectionMeta?.teacherChosen, style: block.sectionMeta?.style }, blocks);
        if (section) {
          known.add(id);
          derived.push(section);
        }
      }
    } else if (block.section && !known.has(block.section)) {
      const section = normaliseSection({ id: block.section, name: 'Practice', role: sectionRoleForBlock(block) }, blocks);
      if (section) {
        known.add(section.id);
        derived.push(section);
      }
    } else if (!block.section && current) {
      // No mutation here: migration keeps the original source block intact.
    }
  }
  const preset = Object.hasOwn(STYLE_PRESETS, source.stylePreset) ? source.stylePreset : 'calm';
  return {
    purpose: normalisePurpose(source.purpose, 'practice'),
    compositionMode: oneOf(source.compositionMode, COMPOSITION_MODES, 'flow'),
    sections: [...declared, ...derived],
    numbering: {
      mode: oneOf(source.numbering?.mode, ['automatic', 'manual'], 'automatic'),
      restartAtSections: Boolean(source.numbering?.restartAtSections),
    },
    stylePreset: preset,
    header: {
      layout: oneOf(source.header?.layout, ['compact', 'standard', 'spacious'], 'standard'),
      fields: cloneValue(asObject(source.header?.fields)),
    },
    footer: {
      fields: Array.isArray(source.footer?.fields) ? source.footer.fields.filter((field) => typeof field === 'string') : ['title', 'page-number'],
    },
  };
}

/**
 * Apply an intelligent, editable first architecture. It never reorders source
 * questions. Imported headings are preserved and only missing structure is
 * supplied as lightweight heading blocks.
 */
export function suggestWorksheetArchitecture(blocks, options = {}) {
  const purpose = normalisePurpose(options.purpose, 'practice');
  const forceSuggestions = Boolean(options.forceSuggestions);
  const idFactory = options.idFactory ?? ((prefix) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`);
  const source = Array.isArray(blocks) ? blocks : [];
  const hasImportedHeadings = source.some((block) => block.kind === 'heading');
  const output = [];
  const sections = [];
  let currentSectionId = null;
  let currentRole = null;

  const addSection = (name, role, headingBlock = null) => {
    const id = headingBlock?.section || headingBlock?.id || idFactory('section');
    currentSectionId = id;
    currentRole = role;
    sections.push({
      id,
      headingId: headingBlock?.id ?? id,
      name,
      role,
      layout: role === 'fluency' ? 'rows' : 'flow',
      startOnNewPage: false,
      restartNumbering: false,
      style: 'inherit',
    });
    return id;
  };

  for (const sourceBlock of source) {
    let block = cloneValue(sourceBlock);
    if (block.kind === 'heading') {
      const suppliedRole = oneOf(block.sectionMeta?.role, SECTION_ROLES, null);
      const role = suppliedRole && (suppliedRole !== 'custom' || block.sectionMeta?.teacherChosen)
        ? suppliedRole
        : sectionRoleForBlock(block);
      const sectionId = addSection(block.displayText || sectionLabel(role), role, block);
      block.section = sectionId;
      block.sectionMeta = { ...(block.sectionMeta ?? {}), role, style: block.sectionMeta?.style ?? 'inherit' };
      block.layout = { ...(block.layout ?? {}), keepWithNext: true };
      output.push(block);
      continue;
    }
    if (block.kind !== 'question') {
      output.push(block);
      continue;
    }

    const role = sectionRoleForBlock(block);
    if (!currentSectionId || (!hasImportedHeadings && role !== currentRole)) {
      const label = sectionLabel(role);
      const headingId = idFactory('section');
      const heading = {
        id: headingId,
        kind: 'heading',
        originalText: label,
        displayText: label,
        section: headingId,
        sectionMeta: { role, style: 'inherit' },
        response: { type: 'none', size: 'compact' },
        layout: { size: 'compact', keepWithNext: true },
      };
      addSection(label, role, heading);
      output.push(heading);
    }
    // A first draft should not inherit the generic Build 1/2 card defaults as
    // if they were deliberate composition choices.  Later teacher edits can
    // opt out by setting `teacherChosen`; an explicit re-suggest can also
    // intentionally replace those choices.
    const preserveComposition = !forceSuggestions && block.composition?.teacherChosen === true;
    const pattern = preserveComposition ? block.composition.pattern : blockPatternFor(block, purpose);
    const footprint = preserveComposition ? block.composition.footprint : footprintForPattern(pattern, block);
    const response = !forceSuggestions && block.response?.suggested === false && block.response?.teacherChosen === true
      ? block.response
      : suggestedWorkingSpace(block, purpose);
    block.section = block.section || currentSectionId;
    block.composition = {
      pattern,
      footprint,
      keepTogether: block.composition?.keepTogether !== false,
      startOnNewPage: Boolean(block.composition?.startOnNewPage),
      keepWithNext: Boolean(block.composition?.keepWithNext),
      hint: asText(block.composition?.hint),
      vocabulary: Array.isArray(block.composition?.vocabulary) ? block.composition.vocabulary.filter((value) => typeof value === 'string') : [],
      sentenceStem: asText(block.composition?.sentenceStem),
      teacherChosen: preserveComposition,
    };
    block.response = { ...response, suggested: true };
    block.layout = {
      ...(block.layout ?? {}),
      columnSpan: footprint === 'full' || footprint === 'page' ? 'full' : footprint === 'half' ? 'half' : block.layout?.columnSpan ?? 'auto',
      keepWithNext: Boolean(block.layout?.keepWithNext),
    };
    output.push(block);
  }

  return {
    blocks: output,
    architecture: {
      purpose,
      // Rows is still a flowing composition mode: headings and full-width
      // reasoning blocks remain in reading order, while only deliberate
      // compact pairs share a row. This lets an imported Fluency section use
      // space well without disturbing its existing section order.
      compositionMode: sections.some((section) => section.layout === 'rows') ? 'rows' : 'flow',
      sections,
      numbering: { mode: 'automatic', restartAtSections: false },
      stylePreset: purpose === 'assessment' ? 'assessment' : purpose === 'homework' ? 'homework' : purpose === 'guided-practice' || purpose === 'intervention' ? 'guided' : 'calm',
      header: { layout: 'standard', fields: {} },
      footer: { fields: ['title', 'page-number'] },
    },
  };
}

export function presetSettings(preset) {
  return cloneValue(STYLE_PRESETS[preset]?.settings ?? STYLE_PRESETS.calm.settings);
}

export function sectionForBlock(architecture, blockId) {
  const sections = architecture?.sections ?? [];
  return sections.find((section) => section.blockIds?.includes(blockId)) ?? null;
}
