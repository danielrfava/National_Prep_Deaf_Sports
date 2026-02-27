export async function fetchSportsRecords(query = "", filters = {}) {
  console.log("fetchSportsRecords called with:", { query, filters });

  let footballVariantFilterMode = filters.footballVariant
    ? "sport_variant"
    : "none";

  let divisionFullNames = null;
  if (filters.division) {
    divisionFullNames = await getDivisionFullNameList(filters.division);
  }

  let selectedSchoolFullName = null;
  if (filters.schoolId && filters.schoolId !== "all") {
    selectedSchoolFullName = await getFullNameBySchoolId(
      filters.schoolId
    );
  }

  const allData = await fetchPaginatedRows({
    pageSize: 1000,

    fetchPage: (page, pageSize) => {
      let request = supabase
        .from("raw_stat_rows")
        .select(`
          *,
          schools:school_id (
            short_name
          )
        `)
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (query) {
        request = request.or(
          `${buildSearchFilter(query)},stat_row->>Athlete Name.ilike.%${query}%`
        );
      }

      if (divisionFullNames?.length) {
        request = request.in("school", divisionFullNames);
      }

      if (selectedSchoolFullName) {
        request = request.eq("school", selectedSchoolFullName);
      }

      if (filters.sport && filters.sport !== "all") {
        request = request.eq("sport", filters.sport);
      }

      if (filters.season && filters.season !== "all") {
        request = request.eq("season", filters.season);
      }

      if (filters.footballVariant) {
        if (footballVariantFilterMode === "sport_variant") {
          request = request.eq(
            "sport_variant",
            filters.footballVariant
          );
        } else {
          request = request.ilike(
            "sport",
            `%${filters.footballVariant}%`
          );
        }
      }

      return request;
    },

    onError: ({ error }) => {
      if (
        filters.footballVariant &&
        footballVariantFilterMode === "sport_variant" &&
        isMissingSportVariantColumnError(error)
      ) {
        footballVariantFilterMode = "sport_text";
        return "retry";
      }

      console.error("Supabase error:", error);
      return null;
    },
  });

  if (allData?.length) {
    allData.sort((a, b) => {
      const ptsA = parseFloat(a.stat_row?.PTS) || 0;
      const ptsB = parseFloat(b.stat_row?.PTS) || 0;
      return ptsB - ptsA;
    });
  }

  const normalizedData = (allData || []).map(row => ({
    ...row,
    school_id: row?.schools?.short_name || row?.school_id || ""
  }));

  return normalizedData;
}