import { supabase } from "../supabaseClient.js";

function isMissingSportVariantColumnError(error) {
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return message.includes('sport_variant') && (
    message.includes('does not exist') ||
    message.includes('could not find') ||
    message.includes('column')
  );
}

function buildSearchFilter(query) {
  const escaped = query.replace(/%/g, "\\%").replace(/_/g, "\\_");
  const like = `%${escaped}%`;
  const parts = [
    `school.ilike.${like}`,
    `sport.ilike.${like}`,
    `season.ilike.${like}`
  ];

  return parts.join(",");
}

export async function fetchSportsRecords(query = "", filters = {}) {
  console.log('fetchSportsRecords called with:', { query, filters });
  
  // Fetch in batches to overcome 1000 record limit
  let allData = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;
  let footballVariantFilterMode = filters.footballVariant ? 'sport_variant' : 'none';

  while (hasMore && allData.length < 50000) {
    let request = supabase
      .from("raw_stat_rows")
      .select("*")
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (query) {
      request = request.or(`${buildSearchFilter(query)},stat_row->>Athlete Name.ilike.%${query}%`);
    }

    if (filters.schoolId && filters.schoolId !== '' && filters.schoolId !== 'all') {
      console.log('Applying school filter:', filters.schoolId);
      request = request.eq("school", filters.schoolId);
    } else {
      console.log('Not applying school filter - showing all schools');
    }

    if (filters.sport && filters.sport !== '' && filters.sport !== 'all') {
      console.log('Applying sport filter:', filters.sport);
      request = request.eq("sport", filters.sport);
    } else {
      console.log('Not applying sport filter - showing all sports');
    }

    if (filters.footballVariant) {
      if (footballVariantFilterMode === 'sport_variant') {
        request = request.eq("sport_variant", filters.footballVariant);
      } else {
        request = request.ilike("sport", `%${filters.footballVariant}%`);
      }
    }

    const { data, error } = await request;

    if (error) {
      if (filters.footballVariant && footballVariantFilterMode === 'sport_variant' && isMissingSportVariantColumnError(error)) {
        console.warn('sport_variant column missing on raw_stat_rows, falling back to sport text matching for football variant filter.');
        footballVariantFilterMode = 'sport_text';
        continue;
      }

      console.error('Supabase error:', error);
      throw new Error(error.message);
    }

    if (
      filters.footballVariant &&
      footballVariantFilterMode === 'sport_variant' &&
      page === 0 &&
      allData.length === 0 &&
      (!data || data.length === 0)
    ) {
      console.warn('No football variant rows found via sport_variant, retrying with legacy sport text matching.');
      footballVariantFilterMode = 'sport_text';
      continue;
    }

    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allData = allData.concat(data);
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    }
  }

  console.log(`Fetched ${allData?.length || 0} records`);
  if (allData && allData.length > 0) {
    console.log('Sample record:', allData[0]);
    console.log('Unique schools in result:', [...new Set(allData.map(r => r.school))]);
    
    // Sort by PTS (points) descending to mix schools by performance
    allData.sort((a, b) => {
      const ptsA = parseFloat(a.stat_row?.PTS) || 0;
      const ptsB = parseFloat(b.stat_row?.PTS) || 0;
      return ptsB - ptsA; // Descending order (highest first)
    });
    console.log('Sorted by PTS - Top 3:', allData.slice(0, 3).map(r => ({
      name: r.stat_row?.['Athlete Name'],
      school: r.school,
      pts: r.stat_row?.PTS
    })));
  }
  
  return allData || [];
}

export async function fetchSchools() {
  // Get all unique schools - use pagination
  let allSchools = new Set();
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore && page < 50) {
    const { data, error } = await supabase
      .from("raw_stat_rows")
      .select("school")
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      data.forEach((row) => {
        if (row?.school) {
          allSchools.add(row.school);
        }
      });
      
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    }
  }

  console.log('Total unique schools found:', allSchools.size);
  return Array.from(allSchools).sort().map(school => ({
    id: school,
    full_name: school
  }));
}

export async function fetchSportsList() {
  // Get all unique sports - use pagination
  let allSports = new Set();
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore && page < 50) {
    const { data, error } = await supabase
      .from("raw_stat_rows")
      .select("sport")
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      data.forEach((row) => {
        if (row?.sport) {
          allSports.add(row.sport);
        }
      });
      
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    }
  }

  console.log('Total unique sports found:', allSports.size);
  return Array.from(allSports).sort();
}
