import {
  BUILD2_MODEL_BANK,
  createBuild2ModelRecipe,
  getBuild2ModelDefinition,
  normalizeBuild2ModelRecipe,
} from './build2-model-bank.js';

/**
 * Maths Page Studio model registry.
 *
 * Recipes are deliberately declarative: renderers may change without changing
 * the mathematical meaning stored in a worksheet project.
 */

export const COMPLETION_STATES = Object.freeze(["blank", "partly-completed", "completed"]);
export const MODEL_PURPOSES = Object.freeze([
  "question-information",
  "thinking-model",
  "response-model",
  "worked-example",
]);
export const MODEL_SIZES = Object.freeze(["compact", "standard", "large"]);
export const MODEL_POSITIONS = Object.freeze(["above", "beside", "beneath"]);

export const MODEL_IDS = Object.freeze({
  PLACE_VALUE: "place-value",
  BASE_TEN: "base-ten",
  PARTITIONING: "partition",
  NUMBER_LINE: "number-line",
  PART_WHOLE: "part-whole",
  COMPARISON: "comparison-bar",
  EQUAL_GROUPS: "equal-groups",
  COLUMN_ARITHMETIC: "column-arithmetic",
  MULTIPLICATION_GRID: "area-model",
  FRACTION_STRIP: "fraction-strip",
});

const COLUMN_LABELS = Object.freeze([
  "Ones",
  "Tens",
  "Hundreds",
  "Thousands",
  "Ten thousands",
  "Hundred thousands",
  "Millions",
]);

const PLACE_KEYS = Object.freeze([
  "ones",
  "tens",
  "hundreds",
  "thousands",
  "ten-thousands",
  "hundred-thousands",
  "millions",
]);

const commonRecipe = (family, values, overrides = {}) => ({
  recipeVersion: 1,
  family,
  variant: "default",
  values,
  labels: {},
  unit: "",
  unknown: null,
  completionState: "partly-completed",
  purpose: "thinking-model",
  size: "standard",
  position: "beneath",
  lockState: "mathematical",
  ...overrides,
});

const field = (key, label, type, options = {}) => ({ key, label, type, ...options });

