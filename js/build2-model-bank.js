/**
 * Maths Page Studio · Build 2 additional Year 4 model bank.
 *
 * This module is deliberately independent from the Build 1 registry.  It gives
 * the application a single, declarative source for the deeper model bank while
 * preserving the ten existing Build 1 family identifiers and saved recipes.
 * The integration layer can merge this bank with `model-registry.js` without
 * translating its stored Build 1 data.
 */

export const BUILD1_FAMILY_REFERENCES = Object.freeze([
  'place-value', 'base-ten', 'partition', 'number-line', 'part-whole',
  'comparison-bar', 'equal-groups', 'column-arithmetic', 'area-model', 'fraction-strip',
]);

export const BUILD2_SCAFFOLD_STATES = Object.freeze(['blank', 'guided', 'modelled']);
export const BUILD2_PRINT_SIZES = Object.freeze(['compact', 'standard', 'large', 'extra-large']);
// The groups renderer draws every complete group and every item in that
// group. Keep these limits beside validation and import them in the renderer
// so a recipe can never be accepted at one capacity and silently truncated at
// another.
export const DIVISION_GROUP_VISUAL_LIMITS = Object.freeze({
  maxGroups: 12,
  maxItemsPerGroup: 16,
});
export const BUILD2_ROW_VISUAL_LIMITS = Object.freeze({
  'editable-table': 8,
  'tally-frequency-table': 8,
  'bar-chart': 8,
  pictogram: 6,
  'line-graph': 10,
});
export const BUILD2_GRID_VISUAL_LIMIT = 20;
export const MULTIPLICATION_BAR_VISUAL_LIMIT = 16;
export const SCALING_BAR_VISUAL_LIMIT = 12;
export const BUILD2_REPRESENTATION_PURPOSES = Object.freeze([
  'interpret-situation',
  'expose-structure',
  'support-calculation',
  'support-reasoning',
  'record-thinking',
  'represent-data',
  'pupil-workspace',
]);

const DEFAULT_PRINT = Object.freeze({
  supportedSizes: BUILD2_PRINT_SIZES,
  minWidthMm: 62,
  minHeightMm: 24,
  preferredPosition: 'beneath',
  monochrome: 'Lines, labels, position and hatch patterns retain every mathematical distinction.',
});

const DEFAULT_ANSWER_PROTECTION = Object.freeze({
  level: 'medium',
  pupilRule: 'Keep the requested value, label, interval, classification or construction blank in pupil output.',
  teacherRule: 'Derived values may be available in teacher output only when the question is unambiguous.',
});

const BASE_EDITOR_FIELDS = Object.freeze([
  { key: 'scaffoldState', label: 'Scaffold', type: 'choice', options: BUILD2_SCAFFOLD_STATES },
  { key: 'size', label: 'Print size', type: 'choice', options: BUILD2_PRINT_SIZES },
  { key: 'unknown', label: 'Keep blank', type: 'text', optional: true },
]);

const clone = (value) => {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(clone);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
};

const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const whole = (value, fallback = 0) => Math.round(finite(value, fallback));
const bounded = (value, minimum, maximum, fallback = minimum) => Math.min(maximum, Math.max(minimum, finite(value, fallback)));
const positive = (value, fallback = 1) => Math.max(0.000001, finite(value, fallback));
const uniqueText = (values) => [...new Set((Array.isArray(values) ? values : [values])
  .filter((value) => typeof value === 'string' && value.trim())
  .map((value) => value.trim()))];

function field(key, label, type, options = {}) {
  return { key, label, type, ...options };
}

function modelDefinition(input) {
  const data = {
    category: 'General Workspaces',
    domains: [],
    compatibleQuestionFamilies: [],
    compatibleOperations: [],
    usefulUnknownPositions: ['result'],
    numericalConstraints: 'Values must remain finite and use a safe printable scale.',
    representationPurposes: ['expose-structure'],
    answerProtection: DEFAULT_ANSWER_PROTECTION,
    editorFields: [],
    print: DEFAULT_PRINT,
    alternativeModelIds: [],
    contraindications: ['Use only when its explicit mathematical structure matches the question.'],
    searchTerms: [],
    accessibleDescription: '',
    defaultValues: {},
    renderer: 'workspace',
    ...input,
  };
  return Object.freeze({
    ...data,
    editorFields: Object.freeze([...data.editorFields, ...BASE_EDITOR_FIELDS]),
    domains: Object.freeze([...data.domains]),
    compatibleQuestionFamilies: Object.freeze([...data.compatibleQuestionFamilies]),
    compatibleOperations: Object.freeze([...data.compatibleOperations]),
    usefulUnknownPositions: Object.freeze([...data.usefulUnknownPositions]),
    representationPurposes: Object.freeze([...data.representationPurposes]),
    alternativeModelIds: Object.freeze([...data.alternativeModelIds]),
    contraindications: Object.freeze([...data.contraindications]),
    searchTerms: Object.freeze([...data.searchTerms]),
    defaultValues: Object.freeze(clone(data.defaultValues)),
    answerProtection: Object.freeze({ ...DEFAULT_ANSWER_PROTECTION, ...data.answerProtection }),
    print: Object.freeze({ ...DEFAULT_PRINT, ...data.print }),
  });
}

