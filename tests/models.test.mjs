import test from "node:test";
import assert from "node:assert/strict";

import {
  COMPLETION_STATES,
  MODEL_IDS,
  MODEL_REGISTRY,
  createModelRecipe,
  getModelDefinition,
  listModelDefinitions,
  normalizeRecipe,
  validateRecipe,
} from "../js/model-registry.js";
import {
  MODEL_RENDERERS,
  renderModel,
  renderModelPreview,
} from "../js/model-renderers.js";

const familyIds = Object.values(MODEL_IDS);

test("registry preserves the ten Build 1 model families and extends them with the Build 2 bank", () => {
  assert.equal(familyIds.length, 10);
  assert.deepEqual(Object.keys(MODEL_REGISTRY).slice(0, 10), familyIds);
  assert.ok(listModelDefinitions().length > familyIds.length);
  assert.ok(getModelDefinition('rounding-number-line'));
  assert.ok(getModelDefinition('perimeter-trace'));
  assert.ok(getModelDefinition('bar-chart'));
  assert.ok(Object.keys(MODEL_RENDERERS).length >= 10);
});

test("every registry declaration provides the extensible model contract", () => {
  const requiredKeys = [
    "name",
    "purpose",
    "mathematicalPurpose",
    "domains",
    "compatibleDomains",
    "supportedValues",
    "yearRange",
    "suitableYearRange",
    "requiredParameters",
    "completionStates",
    "answerRevealRisk",
    "printBehaviour",
    "monochromeBehaviour",
    "matchingTags",
    "matchingRules",
    "contraindications",
    "editorFields",
    "rendererKey",
    "createDefaultRecipe",
  ];
  for (const family of familyIds) {
    const definition = getModelDefinition(family);
    assert.ok(definition, family);
    for (const key of requiredKeys) assert.ok(key in definition, `${family} declares ${key}`);
    assert.deepEqual(definition.completionStates, COMPLETION_STATES);
    assert.ok(definition.domains.length > 0);
    assert.ok(definition.matchingTags.length > 0);
    assert.ok(definition.contraindications.length > 0);
    assert.ok(definition.editorFields.length > 0);
    assert.equal(typeof definition.createDefaultRecipe, "function");
  }
});

test("every family creates a valid structured recipe and semantic SVG", () => {
  for (const family of familyIds) {
    const recipe = createModelRecipe(family);
    const validation = validateRecipe(recipe);
    assert.equal(validation.valid, true, `${family}: ${validation.errors.map((item) => item.message).join("; ")}`);
    assert.equal(validation.normalizedRecipe.family, family);
    assert.equal(validation.normalizedRecipe.lockState, "mathematical");
    const html = renderModel(recipe);
    assert.match(html, /<figure\b/);
    assert.match(html, /<svg\b/);
    assert.match(html, /role="img"/);
    assert.match(html, /<title\b/);
    assert.match(html, /<desc\b/);
    assert.match(html, new RegExp(`data-model-family="${family}"`));
    assert.doesNotMatch(html, /data-model-invalid="true"/);
  }
});

test("all three completion states and all four sizes render for every family", () => {
  for (const family of familyIds) {
    for (const completionState of COMPLETION_STATES) {
      for (const size of ["compact", "standard", "large", "extra-large"]) {
        const html = renderModel(createModelRecipe(family, { completionState, size }));
        assert.match(html, new RegExp(`data-completion-state="${completionState}"`));
        assert.match(html, new RegExp(`data-model-size="${size}"`));
      }
    }
  }
});

test("place-value chart derives the correct digits and columns", () => {
  const recipe = createModelRecipe(MODEL_IDS.PLACE_VALUE, { values: { number: 3482, minimumPlaces: 4 }, completionState: "completed" });
  const { normalizedRecipe } = validateRecipe(recipe);
  assert.deepEqual(normalizedRecipe.values.columns.map(({ digit }) => digit), [3, 4, 8, 2]);
  assert.deepEqual(normalizedRecipe.values.columns.map(({ key }) => key), ["thousands", "hundreds", "tens", "ones"]);
  const html = renderModel(recipe);
  assert.match(html, /data-place="thousands"/);
  assert.match(html, />3<\/text>/);
  assert.match(html, />2<\/text>/);
});

test("base-ten renderer uses countable structured glyphs, not an image", () => {
  const html = renderModel(createModelRecipe(MODEL_IDS.BASE_TEN, {
    values: { number: 23 },
    completionState: "completed",
  }));
  assert.doesNotMatch(html, /<img\b/);
  assert.match(html, /data-place="tens"/);
  assert.match(html, /× 2/);
  assert.match(html, /× 3/);
});