const definitions = [
  {
    id: MODEL_IDS.PLACE_VALUE,
    name: "Place-value chart",
    purpose: "Aligns each digit with its place and makes the value of a whole number explicit.",
    domains: ["place-value", "number"],
    yearRange: { min: 1, max: 6 },
    requiredParameters: ["values.number"],
    completionStates: COMPLETION_STATES,
    answerRevealRisk: { level: "medium", when: "completed digits resolve a place-value prompt" },
    printBehaviour: "Repeats headings and keeps every digit aligned in a single unsplittable chart.",
    monochromeBehaviour: "Column borders and text labels carry all meaning; colour is optional.",
    matchingTags: ["digit", "place value", "value of", "thousands", "hundreds", "tens", "ones"],
    contraindications: ["decimal-place questions", "numbers requiring more than seven columns"],
    editorFields: [
      field("values.number", "Number", "integer"),
      field("values.minimumPlaces", "Minimum columns", "integer", { min: 1, max: 7 }),
      field("unknown", "Unknown place", "place-key"),
      field("unit", "Unit", "text"),
    ],
    createDefaultRecipe: (seed = {}) => commonRecipe(MODEL_IDS.PLACE_VALUE, {
      number: seed.number ?? 3482,
      minimumPlaces: seed.minimumPlaces ?? 4,
    }, { unknown: seed.unknown ?? "hundreds", ...seed.recipe }),
  },
  {
    id: MODEL_IDS.BASE_TEN,
    name: "Base-ten / Dienes representation",
    purpose: "Shows a whole number as equal powers-of-ten units without drawing a misleading quantity.",
    domains: ["place-value", "number", "addition", "subtraction"],
    yearRange: { min: 1, max: 5 },
    requiredParameters: ["values.number"],
    completionStates: COMPLETION_STATES,
    answerRevealRisk: { level: "medium", when: "all blocks are visible for a compose/decompose prompt" },
    printBehaviour: "Uses simplified, countable line symbols at worksheet scale rather than photographic blocks.",
    monochromeBehaviour: "Shape, subdivision and place labels distinguish blocks; hue is never required.",
    matchingTags: ["base ten", "Dienes", "exchange", "regroup", "represent", "make the number"],
    contraindications: ["decimal values", "negative values", "more than seven of any displayed place at compact size"],
    editorFields: [
      field("values.number", "Number", "integer"),
      field("unknown", "Hidden place", "place-key"),
      field("unit", "Unit", "text"),
    ],
    createDefaultRecipe: (seed = {}) => commonRecipe(MODEL_IDS.BASE_TEN, {
      number: seed.number ?? 3482,
    }, { unknown: seed.unknown ?? "tens", ...seed.recipe }),
  },
  {
    id: MODEL_IDS.PARTITIONING,
    name: "Partitioning frame",
    purpose: "Connects a whole number to additive parts while preserving the value of the whole.",
    domains: ["place-value", "number", "addition"],
    yearRange: { min: 1, max: 6 },
    requiredParameters: ["values.whole", "values.parts"],
    completionStates: COMPLETION_STATES,
    answerRevealRisk: { level: "high", when: "completed parts answer a partitioning question" },
    printBehaviour: "Keeps whole and parts together and wraps labels within their cells.",
    monochromeBehaviour: "Containment, plus signs and outlines convey the relationship.",
    matchingTags: ["partition", "expanded form", "split", "compose", "decompose"],
    contraindications: ["parts that do not sum to the whole", "multiplicative decomposition"],
    editorFields: [
      field("values.whole", "Whole", "number"),
      field("values.parts", "Parts", "number-list"),
      field("unknown", "Unknown value", "part-selector"),
      field("unit", "Unit", "text"),
    ],
    createDefaultRecipe: (seed = {}) => commonRecipe(MODEL_IDS.PARTITIONING, {
      whole: seed.whole ?? 3482,
      parts: seed.parts ?? [3000, 400, 80, 2],
    }, { unknown: seed.unknown ?? "part:2", ...seed.recipe }),
  },
  {
    id: MODEL_IDS.NUMBER_LINE,
    name: "Marked / empty number line",
    purpose: "Places values or equal jumps on a linear scale with mathematically consistent intervals.",
    domains: ["number", "place-value", "addition", "subtraction", "fractions"],
    yearRange: { min: 1, max: 6 },
    requiredParameters: ["values.start", "values.end", "values.divisions"],
    completionStates: COMPLETION_STATES,
    answerRevealRisk: { level: "medium", when: "a labelled target or completed jumps reveal the answer" },
    printBehaviour: "Uses a fixed aspect ratio and never compresses tick labels below the safe print size.",
    monochromeBehaviour: "Ticks, arrows and distinct line styles preserve meaning without colour.",
    matchingTags: ["number line", "between", "interval", "difference", "count on", "round", "estimate"],
    contraindications: ["unequal intervals presented as equal", "more than twenty divisions", "unknown scale"],
    editorFields: [
      field("values.start", "Start", "number"),
      field("values.end", "End", "number"),
      field("values.divisions", "Equal divisions", "integer", { min: 1, max: 20 }),
      field("values.markers", "Marked values", "marker-list"),
      field("variant", "Line type", "choice", { options: ["marked", "empty", "jumps"] }),
      field("unit", "Unit", "text"),
    ],
    createDefaultRecipe: (seed = {}) => commonRecipe(MODEL_IDS.NUMBER_LINE, {
      start: seed.start ?? 0,
      end: seed.end ?? 100,
      divisions: seed.divisions ?? 10,
      interval: seed.interval ?? 10,
      markers: seed.markers ?? [{ value: 60, label: "?" }],
    }, { variant: seed.variant ?? "marked", unknown: seed.unknown ?? "marker:0", ...seed.recipe }),
  },
  {
    id: MODEL_IDS.PART_WHOLE,
    name: "Part-whole bar model",
    purpose: "Represents an additive whole made from two or more proportional parts.",
    domains: ["addition", "subtraction", "fractions", "ratio"],
    yearRange: { min: 1, max: 6 },
    requiredParameters: ["values.whole", "values.parts"],
    completionStates: COMPLETION_STATES,
    answerRevealRisk: { level: "high", when: "the completed missing part or whole resolves the question" },
    printBehaviour: "Bars share one scale and remain joined to their value labels.",
    monochromeBehaviour: "Boundaries, labels and optional hatch patterns identify parts.",
    matchingTags: ["altogether", "total", "remaining", "left", "part", "whole", "sum"],
    contraindications: ["multiplicative comparison", "parts that do not total the whole", "negative parts"],
    editorFields: [
      field("values.whole", "Whole", "number"),
      field("values.parts", "Parts", "number-list"),
      field("labels.parts", "Part labels", "text-list"),
      field("unknown", "Unknown value", "part-selector"),
      field("unit", "Unit", "text"),
    ],
    createDefaultRecipe: (seed = {}) => commonRecipe(MODEL_IDS.PART_WHOLE, {
      whole: seed.whole ?? 12,
      parts: seed.parts ?? [7, 5],
    }, { unknown: seed.unknown ?? "part:1", ...seed.recipe }),
  },
  {
    id: MODEL_IDS.COMPARISON,
    name: "Comparison bar model",
    purpose: "Compares two quantities on one proportional scale and identifies their difference.",
    domains: ["comparison", "addition", "subtraction", "ratio"],
    yearRange: { min: 2, max: 6 },
    requiredParameters: ["values.greater", "values.lesser"],
    completionStates: COMPLETION_STATES,
    answerRevealRisk: { level: "high", when: "the difference label or exact bar lengths resolve the comparison" },
    printBehaviour: "Both bars use the same origin and scale; a difference bracket remains attached.",
    monochromeBehaviour: "Position, length, bracket and text—not hue—encode the comparison.",
    matchingTags: ["more than", "fewer than", "less than", "difference", "compare", "how many more"],
    contraindications: ["unrelated wholes", "negative quantities", "ratios too extreme to print legibly"],
    editorFields: [
      field("values.greater", "Greater quantity", "number"),
      field("values.lesser", "Lesser quantity", "number"),
      field("values.difference", "Difference", "number"),
      field("labels.greater", "Greater label", "text"),
      field("labels.lesser", "Lesser label", "text"),
      field("unknown", "Unknown value", "choice", { options: ["greater", "lesser", "difference"] }),
      field("unit", "Unit", "text"),
    ],
    createDefaultRecipe: (seed = {}) => commonRecipe(MODEL_IDS.COMPARISON, {
      greater: seed.greater ?? 42,
      lesser: seed.lesser ?? 28,
      difference: seed.difference ?? 14,
    }, { labels: { greater: "Greater", lesser: "Lesser" }, unknown: seed.unknown ?? "difference", ...seed.recipe }),
  },
  {
    id: MODEL_IDS.EQUAL_GROUPS,
    name: "Equal-groups / array model",
    purpose: "Shows a multiplicative quantity as equal groups or a countable rectangular array.",
    domains: ["multiplication", "division"],
    yearRange: { min: 1, max: 6 },
    requiredParameters: ["values.groups", "values.groupSize"],
    completionStates: COMPLETION_STATES,
    answerRevealRisk: { level: "high", when: "countable groups expose a multiplication or division result" },
    printBehaviour: "Group containers never split, and dots retain a countable minimum diameter.",
    monochromeBehaviour: "Containers and dot shapes encode membership; colour is supplemental.",
    matchingTags: ["equal groups", "each", "share", "groups of", "times", "array", "rows"],
    contraindications: ["ambiguous sharing versus grouping", "unequal groups", "non-whole group counts"],
    editorFields: [
      field("values.groups", "Number of groups", "integer", { min: 1, max: 20 }),
      field("values.groupSize", "In each group", "integer", { min: 1, max: 20 }),
      field("values.layout", "Layout", "choice", { options: ["groups", "array"] }),
      field("unknown", "Unknown quantity", "choice", { options: ["groups", "groupSize", "total"] }),
      field("unit", "Unit", "text"),
    ],
    createDefaultRecipe: (seed = {}) => commonRecipe(MODEL_IDS.EQUAL_GROUPS, {
      groups: seed.groups ?? 4,
      groupSize: seed.groupSize ?? 3,
      total: seed.total ?? 12,
      layout: seed.layout ?? "groups",
    }, { unknown: seed.unknown ?? "total", ...seed.recipe }),
  },
  {
    id: MODEL_IDS.COLUMN_ARITHMETIC,
    name: "Column addition / subtraction frame",
    purpose: "Right-aligns digits by place so addition or subtraction can be recorded without place-value drift.",
    domains: ["addition", "subtraction"],
    yearRange: { min: 2, max: 6 },
    requiredParameters: ["values.operation", "values.operands"],
    completionStates: COMPLETION_STATES,
    answerRevealRisk: { level: "high", when: "a completed result or exchange annotation reveals the calculation" },
    printBehaviour: "Uses a true column grid; signs sit outside digit columns and rows stay together.",
    monochromeBehaviour: "Rules, place headings and symbols retain alignment in monochrome.",
    matchingTags: ["column", "add", "subtract", "exchange", "regroup", "+", "−"],
    contraindications: ["decimal operands", "negative operands", "subtraction with more than two operands"],
    editorFields: [
      field("values.operation", "Operation", "choice", { options: ["addition", "subtraction"] }),
      field("values.operands", "Numbers", "integer-list"),
      field("values.result", "Result", "integer", { optional: true }),
      field("values.exchange", "Exchange notes", "digit-list", { optional: true }),
      field("unit", "Unit", "text"),
    ],
    createDefaultRecipe: (seed = {}) => commonRecipe(MODEL_IDS.COLUMN_ARITHMETIC, {
      operation: seed.operation ?? "addition",
      operands: seed.operands ?? [3482, 1567],
      result: seed.result ?? 5049,
      exchange: seed.exchange ?? [],
    }, { unknown: seed.unknown ?? "result", ...seed.recipe }),
  },
  {
    id: MODEL_IDS.MULTIPLICATION_GRID,
    name: "Multiplication grid / area model",
    purpose: "Represents two factors as perpendicular dimensions of one rectangular product.",
    domains: ["multiplication", "division", "area"],
    yearRange: { min: 2, max: 6 },
    requiredParameters: ["values.rows", "values.columns"],
    completionStates: COMPLETION_STATES,
    answerRevealRisk: { level: "high", when: "dimensions or completed partitions expose the product" },
    printBehaviour: "Cells stay square enough to count and the entire rectangle remains unsplit.",
    monochromeBehaviour: "Grid lines, dimension arrows and hatch patterns preserve structure.",
    matchingTags: ["grid", "area model", "rows", "columns", "multiply", "product", "factor"],
    contraindications: ["non-whole cell counts", "more than 144 countable cells", "partitions that do not total a dimension"],
    editorFields: [
      field("values.rows", "Rows", "integer", { min: 1, max: 20 }),
      field("values.columns", "Columns", "integer", { min: 1, max: 20 }),
      field("values.rowPartitions", "Row partitions", "integer-list", { optional: true }),
      field("values.columnPartitions", "Column partitions", "integer-list", { optional: true }),
      field("unknown", "Unknown quantity", "choice", { options: ["rows", "columns", "product"] }),
      field("unit", "Unit", "text"),
    ],
    createDefaultRecipe: (seed = {}) => commonRecipe(MODEL_IDS.MULTIPLICATION_GRID, {
      rows: seed.rows ?? 4,
      columns: seed.columns ?? 6,
      product: seed.product ?? 24,
      rowPartitions: seed.rowPartitions ?? [],
      columnPartitions: seed.columnPartitions ?? [],
    }, { unknown: seed.unknown ?? "product", ...seed.recipe }),
  },
  {
    id: MODEL_IDS.FRACTION_STRIP,
    name: "Fraction strip / fraction bar",
    purpose: "Divides one equal whole into equal parts and marks a selected numerator without changing the whole.",
    domains: ["fractions", "number", "comparison"],
    yearRange: { min: 1, max: 6 },
    requiredParameters: ["values.fractions"],
    completionStates: COMPLETION_STATES,
    answerRevealRisk: { level: "high", when: "shading or labels complete a fraction prompt" },
    printBehaviour: "Every strip uses the same printable whole width and equal SVG divisions.",
    monochromeBehaviour: "Hatching plus outlines identify selected parts without relying on colour.",
    matchingTags: ["fraction", "numerator", "denominator", "equal parts", "shade", "equivalent"],
    contraindications: ["unequal divisions", "different wholes compared as if equal", "denominators above twenty-four at worksheet size"],
    editorFields: [
      field("values.fractions", "Fractions", "fraction-list"),
      field("labels.whole", "Whole label", "text"),
      field("unknown", "Unknown field", "fraction-selector"),
      field("unit", "Unit", "text"),
    ],
    createDefaultRecipe: (seed = {}) => commonRecipe(MODEL_IDS.FRACTION_STRIP, {
      fractions: seed.fractions ?? [{ numerator: 3, denominator: 4, whole: 1, label: "" }],
      sameWhole: seed.sameWhole ?? true,
    }, { unknown: seed.unknown ?? "fraction:0:numerator", ...seed.recipe }),
  },
];

