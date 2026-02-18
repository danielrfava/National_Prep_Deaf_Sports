/**
 * CSV PARSER - Parse uploaded CSV files
 * Handles CSV exports from MaxPreps, Hudl, Excel
 * 
 * INPUT: CSV file content
 * OUTPUT: Standardized JSON for Supabase
 */

/**
 * Parse CSV file
 * @param {string} csvContent - Raw CSV file content
 * @returns {object} Parsed game data
 */
export function parseCSV(csvContent) {
  console.log('🤖 Starting CSV parser...');
  
  const result = {
    game: {},
    players: [],
    errors: [],
    confidence: 0
  };

  try {
    // Parse CSV into rows
    const rows = csvContent.trim().split('\n').map(row => {
      // Handle quoted fields with commas
      return parseCSVRow(row);
    });

    if (rows.length < 2) {
      throw new Error('CSV must have at least header and one data row');
    }

    // Get headers
    const headers = rows[0].map(h => h.toLowerCase().trim());
    
    // Detect CSV type
    const csvType = detectCSVType(headers);
    console.log('CSV Type:', csvType);

    if (csvType === 'player_stats') {
      result.players = parsePlayerStatsCSV(rows, headers);
      result.confidence += 60;
    } else if (csvType === 'game_summary') {
      result.game = parseGameSummaryCSV(rows, headers);
      result.confidence += 40;
    } else {
      // Try generic parsing
      const parsed = parseGenericCSV(rows, headers);
      result.game = parsed.game || {};
      result.players = parsed.players || [];
      result.confidence += 30;
    }

    console.log('✅ CSV parsing complete. Found', result.players.length, 'players');
    return result;

  } catch (error) {
    console.error('❌ CSV parsing error:', error);
    result.errors.push(error.message);
    return result;
  }
}

/**
 * Parse a single CSV row handling quoted fields
 */
function parseCSVRow(row) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

/**
 * Detect CSV type from headers
 */
function detectCSVType(headers) {
  const headerStr = headers.join(' ');
  
  // Player stats CSV (most common)
  if (headerStr.includes('player') || headerStr.includes('name')) {
    if (headerStr.includes('pts') || headerStr.includes('points') || 
        headerStr.includes('reb') || headerStr.includes('ast')) {
      return 'player_stats';
    }
  }

  // Game summary CSV
  if (headerStr.includes('team') && headerStr.includes('score')) {
    return 'game_summary';
  }

  return 'unknown';
}

/**
 * Parse player statistics CSV
 * Expected columns: Name/Player, Team, Points/PTS, Rebounds/REB, Assists/AST, etc.
 */
function parsePlayerStatsCSV(rows, headers) {
  const players = [];
  
  // Map column indices
  const columnMap = {};
  headers.forEach((header, index) => {
    const h = header.toLowerCase();
    
    if (h.includes('name') || h === 'player') {
      columnMap.name = index;
    } else if (h === 'team' || h === 'school') {
      columnMap.team = index;
    } else if (h === 'pts' || h === 'points') {
      columnMap.points = index;
    } else if (h === 'reb' || h === 'rebounds') {
      columnMap.rebounds = index;
    } else if (h === 'ast' || h === 'assists') {
      columnMap.assists = index;
    } else if (h === 'stl' || h === 'steals') {
      columnMap.steals = index;
    } else if (h === 'blk' || h === 'blocks') {
      columnMap.blocks = index;
    } else if (h === 'fg%' || h === 'field goal %') {
      columnMap.fg_pct = index;
    } else if (h === '3pt' || h === 'three pointers') {
      columnMap.three_pointers = index;
    } else if (h === 'ft' || h === 'free throws') {
      columnMap.free_throws = index;
    }
  });

  // Parse data rows (skip header)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    
    if (row.length < 2 || !row[columnMap.name]) {
      continue; // Skip empty rows
    }

    const player = {
      name: row[columnMap.name]?.trim(),
      team: row[columnMap.team]?.trim(),
      stats: {}
    };

    // Extract all available stats
    if (columnMap.points !== undefined) {
      player.stats.points = parseInt(row[columnMap.points]) || 0;
    }
    if (columnMap.rebounds !== undefined) {
      player.stats.rebounds = parseInt(row[columnMap.rebounds]) || 0;
    }
    if (columnMap.assists !== undefined) {
      player.stats.assists = parseInt(row[columnMap.assists]) || 0;
    }
    if (columnMap.steals !== undefined) {
      player.stats.steals = parseInt(row[columnMap.steals]) || 0;
    }
    if (columnMap.blocks !== undefined) {
      player.stats.blocks = parseInt(row[columnMap.blocks]) || 0;
    }
    if (columnMap.three_pointers !== undefined) {
      player.stats.three_pointers = parseInt(row[columnMap.three_pointers]) || 0;
    }
    if (columnMap.free_throws !== undefined) {
      player.stats.free_throws = parseInt(row[columnMap.free_throws]) || 0;
    }
    if (columnMap.fg_pct !== undefined) {
      player.stats.fg_percentage = parseFloat(row[columnMap.fg_pct]) || 0;
    }

    if (player.name) {
      players.push(player);
    }
  }

  return players;
}

/**
 * Parse game summary CSV
 */
function parseGameSummaryCSV(rows, headers) {
  const game = {};
  
  // This would parse a CSV with game-level info
  // Format: Date, Home Team, Away Team, Home Score, Away Score, etc.
  
  const columnMap = {};
  headers.forEach((header, index) => {
    const h = header.toLowerCase();
    
    if (h.includes('date')) columnMap.date = index;
    if (h.includes('home team')) columnMap.homeTeam = index;
    if (h.includes('away team') || h.includes('opponent')) columnMap.awayTeam = index;
    if (h.includes('home score')) columnMap.homeScore = index;
    if (h.includes('away score') || h.includes('opponent score')) columnMap.awayScore = index;
    if (h.includes('location') || h.includes('venue')) columnMap.location = index;
    if (h.includes('sport')) columnMap.sport = index;
  });

  // Get data from first row
  if (rows.length > 1) {
    const row = rows[1];
    
    if (columnMap.date !== undefined) {
      game.date = row[columnMap.date];
    }
    if (columnMap.homeTeam !== undefined) {
      game.homeTeam = row[columnMap.homeTeam];
    }
    if (columnMap.awayTeam !== undefined) {
      game.awayTeam = row[columnMap.awayTeam];
    }
    if (columnMap.homeScore !== undefined) {
      game.homeScore = parseInt(row[columnMap.homeScore]);
    }
    if (columnMap.awayScore !== undefined) {
      game.awayScore = parseInt(row[columnMap.awayScore]);
    }
    if (columnMap.location !== undefined) {
      game.location = row[columnMap.location];
    }
    if (columnMap.sport !== undefined) {
      game.sport = row[columnMap.sport];
    }
  }

  return game;
}

/**
 * Generic CSV parser when type is unknown
 */
function parseGenericCSV(rows, headers) {
  // Try to extract whatever we can
  return {
    game: {},
    players: parsePlayerStatsCSV(rows, headers),
    warning: 'Used generic parser - please verify data'
  };
}

/**
 * Validate CSV data
 */
export function validateCSVData(data) {
  const errors = [];

  if (!data.players || data.players.length === 0) {
    errors.push('No player data found in CSV');
  }

  data.players.forEach((player, index) => {
    if (!player.name) {
      errors.push(`Row ${index + 2}: Missing player name`);
    }
    if (!player.stats || Object.keys(player.stats).length === 0) {
      errors.push(`Row ${index + 2}: No stats found for ${player.name}`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors: errors
  };
}
