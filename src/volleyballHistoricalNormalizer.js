import { buildSportContextKey, normalizeRecordSportContext, resolveSportContext } from "./sportContext.js";

const CLASS_SUFFIX_PATTERN = /\s*\((fr|so|jr|sr)\)\s*$/i;
const ATHLETE_NAME_KEYS = [
  "Athlete Full Name",
  "athlete_full_name",
  "Full Name",
  "full_name",
  "Player Name",
  "player_name",
  "Player",
  "player",
  "Athlete",
  "athlete",
  "Athlete Name",
  "athlete_name",
  "Name",
  "name",
];
const GENERAL_FIELD_CONFIG = [
  { key: "GP", aliases: ["GP", "Games Played", "Matches Played", "Matches", "MP"] },
];
const CATEGORY_CONFIGS = buildCategoryConfigs({
  hitting: {
    fields: [
      { key: "K", aliases: ["K", "Kills"] },
      { key: "E", aliases: ["E", "Errors", "Attack Errors", "Hitting Errors"] },
      { key: "Att", aliases: ["Att", "Attempts", "Attack Attempts"] },
      { key: "K/S", aliases: ["K/S", "Kills Per Set"] },
      { key: "Kill %", aliases: ["Kill %", "Kill Pct", "Kill Percentage"] },
      { key: "Hit %", aliases: ["Hit %", "Hit Pct", "Hitting Pct", "Hitting Percentage"] },
    ],
  },
  serving: {
    fields: [
      { key: "A", aliases: ["A", "Ace", "Aces"] },
      { key: "SA", aliases: ["SA", "Serve Attempts", "Service Attempts"] },
      { key: "SE", aliases: ["SE", "Serve Errors", "Service Errors"] },
      { key: "PTS", aliases: ["PTS", "Points", "Service Points"] },
      { key: "Ace %", aliases: ["Ace %", "Ace Pct", "Ace Percentage"] },
      { key: "Serv %", aliases: ["Serv %", "Serve %", "Serve Pct", "Service Percentage"] },
      { key: "A/S", aliases: ["A/S", "Aces Per Set"] },
    ],
  },
  assists: {
    fields: [
      { key: "Ast", aliases: ["Ast", "Assists"] },
      { key: "Ast/S", aliases: ["Ast/S", "Assists Per Set"] },
      { key: "BHA", aliases: ["BHA", "Ball Handling Attempts"] },
      { key: "BHE", aliases: ["BHE", "Ball Handling Errors"] },
    ],
  },
  digs: {
    fields: [
      { key: "D", aliases: ["D", "Dig", "Digs"] },
      { key: "DE", aliases: ["DE", "Dig Errors"] },
      { key: "D/M", aliases: ["D/M", "Digs Per Match"] },
      { key: "D/S", aliases: ["D/S", "Digs Per Set"] },
    ],
  },
  blocking: {
    fields: [
      { key: "BA", aliases: ["BA", "Block Assists"] },
      { key: "BE", aliases: ["BE", "Block Errors"] },
      { key: "BS", aliases: ["BS", "Block Solos", "Solo Blocks"] },
      { key: "Tot Blks", aliases: ["Tot Blks", "Tot Blk", "Total Blocks"] },
      { key: "B/M", aliases: ["B/M", "Blocks Per Match"] },
      { key: "B/S", aliases: ["B/S", "Blocks Per Set"] },
    ],
  },
  receiving: {
    fields: [
      { key: "R", aliases: ["R", "Receives", "Reception Attempts"] },
      { key: "RE", aliases: ["RE", "Reception Errors", "Receive Errors"] },
      { key: "R/M", aliases: ["R/M", "Receives Per Match"] },
      { key: "R/S", aliases: ["R/S", "Receives Per Set"] },
    ],
  },
});
const CATEGORY_ORDER = Object.freeze(["hitting", "serving", "assists", "digs", "blocking", "receiving"]);
const VOLLEYBALL_DATA_ORIGIN = "historical_season_summary";

function buildCategoryConfigs(configs) {
  return Object.fromEntries(
    Object.entries(configs).map(([category, config]) => [
      category,
      {
        ...config,
        fields: (config.fields || []).map((field) => ({
          ...field,
          normalizedAliases: [field.key, ...(field.aliases || [])].map(normalizeHeaderToken),
        })),
      },
    ])
  );
}

