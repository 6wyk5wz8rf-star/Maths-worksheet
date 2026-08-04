import { parseQuestions, extractMathInfo } from './parser.js';
import { matchQuestionToModels, createModelRecipe as createMatchedRecipe, evaluateAnswerLeak } from './matcher.js';
import { YEAR4_DOMAINS, QUESTION_FAMILIES, REPRESENTATION_PURPOSES } from './question-intelligence.js';
import { BUILD2_MODEL_CATEGORIES, getBuild2ModelDefinition, searchBuild2Models } from './build2-model-bank.js';
import {
  listModelDefinitions,
  getModelDefinition,
  createModelRecipe as createRegistryRecipe,
  normalizeRecipe,
  validateRecipe,
  isAnswerRevealRisk,
} from './model-registry.js';
import { renderModel, renderModelPreview } from './model-renderers.js';
import {
  createWorksheet,
  createQuestionBlock,
  createResponseRecipe,
  createStore,
  loadCurrentProject,
  listProjects,
  deleteProject,
  duplicateProject as duplicateStoredProject,
  saveProject,
  worksheetActions,
  createId,
} from './state.js';
import { paginateWorksheet, mmToPx } from './pagination.js';

const SAMPLE_TEXT = `Place value

1. What is the value of the digit 4 in 3,482? [1 mark]
2. Partition 6,407 in two different ways.
3. Mark 2,750 on a number line from 2,000 to 3,000.

Calculations

4. Calculate 4,003 − 1,786. [2 marks]
5. There are 6 bags with 8 apples in each bag. How many apples are there altogether?
6. Shade 3/8 of the fraction strip.`;

const DRAFT_KEY = 'maths-page-studio:paste-draft';
const STAGE_KEY = 'maths-page-studio:last-stage';
const PAGE_WIDTH_PX = mmToPx(210);
const PAGE_HEIGHT_PX = mmToPx(297);
const ACCENTS = ['#514d86', '#41656a', '#856153', '#6d617d', '#42617f', '#5f6f4f'];

const root = document.querySelector('#main');
const toastRegion = document.querySelector('#toast-region');
const confirmDialog = document.querySelector('#confirm-dialog');
const projectDialog = document.querySelector('#project-dialog');
const settingsDialog = document.querySelector('#settings-dialog');

const recovered = loadCurrentProject();
const initialWorksheet = recovered ?? createWorksheet();
let store = createStore(initialWorksheet, { autosave: true, autosaveDelay: 140, saveInitial: Boolean(recovered) });
const rememberedStage = readStage();
let ui = {
  stage: rememberedStage === 'check' && initialWorksheet.blocks.length
    ? 'check'
    : rememberedStage === 'paste'
      ? 'paste'
      : initialWorksheet.blocks.length ? 'make' : 'paste',
  rawDraft: readDraft() || initialWorksheet.originalImport.rawText || '',
  selectedId: initialWorksheet.blocks.find((block) => block.kind === 'question')?.id ?? initialWorksheet.blocks[0]?.id ?? null,
  editingId: null,
  editBuffer: '',
  browseModels: false,
  modelSearch: '',
  modelCategory: '',
  editingInterpretation: false,
  inspectorOpen: false,
  navigatorOpen: false,
  dragging: null,
  lastPagination: null,
};

function readDraft() {
  try { return localStorage.getItem(DRAFT_KEY) ?? ''; } catch { return ''; }
}

function writeDraft(value) {
  try { localStorage.setItem(DRAFT_KEY, value); } catch { /* storage can be unavailable in private browsing */ }
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* no-op */ }
}

function readStage() {
  try { return localStorage.getItem(STAGE_KEY); } catch { return null; }
}

function writeStage(stage) {
  try { localStorage.setItem(STAGE_KEY, stage === 'print' ? 'make' : stage); } catch { /* no-op */ }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttr(value) { return escapeHtml(value); }

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Saved locally';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
}