const SUPPORTED_VALUES = Object.freeze({
  [MODEL_IDS.PLACE_VALUE]: "Non-negative whole numbers using one to seven place-value columns.",
  [MODEL_IDS.BASE_TEN]: "Non-negative whole numbers to 9,999,999, represented by countable power-of-ten symbols.",
  [MODEL_IDS.PARTITIONING]: "A finite whole with two to six non-negative additive parts that make exactly that whole.",
  [MODEL_IDS.NUMBER_LINE]: "A finite increasing range divided into one to twenty mathematically equal intervals.",
  [MODEL_IDS.PART_WHOLE]: "A positive finite whole and two or more non-negative additive parts on one scale.",
  [MODEL_IDS.COMPARISON]: "Two non-negative finite quantities on one scale, with an exact non-negative difference.",
  [MODEL_IDS.EQUAL_GROUPS]: "One to twenty equal groups containing one to twenty whole items each.",
  [MODEL_IDS.COLUMN_ARITHMETIC]: "Non-negative whole-number addition, or two-number subtraction with a non-negative result.",
  [MODEL_IDS.MULTIPLICATION_GRID]: "A rectangular grid of one to twenty whole-number rows and columns with valid optional partitions.",
  [MODEL_IDS.FRACTION_STRIP]: "Proper fractions and one whole with denominators from 1 to 24; comparisons must use the same whole.",
});

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

const build2PurposeToLegacy = Object.freeze({
  'interpret-situation': 'question-information',
  'expose-structure': 'thinking-model',
  'support-calculation': 'thinking-model',
  'support-reasoning': 'thinking-model',
  'record-thinking': 'response-model',
  'represent-data': 'question-information',
  'pupil-workspace': 'response-model',
});

