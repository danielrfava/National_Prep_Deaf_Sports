import { resolveFootballFormatForSport } from "../footballFormat.js";

export function parseBoxScoreText(text, selectedSportValue = "", options = {}) {
  const cleanedText = String(text || "").trim();

  const sportMeta = resolveSportSelection(selectedSportValue, options.footballFormat);

  const result = {
    football_format: sportMeta.footballFormat,
    game: {
      date: extractDate(cleanedText),
      sport: sportMeta.sport || "basketball",
      gender: sportMeta.gender || null,
      homeTeam: null,
      awayTeam: null,
      homeScore: null,
      awayScore: null,
      location: extractLocation(cleanedText),
      football_format: sportMeta.footballFormat,
    },
    players: [],
    confidence: 20,
    errors: [],
    warnings: [],
    submission_scope: "game_boxscore",
    parse_review: {
      source_type: "text_box_score",
      selected_sport_value: selectedSportValue,
      football_format: sportMeta.footballFormat,
      confidence: 20,
      warnings: [],
      preview_rows: [],
    },
  };

  if (!cleanedText) {
    result.errors.push("No box score text was provided.");
    return result;
  }

  const teamsAndScore = extractTeamsAndScore(cleanedText);
  if (teamsAndScore) {
    result.game.homeTeam = teamsAndScore.homeTeam;
    result.game.awayTeam = teamsAndScore.awayTeam;
    result.game.homeScore = teamsAndScore.homeScore;
    result.game.awayScore = teamsAndScore.awayScore;
    result.confidence += 25;
  } else {
    result.warnings.push("Could not confidently detect teams and final score.");
  }

  if (result.game.date) {
    result.confidence += 10;
  } else {
    result.warnings.push("Could not detect game date from pasted text.");
  }

  if (result.game.location) {
    result.confidence += 5;
  }

  const players = extractBasketballPlayers(cleanedText);
  if (players.length > 0) {
    result.players = players;
    result.confidence += 35;
  } else {
    result.warnings.push("Could not confidently detect player stat lines.");
  }

  result.confidence = Math.max(10, Math.min(95, result.confidence));
  result.parse_review.confidence = result.confidence;
  result.parse_review.warnings = result.warnings;
  result.parse_review.preview_rows = result.players.slice(0, 8).map((p) => ({
    name: p.name,
    stats: p.stats,
  }));

  return result;
}

function resolveSportSelection(value, footballFormatValue = "") {
  switch (value) {
    case "boys_basketball":
      return { sport: "basketball", gender: "boys", footballFormat: null };
    case "girls_basketball":
      return { sport: "basketball", gender: "girls", footballFormat: null };
    case "girls_volleyball":
      return { sport: "volleyball", gender: "girls", footballFormat: null };
    case "boys_soccer":
      return { sport: "soccer", gender: "boys", footballFormat: null };
    case "girls_soccer":
      return { sport: "soccer", gender: "girls", footballFormat: null };
    case "football":
      return {
        sport: "football",
        gender: null,
        footballFormat: resolveFootballFormatForSport("football", footballFormatValue),
      };
    case "baseball":
      return { sport: "baseball", gender: null, footballFormat: null };
    case "softball":
      return { sport: "softball", gender: null, footballFormat: null };
    default:
      return { sport: null, gender: null, footballFormat: null };
  }
}

function extractDate(text) {
  const patterns = [
    /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/,
    /\b\d{4}-\d{2}-\d{2}\b/,
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const date = new Date(match[0]);
      if (!Number.isNaN(date.getTime())) {
        return date.toISOString().split("T")[0];
      }
    }
  }

  return null;
}

function extractLocation(text) {
  const patterns = [
    /(?:at|@)\s+([A-Za-z0-9\s,'.\-]+)(?:\n|$)/i,
    /(?:Location|Venue|Site)\s*:\s*([A-Za-z0-9\s,'.\-]+)(?:\n|$)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return null;
}

function extractTeamsAndScore(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  const patterns = [
    /^(.*?)\s+(\d+)\s*[-–]\s*(\d+)\s+(.*?)$/i,
    /^(.*?)\s+(\d+)\s*,\s*(.*?)\s+(\d+)$/i,
    /^(.*?)\s+(\d+)\s+(.*?)\s+(\d+)$/i,
  ];

  for (const line of lines.slice(0, 8)) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (!match) continue;

      if (pattern === patterns[0]) {
        return {
          homeTeam: cleanTeamName(match[1]),
          homeScore: parseInt(match[2], 10),
          awayScore: parseInt(match[3], 10),
          awayTeam: cleanTeamName(match[4]),
        };
      }

      return {
        homeTeam: cleanTeamName(match[1]),
        homeScore: parseInt(match[2], 10),
        awayTeam: cleanTeamName(match[3]),
        awayScore: parseInt(match[4], 10),
      };
    }
  }

  return null;
}

function cleanTeamName(value) {
  return String(value || "")
    .replace(/^(final|result|score)\s*:\s*/i, "")
    .trim();
}

function extractBasketballPlayers(text) {
  const players = [];
  const seen = new Set();

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  const patterns = [
    /^([A-Z][A-Za-z.'\- ]+?)\s*[:\-]\s*(\d+)\s*(?:pts?|points?)(?:,\s*(\d+)\s*(?:reb|rebs|rebounds?))?(?:,\s*(\d+)\s*(?:ast|asts|assists?))?(?:,\s*(\d+)\s*(?:stl|steals?))?(?:,\s*(\d+)\s*(?:blk|blocks?))?$/i,
    /^([A-Z][A-Za-z.'\- ]+?)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+(\d+))?(?:\s+(\d+))?$/,
  ];

  for (const line of lines) {
    let matched = false;

    for (let i = 0; i < patterns.length; i++) {
      const match = line.match(patterns[i]);
      if (!match) continue;

      let player = null;

      if (i === 0) {
        player = {
          name: match[1].trim(),
          team: null,
          stats: compactStats({
            PTS: toInt(match[2]),
            REB: toInt(match[3]),
            AST: toInt(match[4]),
            STL: toInt(match[5]),
            BLK: toInt(match[6]),
          }),
        };
      } else if (i === 1) {
        player = {
          name: match[1].trim(),
          team: null,
          stats: compactStats({
            PTS: toInt(match[2]),
            REB: toInt(match[3]),
            AST: toInt(match[4]),
            STL: toInt(match[5]),
            BLK: toInt(match[6]),
          }),
        };
      }

      if (player && player.name && !seen.has(player.name.toLowerCase())) {
        players.push(player);
        seen.add(player.name.toLowerCase());
        matched = true;
        break;
      }
    }

    if (matched) continue;
  }

  return players;
}

function compactStats(stats) {
  return Object.fromEntries(
    Object.entries(stats).filter(([, value]) => value !== null && value !== undefined && !Number.isNaN(value))
  );
}

function toInt(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = parseInt(String(value).replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}