const defs = [
  // Number and place value
  modelDefinition({
    id: 'place-value-counters', name: 'Place-value counters', category: 'Number and Place Value',
    childDescription: 'Counters grouped into thousands, hundreds, tens and ones.',
    accessibleDescription: 'Place-value counters arranged in labelled thousands, hundreds, tens and ones columns.',
    domains: ['number-place-value'], compatibleQuestionFamilies: ['represent', 'partition', 'compare', 'missing-number', 'error-analysis'],
    compatibleOperations: ['addition', 'subtraction'], usefulUnknownPositions: ['digit', 'place', 'counter-count'],
    numericalConstraints: 'Whole numbers from 0 to 9,999; compact views summarise a column rather than drawing an unreadable cloud of counters.',
    representationPurposes: ['expose-structure', 'support-calculation', 'support-reasoning'],
    answerProtection: { level: 'high', pupilRule: 'Hide the requested digit, counter total or completed exchange.' },
    editorFields: [field('values.number', 'Number', 'integer'), field('values.mode', 'Show', 'choice', { options: ['counters', 'digits', 'both'] }), field('values.exchange', 'Exchange step', 'boolean')],
    defaultValues: { number: 3462, mode: 'both', exchange: false }, renderer: 'place-value',
    searchTerms: ['counters', 'base ten counters', 'thousands', 'hundreds', 'tens', 'ones'],
    contraindications: ['Do not use to hide a required exchange process unless the pupil is meant to supply it.'],
  }),
  modelDefinition({
    id: 'base-ten-exchange', name: 'Base-ten exchange workspace', category: 'Number and Place Value',
    childDescription: 'Base-ten blocks with a clear exchange route.',
    accessibleDescription: 'Base-ten place-value workspace with a labelled exchange arrow between adjacent places.',
    domains: ['number-place-value', 'addition', 'subtraction'], compatibleQuestionFamilies: ['represent', 'calculate', 'find-error', 'explain'],
    compatibleOperations: ['addition', 'subtraction'], usefulUnknownPositions: ['exchange', 'result'],
    numericalConstraints: 'Whole numbers to 9,999; each exchange is ten of one place for one of the next place.',
    representationPurposes: ['support-calculation', 'support-reasoning'],
    answerProtection: { level: 'high', pupilRule: 'Show only the starting blocks when pupils must decide whether an exchange is needed.' },
    editorFields: [field('values.number', 'Starting number', 'integer'), field('values.exchangeFrom', 'Exchange from', 'choice', { options: ['ones', 'tens', 'hundreds', 'thousands'] }), field('values.showExchange', 'Show exchange arrow', 'boolean')],
    defaultValues: { number: 1286, exchangeFrom: 'tens', showExchange: true }, renderer: 'place-value',
    searchTerms: ['Dienes', 'exchange', 'regroup', 'decompose'],
  }),
  modelDefinition({
    id: 'arrow-card-builder', name: 'Arrow-card number builder', category: 'Number and Place Value',
    childDescription: 'Arrow cards that recombine a whole number.',
    accessibleDescription: 'Stacked arrow cards showing place-value contributions to one whole number.',
    domains: ['number-place-value'], compatibleQuestionFamilies: ['partition', 'represent', 'complete', 'compare'],
    usefulUnknownPositions: ['card', 'whole'], numericalConstraints: 'Whole numbers from 0 to 9,999; zero placeholders remain explicit when selected.',
    representationPurposes: ['expose-structure', 'record-thinking'],
    answerProtection: { level: 'high', pupilRule: 'Hide the card or recombined whole that is the requested answer.' },
    editorFields: [field('values.number', 'Number', 'integer'), field('values.showZeros', 'Show zero cards', 'boolean'), field('values.hiddenCards', 'Hidden card indexes', 'integer-list')],
    defaultValues: { number: 4607, showZeros: true, hiddenCards: [2] }, renderer: 'arrow-cards',
    searchTerms: ['arrow cards', 'expanded form', 'recombine', 'partition'],
  }),
  modelDefinition({
    id: 'partition-tree', name: 'Partition tree', category: 'Number and Place Value',
    childDescription: 'A branching number structure showing a whole and its parts.',
    accessibleDescription: 'A partition tree with one whole at the root and editable additive branches.',
    domains: ['number-place-value', 'addition-subtraction'], compatibleQuestionFamilies: ['partition', 'complete', 'missing-number', 'explain'],
    compatibleOperations: ['addition', 'subtraction'], usefulUnknownPositions: ['whole', 'part'],
    numericalConstraints: 'Two to six non-negative parts that total the whole.', representationPurposes: ['expose-structure', 'record-thinking'],
    answerProtection: { level: 'high', pupilRule: 'Leave the requested branch blank rather than deriving and printing it.' },
    editorFields: [field('values.whole', 'Whole', 'number'), field('values.parts', 'Branches', 'number-list'), field('values.orientation', 'Direction', 'choice', { options: ['down', 'across'] })],
    defaultValues: { whole: 6407, parts: [6000, 400, 7], orientation: 'down' }, renderer: 'tree',
    searchTerms: ['partition tree', 'number tree', 'expanded partition'],
  }),
  modelDefinition({
    id: 'number-bond', name: 'Part-whole number bond', category: 'Number and Place Value',
    childDescription: 'A whole linked to its additive parts.',
    accessibleDescription: 'A number bond with one whole circle and two or more part circles.',
    domains: ['addition-subtraction', 'number-place-value'], compatibleQuestionFamilies: ['calculate', 'complete', 'missing-number', 'fact-family'],
    compatibleOperations: ['addition', 'subtraction'], usefulUnknownPositions: ['whole', 'part'],
    numericalConstraints: 'Parts must add exactly to the whole.', representationPurposes: ['expose-structure', 'support-calculation'],
    answerProtection: { level: 'high', pupilRule: 'Keep the intended missing whole or part as an empty node.' },
    editorFields: [field('values.whole', 'Whole', 'number'), field('values.parts', 'Parts', 'number-list'), field('values.orientation', 'Orientation', 'choice', { options: ['horizontal', 'vertical'] })],
    defaultValues: { whole: 900, parts: [524, 376], orientation: 'horizontal' }, renderer: 'tree',
    searchTerms: ['number bond', 'part whole', 'whole and parts'],
  }),
  modelDefinition({
    id: 'four-digit-number-line', name: 'Four-digit number line', category: 'Number and Place Value',
    childDescription: 'A precise number line for locating and comparing four-digit numbers.',
    accessibleDescription: 'A four-digit number line with equally spaced intervals and an optional hidden target.',
    domains: ['number-place-value'], compatibleQuestionFamilies: ['locate', 'compare', 'order', 'continue', 'estimate'],
    usefulUnknownPositions: ['marker', 'label', 'interval'], numericalConstraints: 'End is greater than start; all visual divisions use one exact interval.',
    representationPurposes: ['expose-structure', 'record-thinking'],
    answerProtection: { level: 'high', pupilRule: 'Do not plot or label the number pupils are asked to locate.' },
    editorFields: [field('values.start', 'Start', 'integer'), field('values.end', 'End', 'integer'), field('values.divisions', 'Equal divisions', 'integer'), field('values.target', 'Target', 'integer', { optional: true })],
    defaultValues: { start: 2000, end: 3000, divisions: 10, target: 2750 }, renderer: 'number-line',
    searchTerms: ['number line', 'four digit', 'locate', 'interval'],
  }),
  modelDefinition({
    id: 'ordering-comparison-line', name: 'Ordering and comparison line', category: 'Number and Place Value',
    childDescription: 'Number cards arranged on a line for ordering or comparing.',
    accessibleDescription: 'A comparison line with editable number cards and blank comparison positions.',
    domains: ['number-place-value', 'decimals'], compatibleQuestionFamilies: ['order', 'compare', 'sort', 'missing-number'],
    usefulUnknownPositions: ['position', 'comparison-symbol'], numericalConstraints: 'Cards use finite values; an ordered display sorts numerically, not lexically.',
    representationPurposes: ['expose-structure', 'record-thinking'],
    answerProtection: { level: 'high', pupilRule: 'Do not insert the requested greater-than, less-than or equal sign.' },
    editorFields: [field('values.numbers', 'Number cards', 'number-list'), field('values.showSymbols', 'Show comparison signs', 'boolean'), field('values.order', 'Display order', 'choice', { options: ['given', 'ascending', 'blank'] })],
    defaultValues: { numbers: [4060, 4600, 4006], showSymbols: false, order: 'given' }, renderer: 'number-line',
    searchTerms: ['compare', 'order', 'greater than', 'less than', 'number cards'],
  }),
  modelDefinition({
    id: 'rounding-number-line', name: 'Rounding number line', category: 'Number and Place Value',
    childDescription: 'Neighbouring multiples and an exact midpoint for a rounding decision.',
    accessibleDescription: 'A rounding number line showing lower and upper multiples, the exact midpoint and a target number.',
    domains: ['number-place-value'], compatibleQuestionFamilies: ['round', 'estimate', 'explain'], usefulUnknownPositions: ['rounded-result', 'midpoint', 'target'],
    numericalConstraints: 'A positive rounding step with lower multiple, upper multiple and midpoint calculated exactly.',
    representationPurposes: ['expose-structure', 'support-reasoning'],
    answerProtection: { level: 'high', pupilRule: 'Keep the final rounded multiple unhighlighted in pupil output.' },
    editorFields: [field('values.number', 'Target number', 'integer'), field('values.step', 'Round to', 'choice', { options: [10, 100, 1000] }), field('values.showMidpoint', 'Show midpoint', 'boolean')],
    defaultValues: { number: 3462, step: 100, showMidpoint: true }, renderer: 'number-line',
    searchTerms: ['rounding', 'nearest ten', 'nearest hundred', 'midpoint'],
  }),
  modelDefinition({
    id: 'negative-number-line', name: 'Negative-number line / thermometer', category: 'Number and Place Value',
    childDescription: 'A line or thermometer that counts accurately through zero.',
    accessibleDescription: 'A negative-number scale with equally spaced values across zero.',
    domains: ['number-place-value', 'measurement'], compatibleQuestionFamilies: ['continue', 'compare', 'calculate-change', 'read-scale'],
    usefulUnknownPositions: ['label', 'temperature', 'change'], numericalConstraints: 'Intervals remain equal across zero and the start is less than the end.',
    representationPurposes: ['interpret-situation', 'expose-structure'],
    answerProtection: { level: 'medium', pupilRule: 'Hide labels pupils must read or complete.' },
    editorFields: [field('values.start', 'Start', 'integer'), field('values.end', 'End', 'integer'), field('values.divisions', 'Equal divisions', 'integer'), field('values.orientation', 'Orientation', 'choice', { options: ['horizontal', 'vertical'] })],
    defaultValues: { start: -10, end: 10, divisions: 10, orientation: 'vertical' }, renderer: 'number-line',
    searchTerms: ['negative', 'thermometer', 'temperature', 'below zero'],
  }),
  modelDefinition({
    id: 'roman-numeral-builder', name: 'Roman numeral builder', category: 'Number and Place Value',
    childDescription: 'Roman numeral symbols arranged into a valid number to 100.',
    accessibleDescription: 'A Roman numeral builder using I, V, X, L and C with an Arabic-number match.',
    domains: ['number-place-value'], compatibleQuestionFamilies: ['match', 'represent', 'complete', 'recognise'], usefulUnknownPositions: ['roman', 'arabic'],
    numericalConstraints: 'Arabic value is 1 to 100 and Roman notation uses valid additive and subtractive forms.',
    representationPurposes: ['expose-structure', 'record-thinking'],
    answerProtection: { level: 'high', pupilRule: 'Hide the representation pupils are asked to construct or match.' },
    editorFields: [field('values.number', 'Arabic number', 'integer', { min: 1, max: 100 }), field('values.showArabic', 'Show Arabic number', 'boolean'), field('values.showRoman', 'Show Roman numeral', 'boolean')],
    defaultValues: { number: 49, showArabic: true, showRoman: false }, renderer: 'roman',
    searchTerms: ['Roman numeral', 'I V X L C', 'Roman number'],
  }),

  // Addition and subtraction
  modelDefinition({
    id: 'compact-column-addition', name: 'Compact column-addition frame', category: 'Addition and Subtraction',
    childDescription: 'A place-aligned addition frame with room for exchanges.', accessibleDescription: 'A compact column addition frame with right-aligned place-value columns.',
    domains: ['addition'], compatibleQuestionFamilies: ['calculate', 'complete', 'find-error'], compatibleOperations: ['addition'], usefulUnknownPositions: ['result', 'exchange'],
    numericalConstraints: 'Two to four non-negative whole-number addends, each aligned by ones.', representationPurposes: ['support-calculation', 'record-thinking'],
    answerProtection: { level: 'high', pupilRule: 'Do not print the result or exchange digits when pupils must calculate them.' },
    editorFields: [field('values.operands', 'Addends', 'integer-list'), field('values.showExchangeRow', 'Exchange row', 'boolean'), field('values.result', 'Result', 'integer', { optional: true })],
    defaultValues: { operands: [3482, 1567], result: null, showExchangeRow: true, operation: 'addition' }, renderer: 'column', searchTerms: ['column addition', 'formal addition', 'exchange'],
  }),
  modelDefinition({
    id: 'expanded-column-addition', name: 'Expanded column addition', category: 'Addition and Subtraction',
    childDescription: 'An addition method showing the value contributed by each place.', accessibleDescription: 'Expanded column addition with place-value contributions shown separately.',
    domains: ['addition', 'number-place-value'], compatibleQuestionFamilies: ['calculate', 'explain', 'find-error'], compatibleOperations: ['addition'], usefulUnknownPositions: ['partial-sum', 'result'],
    numericalConstraints: 'Whole-number addends; each expanded contribution preserves its place value.', representationPurposes: ['support-calculation', 'support-reasoning'],
    answerProtection: { level: 'high', pupilRule: 'Leave intended partial sums and final total blank.' },
    editorFields: [field('values.operands', 'Addends', 'integer-list'), field('values.showExpanded', 'Show place values', 'boolean'), field('values.result', 'Result', 'integer', { optional: true })],
    defaultValues: { operands: [2687, 1546], result: null, operation: 'addition', showExpanded: true }, renderer: 'column', searchTerms: ['expanded addition', 'partitioned addition', 'partial sums'],
  }),
  modelDefinition({
    id: 'compact-column-subtraction', name: 'Compact column-subtraction frame', category: 'Addition and Subtraction',
    childDescription: 'A place-aligned subtraction frame with exchange notation.', accessibleDescription: 'A compact column subtraction frame with right-aligned digits and exchange space.',
    domains: ['subtraction'], compatibleQuestionFamilies: ['calculate', 'complete', 'find-error'], compatibleOperations: ['subtraction'], usefulUnknownPositions: ['result', 'exchange'],
    numericalConstraints: 'Two whole numbers with a non-negative result; zeros retain their place.', representationPurposes: ['support-calculation', 'record-thinking'],
    answerProtection: { level: 'high', pupilRule: 'Do not complete the exchanged digits or final difference automatically.' },
    editorFields: [field('values.operands', 'Minuend and subtrahend', 'integer-list'), field('values.showExchangeRow', 'Exchange row', 'boolean'), field('values.result', 'Result', 'integer', { optional: true })],
    defaultValues: { operands: [4003, 1786], result: null, showExchangeRow: true, operation: 'subtraction' }, renderer: 'column', searchTerms: ['column subtraction', 'formal subtraction', 'exchange across zero'],
  }),
  modelDefinition({
    id: 'expanded-column-subtraction', name: 'Expanded subtraction model', category: 'Addition and Subtraction',
    childDescription: 'A subtraction method showing decomposition by place value.', accessibleDescription: 'Expanded subtraction with decomposed place-value values and exchange steps.',
    domains: ['subtraction', 'number-place-value'], compatibleQuestionFamilies: ['calculate', 'explain', 'find-error'], compatibleOperations: ['subtraction'], usefulUnknownPositions: ['exchange', 'partial-difference', 'result'],
    numericalConstraints: 'Two whole numbers with a non-negative result; exchanged value remains equal.', representationPurposes: ['support-calculation', 'support-reasoning'],
    answerProtection: { level: 'high', pupilRule: 'Leave decomposition or difference blank where it is the intended work.' },
    editorFields: [field('values.operands', 'Minuend and subtrahend', 'integer-list'), field('values.showDecomposition', 'Show decomposition', 'boolean'), field('values.result', 'Result', 'integer', { optional: true })],
    defaultValues: { operands: [3204, 1789], result: null, operation: 'subtraction', showDecomposition: true }, renderer: 'column', searchTerms: ['expanded subtraction', 'decomposition', 'exchange'],
  }),
  modelDefinition({
    id: 'place-value-exchange-workspace', name: 'Place-value exchange workspace', category: 'Addition and Subtraction',
    childDescription: 'A place-value table for showing a safe exchange step.', accessibleDescription: 'A place-value exchange workspace with before and after columns linked by an exchange arrow.',
    domains: ['addition', 'subtraction', 'number-place-value'], compatibleQuestionFamilies: ['calculate', 'represent', 'explain', 'find-error'], compatibleOperations: ['addition', 'subtraction'], usefulUnknownPositions: ['exchange', 'after-value'],
    numericalConstraints: 'An exchange must represent ten units of one place as one unit of the next place.', representationPurposes: ['support-calculation', 'support-reasoning'],
    answerProtection: { level: 'high', pupilRule: 'Keep either the exchange arrow or resulting place count blank when that is the task.' },
    editorFields: [field('values.before', 'Starting value', 'integer'), field('values.after', 'After exchange', 'integer'), field('values.fromPlace', 'Exchange from', 'choice', { options: ['ones', 'tens', 'hundreds', 'thousands'] })],
    defaultValues: { before: 1286, after: 1286, fromPlace: 'tens' }, renderer: 'exchange', searchTerms: ['place value exchange', 'regroup', 'Dienes'],
  }),
  modelDefinition({
    id: 'empty-calculation-line', name: 'Empty number line for calculation', category: 'Addition and Subtraction',
    childDescription: 'A calculation line for counting on, back or bridging a boundary.', accessibleDescription: 'An empty calculation number line with editable jumps and blank labels.',
    domains: ['addition', 'subtraction'], compatibleQuestionFamilies: ['calculate', 'find-difference', 'represent', 'explain'], compatibleOperations: ['addition', 'subtraction'], usefulUnknownPositions: ['jump', 'jump-size', 'result'],
    numericalConstraints: 'Jumps move consistently in the chosen direction; labelled values must match their positions.', representationPurposes: ['support-calculation', 'record-thinking'],
    answerProtection: { level: 'high', pupilRule: 'Hide jump labels or end values pupils must determine.' },
    editorFields: [field('values.start', 'Start', 'number'), field('values.end', 'End', 'number'), field('values.jumps', 'Jumps', 'number-list'), field('values.direction', 'Direction', 'choice', { options: ['forward', 'backward'] })],
    defaultValues: { start: 376, end: 900, jumps: [24, 500], direction: 'forward' }, renderer: 'number-line', searchTerms: ['empty number line', 'count on', 'count back', 'difference'],
  }),
  modelDefinition({
    id: 'change-bar', name: 'Change bar model', category: 'Addition and Subtraction',
    childDescription: 'A start, change and result bar for increase or decrease problems.', accessibleDescription: 'A change bar with start, change and result positions clearly labelled.',
    domains: ['addition', 'subtraction'], compatibleQuestionFamilies: ['word-problem', 'calculate', 'missing-number', 'compare'], compatibleOperations: ['addition', 'subtraction'], usefulUnknownPositions: ['start', 'change', 'result'],
    numericalConstraints: 'Start plus signed change equals result; non-proportional bars must say structural rather than to scale.', representationPurposes: ['interpret-situation', 'expose-structure'],
    answerProtection: { level: 'high', pupilRule: 'Keep the question’s unknown segment visibly blank.' },
    editorFields: [field('values.start', 'Start', 'number'), field('values.change', 'Change', 'number'), field('values.result', 'Result', 'number'), field('values.direction', 'Change direction', 'choice', { options: ['increase', 'decrease'] })],
    defaultValues: { start: 846, change: -279, result: 567, direction: 'decrease' }, renderer: 'bar', searchTerms: ['change bar', 'start change result', 'increase', 'decrease'],
  }),
  modelDefinition({
    id: 'equation-balance', name: 'Equation balance', category: 'Addition and Subtraction',
    childDescription: 'Two equal sides of an equation held in balance.', accessibleDescription: 'An equation balance showing equivalent left and right expressions around an equals relationship.',
    domains: ['addition-subtraction', 'multiplication-division'], compatibleQuestionFamilies: ['missing-number', 'inverse', 'prove', 'find-error'], compatibleOperations: ['addition', 'subtraction', 'multiplication', 'division'], usefulUnknownPositions: ['left-expression', 'right-expression', 'comparison-symbol'],
    numericalConstraints: 'Both sides are represented as expressions; the model never silently changes equality.', representationPurposes: ['support-reasoning', 'record-thinking'],
    answerProtection: { level: 'high', pupilRule: 'Keep a missing expression or comparison sign blank.' },
    editorFields: [field('values.left', 'Left expression', 'text'), field('values.right', 'Right expression', 'text'), field('values.showEquals', 'Show equals sign', 'boolean')],
    defaultValues: { left: '□ + 376', right: '900', showEquals: true }, renderer: 'balance', searchTerms: ['equation', 'equals', 'balance', 'missing number', 'equivalent'],
  }),
  modelDefinition({
    id: 'inverse-fact-family', name: 'Inverse and fact-family relationship', category: 'Addition and Subtraction',
    childDescription: 'Connected addition/subtraction or multiplication/division facts.', accessibleDescription: 'A fact-family triangle with linked operation sentences and editable missing facts.',
    domains: ['addition-subtraction', 'multiplication-division'], compatibleQuestionFamilies: ['fact-family', 'inverse', 'complete', 'missing-number'], compatibleOperations: ['addition', 'subtraction', 'multiplication', 'division'], usefulUnknownPositions: ['fact', 'number'],
    numericalConstraints: 'Related facts share the same three values and retain correct inverse operations.', representationPurposes: ['expose-structure', 'support-reasoning'],
    answerProtection: { level: 'high', pupilRule: 'Hide the fact the pupil must generate.' },
    editorFields: [field('values.a', 'First value', 'number'), field('values.b', 'Second value', 'number'), field('values.total', 'Whole/product', 'number'), field('values.family', 'Family', 'choice', { options: ['addition-subtraction', 'multiplication-division'] })],
    defaultValues: { a: 7, b: 5, total: 12, family: 'addition-subtraction' }, renderer: 'tree', searchTerms: ['fact family', 'inverse', 'related facts'],
  }),
  modelDefinition({
    id: 'missing-number-strip', name: 'Missing-number strip', category: 'Addition and Subtraction',
    childDescription: 'A compact equation strip with one important blank.', accessibleDescription: 'A missing-number equation strip with an explicit blank in one structural position.',
    domains: ['addition-subtraction', 'multiplication-division'], compatibleQuestionFamilies: ['missing-number', 'inverse', 'complete'], compatibleOperations: ['addition', 'subtraction', 'multiplication', 'division'], usefulUnknownPositions: ['left', 'right', 'result'],
    numericalConstraints: 'The blank is structural and is never inferred into the pupil output.', representationPurposes: ['support-calculation', 'record-thinking'],
    answerProtection: { level: 'high', pupilRule: 'Preserve the blank exactly where the unknown belongs.' },
    editorFields: [field('values.left', 'Left value', 'text'), field('values.operation', 'Operation', 'choice', { options: ['+', '−', '×', '÷'] }), field('values.right', 'Right value', 'text'), field('values.result', 'Result', 'text')],
    defaultValues: { left: '□', operation: '+', right: '376', result: '900' }, renderer: 'equation-strip', searchTerms: ['missing number', 'equation', 'blank', 'inverse'],
  }),

  // Multiplication and division
  modelDefinition({
    id: 'array-structure', name: 'Array', category: 'Multiplication and Division',
    childDescription: 'Equal rows and columns showing a product.', accessibleDescription: 'A rectangular array with equal rows and columns and optional hidden dimension.',
    domains: ['multiplication', 'division'], compatibleQuestionFamilies: ['calculate', 'represent', 'factor-pairs', 'complete'], compatibleOperations: ['multiplication', 'division'], usefulUnknownPositions: ['rows', 'columns', 'total'],
    numericalConstraints: 'Rows and columns are positive whole numbers; all cells are equal.', representationPurposes: ['expose-structure', 'support-calculation'],
    answerProtection: { level: 'high', pupilRule: 'Hide the factor or total pupils must identify.' },
    editorFields: [field('values.rows', 'Rows', 'integer'), field('values.columns', 'Columns', 'integer'), field('values.showDimensions', 'Show dimensions', 'boolean')],
    defaultValues: { rows: 4, columns: 6, showDimensions: true }, renderer: 'grid', searchTerms: ['array', 'rows', 'columns', 'factors'],
  }),
  modelDefinition({
    id: 'repeated-addition-line', name: 'Repeated-addition number line', category: 'Multiplication and Division',
    childDescription: 'Equal jumps showing a multiplication relationship.', accessibleDescription: 'A number line with equal repeated-addition jumps.',
    domains: ['multiplication', 'division'], compatibleQuestionFamilies: ['calculate', 'represent', 'complete'], compatibleOperations: ['multiplication', 'division'], usefulUnknownPositions: ['jump-size', 'jump-count', 'total'],
    numericalConstraints: 'All jumps have the same numerical size and equal visual spacing.', representationPurposes: ['expose-structure', 'support-calculation'],
    answerProtection: { level: 'high', pupilRule: 'Keep the required jump count, jump size or total blank.' },
    editorFields: [field('values.start', 'Start', 'number'), field('values.jumpSize', 'Jump size', 'number'), field('values.jumpCount', 'Number of jumps', 'integer')],
    defaultValues: { start: 0, jumpSize: 7, jumpCount: 8 }, renderer: 'number-line', searchTerms: ['repeated addition', 'equal jumps', 'times table'],
  }),
  modelDefinition({
    id: 'multiplication-bar', name: 'Multiplication bar model', category: 'Multiplication and Division',
    childDescription: 'Equal sections showing groups, group size and total.', accessibleDescription: 'A multiplication bar divided into equal group sections.',
    domains: ['multiplication', 'division'], compatibleQuestionFamilies: ['word-problem', 'calculate', 'missing-number', 'scale'], compatibleOperations: ['multiplication', 'division'], usefulUnknownPositions: ['groups', 'group-size', 'total'],
    numericalConstraints: 'All sections are equal; total equals group count times group size.', representationPurposes: ['interpret-situation', 'expose-structure'],
    answerProtection: { level: 'high', pupilRule: 'Hide the intended unknown without changing the number of equal sections.' },
    editorFields: [field('values.groups', 'Groups', 'integer'), field('values.groupSize', 'In each group', 'number'), field('values.total', 'Total', 'number')],
    defaultValues: { groups: 6, groupSize: 8, total: 48 }, renderer: 'bar', searchTerms: ['multiplication bar', 'groups', 'each', 'total'],
  }),
  modelDefinition({
    id: 'partitioned-multiplication-grid', name: 'Grid / area multiplication model', category: 'Multiplication and Division',
    childDescription: 'A partitioned rectangle showing factors and partial products.', accessibleDescription: 'A partitioned multiplication grid with row and column factor parts.',
    domains: ['multiplication'], compatibleQuestionFamilies: ['calculate', 'partition', 'represent', 'find-error'], compatibleOperations: ['multiplication'], usefulUnknownPositions: ['factor', 'partial-product', 'product'],
    numericalConstraints: 'Row and column partitions add to their factors; every cell is the product of its intersecting parts.', representationPurposes: ['support-calculation', 'support-reasoning'],
    answerProtection: { level: 'high', pupilRule: 'Do not fill partial products or final product when they are the task.' },
    editorFields: [field('values.rowParts', 'Row parts', 'integer-list'), field('values.columnParts', 'Column parts', 'integer-list'), field('values.showPartialProducts', 'Show partial products', 'boolean')],
    defaultValues: { rowParts: [20, 3], columnParts: [4], showPartialProducts: false }, renderer: 'area-grid', searchTerms: ['grid method', 'area model', 'partitioned multiplication'],
  }),
  modelDefinition({
    id: 'place-value-multiplication', name: 'Place-value multiplication model', category: 'Multiplication and Division',
    childDescription: 'Place-value units multiplied by one digit with regrouping space.', accessibleDescription: 'A place-value multiplication model with one-digit multiplier and regrouping route.',
    domains: ['multiplication', 'number-place-value'], compatibleQuestionFamilies: ['calculate', 'represent', 'explain'], compatibleOperations: ['multiplication'], usefulUnknownPositions: ['regroup', 'partial-product', 'result'],
    numericalConstraints: 'Multiplier is a positive one-digit whole number; place-value values remain exact.', representationPurposes: ['support-calculation', 'support-reasoning'],
    answerProtection: { level: 'high', pupilRule: 'Leave regrouping and result for the pupil where required.' },
    editorFields: [field('values.number', 'Multiplicand', 'integer'), field('values.multiplier', 'Multiplier', 'integer', { min: 1, max: 9 }), field('values.showRegrouping', 'Show regrouping', 'boolean')],
    defaultValues: { number: 234, multiplier: 3, showRegrouping: false }, renderer: 'place-value', searchTerms: ['place value multiplication', 'regroup', 'times by one digit'],
  }),
  modelDefinition({
    id: 'short-multiplication', name: 'Formal short-multiplication frame', category: 'Multiplication and Division',
    childDescription: 'A place-aligned written multiplication frame.', accessibleDescription: 'A short multiplication frame with right-aligned digits and carry space.',
    domains: ['multiplication'], compatibleQuestionFamilies: ['calculate', 'complete', 'find-error'], compatibleOperations: ['multiplication'], usefulUnknownPositions: ['carry', 'result'],
    numericalConstraints: 'Whole-number multiplicand and one-digit multiplier; carry values preserve place value.', representationPurposes: ['support-calculation', 'record-thinking'],
    answerProtection: { level: 'high', pupilRule: 'Do not print carries or the product by default.' },
    editorFields: [field('values.number', 'Multiplicand', 'integer'), field('values.multiplier', 'Multiplier', 'integer', { min: 1, max: 9 }), field('values.result', 'Result', 'integer', { optional: true })],
    defaultValues: { number: 234, multiplier: 3, result: null }, renderer: 'column', searchTerms: ['short multiplication', 'formal multiplication', 'carry'],
  }),
  modelDefinition({
    id: 'factor-pair-array', name: 'Factor-pair array explorer', category: 'Multiplication and Division',
    childDescription: 'Arrays that show the factor pairs of one number.', accessibleDescription: 'A factor-pair explorer showing paired factors for one whole number.',
    domains: ['multiplication', 'number-place-value'], compatibleQuestionFamilies: ['factor-pairs', 'classify', 'complete'], compatibleOperations: ['multiplication'], usefulUnknownPositions: ['factor-pair'],
    numericalConstraints: 'Only positive whole factor pairs whose product equals the selected number are shown.', representationPurposes: ['expose-structure', 'record-thinking'],
    answerProtection: { level: 'high', pupilRule: 'Hide a requested factor pair rather than completing it.' },
    editorFields: [field('values.number', 'Number', 'integer', { min: 1, max: 100 }), field('values.hiddenPairIndex', 'Hide pair', 'integer', { optional: true })],
    defaultValues: { number: 24, hiddenPairIndex: null }, renderer: 'factor-pairs', searchTerms: ['factor pairs', 'arrays', 'factors'],
  }),
  modelDefinition({
    id: 'scaling-bar', name: 'Scaling bar', category: 'Multiplication and Division',
    childDescription: 'A bar showing how one quantity scales by a multiplier.', accessibleDescription: 'A scaling bar comparing an original quantity with a scaled quantity using equal-length units.',
    domains: ['multiplication', 'measurement'], compatibleQuestionFamilies: ['scale', 'word-problem', 'compare', 'missing-number'], compatibleOperations: ['multiplication', 'division'], usefulUnknownPositions: ['multiplier', 'scaled-value', 'original-value'],
    numericalConstraints: 'Multiplier is positive; labelled bars either use true proportional scale or state structural display.', representationPurposes: ['interpret-situation', 'expose-structure'],
    answerProtection: { level: 'high', pupilRule: 'Do not label the requested multiplier or scaled amount.' },
    editorFields: [field('values.original', 'Original quantity', 'number'), field('values.multiplier', 'Times as many', 'number'), field('values.scaled', 'Scaled quantity', 'number')],
    defaultValues: { original: 8, multiplier: 3, scaled: 24 }, renderer: 'bar', searchTerms: ['scaling', 'times as many', 'twice', 'three times'],
  }),
  modelDefinition({
    id: 'sharing-division', name: 'Sharing division model', category: 'Multiplication and Division',
    childDescription: 'A total shared equally between visible recipients.', accessibleDescription: 'A sharing division model with a total distributed equally across named groups.',
    domains: ['division'], compatibleQuestionFamilies: ['share', 'word-problem', 'calculate', 'remainder'], compatibleOperations: ['division'], usefulUnknownPositions: ['share', 'total', 'remainder'],
    numericalConstraints: 'Groups are equal; any remainder is shown separately rather than hidden.', representationPurposes: ['interpret-situation', 'support-calculation'],
    answerProtection: { level: 'high', pupilRule: 'Do not fill each share if finding it is the question.' },
    editorFields: [field('values.total', 'Total', 'integer'), field('values.groups', 'Recipients', 'integer'), field('values.showRemainder', 'Show remainder area', 'boolean')],
    defaultValues: { total: 29, groups: 4, showRemainder: true }, renderer: 'groups', searchTerms: ['sharing', 'share equally', 'division', 'recipients'],
  }),
  modelDefinition({
    id: 'grouping-division', name: 'Grouping division model', category: 'Multiplication and Division',
    childDescription: 'A total split into groups of a known size.', accessibleDescription: 'A grouping division model showing repeated groups of one specified size and any remainder.',
    domains: ['division'], compatibleQuestionFamilies: ['grouping', 'word-problem', 'calculate', 'remainder'], compatibleOperations: ['division'], usefulUnknownPositions: ['groups', 'group-size', 'remainder'],
    numericalConstraints: 'Each group has the same specified size; leftover is separated clearly.', representationPurposes: ['interpret-situation', 'support-calculation'],
    answerProtection: { level: 'high', pupilRule: 'Do not give the number of groups if pupils must determine it.' },
    editorFields: [field('values.total', 'Total', 'integer'), field('values.groupSize', 'Group size', 'integer'), field('values.showRemainder', 'Show remainder area', 'boolean')],
    defaultValues: { total: 29, groupSize: 4, showRemainder: true }, renderer: 'groups', searchTerms: ['grouping', 'groups of', 'division', 'how many groups'],
  }),
  modelDefinition({
    id: 'division-number-line', name: 'Division number line', category: 'Multiplication and Division',
    childDescription: 'Equal backward jumps showing repeated grouping or subtraction.', accessibleDescription: 'A division number line with equal jumps and an optional remainder.',
    domains: ['division'], compatibleQuestionFamilies: ['grouping', 'calculate', 'represent', 'remainder'], compatibleOperations: ['division'], usefulUnknownPositions: ['jump-count', 'jump-size', 'remainder'],
    numericalConstraints: 'Every full jump has equal value and visual length; remainder is less than the divisor.', representationPurposes: ['support-calculation', 'support-reasoning'],
    answerProtection: { level: 'high', pupilRule: 'Hide the number of jumps or remainder if that is the intended inference.' },
    editorFields: [field('values.total', 'Total', 'integer'), field('values.divisor', 'Group size', 'integer'), field('values.direction', 'Direction', 'choice', { options: ['backward', 'forward'] })],
    defaultValues: { total: 29, divisor: 4, direction: 'backward' }, renderer: 'number-line', searchTerms: ['division number line', 'repeated subtraction', 'equal jumps'],
  }),
  modelDefinition({
    id: 'short-division', name: 'Short-division frame', category: 'Multiplication and Division',
    childDescription: 'A compact bus-stop frame with place-aligned dividend digits.', accessibleDescription: 'A short-division frame with a divisor, aligned dividend digits, quotient cells and remainder space.',
    domains: ['division'], compatibleQuestionFamilies: ['calculate', 'complete', 'find-error'], compatibleOperations: ['division'], usefulUnknownPositions: ['quotient', 'remainder', 'regroup'],
    numericalConstraints: 'Divisor is a positive one-digit whole number; remainder remains smaller than divisor.', representationPurposes: ['support-calculation', 'record-thinking'],
    answerProtection: { level: 'high', pupilRule: 'Do not fill quotient digits or remainder by default.' },
    editorFields: [field('values.dividend', 'Dividend', 'integer'), field('values.divisor', 'Divisor', 'integer', { min: 1, max: 9 }), field('values.quotient', 'Quotient', 'integer', { optional: true }), field('values.remainder', 'Remainder', 'integer', { optional: true })],
    defaultValues: { dividend: 968, divisor: 4, quotient: null, remainder: null }, renderer: 'division-frame', searchTerms: ['short division', 'bus stop', 'remainder'],
  }),
  modelDefinition({
    id: 'remainder-model', name: 'Remainder model', category: 'Multiplication and Division',
    childDescription: 'Complete equal groups with a clearly separated leftover.', accessibleDescription: 'A remainder model showing completed equal groups and a separate leftover quantity.',
    domains: ['division'], compatibleQuestionFamilies: ['remainder', 'word-problem', 'calculate', 'interpret'], compatibleOperations: ['division'], usefulUnknownPositions: ['quotient', 'remainder', 'interpretation'],
    numericalConstraints: 'Remainder is always non-negative and smaller than group size.', representationPurposes: ['interpret-situation', 'support-reasoning'],
    answerProtection: { level: 'high', pupilRule: 'Do not decide whether a contextual remainder should be rounded, ignored or converted unless stated.' },
    editorFields: [field('values.total', 'Total', 'integer'), field('values.groupSize', 'Group size', 'integer'), field('values.showRemainder', 'Show leftover', 'boolean')],
    defaultValues: { total: 29, groupSize: 4, showRemainder: true }, renderer: 'groups', searchTerms: ['remainder', 'left over', 'division context'],
  }),

  // Fractions and decimals
  modelDefinition({
    id: 'fraction-wall', name: 'Fraction wall', category: 'Fractions and Decimals',
    childDescription: 'Aligned equal wholes divided into different denominators.', accessibleDescription: 'A fraction wall with aligned rows for equivalent fractions of the same whole.',
    domains: ['fractions'], compatibleQuestionFamilies: ['equivalent-fraction', 'compare-fractions', 'represent', 'complete'], usefulUnknownPositions: ['label', 'equivalent-fraction'],
    numericalConstraints: 'Every row represents the same-width whole and is divided into equal parts.', representationPurposes: ['expose-structure', 'support-reasoning'],
    answerProtection: { level: 'high', pupilRule: 'Hide equivalent labels pupils must identify.' },
    editorFields: [field('values.denominators', 'Denominator rows', 'integer-list'), field('values.highlight', 'Highlight fraction', 'text', { optional: true }), field('values.showLabels', 'Show labels', 'boolean')],
    defaultValues: { denominators: [2, 3, 4, 5, 6, 8, 10], highlight: '1/2', showLabels: true }, renderer: 'fraction-wall', searchTerms: ['fraction wall', 'equivalent fractions', 'halves', 'quarters'],
  }),
  modelDefinition({
    id: 'fraction-area-model', name: 'Fraction bar or area model', category: 'Fractions and Decimals',
    childDescription: 'Equal rectangular or circular parts showing a selected fraction.', accessibleDescription: 'An equal-part fraction area model with selected parts matching the numerator.',
    domains: ['fractions'], compatibleQuestionFamilies: ['find-fraction', 'compare-fractions', 'add-fractions', 'subtract-fractions'], usefulUnknownPositions: ['numerator', 'denominator', 'selected-parts'],
    numericalConstraints: 'Parts are equal; circle variant is restricted to readable denominators.', representationPurposes: ['expose-structure', 'support-calculation'],
    answerProtection: { level: 'high', pupilRule: 'Do not shade or label the requested fraction automatically.' },
    editorFields: [field('values.numerator', 'Numerator', 'integer'), field('values.denominator', 'Denominator', 'integer'), field('values.shape', 'Shape', 'choice', { options: ['rectangle', 'circle'] })],
    defaultValues: { numerator: 3, denominator: 5, shape: 'rectangle' }, renderer: 'fraction-area', searchTerms: ['fraction bar', 'fraction area', 'shade fraction', 'circle fraction'],
  }),
  modelDefinition({
    id: 'fraction-set-model', name: 'Fraction set model', category: 'Fractions and Decimals',
    childDescription: 'A collection arranged into equal denominator groups.', accessibleDescription: 'A fraction-of-a-set model with equal groups and selected items.',
    domains: ['fractions'], compatibleQuestionFamilies: ['find-fraction', 'fraction-of-quantity', 'complete'], usefulUnknownPositions: ['selected', 'total', 'numerator'],
    numericalConstraints: 'The collection groups exactly into the denominator where an equal group model is used.', representationPurposes: ['interpret-situation', 'support-calculation'],
    answerProtection: { level: 'high', pupilRule: 'Keep selected subset or result blank when pupils need to find it.' },
    editorFields: [field('values.total', 'Collection total', 'integer'), field('values.numerator', 'Numerator', 'integer'), field('values.denominator', 'Denominator', 'integer')],
    defaultValues: { total: 20, numerator: 3, denominator: 5 }, renderer: 'fraction-set', searchTerms: ['fraction of a set', 'collection', 'fraction of quantity'],
  }),
  modelDefinition({
    id: 'fraction-number-line', name: 'Fraction number line', category: 'Fractions and Decimals',
    childDescription: 'A number line divided into exact fraction intervals.', accessibleDescription: 'A fraction number line from zero to one or beyond with equal denominator intervals.',
    domains: ['fractions'], compatibleQuestionFamilies: ['locate', 'compare-fractions', 'order', 'equivalent-fraction'], usefulUnknownPositions: ['marker', 'interval', 'label'],
    numericalConstraints: 'Intervals are exactly 1 divided by denominator; labels map to exact positions.', representationPurposes: ['expose-structure', 'record-thinking'],
    answerProtection: { level: 'high', pupilRule: 'Do not place or label the fraction pupils must locate.' },
    editorFields: [field('values.denominator', 'Denominator', 'integer'), field('values.maxWhole', 'Line end', 'integer'), field('values.target', 'Target numerator', 'integer', { optional: true })],
    defaultValues: { denominator: 5, maxWhole: 1, target: 3 }, renderer: 'fraction-line', searchTerms: ['fraction number line', 'locate fraction', 'compare fractions'],
  }),
  modelDefinition({
    id: 'equivalent-fraction-strips', name: 'Equivalent-fraction strips', category: 'Fractions and Decimals',
    childDescription: 'Aligned strips that show equal amounts in different denominators.', accessibleDescription: 'Equivalent fraction strips aligned to the same whole with matching selected widths.',
    domains: ['fractions'], compatibleQuestionFamilies: ['equivalent-fraction', 'complete', 'compare-fractions'], usefulUnknownPositions: ['numerator', 'denominator', 'equivalence'],
    numericalConstraints: 'Each strip is the same whole and selected areas have equal width.', representationPurposes: ['expose-structure', 'support-reasoning'],
    answerProtection: { level: 'high', pupilRule: 'Hide the numerator or denominator pupils must complete.' },
    editorFields: [field('values.fractions', 'Fractions', 'fraction-list'), field('values.showLabels', 'Show labels', 'boolean')],
    defaultValues: { fractions: [{ numerator: 1, denominator: 2 }, { numerator: 2, denominator: 4 }, { numerator: 4, denominator: 8 }], showLabels: true }, renderer: 'fraction-area', searchTerms: ['equivalent fractions', 'fraction strips'],
  }),
  modelDefinition({
    id: 'fraction-of-quantity-bar', name: 'Fraction-of-quantity bar', category: 'Fractions and Decimals',
    childDescription: 'A whole quantity divided into equal denominator parts.', accessibleDescription: 'A fraction-of-a-quantity bar with equal sections, one-part value and selected numerator sections.',
    domains: ['fractions'], compatibleQuestionFamilies: ['fraction-of-quantity', 'calculate', 'complete'], usefulUnknownPositions: ['one-part', 'selected-total', 'whole'],
    numericalConstraints: 'Whole quantity divides exactly into the denominator in a fully configured model.', representationPurposes: ['expose-structure', 'support-calculation'],
    answerProtection: { level: 'high', pupilRule: 'Do not print the selected quantity if pupils must calculate it.' },
    editorFields: [field('values.whole', 'Whole quantity', 'integer'), field('values.numerator', 'Numerator', 'integer'), field('values.denominator', 'Denominator', 'integer'), field('values.onePart', 'One part value', 'number', { optional: true })],
    defaultValues: { whole: 20, numerator: 3, denominator: 5, onePart: null }, renderer: 'bar', searchTerms: ['fraction of quantity', 'fraction bar', 'one part'],
  }),
  modelDefinition({
    id: 'fraction-calculation-bar', name: 'Fraction addition and subtraction bar', category: 'Fractions and Decimals',
    childDescription: 'Same-denominator fraction parts combined or removed.', accessibleDescription: 'A fraction calculation bar with equal denominator parts and a hidden result area.',
    domains: ['fractions'], compatibleQuestionFamilies: ['add-fractions', 'subtract-fractions', 'complete'], compatibleOperations: ['addition', 'subtraction'], usefulUnknownPositions: ['result-numerator'],
    numericalConstraints: 'Fractions have a shared denominator and every bar part is equal.', representationPurposes: ['support-calculation', 'support-reasoning'],
    answerProtection: { level: 'high', pupilRule: 'Keep the result fraction blank in pupil output.' },
    editorFields: [field('values.firstNumerator', 'First numerator', 'integer'), field('values.secondNumerator', 'Second numerator', 'integer'), field('values.denominator', 'Denominator', 'integer'), field('values.operation', 'Operation', 'choice', { options: ['+', '−'] })],
    defaultValues: { firstNumerator: 2, secondNumerator: 1, denominator: 5, operation: '+' }, renderer: 'bar', searchTerms: ['fraction addition', 'fraction subtraction', 'same denominator'],
  }),
  modelDefinition({
    id: 'tenths-hundredths-grid', name: 'Tenths and hundredths grid', category: 'Fractions and Decimals',
    childDescription: 'A ten-strip or hundred square linked to fraction and decimal notation.', accessibleDescription: 'A decimal grid with equal tenths or hundredths cells and selected values.',
    domains: ['decimals', 'fractions'], compatibleQuestionFamilies: ['represent', 'compare', 'complete', 'convert'], usefulUnknownPositions: ['decimal', 'fraction', 'selected-cells'],
    numericalConstraints: 'Ten-strip has ten equal cells and hundred grid has one hundred equal cells.', representationPurposes: ['expose-structure', 'record-thinking'],
    answerProtection: { level: 'high', pupilRule: 'Do not show the equivalent decimal or fraction pupils must write.' },
    editorFields: [field('values.hundredths', 'Selected hundredths', 'integer', { min: 0, max: 100 }), field('values.mode', 'Grid', 'choice', { options: ['tenths', 'hundredths'] }), field('values.showNotation', 'Show notation', 'boolean')],
    defaultValues: { hundredths: 37, mode: 'hundredths', showNotation: false }, renderer: 'decimal-grid', searchTerms: ['tenths', 'hundredths', 'decimal grid', 'hundred square'],
  }),
  modelDefinition({
    id: 'decimal-place-value-chart', name: 'Decimal place-value chart', category: 'Fractions and Decimals',
    childDescription: 'Digits aligned around a fixed decimal point.', accessibleDescription: 'A decimal place-value chart with ones, tenths and hundredths columns and fixed decimal point.',
    domains: ['decimals', 'fractions'], compatibleQuestionFamilies: ['represent', 'compare', 'partition', 'complete'], usefulUnknownPositions: ['digit', 'place', 'decimal'],
    numericalConstraints: 'Decimal point remains fixed between ones and tenths; values support up to two decimal places.', representationPurposes: ['expose-structure', 'support-calculation'],
    answerProtection: { level: 'high', pupilRule: 'Hide the requested digit or place-value label.' },
    editorFields: [field('values.number', 'Decimal number', 'decimal'), field('values.mode', 'Show', 'choice', { options: ['digits', 'counters', 'both'] })],
    defaultValues: { number: 3.47, mode: 'both' }, renderer: 'place-value', searchTerms: ['decimal place value', 'tenths', 'hundredths'],
  }),
  modelDefinition({
    id: 'decimal-number-line', name: 'Decimal number line', category: 'Fractions and Decimals',
    childDescription: 'A precise decimal scale with exact tenths or hundredths intervals.', accessibleDescription: 'A decimal number line with equal intervals and an optional hidden target marker.',
    domains: ['decimals', 'fractions'], compatibleQuestionFamilies: ['locate', 'compare', 'order', 'complete'], usefulUnknownPositions: ['marker', 'label', 'interval'],
    numericalConstraints: 'Intervals are calculated from endpoints and divisions, never rounded visually.', representationPurposes: ['expose-structure', 'record-thinking'],
    answerProtection: { level: 'high', pupilRule: 'Do not label or plot the decimal pupils are asked to locate.' },
    editorFields: [field('values.start', 'Start', 'decimal'), field('values.end', 'End', 'decimal'), field('values.divisions', 'Equal divisions', 'integer'), field('values.target', 'Target', 'decimal', { optional: true })],
    defaultValues: { start: 0, end: 1, divisions: 10, target: 0.7 }, renderer: 'number-line', searchTerms: ['decimal number line', 'tenths', 'hundredths'],
  }),

  // Measurement
  modelDefinition({
    id: 'money-representation', name: 'Money representation', category: 'Measurement',
    childDescription: 'Clear coins, notes and amount cards for pounds and pence.', accessibleDescription: 'A money representation showing labelled pounds and pence values with a total area.',
    domains: ['money', 'decimals'], compatibleQuestionFamilies: ['calculate', 'compare', 'find-change', 'equivalent-value'], compatibleOperations: ['addition', 'subtraction'], usefulUnknownPositions: ['total', 'change', 'combination'],
    numericalConstraints: 'Money is held in exact pence integers internally; pounds and pence do not use floating point.', representationPurposes: ['interpret-situation', 'support-calculation'],
    answerProtection: { level: 'high', pupilRule: 'Keep requested total or change blank.' },
    editorFields: [field('values.amountPence', 'Amount in pence', 'integer'), field('values.pricePence', 'Price in pence', 'integer', { optional: true }), field('values.tenderedPence', 'Paid in pence', 'integer', { optional: true })],
    // Price and paid amount are deliberately absent until a change question
    // binds them.  A generic money representation must never invent a shop
    // transaction from the model's demonstration defaults.
    defaultValues: { amountPence: 375, pricePence: null, tenderedPence: null }, renderer: 'money', searchTerms: ['money', 'pounds', 'pence', 'change', 'coins'],
  }),
  modelDefinition({
    id: 'unit-conversion-bridge', name: 'Unit-conversion bridge', category: 'Measurement',
    childDescription: 'A bridge showing an exact multiplicative conversion relationship.', accessibleDescription: 'A unit-conversion bridge linking two units with the exact conversion factor.',
    domains: ['measurement'], compatibleQuestionFamilies: ['convert', 'calculate', 'complete', 'explain'], compatibleOperations: ['multiplication', 'division'], usefulUnknownPositions: ['converted-value', 'factor'],
    numericalConstraints: 'Only exact Year 4 unit relationships are offered.', representationPurposes: ['expose-structure', 'support-calculation'],
    answerProtection: { level: 'high', pupilRule: 'Do not fill the converted value pupils are asked to find.' },
    editorFields: [field('values.fromValue', 'From value', 'number'), field('values.fromUnit', 'From unit', 'choice', { options: ['km', 'm', 'cm', 'mm', 'kg', 'g', 'l', 'ml', 'h', 'min', '£', 'p'] }), field('values.toUnit', 'To unit', 'choice', { options: ['m', 'cm', 'mm', 'g', 'ml', 'min', 'p'] })],
    defaultValues: { fromValue: 3, fromUnit: 'km', toUnit: 'm' }, renderer: 'bridge', searchTerms: ['conversion', 'km m', 'kg g', 'litres ml', 'hours minutes'],
  }),
  modelDefinition({
    id: 'ruler-length-line', name: 'Ruler and length line', category: 'Measurement',
    childDescription: 'A marked ruler with exact centimetre and millimetre ticks.', accessibleDescription: 'A ruler with consistent centimetre and millimetre intervals and a selected line segment.',
    domains: ['measurement'], compatibleQuestionFamilies: ['measure', 'read-scale', 'calculate-length'], usefulUnknownPositions: ['length', 'start', 'end'],
    numericalConstraints: 'Major and minor ticks have exact consistent intervals; start need not be zero.', representationPurposes: ['interpret-situation', 'record-thinking'],
    answerProtection: { level: 'high', pupilRule: 'Do not label the measurement pupils must read.' },
    editorFields: [field('values.startCm', 'Ruler start', 'number'), field('values.endCm', 'Ruler end', 'number'), field('values.segmentStart', 'Segment start', 'number'), field('values.segmentEnd', 'Segment end', 'number')],
    defaultValues: { startCm: 0, endCm: 12, segmentStart: 1.2, segmentEnd: 8.7 }, renderer: 'scale', searchTerms: ['ruler', 'length', 'centimetres', 'millimetres'],
  }),
  modelDefinition({
    id: 'reading-scale', name: 'Reading scales', category: 'Measurement',
    childDescription: 'A consistent dial or linear scale for mass, capacity or temperature.', accessibleDescription: 'A labelled measurement scale with equally spaced intervals and a pointer at a valid value.',
    domains: ['measurement'], compatibleQuestionFamilies: ['read-scale', 'complete', 'measure', 'compare'], usefulUnknownPositions: ['pointer-value', 'interval', 'label'],
    numericalConstraints: 'Each interval has one exact value; pointer lies on a valid scale position.', representationPurposes: ['interpret-situation', 'record-thinking'],
    answerProtection: { level: 'high', pupilRule: 'Hide the pointer value or interval pupils must determine.' },
    editorFields: [field('values.start', 'Scale start', 'number'), field('values.end', 'Scale end', 'number'), field('values.divisions', 'Divisions', 'integer'), field('values.pointer', 'Pointer value', 'number'), field('values.kind', 'Scale type', 'choice', { options: ['mass', 'capacity', 'temperature'] })],
    defaultValues: { start: 0, end: 1000, divisions: 10, pointer: 650, kind: 'mass' }, renderer: 'scale', searchTerms: ['scale', 'mass', 'capacity', 'temperature', 'read'],
  }),
  modelDefinition({
    id: 'clock-model', name: 'Clock model', category: 'Measurement',
    childDescription: 'An analogue clock linked to a digital time.', accessibleDescription: 'An analogue clock with editable hour and minute hands and optional digital time.',
    domains: ['time'], compatibleQuestionFamilies: ['tell-time', 'compare-time', 'complete', 'draw-hands'], usefulUnknownPositions: ['hands', 'digital-time'],
    numericalConstraints: 'Minute hand uses 0 to 59 minutes and hour hand position includes the minute fraction.', representationPurposes: ['interpret-situation', 'record-thinking'],
    answerProtection: { level: 'high', pupilRule: 'Leave hands blank where pupils must draw them, and hide the requested digital time.' },
    editorFields: [field('values.hour', 'Hour', 'integer', { min: 0, max: 23 }), field('values.minute', 'Minute', 'integer', { min: 0, max: 59 }), field('values.showHands', 'Show hands', 'boolean'), field('values.showDigital', 'Show digital time', 'boolean')],
    defaultValues: { hour: 14, minute: 35, showHands: true, showDigital: false }, renderer: 'clock', searchTerms: ['clock', 'analogue', 'digital time', 'draw hands'],
  }),
  modelDefinition({
    id: 'duration-timeline', name: 'Duration timeline', category: 'Measurement',
    childDescription: 'A timeline connecting start, duration and end times.', accessibleDescription: 'A time duration timeline with labelled start, jumps and end positions.',
    domains: ['time'], compatibleQuestionFamilies: ['calculate-duration', 'complete', 'word-problem'], usefulUnknownPositions: ['start', 'duration', 'end'],
    numericalConstraints: 'Times use minutes from midnight; jumps handle hour and noon boundaries exactly.', representationPurposes: ['support-calculation', 'record-thinking'],
    answerProtection: { level: 'high', pupilRule: 'Hide the missing start, duration or end time.' },
    editorFields: [field('values.startMinutes', 'Start minutes', 'integer'), field('values.endMinutes', 'End minutes', 'integer'), field('values.showJumps', 'Show jumps', 'boolean')],
    defaultValues: { startMinutes: 635, endMinutes: 730, showJumps: true }, renderer: 'timeline', searchTerms: ['duration', 'timeline', 'elapsed time', 'start end'],
  }),
  modelDefinition({
    id: 'perimeter-trace', name: 'Perimeter trace', category: 'Measurement',
    childDescription: 'A shape with its boundary highlighted, not its area.', accessibleDescription: 'A labelled rectilinear shape with the perimeter boundary highlighted.',
    domains: ['perimeter', 'geometry'], compatibleQuestionFamilies: ['find-perimeter', 'calculate', 'complete'], usefulUnknownPositions: ['side-length', 'perimeter'],
    numericalConstraints: 'Opposite rectangle sides are equal; the highlighted route is only the outer boundary.', representationPurposes: ['interpret-situation', 'support-calculation'],
    answerProtection: { level: 'high', pupilRule: 'Do not print the calculated perimeter or an inferred side pupils must find.' },
    editorFields: [field('values.width', 'Width', 'number'), field('values.height', 'Height', 'number'), field('values.kind', 'Shape', 'choice', { options: ['rectangle', 'rectilinear'] }), field('values.sides', 'Rectilinear side lengths', 'number-list', { optional: true }), field('values.showBoundary', 'Highlight boundary', 'boolean')],
    defaultValues: { width: 8, height: 4, kind: 'rectangle', sides: [], showBoundary: true }, renderer: 'perimeter', searchTerms: ['perimeter', 'boundary', 'rectangle', 'rectilinear'],
  }),
  modelDefinition({
    id: 'area-square-grid', name: 'Area square grid', category: 'Measurement',
    childDescription: 'Equal square units inside a shape for area reasoning.', accessibleDescription: 'An area model on equal square units, visually distinct from a perimeter trace.',
    domains: ['area', 'geometry'], compatibleQuestionFamilies: ['find-area', 'construct', 'compare-area', 'calculate'], usefulUnknownPositions: ['area', 'dimension', 'shape'],
    numericalConstraints: 'Each grid cell is one equal square unit; dimensions use whole cells in the default model.', representationPurposes: ['interpret-situation', 'support-calculation', 'record-thinking'],
    answerProtection: { level: 'high', pupilRule: 'Do not label total area when pupils must calculate or construct it.' },
    editorFields: [field('values.width', 'Width in squares', 'integer'), field('values.height', 'Height in squares', 'integer'), field('values.showAreaLabel', 'Show area label', 'boolean')],
    defaultValues: { width: 8, height: 4, showAreaLabel: false }, renderer: 'grid', searchTerms: ['area', 'square grid', 'square units'],
  }),

  // Geometry and position
  modelDefinition({
    id: 'angle-comparator', name: 'Angle comparator', category: 'Geometry and Position',
    childDescription: 'An angle compared clearly with a right angle.', accessibleDescription: 'An angle comparator with two arms and a right-angle reference.',
    domains: ['geometry'], compatibleQuestionFamilies: ['identify-property', 'classify', 'compare-angle', 'complete'], usefulUnknownPositions: ['classification', 'angle'],
    numericalConstraints: 'Angle is 0 to 360 degrees; right-angle reference is exactly 90 degrees.', representationPurposes: ['interpret-situation', 'support-reasoning'],
    answerProtection: { level: 'medium', pupilRule: 'Hide the classification if pupils must decide acute, right or obtuse.' },
    editorFields: [field('values.degrees', 'Angle degrees', 'number', { min: 0, max: 360 }), field('values.showRightReference', 'Show right-angle reference', 'boolean'), field('values.showLabel', 'Show classification', 'boolean')],
    defaultValues: { degrees: 120, showRightReference: true, showLabel: false }, renderer: 'angle', searchTerms: ['angle', 'acute', 'right angle', 'obtuse'],
  }),
  modelDefinition({
    id: 'turn-model', name: 'Turn model', category: 'Geometry and Position',
    childDescription: 'A start direction and arrow showing an exact turn.', accessibleDescription: 'A turn model showing a start direction, curved turn arrow and end direction.',
    domains: ['position-direction'], compatibleQuestionFamilies: ['turn', 'follow-direction', 'complete'], usefulUnknownPositions: ['turn', 'end-direction'],
    numericalConstraints: 'Turns are quarter, half, three-quarter or full turns in clockwise or anticlockwise direction.', representationPurposes: ['interpret-situation', 'record-thinking'],
    answerProtection: { level: 'high', pupilRule: 'Leave end direction blank where pupils need to determine it.' },
    editorFields: [field('values.turn', 'Turn', 'choice', { options: ['quarter', 'half', 'three-quarter', 'full'] }), field('values.direction', 'Direction', 'choice', { options: ['clockwise', 'anticlockwise'] }), field('values.start', 'Start direction', 'choice', { options: ['north', 'east', 'south', 'west'] })],
    defaultValues: { turn: 'quarter', direction: 'clockwise', start: 'north' }, renderer: 'turn', searchTerms: ['turn', 'clockwise', 'anticlockwise', 'quarter turn'],
  }),
  modelDefinition({
    id: 'shape-property-model', name: 'Shape-property model', category: 'Geometry and Position',
    childDescription: 'A varied-orientation shape with property marks.', accessibleDescription: 'A polygon with marked equal sides, parallel lines and right angles where selected.',
    domains: ['geometry'], compatibleQuestionFamilies: ['identify-property', 'classify', 'compare', 'complete'], usefulUnknownPositions: ['shape-name', 'property'],
    numericalConstraints: 'Parallel, perpendicular, equal-side and right-angle marks must match the generated geometry.', representationPurposes: ['interpret-situation', 'support-reasoning'],
    answerProtection: { level: 'medium', pupilRule: 'Hide the requested property or classification.' },
    editorFields: [field('values.shape', 'Shape', 'choice', { options: ['triangle', 'quadrilateral', 'pentagon', 'hexagon'] }), field('values.orientation', 'Orientation', 'choice', { options: ['upright', 'rotated', 'irregular'] }), field('values.showMarks', 'Show property marks', 'boolean')],
    defaultValues: { shape: 'quadrilateral', orientation: 'rotated', showMarks: true }, renderer: 'shape', searchTerms: ['shape properties', 'parallel', 'perpendicular', 'quadrilateral', 'polygon'],
  }),
  modelDefinition({
    id: 'shape-sort-workspace', name: 'Shape-sort workspace', category: 'Geometry and Position',
    childDescription: 'A Venn or Carroll diagram for classifying shapes.', accessibleDescription: 'A shape sorting workspace with editable category headings and unclassified shape cards.',
    domains: ['geometry'], compatibleQuestionFamilies: ['sort', 'classify', 'explain'], usefulUnknownPositions: ['category', 'placement'],
    numericalConstraints: 'A Carroll table has independent row and column criteria; Venn regions remain distinct.', representationPurposes: ['record-thinking', 'support-reasoning'],
    answerProtection: { level: 'high', pupilRule: 'Keep category placements blank for pupil classification.' },
    editorFields: [field('values.kind', 'Sort type', 'choice', { options: ['venn', 'carroll'] }), field('values.leftHeading', 'First heading', 'text'), field('values.rightHeading', 'Second heading', 'text')],
    defaultValues: { kind: 'venn', leftHeading: 'Has right angles', rightHeading: 'Has parallel sides' }, renderer: 'shape-sort', searchTerms: ['Venn diagram', 'Carroll diagram', 'sort shapes', 'classify'],
  }),
  modelDefinition({
    id: 'symmetry-grid', name: 'Symmetry grid', category: 'Geometry and Position',
    childDescription: 'A square grid with a clear mirror line.', accessibleDescription: 'A square symmetry grid with a marked horizontal, vertical or diagonal mirror line.',
    domains: ['geometry'], compatibleQuestionFamilies: ['symmetry', 'complete', 'reflect'], usefulUnknownPositions: ['reflection', 'mirror-line'],
    numericalConstraints: 'Reflected points keep exactly the same perpendicular distance from the mirror line.', representationPurposes: ['record-thinking', 'support-reasoning'],
    answerProtection: { level: 'high', pupilRule: 'Do not draw the missing reflected half.' },
    editorFields: [field('values.size', 'Grid size', 'integer', { min: 4, max: 16 }), field('values.axis', 'Mirror line', 'choice', { options: ['vertical', 'horizontal', 'diagonal'] }), field('values.showHalf', 'Show one half', 'boolean')],
    defaultValues: { size: 8, axis: 'vertical', showHalf: true }, renderer: 'symmetry', searchTerms: ['symmetry', 'mirror line', 'reflection grid'],
  }),
  modelDefinition({
    id: 'coordinate-grid', name: 'Coordinate grid', category: 'Geometry and Position',
    childDescription: 'A correctly labelled first-quadrant coordinate grid.', accessibleDescription: 'A first-quadrant coordinate grid with equal integer intervals and editable plotted points.',
    domains: ['position-direction', 'geometry'], compatibleQuestionFamilies: ['plot-coordinates', 'construct-shape', 'complete', 'move'], usefulUnknownPositions: ['coordinate', 'point', 'shape'],
    numericalConstraints: 'Axes are labelled x and y; interval positions are equal and all supplied points are in the first quadrant.', representationPurposes: ['record-thinking', 'expose-structure'],
    answerProtection: { level: 'high', pupilRule: 'Do not plot points or label coordinates pupils are asked to provide.' },
    editorFields: [field('values.max', 'Axis maximum', 'integer', { min: 4, max: 20 }), field('values.points', 'Points', 'point-list'), field('values.showLabels', 'Show point labels', 'boolean')],
    defaultValues: { max: 10, points: [{ x: 2, y: 3, label: 'A' }, { x: 7, y: 5, label: 'B' }], showLabels: false }, renderer: 'coordinates', searchTerms: ['coordinates', 'grid', 'first quadrant', 'plot'],
  }),

  // Statistics
  modelDefinition({
    id: 'tally-frequency-table', name: 'Tally and frequency table', category: 'Statistics',
    childDescription: 'Categories, tally marks and frequencies in a clear table.', accessibleDescription: 'A tally and frequency table with editable categories and numeric frequency column.',
    domains: ['statistics'], compatibleQuestionFamilies: ['interpret-chart', 'construct-chart', 'complete-table', 'compare-data'], usefulUnknownPositions: ['tally', 'frequency', 'category'],
    numericalConstraints: 'Each tally group contains five marks and frequency matches the tally when both are shown.', representationPurposes: ['represent-data', 'record-thinking'],
    answerProtection: { level: 'high', pupilRule: 'Keep rows pupils must complete blank.' },
    editorFields: [field('values.rows', 'Rows', 'table-rows'), field('values.showTallies', 'Show tallies', 'boolean'), field('values.showFrequency', 'Show frequency', 'boolean')],
    defaultValues: { rows: [{ label: 'Red', value: 7 }, { label: 'Blue', value: 12 }, { label: 'Green', value: 4 }], showTallies: true, showFrequency: true }, renderer: 'table', searchTerms: ['tally', 'frequency', 'table', 'data'],
  }),
  modelDefinition({
    id: 'bar-chart', name: 'Bar chart', category: 'Statistics',
    childDescription: 'A vertical or horizontal bar chart with a consistent scale.', accessibleDescription: 'A bar chart with labelled axes, equal scale intervals and editable category bars.',
    domains: ['statistics'], compatibleQuestionFamilies: ['interpret-chart', 'construct-chart', 'compare-data'], usefulUnknownPositions: ['bar-height', 'scale', 'label'],
    numericalConstraints: 'Bars have equal width and gaps; vertical or horizontal scale intervals are consistent.', representationPurposes: ['represent-data', 'record-thinking'],
    answerProtection: { level: 'high', pupilRule: 'Leave bars blank when pupils must construct the chart.' },
    editorFields: [field('values.rows', 'Categories and values', 'table-rows'), field('values.orientation', 'Orientation', 'choice', { options: ['vertical', 'horizontal'] }), field('values.max', 'Scale maximum', 'number')],
    defaultValues: { rows: [{ label: 'Oak', value: 6 }, { label: 'Pine', value: 10 }, { label: 'Beech', value: 4 }], orientation: 'vertical', max: 12 }, renderer: 'bar-chart', searchTerms: ['bar chart', 'graph', 'data', 'scale'],
  }),
  modelDefinition({
    id: 'pictogram', name: 'Pictogram', category: 'Statistics',
    childDescription: 'Repeated printable symbols with one clear key.', accessibleDescription: 'A pictogram with labelled rows and an explicit symbol key.',
    domains: ['statistics'], compatibleQuestionFamilies: ['interpret-chart', 'construct-chart', 'complete-table'], usefulUnknownPositions: ['symbol-count', 'key', 'value'],
    numericalConstraints: 'Partial symbols are only used when the key divides the represented value exactly.', representationPurposes: ['represent-data', 'record-thinking'],
    answerProtection: { level: 'high', pupilRule: 'Keep unknown symbols or values blank in construction tasks.' },
    editorFields: [field('values.rows', 'Categories and values', 'table-rows'), field('values.key', 'One symbol represents', 'integer', { min: 1, max: 20 }), field('values.symbol', 'Symbol', 'text')],
    defaultValues: { rows: [{ label: 'Apples', value: 8 }, { label: 'Pears', value: 4 }, { label: 'Plums', value: 6 }], key: 2, symbol: '●' }, renderer: 'pictogram', searchTerms: ['pictogram', 'key', 'data', 'symbols'],
  }),
  modelDefinition({
    id: 'line-graph', name: 'Time graph / line graph', category: 'Statistics',
    childDescription: 'Continuous values joined in a supplied order.', accessibleDescription: 'A line graph with labelled axes, consistent scale and editable ordered points.',
    domains: ['statistics'], compatibleQuestionFamilies: ['interpret-chart', 'construct-chart', 'compare-data'], usefulUnknownPositions: ['point', 'label', 'trend'],
    numericalConstraints: 'Line graphs are reserved for continuous ordered data; axes retain equal intervals.', representationPurposes: ['represent-data', 'support-reasoning'],
    answerProtection: { level: 'high', pupilRule: 'Do not plot points pupils are asked to construct or infer.' },
    editorFields: [field('values.rows', 'Ordered points', 'table-rows'), field('values.yMax', 'Y-axis maximum', 'number'), field('values.showPoints', 'Show points', 'boolean')],
    defaultValues: { rows: [{ label: '9am', value: 12 }, { label: '10am', value: 15 }, { label: '11am', value: 14 }, { label: '12pm', value: 18 }], yMax: 20, showPoints: true }, renderer: 'line-graph', searchTerms: ['line graph', 'time graph', 'continuous data', 'trend'],
  }),

  // General workspaces
  modelDefinition({
    id: 'squared-working-area', name: 'Squared working area', category: 'General Workspaces', childDescription: 'A calm square grid for showing calculations.', accessibleDescription: 'A blank squared working area.',
    domains: ['general'], compatibleQuestionFamilies: ['calculate', 'represent', 'work-out'], usefulUnknownPositions: [], numericalConstraints: 'Grid cells remain square.', representationPurposes: ['pupil-workspace'],
    answerProtection: { level: 'none', pupilRule: 'This is deliberately blank workspace.' }, editorFields: [field('values.columns', 'Columns', 'integer'), field('values.rows', 'Rows', 'integer')], defaultValues: { columns: 16, rows: 8 }, renderer: 'workspace', searchTerms: ['squared paper', 'grid', 'working area'],
  }),
  modelDefinition({
    id: 'lined-explanation-area', name: 'Lined explanation area', category: 'General Workspaces', childDescription: 'Writing lines for explaining mathematical thinking.', accessibleDescription: 'A blank lined explanation area.',
    domains: ['general'], compatibleQuestionFamilies: ['explain', 'justify', 'reason'], usefulUnknownPositions: [], numericalConstraints: 'Writing lines have consistent spacing.', representationPurposes: ['pupil-workspace'], answerProtection: { level: 'none', pupilRule: 'This is deliberately blank workspace.' },
    editorFields: [field('values.lines', 'Number of lines', 'integer')], defaultValues: { lines: 5 }, renderer: 'workspace', searchTerms: ['lines', 'explain', 'reasoning'],
  }),
  modelDefinition({
    id: 'blank-diagram-box', name: 'Blank diagram box', category: 'General Workspaces', childDescription: 'An outlined space for pupil-drawn diagrams.', accessibleDescription: 'A blank diagram box labelled for a pupil drawing.',
    domains: ['general'], compatibleQuestionFamilies: ['draw', 'represent', 'model'], usefulUnknownPositions: [], numericalConstraints: 'No mathematical content is pre-filled.', representationPurposes: ['pupil-workspace'], answerProtection: { level: 'none', pupilRule: 'This is deliberately blank workspace.' },
    editorFields: [field('values.label', 'Prompt label', 'text')], defaultValues: { label: 'Draw a diagram' }, renderer: 'workspace', searchTerms: ['diagram', 'draw', 'blank box'],
  }),
  modelDefinition({
    id: 'show-method-space', name: 'Show your method space', category: 'General Workspaces', childDescription: 'A labelled open space for recording a method.', accessibleDescription: 'An open workspace labelled Show your method.',
    domains: ['general'], compatibleQuestionFamilies: ['calculate', 'explain', 'prove'], usefulUnknownPositions: [], numericalConstraints: 'No answer is pre-filled.', representationPurposes: ['pupil-workspace'], answerProtection: { level: 'none', pupilRule: 'This is deliberately blank workspace.' },
    editorFields: [field('values.label', 'Prompt label', 'text')], defaultValues: { label: 'Show your method' }, renderer: 'workspace', searchTerms: ['show your method', 'working out'],
  }),
  modelDefinition({
    id: 'calculation-workspace', name: 'Calculation workspace', category: 'General Workspaces', childDescription: 'A compact or large blank calculation frame.', accessibleDescription: 'A blank calculation workspace with optional faint place-value guides.',
    domains: ['general'], compatibleQuestionFamilies: ['calculate', 'work-out'], usefulUnknownPositions: [], numericalConstraints: 'Guides never contain solved values.', representationPurposes: ['pupil-workspace'], answerProtection: { level: 'none', pupilRule: 'This is deliberately blank workspace.' },
    editorFields: [field('values.guides', 'Guides', 'choice', { options: ['none', 'place-value', 'calculation-lines'] })], defaultValues: { guides: 'calculation-lines' }, renderer: 'workspace', searchTerms: ['calculation workspace', 'working out'],
  }),
  modelDefinition({
    id: 'two-method-comparison', name: 'Two-method comparison space', category: 'General Workspaces', childDescription: 'Two equal spaces for comparing different methods.', accessibleDescription: 'Two labelled blank workspaces for comparing two methods.',
    domains: ['general'], compatibleQuestionFamilies: ['compare-methods', 'explain', 'prove'], usefulUnknownPositions: [], numericalConstraints: 'Both spaces are equal and remain blank.', representationPurposes: ['pupil-workspace', 'support-reasoning'], answerProtection: { level: 'none', pupilRule: 'This is deliberately blank workspace.' },
    editorFields: [field('values.leftLabel', 'First label', 'text'), field('values.rightLabel', 'Second label', 'text')], defaultValues: { leftLabel: 'Method one', rightLabel: 'Method two' }, renderer: 'workspace', searchTerms: ['two methods', 'compare strategies'],
  }),
  modelDefinition({
    id: 'prove-it-space', name: 'Prove it evidence space', category: 'General Workspaces', childDescription: 'A structured area for a claim, evidence and conclusion.', accessibleDescription: 'A blank Prove it workspace with claim, evidence and conclusion prompts.',
    domains: ['general'], compatibleQuestionFamilies: ['prove', 'justify', 'convince'], usefulUnknownPositions: [], numericalConstraints: 'Prompts do not imply a conclusion.', representationPurposes: ['pupil-workspace', 'support-reasoning'], answerProtection: { level: 'none', pupilRule: 'This is deliberately blank workspace.' },
    editorFields: [field('values.claimLabel', 'Claim label', 'text')], defaultValues: { claimLabel: 'Claim' }, renderer: 'workspace', searchTerms: ['prove it', 'evidence', 'justify'],
  }),
  modelDefinition({
    id: 'editable-table', name: 'Editable table', category: 'General Workspaces', childDescription: 'An empty labelled table for organising mathematical information.', accessibleDescription: 'An editable blank table with labelled columns and rows.',
    domains: ['general', 'statistics'], compatibleQuestionFamilies: ['sort', 'record-data', 'complete-table', 'convert'], usefulUnknownPositions: [], numericalConstraints: 'Rows and columns stay aligned; no unsupported values are filled.', representationPurposes: ['pupil-workspace', 'represent-data'], answerProtection: { level: 'none', pupilRule: 'Cells are blank unless teacher-supplied information is required.' },
    editorFields: [field('values.headers', 'Column headings', 'text-list'), field('values.rows', 'Rows', 'integer')], defaultValues: { headers: ['Value', 'Working', 'Answer'], rows: 4 }, renderer: 'table', searchTerms: ['table', 'record', 'organise data'],
  }),
];