const build2Definitions = Object.values(BUILD2_MODEL_BANK).map((item) => ({
  ...item,
  purpose: item.childDescription || item.accessibleDescription,
  mathematicalPurpose: item.childDescription || item.accessibleDescription,
  compatibleDomains: item.domains,
  supportedValues: item.numericalConstraints,
  requiredParameters: [],
  suitableYearRange: { min: 4, max: 4 },
  yearRange: { min: 4, max: 4 },
  completionStates: COMPLETION_STATES,
  answerRevealRisk: { level: item.answerProtection?.level ?? 'medium', when: item.answerProtection?.pupilRule ?? '' },
  printBehaviour: `Supports ${item.print?.supportedSizes?.join(', ') ?? 'standard'} print sizes and remains a complete worksheet block.`,
  monochromeBehaviour: item.print?.monochrome ?? 'Line, label and hatch distinctions remain visible in monochrome.',
  matchingTags: item.searchTerms,
  matchingRules: {
    positiveTags: item.searchTerms,
    blockedWhen: item.contraindications,
    compatibilityGate: 'validateRecipe',
  },
  rendererKey: item.renderer,
  editorFields: item.editorFields.filter((field) => !['scaffoldState', 'size'].includes(field.key)),
  createDefaultRecipe: (seed = {}) => {
    const recipe = createBuild2ModelRecipe(item.id, seed);
    recipe.completionState = recipe.scaffoldState === 'modelled'
      ? 'completed'
      : recipe.scaffoldState === 'blank' ? 'blank' : 'partly-completed';
    recipe.purpose = build2PurposeToLegacy[item.representationPurposes?.[0]] ?? 'thinking-model';
    recipe.lockState = 'mathematical';
    return recipe;
  },
}));

const completeDefinitions = [
  ...definitions.map((item) => ({
  ...item,
  mathematicalPurpose: item.purpose,
  compatibleDomains: item.domains,
  supportedValues: SUPPORTED_VALUES[item.id],
  suitableYearRange: item.yearRange,
  matchingRules: {
    positiveTags: item.matchingTags,
    blockedWhen: item.contraindications,
    compatibilityGate: "validateRecipe",
  },
  rendererKey: item.id,
  })),
  ...build2Definitions,
];

export const MODEL_REGISTRY = deepFreeze(Object.fromEntries(completeDefinitions.map((item) => [item.id, item])));

export function listModelDefinitions() {
  return Object.values(MODEL_REGISTRY);
}

export function getModelDefinition(family) {
  return MODEL_REGISTRY[family] ?? null;
}

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function mergeRecipe(base, patch = {}) {
  return {
    ...base,
    ...clone(patch),
    values: { ...base.values, ...(clone(patch.values) ?? {}) },
    labels: { ...base.labels, ...(clone(patch.labels) ?? {}) },
  };
}

export function createModelRecipe(family, patch = {}) {
  const definition = getModelDefinition(family);
  if (!definition) throw new RangeError(`Unknown model family: ${family}`);
  const recipe = mergeRecipe(definition.createDefaultRecipe(), patch);
  recipe.family = family;
  return recipe;
}

const warning = (code, message) => ({ severity: "warning", code, message });
const error = (code, message) => ({ severity: "error", code, message });
const finite = (value) => value !== null
  && value !== ""
  && value !== undefined
  && typeof value !== "boolean"
  && Number.isFinite(Number(value));
const positiveInteger = (value) => Number.isInteger(Number(value)) && Number(value) > 0;

function cleanInteger(value) {
  if (value === null || value === "" || value === undefined || typeof value === "boolean") return Number.NaN;
  if (typeof value === "string") value = value.replace(/[ ,]/g, "");
  return Number(value);
}

function digitsFor(number, places) {
  const text = String(Math.abs(Math.trunc(number))).padStart(places, "0");
  return [...text].reverse().map((digit, index) => ({
    key: PLACE_KEYS[index],
    label: COLUMN_LABELS[index],
    digit: Number(digit),
    place: 10 ** index,
  })).reverse();
}

function expandedParts(number) {
  return digitsFor(number, Math.max(1, String(Math.abs(Math.trunc(number))).length))
    .map(({ digit, place }) => digit * place)
    .filter((part) => part !== 0);
}

function normalizeCommon(recipe, warnings) {
  if (recipe.completionState === "partial") {
    recipe.completionState = "partly-completed";
  }
  if (!COMPLETION_STATES.includes(recipe.completionState)) {
    warnings.push(warning("COMPLETION_STATE_NORMALIZED", "The unsupported completion state was changed to partly completed."));
    recipe.completionState = "partly-completed";
  }
  if (!MODEL_PURPOSES.includes(recipe.purpose)) {
    warnings.push(warning("PURPOSE_NORMALIZED", "The unsupported model purpose was changed to thinking model."));
    recipe.purpose = "thinking-model";
  }
  if (!MODEL_SIZES.includes(recipe.size)) {
    warnings.push(warning("SIZE_NORMALIZED", "The unsupported model size was changed to standard."));
    recipe.size = "standard";
  }
  if (!MODEL_POSITIONS.includes(recipe.position)) {
    warnings.push(warning("POSITION_NORMALIZED", "The unsupported model position was changed to beneath the question."));
    recipe.position = "beneath";
  }
  if ((!recipe.unit || typeof recipe.unit !== "string") && Array.isArray(recipe.units) && recipe.units[0]) {
    recipe.unit = String(recipe.units[0]);
  }
  recipe.unit = typeof recipe.unit === "string" ? recipe.unit.slice(0, 24) : "";
  recipe.labels = recipe.labels && typeof recipe.labels === "object" ? recipe.labels : {};
  recipe.lockState = "mathematical";
  const freeGeometryKeys = ["x", "y", "width", "height", "scale", "rotation", "transform"];
  const ignoredGeometry = freeGeometryKeys.filter((key) => key in recipe);
  ignoredGeometry.forEach((key) => delete recipe[key]);
  if (ignoredGeometry.length) {
    warnings.push(warning("FREEFORM_GEOMETRY_IGNORED", "Free-positioning geometry was ignored; the model will use its safe bounded layout."));
  }
}