test("partitioning and part-whole models reject relationships that do not preserve the whole", () => {
  const partition = validateRecipe(createModelRecipe(MODEL_IDS.PARTITIONING, {
    values: { whole: 100, parts: [60, 30] },
  }));
  assert.equal(partition.valid, false);
  assert.ok(partition.errors.some(({ code }) => code === "PARTITION_SUM_MISMATCH"));

  const partWholeRecipe = createModelRecipe(MODEL_IDS.PART_WHOLE, {
    values: { whole: 25, parts: [10, 10] },
  });
  const partWhole = validateRecipe(partWholeRecipe);
  assert.equal(partWhole.valid, false);
  assert.ok(partWhole.errors.some(({ code }) => code === "PART_WHOLE_MISMATCH"));
  assert.match(renderModel(partWholeRecipe), /data-model-invalid="true"/);
});

test("a valid part-whole bar uses widths proportional to its values", () => {
  const recipe = createModelRecipe(MODEL_IDS.PART_WHOLE, {
    values: { whole: 20, parts: [5, 15] },
    completionState: "completed",
  });
  const html = renderModel(recipe);
  const widths = [...html.matchAll(/width="([\d.]+)" height="52" data-part-index=/g)].map((match) => Number(match[1]));
  assert.equal(widths.length, 2);
  assert.ok(Math.abs(widths[1] / widths[0] - 3) < 1e-9);
});

test("number-line normalization guarantees equal intervals", () => {
  const recipe = createModelRecipe(MODEL_IDS.NUMBER_LINE, {
    values: { start: 5, end: 29, divisions: 6, interval: 5, markers: [] },
  });
  const validation = validateRecipe(recipe);
  assert.equal(validation.valid, true);
  assert.ok(validation.warnings.some(({ code }) => code === "INTERVAL_NORMALIZED"));
  assert.equal(validation.normalizedRecipe.values.interval, 4);
  assert.deepEqual(validation.normalizedRecipe.values.points, [5, 9, 13, 17, 21, 25, 29]);
  const gaps = validation.normalizedRecipe.values.points.slice(1).map((point, index) => point - validation.normalizedRecipe.values.points[index]);
  assert.deepEqual(gaps, [4, 4, 4, 4, 4, 4]);
});

test("number-line divisions are bounded and out-of-range markers are omitted with warnings", () => {
  const validation = validateRecipe(createModelRecipe(MODEL_IDS.NUMBER_LINE, {
    values: {
      start: 0,
      end: 10,
      divisions: 100,
      interval: 0.1,
      markers: [{ value: 50, label: "outside" }],
    },
  }));
  assert.equal(validation.normalizedRecipe.values.divisions, 20);
  assert.equal(validation.normalizedRecipe.values.markers.length, 0);
  assert.ok(validation.warnings.some(({ code }) => code === "DIVISION_LIMIT"));
  assert.ok(validation.warnings.some(({ code }) => code === "MARKER_OUTSIDE_RANGE"));
});

test("comparison bars preserve their relationship and flag illegible proportions", () => {
  const warningResult = validateRecipe(createModelRecipe(MODEL_IDS.COMPARISON, {
    values: { greater: 100, lesser: 5, difference: 95 },
  }));
  assert.equal(warningResult.valid, true);
  assert.ok(warningResult.warnings.some(({ code }) => code === "MISLEADING_BAR_SCALE"));

  const badDifference = validateRecipe(createModelRecipe(MODEL_IDS.COMPARISON, {
    values: { greater: 42, lesser: 28, difference: 12 },
  }));
  assert.equal(badDifference.valid, false);
  assert.ok(badDifference.errors.some(({ code }) => code === "COMPARISON_DIFFERENCE_MISMATCH"));
});

test("equal groups preserve integer group sizes and derive the only valid total", () => {
  const validation = validateRecipe(createModelRecipe(MODEL_IDS.EQUAL_GROUPS, {
    values: { groups: 6, groupSize: 4, total: 25, layout: "groups" },
  }));
  assert.equal(validation.valid, true);
  assert.equal(validation.normalizedRecipe.values.total, 24);
  assert.ok(validation.warnings.some(({ code }) => code === "GROUP_TOTAL_NORMALIZED"));

  const unequal = validateRecipe(createModelRecipe(MODEL_IDS.EQUAL_GROUPS, {
    values: { groups: 3.5, groupSize: 4 },
  }));
  assert.equal(unequal.valid, false);
  assert.ok(unequal.errors.some(({ code }) => code === "WHOLE_GROUPS_REQUIRED"));
});