function icon(name) {
  const paths = {
    up: '<path d="m7 14 5-5 5 5"/>',
    down: '<path d="m7 10 5 5 5-5"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    edit: '<path d="M4 20h4l11-11-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
    copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7"/>',
    split: '<path d="M12 3v18M6 6H3v12h3M18 6h3v12h-3"/>',
    join: '<path d="M4 7h7v4M20 17h-7v-4"/><path d="m8 14 3-3-3-3m8 2-3 3 3 3"/>',
    handle: '<path fill="currentColor" stroke="none" d="M8 5h2v2H8zm6 0h2v2h-2zM8 11h2v2H8zm6 0h2v2h-2zM8 17h2v2H8zm6 0h2v2h-2z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
    print: '<path d="M7 9V3h10v6M7 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M7 14h10v7H7z"/>',
    pages: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    model: '<circle cx="8" cy="8" r="4"/><rect x="13" y="4" width="7" height="8" rx="1"/><path d="M4 18h16"/>',
    question: '<path d="M9.1 9a3 3 0 1 1 4.8 2.4c-1.2.9-1.9 1.4-1.9 2.6M12 18h.01"/><circle cx="12" cy="12" r="9"/>',
  };
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] ?? ''}</svg>`;
}

function toast(message, tone = '') {
  const item = document.createElement('div');
  item.className = `toast ${tone}`.trim();
  item.textContent = message;
  toastRegion.append(item);
  setTimeout(() => item.remove(), 3200);
}

function askConfirm({ title, message, actionLabel = 'Remove' }) {
  document.querySelector('#confirm-title').textContent = title;
  document.querySelector('#confirm-message').textContent = message;
  document.querySelector('#confirm-action').textContent = actionLabel;
  confirmDialog.showModal();
  return new Promise((resolve) => {
    confirmDialog.addEventListener('close', () => resolve(confirmDialog.returnValue === 'confirm'), { once: true });
  });
}

function intentCopy(intent) {
  if (intent === 'assessment') return '<strong>Assessment:</strong> models stay restrained, and anything that may reveal the method is flagged.';
  if (intent === 'homework') return '<strong>Homework:</strong> enough orientation for independent work, without completing the thinking.';
  return '<strong>Practice:</strong> useful structures and partly completed representations can support the pupil.';
}

function responseForQuestion(block, intent) {
  const text = block.displayText.toLowerCase()
    .replace(/\[\s*\d+\s*(?:marks?|m)\s*\]/gi, ' ')
    .replace(/\(\s*\d+\s*(?:marks?|m)\s*\)/gi, ' ')
    .replace(/\b\d+\s+marks?\s*$/gi, ' ');
  if (block.kind !== 'question') return createResponseRecipe({ type: 'none', size: 'compact' });
  if (/\b(explain|prove|justify|reason|convince|describe)\b/.test(text)) {
    return createResponseRecipe({ type: 'writing-lines', size: intent === 'assessment' ? 'generous' : 'standard', lines: 4 });
  }
  if (/\b(draw|shade|complete|mark|plot|label)\b/.test(text)) {
    return createResponseRecipe({ type: 'model-completion', size: 'standard' });
  }
  if (/\b(calculate|work out|solve|show your working)\b|[+−×÷]/.test(text)) {
    return createResponseRecipe({ type: 'squared-grid', size: intent === 'assessment' ? 'standard' : 'compact' });
  }
  if (text.length > 130 || /\bhow (?:many|much)\b/.test(text)) {
    return createResponseRecipe({ type: 'open-box', size: 'standard' });
  }
  return createResponseRecipe({ type: 'short-answer', size: 'compact' });
}

function warningObjects(messages = []) {
  return messages.map((message, index) => ({
    code: `matching-${index}-${String(message).slice(0, 20).replace(/\W+/g, '-').toLowerCase()}`,
    severity: 'warning',
    message,
  }));
}

function textIncludesMarks(text) {
  return /\[\s*\d+\s*(?:marks?|m)\s*\]|\(\s*\d+\s*marks?\s*\)|\b\d+\s+marks?\s*$/i.test(String(text));
}

function parsedItemsToBlocks(parsed) {
  return parsed.items.map((item) => {
    const kind = item.type === 'section-heading' ? 'heading' : item.type === 'shared-instruction' ? 'instruction' : 'question';
    const extracted = item.mathInfo ?? (kind === 'question' ? extractMathInfo(item.displayText) : {});
    return createQuestionBlock({
      kind,
      originalText: item.originalText,
      displayText: item.displayText,
      marks: item.marks,
      extracted: { ...extracted, sourceLabel: item.sourceLabel ?? null, sourceMarker: item.sourceMarker ?? null },
      response: kind === 'question' ? responseForQuestion({ ...item, kind }, store.getState().intent) : { type: 'none', size: 'compact' },
      layout: { size: kind === 'question' ? 'standard' : 'compact', keepWithNext: kind !== 'question' },
    });
  });
}

function modelBindingMode(model) {
  if (!model) return 'none';
  if (model.metadata?.binding?.mode === 'detached') return 'detached';
  if (model.metadata?.binding?.mode === 'bound') return 'bound';
  if (model.linked === false) return 'detached';
  return 'bound';
}

function withModelBinding(recipe, mode = 'bound', teacherChosen = false) {
  if (!recipe) return null;
  const bound = mode !== 'detached';
  return {
    ...recipe,
    linked: bound,
    teacherChosen,
    metadata: {
      ...(recipe.metadata ?? {}),
      binding: { ...(recipe.metadata?.binding ?? {}), mode: bound ? 'bound' : 'detached', source: 'question' },
      linked: bound,
      teacherChosen,
    },
  };
}

function matchForBlock(block, worksheet = store.getState()) {
  return matchQuestionToModels(block.displayText, {
    intent: worksheet.intent,
    interpretationOverrides: block.extracted?.interpretationOverrides ?? {},
  });
}

function safeBoundRecipe(match, worksheet, currentModel = null, options = {}) {
  const currentFamily = options.preferCurrent && currentModel?.family ? currentModel.family : null;
  const preferred = currentFamily
    ? createMatchedRecipe(currentFamily, match.extracted, {
      intent: worksheet.intent,
      interpretation: match.interpretation,
      interpretationOverrides: options.interpretationOverrides ?? {},
      completionState: currentModel.completionState,
      purpose: currentModel.purpose,
      size: currentModel.size,
      position: currentModel.position,
    })
    : null;
  const source = preferred ?? match.provisionalRecipe ?? match.suggestions[0]?.recipe ?? null;
  if (!source) return null;
  const candidate = createRegistryRecipe(source.family, source);
  const validation = validateRecipe(candidate, { intent: worksheet.intent });
  return validation.valid ? withModelBinding(validation.normalizedRecipe, 'bound') : null;
}

function reanalyseQuestionBlock(block, options = {}) {
  if (!block || block.kind !== 'question') return block;
  const worksheet = store.getState();
  const match = matchForBlock(block, worksheet);
  const isBound = modelBindingMode(block.model) === 'bound';
  const replaceChoice = Boolean(options.replaceChoice);
  const nextModel = block.extracted?.modelChoice === 'none'
    ? null
    : (!block.model || isBound || replaceChoice)
      ? safeBoundRecipe(match, worksheet, block.model, {
        preferCurrent: isBound && !replaceChoice,
        interpretationOverrides: block.extracted?.interpretationOverrides ?? {},
      })
      : block.model;
  const mergeWarnings = [...(block.warnings ?? []), ...warningObjects(match.warnings)];
  const warningsByCode = new Map(mergeWarnings.map((warning) => [warning.code, warning]));
  return {
    ...block,
    extracted: {
      ...match.extracted,
      ...(block.extracted?.modelChoice ? { modelChoice: block.extracted.modelChoice } : {}),
      ...(block.extracted?.interpretationOverrides ? { interpretationOverrides: block.extracted.interpretationOverrides } : {}),
      recommendation: {
        family: match.suggestions[0]?.family ?? null,
        confidence: match.confidence,
        needsReview: match.interpretation?.needsReview ?? false,
      },
    },
    model: nextModel,
    warnings: [...warningsByCode.values()],
  };
}

function reanalyseCurrentBlock(options = {}) {
  const block = selectedBlock();
  if (!block || block.kind !== 'question') return;
  store.dispatch(worksheetActions.updateBlock(block.id, reanalyseQuestionBlock(block, options)));
}

function buildFirstDraft() {
  const worksheet = store.getState();
  const blocks = worksheet.blocks.map((block) => {
    if (block.kind !== 'question') return block;
    const match = matchForBlock(block, worksheet);
    const alreadyComposed = Boolean(block.model) || Boolean(block.extracted?.modelChoice);
    // Build 2 intentionally gives a useful first draft for a medium reading
    // too, but the resulting card makes the reading easy to review.  The
    // recipe itself remains pupil-safe and keeps required unknowns hidden.
    const assessmentSafe = worksheet.intent !== 'assessment' || match.suggestions[0]?.answerRevealRisk === 'none';
    const model = block.extracted?.modelChoice === 'none'
      ? null
      : block.model ?? (assessmentSafe ? safeBoundRecipe(match, worksheet, null, {
        interpretationOverrides: block.extracted?.interpretationOverrides ?? {},
      }) : null);
    const warningList = [...(block.warnings ?? []), ...warningObjects(match.warnings)];
    const warnings = [...new Map(warningList.map((warning) => [warning.code, warning])).values()];
    return {
      ...block,
      extracted: {
        ...match.extracted,
        ...(block.extracted?.modelChoice ? { modelChoice: block.extracted.modelChoice } : {}),
        ...(block.extracted?.interpretationOverrides ? { interpretationOverrides: block.extracted.interpretationOverrides } : {}),
        recommendation: {
          family: match.suggestions[0]?.family ?? null,
          confidence: match.confidence,
          needsReview: match.interpretation?.needsReview ?? false,
        },
      },
      model,
      response: alreadyComposed
        ? block.response
        : model?.purpose === 'response-model'
          ? createResponseRecipe({ type: 'none', size: 'compact' })
          : responseForQuestion(block, worksheet.intent),
      warnings,
    };
  });
  store.dispatch(worksheetActions.replaceBlocks(blocks));
  ui.selectedId = blocks.find((block) => block.kind === 'question')?.id ?? blocks[0]?.id ?? null;
  ui.stage = 'make';
  clearDraft();
  render();
}

function beginCheck() {
  const raw = ui.rawDraft.trim() ? ui.rawDraft : store.getState().originalImport.rawText;
  if (!raw.trim()) {
    toast('Paste at least one question first.', 'warning');
    document.querySelector('#question-paste')?.focus();
    return;
  }
  const parsed = parseQuestions(raw);
  if (!parsed.questions.length) {
    toast('I could not find a clear question yet. Check the pasted text.', 'warning');
    return;
  }
  store.dispatch(worksheetActions.setOriginalImport(raw, { importedAt: new Date().toISOString(), source: 'plain-text' }));
  store.dispatch(worksheetActions.replaceBlocks(parsedItemsToBlocks(parsed)));
  ui.stage = 'check';
  ui.editingId = null;
  render();
  if (parsed.warnings.length) toast(parsed.warnings[0], 'warning');
}

function renderPaste() {
  const count = ui.rawDraft.trim().length;
  return `<section class="stage-shell narrow paste-stage" aria-labelledby="paste-title">
    <header class="stage-heading">
      <span class="eyebrow">Start with what you already have</span>
      <h1 id="paste-title">Paste your questions</h1>
      <p>Bring a lesson, homework or assessment set. The wording stays yours; the page becomes easier to build.</p>
    </header>
    <div class="paste-card">
      <label class="paste-label" for="question-paste">
        <span>Question text</span>
        <span class="paste-count">${count ? `${count.toLocaleString()} characters` : 'Plain text'}</span>
      </label>
      <textarea id="question-paste" class="paste-area" spellcheck="true" placeholder="Paste numbered questions, bullet points or ordinary text here…">${escapeHtml(ui.rawDraft)}</textarea>
      <div class="paste-footer">
        <button type="button" class="ghost sample-button" data-action="use-sample">Use a short sample</button>
        <button type="button" class="primary paste-next" data-action="begin-check">Separate my questions <span aria-hidden="true">→</span></button>
      </div>
    </div>
    <p class="privacy-note">${icon('lock')} Stays on this device. Nothing is uploaded.</p>
  </section>`;
}

function renderIntent(worksheet) {
  return `<div>
    <div class="intent-panel" role="group" aria-label="Worksheet intent">
      ${['practice', 'homework', 'assessment'].map((intent) => `<button type="button" class="intent-option ${worksheet.intent === intent ? 'is-selected' : ''}" data-action="set-intent" data-value="${intent}" aria-pressed="${worksheet.intent === intent}">${intent[0].toUpperCase() + intent.slice(1)}</button>`).join('')}
    </div>
  </div>`;
}

function renderCheckCard(block, index, blocks) {
  const isEditing = ui.editingId === block.id;
  const label = block.kind === 'heading' ? 'Section heading' : block.kind === 'instruction' ? 'Shared instruction' : `Question ${block.number ?? index + 1}`;
  if (isEditing) {
    return `<article class="check-card ${block.kind === 'heading' ? 'is-heading' : ''}" data-block-id="${block.id}">
      <button type="button" class="drag-handle" aria-label="Drag ${escapeAttr(label)}" draggable="true" data-drag-id="${block.id}">${icon('handle')}</button>
      <div class="check-card-main">
        <span class="check-number">${escapeHtml(label)}</span>
        <textarea class="check-edit-area" id="edit-${block.id}" data-role="edit-buffer">${escapeHtml(ui.editBuffer)}</textarea>
        <div class="inspector-actions">
          <button type="button" class="primary" data-action="save-block-edit" data-id="${block.id}">Save wording</button>
          <button type="button" class="secondary" data-action="split-at-cursor" data-id="${block.id}">${icon('split')} Split at cursor</button>
        </div>
      </div>
      <button type="button" class="tool-button" data-action="cancel-block-edit" aria-label="Cancel edit">×</button>
    </article>`;
  }
  return `<article class="check-card ${block.kind === 'heading' ? 'is-heading' : ''}" data-block-id="${block.id}" data-drop-index="${index}">
    <button type="button" class="drag-handle" aria-label="Drag ${escapeAttr(label)}" draggable="true" data-drag-id="${block.id}">${icon('handle')}</button>
    <div class="check-card-main">
      <span class="check-number">${escapeHtml(label)} ${block.kind !== 'question' ? `<span class="type-pill">${block.kind === 'heading' ? 'Heading' : 'Instruction'}</span>` : ''}</span>
      <p class="check-text">${escapeHtml(block.displayText)}${block.marks && !textIncludesMarks(block.displayText) ? `<span class="marks">[${block.marks} ${block.marks === 1 ? 'mark' : 'marks'}]</span>` : ''}</p>
    </div>
    <div class="card-tools">
      <button type="button" class="tool-button move-tool" data-action="move-block" data-id="${block.id}" data-direction="up" aria-label="Move ${escapeAttr(label)} up" ${index === 0 ? 'disabled' : ''}>${icon('up')}</button>
      <button type="button" class="tool-button move-tool" data-action="move-block" data-id="${block.id}" data-direction="down" aria-label="Move ${escapeAttr(label)} down" ${index === blocks.length - 1 ? 'disabled' : ''}>${icon('down')}</button>
      <button type="button" class="tool-button" data-action="edit-block" data-id="${block.id}" aria-label="Edit ${escapeAttr(label)}">${icon('edit')}</button>
      <details class="overflow-menu">
        <summary class="tool-button" aria-label="More actions for ${escapeAttr(label)}">${icon('more')}</summary>
        <div class="menu-popover">
          <button type="button" data-action="set-kind" data-id="${block.id}" data-kind="${block.kind === 'heading' ? 'question' : 'heading'}">${icon('pages')} ${block.kind === 'heading' ? 'Make a question' : 'Make a section heading'}</button>
          <button type="button" data-action="join-block" data-id="${block.id}" data-direction="previous" ${index === 0 ? 'disabled' : ''}>${icon('join')} Join with previous</button>
          <button type="button" data-action="join-block" data-id="${block.id}" data-direction="next" ${index === blocks.length - 1 ? 'disabled' : ''}>${icon('join')} Join with next</button>
          <button type="button" data-action="duplicate-block" data-id="${block.id}">${icon('copy')} Duplicate</button>
          <button type="button" class="danger-text" data-action="remove-block" data-id="${block.id}">${icon('trash')} Remove</button>
        </div>
      </details>
    </div>
  </article>`;
}

function renderCheck() {
  const worksheet = store.getState();
  const questionCount = worksheet.blocks.filter((block) => block.kind === 'question').length;
  return `<section class="stage-shell check-stage" aria-labelledby="check-title">
    <div class="check-topline">
      <header class="stage-heading">
        <span class="eyebrow">Check the separation</span>
        <h1 id="check-title">Does this look right?</h1>
        <p>The wording is untouched. Repair only the cards that need it.</p>
      </header>
      ${renderIntent(worksheet)}
    </div>
    <div class="intent-note">${intentCopy(worksheet.intent)}</div>
    <div class="question-check-list" aria-label="Imported question cards">
      ${worksheet.blocks.map((block, index) => renderCheckCard(block, index, worksheet.blocks)).join('')}
    </div>
    <div class="check-actions">
      <div>
        <div class="check-summary"><strong>${questionCount}</strong> ${questionCount === 1 ? 'question' : 'questions'} ready</div>
        <button type="button" class="ghost" data-action="restore-original">Restore original paste</button>
      </div>
      <button type="button" class="primary" data-action="make-worksheet">Make my worksheet <span aria-hidden="true">→</span></button>
    </div>
  </section>`;
}

function selectedBlock(worksheet = store.getState()) {
  return worksheet.blocks.find((block) => block.id === ui.selectedId) ?? null;
}

function getPath(object, path) {
  return path.split('.').reduce((value, key) => value?.[key], object);
}

function setPath(object, path, value) {
  const copy = structuredClone(object);
  const keys = path.split('.');
  let cursor = copy;
  keys.slice(0, -1).forEach((key) => {
    if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
    cursor = cursor[key];
  });
  cursor[keys.at(-1)] = value;
  return copy;
}

function formatFieldValue(value, type) {
  if (value == null) return '';
  if (type === 'fraction-list') return (Array.isArray(value) ? value : []).map((item) => `${item.numerator}/${item.denominator}`).join(', ');
  if (type === 'marker-list') return (Array.isArray(value) ? value : []).map((item) => `${item.value}:${item.label ?? item.value}`).join(', ');
  if (type === 'table-rows') return (Array.isArray(value) ? value : []).map((row) => (Array.isArray(row) ? row.join(' | ') : String(row))).join('\n');
  if (type === 'point-list') return (Array.isArray(value) ? value : []).map((point) => `${point.x}:${point.y}${point.label ? `:${point.label}` : ''}`).join(', ');
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

function parseFieldValue(raw, type) {
  if (type === 'boolean') return Boolean(raw);
  const value = String(raw).trim();
  if (['integer', 'number'].includes(type)) return value === '' ? null : Number(value.replaceAll(',', ''));
  if (['number-list', 'integer-list', 'digit-list'].includes(type)) {
    if (!value) return [];
    return value.split(/\s*,\s*/).filter(Boolean).map((item) => Number(item.replaceAll(',', '')));
  }
  if (type === 'text-list') return value ? value.split(/\s*,\s*/).filter(Boolean) : [];
  if (type === 'fraction-list') {
    return value.split(/\s*,\s*/).filter(Boolean).map((item) => {
      const [numerator, denominator] = item.split('/').map(Number);
      return { numerator, denominator, whole: 1, label: '' };
    });
  }
  if (type === 'marker-list') {
    return value.split(/\s*,\s*/).filter(Boolean).map((item) => {
      const [number, ...labelParts] = item.split(':');
      const markerValue = Number(number.replaceAll(',', ''));
      return { value: markerValue, label: labelParts.join(':').trim() || String(markerValue) };
    });
  }
  if (type === 'table-rows') {
    return value ? value.split(/\n+/).map((row) => row.split(/\s*\|\s*/).map((cell) => cell.trim())) : [];
  }
  if (type === 'point-list') {
    return value.split(/\s*,\s*/).filter(Boolean).map((point, index) => {
      const [x, y, label] = point.split(':').map((entry) => entry.trim());
      return { x: Number(x), y: Number(y), label: label || String.fromCharCode(65 + index) };
    });
  }
  return value;
}

function fieldOptions(field, recipe) {
  if (field.type === 'choice') return field.options ?? [];
  if (field.type === 'place-key') return ['ones', 'tens', 'hundreds', 'thousands', 'ten-thousands', 'hundred-thousands', 'millions'];
  if (field.type === 'part-selector') {
    const count = Array.isArray(recipe.values?.parts) ? recipe.values.parts.length : 2;
    return ['whole', ...Array.from({ length: count }, (_, index) => `part:${index}`)];
  }
  if (field.type === 'fraction-selector') {
    const count = Array.isArray(recipe.values?.fractions) ? recipe.values.fractions.length : 1;
    return Array.from({ length: count }, (_, index) => `fraction:${index}:numerator`);
  }
  return null;
}

function humanOption(value) {
  return String(value).replaceAll('-', ' ').replaceAll(':', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function renderEditorField(field, recipe) {
  const options = fieldOptions(field, recipe);
  const value = getPath(recipe, field.key);
  const hint = field.type === 'fraction-list'
    ? 'Use fractions such as 3/8, 1/2'
    : field.type === 'marker-list'
      ? 'Use value:label, for example 2750:?'
      : ['number-list', 'integer-list', 'digit-list', 'text-list'].includes(field.type)
        ? 'Separate values with commas'
        : '';
  if (options) {
    return `<div class="field">
      <label for="model-${escapeAttr(field.key)}">${escapeHtml(field.label)}</label>
      <select id="model-${escapeAttr(field.key)}" data-role="model-field" data-path="${escapeAttr(field.key)}" data-type="${field.type}">
        ${field.optional ? '<option value="">Not shown</option>' : ''}
        ${options.map((option) => `<option value="${escapeAttr(option)}" ${String(value) === String(option) ? 'selected' : ''}>${escapeHtml(humanOption(option))}</option>`).join('')}
      </select>
    </div>`;
  }
  if (field.type === 'boolean') {
    return `<div class="switch-row"><span>${escapeHtml(field.label)}</span><label class="switch"><input type="checkbox" data-role="model-field" data-path="${escapeAttr(field.key)}" data-type="boolean" ${value ? 'checked' : ''}><span></span></label></div>`;
  }
  const inputType = ['integer', 'number', 'decimal'].includes(field.type) ? 'number' : 'text';
  const multiLine = ['table-rows'].includes(field.type);
  const full = ['fraction-list', 'marker-list', 'number-list', 'integer-list', 'digit-list', 'text-list', 'table-rows', 'point-list'].includes(field.type);
  return `<div class="field ${full ? 'full' : ''}">
    <label for="model-${escapeAttr(field.key)}">${escapeHtml(field.label)}</label>
    ${multiLine
      ? `<textarea id="model-${escapeAttr(field.key)}" data-role="model-field" data-path="${escapeAttr(field.key)}" data-type="${field.type}" ${field.optional ? '' : 'required'}>${escapeHtml(formatFieldValue(value, field.type))}</textarea>`
      : `<input id="model-${escapeAttr(field.key)}" type="${inputType}" value="${escapeAttr(formatFieldValue(value, field.type))}" data-role="model-field" data-path="${escapeAttr(field.key)}" data-type="${field.type}" ${field.min != null ? `min="${field.min}"` : ''} ${field.max != null ? `max="${field.max}"` : ''} ${field.optional ? '' : 'required'}>`}
    ${hint ? `<span class="field-hint">${escapeHtml(hint)}</span>` : ''}
  </div>`;
}

function safeRecipeForPreview(recipe, intent = store.getState().intent) {
  if (!recipe) return null;
  const result = normalizeRecipe(recipe);
  return result.recipe ?? recipe;
}

function modelSuggestionCard(suggestion, label = null, instanceId = 'preview') {
  const recipe = createRegistryRecipe(suggestion.recipe.family, suggestion.recipe);
  const preview = renderModelPreview(safeRecipeForPreview(recipe), { intent: store.getState().intent, instanceId: `${instanceId}-${recipe.family}` });
  return `<button type="button" class="suggestion-card" draggable="true" data-action="attach-model" data-family="${recipe.family}" data-drag-family="${recipe.family}">
    <span class="suggestion-preview">${preview}</span>
    <span class="suggestion-copy">
      <strong>${escapeHtml(label ?? suggestion.label ?? getModelDefinition(recipe.family)?.name)}</strong>
      <span>${escapeHtml(suggestion.reason ?? suggestion.mathematicalPurpose ?? getModelDefinition(recipe.family)?.mathematicalPurpose)}</span>
      ${suggestion.confidence ? `<span class="confidence ${suggestion.confidence === 'medium' ? 'medium' : ''}">${escapeHtml(suggestion.confidence)} match</span>` : ''}
    </span>
  </button>`;
}

function manualRecipeFor(family, block) {
  const matchRecipe = createMatchedRecipe(family, block.extracted?.numericValues ? block.extracted : block.displayText, { intent: store.getState().intent });
  if (matchRecipe) return createRegistryRecipe(family, matchRecipe);
  const values = block.extracted?.numericValues ?? [];
  const patch = {};
  if (family === 'place-value' || family === 'base-ten') patch.values = { number: Math.max(0, Math.trunc(values[0] ?? 3482)) };
  if (family === 'partition') {
    const whole = Math.max(0, Math.trunc(values[0] ?? 3482));
    const parts = String(whole).split('').map((digit, index, digits) => Number(digit) * 10 ** (digits.length - index - 1)).filter(Boolean);
    patch.values = { whole, parts: parts.length >= 2 ? parts : [Math.max(1, whole - 1), 1] };
  }
  return createRegistryRecipe(family, patch);
}

function renderAttachedModel(block, worksheet) {
  const model = block.model;
  const definition = getModelDefinition(model.family);
  const build2 = Boolean(getBuild2ModelDefinition(model.family));
  const scaffold = build2 ? (model.scaffoldState ?? 'guided') : model.completionState;
  const completionChoices = build2
    ? [['blank', 'Blank'], ['guided', 'Guided'], ['modelled', 'Modelled']]
    : [['blank', 'Blank'], ['partly-completed', 'Partly'], ['completed', 'Completed']];
  const validation = validateRecipe(model, { intent: worksheet.intent });
  const warnings = [...validation.warnings, ...validation.errors];
  return `<section class="inspector-section">
    <h3>${escapeHtml(definition?.name ?? 'Attached model')}</h3>
    <div class="choice-grid three" role="group" aria-label="Model completion state">
      ${completionChoices.map(([value, label]) => `<button type="button" class="choice-button ${scaffold === value ? 'is-selected' : ''}" data-action="set-model-option" data-key="${build2 ? 'scaffoldState' : 'completionState'}" data-value="${value}">${label}</button>`).join('')}
    </div>
    ${worksheet.intent === 'assessment' && (model.completionState !== 'blank' || isAnswerRevealRisk(model, { intent: worksheet.intent })) ? `<div class="warning-card"><strong>Assessment check</strong><span>This model may reveal a method, relationship or answer. Keep it only if that support is intentional.</span></div>` : ''}
    <div class="inspector-section">
      <h3>Mathematical values</h3>
      <div class="field-grid">${(definition?.editorFields ?? []).map((field) => renderEditorField(field, model)).join('')}</div>
      ${warnings.length ? `<div class="warning-card"><strong>${validation.valid ? 'Check this model' : 'Cannot show safely'}</strong><span>${escapeHtml(warnings[0].message)}</span></div>` : ''}
    </div>
    <div class="inspector-section">
      <h3>Purpose</h3>
      <div class="choice-grid">
        ${[
          ['question-information', 'Question info'],
          ['thinking-model', 'Thinking model'],
          ['response-model', 'Pupil completes'],
          ['worked-example', 'Worked example'],
        ].map(([value, label]) => `<button type="button" class="choice-button ${model.purpose === value ? 'is-selected' : ''}" data-action="set-model-option" data-key="purpose" data-value="${value}">${label}</button>`).join('')}
      </div>
    </div>
    <div class="inspector-section">
      <h3>Placement</h3>
      <div class="choice-grid three">
        ${['above', 'beside', 'beneath'].map((value) => `<button type="button" class="choice-button ${model.position === value ? 'is-selected' : ''}" data-action="set-model-option" data-key="position" data-value="${value}">${humanOption(value)}</button>`).join('')}
      </div>
      <div class="choice-grid three" style="margin-top:6px">
        ${['compact', 'standard', 'large'].map((value) => `<button type="button" class="choice-button ${model.size === value ? 'is-selected' : ''}" data-action="set-model-option" data-key="size" data-value="${value}">${humanOption(value)}</button>`).join('')}
      </div>
    </div>
    <div class="switch-row">
      <span>${modelBindingMode(model) === 'bound' ? 'Linked to question' : 'Detached model'}<small class="field-hint">${modelBindingMode(model) === 'bound' ? ' Values update when the wording or reading changes.' : ' Custom values stay independent.'}</small></span>
      <label class="switch"><input type="checkbox" data-role="model-binding-toggle" ${modelBindingMode(model) === 'bound' ? 'checked' : ''}><span></span></label>
    </div>
    <div class="switch-row">
      <span>Complete this model in the teacher version</span>
      <label class="switch"><input type="checkbox" data-role="teacher-model-toggle" ${block.teacher.completedModel ? 'checked' : ''}><span></span></label>
    </div>
    <div class="inspector-actions">
      <button type="button" class="secondary" data-action="browse-models">Replace model</button>
      <button type="button" class="ghost" data-action="remove-model" aria-label="Remove attached model">${icon('trash')}</button>
    </div>
    <button type="button" class="ghost full-width" data-action="apply-similar-model" style="margin-top:6px">Apply this model to similar questions</button>
  </section>`;
}

function renderResponseControls(block) {
  const response = block.response ?? createResponseRecipe();
  const options = [
    ['none', 'None'],
    ['short-answer', 'Answer line'],
    ['writing-lines', 'Writing lines'],
    ['squared-grid', 'Squared grid'],
    ['open-box', 'Open box'],
    ['model-completion', 'Model space'],
  ];
  return `<section class="inspector-section">
    <h3>Pupil response space</h3>
    <div class="field full">
      <label for="response-type">Space type</label>
      <select id="response-type" data-role="response-type">${options.map(([value, label]) => `<option value="${value}" ${response.type === value ? 'selected' : ''}>${label}</option>`).join('')}</select>
    </div>
    <div class="choice-grid three" style="margin-top:8px">
      ${['compact', 'standard', 'generous'].map((value) => `<button type="button" class="choice-button ${response.size === value ? 'is-selected' : ''}" data-action="set-response-size" data-value="${value}">${humanOption(value)}</button>`).join('')}
    </div>
  </section>`;
}

function isBuild2Model(family) {
  return Boolean(getBuild2ModelDefinition(family));
}

function bankDefinitionsForPicker() {
  const query = ui.modelSearch.trim();
  if (ui.modelCategory && ui.modelCategory !== 'Build 1 essentials') {
    return searchBuild2Models(query, { category: ui.modelCategory });
  }
  if (ui.modelCategory === 'Build 1 essentials') {
    const lower = query.toLowerCase();
    return listModelDefinitions().filter((definition) => !isBuild2Model(definition.id)).filter((definition) => !lower || [
      definition.name, definition.purpose, ...(definition.matchingTags ?? []), definition.id,
    ].join(' ').toLowerCase().includes(lower));
  }
  if (!query) return [];
  const build2 = searchBuild2Models(query);
  const legacy = listModelDefinitions().filter((definition) => !isBuild2Model(definition.id)).filter((definition) => [
    definition.name, definition.purpose, ...(definition.matchingTags ?? []), definition.id,
  ].join(' ').toLowerCase().includes(query.toLowerCase()));
  return [...build2, ...legacy];
}

function renderModelBankPicker(block) {
  const categories = ['Build 1 essentials', ...BUILD2_MODEL_CATEGORIES];
  const results = bankDefinitionsForPicker();
  const browseBody = (!ui.modelSearch.trim() && !ui.modelCategory)
    ? `<div class="model-category-list">${categories.map((category) => {
      const count = category === 'Build 1 essentials'
        ? listModelDefinitions().filter((definition) => !isBuild2Model(definition.id)).length
        : searchBuild2Models('', { category }).length;
      return `<button type="button" class="model-category-button" data-action="choose-model-category" data-value="${escapeAttr(category)}"><span>${escapeHtml(category)}</span><small>${count} models</small></button>`;
    }).join('')}</div>`
    : results.length
      ? `<div class="suggestion-list">${results.map((definition) => {
        const recipe = manualRecipeFor(definition.id, block);
        return modelSuggestionCard({ recipe, label: definition.name, reason: definition.childDescription ?? definition.mathematicalPurpose ?? definition.purpose }, definition.name, `bank-${definition.id}`);
      }).join('')}</div>`
      : '<p class="empty-bank">No model matches that search. Try “bar model”, “number line” or a curriculum category.</p>';
  return `<section class="inspector-section model-bank-picker">
    <div class="panel-header" style="margin:-14px -14px 12px;top:-14px">
      <div><h2>Complete model bank</h2><span class="panel-count">Year 4</span></div>
      <button type="button" class="tool-button" data-action="close-model-browser" aria-label="Close model browser">×</button>
    </div>
    <div class="field"><label for="model-bank-search">Find a model</label><input id="model-bank-search" type="search" data-role="model-search" value="${escapeAttr(ui.modelSearch)}" placeholder="bar model, counters, clock…"></div>
    <div class="field" style="margin-top:8px"><label for="model-bank-category">Curriculum category</label><select id="model-bank-category" data-role="model-category"><option value="" ${!ui.modelCategory ? 'selected' : ''}>Browse categories</option>${categories.map((category) => `<option value="${escapeAttr(category)}" ${ui.modelCategory === category ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('')}</select></div>
    ${ui.modelCategory || ui.modelSearch ? '<button type="button" class="ghost full-width" data-action="clear-model-bank-filter" style="margin-top:6px">Show all categories</button>' : ''}
    <div class="model-bank-results">${browseBody}</div>
  </section>`;
}

function renderModelChoices(block, worksheet) {
  const match = matchForBlock(block, worksheet);
  const suggestions = match.suggestions;
  if (ui.browseModels) return renderModelBankPicker(block);
  return `<section class="inspector-section">
    <h3>Best matches</h3>
    <p>${match.confidence === 'low' ? 'This needs a quick teacher decision, so no automatic model has been assumed.' : match.confidence === 'medium' ? 'A useful first reading is attached, and it is marked for an easy review.' : 'A pupil-safe first representation has been selected from the question structure.'}</p>
    ${match.clarification ? `<div class="clarify-card"><strong>One quick check</strong><span>${escapeHtml(match.clarification)}</span><div class="clarify-actions"><button type="button" data-action="resolve-division" data-value="sharing">Sharing between groups</button><button type="button" data-action="resolve-division" data-value="grouping">Making groups of this size</button></div></div>` : ''}
    ${match.warnings.length ? `<div class="warning-card"><strong>Worth noticing</strong><span>${escapeHtml(match.warnings[0])}</span></div>` : ''}
    <div class="suggestion-list">
      ${suggestions.map((suggestion, index) => modelSuggestionCard(suggestion, index === 0 ? `Best fit · ${suggestion.label}` : index === 1 ? `Strong alternative · ${suggestion.label}` : `Different useful approach · ${suggestion.label}`, `suggestion-${block.id}-${index}`)).join('')}
      <button type="button" class="suggestion-card" data-action="remove-model">
        <span class="suggestion-preview"><span style="font-size:24px;color:#777">∅</span></span>
        <span class="suggestion-copy"><strong>No model</strong><span>${escapeHtml(match.noModelOption.reason)}</span>${match.noModelRecommended ? '<span class="confidence">Recommended</span>' : ''}</span>
      </button>
    </div>
    <button type="button" class="ghost full-width" data-action="browse-models" style="margin-top:8px">Complete bank</button>
  </section>`;
}

function selectInterpretationOptions(values, selected, labels = {}) {
  const available = [...new Set([selected, ...values].filter(Boolean))];
  return `<option value="">Automatic</option>${available.map((value) => `<option value="${escapeAttr(value)}" ${selected === value ? 'selected' : ''}>${escapeHtml(labels[value] ?? humanOption(value))}</option>`).join('')}`;
}

function renderInterpretationControls(block, worksheet) {
  const match = matchForBlock(block, worksheet);
  const interpretation = block.extracted?.interpretation ?? match.interpretation;
  const overrides = block.extracted?.interpretationOverrides ?? {};
  const top = match.suggestions[0];
  const structure = interpretation?.mathematicalStructure ?? {};
  const unknownOptions = [
    'whole', 'part', 'difference', 'larger-quantity', 'smaller-quantity', 'start', 'change', 'result',
    'factor', 'group-size', 'group-count', 'numerator', 'denominator', 'rounded-value', 'converted-value',
    'perimeter', 'area', 'hands', 'chart-data', 'comparison-symbol',
  ];
  const reason = top?.reason ?? 'Choose a representation only where it genuinely helps.';
  return `<section class="inspector-section interpretation-panel ${interpretation?.needsReview ? 'needs-review' : ''}">
    <h3>Question reading ${interpretation?.needsReview ? '<span class="confidence medium">Review</span>' : ''}</h3>
    <p>This appears to be <strong>${escapeHtml(humanOption(interpretation?.questionFamily ?? 'question'))}</strong> in <strong>${escapeHtml(interpretation?.curriculumDomain ?? 'Mixed or multi-step')}</strong>. ${escapeHtml(reason)}</p>
    ${ui.editingInterpretation ? `<div class="field-grid interpretation-fields">
      <div class="field"><label for="interpret-domain">Domain</label><select id="interpret-domain" data-role="interpretation-field" data-key="domain">${selectInterpretationOptions(YEAR4_DOMAINS, overrides.domain || interpretation?.curriculumDomain)}</select></div>
      <div class="field"><label for="interpret-operation">Operation</label><select id="interpret-operation" data-role="interpretation-field" data-key="operation">${selectInterpretationOptions(['addition', 'subtraction', 'multiplication', 'division'], overrides.operation || structure.operation)}</select></div>
      <div class="field"><label for="interpret-family">Question family</label><select id="interpret-family" data-role="interpretation-field" data-key="questionFamily">${selectInterpretationOptions(QUESTION_FAMILIES, overrides.questionFamily || interpretation?.questionFamily)}</select></div>
      <div class="field"><label for="interpret-unknown">Keep this unknown</label><select id="interpret-unknown" data-role="interpretation-field" data-key="unknownPosition">${selectInterpretationOptions(unknownOptions, overrides.unknownPosition || structure.unknownPosition)}</select></div>
      <div class="field full"><label for="interpret-purpose">Representation purpose</label><select id="interpret-purpose" data-role="interpretation-field" data-key="representationPurpose">${selectInterpretationOptions(REPRESENTATION_PURPOSES, overrides.representationPurpose || interpretation?.representationPurpose)}</select></div>
    </div>
    <div class="inspector-actions"><button type="button" class="secondary" data-action="reset-interpretation">Use automatic reading</button><button type="button" class="ghost" data-action="toggle-interpretation">Done</button></div>`
      : '<button type="button" class="ghost full-width" data-action="toggle-interpretation">Change interpretation</button>'}
  </section>`;
}

function renderInspector(worksheet) {
  const block = selectedBlock(worksheet);
  if (!block) return `<div class="inspector-empty">${icon('question')}<p>Select a question to adjust its model and working space.</p></div>`;
  if (block.kind !== 'question') {
    return `<div class="inspector-content">
      <div class="field"><label for="selected-display-text">Printed wording</label><textarea id="selected-display-text" data-role="question-display">${escapeHtml(block.displayText)}</textarea></div>
      <section class="inspector-section"><h3>${block.kind === 'heading' ? 'Section heading' : 'Shared instruction'}</h3><p>This stays with the next question and does not receive a model.</p></section>
      ${renderBlockOrderControls(block, worksheet)}
    </div>`;
  }
  return `<div class="inspector-content">
    <div class="field" style="margin-bottom:14px"><label for="selected-display-text">Printed question wording</label><textarea id="selected-display-text" data-role="question-display">${escapeHtml(block.displayText)}</textarea></div>
    ${renderInterpretationControls(block, worksheet)}
    ${block.model && !ui.browseModels ? renderAttachedModel(block, worksheet) : renderModelChoices(block, worksheet)}
    ${renderResponseControls(block)}
    <section class="inspector-section">
      <h3>Teacher version</h3>
      <div class="field-grid">
        <div class="field full"><label for="teacher-answer">Answer (only if known)</label><input id="teacher-answer" data-role="teacher-answer" value="${escapeAttr(block.teacher.answer ?? '')}" placeholder="Leave unresolved if uncertain"></div>
        <div class="field full"><label for="teacher-notes">Short note</label><textarea id="teacher-notes" data-role="teacher-notes" placeholder="Optional teaching note">${escapeHtml(block.teacher.notes ?? '')}</textarea></div>
      </div>
    </section>
    ${renderBlockOrderControls(block, worksheet)}
  </div>`;
}

function renderBlockOrderControls(block, worksheet) {
  const index = worksheet.blocks.findIndex((item) => item.id === block.id);
  const breakSet = new Set(worksheet.pageArrangement.manualBreakBefore);
  return `<section class="inspector-section">
    <h3>Block position</h3>
    <div class="choice-grid">
      <button type="button" class="choice-button" data-action="move-block" data-id="${block.id}" data-direction="up" ${index === 0 ? 'disabled' : ''}>↑ Move up</button>
      <button type="button" class="choice-button" data-action="move-block" data-id="${block.id}" data-direction="down" ${index === worksheet.blocks.length - 1 ? 'disabled' : ''}>↓ Move down</button>
      <button type="button" class="choice-button" data-action="move-page" data-id="${block.id}" data-direction="previous">Previous page</button>
      <button type="button" class="choice-button" data-action="move-page" data-id="${block.id}" data-direction="next">Next page</button>
    </div>
    <div class="switch-row"><span>Start on a new page</span><label class="switch"><input type="checkbox" data-role="manual-break" ${breakSet.has(block.id) ? 'checked' : ''}><span></span></label></div>
  </section>`;
}

function renderNavigator(worksheet, mobile = false) {
  return `<div class="${mobile ? 'mobile-navigator-sheet' : 'question-navigator'} ${mobile && ui.navigatorOpen ? 'is-open' : ''}">
    <div class="panel-header"><h2>Questions</h2><span class="panel-count">${worksheet.blocks.filter((block) => block.kind === 'question').length}</span>${mobile ? '<button type="button" class="tool-button" data-action="close-mobile-panels">×</button>' : ''}</div>
    <div class="navigator-list">
      ${worksheet.blocks.map((block) => {
        const warning = block.warnings?.length;
        return `<button type="button" class="navigator-item ${ui.selectedId === block.id ? 'is-selected' : ''}" data-action="select-block" data-id="${block.id}">
          <span class="nav-number">${block.kind === 'question' ? block.number ?? '•' : '§'}</span>
          <span class="nav-copy"><strong>${escapeHtml(block.displayText)}</strong><span class="nav-meta"><span class="nav-dot ${warning ? 'warning' : block.model ? '' : 'none'}"></span>${block.kind !== 'question' ? humanOption(block.kind) : block.model ? getModelDefinition(block.model.family)?.name : 'No model'}</span></span>
        </button>`;
      }).join('')}
    </div>
  </div>`;
}

function responseHeightStyle(placement) {
  const height = placement.measurement?.breakdown?.responseMm ?? 0;
  return `--response-height:${Math.max(0, height)}mm;height:${Math.max(0, height)}mm`;
}

function renderResponseSpace(block, placement) {
  const response = block.response ?? { type: 'open-box', size: 'standard' };
  if (response.type === 'none') return '';
  const style = responseHeightStyle(placement);
  if (response.type === 'short-answer' || response.type === 'short-line') return `<div class="response-space response-line" style="${style}" aria-label="Answer line"></div>`;
  if (response.type === 'writing-lines') {
    const count = Math.max(2, Number(response.lines) || (response.size === 'generous' ? 7 : response.size === 'compact' ? 3 : 5));
    return `<div class="response-space response-lines" style="${style}" aria-label="Writing lines">${Array.from({ length: count }, () => '<span></span>').join('')}</div>`;
  }
  if (response.type === 'squared-grid') return `<div class="response-space response-grid" style="${style}" aria-label="Squared working grid"></div>`;
  if (response.type === 'model-completion') return `<div class="response-space response-model-space" style="${style}" aria-label="Model completion space"></div>`;
  return `<div class="response-space response-box" style="${style}" aria-label="Open working box"></div>`;
}

function modelForOutput(block, outputView) {
  if (outputView === 'teacher' && block.teacher?.completedModel) return block.teacher.completedModel;
  return block.model;
}

function renderQuestionCore(block, placement, outputView) {
  const model = modelForOutput(block, outputView);
  const position = model?.position ?? block.layout?.modelPosition ?? 'beneath';
  const number = block.number == null ? '' : `<span class="question-number">${escapeHtml(block.number)}.</span>`;
  const marks = block.marks && !textIncludesMarks(block.displayText) ? `<span class="question-marks">[${block.marks} ${block.marks === 1 ? 'mark' : 'marks'}]</span>` : '';
  const question = `<div class="question-row">${number}<p class="question-copy">${marks}${escapeHtml(block.displayText)}</p></div>`;
  if (!model) return question;
  const modelHeight = placement.measurement?.breakdown?.modelMm ?? 28;
  const rendered = renderModel(model, { intent: store.getState().intent, outputView, instanceId: `${block.id}-${outputView}` });
  const slot = `<div class="model-slot position-${position}" style="height:${modelHeight}mm" data-model-slot="${block.id}" aria-label="Attached ${escapeAttr(getModelDefinition(model.family)?.name ?? 'mathematical model')}">${rendered}</div>`;
  if (position === 'above') return `${slot}${question}`;
  if (position === 'beside') return `<div class="question-layout-beside">${question}${slot}</div>`;
  return `${question}${slot}`;
}

function renderWorksheetBlock(block, placement, worksheet, outputView) {
  const left = placement.xMm;
  const top = placement.yMm;
  const width = placement.widthMm;
  const height = placement.heightMm;
  const style = `left:${left}mm;top:${top}mm;width:${width}mm;height:${height}mm;--block-pad:${placement.measurement?.breakdown?.paddingMm ?? 3}mm`;
  if (block.kind === 'heading') {
    return `<section class="question-block section-block ${ui.selectedId === block.id ? 'is-selected' : ''}" style="${style}" data-block-id="${block.id}" data-page="${placement.page}" draggable="true">${escapeHtml(block.displayText)}</section>`;
  }
  if (block.kind === 'instruction') {
    return `<section class="question-block instruction-block ${ui.selectedId === block.id ? 'is-selected' : ''}" style="${style}" data-block-id="${block.id}" data-page="${placement.page}" draggable="true"><p class="question-copy">${escapeHtml(block.displayText)}</p></section>`;
  }
  const warnings = placement.measurement?.warnings ?? [];
  const teacher = outputView === 'teacher' && (block.teacher.answer != null || block.teacher.notes)
    ? `<div class="teacher-note">${block.teacher.answer != null && String(block.teacher.answer).length ? `<strong>Answer:</strong> ${escapeHtml(block.teacher.answer)}${block.teacher.notes ? '<br>' : ''}` : ''}${block.teacher.notes ? escapeHtml(block.teacher.notes) : ''}</div>`
    : '';
  return `<article class="question-block ${ui.selectedId === block.id ? 'is-selected' : ''} ${warnings.some((warning) => warning.code === 'block-overcrowded') ? 'is-overcrowded' : ''}" style="${style}" data-block-id="${block.id}" data-page="${placement.page}" draggable="true">
    ${renderQuestionCore(block, placement, outputView)}
    ${renderResponseSpace(block, placement)}
    ${teacher}
    <div class="block-screen-tools screen-only"><button type="button" data-action="select-block" data-id="${block.id}" aria-label="Edit question ${block.number ?? ''}">${icon('edit')}</button></div>
  </article>`;
}

function worksheetHeader(worksheet, geometry) {
  const settings = worksheet.settings;
  const fields = [
    settings.showNameField ? 'Name' : null,
    settings.showClassField ? (worksheet.metadata.className || 'Class') : null,
    settings.showDateField ? 'Date' : null,
  ].filter(Boolean);
  return `<header class="worksheet-header" style="position:absolute;left:${geometry.margins.left}mm;top:${geometry.margins.top}mm;width:${geometry.contentWidthMm}mm">
    <div class="worksheet-kicker">${escapeHtml(worksheet.intent === 'assessment' ? 'Assessment' : worksheet.intent === 'homework' ? 'Homework' : 'Practice')}</div>
    <h1 class="worksheet-title">${escapeHtml(worksheet.metadata.title || worksheet.metadata.name)}</h1>
    ${worksheet.metadata.shortInstruction ? `<p class="worksheet-instruction">${escapeHtml(worksheet.metadata.shortInstruction)}</p>` : ''}
    ${fields.length ? `<div class="pupil-fields">${fields.map((field) => `<span class="pupil-field">${escapeHtml(field)}</span>`).join('')}</div>` : ''}
  </header>`;
}

function worksheetPageClass(worksheet) {
  const classes = ['worksheet-page', `density-${worksheet.settings.density}`, `typeface-${worksheet.settings.typeface}`];
  if (worksheet.settings.colorMode === 'monochrome') classes.push('monochrome');
  return classes.join(' ');
}

function renderPage(worksheet, pagination, page, outputView, context = 'editor') {
  const shellContext = context === 'print-preview' ? 'print-preview' : 'editor-preview';
  const pageGeometry = pagination.geometry.page;
  return `<div class="a4-shell" data-page-shell data-preview-context="${shellContext}" data-page-width-px="${pageGeometry.widthPx}" data-page-height-px="${pageGeometry.heightPx}" style="--mps-page-width:${pageGeometry.widthMm}mm;--mps-page-height:${pageGeometry.heightMm}mm">
    <span class="page-badge screen-only">Page ${page.number} of ${pagination.pageCount}</span>
    <section class="${worksheetPageClass(worksheet)} orientation-${pageGeometry.orientation}" data-page-number="${page.number}" aria-label="Worksheet page ${page.number} of ${pagination.pageCount}" style="--sheet-accent:${escapeAttr(worksheet.settings.accentColor)};--mps-page-width:${pageGeometry.widthMm}mm;--mps-page-height:${pageGeometry.heightMm}mm">
      ${page.number === 1 ? worksheetHeader(worksheet, pagination.geometry) : ''}
      ${page.items.map((placement) => {
        const block = worksheet.blocks.find((item) => item.id === placement.blockId);
        return block ? renderWorksheetBlock(block, placement, worksheet, outputView) : '';
      }).join('')}
      ${worksheet.settings.pageNumbers ? `<footer class="worksheet-footer" style="position:absolute;left:${pagination.geometry.margins.left}mm;right:${pagination.geometry.margins.right}mm;bottom:${Math.max(3, pagination.geometry.margins.bottom - 2)}mm"><span>${escapeHtml(worksheet.metadata.title)}</span><span class="page-number">${page.number}</span></footer>` : ''}
    </section>
  </div>`;
}

function renderPageStack(worksheet, outputView, context = 'editor') {
  const pagination = paginateWorksheet(worksheet, { outputView });
  ui.lastPagination = pagination;
  return `<div class="page-stack">${pagination.pages.map((page) => renderPage(worksheet, pagination, page, outputView, context)).join('')}</div>`;
}

function renderMake() {
  const worksheet = store.getState();
  const pagination = paginateWorksheet(worksheet, { outputView: worksheet.outputView });
  ui.lastPagination = pagination;
  if (!ui.selectedId || !worksheet.blocks.some((block) => block.id === ui.selectedId)) {
    ui.selectedId = worksheet.blocks.find((block) => block.kind === 'question')?.id ?? worksheet.blocks[0]?.id ?? null;
  }
  return `<section class="make-stage" aria-label="Worksheet maker">
    <div class="make-toolbar" data-screen-only>
      <div class="project-title-wrap">
        <input class="project-title-input" data-role="project-title" value="${escapeAttr(worksheet.metadata.name)}" aria-label="Worksheet project name">
        <span class="save-state">Saved</span>
      </div>
      <div class="toolbar-group">
        <div class="view-toggle" role="group" aria-label="Output view">
          <button type="button" data-action="set-output-view" data-value="pupil" class="${worksheet.outputView === 'pupil' ? 'is-selected' : ''}" aria-pressed="${worksheet.outputView === 'pupil'}">Pupil</button>
          <button type="button" data-action="set-output-view" data-value="teacher" class="${worksheet.outputView === 'teacher' ? 'is-selected' : ''}" aria-pressed="${worksheet.outputView === 'teacher'}">Teacher</button>
        </div>
        <span class="toolbar-divider"></span>
        <details class="batch-menu">
          <summary>Batch</summary>
          <div class="batch-menu-panel">
            <button type="button" data-action="attach-best-models">Attach best-fit models</button>
            <button type="button" data-action="remove-all-models">Remove all models</button>
            <button type="button" data-action="set-all-blank">Set all to Blank</button>
            <button type="button" data-action="set-all-guided">Set all to Guided</button>
            <button type="button" data-action="normalise-model-sizes">Normalise model sizes</button>
            <button type="button" data-action="reanalyse-all">Reanalyse all</button>
            <button type="button" class="batch-warning" data-action="replace-all-recommendations">Replace my choices</button>
          </div>
        </details>
        <span class="toolbar-divider"></span>
        <button type="button" class="icon-button" data-action="open-settings">${icon('settings')}<span class="settings-label">Page settings</span></button>
        <span class="toolbar-divider"></span>
        <span class="panel-count">${pagination.pageCount} ${pagination.pageCount === 1 ? 'page' : 'pages'}</span>
      </div>
    </div>
    <div class="make-layout">
      ${renderNavigator(worksheet)}
      <div class="workspace-scroll" aria-label="A4 worksheet preview">
        ${renderPageStack(worksheet, worksheet.outputView, 'editor')}
      </div>
      <aside class="inspector ${ui.inspectorOpen ? 'is-open' : ''}" aria-label="Selected question controls">
        <div class="panel-header"><h2>Selected block</h2><button type="button" class="tool-button" data-action="close-mobile-panels" aria-label="Close question controls">×</button></div>
        ${renderInspector(worksheet)}
      </aside>
    </div>
    ${renderNavigator(worksheet, true)}
    <div class="mobile-panel-tabs" data-screen-only>
      <button type="button" data-action="open-navigator">Questions</button>
      <button type="button" data-action="open-inspector">Adjust selected</button>
    </div>
  </section>`;
}

function collectPrintChecks(worksheet, pagination, outputView) {
  const checks = [];
  const modelWarnings = worksheet.blocks.flatMap((block) => {
    if (!block.model) return [];
    const model = modelForOutput(block, outputView);
    const result = validateRecipe(model, { intent: worksheet.intent });
    return [...result.warnings, ...result.errors].map((warning) => ({ ...warning, blockId: block.id }));
  });
  const answerLeaks = worksheet.blocks.filter((block) => block.model && (evaluateAnswerLeak(block.model, { intent: worksheet.intent }).risk !== 'none' || isAnswerRevealRisk(block.model, { intent: worksheet.intent }))).length;
  checks.push({ warning: pagination.hasOverflow, text: pagination.hasOverflow ? 'One complete block is too tall for its page.' : 'No page overflow or clipped blocks detected.' });
  checks.push({ warning: pagination.tooSmallModelBlockIds.length > 0, text: pagination.tooSmallModelBlockIds.length ? `${pagination.tooSmallModelBlockIds.length} model may be too small when printed.` : 'Every model remains above its minimum print size.' });
  checks.push({ warning: worksheet.intent === 'assessment' && answerLeaks > 0 && outputView === 'pupil', text: worksheet.intent === 'assessment' && answerLeaks > 0 && outputView === 'pupil' ? `${answerLeaks} assessment model may reveal assessed thinking.` : 'No unacknowledged answer-reveal risk in this output.' });
  checks.push({ warning: pagination.blocksWithoutResponseSpace.length > 0, text: pagination.blocksWithoutResponseSpace.length ? `${pagination.blocksWithoutResponseSpace.length} question has no meaningful response space.` : 'Every question has a response route or completion model.' });
  checks.push({ warning: modelWarnings.some((warning) => warning.severity === 'error'), text: modelWarnings.some((warning) => warning.severity === 'error') ? 'A model has invalid mathematical values and will show a safety message.' : 'All attached models pass mathematical integrity checks.' });
  return checks;
}

function renderPrint() {
  const worksheet = store.getState();
  const outputView = worksheet.outputView;
  const pagination = paginateWorksheet(worksheet, { outputView });
  ui.lastPagination = pagination;
  const checks = collectPrintChecks(worksheet, pagination, outputView);
  const warnings = checks.filter((item) => item.warning).length;
  const modelCount = worksheet.blocks.filter((block) => block.model).length;
  return `<section class="stage-shell print-stage" aria-labelledby="print-title">
    <div class="print-topline" data-screen-only>
      <header class="stage-heading">
        <span class="eyebrow">Final print check</span>
        <h1 id="print-title">Ready to print</h1>
        <p>These are the exact A4 pages the browser will print or save as PDF.</p>
      </header>
      <div class="view-toggle" role="group" aria-label="Version to print">
        <button type="button" data-action="set-output-view" data-value="pupil" class="${outputView === 'pupil' ? 'is-selected' : ''}">Pupil version</button>
        <button type="button" data-action="set-output-view" data-value="teacher" class="${outputView === 'teacher' ? 'is-selected' : ''}">Teacher version</button>
      </div>
    </div>
    <div class="print-summary-grid" data-screen-only>
      <div class="summary-card"><strong>${pagination.pageCount}</strong><span>${pagination.pageCount === 1 ? 'A4 page' : 'A4 pages'}</span></div>
      <div class="summary-card"><strong>${worksheet.blocks.filter((block) => block.kind === 'question').length}</strong><span>questions</span></div>
      <div class="summary-card"><strong>${modelCount}</strong><span>attached models</span></div>
      <div class="summary-card"><strong>${warnings || '✓'}</strong><span>${warnings === 1 ? 'check to review' : warnings ? 'checks to review' : 'clear to print'}</span></div>
    </div>
    <div class="print-checks">
      <div class="print-preview-panel">${renderPageStack(worksheet, outputView, 'print-preview')}</div>
      <aside class="print-controls" data-screen-only>
        <div class="print-card">
          <h2>${outputView === 'teacher' ? 'Teacher version' : 'Pupil version'}</h2>
          <p>${worksheet.settings.colorMode === 'monochrome' ? 'Monochrome' : 'Colour'} · A4 ${pagination.geometry.page.orientation} · ${pagination.pageCount} ${pagination.pageCount === 1 ? 'page' : 'pages'}</p>
        </div>
        <div class="print-card">
          <h3>Page checks</h3>
          <div class="check-list">${checks.map((item) => `<div class="check-item"><span class="check-icon ${item.warning ? 'warning' : ''}">${item.warning ? '!' : '✓'}</span><span>${escapeHtml(item.text)}</span></div>`).join('')}</div>
        </div>
        <div class="print-card print-action-stack">
          <button type="button" class="primary" data-action="print-now">${icon('print')} Print ${outputView} version</button>
          <button type="button" class="secondary" data-action="go-stage" data-stage="make">Return to editing</button>
          <p class="pdf-note"><span aria-hidden="true">ⓘ</span><span>Choose <strong>Save as PDF</strong> in the browser’s print panel to keep a PDF copy.</span></p>
        </div>
      </aside>
    </div>
  </section>`;
}

function renderSettingsContent() {
  const worksheet = store.getState();
  const settings = worksheet.settings;
  document.querySelector('#settings-content').innerHTML = `<div class="settings-grid">
    <section class="settings-group">
      <h3>Worksheet heading</h3>
      <div class="field"><label for="sheet-title">Printed title</label><input id="sheet-title" data-role="metadata-field" data-key="title" value="${escapeAttr(worksheet.metadata.title)}"></div>
      <div class="field"><label for="sheet-instruction">Short instruction</label><input id="sheet-instruction" data-role="metadata-field" data-key="shortInstruction" value="${escapeAttr(worksheet.metadata.shortInstruction)}" placeholder="Optional"></div>
      <div class="field"><label for="sheet-class">Class label</label><input id="sheet-class" data-role="metadata-field" data-key="className" value="${escapeAttr(worksheet.metadata.className)}" placeholder="Optional"></div>
      ${[
        ['showNameField', 'Name field'],
        ['showDateField', 'Date field'],
        ['showClassField', 'Class field'],
      ].map(([key, label]) => `<div class="switch-row"><span>${label}</span><label class="switch"><input type="checkbox" data-role="settings-checkbox" data-key="${key}" ${settings[key] ? 'checked' : ''}><span></span></label></div>`).join('')}
    </section>
    <section class="settings-group">
      <h3>Page character</h3>
      <div class="field"><label>Accent colour</label><div class="accent-list">${ACCENTS.map((colour) => `<button type="button" class="accent-button ${settings.accentColor === colour ? 'is-selected' : ''}" style="--swatch:${colour}" data-action="set-accent" data-value="${colour}" aria-label="Use ${colour} accent" aria-pressed="${settings.accentColor === colour}"></button>`).join('')}</div></div>
      <div class="field"><label for="colour-mode">Print colour</label><select id="colour-mode" data-role="settings-select" data-key="colorMode"><option value="colour" ${settings.colorMode === 'colour' ? 'selected' : ''}>Colour</option><option value="monochrome" ${settings.colorMode === 'monochrome' ? 'selected' : ''}>Monochrome</option></select></div>
      <div class="field"><label for="typeface">Typeface</label><select id="typeface" data-role="settings-select" data-key="typeface"><option value="system" ${settings.typeface === 'system' ? 'selected' : ''}>Classic maths</option><option value="sans" ${settings.typeface === 'sans' ? 'selected' : ''}>Clear sans</option><option value="rounded" ${settings.typeface === 'rounded' ? 'selected' : ''}>Soft rounded</option></select></div>
      <div class="field"><label for="density">Spacing</label><select id="density" data-role="settings-select" data-key="density"><option value="compact" ${settings.density === 'compact' ? 'selected' : ''}>Compact</option><option value="standard" ${settings.density === 'standard' ? 'selected' : ''}>Standard</option><option value="spacious" ${settings.density === 'spacious' ? 'selected' : ''}>Spacious</option></select></div>
    </section>
    <section class="settings-group">
      <h3>Arrangement</h3>
      <div class="field"><label for="columns">Columns</label><select id="columns" data-role="settings-select" data-key="columns"><option value="1" ${settings.columns === 1 ? 'selected' : ''}>One column</option><option value="2" ${settings.columns === 2 ? 'selected' : ''}>Two columns</option></select></div>
      <div class="field"><label for="working-style">Default working style</label><select id="working-style" data-role="settings-select" data-key="workingSpaceStyle"><option value="lines" ${settings.workingSpaceStyle === 'lines' ? 'selected' : ''}>Lines</option><option value="grid" ${settings.workingSpaceStyle === 'grid' ? 'selected' : ''}>Squared</option><option value="open" ${settings.workingSpaceStyle === 'open' ? 'selected' : ''}>Open</option></select></div>
      <div class="switch-row"><span>Question numbering</span><label class="switch"><input type="checkbox" data-role="settings-checkbox" data-key="questionNumbering" ${settings.questionNumbering ? 'checked' : ''}><span></span></label></div>
      <div class="switch-row"><span>Page numbers</span><label class="switch"><input type="checkbox" data-role="settings-checkbox" data-key="pageNumbers" ${settings.pageNumbers ? 'checked' : ''}><span></span></label></div>
    </section>
    <section class="settings-group">
      <h3>Page</h3>
      <div class="field"><label for="sheet-orientation">A4 orientation</label><select id="sheet-orientation" data-role="settings-select" data-key="orientation"><option value="portrait" ${settings.orientation === 'portrait' ? 'selected' : ''}>Portrait · 210 × 297 mm</option><option value="landscape" ${settings.orientation === 'landscape' ? 'selected' : ''}>Landscape · 297 × 210 mm</option></select></div>
      <div class="field"><label for="margin-size">Print-safe margin</label><select id="margin-size" data-role="settings-select" data-key="marginMm"><option value="10" ${settings.marginMm === 10 ? 'selected' : ''}>Narrow · 10 mm</option><option value="12" ${settings.marginMm === 12 ? 'selected' : ''}>Standard · 12 mm</option><option value="15" ${settings.marginMm === 15 ? 'selected' : ''}>Wide · 15 mm</option></select></div>
      <p style="margin:0;color:var(--muted);font-size:11px;line-height:1.45">Screen preview and print use the same fixed millimetre positions. Whole question blocks always move together.</p>
    </section>
  </div>`;
}

function renderProjectList() {
  const current = store.getState().metadata.id;
  const projects = listProjects();
  const container = document.querySelector('#project-list');
  container.innerHTML = projects.length ? projects.map((project) => `<div class="project-row">
    <button type="button" class="project-open" data-action="load-project" data-id="${project.id}"><strong>${escapeHtml(project.name || project.title)}</strong><span>${project.blockCount} blocks · ${escapeHtml(formatDate(project.updatedAt))}${project.id === current ? ' · Open' : ''}</span></button>
    <div class="project-row-actions">
      <button type="button" class="tool-button" data-action="duplicate-project" data-id="${project.id}" aria-label="Duplicate ${escapeAttr(project.name)}">${icon('copy')}</button>
      <button type="button" class="tool-button" data-action="delete-project" data-id="${project.id}" aria-label="Delete ${escapeAttr(project.name)}">${icon('trash')}</button>
    </div>
  </div>`).join('') : '<div class="empty-projects">Your saved worksheets will appear here.</div>';
}

function updateHeader() {
  const worksheet = store.getState();
  const stages = ['paste', 'check', 'make', 'print'];
  const activeIndex = stages.indexOf(ui.stage);
  document.querySelectorAll('.stage-step').forEach((button) => {
    const index = stages.indexOf(button.dataset.stageTarget);
    button.toggleAttribute('aria-current', index === activeIndex);
    if (index === activeIndex) button.setAttribute('aria-current', 'step');
    button.classList.toggle('is-complete', index < activeIndex);
  });
  document.querySelector('#undo-button').disabled = !store.canUndo();
  document.querySelector('#redo-button').disabled = !store.canRedo();
  document.querySelector('#header-print-button').disabled = !worksheet.blocks.some((block) => block.kind === 'question');
  document.body.dataset.stage = ui.stage;
}

function scalePages() {
  document.querySelectorAll('[data-page-shell]').forEach((shell) => {
    const context = shell.dataset.previewContext;
    const pageWidth = Number(shell.dataset.pageWidthPx) || PAGE_WIDTH_PX;
    const pageHeight = Number(shell.dataset.pageHeightPx) || PAGE_HEIGHT_PX;
    const parentWidth = shell.parentElement?.clientWidth ?? pageWidth;
    const padding = context === 'print-preview' ? 10 : 4;
    const max = context === 'print-preview' ? 0.43 : 1;
    const scale = Math.max(0.2, Math.min(max, (parentWidth - padding) / pageWidth));
    const page = shell.querySelector('.worksheet-page');
    page?.style.setProperty('--page-scale', String(scale));
    shell.style.width = `${pageWidth * scale}px`;
    shell.style.height = `${pageHeight * scale}px`;
  });
}

function render() {
  writeStage(ui.stage);
  updateHeader();
  if (ui.stage === 'check') root.innerHTML = renderCheck();
  else if (ui.stage === 'make') root.innerHTML = renderMake();
  else if (ui.stage === 'print') root.innerHTML = renderPrint();
  else root.innerHTML = renderPaste();
  requestAnimationFrame(scalePages);
}

function goStage(stage) {
  const worksheet = store.getState();
  if (stage === 'check') {
    if (worksheet.originalImport.rawText && worksheet.blocks.length) {
      ui.stage = 'check';
      render();
    } else beginCheck();
    return;
  }
  if ((stage === 'make' || stage === 'print') && !worksheet.blocks.some((block) => block.kind === 'question')) {
    toast('Check your pasted questions first.', 'warning');
    ui.stage = 'paste';
    render();
    return;
  }
  ui.stage = stage;
  ui.inspectorOpen = false;
  ui.navigatorOpen = false;
  render();
}

function moveBlock(id, direction) {
  const worksheet = store.getState();
  const index = worksheet.blocks.findIndex((block) => block.id === id);
  if (index < 0) return;
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= worksheet.blocks.length) return;
  store.dispatch(worksheetActions.reorderBlock(id, target));
}