function normalizePlaceValue(recipe, warnings, errors) {
  const number = cleanInteger(recipe.values.number);
  if (!Number.isInteger(number) || number < 0) {
    errors.push(error("WHOLE_NUMBER_REQUIRED", "Place-value charts require a non-negative whole number."));
    return;
  }
  const requested = Math.round(Number(recipe.values.minimumPlaces) || 1);
  const places = Math.max(String(number).length, requested, 1);
  if (places > 7) errors.push(error("TOO_MANY_PLACE_COLUMNS", "Place-value charts support at most seven columns."));
  recipe.values.number = number;
  recipe.values.minimumPlaces = Math.min(7, Math.max(1, requested));
  recipe.values.columns = digitsFor(number, Math.min(7, places));
}

function normalizeBaseTen(recipe, warnings, errors) {
  const number = cleanInteger(recipe.values.number);
  if (!Number.isInteger(number) || number < 0) {
    errors.push(error("WHOLE_NUMBER_REQUIRED", "Base-ten models require a non-negative whole number."));
    return;
  }
  if (number > 9999999) errors.push(error("BASE_TEN_RANGE", "This base-ten model supports values up to 9,999,999."));
  recipe.values.number = number;
  recipe.values.columns = digitsFor(number, Math.min(7, Math.max(1, String(number).length)));
  if (recipe.size === "compact" && recipe.values.columns.some(({ digit }) => digit > 7)) {
    warnings.push(warning("COMPACT_BLOCK_LEGIBILITY", "Eight or nine blocks in a compact model may be difficult to count when printed."));
  }
}

function normalizePartitioning(recipe, warnings, errors) {
  const whole = Number(recipe.values.whole);
  const parts = Array.isArray(recipe.values.parts) ? recipe.values.parts.map(Number) : [];
  if (!finite(whole) || parts.length < 2 || parts.some((part) => !finite(part) || part < 0)) {
    errors.push(error("INVALID_PARTITION", "A partition needs a valid whole and at least two non-negative parts."));
    return;
  }
  recipe.values.whole = whole;
  recipe.values.parts = parts;
  const sum = parts.reduce((total, part) => total + part, 0);
  if (Math.abs(sum - whole) > 1e-9) {
    errors.push(error("PARTITION_SUM_MISMATCH", "The parts do not make the stated whole, so the frame cannot be shown safely."));
  }
  if (parts.length > 6) warnings.push(warning("PARTITION_LEGIBILITY", "More than six parts may become too small at worksheet size."));
}

function normalizeNumberLine(recipe, warnings, errors) {
  const start = Number(recipe.values.start);
  const end = Number(recipe.values.end);
  if (!finite(start) || !finite(end) || end <= start) {
    errors.push(error("INVALID_NUMBER_LINE_RANGE", "A number line needs a finite end greater than its start."));
    return;
  }
  let divisions = Number(recipe.values.divisions);
  let interval = Number(recipe.values.interval);
  if (!positiveInteger(divisions)) {
    if (finite(interval) && interval > 0) divisions = Math.round((end - start) / interval);
    else divisions = 10;
    warnings.push(warning("DIVISIONS_NORMALIZED", "The number of divisions was replaced with a safe whole-number value."));
  }
  divisions = Math.max(1, Math.min(20, Math.round(divisions)));
  if (Number(recipe.values.divisions) > 20) warnings.push(warning("DIVISION_LIMIT", "The line was limited to twenty printable divisions."));
  const exactInterval = (end - start) / divisions;
  if (!finite(interval) || Math.abs(interval - exactInterval) > Math.max(1e-9, Math.abs(exactInterval) * 1e-9)) {
    warnings.push(warning("INTERVAL_NORMALIZED", "The interval was recalculated from the endpoints so every division is equal."));
  }
  recipe.values.start = start;
  recipe.values.end = end;
  recipe.values.divisions = divisions;
  recipe.values.interval = exactInterval;
  recipe.values.points = Array.from({ length: divisions + 1 }, (_, index) => start + exactInterval * index);
  const markers = Array.isArray(recipe.values.markers) ? recipe.values.markers : [];
  recipe.values.markers = markers.filter((marker) => {
    const inRange = marker && finite(marker.value) && Number(marker.value) >= start && Number(marker.value) <= end;
    if (!inRange) warnings.push(warning("MARKER_OUTSIDE_RANGE", "A marker outside the number-line range was omitted."));
    return inRange;
  }).map((marker) => ({ value: Number(marker.value), label: String(marker.label ?? marker.value) }));
}

function normalizePartWhole(recipe, warnings, errors) {
  let whole = recipe.values.whole === null || recipe.values.whole === "" || recipe.values.whole === undefined
    ? null
    : Number(recipe.values.whole);
  const parts = Array.isArray(recipe.values.parts)
    ? recipe.values.parts.map((part) => (part === null || part === "" || part === undefined ? null : Number(part)))
    : [];
  const missingParts = parts.map((part, index) => (part === null ? index : -1)).filter((index) => index >= 0);
  if (whole === null && missingParts.length === 0 && parts.length >= 2 && parts.every(finite)) {
    whole = parts.reduce((total, part) => total + part, 0);
    recipe.unknown = "whole";
    warnings.push(warning("WHOLE_DERIVED", "The whole was calculated from the supplied parts and remains hidden where required."));
  } else if (finite(whole) && missingParts.length === 1) {
    const knownTotal = parts.reduce((total, part) => total + (part ?? 0), 0);
    const missing = Number(whole) - knownTotal;
    if (missing >= 0) {
      parts[missingParts[0]] = missing;
      recipe.unknown = `part:${missingParts[0]}`;
      warnings.push(warning("MISSING_PART_DERIVED", "The missing part was calculated from the whole so proportional geometry remains accurate."));
    }
  }
  if (!finite(whole) || whole <= 0 || parts.length < 2 || parts.some((part) => !finite(part) || part < 0)) {
    errors.push(error("INVALID_PART_WHOLE", "A part-whole bar needs a positive whole and at least two non-negative parts."));
    return;
  }
  recipe.values.whole = whole;
  recipe.values.parts = parts;
  const sum = parts.reduce((total, part) => total + part, 0);
  if (Math.abs(sum - whole) > 1e-9) errors.push(error("PART_WHOLE_MISMATCH", "The parts do not equal the whole, so a proportional bar would be misleading."));
  if (parts.some((part) => part > 0 && part / whole < 0.08)) warnings.push(warning("VERY_SMALL_PART", "One part is less than 8% of the whole and may be hard to label at this size."));
}