function normalizeHeaderToken(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/%/g, " PCT ")
    .replace(/\//g, " PER ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeIdentityToken(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function cleanAthleteName(value) {
  return normalizeText(value).replace(CLASS_SUFFIX_PATTERN, "").trim();
}

function firstPresentValue(source, keys) {
  if (!source || typeof source !== "object") {
    return "";
  }

  for (const key of keys) {
    const value = normalizeText(source[key]);
    if (value) {
      return value;
    }
  }

  return "";
}

function extractAthleteName(statRow) {
  return cleanAthleteName(firstPresentValue(statRow, ATHLETE_NAME_KEYS));
}

function getHeaderValue(statRow, normalizedAliases) {
  if (!statRow || typeof statRow !== "object") {
    return "";
  }

  for (const [key, value] of Object.entries(statRow)) {
    if (value === null || value === undefined || String(value).trim() === "") {
      continue;
    }

    if (normalizedAliases.includes(normalizeHeaderToken(key))) {
      return value;
    }
  }

  return "";
}

function normalizeStatValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value).trim().replace(/,/g, "");
  if (!text) {
    return "";
  }

  const numeric = Number(text);
  if (!Number.isNaN(numeric)) {
    return numeric;
  }

  const decimal = Number(text.replace(/^\./, "0."));
  if (!Number.isNaN(decimal)) {
    return decimal;
  }

  return String(value).trim();
}

function parseNumericValue(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : Number.NaN;
  }

  const normalized = normalizeStatValue(value);
  return typeof normalized === "number" ? normalized : Number.NaN;
}

function hasMeaningfulValue(value) {
  return !["", null, undefined].includes(value);
}

function normalizeGeneralStats(statRow) {
  const normalized = {};

  GENERAL_FIELD_CONFIG.forEach((field) => {
    const value = normalizeStatValue(getHeaderValue(statRow, field.aliases.map(normalizeHeaderToken)));
    if (hasMeaningfulValue(value)) {
      normalized[field.key] = value;
    }
  });

  return normalized;
}

function detectVolleyballCategory(statRow) {
  if (!statRow || typeof statRow !== "object") {
    return "";
  }

  const categoryMatches = CATEGORY_ORDER
    .map((category) => {
      const fields = CATEGORY_CONFIGS[category]?.fields || [];
      const matchedFields = fields.filter((field) =>
        hasMeaningfulValue(getHeaderValue(statRow, field.normalizedAliases))
      );

      return {
        category,
        score: matchedFields.length,
      };
    })
    .filter((entry) => entry.score > 0);

  if (categoryMatches.length !== 1) {
    return "";
  }

  return categoryMatches[0].category;
}

function normalizeCategoryPayload(statRow, category) {
  const payload = {};
  const config = CATEGORY_CONFIGS[category];

  if (!config) {
    return payload;
  }

  config.fields.forEach((field) => {
    const value = normalizeStatValue(getHeaderValue(statRow, field.normalizedAliases));
    if (hasMeaningfulValue(value)) {
      payload[field.key] = value;
    }
  });

  return payload;
}

function buildPayloadSignature(payload, generalStats) {
  const combined = Object.entries({
    ...generalStats,
    ...payload,
  })
    .filter(([, value]) => hasMeaningfulValue(value))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => [key, typeof value === "number" ? value : normalizeIdentityToken(value)]);

  return JSON.stringify(combined);
}

function isZeroOnlyRow(categoryPayload, generalStats) {
  const numericValues = [...Object.values(generalStats), ...Object.values(categoryPayload)]
    .map(parseNumericValue)
    .filter((value) => !Number.isNaN(value));

  if (!numericValues.length) {
    return true;
  }

  return numericValues.every((value) => value === 0);
}

function valuesEquivalent(left, right) {
  if (typeof left === "number" || typeof right === "number") {
    return parseNumericValue(left) === parseNumericValue(right);
  }

  return normalizeIdentityToken(left) === normalizeIdentityToken(right);
}

function mergeGeneralStats(target, source) {
  Object.entries(source || {}).forEach(([key, value]) => {
    if (!hasMeaningfulValue(value)) {
      return;
    }

    if (!Object.prototype.hasOwnProperty.call(target, key)) {
      target[key] = value;
      return;
    }

    const existingNumeric = parseNumericValue(target[key]);
    const incomingNumeric = parseNumericValue(value);

    if (!Number.isNaN(existingNumeric) && !Number.isNaN(incomingNumeric)) {
      target[key] = Math.max(existingNumeric, incomingNumeric);
      return;
    }

    if (!target[key]) {
      target[key] = value;
    }
  });
}

