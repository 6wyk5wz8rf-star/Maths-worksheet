import {
  MODEL_IDS,
  getModelDefinition,
  validateRecipe,
} from "./model-registry.js";
import { renderBuild2Model } from "./build2-model-renderers.js";

const SIZE_BOXES = Object.freeze({
  compact: { width: 420, height: 150 },
  standard: { width: 560, height: 210 },
  large: { width: 700, height: 270 },
  'extra-large': { width: 860, height: 330 },
});

// Number lines and fraction strips are deliberately shallow, wide models.
// A tall default SVG in a shallow A4 slot uses `meet` to protect its aspect
// ratio, but leaves most of the printable width unused. These boxes preserve
// the mathematical geometry while letting the actual line fill the page.
const WIDE_SIZE_BOXES = Object.freeze({
  // Large choices deliberately use a tighter coordinate system. At a fixed
  // printable page width this enlarges the complete line, its ticks and its
  // labels instead of merely reserving extra blank height.
  compact: { width: 980, height: 112 },
  standard: { width: 900, height: 120 },
  large: { width: 760, height: 132 },
  'extra-large': { width: 660, height: 148 },
});

function escapeMarkup(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatNumber(value) {
  if (value === "" || value === null || value === undefined) return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return escapeMarkup(value);
  if (Number.isInteger(number)) return String(number);
  return String(Number(number.toFixed(8)));
}

function withUnit(value, recipe) {
  const shown = formatNumber(value);
  return shown && recipe.unit ? `${shown} ${escapeMarkup(recipe.unit)}` : shown;
}

function unknownMatches(recipe, token) {
  const unknowns = Array.isArray(recipe.unknown) ? recipe.unknown : [recipe.unknown];
  return unknowns.some((unknown) => unknown === token);
}

function visible(recipe, token, options = {}) {
  if (recipe.completionState === "blank") return Boolean(options.keepWhenBlank);
  if (recipe.completionState === "completed") return true;
  return !unknownMatches(recipe, token);
}

function shown(recipe, token, value, options = {}) {
  return visible(recipe, token, options) ? withUnit(value, options.withoutUnit ? { ...recipe, unit: "" } : recipe) : "";
}

function hash(value) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

function renderId(recipe) {
  return `mps-${recipe.family}-${hash(JSON.stringify(recipe))}`;
}

function svgText(x, y, value, className = "mps-model__value", anchor = "middle", extra = "") {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" class="${className}" ${extra}>${escapeMarkup(value)}</text>`;
}

function safeDescription(definition, recipe) {
  const state = recipe.completionState === "partly-completed" ? "partly completed" : recipe.completionState;
  return `${definition.name}, ${state}, ${recipe.size} size. Values hidden from the pupil are not included in this description.`;
}

function svgFrame(recipe, definition, content, options = {}) {
  const box = options.box ?? SIZE_BOXES[recipe.size] ?? SIZE_BOXES.standard;
  const id = renderId(recipe);
  const title = escapeMarkup(options.title ?? definition.name);
  const description = escapeMarkup(options.description ?? safeDescription(definition, recipe));
  const pattern = `<defs>
    <pattern id="${id}-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="8" class="mps-model__hatch-line" stroke="currentColor" stroke-width="2" opacity=".28" />
    </pattern>
  </defs>`;
  return `<figure class="mps-model mps-model--${escapeMarkup(recipe.family)} mps-model--${escapeMarkup(recipe.size)}" data-model-family="${escapeMarkup(recipe.family)}" data-model-size="${escapeMarkup(recipe.size)}" data-completion-state="${escapeMarkup(recipe.completionState)}" role="group" aria-label="${title}">
    <svg class="mps-model__svg" viewBox="0 0 ${box.width} ${box.height}" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="${id}-title ${id}-desc" xmlns="http://www.w3.org/2000/svg">
      <title id="${id}-title">${title}</title>
      <desc id="${id}-desc">${description}</desc>
      ${pattern}
      ${content(id, box)}
    </svg>
  </figure>`;
}

function invalidModel(family, errors) {
  const definition = getModelDefinition(family);
  const name = definition?.name ?? "Mathematical model";
  const message = errors.map(({ message }) => message).join(" ");
  return `<figure class="mps-model mps-model--invalid" data-model-family="${escapeMarkup(family ?? "unknown")}" data-model-invalid="true" role="group" aria-label="${escapeMarkup(name)} unavailable">
    <div class="mps-model__safety-message" role="status"><strong>${escapeMarkup(name)} cannot be shown safely.</strong> ${escapeMarkup(message)}</div>
  </figure>`;
}

function renderPlaceValue(recipe, definition) {
  return svgFrame(recipe, definition, (_id, box) => {
    const columns = recipe.values.columns;
    const margin = 18;
    const width = (box.width - margin * 2) / columns.length;
    const headerY = 28;
    const headerHeight = box.height * 0.27;
    const valueY = headerY + headerHeight;
    const valueHeight = box.height * 0.38;
    const fontClass = columns.length > 5 ? "mps-model__label mps-model__label--small" : "mps-model__label";
    const chart = columns.map((column, index) => {
      const x = margin + index * width;
      const digit = shown(recipe, column.key, column.digit, { withoutUnit: true });
      return `<g class="mps-place-column" data-place="${column.key}">
        <rect x="${x}" y="${headerY}" width="${width}" height="${headerHeight}" class="mps-model__header-cell" fill="none" stroke="currentColor" />
        <rect x="${x}" y="${valueY}" width="${width}" height="${valueHeight}" class="mps-model__value-cell" fill="none" stroke="currentColor" />
        ${svgText(x + width / 2, headerY + headerHeight * 0.62, column.label, fontClass)}
        ${svgText(x + width / 2, valueY + valueHeight * 0.66, digit || " ", "mps-model__digit")}
      </g>`;
    }).join("");
    const numberLabel = recipe.completionState === "blank" ? "" : shown(recipe, "number", recipe.values.number);
    return `${chart}${numberLabel ? svgText(box.width / 2, box.height - 14, numberLabel, "mps-model__caption") : ""}`;
  });
}

function baseTenGlyph(column, x, y, size) {
  if (column.key === "ones") {
    return `<circle cx="${x + size / 2}" cy="${y + size / 2}" r="${size * 0.22}" class="mps-model__block" fill="none" stroke="currentColor" />`;
  }
  if (column.key === "tens") {
    const lines = Array.from({ length: 4 }, (_, index) => `<line x1="${x + size * 0.37}" y1="${y + size * (0.2 + index * 0.15)}" x2="${x + size * 0.63}" y2="${y + size * (0.2 + index * 0.15)}" stroke="currentColor" opacity=".45" />`).join("");
    return `<rect x="${x + size * 0.35}" y="${y + size * 0.1}" width="${size * 0.3}" height="${size * 0.8}" class="mps-model__block" fill="none" stroke="currentColor" />${lines}`;
  }
  if (column.key === "hundreds") {
    return `<rect x="${x + size * 0.13}" y="${y + size * 0.13}" width="${size * 0.74}" height="${size * 0.74}" class="mps-model__block" fill="url(#base-placeholder)" stroke="currentColor" />
      <line x1="${x + size * 0.38}" y1="${y + size * 0.13}" x2="${x + size * 0.38}" y2="${y + size * 0.87}" stroke="currentColor" opacity=".35" />
      <line x1="${x + size * 0.63}" y1="${y + size * 0.13}" x2="${x + size * 0.63}" y2="${y + size * 0.87}" stroke="currentColor" opacity=".35" />
      <line x1="${x + size * 0.13}" y1="${y + size * 0.38}" x2="${x + size * 0.87}" y2="${y + size * 0.38}" stroke="currentColor" opacity=".35" />
      <line x1="${x + size * 0.13}" y1="${y + size * 0.63}" x2="${x + size * 0.87}" y2="${y + size * 0.63}" stroke="currentColor" opacity=".35" />`;
  }
  return `<path d="M ${x + size * 0.18} ${y + size * 0.3} L ${x + size * 0.66} ${y + size * 0.18} L ${x + size * 0.84} ${y + size * 0.36} L ${x + size * 0.36} ${y + size * 0.5} Z M ${x + size * 0.18} ${y + size * 0.3} L ${x + size * 0.18} ${y + size * 0.72} L ${x + size * 0.36} ${y + size * 0.86} L ${x + size * 0.36} ${y + size * 0.5} M ${x + size * 0.36} ${y + size * 0.86} L ${x + size * 0.84} ${y + size * 0.72} L ${x + size * 0.84} ${y + size * 0.36}" class="mps-model__block" fill="none" stroke="currentColor" />`;
}

function renderBaseTen(recipe, definition) {
  return svgFrame(recipe, definition, (id, box) => {
    const columns = recipe.values.columns;
    const margin = 16;
    const columnWidth = (box.width - margin * 2) / columns.length;
    const availableHeight = box.height - 62;
    const iconSize = Math.min(34, columnWidth / 3.1, availableHeight / 3.2);
    const groups = columns.map((column, columnIndex) => {
      const x0 = margin + columnIndex * columnWidth;
      const reveal = visible(recipe, column.key);
      const count = reveal ? column.digit : 0;
      const icons = Array.from({ length: count }, (_, index) => {
        const x = x0 + (index % 3) * iconSize + (columnWidth - iconSize * 3) / 2;
        const y = 40 + Math.floor(index / 3) * iconSize;
        return baseTenGlyph(column, x, y, iconSize);
      }).join("");
      const placeholder = !reveal ? `<rect x="${x0 + columnWidth * 0.25}" y="${box.height * 0.42}" width="${columnWidth * 0.5}" height="${box.height * 0.22}" rx="5" fill="none" stroke="currentColor" stroke-dasharray="5 4" opacity=".5" />` : "";
      return `<g data-place="${column.key}">
        ${svgText(x0 + columnWidth / 2, 24, column.label, "mps-model__label")}
        ${icons}${placeholder}
        ${reveal ? svgText(x0 + columnWidth / 2, box.height - 12, `× ${column.digit}`, "mps-model__count") : ""}
      </g>`;
    }).join("");
    return `<defs><pattern id="base-placeholder" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 0L6 6M6 0L0 6" stroke="currentColor" stroke-width=".5" opacity=".18" /></pattern></defs>
      ${groups}
      <line x1="${margin}" y1="32" x2="${box.width - margin}" y2="32" stroke="currentColor" opacity=".25" />`;
  });
}

function renderPartitioning(recipe, definition) {
  return svgFrame(recipe, definition, (_id, box) => {
    const parts = recipe.values.parts;
    const margin = 25;
    const wholeWidth = Math.min(box.width * 0.46, 260);
    const wholeX = (box.width - wholeWidth) / 2;
    const wholeY = 20;
    const wholeH = 46;
    const branchY = 96;
    const gap = 8;
    const partWidth = (box.width - margin * 2 - gap * (parts.length - 1)) / parts.length;
    const partY = box.height - 70;
    const partH = 45;
    const whole = shown(recipe, "whole", recipe.values.whole);
    const partBoxes = parts.map((part, index) => {
      const x = margin + index * (partWidth + gap);
      const token = `part:${index}`;
      const value = shown(recipe, token, part);
      return `<line x1="${box.width / 2}" y1="${branchY}" x2="${x + partWidth / 2}" y2="${partY}" stroke="currentColor" opacity=".55" />
        <rect x="${x}" y="${partY}" width="${partWidth}" height="${partH}" rx="5" fill="none" stroke="currentColor" />
        ${svgText(x + partWidth / 2, partY + 29, value || " ", "mps-model__value")}`;
    }).join("");
    return `<rect x="${wholeX}" y="${wholeY}" width="${wholeWidth}" height="${wholeH}" rx="6" fill="none" stroke="currentColor" />
      ${svgText(box.width / 2, wholeY + 30, whole || " ", "mps-model__value")}
      <line x1="${box.width / 2}" y1="${wholeY + wholeH}" x2="${box.width / 2}" y2="${branchY}" stroke="currentColor" />
      ${partBoxes}`;
  });
}

function renderNumberLine(recipe, definition) {
  return svgFrame(recipe, definition, (_id, box) => {
    const margin = 48;
    const lineStart = margin;
    const lineEnd = box.width - margin;
    const y = box.height * 0.52;
    const points = recipe.values.points;
    const intervalWidth = (lineEnd - lineStart) / recipe.values.divisions;
    const ticks = points.map((point, index) => {
      const x = lineStart + intervalWidth * index;
      const endpoint = index === 0 || index === points.length - 1;
      const showLabel = recipe.variant !== "empty" && (recipe.completionState === "completed"
        || (recipe.completionState === "partly-completed" && (endpoint || (recipe.purpose !== "response-model" && recipe.values.divisions <= 10))));
      const label = showLabel ? shown(recipe, `point:${index}`, point) : "";
      return `<line x1="${x}" y1="${y - (endpoint ? 13 : 9)}" x2="${x}" y2="${y + (endpoint ? 13 : 9)}" stroke="currentColor" stroke-width="${endpoint ? 2 : 1}" />
        ${label ? svgText(x, y + 36, label, "mps-model__tick-label") : ""}`;
    }).join("");
    const markers = recipe.values.markers.map((marker, index) => {
      const x = lineStart + ((marker.value - recipe.values.start) / (recipe.values.end - recipe.values.start)) * (lineEnd - lineStart);
      const markerVisible = visible(recipe, `marker:${index}`);
      // A location task asks the pupil to choose the point, not to trace a
      // pre-positioned question mark.  Keep the scale completely blank in a
      // response model; teacher/answer output can reveal the marker normally.
      if (!markerVisible && recipe.purpose === "response-model") return "";
      if (!markerVisible && recipe.completionState !== "blank") return `<circle cx="${x}" cy="${y}" r="7" fill="white" stroke="currentColor" stroke-width="2" /><text x="${x}" y="${y - 18}" text-anchor="middle" class="mps-model__unknown">?</text>`;
      if (!markerVisible) return "";
      return `<circle cx="${x}" cy="${y}" r="6" fill="currentColor" />${svgText(x, y - 18, marker.label, "mps-model__marker-label")}`;
    }).join("");
    return `<line x1="${lineStart}" y1="${y}" x2="${lineEnd}" y2="${y}" stroke="currentColor" stroke-width="2" />
      <path d="M ${lineEnd} ${y} l -10 -6 v 12 z" fill="currentColor" />
      ${ticks}${markers}`;
  }, { box: WIDE_SIZE_BOXES[recipe.size] ?? WIDE_SIZE_BOXES.standard });
}

function renderPartWhole(recipe, definition) {
  return svgFrame(recipe, definition, (id, box) => {
    const margin = 42;
    const x = margin;
    const width = box.width - margin * 2;
    const wholeY = 24;
    const partY = box.height * 0.56;
    const height = 52;
    const whole = shown(recipe, "whole", recipe.values.whole);
    let cursor = x;
    const partRects = recipe.values.parts.map((part, index) => {
      const partWidth = width * (part / recipe.values.whole);
      const token = `part:${index}`;
      const label = recipe.labels.parts?.[index] ?? "";
      const value = shown(recipe, token, part);
      const centre = cursor + partWidth / 2;
      const result = `<rect x="${cursor}" y="${partY}" width="${partWidth}" height="${height}" data-part-index="${index}" fill="${index % 2 ? `url(#${id}-hatch)` : "none"}" stroke="currentColor" />
        ${svgText(centre, partY + 31, value || " ", "mps-model__value")}
        ${label ? svgText(centre, partY + height + 18, label, "mps-model__label") : ""}`;
      cursor += partWidth;
      return result;
    }).join("");
    return `<rect x="${x}" y="${wholeY}" width="${width}" height="${height}" rx="4" fill="none" stroke="currentColor" stroke-width="2" />
      ${svgText(box.width / 2, wholeY + 31, whole || " ", "mps-model__value")}
      ${partRects}`;
  });
}

function renderComparison(recipe, definition) {
  return svgFrame(recipe, definition, (id, box) => {
    const labelWidth = 86;
    const x = labelWidth + 14;
    const maxWidth = box.width - x - 38;
    const greaterWidth = maxWidth;
    const lesserWidth = maxWidth * (recipe.values.lesser / recipe.values.greater);
    const y1 = 42;
    const y2 = box.height * 0.53;
    const h = 45;
    const greater = shown(recipe, "greater", recipe.values.greater);
    const lesser = shown(recipe, "lesser", recipe.values.lesser);
    const difference = shown(recipe, "difference", recipe.values.difference);
    const greaterLabel = recipe.labels.greater ?? "Greater";
    const lesserLabel = recipe.labels.lesser ?? "Lesser";
    return `${svgText(x - 10, y1 + 28, greaterLabel, "mps-model__label", "end")}
      <rect x="${x}" y="${y1}" width="${greaterWidth}" height="${h}" fill="none" stroke="currentColor" stroke-width="2" />
      ${svgText(x + greaterWidth / 2, y1 + 29, greater || " ", "mps-model__value")}
      ${svgText(x - 10, y2 + 28, lesserLabel, "mps-model__label", "end")}
      <rect x="${x}" y="${y2}" width="${lesserWidth}" height="${h}" fill="url(#${id}-hatch)" stroke="currentColor" stroke-width="2" />
      ${svgText(x + lesserWidth / 2, y2 + 29, lesser || " ", "mps-model__value")}
      <path d="M ${x + lesserWidth} ${y2 + h + 9} v 10 H ${x + greaterWidth} v -10" fill="none" stroke="currentColor" />
      ${difference ? svgText(x + lesserWidth + (greaterWidth - lesserWidth) / 2, y2 + h + 36, difference, "mps-model__difference") : ""}`;
  });
}

function renderEqualGroupsAsArray(recipe, box) {
  const rows = recipe.values.groups;
  const columns = recipe.values.groupSize;
  const marginX = 55;
  const marginY = 30;
  const areaW = box.width - marginX * 2;
  const areaH = box.height - marginY * 2;
  const cellW = areaW / columns;
  const cellH = areaH / rows;
  const radius = Math.max(1.6, Math.min(8, cellW * 0.24, cellH * 0.24));
  const dots = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const showDot = recipe.completionState === "completed" || (recipe.completionState === "partly-completed" && !unknownMatches(recipe, "groupSize") && !unknownMatches(recipe, "groups"));
      if (showDot) dots.push(`<circle cx="${marginX + cellW * (column + 0.5)}" cy="${marginY + cellH * (row + 0.5)}" r="${radius}" fill="currentColor" />`);
      else dots.push(`<circle cx="${marginX + cellW * (column + 0.5)}" cy="${marginY + cellH * (row + 0.5)}" r="${radius}" fill="none" stroke="currentColor" opacity=".35" />`);
    }
  }
  return `<rect x="${marginX}" y="${marginY}" width="${areaW}" height="${areaH}" rx="5" fill="none" stroke="currentColor" />${dots.join("")}`;
}

function renderEqualGroupsContainers(recipe, box) {
  const groups = recipe.values.groups;
  const groupSize = recipe.values.groupSize;
  const columns = Math.min(4, groups);
  const rows = Math.ceil(groups / columns);
  const gap = 10;
  const marginX = 20;
  const marginY = 20;
  const groupWidth = (box.width - marginX * 2 - gap * (columns - 1)) / columns;
  const groupHeight = (box.height - marginY * 2 - gap * (rows - 1)) / rows;
  return Array.from({ length: groups }, (_, groupIndex) => {
    const column = groupIndex % columns;
    const row = Math.floor(groupIndex / columns);
    const x = marginX + column * (groupWidth + gap);
    const y = marginY + row * (groupHeight + gap);
    const dotColumns = Math.ceil(Math.sqrt(groupSize));
    const dotRows = Math.ceil(groupSize / dotColumns);
    const cellW = (groupWidth - 12) / dotColumns;
    const cellH = (groupHeight - 12) / dotRows;
    const radius = Math.max(1.4, Math.min(6, cellW * 0.22, cellH * 0.22));
    const showGroup = recipe.completionState === "completed" || (recipe.completionState === "partly-completed" && !unknownMatches(recipe, "groupSize"));
    const dots = Array.from({ length: groupSize }, (_, itemIndex) => {
      const dotX = x + 6 + cellW * (itemIndex % dotColumns + 0.5);
      const dotY = y + 6 + cellH * (Math.floor(itemIndex / dotColumns) + 0.5);
      return `<circle cx="${dotX}" cy="${dotY}" r="${radius}" fill="${showGroup ? "currentColor" : "none"}" stroke="currentColor" opacity="${showGroup ? 1 : .35}" />`;
    }).join("");
    return `<rect x="${x}" y="${y}" width="${groupWidth}" height="${groupHeight}" rx="8" fill="none" stroke="currentColor" />${dots}`;
  }).join("");
}

function renderEqualGroups(recipe, definition) {
  return svgFrame(recipe, definition, (_id, box) => {
    const content = recipe.values.layout === "array" ? renderEqualGroupsAsArray(recipe, box) : renderEqualGroupsContainers(recipe, box);
    const total = shown(recipe, "total", recipe.values.total);
    return `${content}${total ? svgText(box.width - 12, box.height - 8, `Total: ${total}`, "mps-model__caption", "end") : ""}`;
  });
}

function placeHeading(indexFromRight) {
  return ["O", "T", "H", "Th", "TTh", "HTh", "M"][indexFromRight] ?? "";
}

function renderColumnArithmetic(recipe, definition) {
  const rowCount = recipe.values.operands.length + 2;
  const dynamicHeight = Math.max(SIZE_BOXES[recipe.size].height, 50 + rowCount * 38);
  return svgFrame(recipe, definition, (_id, box) => {
    const width = recipe.values.columnCount;
    const cell = Math.min(46, (box.width - 95) / width);
    const gridWidth = cell * width;
    const x0 = (box.width - gridWidth) / 2 + 12;
    const y0 = 34;
    const rowHeight = Math.min(42, (box.height - 48) / rowCount);
    const verticals = Array.from({ length: width + 1 }, (_, index) => `<line x1="${x0 + index * cell}" y1="${y0}" x2="${x0 + index * cell}" y2="${y0 + rowHeight * rowCount}" stroke="currentColor" opacity=".32" />`).join("");
    const horizontals = Array.from({ length: rowCount + 1 }, (_, index) => `<line x1="${x0}" y1="${y0 + index * rowHeight}" x2="${x0 + gridWidth}" y2="${y0 + index * rowHeight}" stroke="currentColor" opacity="${index === rowCount - 1 ? 1 : .32}" stroke-width="${index === rowCount - 1 ? 2 : 1}" />`).join("");
    const headings = Array.from({ length: width }, (_, index) => svgText(x0 + cell * (index + .5), y0 - 10, placeHeading(width - 1 - index), "mps-model__place-heading")).join("");
    const rows = recipe.values.digitRows.map((digits, rowIndex) => {
      const valuesVisible = recipe.completionState !== "blank" && !unknownMatches(recipe, `operand:${rowIndex}`);
      const digitText = digits.map((digit, columnIndex) => valuesVisible && digit.trim() ? svgText(x0 + cell * (columnIndex + .5), y0 + rowHeight * (rowIndex + .68), digit, "mps-model__digit") : "").join("");
      const sign = rowIndex === recipe.values.digitRows.length - 1 ? (recipe.values.operation === "addition" ? "+" : "−") : "";
      return `${sign ? svgText(x0 - 18, y0 + rowHeight * (rowIndex + .68), sign, "mps-model__operator") : ""}${digitText}`;
    }).join("");
    const resultRow = recipe.values.digitRows.length + 1;
    const resultVisible = recipe.completionState === "completed" && !unknownMatches(recipe, "result") && recipe.values.result !== null;
    const result = recipe.values.resultDigits.map((digit, columnIndex) => resultVisible && digit.trim() ? svgText(x0 + cell * (columnIndex + .5), y0 + rowHeight * (resultRow + .68), digit, "mps-model__digit mps-model__digit--result") : "").join("");
    return `${headings}${verticals}${horizontals}${rows}${result}`;
  }, { box: { width: SIZE_BOXES[recipe.size].width, height: dynamicHeight } });
}

function partitionBoundaries(parts = []) {
  let total = 0;
  return parts.slice(0, -1).map((part) => {
    total += Number(part);
    return total;
  });
}

function renderMultiplicationGrid(recipe, definition) {
  return svgFrame(recipe, definition, (id, box) => {
    const rows = recipe.values.rows;
    const columns = recipe.values.columns;
    const maxW = box.width - 110;
    const maxH = box.height - 72;
    const scale = Math.min(maxW / columns, maxH / rows);
    const width = scale * columns;
    const height = scale * rows;
    const x0 = (box.width - width) / 2;
    const y0 = 28;
    const fill = recipe.completionState === "completed" ? `url(#${id}-hatch)` : "none";
    const cells = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const partlyFilled = recipe.completionState === "partly-completed" && row < Math.ceil(rows / 2);
        cells.push(`<rect x="${x0 + column * scale}" y="${y0 + row * scale}" width="${scale}" height="${scale}" fill="${partlyFilled ? `url(#${id}-hatch)` : fill}" stroke="currentColor" stroke-width=".8" />`);
      }
    }
    const rowPartitions = partitionBoundaries(recipe.values.rowPartitions).map((boundary) => `<line x1="${x0}" y1="${y0 + boundary * scale}" x2="${x0 + width}" y2="${y0 + boundary * scale}" stroke="currentColor" stroke-width="3" />`).join("");
    const columnPartitions = partitionBoundaries(recipe.values.columnPartitions).map((boundary) => `<line x1="${x0 + boundary * scale}" y1="${y0}" x2="${x0 + boundary * scale}" y2="${y0 + height}" stroke="currentColor" stroke-width="3" />`).join("");
    const rowLabel = shown(recipe, "rows", rows, { withoutUnit: true });
    const columnLabel = shown(recipe, "columns", columns, { withoutUnit: true });
    const product = shown(recipe, "product", recipe.values.product);
    return `${cells.join("")}${rowPartitions}${columnPartitions}
      ${rowLabel ? svgText(x0 - 18, y0 + height / 2, rowLabel, "mps-model__dimension", "middle", `transform="rotate(-90 ${x0 - 18} ${y0 + height / 2})"`) : ""}
      ${columnLabel ? svgText(x0 + width / 2, y0 + height + 24, columnLabel, "mps-model__dimension") : ""}
      ${product ? svgText(box.width - 18, box.height - 14, `Product: ${product}`, "mps-model__caption", "end") : ""}`;
  });
}

function renderFractionStrip(recipe, definition) {
  const stripCount = recipe.values.fractions.length;
  const base = WIDE_SIZE_BOXES[recipe.size] ?? WIDE_SIZE_BOXES.standard;
  const height = Math.max(base.height, 50 + stripCount * 62);
  return svgFrame(recipe, definition, (id, box) => {
    const x0 = 60;
    const width = box.width - 120;
    const startY = 30;
    const stripHeight = Math.min(44, (box.height - 55) / stripCount);
    const gap = Math.max(12, (box.height - 55 - stripHeight * stripCount) / Math.max(1, stripCount - 1));
    return recipe.values.fractions.map((fraction, fractionIndex) => {
      const y = startY + fractionIndex * (stripHeight + gap);
      const partWidth = width / fraction.denominator;
      const numeratorToken = `fraction:${fractionIndex}:numerator`;
      const revealNumerator = recipe.completionState === "completed" || (recipe.completionState === "partly-completed" && !unknownMatches(recipe, numeratorToken));
      const parts = Array.from({ length: fraction.denominator }, (_, partIndex) => `<rect x="${x0 + partIndex * partWidth}" y="${y}" width="${partWidth}" height="${stripHeight}" fill="${revealNumerator && partIndex < fraction.numerator ? `url(#${id}-hatch)` : "none"}" stroke="currentColor" />`).join("");
      const label = revealNumerator ? (fraction.label || `${fraction.numerator}/${fraction.denominator}`) : "";
      return `<g data-equal-parts="${fraction.denominator}" data-whole="${escapeMarkup(fraction.whole)}">
        ${parts}
        ${label ? svgText(x0 - 12, y + stripHeight * .62, label, "mps-model__fraction-label", "end") : ""}
      </g>`;
    }).join("");
  }, { box: { width: base.width, height } });
}

export const MODEL_RENDERERS = Object.freeze({
  [MODEL_IDS.PLACE_VALUE]: renderPlaceValue,
  [MODEL_IDS.BASE_TEN]: renderBaseTen,
  [MODEL_IDS.PARTITIONING]: renderPartitioning,
  [MODEL_IDS.NUMBER_LINE]: renderNumberLine,
  [MODEL_IDS.PART_WHOLE]: renderPartWhole,
  [MODEL_IDS.COMPARISON]: renderComparison,
  [MODEL_IDS.EQUAL_GROUPS]: renderEqualGroups,
  [MODEL_IDS.COLUMN_ARITHMETIC]: renderColumnArithmetic,
  [MODEL_IDS.MULTIPLICATION_GRID]: renderMultiplicationGrid,
  [MODEL_IDS.FRACTION_STRIP]: renderFractionStrip,
});

/**
 * Returns a semantic, self-contained figure string. Unsafe relationships are
 * replaced by a clear non-mathematical safety message rather than a bad model.
 */
export function renderModel(input, options = {}) {
  const validation = validateRecipe(input, options);
  if (!validation.valid) return invalidModel(input?.family, validation.errors);
  const recipe = validation.normalizedRecipe;
  const definition = getModelDefinition(recipe.family);
  const legacyRenderer = MODEL_RENDERERS[recipe.family];
  // Build 1 recipes retain their original renderer. Build 2 models are
  // validated again by their declarative renderer, which keeps every new
  // diagram mathematically constrained even after a saved-project migration.
  return legacyRenderer
    ? legacyRenderer(recipe, definition, options)
    : renderBuild2Model(recipe, options);
}

export function renderModelPreview(input, options = {}) {
  return renderModel({ ...input, size: "compact" }, options);
}

export {
  escapeMarkup,
  renderBaseTen,
  renderColumnArithmetic,
  renderComparison,
  renderEqualGroups,
  renderFractionStrip,
  renderMultiplicationGrid,
  renderNumberLine,
  renderPartWhole,
  renderPartitioning,
  renderPlaceValue,
};