function normalizeComparison(recipe, warnings, errors) {
  const greater = Number(recipe.values.greater);
  const lesser = Number(recipe.values.lesser);
  if (!finite(greater) || !finite(lesser) || greater <= 0 || lesser < 0 || greater < lesser) {
    errors.push(error("INVALID_COMPARISON", "Comparison bars need non-negative quantities with the greater value first."));
    return;
  }
  const expected = greater - lesser;
  const supplied = recipe.values.difference;
  recipe.values.greater = greater;
  recipe.values.lesser = lesser;
  if (supplied === "" || supplied === null || supplied === undefined) recipe.values.difference = expected;
  else if (!finite(supplied) || Math.abs(Number(supplied) - expected) > 1e-9) {
    errors.push(error("COMPARISON_DIFFERENCE_MISMATCH", "The stated difference does not match the two compared quantities."));
  } else recipe.values.difference = Number(supplied);
  if (greater && lesser / greater < 0.12) warnings.push(warning("MISLEADING_BAR_SCALE", "The smaller bar is under 12% of the larger bar and may be illegible rather than usefully proportional."));
}

function normalizeEqualGroups(recipe, warnings, errors) {
  let groups = recipe.values.groups === null || recipe.values.groups === undefined ? null : Number(recipe.values.groups);
  let groupSize = recipe.values.groupSize === null || recipe.values.groupSize === undefined ? null : Number(recipe.values.groupSize);
  let suppliedTotal = recipe.values.total === null || recipe.values.total === undefined ? null : Number(recipe.values.total);
  if (groups === null && positiveInteger(groupSize) && positiveInteger(suppliedTotal) && suppliedTotal % groupSize === 0) {
    groups = suppliedTotal / groupSize;
    recipe.unknown = "groups";
    warnings.push(warning("GROUP_COUNT_DERIVED", "The number of groups was calculated from the divisible total and equal group size."));
  } else if (groupSize === null && positiveInteger(groups) && positiveInteger(suppliedTotal) && suppliedTotal % groups === 0) {
    groupSize = suppliedTotal / groups;
    recipe.unknown = "groupSize";
    warnings.push(warning("GROUP_SIZE_DERIVED", "The group size was calculated from the divisible total and group count."));
  }
  if (!positiveInteger(groups) || !positiveInteger(groupSize)) {
    errors.push(error("WHOLE_GROUPS_REQUIRED", "Equal groups require a positive whole number of groups and items in each group."));
    return;
  }
  if (groups > 20 || groupSize > 20) errors.push(error("GROUP_MODEL_TOO_LARGE", "A countable group model supports at most twenty groups of twenty."));
  const expected = groups * groupSize;
  if (finite(suppliedTotal) && Number(suppliedTotal) !== expected) {
    warnings.push(warning("GROUP_TOTAL_NORMALIZED", "The total was recalculated so every group remains equal."));
  }
  recipe.values.groups = groups;
  recipe.values.groupSize = groupSize;
  recipe.values.total = expected;
  recipe.values.layout = recipe.values.layout === "array" ? "array" : "groups";
  if (expected > 144) warnings.push(warning("COUNTABLE_MODEL_DENSITY", "More than 144 items may be too dense to count at worksheet size."));
}

function normalizeColumnArithmetic(recipe, warnings, errors) {
  const operation = recipe.values.operation;
  if (!["addition", "subtraction"].includes(operation)) {
    errors.push(error("INVALID_COLUMN_OPERATION", "Column frames support addition or subtraction only."));
    return;
  }
  const operands = Array.isArray(recipe.values.operands) ? recipe.values.operands.map(cleanInteger) : [];
  if (operands.length < 2 || operands.some((value) => !Number.isInteger(value) || value < 0)) {
    errors.push(error("INVALID_COLUMN_OPERANDS", "Column arithmetic needs at least two non-negative whole-number operands."));
    return;
  }
  if (operation === "subtraction" && operands.length !== 2) errors.push(error("SUBTRACTION_ARITY", "A subtraction frame uses exactly two operands."));
  if (operation === "subtraction" && operands[0] < operands[1]) errors.push(error("NEGATIVE_COLUMN_RESULT", "Column subtraction does not display a negative result."));
  const computed = operation === "addition"
    ? operands.reduce((sum, value) => sum + value, 0)
    : operands[0] - operands[1];
  const result = recipe.values.result;
  if (result !== "" && result !== null && result !== undefined && (!Number.isInteger(cleanInteger(result)) || cleanInteger(result) !== computed)) {
    errors.push(error("COLUMN_RESULT_MISMATCH", "The entered result does not match the aligned calculation."));
  }
  recipe.values.operation = operation;
  recipe.values.operands = operands;
  recipe.values.result = result === "" || result === null || result === undefined ? null : cleanInteger(result);
  const width = Math.max(...operands.map((value) => String(value).length), String(Math.abs(computed)).length);
  recipe.values.columnCount = width;
  recipe.values.digitRows = operands.map((value) => String(value).padStart(width, " ").split(""));
  recipe.values.resultDigits = recipe.values.result === null ? Array(width).fill(" ") : String(recipe.values.result).padStart(width, " ").split("");
  if (width > 7) warnings.push(warning("COLUMN_FRAME_DENSITY", "More than seven digit columns may be too small at worksheet size."));
}

function validPartition(parts, total) {
  return !parts.length || (parts.every(positiveInteger) && parts.reduce((sum, value) => sum + Number(value), 0) === total);
}

