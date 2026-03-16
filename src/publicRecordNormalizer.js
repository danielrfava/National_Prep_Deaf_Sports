import { normalizeHistoricalDiamondRows } from "./baseballSoftballHistoricalNormalizer.js";
import { applySoccerPublicReviewFields, normalizeHistoricalSoccerRows } from "./soccerHistoricalNormalizer.js";
import { buildSportContextKey, normalizeRecordSportContext, resolveSportContext } from "./sportContext.js";
import { normalizeHistoricalVolleyballRows } from "./volleyballHistoricalNormalizer.js";

export function normalizePublicRecordRows(rows = []) {
  const normalizedRows = (Array.isArray(rows) ? rows : [])
    .map((row, index) => {
      const normalizedRow = normalizeRecordSportContext(row);
      const context = resolveSportContext(normalizedRow?.sport, normalizedRow?.gender);

      if (context.isBasketball && !context.isVarsity) {
        return null;
      }

      return {
        ...normalizedRow,
        __sourceIndex: typeof row?.__sourceIndex === "number" ? row.__sourceIndex : index,
        gender_label: context.genderLabel || null,
        gender_display: context.genderLabel || null,
        sport_filter_value: buildSportContextKey(row?.sport, row?.gender),
        sport_key: context.sportKey || normalizedRow?.sport || "",
      };
    })
    .filter(Boolean);

  return normalizeHistoricalDiamondRows(normalizeHistoricalVolleyballRows(normalizeHistoricalSoccerRows(normalizedRows)))
    .map((row) => applySoccerPublicReviewFields(row));
}
