/**
 * TEXT PARSER - The "Small Machine"
 * Converts pasted box scores from MaxPreps/Hudl into JSON
 * 
 * INPUT: Raw text copy/pasted from website
 * OUTPUT: Standardized JSON for Supabase
 */

/**
 * Main parsing function
 * @param {string} text - Raw pasted text from MaxPreps/Hudl
 * @returns {object} Parsed game data in JSON format
 */
export function parseTextBoxScore(text) {
  console.log('🤖 Starting text parser...');
  
  const result = {
    game: {},
    players: [],
    errors: [],
    confidence: 0
  };

  try {
    // Step 1: Extract teams and score
    const teamsAndScore = extractTeamsAndScore(text);
    if (teamsAndScore) {
      result.game = { ...result.game, ...teamsAndScore };
      result.confidence += 30;
    }

    // Step 2: Extract date
    const date = extractDate(text);
    if (date) {
      result.game.date = date;
      result.confidence += 10;
    }

    // Step 3: Extract sport and gender
    const sportInfo = extractSportAndGender(text);
    if (sportInfo) {
      result.game = { ...result.game, ...sportInfo };
      result.confidence += 10;
    }

    // Step 4: Extract location
    const location = extractLocation(text);
    if (location) {
      result.game.location = location;
      result.confidence += 5;
    }

    // Step 5: Extract player statistics
    const players = extractPlayers(text, result.game.sport);
    if (players && players.length > 0) {
      result.players = players;
      result.confidence += 45;
    }

    console.log('✅ Parsing complete. Confidence:', result.confidence + '%');
    return result;

  } catch (error) {
    console.error('❌ Parsing error:', error);
    result.errors.push(error.message);
    return result;
  }
}

/**
 * Extract teams and final score
 * Handles formats like:
 * - "MSD 78, ISD 65"
 * - "Maryland School for the Deaf 78, Indiana School for the Deaf 65"
 * - "Final: MSD 78 - ISD 65"
 */
function extractTeamsAndScore(text) {
  // Pattern 1: "Team1 Score1, Team2 Score2"
  const pattern1 = /([A-Za-z\s,.']+?)\s+(\d+)[,\s]+([A-Za-z\s,.']+?)\s+(\d+)/;
  
  // Pattern 2: "Final: Team1 Score1 - Team2 Score2"
  const pattern2 = /(?:Final|Score|Result):\s*([A-Za-z\s,.']+?)\s+(\d+)\s*[-–]\s*([A-Za-z\s,.']+?)\s+(\d+)/i;
  
  let match = text.match(pattern2) || text.match(pattern1);
  
  if (match) {
    const team1 = match[1].trim();
    const score1 = parseInt(match[2]);
    const team2 = match[3].trim();
    const score2 = parseInt(match[4]);

    return {
      homeTeam: team1,
      homeScore: score1,
      awayTeam: team2,
      awayScore: score2
    };
  }

  return null;
}

/**
 * Extract game date
 * Handles various date formats
 */
function extractDate(text) {
  // Pattern: "February 16, 2026" or "Feb 16, 2026" or "02/16/2026"
  const patterns = [
    /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/i,
    /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}/i,
    /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return new Date(match[0]).toISOString().split('T')[0];
    }
  }

  return null;
}

/**
 * Extract sport and gender
 */
function extractSportAndGender(text) {
  const result = {};

  // Common sports
  const sports = ['basketball', 'volleyball', 'football', 'soccer', 'baseball', 
                  'softball', 'track', 'cross country', 'wrestling', 'swimming'];
  
  for (const sport of sports) {
    if (text.toLowerCase().includes(sport)) {
      result.sport = sport;
      break;
    }
  }

  // Gender
  if (/\b(boys|men|male)\b/i.test(text)) {
    result.gender = 'boys';
  } else if (/\b(girls|women|female)\b/i.test(text)) {
    result.gender = 'girls';
  }

  return result;
}

/**
 * Extract location
 */
function extractLocation(text) {
  // Pattern: "at Location" or "@ Location" or city, state
  const patterns = [
    /(?:at|@)\s+([A-Za-z\s,']+(?:,\s*[A-Z]{2})?)/i,
    /(?:Location|Venue|Site):\s*([A-Za-z\s,']+)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Extract player statistics
 * This is the complex part - handles various stat table formats
 */
function extractPlayers(text, sport = 'basketball') {
  const players = [];
  const lines = text.split('\n');

  // Basketball stats patterns
  const basketballPattern = /([A-Za-z\s.']+?)\s*:?\s*(\d+)\s+(?:pts?|points?)\s*,?\s*(\d+)\s+(?:rebs?|rebounds?)\s*,?\s*(\d+)?\s*(?:asts?|assists?)?/gi;
  
  // Look for player stat lines
  let match;
  while ((match = basketballPattern.exec(text)) !== null) {
    const player = {
      name: match[1].trim(),
      stats: {
        points: parseInt(match[2]) || 0,
        rebounds: parseInt(match[3]) || 0,
        assists: parseInt(match[4]) || 0
      }
    };
    
    players.push(player);
  }

  // Try table format if no inline stats found
  if (players.length === 0) {
    const tableData = parseStatsTable(lines);
    if (tableData.length > 0) {
      return tableData;
    }
  }

  return players;
}

/**
 * Parse stats from table format
 * Example:
 * Player         PTS  REB  AST
 * John Smith     24   8    3
 */
function parseStatsTable(lines) {
  const players = [];
  let headerIndex = -1;
  let columns = {};

  // Find header row
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    if (line.includes('player') && (line.includes('pts') || line.includes('points'))) {
      headerIndex = i;
      
      // Map column positions
      const headers = lines[i].toLowerCase().split(/\s+/);
      headers.forEach((header, index) => {
        if (header.includes('player') || header.includes('name')) {
          columns.name = index;
        } else if (header.includes('pts') || header.includes('points')) {
          columns.points = index;
        } else if (header.includes('reb') || header.includes('rebounds')) {
          columns.rebounds = index;
        } else if (header.includes('ast') || header.includes('assists')) {
          columns.assists = index;
        }
      });
      break;
    }
  }

  // Parse data rows
  if (headerIndex !== -1) {
    for (let i = headerIndex + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.length < 5) continue;

      const parts = line.split(/\s+/);
      if (parts.length < 3) continue;

      // Try to extract player data
      const player = {
        name: parts[columns.name] || parts[0],
        stats: {
          points: parseInt(parts[columns.points]) || 0,
          rebounds: parseInt(parts[columns.rebounds]) || 0,
          assists: parseInt(parts[columns.assists]) || 0
        }
      };

      // Validate it's a real player line
      if (player.name.length > 2 && !isNaN(player.stats.points)) {
        players.push(player);
      }
    }
  }

  return players;
}

/**
 * Validate parsed data
 */
export function validateParsedData(data) {
  const errors = [];

  if (!data.game.homeTeam) {
    errors.push('Missing home team');
  }
  if (!data.game.awayTeam) {
    errors.push('Missing away team');
  }
  if (data.game.homeScore === undefined) {
    errors.push('Missing home score');
  }
  if (data.game.awayScore === undefined) {
    errors.push('Missing away score');
  }
  if (!data.game.date) {
    errors.push('Missing game date');
  }
  if (!data.game.sport) {
    errors.push('Missing sport');
  }
  if (data.players.length === 0) {
    errors.push('No player stats found');
  }

  return {
    isValid: errors.length === 0,
    errors: errors
  };
}