function validatedModelForBlock(recipe, worksheet, options = {}) {
  const validation = validateRecipe(recipe, { intent: worksheet.intent });
  if (!validation.valid) return { model: null, validation };
  return {
    model: withModelBinding(
      validation.normalizedRecipe,
      options.binding ?? modelBindingMode(recipe),
      options.teacherChosen ?? Boolean(recipe.teacherChosen),
    ),
    validation,
  };
}

function applyBatchModels(action) {
  const worksheet = store.getState();
  const targetScaffold = action === 'set-all-blank' ? 'blank' : action === 'set-all-guided' ? 'guided' : null;
  const blocks = worksheet.blocks.map((block) => {
    if (block.kind !== 'question') return block;
    if (action === 'remove-all-models') return { ...block, model: null, extracted: { ...block.extracted, modelChoice: 'none' } };
    if (action === 'attach-best-models') {
      // A deliberate “No model” and an independently customised model are
      // teacher decisions, so this batch action leaves them untouched.
      if (block.extracted?.modelChoice === 'none' || modelBindingMode(block.model) === 'detached') return block;
      return reanalyseQuestionBlock(block);
    }
    if (action === 'reanalyse-all') return reanalyseQuestionBlock(block);
    if (action === 'replace-all-recommendations') return reanalyseQuestionBlock(block, { replaceChoice: true });
    if (!block.model) return block;
    if (action === 'normalise-model-sizes') {
      const next = { ...block.model, size: 'standard' };
      const { model } = validatedModelForBlock(next, worksheet, { binding: modelBindingMode(block.model), teacherChosen: block.model.teacherChosen });
      return model ? { ...block, model } : block;
    }
    if (targetScaffold) {
      const next = isBuild2Model(block.model.family)
        ? { ...block.model, scaffoldState: targetScaffold }
        : { ...block.model, completionState: targetScaffold === 'blank' ? 'blank' : 'partly-completed' };
      const { model } = validatedModelForBlock(next, worksheet, { binding: modelBindingMode(block.model), teacherChosen: block.model.teacherChosen });
      return model ? { ...block, model } : block;
    }
    return block;
  });
  store.dispatch(worksheetActions.replaceBlocks(blocks));
  const messages = {
    'attach-best-models': 'Best-fit models attached where a teacher choice was not already set.',
    'remove-all-models': 'All models removed. The questions and response spaces remain.',
    'set-all-blank': 'All attached models now use blank pupil scaffolds.',
    'set-all-guided': 'All attached models now use guided pupil scaffolds.',
    'normalise-model-sizes': 'Attached models set to a consistent standard size.',
    'reanalyse-all': 'Questions reanalysed; teacher choices remain intact.',
    'replace-all-recommendations': 'New recommendations replaced the existing model choices.',
  };
  toast(messages[action] ?? 'Batch change applied.');
}