function normalizeMultiplicationGrid(recipe, warnings, errors) {
  const rows = Number(recipe.values.rows);
  const columns = Number(recipe.values.columns);
  if (!positiveInteger(rows) || !positiveInteger(columns)) {
    errors.push(error("WHOLE_GRID_REQUIRED", "A multiplication grid needs positive whole-number rows and columns."));
    return;
  }
  if (rows > 20 || columns > 20) errors.push(error("GRID_TOO_LARGE", "A countable grid supports at most twenty rows and columns."));
  const product = rows * columns;
  if (finite(recipe.values.product) && Number(recipe.values.product) !== product) warnings.push(warning("PRODUCT_NORMALIZED", "The product was recalculated from the grid dimensions."));
  const rowPartitions = Array.isArray(recipe.values.rowPartitions) ? recipe.values.rowPartitions.map(Number) : [];
  const columnPartitions = Array.isArray(recipe.values.columnPartitions) ? recipe.values.columnPartitions.map(Number) : [];
  if (!validPartition(rowPartitions, rows)) errors.push(error("ROW_PARTITION_MISMATCH", "Row partitions must be positive whole numbers that total the row count."));
  if (!validPartition(columnPartitions, columns)) errors.push(error("COLUMN_PARTITION_MISMATCH", "Column partitions must be positive whole numbers that total the column count."));
  recipe.values.rows = rows;
  recipe.values.columns = columns;
  recipe.values.product = product;
  recipe.values.rowPartitions = rowPartitions;
  recipe.values.columnPartitions = columnPartitions;
  if (product > 144) warnings.push(warning("GRID_LEGIBILITY", "More than 144 cells may be too small to count when printed."));
}

function normalizeFractions(recipe, warnings, errors) {
  let fractions = recipe.values.fractions;
  if (!Array.isArray(fractions) && finite(recipe.values.numerator) && finite(recipe.values.denominator)) {
    fractions = [{ numerator: recipe.values.numerator, denominator: recipe.values.denominator, whole: 1, label: "" }];
  }
  if (!Array.isArray(fractions) || !fractions.length) {
    errors.push(error("FRACTION_REQUIRED", "At least one fraction is required."));
    return;
  }
  const normalized = [];
  fractions.forEach((fraction, index) => {
    const numerator = Number(fraction.numerator);
    const denominator = Number(fraction.denominator);
    const whole = Number(fraction.whole ?? 1);
    if (!Number.isInteger(denominator) || denominator < 1 || denominator > 24) {
      errors.push(error("INVALID_DENOMINATOR", `Fraction ${index + 1} needs a denominator from 1 to 24.`));
    }
    if (!Number.isInteger(numerator) || numerator < 0 || numerator > denominator) {
      errors.push(error("INVALID_NUMERATOR", `Fraction ${index + 1} needs a numerator from 0 to its denominator.`));
    }
    if (!finite(whole) || whole <= 0) errors.push(error("INVALID_FRACTION_WHOLE", `Fraction ${index + 1} needs a positive whole.`));
    normalized.push({ numerator, denominator, whole, label: String(fraction.label ?? "") });
  });
  if (normalized.length > 1 && normalized.some((fraction) => fraction.whole !== normalized[0].whole)) {
    errors.push(error("FRACTION_WHOLE_CHANGED", "Compared fraction strips must refer to the same-sized whole."));
  }
  recipe.values.fractions = normalized;
  recipe.values.sameWhole = true;
  if (normalized.some(({ denominator }) => denominator > 12) && recipe.size === "compact") {
    warnings.push(warning("FRACTION_DIVISION_LEGIBILITY", "More than twelve equal parts may be hard to distinguish in a compact strip."));
  }
}

const normalizers = {
  [MODEL_IDS.PLACE_VALUE]: normalizePlaceValue,
  [MODEL_IDS.BASE_TEN]: normalizeBaseTen,
  [MODEL_IDS.PARTITIONING]: normalizePartitioning,
  [MODEL_IDS.NUMBER_LINE]: normalizeNumberLine,
  [MODEL_IDS.PART_WHOLE]: normalizePartWhole,
  [MODEL_IDS.COMPARISON]: normalizeComparison,
  [MODEL_IDS.EQUAL_GROUPS]: normalizeEqualGroups,
  [MODEL_IDS.COLUMN_ARITHMETIC]: normalizeColumnArithmetic,
  [MODEL_IDS.MULTIPLICATION_GRID]: normalizeMultiplicationGrid,
  [MODEL_IDS.FRACTION_STRIP]: normalizeFractions,
};

/** Accepts the compact recipe vocabulary emitted by the local matcher. */
function adaptMatcherRecipe(input, warnings) {
  const adapted = clone(input);
  adapted.values = adapted.values && typeof adapted.values === "object" ? adapted.values : {};
  if (["question", "blank", "requested-value"].includes(adapted.unknown)) adapted.unknown = null;
  if ((!adapted.unit || typeof adapted.unit !== "string") && Array.isArray(adapted.units) && adapted.units[0]) {
    adapted.unit = adapted.units[0];
  }
  if (adapted.completionState === "partial") adapted.completionState = "partly-completed";

  switch (adapted.family) {
    case MODEL_IDS.PLACE_VALUE: {
      if (adapted.unknown === null || adapted.unknown === undefined) {
        const places = Math.max(1, String(Math.abs(Math.trunc(Number(adapted.values.number) || 0))).length);
        adapted.unknown = PLACE_KEYS[Math.min(places - 1, 2)];
      }
      break;
    }
    case MODEL_IDS.BASE_TEN:
      if (adapted.unknown === null || adapted.unknown === undefined) {
        const places = Math.max(1, String(Math.abs(Math.trunc(Number(adapted.values.number) || 0))).length);
        adapted.unknown = PLACE_KEYS[Math.min(places - 1, 1)];
      }
      break;
    case MODEL_IDS.PARTITIONING:
      if ((adapted.unknown === null || adapted.unknown === undefined) && Array.isArray(adapted.values.parts) && adapted.values.parts.length) {
        adapted.unknown = `part:${adapted.values.parts.length - 1}`;
      }
      break;
    case MODEL_IDS.NUMBER_LINE:
      if (adapted.values.interval === undefined && adapted.values.step !== undefined) adapted.values.interval = adapted.values.step;
      if (adapted.values.markers === undefined && Array.isArray(adapted.values.points)) {
        adapted.values.markers = adapted.values.points.map((value) => ({ value, label: String(value) }));
      }
      if ((adapted.unknown === null || adapted.unknown === undefined) && adapted.values.markers?.length) adapted.unknown = "marker:0";
      break;
    case MODEL_IDS.COMPARISON:
      if (Array.isArray(adapted.values.quantities) && adapted.values.quantities.length >= 2) {
        const quantities = adapted.values.quantities.map(Number).sort((a, b) => b - a);
        adapted.values.greater = quantities[0];
        adapted.values.lesser = quantities[1];
      }
      if (adapted.values.difference === null || adapted.values.difference === undefined) adapted.unknown = "difference";
      break;
    case MODEL_IDS.EQUAL_GROUPS:
      if ("groupCount" in adapted.values) adapted.values.groups = adapted.values.groupCount;
      if (adapted.values.layout === undefined) adapted.values.layout = adapted.variant === "array" ? "array" : "groups";
      if (adapted.values.total === null || adapted.values.total === undefined) adapted.unknown = "total";
      break;
    case MODEL_IDS.COLUMN_ARITHMETIC:
      if (adapted.values.result === null || adapted.values.result === undefined) adapted.unknown = "result";
      break;
    case MODEL_IDS.MULTIPLICATION_GRID:
      if (adapted.values.product === null || adapted.values.product === undefined) adapted.unknown = "product";
      break;
    case MODEL_IDS.FRACTION_STRIP:
      if ((adapted.unknown === null || adapted.unknown === undefined) && adapted.purpose === "response-model" && Array.isArray(adapted.values.fractions)) {
        adapted.unknown = adapted.values.fractions.map((_, index) => `fraction:${index}:numerator`);
      }
      break;
    default:
      break;
  }
  if (adapted.lockState && adapted.lockState !== "mathematical") {
    warnings.push(warning("STRUCTURE_LOCK_PRESERVED", "The model remains locked to mathematically safe geometry."));
  }
  return adapted;
}