function mergeCategoryStats(entries) {
  const merged = {};
  const conflicts = {};
  const orderedEntries = [...entries].sort((left, right) => {
    if (right.payloadSize !== left.payloadSize) {
      return right.payloadSize - left.payloadSize;
    }

    return left.sourceIndex - right.sourceIndex;
  });

  orderedEntries.forEach((entry) => {
    Object.entries(entry.categoryPayload).forEach(([field, value]) => {
      if (!Object.prototype.hasOwnProperty.call(merged, field)) {
        merged[field] = value;
        return;
      }

      if (valuesEquivalent(merged[field], value)) {
        return;
      }

      if (!conflicts[field]) {
        conflicts[field] = [merged[field]];
      }

      if (!conflicts[field].some((existing) => valuesEquivalent(existing, value))) {
        conflicts[field].push(value);
      }
    });
  });

  return {
    conflicts,
    stats: merged,
  };
}

function deriveFlatBlockTotal(blockingStats = {}) {
  const explicitTotal = parseNumericValue(blockingStats["Tot Blks"]);
  if (!Number.isNaN(explicitTotal)) {
    return explicitTotal;
  }

  const blockAssists = parseNumericValue(blockingStats.BA);
  const blockSolos = parseNumericValue(blockingStats.BS);
  const total = (Number.isNaN(blockAssists) ? 0 : blockAssists) + (Number.isNaN(blockSolos) ? 0 : blockSolos);

  return total > 0 ? total : "";
}

function buildFlatVolleyballStats(categoryBuckets, generalStats) {
  const flat = {};

  if (hasMeaningfulValue(generalStats.GP)) {
    flat.GP = generalStats.GP;
  }

  if (hasMeaningfulValue(categoryBuckets.hitting?.stats?.K)) {
    flat.K = categoryBuckets.hitting.stats.K;
  }

  if (hasMeaningfulValue(categoryBuckets.digs?.stats?.D)) {
    flat.DIG = categoryBuckets.digs.stats.D;
  }

  if (hasMeaningfulValue(categoryBuckets.assists?.stats?.Ast)) {
    flat.AST = categoryBuckets.assists.stats.Ast;
  }

  if (hasMeaningfulValue(categoryBuckets.serving?.stats?.A)) {
    flat.ACE = categoryBuckets.serving.stats.A;
  }

  const blockTotal = deriveFlatBlockTotal(categoryBuckets.blocking?.stats);
  if (hasMeaningfulValue(blockTotal)) {
    flat.BLK = blockTotal;
  }

  return flat;
}

function buildMergedStatRow(group, categoryBuckets, flatStats) {
  const statRow = {
    "Athlete Name": group.displayName || "Unknown Athlete",
    School: group.school || "",
    Season: group.season || "",
  };

  Object.entries(group.generalStats || {}).forEach(([key, value]) => {
    if (hasMeaningfulValue(value)) {
      statRow[key] = value;
    }
  });

  CATEGORY_ORDER.forEach((category) => {
    Object.entries(categoryBuckets[category]?.stats || {}).forEach(([key, value]) => {
      if (hasMeaningfulValue(value)) {
        statRow[key] = value;
      }
    });
  });

  Object.entries(flatStats).forEach(([key, value]) => {
    if (hasMeaningfulValue(value)) {
      statRow[key] = value;
    }
  });

  return statRow;
}

function stripTemporaryFields(row) {
  if (!row || typeof row !== "object") {
    return row;
  }

  const { __sourceIndex, ...rest } = row;
  return rest;
}

