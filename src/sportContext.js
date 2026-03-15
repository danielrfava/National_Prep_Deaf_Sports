const SPORT_LABELS = Object.freeze({
  baseball: "Baseball",
  basketball: "Basketball",
  football: "Football",
  soccer: "Soccer",
  softball: "Softball",
  volleyball: "Volleyball",
});

const GENDER_LABELS = Object.freeze({
  boys: "Boys",
  girls: "Girls",
});

function cleanText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

export function normalizeSportKey(value) {
  const text = cleanText(value);

  if (text.includes("basketball") || text.includes("bball")) return "basketball";
  if (text.includes("football")) return "football";
  if (text.includes("volleyball")) return "volleyball";
  if (text.includes("soccer")) return "soccer";
  if (text.includes("baseball")) return "baseball";
  if (text.includes("softball")) return "softball";

  return text || "";
}

export function normalizeGenderKey(value) {
  const text = cleanText(value);

  if (!text) {
    return "";
  }

  if (/\b(girl|girls|women|woman|lady|ladies)\b/.test(text)) {
    return "girls";
  }

  if (/\b(boy|boys|men|man)\b/.test(text)) {
    return "boys";
  }

  return "";
}

export function normalizeCompetitionLevel(value) {
  const text = cleanText(value);

  if (!text) {
    return "";
  }

  if (/\b(jv|junior varsity)\b/.test(text)) {
    return "junior_varsity";
  }

  if (/\b(freshman|frosh|middle school|ms)\b/.test(text)) {
    return "sub_varsity";
  }

  if (/\b(varsity)\b/.test(text)) {
    return "varsity";
  }

  return "";
}

export function resolveSportContext(sportValue, genderValue = "") {
  const sportText = cleanText(sportValue);
  const sportKey = normalizeSportKey(sportText);
  const genderKey = normalizeGenderKey(genderValue) || normalizeGenderKey(sportText);
  const inferredLevel = normalizeCompetitionLevel(sportText);
  const sportLabel = SPORT_LABELS[sportKey] || titleCase(sportKey || sportValue || "");
  const genderLabel = GENDER_LABELS[genderKey] || "";

  let levelKey = inferredLevel;
  if (!levelKey && sportKey === "basketball") {
    levelKey = "varsity";
  }

  const isBasketball = sportKey === "basketball";
  const isJuniorVarsity = isBasketball && levelKey === "junior_varsity";
  const isSubVarsity = isBasketball && levelKey === "sub_varsity";
  const isVarsity = !isJuniorVarsity && !isSubVarsity;

  let competitionLabel = sportLabel || titleCase(sportValue || "");
  if (genderLabel && sportLabel) {
    competitionLabel = `${genderLabel} ${sportLabel}`;
  }

  return {
    sportKey,
    sportLabel,
    genderKey,
    genderLabel,
    levelKey,
    isBasketball,
    isJuniorVarsity,
    isSubVarsity,
    isVarsity,
    competitionLabel,
  };
}

export function buildSportContextKey(sportValue, genderValue = "") {
  const context = resolveSportContext(sportValue, genderValue);
  return [
    context.sportKey || "unknown_sport",
    context.genderKey || "unknown_gender",
    context.levelKey || "unknown_level",
  ].join("|");
}

export function normalizeRecordSportContext(record) {
  const context = resolveSportContext(record?.sport, record?.gender);

  return {
    ...record,
    competition_level: context.levelKey || null,
    gender: context.genderKey || null,
    sport: context.sportKey || String(record?.sport || "").trim(),
    sport_display: context.competitionLabel || context.sportLabel || String(record?.sport || "").trim(),
  };
}