function applyModelToSimilarQuestions() {
  const worksheet = store.getState();
  const selected = selectedBlock(worksheet);
  if (!selected?.model) return;
  const selectedReading = selected.extracted?.interpretation ?? matchForBlock(selected, worksheet).interpretation;
  const blocks = worksheet.blocks.map((block) => {
    if (block.kind !== 'question') return block;
    const reading = block.extracted?.interpretation ?? matchForBlock(block, worksheet).interpretation;
    if (reading.curriculumDomain !== selectedReading.curriculumDomain || reading.questionFamily !== selectedReading.questionFamily) return block;
    const match = matchForBlock(block, worksheet);
    const recipe = createMatchedRecipe(selected.model.family, match.extracted, {
      intent: worksheet.intent,
      interpretation: match.interpretation,
      completionState: selected.model.completionState,
      size: selected.model.size,
      position: selected.model.position,
      purpose: selected.model.purpose,
    });
    if (!recipe) return block;
    const { model } = validatedModelForBlock(recipe, worksheet, { binding: 'bound', teacherChosen: true });
    return model ? { ...block, model, extracted: { ...block.extracted, modelChoice: selected.model.family } } : block;
  });
  store.dispatch(worksheetActions.replaceBlocks(blocks));
  toast('This teacher-selected model was applied to similar questions in this set.');
}

