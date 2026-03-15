export const SCHOOL_YEAR_ROLLOVER_MONTH_INDEX = 7; // August
export const SCHOOL_YEAR_CAREER_WINDOW_YEARS = 4;

// Sanity checks:
// - getCurrentSchoolYear(new Date("2026-03-14T12:00:00Z")) => "2025-2026"
// - getCurrentSchoolYear(new Date("2026-09-01T12:00:00Z")) => "2026-2027"

function cleanValue(value) {
  return String(value || "").trim();
}

function getCurrentSchoolYearEndYear(date = new Date()) {
  const currentYear = date.getFullYear();
  return date.getMonth() >= SCHOOL_YEAR_ROLLOVER_MONTH_INDEX ? currentYear + 1 : currentYear;
}

function expandTwoDigitYear(value, maxYear = getCurrentSchoolYearEndYear(new Date()) + 1) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) {
    return null;
  }

  let year = 2000 + numeric;
  while (year > maxYear) {
    year -= 100;
  }
  return year;
}

function resolveStartYear(part, endPart = "") {
  const raw = cleanValue(part);
  if (!raw) {
    return null;
  }

  if (raw.length === 4) {
    const year = Number(raw);
    return Number.isInteger(year) ? year : null;
  }

  if (raw.length === 2) {
    const endRaw = cleanValue(endPart);
    if (endRaw.length === 4) {
      const fullEndYear = Number(endRaw);
      return Number.isInteger(fullEndYear) ? fullEndYear - 1 : null;
    }

    return expandTwoDigitYear(raw);
  }

  return null;
}

function resolveEndYear(part, startYear) {
  const raw = cleanValue(part);
  if (!raw || !Number.isInteger(startYear)) {
    return null;
  }

  if (raw.length === 4) {
    const year = Number(raw);
    return Number.isInteger(year) ? year : null;
  }

  if (raw.length === 2) {
    const expectedEndYear = startYear + 1;
    const expectedSuffix = String(expectedEndYear).slice(-2);
    if (raw === expectedSuffix) {
      return expectedEndYear;
    }

    return expandTwoDigitYear(raw, expectedEndYear + 1);
  }

  return null;
}

export function formatSchoolYear(startYear, endYear = startYear + 1) {
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear)) {
    return "";
  }

  return `${startYear}-${endYear}`;
}

export function parseSchoolYearLabel(value) {
  const season = cleanValue(value);
  if (!season) {
    return null;
  }

  const singleYearMatch = season.match(/^(19|20)\d{2}$/);
  if (singleYearMatch) {
    const startYear = Number(season);
    return {
      startYear,
      endYear: startYear + 1,
      canonical: formatSchoolYear(startYear),
      shortLabel: `${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)}`,
    };
  }

  const seasonMatch = season.match(/^(\d{2,4})\s*[-/]\s*(\d{2,4})$/);
  if (!seasonMatch) {
    return null;
  }

  const startYear = resolveStartYear(seasonMatch[1], seasonMatch[2]);
  const endYear = resolveEndYear(seasonMatch[2], startYear);

  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || endYear !== startYear + 1) {
    return null;
  }

  return {
    startYear,
    endYear,
    canonical: formatSchoolYear(startYear, endYear),
    shortLabel: `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`,
  };
}

export function normalizeSchoolYearLabel(value) {
  const parsed = parseSchoolYearLabel(value);
  return parsed?.canonical || cleanValue(value);
}

export function schoolYearSortValue(value) {
  const parsed = parseSchoolYearLabel(value);
  return parsed?.startYear || 0;
}

export function compareSchoolYearsDesc(left, right) {
  return schoolYearSortValue(right) - schoolYearSortValue(left);
}

export function getCurrentSchoolYear(date = new Date()) {
  const currentYear = date.getFullYear();
  const startYear = date.getMonth() >= SCHOOL_YEAR_ROLLOVER_MONTH_INDEX ? currentYear : currentYear - 1;
  return formatSchoolYear(startYear, startYear + 1);
}

export function isSameSchoolYear(left, right) {
  const leftParsed = parseSchoolYearLabel(left);
  const rightParsed = parseSchoolYearLabel(right);
  if (!leftParsed || !rightParsed) {
    return cleanValue(left) === cleanValue(right);
  }

  return leftParsed.startYear === rightParsed.startYear && leftParsed.endYear === rightParsed.endYear;
}

export function isSchoolYearWithinWindow(value, endSchoolYear, spanYears = SCHOOL_YEAR_CAREER_WINDOW_YEARS) {
  const parsed = parseSchoolYearLabel(value);
  const parsedEnd = parseSchoolYearLabel(endSchoolYear);

  if (!parsed || !parsedEnd) {
    return false;
  }

  const earliestStartYear = parsedEnd.startYear - Math.max(0, spanYears - 1);
  return parsed.startYear >= earliestStartYear && parsed.startYear <= parsedEnd.startYear;
}
