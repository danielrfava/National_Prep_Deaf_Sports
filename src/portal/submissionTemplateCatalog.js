const SPORT_TEMPLATE_DEFINITIONS = {
  basketball: {
    id: "basketball_template",
    label: "Basketball Template",
    filename: "npds-basketball-season-template.csv",
    description: "Shared basketball season-summary template with an explicit sport field for Boys Basketball or Girls Basketball.",
    supportedSelections: ["boys_basketball", "girls_basketball"],
    headers: [
      "season",
      "sport",
      "school",
      "athlete_name",
      "grade",
      "jersey",
      "position",
      "gp",
      "gs",
      "min",
      "pts",
      "reb",
      "oreb",
      "dreb",
      "ast",
      "stl",
      "blk",
      "tov",
      "pf",
      "fgm",
      "fga",
      "fg_pct",
      "three_pm",
      "three_pa",
      "three_p_pct",
      "ftm",
      "fta",
      "ft_pct",
    ],
    sampleRows: [
      [
        "2025-2026",
        "Boys Basketball",
        "Indiana School for the Deaf",
        "Jordan Example",
        "12",
        "11",
        "G",
        "24",
        "24",
        "692",
        "418",
        "169",
        "52",
        "117",
        "88",
        "42",
        "18",
        "63",
        "41",
        "151",
        "314",
        "0.481",
        "47",
        "113",
        "0.416",
        "69",
        "96",
        "0.719",
      ],
      [
        "2025-2026",
        "Girls Basketball",
        "Indiana School for the Deaf",
        "Taylor Sample",
        "11",
        "5",
        "F",
        "22",
        "22",
        "611",
        "286",
        "121",
        "39",
        "82",
        "73",
        "31",
        "9",
        "54",
        "36",
        "109",
        "241",
        "0.452",
        "27",
        "65",
        "0.415",
        "41",
        "58",
        "0.707",
      ],
    ],
    guideSections: [
      {
        label: "Required Metadata",
        headers: ["season", "sport", "school", "athlete_name"],
      },
      {
        label: "Primary Totals",
        headers: ["gp", "pts", "reb", "ast", "stl", "blk", "tov", "pf", "fgm", "fga", "three_pm", "three_pa", "ftm", "fta"],
      },
      {
        label: "Optional Detail",
        headers: ["grade", "jersey", "position", "gs", "min", "oreb", "dreb", "fg_pct", "three_p_pct", "ft_pct"],
      },
    ],
    notes: [
      "Use one player-season per row and repeat the athlete on a new row for another season.",
      "The sport field is required and must be exactly Boys Basketball or Girls Basketball.",
      "Keep blank optional fields blank instead of inventing alternate headers or abbreviations.",
    ],
  },
  volleyball: {
    id: "volleyball_template",
    label: "Volleyball Template",
    filename: "npds-volleyball-template.csv",
    description: "Season-total volleyball stats with canonical NPDS headers for girls volleyball uploads.",
    supportedSelections: ["girls_volleyball"],
    headers: ["athlete_name", "school_name", "season", "GP", "K", "AST", "ACE", "DIG", "BLK", "SA", "SE"],
    sampleRows: [
      ["Avery Example", "Texas School for the Deaf", "2025-2026", "27", "318", "612", "61", "284", "49", "338", "22"],
      ["Riley Sample", "Texas School for the Deaf", "2025-2026", "25", "241", "98", "47", "301", "27", "194", "19"],
    ],
    guideSections: [
      {
        label: "Required Metadata",
        headers: ["athlete_name", "school_name", "season"],
      },
      {
        label: "Primary Totals",
        headers: ["GP", "K", "AST", "ACE", "DIG", "BLK"],
      },
      {
        label: "Serving Detail",
        headers: ["SA", "SE"],
      },
    ],
    notes: [
      "Use season totals, not one row per match, in this first-wave template.",
      "Keep AST as assists and ACE as aces. Do not rename them both to A.",
      "This template matches the current volleyball parser and review workflow.",
    ],
  },
};