function updateQuestionWording(block, displayText) {
  const text = String(displayText ?? '');
  const changed = { ...block, displayText: text };
  store.dispatch(worksheetActions.updateBlock(block.id, reanalyseQuestionBlock(changed)));
}

function attachModel(family) {
  const worksheet = store.getState();
  const block = selectedBlock(worksheet);
  if (!block || block.kind !== 'question') return;
  const recipe = manualRecipeFor(family, block);
  const { model, validation } = validatedModelForBlock(recipe, worksheet, { binding: 'bound', teacherChosen: true });
  if (!model) {
    toast(validation.errors[0]?.message ?? 'That model cannot represent this question safely.', 'warning');
    return;
  }
  if (worksheet.intent === 'assessment' && isAnswerRevealRisk(model, { intent: worksheet.intent })) {
    toast('Assessment check: this model may reveal part of the assessed thinking.', 'warning');
  }
  store.dispatch(worksheetActions.updateBlock(block.id, {
    model,
    extracted: { ...block.extracted, modelChoice: family },
  }));
  ui.browseModels = false;
}

function updateModelField(path, rawValue, type) {
  const worksheet = store.getState();
  const block = selectedBlock(worksheet);
  if (!block?.model) return;
  const next = setPath(block.model, path, parseFieldValue(rawValue, type));
  const { model, validation } = validatedModelForBlock(next, worksheet, { binding: 'detached', teacherChosen: true });
  if (!model) {
    toast(validation.errors[0]?.message ?? 'That change would break the model.', 'warning');
    render();
    return;
  }
  store.dispatch(worksheetActions.setModel(block.id, model));
  if (block.teacher.completedModel) {
    store.dispatch(worksheetActions.updateBlock(block.id, { teacher: { ...block.teacher, completedModel: { ...model, completionState: 'completed', scaffoldState: isBuild2Model(model.family) ? 'modelled' : model.scaffoldState } } }));
  }
}

