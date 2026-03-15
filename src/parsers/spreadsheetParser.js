import { resolveFootballFormatForSport } from "../footballFormat.js";

const SPORT_SCHEMAS = {
  basketball: {
    playerMeta: {
      athlete_name: ["player", "player_name", "name", "athlete", "athlete_name"],
      school_name: ["school", "team", "school_name"],
      season: ["season", "year"],
    },
    stats: {
      GP: ["gp", "games", "games_played"],
      MIN: ["min", "mins", "minutes"],
      PTS: ["pts", "points", "total_points"],
      REB: ["reb", "rebs", "rebounds", "total_rebounds", "trb"],
      AST: ["ast", "assists"],
      STL: ["stl", "steals"],
      BLK: ["blk", "blocks"],
      TOV: ["tov", "to", "turnovers"],
      FGM: ["fgm", "field_goals_made"],
      FGA: ["fga", "field_goals_attempted"],
      FG2M: ["fg2m", "2pm", "2fgm", "two_point_made"],
      FG2A: ["fg2a", "2pa", "2fga", "two_point_attempted"],
      FG3M: ["fg3m", "3pm", "3ptm", "3fgm", "three_pointers_made"],
      FG3A: ["fg3a", "3pa", "3pta", "3fga", "three_pointers_attempted"],
      FTM: ["ftm", "free_throws_made"],
      FTA: ["fta", "free_throws_attempted"],
      PF: ["pf", "fouls", "personal_fouls"],
    },
  },

  football: {
    playerMeta: {
      athlete_name: ["player", "player_name", "name", "athlete", "athlete_name"],
      school_name: ["school", "team", "school_name"],
      season: ["season", "year"],
    },
    stats: {
      GP: ["gp", "games", "games_played"],
      PASS_COMP: ["comp", "completions", "pass_comp"],
      PASS_ATT: ["pass_att", "passing_att", "pass_attempts"],
      PASS_YDS: ["pass_yds", "passing_yards", "pass_yards"],
      PASS_TD: ["pass_td", "passing_td", "pass_tds"],
      INT: ["int", "interceptions"],
      RUSH_ATT: ["rush_att", "rushing_att", "rushing_attempts"],
      RUSH_YDS: ["rush_yds", "rushing_yards", "rush_yards"],
      RUSH_TD: ["rush_td", "rushing_td", "rush_tds"],
      REC: ["rec", "receptions"],
      REC_YDS: ["rec_yds", "receiving_yards"],
      REC_TD: ["rec_td", "receiving_td"],
      TACKLES: ["tackles", "tk"],
      SACKS: ["sacks", "sk"],
      FUM: ["fum", "fumbles"],
    },
    ambiguous: {
      att: ["PASS_ATT", "RUSH_ATT"],
      yds: ["PASS_YDS", "RUSH_YDS", "REC_YDS"],
      td: ["PASS_TD", "RUSH_TD", "REC_TD"],
    },
  },

  volleyball: {
    playerMeta: {
      athlete_name: ["player", "player_name", "name", "athlete", "athlete_name"],
      school_name: ["school", "team", "school_name"],
      season: ["season", "year"],
    },
    stats: {
      GP: ["gp", "games", "games_played"],
      K: ["k", "kills"],
      AST: ["ast", "assists"],
      ACE: ["ace", "aces"],
      DIG: ["dig", "digs"],
      BLK: ["blk", "blocks", "total_blocks"],
      SA: ["sa", "serve_attempts"],
      SE: ["se", "service_errors"],
    },
    ambiguous: {
      a: ["AST", "ACE"],
    },
  },

  soccer: {
    playerMeta: {
      athlete_name: ["player", "player_name", "name", "athlete", "athlete_name"],
      school_name: ["school", "team", "school_name"],
      season: ["season", "year"],
    },
    stats: {
      GP: ["gp", "games", "games_played"],
      G: ["g", "goals"],
      A: ["a", "assists"],
      SOG: ["sog", "shots_on_goal"],
      SV: ["sv", "saves"],
    },
  },

  baseball: {
    playerMeta: {
      athlete_name: ["player", "player_name", "name", "athlete", "athlete_name"],
      school_name: ["school", "team", "school_name"],
      season: ["season", "year"],
    },
    stats: {
      GP: ["gp", "games", "games_played"],
      AB: ["ab", "at_bats"],
      H: ["h", "hits"],
      AVG: ["avg", "ba", "batting_average"],
      R: ["r", "runs"],
      RBI: ["rbi"],
      HR: ["hr", "home_runs"],
      SB: ["sb", "stolen_bases"],
      BB: ["bb", "walks"],
      SO: ["so", "strikeouts"],
      IP: ["ip", "innings_pitched"],
      W: ["w", "wins"],
      L: ["l", "losses"],
      ERA: ["era"],
      SV: ["sv", "saves"],
    },
    ambiguous: {
      h: ["H"],
      r: ["R"],
    },
  },

  softball: {
    playerMeta: {
      athlete_name: ["player", "player_name", "name", "athlete", "athlete_name"],
      school_name: ["school", "team", "school_name"],
      season: ["season", "year"],
    },
    stats: {
      GP: ["gp", "games", "games_played"],
      AB: ["ab", "at_bats"],
      H: ["h", "hits"],
      AVG: ["avg", "ba", "batting_average"],
      R: ["r", "runs"],
      RBI: ["rbi"],
      HR: ["hr", "home_runs"],
      SB: ["sb", "stolen_bases"],
      BB: ["bb", "walks"],
      SO: ["so", "strikeouts"],
      IP: ["ip", "innings_pitched"],
      W: ["w", "wins"],
      L: ["l", "losses"],
      ERA: ["era"],
      SV: ["sv", "saves"],
    },
  },
};

