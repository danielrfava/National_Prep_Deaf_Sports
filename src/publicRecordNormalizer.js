import { normalizeRecordSportContext, resolveSportContext } from "./sportContext.js";
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
      };
    })
    .filter(Boolean);

  return normalizeHistoricalVolleyballRows(normalizedRows);
}