export const BUILD2_MODEL_BANK = Object.freeze(Object.fromEntries(defs.map((definition) => [definition.id, definition])));
export const BUILD2_MODEL_IDS = Object.freeze(Object.keys(BUILD2_MODEL_BANK));
export const BUILD2_MODEL_CATEGORIES = Object.freeze([...new Set(defs.map((definition) => definition.category))]);

export function listBuild2ModelDefinitions(options = {}) {
  const category = options.category;
  return defs.filter((definition) => !category || definition.category === category);
}

export function getBuild2ModelDefinition(id) {
  return BUILD2_MODEL_BANK[id] ?? null;
}

export function searchBuild2Models(query = '', options = {}) {
  const terms = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  const category = options.category;
  return listBuild2ModelDefinitions({ category }).filter((definition) => {
    if (!terms.length) return true;
    const haystack = [
      definition.id, definition.name, definition.childDescription, definition.accessibleDescription,
      definition.category, ...definition.domains, ...definition.searchTerms,
    ].join(' ').toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

function mergeRecipe(defaults, patch) {
  const source = patch && typeof patch === 'object' ? patch : {};
  return {
    ...defaults,
    ...clone(source),
    values: { ...clone(defaults.values), ...clone(source.values) },
    labels: { ...clone(defaults.labels), ...clone(source.labels) },
    metadata: { ...clone(defaults.metadata), ...clone(source.metadata) },
  };
}

export function createBuild2ModelRecipe(family, patch = {}) {
  const definition = getBuild2ModelDefinition(family);
  if (!definition) throw new RangeError(`Unknown mathematical model family: ${family}`);
  return mergeRecipe({
    recipeVersion: 2,
    family,
    variant: 'default',
    values: clone(definition.defaultValues),
    labels: {},
    unknown: null,
    hidden: [],
    scaffoldState: 'guided',
    size: 'standard',
    position: definition.print.preferredPosition,
    linked: true,
    teacherChosen: false,
    metadata: {},
  }, patch);
}

function normalizeNumberLine(values, warnings, errors) {
  let start = finite(values.start, 0);
  let end = finite(values.end, null);
  const roundedStep = positive(values.step, 1);
  if (values.number != null && values.step != null && values.start == null && values.end == null) {
    const target = finite(values.number, 0);
    start = Math.floor(target / roundedStep) * roundedStep;
    end = start + roundedStep;
    values.lower = start;
    values.upper = end;
    values.midpoint = (start + end) / 2;
  }
  if (!(end > start)) {
    if (values.total != null && values.divisor != null) {
      start = 0;
      end = Math.max(1, finite(values.total, 1));
    } else {
      end = start + 10;
      warnings.push('The number-line range was expanded to a safe positive interval.');
    }
  }
  const requestedDivisions = finite(values.divisions, finite(values.jumpCount, 10));
  if (!Number.isInteger(requestedDivisions) || requestedDivisions < 1 || requestedDivisions > 50) {
    errors.push('A printable number line needs 1 to 50 whole equal divisions.');
  }
  let divisions = whole(requestedDivisions, 10);
  divisions = Math.min(50, Math.max(1, divisions));
  values.start = start;
  values.end = end;
  values.divisions = divisions;
  values.interval = (end - start) / divisions;
  values.points = Array.from({ length: divisions + 1 }, (_, index) => start + values.interval * index);
  if (!Number.isFinite(values.interval) || values.interval <= 0) errors.push('A number line needs a positive exact interval.');
}

function normalizeFractions(values, warnings, errors) {
  const denominator = whole(values.denominator, 1);
  if (denominator < 1 || denominator > 48) errors.push('A fraction denominator must be a whole number from 1 to 48.');
  values.denominator = Math.min(48, Math.max(1, denominator));
  for (const key of ['numerator', 'firstNumerator', 'secondNumerator', 'target']) {
    if (values[key] == null) continue;
    values[key] = Math.min(values.denominator * Math.max(1, whole(values.maxWhole, 1)), Math.max(0, whole(values[key], 0)));
  }
  const fractions = Array.isArray(values.fractions) ? values.fractions : null;
  if (fractions) {
    values.fractions = fractions.slice(0, 8).map((fraction) => ({
      numerator: Math.max(0, whole(fraction?.numerator, 0)),
      denominator: Math.min(48, Math.max(1, whole(fraction?.denominator, 1))),
    }));
  }
  if (values.whole != null && values.denominator && finite(values.whole) % values.denominator !== 0) {
    warnings.push('The whole quantity does not divide exactly into the denominator; keep any one-part value blank unless teacher-corrected.');
  }
}

function normalizeRows(values, errors, family) {
  const limit = BUILD2_ROW_VISUAL_LIMITS[family] ?? 8;
  const suppliedCount = Number(values.rows);
  const requestedCount = Number.isInteger(suppliedCount) ? Math.max(1, suppliedCount) : null;
  const rows = Array.isArray(values.rows)
    ? values.rows
    : requestedCount == null ? [] : Array.from({ length: requestedCount }, (_, index) => ({ label: `Row ${index + 1}`, value: '' }));
  if (rows.length > limit) errors.push(`${family} can show at most ${limit} complete rows without omitting data.`);
  values.rows = rows.slice(0, limit).map((row, index) => ({
    label: String(row?.label ?? `Item ${index + 1}`).slice(0, 50),
    value: Math.max(0, finite(row?.value, 0)),
  }));
}

function normalizeGrid(values, errors) {
  const rawRows = finite(values.rows ?? values.height, NaN);
  const rawColumns = finite(values.columns ?? values.width, NaN);
  if (!Number.isInteger(rawRows) || !Number.isInteger(rawColumns) || rawRows < 1 || rawColumns < 1) {
    errors.push('A printable grid needs positive whole-number rows and columns.');
  }
  if (rawRows > BUILD2_GRID_VISUAL_LIMIT || rawColumns > BUILD2_GRID_VISUAL_LIMIT) {
    errors.push(`A printable grid can show at most ${BUILD2_GRID_VISUAL_LIMIT} rows and ${BUILD2_GRID_VISUAL_LIMIT} columns without changing the array.`);
  }
  values.rows = Math.min(BUILD2_GRID_VISUAL_LIMIT, Math.max(1, whole(rawRows, 4)));
  values.columns = Math.min(BUILD2_GRID_VISUAL_LIMIT, Math.max(1, whole(rawColumns, 4)));
}

function normalizeGeometry(recipe, warnings, errors) {
  const { values } = recipe;
  if (recipe.family === 'ruler-length-line') {
    values.start = finite(values.startCm, finite(values.start, 0));
    values.end = finite(values.endCm, finite(values.end, null));
  }
  if (recipe.family === 'ordering-comparison-line' && Array.isArray(values.numbers) && values.numbers.length) {
    const numbers = values.numbers.map((value) => finite(value, null)).filter((value) => value != null);
    values.numbers = numbers;
    if (numbers.length) {
      values.start = Math.min(...numbers);
      values.end = Math.max(...numbers);
      values.divisions = Math.max(1, numbers.length - 1);
    }
  }
  switch (recipe.renderer) {
    case 'number-line':
    case 'fraction-line':
    case 'scale':
    case 'timeline':
      normalizeNumberLine(values, warnings, errors);
      break;
    case 'fraction-wall':
    case 'fraction-area':
    case 'fraction-set':
    case 'decimal-grid':
      if (recipe.family === 'equivalent-fraction-strips' && Array.isArray(values.fractions) && values.fractions.length > 4) {
        errors.push('Equivalent-fraction strips can show at most four complete fractions without omitting a row.');
      }
      normalizeFractions(values, warnings, errors);
      break;
    case 'grid':
      normalizeGrid(values, errors);
      break;
    case 'table':
    case 'bar-chart':
    case 'pictogram':
    case 'line-graph':
      normalizeRows(values, errors, recipe.family);
      break;
    default:
      break;
  }
  if (recipe.family === 'clock-model') {
    values.hour = ((whole(values.hour, 0) % 24) + 24) % 24;
    values.minute = ((whole(values.minute, 0) % 60) + 60) % 60;
  }
  if (recipe.family === 'fraction-area-model') {
    values.shape = values.shape === 'circle' ? 'circle' : 'rectangle';
  }
  if (recipe.family === 'perimeter-trace') {
    values.kind = values.kind === 'rectilinear' ? 'rectilinear' : 'rectangle';
    if (values.kind === 'rectilinear' && (!Array.isArray(values.sides) || values.sides.length === 0)) {
      const width = finite(values.width, 8);
      const height = finite(values.height, 4);
      // A six-side L-shaped outline: top = inset + bottom and left =
      // outer-right + inner-down.  This retains a valid closed boundary when
      // the teacher changes a rectangle into a rectilinear trace.
      values.sides = [width, height / 2, width / 2, height / 2, width / 2, height];
    } else if (Array.isArray(values.sides)) {
      values.sides = values.sides.slice(0, 6).map((side) => finite(side, NaN));
    }
  }
  if (recipe.family === 'unit-conversion-bridge') {
    const pairs = new Set(['km:m', 'm:cm', 'cm:mm', 'kg:g', 'l:ml', 'h:min', '£:p']);
    if (!pairs.has(`${values.fromUnit}:${values.toUnit}`)) errors.push('Choose one supported exact Year 4 conversion pair.');
  }
  if (recipe.family === 'coordinate-grid') {
    values.max = Math.min(20, Math.max(4, whole(values.max, 10)));
    values.points = (Array.isArray(values.points) ? values.points : []).slice(0, 12).map((point, index) => ({
      x: Math.min(values.max, Math.max(0, whole(point?.x, 0))),
      y: Math.min(values.max, Math.max(0, whole(point?.y, 0))),
      label: String(point?.label ?? String.fromCharCode(65 + index)).slice(0, 4),
    }));
  }
}

function exactEqual(left, right) {
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) < 1e-9;
}

function validateRelationships(recipe, errors) {
  const values = recipe.values;
  if (recipe.family === 'number-bond' || recipe.family === 'partition-tree') {
    const parts = Array.isArray(values.parts) ? values.parts.map((part) => finite(part, null)) : [];
    const whole = finite(values.whole, null);
    if (parts.length < 2 || parts.length > 6 || parts.some((part) => part == null || part < 0) || whole == null || !exactEqual(parts.reduce((sum, part) => sum + part, 0), whole)) {
      errors.push(`${recipe.family === 'number-bond' ? 'A number bond' : 'A partition tree'} needs two to six non-negative parts that add exactly to its whole.`);
    }
  }
  if (recipe.family === 'ordering-comparison-line' && (!Array.isArray(values.numbers) || values.numbers.length < 2 || values.numbers.length > 5)) {
    errors.push('An ordering and comparison line can show two to five complete number cards without clipping them.');
  }
  if (recipe.family === 'arrow-card-builder') {
    const number = finite(values.number, null);
    if (!Number.isInteger(number) || number < 0 || number > 9999) errors.push('Arrow cards support whole numbers from 0 to 9,999 without dropping digits.');
  }
  if (recipe.family === 'roman-numeral-builder') {
    const number = finite(values.number, null);
    if (!Number.isInteger(number) || number < 1 || number > 100) errors.push('The Roman-numeral builder supports whole numbers from 1 to 100.');
  }
  if (recipe.family === 'change-bar') {
    const start = finite(values.start, null); const change = finite(values.change, null); const result = finite(values.result, null);
    if (start == null || change == null || result == null || !exactEqual(start + change, result)) errors.push('A change bar must satisfy start plus change equals result.');
  }
  if (recipe.family === 'multiplication-bar') {
    const groups = finite(values.groups, null); const groupSize = finite(values.groupSize, null); const total = finite(values.total, null);
    if (!Number.isInteger(groups) || groups < 1 || groups > MULTIPLICATION_BAR_VISUAL_LIMIT || groupSize == null || groupSize <= 0 || total == null || !exactEqual(groups * groupSize, total)) {
      errors.push(`A multiplication bar needs 1 to ${MULTIPLICATION_BAR_VISUAL_LIMIT} whole groups and a total equal to groups times group size.`);
    }
  }
  if (recipe.family === 'scaling-bar') {
    const original = finite(values.original, null); const multiplier = finite(values.multiplier, null); const scaled = finite(values.scaled, null);
    if (original == null || !Number.isInteger(multiplier) || multiplier < 1 || multiplier > SCALING_BAR_VISUAL_LIMIT || scaled == null || !exactEqual(original * multiplier, scaled)) {
      errors.push(`A scaling bar needs a whole-number multiplier from 1 to ${SCALING_BAR_VISUAL_LIMIT}, and its scaled value must equal original times multiplier.`);
    }
  }
  if (recipe.family === 'short-division') {
    const dividend = whole(values.dividend, NaN); const divisor = whole(values.divisor, NaN); const quotient = values.quotient == null ? null : whole(values.quotient, NaN); const remainder = values.remainder == null ? null : whole(values.remainder, NaN);
    if (!Number.isInteger(dividend) || dividend < 0 || !Number.isInteger(divisor) || divisor < 1) {
      errors.push('Short division needs a non-negative whole dividend and positive whole divisor.');
    } else {
      const expectedQuotient = Math.floor(dividend / divisor);
      const expectedRemainder = dividend % divisor;
      if (quotient != null && (!Number.isInteger(quotient) || quotient !== expectedQuotient)) errors.push('A supplied short-division quotient must be the exact whole-number quotient.');
      if (remainder != null && (!Number.isInteger(remainder) || remainder !== expectedRemainder)) errors.push('A supplied short-division remainder must be the exact remainder and smaller than the divisor.');
    }
  }
  if (['compact-column-addition', 'expanded-column-addition', 'compact-column-subtraction', 'expanded-column-subtraction'].includes(recipe.family)) {
    const operands = Array.isArray(values.operands) ? values.operands : [];
    if (operands.length < 2 || operands.length > 4 || operands.some((operand) => !Number.isInteger(finite(operand, NaN)) || finite(operand, -1) < 0)) {
      errors.push('A printable column frame needs two to four non-negative whole-number operands.');
    }
  }
  if (['short-multiplication', 'place-value-multiplication'].includes(recipe.family)) {
    const number = finite(values.number, null);
    const multiplier = finite(values.multiplier, null);
    if (!Number.isInteger(number) || number < 0 || !Number.isInteger(multiplier) || multiplier < 1 || multiplier > 9) {
      errors.push('Short multiplication needs a non-negative whole multiplicand and a one-digit positive multiplier.');
    }
  }
  if (recipe.family === 'factor-pair-array') {
    const number = finite(values.number, null);
    if (!Number.isInteger(number) || number < 1 || number > 100) errors.push('The factor-pair explorer supports whole numbers from 1 to 100.');
  }
  if (['sharing-division', 'grouping-division', 'remainder-model'].includes(recipe.family)) {
    const total = finite(values.total, NaN);
    const sharing = recipe.family === 'sharing-division';
    const groupValue = finite(sharing ? values.groups : values.groupSize, NaN);
    if (!Number.isInteger(total) || total < 0 || !Number.isInteger(groupValue) || groupValue < 1) {
      errors.push(`${sharing ? 'Sharing' : 'Grouping'} division needs a non-negative whole total and a positive whole ${sharing ? 'recipient count' : 'group size'}.`);
    } else {
      const groupCount = sharing ? groupValue : Math.floor(total / groupValue);
      const itemsPerGroup = sharing ? Math.floor(total / groupValue) : groupValue;
      if (groupCount > DIVISION_GROUP_VISUAL_LIMITS.maxGroups) {
        errors.push(`This model can show at most ${DIVISION_GROUP_VISUAL_LIMITS.maxGroups} complete groups without omitting groups.`);
      }
      if (groupCount > 0 && itemsPerGroup > DIVISION_GROUP_VISUAL_LIMITS.maxItemsPerGroup) {
        errors.push(`This model can show at most ${DIVISION_GROUP_VISUAL_LIMITS.maxItemsPerGroup} items in each complete group without omitting items.`);
      }
    }
  }
  if (recipe.family === 'fraction-set-model') {
    const total = whole(values.total, NaN); const denominator = whole(values.denominator, NaN);
    if (!Number.isInteger(total) || !Number.isInteger(denominator) || denominator < 1 || total < 0 || total % denominator !== 0) errors.push('A fraction set must divide the collection exactly into equal denominator groups.');
    if (total > 80) errors.push('A compact fraction-set model supports at most 80 visible objects; use a quantity bar for larger collections.');
  }
  if (recipe.family === 'fraction-wall') {
    const denominators = Array.isArray(values.denominators) ? values.denominators : [];
    if (!denominators.length || denominators.length > 8 || denominators.some((denominator) => !Number.isInteger(finite(denominator, NaN)) || denominator < 1 || denominator > 16)) {
      errors.push('A printable fraction wall needs one to eight whole-number rows with denominators from 1 to 16.');
    }
    const highlighted = typeof values.highlight === 'string' ? values.highlight.match(/^(\d+)\/(\d+)$/) : null;
    if (highlighted && (Number(highlighted[1]) > Number(highlighted[2]) || Number(highlighted[2]) < 1)) {
      errors.push('A highlighted fraction-wall value must fit within one whole row.');
    }
  }
  if (recipe.family === 'equivalent-fraction-strips') {
    const fractions = Array.isArray(values.fractions) ? values.fractions : [];
    if (fractions.length >= 2) {
      const first = fractions[0];
      const equivalent = fractions.every((fraction) => exactEqual(
        finite(fraction?.numerator, NaN) * finite(first?.denominator, NaN),
        finite(first?.numerator, NaN) * finite(fraction?.denominator, NaN),
      ));
      if (!equivalent) errors.push('Equivalent fraction strips must shade the same proportion of the same whole.');
    }
  }
  if (recipe.family === 'fraction-area-model' && values.shape === 'circle') {
    const denominator = whole(values.denominator, NaN);
    if (!Number.isInteger(denominator) || denominator < 1 || denominator > 12) {
      errors.push('A circular fraction model is limited to 1 to 12 equal sectors for legibility.');
    }
  }
  if (recipe.family === 'decimal-place-value-chart') {
    const decimal = finite(values.number, null);
    if (decimal == null || decimal < 0 || decimal > 9999.99 || !exactEqual(decimal * 100, Math.round(decimal * 100))) {
      errors.push('A decimal place-value chart supports non-negative values to 9,999.99 with at most two decimal places.');
    }
  }
  if (recipe.family === 'fraction-of-quantity-bar') {
    const wholeValue = finite(values.whole, null); const denominator = whole(values.denominator, NaN);
    if (wholeValue == null || !Number.isInteger(denominator) || denominator < 1 || !exactEqual(wholeValue / denominator, Math.round(wholeValue / denominator))) errors.push('A fraction-of-quantity bar needs a whole that divides exactly into equal denominator parts.');
    if (values.onePart == null || values.onePart === '') values.onePart = wholeValue != null && denominator > 0 ? wholeValue / denominator : null;
    const onePart = values.onePart == null ? null : finite(values.onePart, null);
    if (onePart != null && wholeValue != null && denominator > 0 && !exactEqual(onePart, wholeValue / denominator)) errors.push('The stated one-part value must equal whole divided by denominator.');
  }
  if (recipe.family === 'tenths-hundredths-grid' && values.mode === 'tenths' && whole(values.hundredths, 0) % 10 !== 0) {
    errors.push('A tenths strip can only show a whole number of tenths; use the hundredths grid for this value.');
  }
  if (recipe.family === 'money-representation') {
    const exactPence = (key) => {
      const raw = values[key];
      return raw == null || raw === '' ? null : finite(raw, null);
    };
    const amount = exactPence('amountPence');
    const price = exactPence('pricePence');
    const tendered = exactPence('tenderedPence');
    if (amount == null || !Number.isInteger(amount) || amount < 0) errors.push('Money amounts must be non-negative whole pence values.');
    if (price != null && (!Number.isInteger(price) || price < 0)) errors.push('A price must be a non-negative whole pence value.');
    if (tendered != null && (!Number.isInteger(tendered) || tendered < 0)) errors.push('A tendered amount must be a non-negative whole pence value.');
    if (price != null && tendered != null && tendered < price) errors.push('A change model needs the paid amount to be at least the price.');
    if (amount != null && Number.isInteger(amount) && amount >= 0 && !(price != null && tendered != null)) {
      let remaining = amount;
      for (const coin of [200, 100, 50, 20, 10, 5, 2, 1]) remaining -= Math.min(4, Math.floor(remaining / coin)) * coin;
      if (remaining !== 0) errors.push('This amount needs more than four of one coin; use a change card or a smaller exact coin representation.');
    }
  }
  if (recipe.family === 'pictogram') {
    const key = finite(values.key, null);
    if (key == null || !Number.isInteger(key) || key < 1) {
      errors.push('A pictogram key must be a positive whole number of items per symbol.');
    } else {
      const rows = Array.isArray(values.rows) ? values.rows : [];
      const canUseHalfSymbol = rows.every((row) => {
        const value = finite(row?.value, null);
        if (value == null || value < 0) return false;
        const symbols = value / key;
        return exactEqual(symbols, Math.round(symbols)) || exactEqual(symbols * 2, Math.round(symbols * 2));
      });
      if (!canUseHalfSymbol) errors.push('A pictogram can only use whole or half symbols for the selected key.');
      if (rows.some((row) => finite(row?.value, 0) / key > 20.5)) errors.push('A pictogram row can show at most 20 whole symbols and one half symbol without omitting data.');
    }
  }
  if (recipe.family === 'bar-chart' || recipe.family === 'line-graph') {
    const maximumKey = recipe.family === 'bar-chart' ? 'max' : 'yMax';
    const maximum = finite(values[maximumKey], null);
    const dataMaximum = Math.max(0, ...(Array.isArray(values.rows) ? values.rows.map((row) => finite(row?.value, 0)) : []));
    if (maximum == null || maximum <= 0 || maximum < dataMaximum) {
      errors.push(`${recipe.family === 'bar-chart' ? 'Bar-chart scale maximum' : 'Line-graph y-axis maximum'} must be positive and at least every supplied data value.`);
    }
  }
  if (recipe.family === 'perimeter-trace') {
    const width = finite(values.width, null);
    const height = finite(values.height, null);
    if (width == null || height == null || width <= 0 || height <= 0) errors.push('A perimeter trace needs positive width and height values.');
    if (values.kind === 'rectilinear') {
      const sides = Array.isArray(values.sides) ? values.sides : [];
      if (sides.length !== 6 || sides.some((side) => !Number.isFinite(side) || side <= 0)) {
        errors.push('A rectilinear perimeter trace needs six positive boundary side lengths.');
      } else if (!exactEqual(sides[0], sides[2] + sides[4]) || !exactEqual(sides[5], sides[1] + sides[3])) {
        errors.push('Rectilinear side lengths must close the boundary: top = inset + bottom and left = outer right + inner down.');
      }
    }
  }
  if (recipe.family === 'symmetry-grid') {
    const size = finite(values.size, null);
    if (!Number.isInteger(size) || size < 4 || size > 16) errors.push('A symmetry grid needs a whole-number size from 4 to 16.');
  }
  if (recipe.family === 'squared-working-area') {
    const rows = finite(values.rows, null); const columns = finite(values.columns, null);
    if (!Number.isInteger(rows) || rows < 3 || rows > 16 || !Number.isInteger(columns) || columns < 4 || columns > 24) {
      errors.push('Squared working supports 3 to 16 rows and 4 to 24 columns without changing the grid.');
    }
  }
  if (recipe.family === 'lined-explanation-area') {
    const lines = finite(values.lines, null);
    if (!Number.isInteger(lines) || lines < 2 || lines > 10) errors.push('A lined explanation area supports 2 to 10 complete writing lines.');
  }
}

export function normalizeBuild2ModelRecipe(input, options = {}) {
  if (!input || typeof input !== 'object') return { recipe: null, warnings: [], errors: ['A model recipe is required.'] };
  const definition = getBuild2ModelDefinition(input.family);
  if (!definition) return { recipe: null, warnings: [], errors: [`Unknown mathematical model family: ${input.family ?? 'missing'}.`] };
  const recipe = createBuild2ModelRecipe(definition.id, input);
  const warnings = [];
  const errors = [];
  recipe.scaffoldState = BUILD2_SCAFFOLD_STATES.includes(recipe.scaffoldState) ? recipe.scaffoldState : 'guided';
  recipe.size = BUILD2_PRINT_SIZES.includes(recipe.size) ? recipe.size : 'standard';
  recipe.position = ['above', 'beside', 'beneath'].includes(recipe.position) ? recipe.position : definition.print.preferredPosition;
  recipe.hidden = uniqueText(recipe.hidden);
  recipe.unknown = recipe.unknown == null || recipe.unknown === '' ? null : String(recipe.unknown);
  normalizeGeometry({ ...recipe, renderer: definition.renderer }, warnings, errors);
  validateRelationships(recipe, errors);
  if (options.intent === 'assessment' && recipe.scaffoldState === 'modelled' && definition.answerProtection.level !== 'none') {
    warnings.push(`${definition.name} is modelled in an assessment context and may reveal assessed thinking.`);
  }
  return { recipe, warnings, errors };
}

export function validateBuild2ModelRecipe(input, options = {}) {
  const result = normalizeBuild2ModelRecipe(input, options);
  return {
    valid: Boolean(result.recipe) && result.errors.length === 0,
    normalizedRecipe: result.recipe,
    warnings: result.warnings,
    errors: result.errors,
  };
}

export function describeBuild2Model(input) {
  const definition = getBuild2ModelDefinition(input?.family);
  if (!definition) return 'Mathematical model.';
  const values = input?.values ?? {};
  if (definition.renderer === 'number-line') return `${definition.name}: a scale from ${values.start ?? 0} to ${values.end ?? ''} in equal intervals.`;
  if (definition.renderer === 'bar') return `${definition.name}: a structured bar with values arranged to show the relationship.`;
  if (definition.renderer === 'clock') return `${definition.name}: an analogue clock at ${String(values.hour ?? 0).padStart(2, '0')}:${String(values.minute ?? 0).padStart(2, '0')}.`;
  if (definition.renderer === 'coordinates') return `${definition.name}: a first-quadrant coordinate grid to ${values.max ?? 10}.`;
  return definition.accessibleDescription;
}