/**
 * Returns a safe derived copy. Corrections that do not alter the represented
 * relationship are applied and reported; unsafe relationships become errors.
 */
export function normalizeRecipe(input) {
  const warnings = [];
  const errors = [];
  if (!input || typeof input !== "object") return { recipe: null, warnings, errors: [error("RECIPE_REQUIRED", "A model recipe is required.")] };
  const definition = getModelDefinition(input.family);
  if (!definition) return { recipe: null, warnings, errors: [error("UNKNOWN_MODEL", `Unknown model family: ${input.family ?? "missing"}`)] };

  // Build 2 families retain their own compact, declarative schema.  This
  // adapter deliberately exposes the familiar Build 1 state names too, so the
  // established editor, printer and saved-project normalisers remain stable.
  if (getBuild2ModelDefinition(input.family)) {
    const build2Input = clone(input);
    if (!build2Input.scaffoldState && build2Input.completionState) {
      build2Input.scaffoldState = build2Input.completionState === 'completed'
        ? 'modelled'
        : build2Input.completionState === 'blank' ? 'blank' : 'guided';
    }
    const result = normalizeBuild2ModelRecipe(build2Input);
    if (!result.recipe) {
      return {
        recipe: null,
        warnings: result.warnings.map((message, index) => warning(`BUILD2_WARNING_${index}`, message)),
        errors: result.errors.map((message, index) => error(`BUILD2_INVALID_${index}`, message)),
      };
    }
    const recipe = {
      ...result.recipe,
      completionState: result.recipe.scaffoldState === 'modelled'
        ? 'completed'
        : result.recipe.scaffoldState === 'blank' ? 'blank' : 'partly-completed',
      purpose: MODEL_PURPOSES.includes(input.purpose)
        ? input.purpose
        : build2PurposeToLegacy[definition.representationPurposes?.[0]] ?? 'thinking-model',
      lockState: 'mathematical',
      metadata: { ...(result.recipe.metadata ?? {}), build2: true },
    };
    if (recipe.sourceHasDiagram) warnings.push(warning("POSSIBLE_DUPLICATE_DIAGRAM", "The source question may already contain a diagram; check that this model is not duplicating it."));
    if (recipe.colorOnlyEncoding) errors.push(error("COLOUR_ONLY_MEANING", "Mathematical meaning cannot be encoded by colour alone."));
    return {
      recipe,
      warnings: [...result.warnings.map((message, index) => warning(`BUILD2_WARNING_${index}`, message)), ...warnings],
      errors: [...result.errors.map((message, index) => error(`BUILD2_INVALID_${index}`, message)), ...errors],
    };
  }
  const adaptedInput = adaptMatcherRecipe(input, warnings);
  const recipe = mergeRecipe(definition.createDefaultRecipe(), adaptedInput);
  normalizeCommon(recipe, warnings);
  normalizers[recipe.family](recipe, warnings, errors);
  if (recipe.sourceHasDiagram) warnings.push(warning("POSSIBLE_DUPLICATE_DIAGRAM", "The source question may already contain a diagram; check that this model is not duplicating it."));
  if (recipe.colorOnlyEncoding) errors.push(error("COLOUR_ONLY_MEANING", "Mathematical meaning cannot be encoded by colour alone."));
  return { recipe, warnings, errors };
}

/** Validates and normalizes in one pass so callers cannot accidentally render unchecked geometry. */
export function validateRecipe(input, context = {}) {
  const result = normalizeRecipe(input);
  if (!result.recipe) return { valid: false, normalizedRecipe: null, warnings: result.warnings, errors: result.errors };
  const definition = getModelDefinition(result.recipe.family);
  const assessment = context.intent === "assessment" || result.recipe.worksheetIntent === "assessment";
  if (assessment && (result.recipe.completionState === "completed" || result.recipe.purpose === "worked-example")) {
    result.warnings.push(warning("ASSESSMENT_ANSWER_REVEAL", `${definition.name} may reveal assessed thinking in its current state.`));
  }
  if (assessment && result.recipe.completionState === "partly-completed" && definition.answerRevealRisk.level === "high") {
    result.warnings.push(warning("ASSESSMENT_STRUCTURE_REVEAL", `${definition.name} may supply part of the assessed structure even though it is only partly completed.`));
  }
  if (result.recipe.size === "compact" && definition.answerRevealRisk.level === "high" && result.recipe.completionState === "completed") {
    result.warnings.push(warning("COMPACT_COMPLETED_MODEL", "Check that completed values remain legible and are intended for this output."));
  }
  return {
    valid: result.errors.length === 0,
    normalizedRecipe: result.recipe,
    warnings: result.warnings,
    errors: result.errors,
  };
}

export function isAnswerRevealRisk(input, context = {}) {
  const validation = validateRecipe(input, context);
  return validation.warnings.some(({ code }) => code === "ASSESSMENT_ANSWER_REVEAL" || code === "ASSESSMENT_STRUCTURE_REVEAL");
}

export function suggestedExpandedParts(number) {
  const value = cleanInteger(number);
  return Number.isInteger(value) && value >= 0 ? expandedParts(value) : [];
}