async function removeBlock(id) {
  const block = store.getState().blocks.find((item) => item.id === id);
  if (!block) return;
  const confirmed = await askConfirm({ title: 'Remove this block?', message: 'Undo can bring it back while this worksheet stays open.', actionLabel: 'Remove block' });
  if (!confirmed) return;
  store.dispatch(worksheetActions.removeBlock(id));
  ui.selectedId = store.getState().blocks.find((item) => item.kind === 'question')?.id ?? store.getState().blocks[0]?.id ?? null;
}

function changeBlockKind(id, kind) {
  const block = store.getState().blocks.find((item) => item.id === id);
  if (!block) return;
  store.dispatch(worksheetActions.updateBlock(id, {
    kind,
    model: kind === 'question' ? block.model : null,
    response: kind === 'question' ? block.response : { type: 'none', size: 'compact' },
    layout: { ...block.layout, keepWithNext: kind !== 'question' },
  }));
}

function resolveDivision(kind) {
  const worksheet = store.getState();
  const block = selectedBlock(worksheet);
  if (!block) return;
  const overrides = {
    ...(block.extracted?.interpretationOverrides ?? {}),
    operation: 'division',
    unknownPosition: kind === 'sharing' ? 'group-size' : 'group-count',
  };
  const source = { ...block, extracted: { ...block.extracted, interpretationOverrides: overrides } };
  const match = matchForBlock(source, worksheet);
  const family = kind === 'sharing' ? 'sharing-division' : 'grouping-division';
  const recipe = createMatchedRecipe(family, match.extracted, { intent: worksheet.intent, interpretation: match.interpretation });
  const { model, validation } = validatedModelForBlock(recipe, worksheet, { binding: 'bound', teacherChosen: true });
  if (model) store.dispatch(worksheetActions.updateBlock(block.id, {
    ...reanalyseQuestionBlock(source),
    model,
    extracted: { ...source.extracted, ...match.extracted, interpretationOverrides: overrides, modelChoice: family },
  }));
  else toast(validation.errors[0]?.message ?? 'That grouping cannot be shown safely.', 'warning');
}

