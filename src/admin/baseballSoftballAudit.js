import { calculateRenderedRecordSummary } from "../components/renderRecords.js";
import { inspectBaseballSoftballHistoricalRows } from "../baseballSoftballHistoricalNormalizer.js";
import { normalizeRecordSportContext } from "../sportContext.js";
import { supabase } from "../supabaseClient.js";

const RAW_SELECT_BASE = "id, school_id, school, sport, season, stat_row";
const RAW_SELECT_EXTENDED = `${RAW_SELECT_BASE}, source_url, history_url`;
const PAGE_SIZE = 1000;
const CANONICAL_SPORT_LABELS = new Set(["baseball", "boys baseball", "softball", "girls softball"]);

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeToken(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSchoolLookupMap(schools) {
  const map = new Map();

  (schools || []).forEach((school) => {
    const id = cleanText(school?.id);
    if (!id) {
      return;
    }

    map.set(id, {
      fullName: cleanText(school?.full_name),
      shortName: cleanText(school?.short_name),
    });
  });

  return map;
}

function hasSchoolMismatch(row, schoolsById) {
  const schoolId = cleanText(row?.school_id);
  const schoolLabel = normalizeToken(row?.school);
  if (!schoolId || !schoolLabel || !schoolsById.has(schoolId)) {
    return false;
  }

  const school = schoolsById.get(schoolId);
  const candidates = [
    schoolId,
    normalizeToken(school.fullName),
    normalizeToken(school.shortName),
  ].filter(Boolean);

  return !candidates.some((candidate) => schoolLabel === candidate || schoolLabel.includes(candidate));
}

async function fetchPagedRows(selectColumns) {
  const rows = [];
  let start = 0;

  while (true) {
    const { data, error } = await supabase
      .from("raw_stat_rows")
      .select(selectColumns)
      .or("sport.ilike.%baseball%,sport.ilike.%softball%")
      .order("id", { ascending: true })
      .range(start, start + PAGE_SIZE - 1);

    if (error) {
      return { data: null, error };
    }

    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) {
      break;
    }

    start += PAGE_SIZE;
  }

  return { data: rows, error: null };
}

async function fetchDiamondRawRows() {
  const extended = await fetchPagedRows(RAW_SELECT_EXTENDED);
  if (!extended.error) {
    return extended.data || [];
  }

  const message = `${extended.error?.message || ""} ${extended.error?.details || ""}`.toLowerCase();
  if (!message.includes("source_url") && !message.includes("history_url")) {
    throw extended.error;
  }

  const fallback = await fetchPagedRows(RAW_SELECT_BASE);
  if (fallback.error) {
    throw fallback.error;
  }

  return (fallback.data || []).map((row) => ({
    ...row,
    history_url: null,
    source_url: null,
  }));
}

async function fetchSchools() {
  const { data, error } = await supabase
    .from("schools")
    .select("id, full_name, short_name");

  if (error) {
    throw error;
  }

  return data || [];
}

function buildSportCounts(rows) {
  return {
    baseball: rows.filter((row) => row.sport === "baseball").length,
    softball: rows.filter((row) => row.sport === "softball").length,
    total: rows.length,
  };
}

export async function runBaseballSoftballAudit() {
  const [rawRows, schools] = await Promise.all([fetchDiamondRawRows(), fetchSchools()]);
  const normalizedRows = rawRows
    .map((row) => ({
      ...normalizeRecordSportContext(row),
      _rawSport: cleanText(row?.sport),
    }))
    .filter((row) => row.sport === "baseball" || row.sport === "softball");

  const schoolsById = buildSchoolLookupMap(schools);
  const analysis = inspectBaseballSoftballHistoricalRows(normalizedRows);
  const audit = analysis.audit || {};
  const driftCounts = new Map();
  let schoolMismatches = 0;

  normalizedRows.forEach((row) => {
    if (hasSchoolMismatch(row, schoolsById)) {
      schoolMismatches += 1;
    }

    const rawLabel = normalizeToken(row._rawSport);
    if (!CANONICAL_SPORT_LABELS.has(rawLabel)) {
      driftCounts.set(row._rawSport || "(blank)", (driftCounts.get(row._rawSport || "(blank)") || 0) + 1);
    }
  });

  const mergedRows = analysis.mergedRows || [];
  const baseballRows = mergedRows.filter((row) => row.sport === "baseball");
  const softballRows = mergedRows.filter((row) => row.sport === "softball");
  const totalRendered = calculateRenderedRecordSummary(mergedRows, { statsView: "season" });
  const baseballRendered = calculateRenderedRecordSummary(baseballRows, { statsView: "season" });
  const softballRendered = calculateRenderedRecordSummary(softballRows, { statsView: "season" });

  return {
    counts: {
      mergedPlayerSeasons: {
        baseball: Number(audit.mergedPlayerSeasons?.baseball || 0),
        softball: Number(audit.mergedPlayerSeasons?.softball || 0),
        total:
          Number(audit.mergedPlayerSeasons?.baseball || 0) +
          Number(audit.mergedPlayerSeasons?.softball || 0),
      },
      publicRendered: {
        baseball: baseballRendered.renderedCount,
        softball: softballRendered.renderedCount,
        total: totalRendered.renderedCount,
      },
      rawHistorical: {
        baseball: Number(audit.rawHistoricalRows?.baseball || 0),
        softball: Number(audit.rawHistoricalRows?.softball || 0),
        total:
          Number(audit.rawHistoricalRows?.baseball || 0) +
          Number(audit.rawHistoricalRows?.softball || 0),
      },
      rawVisible: buildSportCounts(normalizedRows),
    },
    driftExamples: Array.from(driftCounts.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 6)
      .map(([label, count]) => ({ label, count })),
    issues: {
      blankAthleteNames: Number(audit.blankAthleteNames || 0),
      duplicateFamilyPayloadGroups: Number(audit.duplicateFamilyPayloadGroups || 0),
      impossibleBattingRows: Number(audit.impossibleBattingRows || 0),
      impossiblePitchingRows: Number(audit.impossiblePitchingRows || 0),
      malformedRows: Number(audit.malformedRows || 0),
      schoolMismatches,
      sportDriftRows: Array.from(driftCounts.values()).reduce((sum, count) => sum + count, 0),
      unknownFamilyRows: Number(audit.unknownFamilyRows || 0),
      zeroOnlyRows: Number(audit.zeroOnlyRows || 0),
    },
  };
}