const HISTORICAL_TEMPLATE_DEFINITIONS = [
  {
    id: "historical_individual_season",
    label: "Historical Individual-Season Stats",
    filename: "npds-historical-individual-season-template.csv",
    description: "Review-first template for archived season leaders, rankings, career totals, and record tracking.",
    headers: [
      "school_name",
      "school_id",
      "sport",
      "gender",
      "season",
      "athlete_name",
      "class_year",
      "GP",
      "PTS",
      "REB",
      "AST",
      "STL",
      "BLK",
      "K",
      "ACE",
      "DIG",
      "H",
      "RBI",
      "source_note",
      "review_note",
    ],
    sampleRows: [
      [
        "Indiana School for the Deaf",
        "isd",
        "basketball",
        "girls",
        "1997-1998",
        "Isabelle Example",
        "Sr",
        "23",
        "412",
        "141",
        "96",
        "37",
        "12",
        "",
        "",
        "",
        "",
        "",
        "1998 yearbook season summary",
        "Use only applicable stat columns for the selected sport",
      ],
    ],
    guideSections: [
      {
        label: "School + Athlete Context",
        headers: ["school_name", "school_id", "sport", "gender", "season", "athlete_name", "class_year"],
      },
      {
        label: "Common Totals",
        headers: ["GP", "PTS", "REB", "AST", "STL", "BLK", "K", "ACE", "DIG", "H", "RBI"],
      },
      {
        label: "Source Tracking",
        headers: ["source_note", "review_note"],
      },
    ],
    notes: [
      "Keep one sport per file when possible. Leave non-applicable stat columns blank rather than deleting headers.",
      "Add a source note for yearbooks, archived box scores, media guides, or coach spreadsheets.",
      "This file is intended for admin-reviewed historical intake, not instant one-click publishing.",
    ],
  },
  {
    id: "historical_schedule_results",
    label: "Historical Team Schedule/Results",
    filename: "npds-historical-schedule-results-template.csv",
    description: "Program-history schedule and results template for all-time wins, opponent history, and tournament tracking.",
    headers: [
      "school_name",
      "school_id",
      "sport",
      "gender",
      "season",
      "game_date",
      "opponent_name",
      "opponent_school_id",
      "home_or_away",
      "team_score",
      "opponent_score",
      "result",
      "location",
      "tournament_round",
      "notes",
      "source_note",
    ],
    sampleRows: [
      [
        "Indiana School for the Deaf",
        "isd",
        "basketball",
        "boys",
        "1986-1987",
        "1987-01-16",
        "Maryland School for the Deaf",
        "msd",
        "neutral",
        "58",
        "52",
        "W",
        "Indianapolis, IN",
        "Clerc Classic",
        "Semifinal",
        "1987 tournament program",
      ],
    ],
    guideSections: [
      {
        label: "Game Context",
        headers: ["school_name", "school_id", "sport", "gender", "season", "game_date", "opponent_name"],
      },
      {
        label: "Score + Result",
        headers: ["home_or_away", "team_score", "opponent_score", "result"],
      },
      {
        label: "Event Detail",
        headers: ["location", "tournament_round", "notes", "source_note"],
      },
    ],
    notes: [
      "Use one game per row and keep the school in the left-side team context for the whole file.",
      "If opponent school_id is unknown, keep the opponent name and leave the ID blank for later review.",
      "This template is designed for school-program history, not player box scores.",
    ],
  },
];

const ALL_TEMPLATES = [...Object.values(SPORT_TEMPLATE_DEFINITIONS), ...HISTORICAL_TEMPLATE_DEFINITIONS];

export function resolveSportTemplate(selectedSportValue) {
  const normalizedSelection = String(selectedSportValue || "").trim();
  return (
    Object.values(SPORT_TEMPLATE_DEFINITIONS).find((template) =>
      template.supportedSelections.includes(normalizedSelection)
    ) || null
  );
}

export function getHistoricalTemplates() {
  return HISTORICAL_TEMPLATE_DEFINITIONS;
}

export function getTemplateDefinitionById(templateId) {
  const normalizedId = String(templateId || "").trim();
  return ALL_TEMPLATES.find((template) => template.id === normalizedId) || null;
}

export function triggerTemplateDownload(template) {
  if (!template) {
    return;
  }

  const csvRows = [template.headers, ...(template.sampleRows || [])];
  const csvContent = toCsv(csvRows);
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = objectUrl;
  anchor.download = template.filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 1000);
}

function toCsv(rows) {
  return rows
    .map((row) =>
      row
        .map((value) => {
          const stringValue = String(value ?? "");
          if (/[",\n]/.test(stringValue)) {
            return `"${stringValue.replaceAll('"', '""')}"`;
          }
          return stringValue;
        })
        .join(",")
    )
    .join("\r\n");
}