const IGNORED_HEADERS = new Set(["#", "rank", "jersey", "number", "num"]);

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/[%]/g, " pct ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isBlankRow(row) {
  return row.every((cell) => String(cell ?? "").trim() === "");
}

function parseCSVText(csvText) {
  const rows = [];
  let current = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const next = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      current.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      current.push(cell);
      rows.push(current);
      current = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length || current.length) {
    current.push(cell);
    rows.push(current);
  }

  return rows;
}

async function fileToArrayBuffer(file) {
  return await file.arrayBuffer();
}

async function fileToText(file) {
  return await file.text();
}

async function readSpreadsheetRows(file) {
  const lower = file.name.toLowerCase();

  if (lower.endsWith(".csv")) {
    const text = await fileToText(file);
    return parseCSVText(text);
  }

  const buffer = await fileToArrayBuffer(file);
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  return rows;
}

function buildOptionList(schema) {
  const options = [
    { value: "__ignore__", label: "Ignore this column" },
    { value: "athlete_name", label: "Player Name" },
    { value: "school_name", label: "School / Team" },
    { value: "season", label: "Season" },
  ];

  Object.keys(schema.stats).forEach((key) => {
    options.push({ value: key, label: key });
  });

  return options;
}

function getSchemaKey(selectedSportValue) {
  if (!selectedSportValue) return null;
  if (selectedSportValue.includes("basketball")) return "basketball";
  if (selectedSportValue.includes("volleyball")) return "volleyball";
  if (selectedSportValue.includes("soccer")) return "soccer";
  if (selectedSportValue.includes("baseball")) return "baseball";
  if (selectedSportValue.includes("softball")) return "softball";
  if (selectedSportValue.includes("football")) return "football";
  return null;
}