function moveBlockToPage(id, direction) {
  const pagination = paginateWorksheet(store.getState());
  const placement = pagination.placements[id];
  if (!placement) return;
  const page = placement.page;
  if (direction === 'next') {
    store.dispatch(worksheetActions.setManualBreak(id, true));
    toast(`Question will begin on page ${page + 1}.`);
    return;
  }
  const blockIndex = store.getState().blocks.findIndex((block) => block.id === id);
  if (blockIndex <= 0) return;
  const previousPageFirst = pagination.pages.find((item) => item.number === Math.max(1, page - 1))?.items[0]?.blockId;
  store.dispatch(worksheetActions.setManualBreak(id, false));
  if (previousPageFirst) {
    const target = store.getState().blocks.findIndex((block) => block.id === previousPageFirst);
    store.dispatch(worksheetActions.reorderBlock(id, Math.max(0, target)));
  }
}

document.addEventListener('input', (event) => {
  if (event.target.matches('#question-paste')) {
    ui.rawDraft = event.target.value;
    writeDraft(ui.rawDraft);
    const count = document.querySelector('.paste-count');
    if (count) count.textContent = ui.rawDraft.length ? `${ui.rawDraft.length.toLocaleString()} characters` : 'Plain text';
  }
  if (event.target.matches('[data-role="edit-buffer"]')) ui.editBuffer = event.target.value;
  if (event.target.matches('[data-role="model-search"]')) {
    ui.modelSearch = event.target.value;
    render();
    requestAnimationFrame(() => document.querySelector('#model-bank-search')?.focus());
  }
});

document.addEventListener('change', (event) => {
  const target = event.target;
  const worksheet = store.getState();
  const block = selectedBlock(worksheet);
  if (target.matches('[data-role="project-title"]')) {
    const name = target.value.trim() || worksheet.metadata.title || 'Untitled worksheet';
    store.dispatch(worksheetActions.updateMetadata({ name }));
  } else if (target.matches('[data-role="question-display"]') && block) {
    updateQuestionWording(block, target.value);
  } else if (target.matches('[data-role="model-field"]')) {
    updateModelField(target.dataset.path, target.dataset.type === 'boolean' ? target.checked : target.value, target.dataset.type);
  } else if (target.matches('[data-role="model-binding-toggle"]') && block?.model) {
    if (target.checked) {
      const match = matchForBlock(block, worksheet);
      const model = safeBoundRecipe(match, worksheet, block.model, {
        preferCurrent: true,
        interpretationOverrides: block.extracted?.interpretationOverrides ?? {},
      });
      if (!model) toast('This model cannot be rebound safely to the current question.', 'warning');
      else store.dispatch(worksheetActions.setModel(block.id, withModelBinding(model, 'bound', true)));
    } else {
      store.dispatch(worksheetActions.setModel(block.id, withModelBinding(block.model, 'detached', true)));
    }
  } else if (target.matches('[data-role="interpretation-field"]') && block) {
    const key = target.dataset.key;
    const overrides = { ...(block.extracted?.interpretationOverrides ?? {}) };
    if (target.value) overrides[key] = target.value;
    else delete overrides[key];
    const source = { ...block, extracted: { ...block.extracted, interpretationOverrides: overrides } };
    // Correcting the reading is an explicit request for the automatic draft
    // to reconsider its representation. A teacher-selected or detached model
    // remains their decision; an automatic bound model changes immediately.
    const replaceAutomaticModel = modelBindingMode(block.model) === 'bound' && !block.model?.teacherChosen;
    store.dispatch(worksheetActions.updateBlock(block.id, reanalyseQuestionBlock(source, {
      replaceChoice: replaceAutomaticModel,
    })));
  } else if (target.matches('[data-role="model-category"]')) {
    ui.modelCategory = target.value;
    render();
  } else if (target.matches('[data-role="response-type"]') && block) {
    store.dispatch(worksheetActions.setResponse(block.id, { ...block.response, type: target.value }));
  } else if (target.matches('[data-role="manual-break"]') && block) {
    store.dispatch(worksheetActions.setManualBreak(block.id, target.checked));
  } else if (target.matches('[data-role="teacher-model-toggle"]') && block?.model) {
    const completedModel = target.checked ? { ...block.model, completionState: 'completed' } : null;
    store.dispatch(worksheetActions.updateBlock(block.id, { teacher: { ...block.teacher, completedModel } }));
  } else if (target.matches('[data-role="teacher-answer"]') && block) {
    store.dispatch(worksheetActions.updateBlock(block.id, { teacher: { ...block.teacher, answer: target.value || null } }));
  } else if (target.matches('[data-role="teacher-notes"]') && block) {
    store.dispatch(worksheetActions.updateBlock(block.id, { teacher: { ...block.teacher, notes: target.value } }));
  } else if (target.matches('[data-role="metadata-field"]')) {
    store.dispatch(worksheetActions.updateMetadata({ [target.dataset.key]: target.value }));
    if (settingsDialog.open) renderSettingsContent();
  } else if (target.matches('[data-role="settings-checkbox"]')) {
    store.dispatch(worksheetActions.updateSettings({ [target.dataset.key]: target.checked }));
    if (settingsDialog.open) renderSettingsContent();
  } else if (target.matches('[data-role="settings-select"]')) {
    const key = target.dataset.key;
    const value = ['columns', 'marginMm'].includes(key) ? Number(target.value) : target.value;
    store.dispatch(worksheetActions.updateSettings({ [key]: value }));
    if (settingsDialog.open) renderSettingsContent();
  }
});