export function normalizeHistoricalVolleyballRows(rows = []) {
  const passthrough = [];
  const candidateRows = [];

  (Array.isArray(rows) ? rows : []).forEach((inputRow, sourceIndex) => {
    const row = normalizeRecordSportContext(inputRow);
    const context = resolveSportContext(row?.sport, row?.gender);

    if (context.sportKey !== "volleyball" || row?.volleyball_historical_normalized) {
      passthrough.push({
        ...row,
        __sourceIndex: typeof row?.__sourceIndex === "number" ? row.__sourceIndex : sourceIndex,
      });
      return;
    }

    const statRow = row?.stat_row && typeof row.stat_row === "object" ? row.stat_row : {};
    const category = detectVolleyballCategory(statRow);

    if (!category) {
      passthrough.push({
        ...row,
        __sourceIndex: typeof row?.__sourceIndex === "number" ? row.__sourceIndex : sourceIndex,
      });
      return;
    }

    const athleteName = extractAthleteName(statRow) || "Unknown Athlete";
    const categoryPayload = normalizeCategoryPayload(statRow, category);
    const generalStats = normalizeGeneralStats(statRow);

    if (isZeroOnlyRow(categoryPayload, generalStats)) {
      return;
    }

    candidateRows.push({
      athleteKey: normalizeIdentityToken(athleteName) || "unknown athlete",
      athleteName,
      category,
      categoryPayload,
      generalStats,
      payloadSize: Object.keys(categoryPayload).length,
      row: {
        ...row,
        __sourceIndex: typeof row?.__sourceIndex === "number" ? row.__sourceIndex : sourceIndex,
      },
      sourceIndex: typeof row?.__sourceIndex === "number" ? row.__sourceIndex : sourceIndex,
    });
  });

  const dedupedMap = new Map();
  candidateRows.forEach((entry) => {
    const schoolKey = normalizeText(entry.row.school_id || entry.row.school || "unknown-school").toLowerCase();
    const seasonKey = normalizeText(entry.row.season || "unknown-season").toLowerCase();
    const sportKey = buildSportContextKey(entry.row.sport, entry.row.gender);
    const payloadSignature = buildPayloadSignature(entry.categoryPayload, entry.generalStats);
    const dedupeKey = [schoolKey, sportKey, seasonKey, entry.athleteKey, entry.category, payloadSignature].join("::");

    if (!dedupedMap.has(dedupeKey)) {
      dedupedMap.set(dedupeKey, entry);
    }
  });

  const grouped = new Map();
  Array.from(dedupedMap.values()).forEach((entry) => {
    const groupKey = [
      normalizeText(entry.row.school_id || entry.row.school || "unknown-school").toLowerCase(),
      buildSportContextKey(entry.row.sport, entry.row.gender),
      normalizeText(entry.row.season || "unknown-season").toLowerCase(),
      entry.athleteKey,
    ].join("::");

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        baseRow: entry.row,
        categoryEntries: new Map(),
        displayName: entry.athleteName,
        generalStats: {},
        school: entry.row.school || entry.row.stat_row?.School || "",
        school_id: entry.row.school_id || "",
        season: entry.row.season || entry.row.stat_row?.Season || "",
        sourceIndex: entry.sourceIndex,
      });
    }

    const group = grouped.get(groupKey);
    group.displayName = group.displayName || entry.athleteName;
    group.sourceIndex = Math.min(group.sourceIndex, entry.sourceIndex);
    mergeGeneralStats(group.generalStats, entry.generalStats);

    if (!group.categoryEntries.has(entry.category)) {
      group.categoryEntries.set(entry.category, []);
    }

    group.categoryEntries.get(entry.category).push(entry);
  });

  const mergedRows = Array.from(grouped.values()).map((group) => {
    const categoryBuckets = {};

    CATEGORY_ORDER.forEach((category) => {
      const entries = group.categoryEntries.get(category);
      if (!entries?.length) {
        return;
      }

      const mergedCategory = mergeCategoryStats(entries);
      categoryBuckets[category] = {
        category,
        conflicts: mergedCategory.conflicts,
        source_payloads: entries.map((entry) => entry.categoryPayload),
        source_row_count: entries.length,
        stats: mergedCategory.stats,
      };
    });

    const flatStats = buildFlatVolleyballStats(categoryBuckets, group.generalStats);

    return {
      ...group.baseRow,
      __sourceIndex: group.sourceIndex,
      data_origin: VOLLEYBALL_DATA_ORIGIN,
      school: group.school,
      school_id: group.school_id || group.baseRow.school_id || null,
      season: group.season,
      sport: "volleyball",
      sport_display: group.baseRow.sport_display || resolveSportContext("volleyball", group.baseRow.gender).competitionLabel,
      source_row_count: Object.values(categoryBuckets).reduce(
        (total, bucket) => total + Number(bucket?.source_row_count || 0),
        0
      ),
      stat_row: buildMergedStatRow(group, categoryBuckets, flatStats),
      submission_scope: group.baseRow.submission_scope || "season_sheet",
      volleyball_category_buckets: categoryBuckets,
      volleyball_historical_normalized: true,
    };
  });

  return [...passthrough, ...mergedRows]
    .sort((left, right) => (left.__sourceIndex || 0) - (right.__sourceIndex || 0))
    .map(stripTemporaryFields);
}
