/**
 * DATA FORMATTER - Convert to Supabase JSON
 * 
 * This is the CRITICAL MODULE that converts all parsed data
 * (from text, CSV, or manual form) into the standardized JSON
 * format required by Supabase.
 * 
 * INPUT: Parsed data from any source
 * OUTPUT: Clean JSON ready for Supabase insertion
 */

import { supabase } from '../supabaseClient.js';

/**
 * Format game data for Supabase submission
 * This is the MAIN FUNCTION - converts everything to JSON
 * 
 * @param {object} parsedData - Data from text/CSV/form parser
 * @param {object} metadata - Additional context (user, school, etc.)
 * @returns {object} Formatted JSON for Supabase
 */
export async function formatForSupabase(parsedData, metadata) {
  console.log('🔄 Converting to Supabase JSON format...');

  // Map school names to school IDs
  const homeSchoolId = await getSchoolId(parsedData.game.homeTeam);
  const awaySchoolId = await getSchoolId(parsedData.game.awayTeam);

  // Build the standardized JSON structure
  const supabaseJSON = {
    // Game Information
    game_date: formatDate(parsedData.game.date),
    sport: normalizeSport(parsedData.game.sport),
    gender: parsedData.game.gender || metadata.gender || 'boys',
    
    // Teams
    home_team_id: homeSchoolId,
    away_team_id: awaySchoolId,
    home_score: parsedData.game.homeScore,
    away_score: parsedData.game.awayScore,
    location: parsedData.game.location || null,
    
    // Complete game data as JSONB (preserves everything)
    game_data: {
      version: '1.0',
      parsed_at: new Date().toISOString(),
      source: metadata.source || 'unknown',
      
      // Game details
      game: {
        date: formatDate(parsedData.game.date),
        sport: normalizeSport(parsedData.game.sport),
        gender: parsedData.game.gender || metadata.gender,
        location: parsedData.game.location,
        home_team: {
          id: homeSchoolId,
          name: parsedData.game.homeTeam,
          score: parsedData.game.homeScore
        },
        away_team: {
          id: awaySchoolId,
          name: parsedData.game.awayTeam,
          score: parsedData.game.awayScore
        }
      },
      
      // Player statistics
      players: formatPlayers(parsedData.players, homeSchoolId, awaySchoolId)
    },
    
    // Metadata
    submission_method: metadata.submissionMethod || 'text_paste',
    original_data: metadata.originalData || null,
    submitted_by: metadata.userId,
    submitter_school_id: metadata.schoolId
  };

  console.log('✅ JSON formatted for Supabase:', supabaseJSON);
  return supabaseJSON;
}

/**
 * Format player data for JSON storage
 */
function formatPlayers(players, homeSchoolId, awaySchoolId) {
  if (!players || players.length === 0) {
    return [];
  }

  return players.map(player => {
    // Determine which team the player belongs to
    const schoolId = player.team ? 
      getSchoolIdFromName(player.team) : 
      homeSchoolId; // Default to home team if not specified

    return {
      name: player.name,
      school_id: schoolId,
      school_name: player.team || null,
      stats: player.stats
    };
  });
}

/**
 * Look up school ID from school name
 */
async function getSchoolId(schoolName) {
  if (!schoolName) return null;

  try {
    // Query schools table
    const { data, error } = await supabase
      .from('schools')
      .select('id, short_name, full_name')
      .or(`full_name.ilike.%${schoolName}%,short_name.ilike.%${schoolName}%`)
      .limit(1)
      .single();

    if (error || !data) {
      console.warn('School not found:', schoolName);
      return null;
    }

    return data.id;
  } catch (error) {
    console.error('Error looking up school:', error);
    return null;
  }
}

/**
 * Get school ID from name (sync version for player mapping)
 */
function getSchoolIdFromName(schoolName) {
  // Common school abbreviations mapping
  const schoolMap = {
    'msd': 'msd',
    'maryland': 'msd',
    'mssd': 'mssd',
    'model': 'mssd',
    'isd': 'isd',
    'indiana': 'isd',
    'tsd': 'tsd',
    'texas': 'tsd',
    'csdf': 'csd-fremont',
    'csdr': 'csd-riverside',
    'california fremont': 'csd-fremont',
    'california riverside': 'csd-riverside'
  };

  const normalized = schoolName.toLowerCase().trim();
  
  for (const [key, id] of Object.entries(schoolMap)) {
    if (normalized.includes(key)) {
      return id;
    }
  }

  return null;
}

/**
 * Normalize sport names
 */