function detectHeaderMapping(normalizedHeader, schema) {
  if (!normalizedHeader || IGNORED_HEADERS.has(normalizedHeader)) {
    return { status: "exact", mappedTo: "__ignore__", suggested: "__ignore__" };
  }

  for (const [metaKey, aliases] of Object.entries(schema.playerMeta || {})) {
    if (aliases.includes(normalizedHeader)) {
      return { status: "exact", mappedTo: metaKey, suggested: metaKey };
    }
  }

  for (const [statKey, aliases] of Object.entries(schema.stats || {})) {
    if (aliases.includes(normalizedHeader) || normalizeHeader(statKey) === normalizedHeader) {
      return { status: "exact", mappedTo: statKey, suggested: statKey };
    }
  }

  if (schema.ambiguous?.[normalizedHeader]) {
    return {
      status: "ambiguous",
      mappedTo: null,
      suggested: schema.ambiguous[normalizedHeader][0],
      options: schema.ambiguous[normalizedHeader],
    };
  }

  const fuzzyMatches = [];
  for (const [statKey, aliases] of Object.entries(schema.stats || {})) {
    if (
      aliases.some((alias) => alias.includes(normalizedHeader) || normalizedHeader.includes(alias)) ||
      normalizeHeader(statKey).includes(normalizedHeader) ||
      normalizedHeader.includes(normalizeHeader(statKey))
    ) {
      fuzzyMatches.push(statKey);
    }
  }

  if (fuzzyMatches.length === 1) {
    return { status: "likely", mappedTo: fuzzyMatches[0], suggested: fuzzyMatches[0] };
  }

  if (fuzzyMatches.length > 1) {
    return {
      status: "ambiguous",
      mappedTo: null,
      suggested: fuzzyMatches[0],
      options: fuzzyMatches,
    };
  }

  return { status: "unknown", mappedTo: null, suggested: null };
}

function buildRowObjects(headers, rows) {
  return rows.map((row) => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index] ?? "";
    });
    return obj;
  });
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function getSampleValues(rowObjects, header, count = 4) {
  return rowObjects
    .map((row) => row[header])
    .filter((value) => String(value ?? "").trim() !== "")
    .slice(0, count);
}

export async function inspectSpreadsheet(file, selectedSportValue) {
  const schemaKey = getSchemaKey(selectedSportValue);

  if (!schemaKey || !SPORT_SCHEMAS[schemaKey]) {
    throw new Error("Please select a valid sport before uploading.");
  }

  const rawRows = await readSpreadsheetRows(file);
  const cleanRows = rawRows.filter((row) => Array.isArray(row) && !isBlankRow(row));

  if (cleanRows.length < 2) {
    throw new Error("Spreadsheet must contain at least a header row and one data row.");
  }

  const rawHeaders = cleanRows[0].map((value) => String(value ?? "").trim());
  const normalizedHeaders = rawHeaders.map(normalizeHeader);
  const dataRows = cleanRows.slice(1).filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""));
  const rowObjects = buildRowObjects(rawHeaders, dataRows);
  const schema = SPORT_SCHEMAS[schemaKey];
  const options = buildOptionList(schema);

  const mappings = rawHeaders.map((header, index) => {
    const normalized = normalizedHeaders[index];
    const detection = detectHeaderMapping(normalized, schema);
    const sampleValues = getSampleValues(rowObjects, header);

    return {
      originalHeader: header,
      normalizedHeader: normalized,
      sampleValues,
      status: detection.status,
      mappedTo: detection.mappedTo,
      suggested: detection.suggested,
      options: detection.options || options.map((o) => o.value),
    };
  });

  const unresolved = mappings.filter((m) => m.status === "unknown" || m.status === "ambiguous");
  const recognized = mappings.filter((m) => m.status === "exact" || m.status === "likely");
  const hasAthleteName = mappings.some((m) => m.mappedTo === "athlete_name" || m.suggested === "athlete_name");

  const warnings = [];
  if (!hasAthleteName) warnings.push("No player-name column was confidently detected.");
  if (!recognized.some((m) => m.mappedTo === "season" || m.suggested === "season")) {
    warnings.push("No season column was detected. That is okay for now, but admin will need context later.");
  }
  if (unresolved.length > 0) {
    warnings.push(`${unresolved.length} column(s) need confirmation before preview can be built.`);
  }

  let confidence = 25;
  confidence += hasAthleteName ? 25 : 0;
  confidence += Math.min(recognized.length * 7, 35);
  confidence -= unresolved.length * 8;
  confidence = clamp(confidence, 15, 96);

  return {
    fileName: file.name,
    fileType: file.name.split(".").pop()?.toLowerCase() || "unknown",
    schemaKey,
    selectedSportValue,
    rawHeaders,
    normalizedHeaders,
    dataRows,
    rowObjects,
    mappings,
    unresolved,
    warnings,
    confidence,
    options,
    previewRows: rowObjects.slice(0, 12),
  };
}

function sanitizeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const cleaned = String(value).replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function finalizeSpreadsheetParse(inspection, mappingSelections, context = {}) {
  const footballFormat = resolveFootballFormatForSport(context.sport, context.footballFormat);
  const finalMappings = inspection.mappings.map((m) => {
    const selected = mappingSelections[m.originalHeader];
    const mappedTo =
      selected && selected !== ""
        ? selected
        : m.mappedTo || m.suggested || "__ignore__";

    return {
      ...m,
      finalMappedTo: mappedTo,
    };
  });

  const playerNameColumn = finalMappings.find((m) => m.finalMappedTo === "athlete_name")?.originalHeader;
  const schoolColumn = finalMappings.find((m) => m.finalMappedTo === "school_name")?.originalHeader;
  const seasonColumn = finalMappings.find((m) => m.finalMappedTo === "season")?.originalHeader;

  if (!playerNameColumn) {
    throw new Error("Player Name must be mapped before preview can be built.");
  }

  const statMappings = finalMappings.filter(
    (m) => !["athlete_name", "school_name", "season", "__ignore__"].includes(m.finalMappedTo)
  );

  const players = inspection.rowObjects
    .map((row) => {
      const name = String(row[playerNameColumn] ?? "").trim();
      if (!name) return null;

      const stats = {};
      statMappings.forEach((mapping) => {
        const rawValue = row[mapping.originalHeader];
        const numeric = sanitizeNumber(rawValue);
        if (numeric !== null) {
          stats[mapping.finalMappedTo] = numeric;
        }
      });

      return {
        name,
        team: schoolColumn ? String(row[schoolColumn] ?? "").trim() || context.defaultSchoolName || null : context.defaultSchoolName || null,
        school_id: context.defaultSchoolId || null,
        stats,
        meta: {
          season: seasonColumn ? String(row[seasonColumn] ?? "").trim() || null : context.seasonHint || null,
          football_format: footballFormat,
        },
      };
    })
    .filter(Boolean);

  const detectedSeasons = seasonColumn
    ? [...new Set(
        inspection.rowObjects
          .map((row) => String(row[seasonColumn] ?? "").trim())
          .filter(Boolean)
      )]
    : [];

  return {
    football_format: footballFormat,
    game: {
      sport: context.sport,
      gender: context.gender || null,
      football_format: footballFormat,
      date: new Date().toISOString().split("T")[0],
      homeTeam: null,
      awayTeam: null,
      homeScore: null,
      awayScore: null,
      location: null,
    },
    players,
    confidence: inspection.confidence,
    errors: [],
    warnings: inspection.warnings,
    submission_scope: "season_sheet",
    parse_review: {
      file_name: inspection.fileName,
      file_type: inspection.fileType,
      selected_sport_value: inspection.selectedSportValue,
      schema_key: inspection.schemaKey,
      football_format: footballFormat,
      confidence: inspection.confidence,
      original_headers: inspection.rawHeaders,
      mapped_headers: Object.fromEntries(
        finalMappings.map((m) => [m.originalHeader, m.finalMappedTo])
      ),
      unresolved_headers: finalMappings
        .filter((m) => !m.finalMappedTo || m.finalMappedTo === "")
        .map((m) => m.originalHeader),
      warnings: inspection.warnings,
      preview_rows: inspection.previewRows,
      detected_seasons: detectedSeasons.length ? detectedSeasons : (context.seasonHint ? [context.seasonHint] : []),
    },
  };
}