test("equal-groups renderer supports both grouped and array variants", () => {
  const grouped = renderModel(createModelRecipe(MODEL_IDS.EQUAL_GROUPS, {
    values: { groups: 3, groupSize: 2, total: 6, layout: "groups" },
    completionState: "completed",
  }));
  const array = renderModel(createModelRecipe(MODEL_IDS.EQUAL_GROUPS, {
    values: { groups: 3, groupSize: 2, total: 6, layout: "array" },
    completionState: "completed",
  }));
  assert.equal((grouped.match(/<circle/g) ?? []).length, 6);
  assert.equal((array.match(/<circle/g) ?? []).length, 6);
  assert.notEqual(grouped, array);
});

test("column arithmetic right-aligns every row and rejects an incorrect result", () => {
  const recipe = createModelRecipe(MODEL_IDS.COLUMN_ARITHMETIC, {
    values: { operation: "addition", operands: [27, 1045], result: 1072 },
    completionState: "completed",
  });
  const validation = validateRecipe(recipe);
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.normalizedRecipe.values.digitRows, [
    [" ", " ", "2", "7"],
    ["1", "0", "4", "5"],
  ]);
  assert.deepEqual(validation.normalizedRecipe.values.resultDigits, ["1", "0", "7", "2"]);

  const wrong = validateRecipe(createModelRecipe(MODEL_IDS.COLUMN_ARITHMETIC, {
    values: { operation: "subtraction", operands: [5000, 1827], result: 3272 },
  }));
  assert.equal(wrong.valid, false);
  assert.ok(wrong.errors.some(({ code }) => code === "COLUMN_RESULT_MISMATCH"));
});

test("multiplication grid derives its product and enforces valid area partitions", () => {
  const recipe = createModelRecipe(MODEL_IDS.MULTIPLICATION_GRID, {
    values: { rows: 4, columns: 6, product: 30, rowPartitions: [2, 2], columnPartitions: [4, 2] },
  });
  const validation = validateRecipe(recipe);
  assert.equal(validation.valid, true);
  assert.equal(validation.normalizedRecipe.values.product, 24);
  assert.ok(validation.warnings.some(({ code }) => code === "PRODUCT_NORMALIZED"));

  const invalid = validateRecipe(createModelRecipe(MODEL_IDS.MULTIPLICATION_GRID, {
    values: { rows: 4, columns: 6, rowPartitions: [3, 3], columnPartitions: [] },
  }));
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some(({ code }) => code === "ROW_PARTITION_MISMATCH"));
});

test("fraction strips retain equal SVG widths and one shared whole", () => {
  const recipe = createModelRecipe(MODEL_IDS.FRACTION_STRIP, {
    values: {
      fractions: [
        { numerator: 3, denominator: 4, whole: 1, label: "three quarters" },
        { numerator: 6, denominator: 8, whole: 1, label: "six eighths" },
      ],
    },
    completionState: "completed",
  });
  const validation = validateRecipe(recipe);
  assert.equal(validation.valid, true);
  const html = renderModel(recipe);
  assert.match(html, /data-equal-parts="4"/);
  assert.match(html, /data-equal-parts="8"/);
  const firstStrip = html.match(/data-equal-parts="4"[\s\S]*?<\/g>/)?.[0] ?? "";
  const widths = [...firstStrip.matchAll(/width="([\d.]+)"/g)].map((match) => Number(match[1]));
  assert.equal(widths.length, 4);
  assert.ok(widths.every((width) => width === widths[0]));

  const changedWhole = validateRecipe(createModelRecipe(MODEL_IDS.FRACTION_STRIP, {
    values: {
      fractions: [
        { numerator: 1, denominator: 2, whole: 1 },
        { numerator: 2, denominator: 4, whole: 2 },
      ],
    },
  }));
  assert.equal(changedWhole.valid, false);
  assert.ok(changedWhole.errors.some(({ code }) => code === "FRACTION_WHOLE_CHANGED"));
});

test("invalid fractions cannot create unequal or impossible parts", () => {
  const tooManySelected = validateRecipe(createModelRecipe(MODEL_IDS.FRACTION_STRIP, {
    values: { fractions: [{ numerator: 5, denominator: 4, whole: 1 }] },
  }));
  assert.equal(tooManySelected.valid, false);
  assert.ok(tooManySelected.errors.some(({ code }) => code === "INVALID_NUMERATOR"));

  const decimalParts = validateRecipe(createModelRecipe(MODEL_IDS.FRACTION_STRIP, {
    values: { fractions: [{ numerator: 1, denominator: 3.5, whole: 1 }] },
  }));
  assert.equal(decimalParts.valid, false);
  assert.ok(decimalParts.errors.some(({ code }) => code === "INVALID_DENOMINATOR"));
});