function normalizeSport(sport) {
  if (!sport) return 'basketball'; // default

  const sportMap = {
    'basketball': 'basketball',
    'bball': 'basketball',
    'hoops': 'basketball',
    'volleyball': 'volleyball',
    'vball': 'volleyball',
    'football': 'football',
    'soccer': 'soccer',
    'baseball': 'baseball',
    'softball': 'softball',
    'track': 'track',
    'track and field': 'track',
    'cross country': 'cross country',
    'xc': 'cross country',
    'wrestling': 'wrestling',
    'swimming': 'swimming',
    'swim': 'swimming'
  };

  const normalized = sport.toLowerCase().trim();
  return sportMap[normalized] || normalized;
}

/**
 * Format date to YYYY-MM-DD
 */
function formatDate(dateStr) {
  if (!dateStr) {
    return new Date().toISOString().split('T')[0]; // Default to today
  }

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return new Date().toISOString().split('T')[0];
    }
    return date.toISOString().split('T')[0];
  } catch (error) {
    return new Date().toISOString().split('T')[0];
  }
}

/**
 * Submit to Supabase
 * This function sends the JSON to the game_submissions table
 * 
 * @param {object} formattedData - JSON formatted by formatForSupabase()
 * @returns {object} Supabase response
 */
export async function submitToSupabase(formattedData) {
  console.log('📤 Submitting to Supabase...');

  try {
    const { data, error } = await supabase
      .from('game_submissions')
      .insert(formattedData)
      .select()
      .single();

    if (error) {
      throw error;
    }

    console.log('✅ Successfully submitted to Supabase!', data);
    return {
      success: true,
      submissionId: data.id,
      data: data
    };

  } catch (error) {
    console.error('❌ Supabase submission error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Complete workflow: Parse -> Format -> Submit
 * 
 * @param {string|object} input - Raw input (text, CSV, or form data)
 * @param {string} inputType - 'text', 'csv', or 'manual'
 * @param {object} metadata - User context
 */
export async function processAndSubmit(input, inputType, metadata) {
  console.log('🚀 Starting complete submission workflow...');
  console.log('Input type:', inputType);

  let parsedData;

  // Step 1: Parse based on input type
  if (inputType === 'text') {
    const { parseTextBoxScore } = await import('./textParser.js');
    parsedData = parseTextBoxScore(input);
  } else if (inputType === 'csv') {
    const { parseCSV } = await import('./csvParser.js');
    parsedData = parseCSV(input);
  } else if (inputType === 'manual') {
    // Manual form data is already structured
    parsedData = input;
  } else {
    throw new Error('Invalid input type');
  }

  // Check parsing confidence
  if (parsedData.confidence < 50) {
    console.warn('⚠️ Low confidence parse. Please review carefully.');
  }

  // Step 2: Format for Supabase (Convert to JSON)
  metadata.submissionMethod = inputType;
  metadata.originalData = typeof input === 'string' ? input : JSON.stringify(input);
  
  const formattedJSON = await formatForSupabase(parsedData, metadata);

  // Step 3: Submit to Supabase
  const result = await submitToSupabase(formattedJSON);

  return {
    ...result,
    parsedData: parsedData,
    formattedJSON: formattedJSON
  };
}

/**
 * Preview formatted data before submission
 * Useful for showing user what will be submitted
 */
export async function previewSubmission(input, inputType, metadata) {
  console.log('👀 Generating preview...');

  let parsedData;

  if (inputType === 'text') {
    const { parseTextBoxScore } = await import('./textParser.js');
    parsedData = parseTextBoxScore(input);
  } else if (inputType === 'csv') {
    const { parseCSV } = await import('./csvParser.js');
    parsedData = parseCSV(input);
  } else {
    parsedData = input;
  }

  metadata.submissionMethod = inputType;
  const formattedJSON = await formatForSupabase(parsedData, metadata);

  return {
    parsed: parsedData,
    formatted: formattedJSON,
    preview: generatePreviewHTML(parsedData, formattedJSON)
  };
}

/**
 * Generate HTML preview of submission
 */
function generatePreviewHTML(parsedData, formattedJSON) {
  const game = parsedData.game;
  const players = parsedData.players || [];

  return `
    <div class="preview-card">
      <h3>Game Summary</h3>
      <p><strong>Date:</strong> ${game.date || 'Not specified'}</p>
      <p><strong>Sport:</strong> ${game.sport || 'Not specified'} (${game.gender || 'Not specified'})</p>
      <p><strong>Score:</strong> ${game.homeTeam} ${game.homeScore} - ${game.awayScore} ${game.awayTeam}</p>
      <p><strong>Location:</strong> ${game.location || 'Not specified'}</p>
      
      <h4>Player Stats (${players.length} players)</h4>
      <ul>
        ${players.map(p => `
          <li>${p.name}: ${JSON.stringify(p.stats)}</li>
        `).join('')}
      </ul>
      
      <p class="confidence">Parsing Confidence: ${parsedData.confidence}%</p>
    </div>
  `;
}