document.addEventListener('click', async (event) => {
  const stageButton = event.target.closest('[data-stage-target]');
  if (stageButton) {
    goStage(stageButton.dataset.stageTarget);
    return;
  }
  const button = event.target.closest('[data-action]');
  if (!button) {
    const worksheetBlock = event.target.closest('.question-block[data-block-id]');
    if (worksheetBlock) {
      ui.selectedId = worksheetBlock.dataset.blockId;
      ui.browseModels = false;
      if (matchMedia('(max-width: 760px)').matches) ui.inspectorOpen = true;
      render();
    }
    return;
  }
  const action = button.dataset.action;
  const id = button.dataset.id;

  if (action === 'use-sample') {
    ui.rawDraft = SAMPLE_TEXT;
    writeDraft(ui.rawDraft);
    render();
    requestAnimationFrame(() => document.querySelector('#question-paste')?.focus());
  } else if (action === 'begin-check') beginCheck();
  else if (action === 'set-intent') store.dispatch(worksheetActions.setIntent(button.dataset.value));
  else if (action === 'make-worksheet') buildFirstDraft();
  else if (action === 'restore-original') {
    const parsed = parseQuestions(store.getState().originalImport.rawText);
    store.dispatch(worksheetActions.replaceBlocks(parsedItemsToBlocks(parsed)));
    toast('Original imported wording restored.');
  } else if (action === 'edit-block') {
    const block = store.getState().blocks.find((item) => item.id === id);
    if (!block) return;
    ui.editingId = id;
    ui.editBuffer = block.displayText;
    render();
    requestAnimationFrame(() => document.querySelector(`#edit-${CSS.escape(id)}`)?.focus());
  } else if (action === 'cancel-block-edit') {
    ui.editingId = null;
    ui.editBuffer = '';
    render();
  } else if (action === 'save-block-edit') {
    const block = store.getState().blocks.find((item) => item.id === id);
    if (block) updateQuestionWording(block, ui.editBuffer);
    ui.editingId = null;
    ui.editBuffer = '';
    render();
  } else if (action === 'split-at-cursor') {
    const textarea = document.querySelector(`#edit-${CSS.escape(id)}`);
    const offset = textarea?.selectionStart ?? 0;
    if (!offset || offset >= ui.editBuffer.length) {
      toast('Place the cursor where the second card should begin.', 'warning');
      return;
    }
    const block = store.getState().blocks.find((item) => item.id === id);
    if (block) updateQuestionWording(block, ui.editBuffer);
    store.dispatch(worksheetActions.splitBlock(id, offset));
    ui.editingId = null;
    ui.editBuffer = '';
    render();
  } else if (action === 'move-block') moveBlock(id, button.dataset.direction);
  else if (action === 'move-page') moveBlockToPage(id, button.dataset.direction);
  else if (action === 'join-block') store.dispatch(worksheetActions.joinBlock(id, button.dataset.direction));
  else if (action === 'duplicate-block') store.dispatch(worksheetActions.duplicateBlock(id, createId('question')));
  else if (action === 'remove-block') await removeBlock(id);
  else if (action === 'set-kind') changeBlockKind(id, button.dataset.kind);
  else if (action === 'select-block') {
    ui.selectedId = id;
    ui.browseModels = false;
    if (matchMedia('(max-width: 760px)').matches) ui.inspectorOpen = true;
    render();
  } else if (action === 'set-output-view') {
    store.dispatch(worksheetActions.setOutputView(button.dataset.value));
  } else if (action === 'open-settings') {
    renderSettingsContent();
    settingsDialog.showModal();
  } else if (action === 'browse-models') {
    ui.browseModels = true;
    ui.modelSearch = '';
    ui.modelCategory = '';
    render();
  } else if (action === 'close-model-browser') {
    ui.browseModels = false;
    ui.modelSearch = '';
    ui.modelCategory = '';
    render();
  } else if (action === 'choose-model-category') {
    ui.modelCategory = button.dataset.value;
    render();
  } else if (action === 'clear-model-bank-filter') {
    ui.modelSearch = '';
    ui.modelCategory = '';
    render();
  } else if (action === 'attach-model') attachModel(button.dataset.family);
  else if (action === 'remove-model') {
    const block = selectedBlock();
    if (block) store.dispatch(worksheetActions.updateBlock(block.id, { model: null, extracted: { ...block.extracted, modelChoice: 'none' } }));
    ui.browseModels = false;
  } else if (action === 'set-model-option') {
    const block = selectedBlock();
    if (!block?.model) return;
    const next = { ...block.model, [button.dataset.key]: button.dataset.value };
    const { model, validation } = validatedModelForBlock(next, store.getState(), { binding: modelBindingMode(block.model), teacherChosen: block.model.teacherChosen });
    if (!model) toast(validation.errors[0]?.message ?? 'That model option is not safe.', 'warning');
    else store.dispatch(worksheetActions.setModel(block.id, model));
  } else if (action === 'set-response-size') {
    const block = selectedBlock();
    if (block) store.dispatch(worksheetActions.setResponse(block.id, { ...block.response, size: button.dataset.value }));
  } else if (action === 'resolve-division') resolveDivision(button.dataset.value);
  else if (action === 'toggle-interpretation') {
    ui.editingInterpretation = !ui.editingInterpretation;
    render();
  } else if (action === 'reset-interpretation') {
    const block = selectedBlock();
    if (block) {
      const source = { ...block, extracted: { ...block.extracted, interpretationOverrides: {} } };
      const replaceAutomaticModel = modelBindingMode(block.model) === 'bound' && !block.model?.teacherChosen;
      store.dispatch(worksheetActions.updateBlock(block.id, reanalyseQuestionBlock(source, {
        replaceChoice: replaceAutomaticModel,
      })));
    }
  } else if (action === 'apply-similar-model') applyModelToSimilarQuestions();
  else if (action === 'attach-best-models' || action === 'remove-all-models' || action === 'set-all-blank' || action === 'set-all-guided' || action === 'normalise-model-sizes' || action === 'reanalyse-all' || action === 'replace-all-recommendations') applyBatchModels(action);
  else if (action === 'set-accent') {
    store.dispatch(worksheetActions.updateSettings({ accentColor: button.dataset.value }));
    renderSettingsContent();
  } else if (action === 'open-navigator') {
    ui.navigatorOpen = true;
    ui.inspectorOpen = false;
    render();
  } else if (action === 'open-inspector') {
    ui.inspectorOpen = true;
    ui.navigatorOpen = false;
    render();
  } else if (action === 'close-mobile-panels') {
    ui.inspectorOpen = false;
    ui.navigatorOpen = false;
    render();
  } else if (action === 'go-stage') goStage(button.dataset.stage);
  else if (action === 'print-now') {
    store.flush();
    requestAnimationFrame(() => window.print());
  } else if (action === 'load-project') {
    if (store.load(id)) {
      ui.stage = store.getState().blocks.length ? 'make' : 'paste';
      ui.selectedId = store.getState().blocks.find((block) => block.kind === 'question')?.id ?? null;
      projectDialog.close();
      toast('Worksheet reopened.');
    }
  } else if (action === 'duplicate-project') {
    const copy = duplicateStoredProject(id, { name: `${button.closest('.project-row')?.querySelector('strong')?.textContent ?? 'Worksheet'} copy` });
    if (copy) {
      renderProjectList();
      toast('Worksheet duplicated.');
    }
  } else if (action === 'delete-project') {
    const isCurrent = id === store.getState().metadata.id;
    const confirmed = await askConfirm({ title: 'Delete this saved worksheet?', message: 'This removes the device copy and cannot be undone.', actionLabel: 'Delete worksheet' });
    if (!confirmed) return;
    deleteProject(id);
    if (isCurrent) {
      store.newProject();
      ui.stage = 'paste';
      ui.rawDraft = '';
      ui.selectedId = null;
    }
    renderProjectList();
    render();
  }
});

document.addEventListener('dragstart', (event) => {
  const model = event.target.closest('[data-drag-family]');
  const handle = event.target.closest('[data-drag-id]');
  const block = event.target.closest('.question-block[draggable="true"]');
  if (model) ui.dragging = { type: 'model', family: model.dataset.dragFamily };
  else if (handle) ui.dragging = { type: 'block', id: handle.dataset.dragId };
  else if (block) ui.dragging = { type: 'block', id: block.dataset.blockId };
  else return;
  event.dataTransfer.effectAllowed = ui.dragging.type === 'model' ? 'copy' : 'move';
  event.dataTransfer.setData('text/plain', JSON.stringify(ui.dragging));
  (block ?? handle?.closest('.check-card'))?.classList.add('dragging');
});

document.addEventListener('dragover', (event) => {
  if (!ui.dragging) return;
  const target = event.target.closest('[data-block-id], [data-model-slot]');
  if (!target) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = ui.dragging.type === 'model' ? 'copy' : 'move';
});

document.addEventListener('drop', (event) => {
  if (!ui.dragging) return;
  event.preventDefault();
  const targetBlock = event.target.closest('[data-block-id]');
  if (ui.dragging.type === 'model') {
    if (targetBlock) ui.selectedId = targetBlock.dataset.blockId;
    attachModel(ui.dragging.family);
  } else if (targetBlock && targetBlock.dataset.blockId !== ui.dragging.id) {
    const targetIndex = store.getState().blocks.findIndex((block) => block.id === targetBlock.dataset.blockId);
    if (targetIndex >= 0) store.dispatch(worksheetActions.reorderBlock(ui.dragging.id, targetIndex));
  }
  ui.dragging = null;
});

document.addEventListener('dragend', () => {
  ui.dragging = null;
  document.querySelectorAll('.dragging').forEach((element) => element.classList.remove('dragging'));
});

document.querySelector('#project-library-button').addEventListener('click', () => {
  store.flush();
  renderProjectList();
  projectDialog.showModal();
});

document.querySelector('#new-project-button').addEventListener('click', async () => {
  store.flush();
  store.newProject();
  ui = { ...ui, stage: 'paste', rawDraft: '', selectedId: null, editingId: null, browseModels: false, inspectorOpen: false, navigatorOpen: false };
  clearDraft();
  projectDialog.close();
  render();
});

document.querySelector('#undo-button').addEventListener('click', () => store.undo());
document.querySelector('#redo-button').addEventListener('click', () => store.redo());
document.querySelector('#header-print-button').addEventListener('click', () => goStage('print'));

document.addEventListener('keydown', (event) => {
  const modifier = event.metaKey || event.ctrlKey;
  if (!modifier) return;
  if (event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (event.shiftKey) store.redo(); else store.undo();
  } else if (event.key.toLowerCase() === 'y') {
    event.preventDefault();
    store.redo();
  } else if (event.key.toLowerCase() === 'p' && store.getState().blocks.some((block) => block.kind === 'question')) {
    event.preventDefault();
    ui.stage = 'print';
    render();
    setTimeout(() => window.print(), 80);
  }
});

window.addEventListener('resize', () => requestAnimationFrame(scalePages));
window.addEventListener('beforeunload', () => store.flush());

store.subscribe(() => render());
render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
}