test("assessment context warns when a model or state may reveal an answer", () => {
  for (const family of familyIds) {
    const validation = validateRecipe(createModelRecipe(family, { completionState: "completed" }), { intent: "assessment" });
    assert.ok(validation.warnings.some(({ code }) => code === "ASSESSMENT_ANSWER_REVEAL"), family);
  }
});

test("colour-only meaning is blocked and a duplicated source diagram is flagged", () => {
  const blocked = validateRecipe(createModelRecipe(MODEL_IDS.FRACTION_STRIP, { colorOnlyEncoding: true }));
  assert.equal(blocked.valid, false);
  assert.ok(blocked.errors.some(({ code }) => code === "COLOUR_ONLY_MEANING"));

  const duplicate = validateRecipe(createModelRecipe(MODEL_IDS.NUMBER_LINE, { sourceHasDiagram: true }));
  assert.equal(duplicate.valid, true);
  assert.ok(duplicate.warnings.some(({ code }) => code === "POSSIBLE_DUPLICATE_DIAGRAM"));
});

test("safe normalization ignores free distortion and restores bounded settings", () => {
  const result = normalizeRecipe(createModelRecipe(MODEL_IDS.PLACE_VALUE, {
    size: "microscopic",
    position: "pixel:32,18",
    lockState: "free-transform",
    width: -900,
    height: 0,
  }));
  assert.equal(result.recipe.size, "standard");
  assert.equal(result.recipe.position, "beneath");
  assert.equal(result.recipe.lockState, "mathematical");
  assert.equal("width" in result.recipe, false);
  assert.equal("height" in result.recipe, false);
  assert.ok(result.warnings.some(({ code }) => code === "SIZE_NORMALIZED"));
  assert.ok(result.warnings.some(({ code }) => code === "POSITION_NORMALIZED"));
  assert.ok(result.warnings.some(({ code }) => code === "FREEFORM_GEOMETRY_IGNORED"));
  const html = renderModel(result.recipe);
  assert.doesNotMatch(html, /-900/);
});

test("model text is escaped and hidden pupil values do not leak into accessible descriptions", () => {
  const recipe = createModelRecipe(MODEL_IDS.FRACTION_STRIP, {
    values: { fractions: [{ numerator: 3, denominator: 4, whole: 1, label: "<script>bad()</script>" }] },
    completionState: "blank",
  });
  const html = renderModel(recipe);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /3\/4/);
  assert.doesNotMatch(html, /bad\(\)/);
  assert.match(html, /Values hidden from the pupil are not included/);
});

test("preview API forces a compact model without mutating the source recipe", () => {
  const recipe = createModelRecipe(MODEL_IDS.PART_WHOLE, { size: "large" });
  const html = renderModelPreview(recipe);
  assert.match(html, /data-model-size="compact"/);
  assert.equal(recipe.size, "large");
});

test("matcher-shaped partly completed recipes keep the important result hidden", () => {
  const matcherShapes = [
    {
      recipe: { family: "place-value", values: { number: 3482 }, unknown: "question", completionState: "partly-completed", purpose: "thinking-model" },
      unknown: "hundreds",
    },
    {
      recipe: { family: "partition", values: { whole: 3482, parts: [3000, 400, 80, 2] }, unknown: null, completionState: "partly-completed", purpose: "thinking-model" },
      unknown: "part:3",
    },
    {
      recipe: { family: "comparison-bar", values: { quantities: [42, 28], difference: null }, unknown: "question", completionState: "partly-completed", purpose: "response-model" },
      unknown: "difference",
    },
    {
      recipe: { family: "equal-groups", values: { total: null, groupCount: 4, groupSize: 6 }, unknown: "question", completionState: "partly-completed", purpose: "thinking-model" },
      unknown: "total",
    },
    {
      recipe: { family: "area-model", values: { rows: 4, columns: 6, product: null }, unknown: null, completionState: "partly-completed", purpose: "response-model" },
      unknown: "product",
    },
  ];
  for (const { recipe, unknown } of matcherShapes) {
    const validation = validateRecipe(recipe);
    assert.equal(validation.valid, true, recipe.family);
    assert.equal(validation.normalizedRecipe.unknown, unknown, recipe.family);
  }

  const fraction = validateRecipe({
    family: "fraction-strip",
    values: { fractions: [{ numerator: 3, denominator: 4 }], equalParts: true, sameWhole: true },
    unknown: null,
    completionState: "partly-completed",
    purpose: "response-model",
  });
  assert.deepEqual(fraction.normalizedRecipe.unknown, ["fraction:0:numerator"]);
  assert.doesNotMatch(renderModel(fraction.normalizedRecipe), /3\/4/);
});
