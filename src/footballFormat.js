export const FOOTBALL_FAMILY_SLUG = "football";
export const FOOTBALL_FORMAT_UNKNOWN = "unknown";

export const FOOTBALL_FORMAT_OPTIONS = Object.freeze([
  { value: "11-man", label: "11-Man" },
  { value: "8-man", label: "8-Man" },
  { value: "6-man", label: "6-Man" },
  { value: FOOTBALL_FORMAT_UNKNOWN, label: "Unknown / Not Sure" },
]);

function cleanValue(value) {
  return String(value || "").trim().toLowerCase();
}

export function isFootballSportValue(value) {
  return cleanValue(value).includes(FOOTBALL_FAMILY_SLUG);
}

export function normalizeFootballFormat(value, { allowBlank = false } = {}) {
  const normalized = cleanValue(value);

  if (!normalized) {
    return allowBlank ? "" : FOOTBALL_FORMAT_UNKNOWN;
  }

  if (["11", "11man", "11-man", "11 man"].includes(normalized)) {
    return "11-man";
  }

  if (["8", "8man", "8-man", "8 man"].includes(normalized)) {
    return "8-man";
  }

  if (["6", "6man", "6-man", "6 man"].includes(normalized)) {
    return "6-man";
  }

  if (
    [
      FOOTBALL_FORMAT_UNKNOWN,
      "not sure",
      "not-sure",
      "not_sure",
      "unsure",
      "unknown / not sure",
    ].includes(normalized)
  ) {
    return FOOTBALL_FORMAT_UNKNOWN;
  }

  return allowBlank ? "" : FOOTBALL_FORMAT_UNKNOWN;
}

export function resolveFootballFormatForSport(sportValue, formatValue, { allowBlank = false } = {}) {
  if (!isFootballSportValue(sportValue)) {
    return null;
  }

  return normalizeFootballFormat(formatValue, { allowBlank });
}

export function footballFormatLabel(value) {
  const normalized = normalizeFootballFormat(value);
  const match = FOOTBALL_FORMAT_OPTIONS.find((option) => option.value === normalized);
  return match?.label || "Unknown / Not Sure";
}

export function populateFootballFormatSelect(
  select,
  {
    includeBlank = true,
    blankLabel = "Select football format",
    includeAll = false,
    allLabel = "All Football Formats",
  } = {}
) {
  if (!select) {
    return;
  }

  const options = [];

  if (includeBlank) {
    options.push({ value: "", label: blankLabel });
  } else if (includeAll) {
    options.push({ value: "", label: allLabel });
  }

  FOOTBALL_FORMAT_OPTIONS.forEach((option) => {
    options.push(option);
  });

  const previousValue = select.value;
  select.innerHTML = options
    .map((option) => `<option value="${option.value}">${option.label}</option>`)
    .join("");

  if (previousValue && options.some((option) => option.value === previousValue)) {
    select.value = previousValue;
  }
}
