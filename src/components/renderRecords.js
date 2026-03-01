let currentSort = { column: null, ascending: true };
let currentRecords = [];
let rawRecords = [];
let currentPage = 1;
let recordsPerPage = 25;
let currentStatsView = 'season';
let currentStatCategory = 'batting'; // For baseball/softball: 'batting' or 'pitching'; For football: 'passing', 'rushing', or 'defense'
let currentFilters = {}; // Store current filters for re-rendering
let showAdvancedStats = false; // Basketball advanced stats toggle

// Sport-specific column configurations
const sportColumns = {
    soccer: [
      { key: 'gp', label: 'GP', type: 'number', field: 'GP' },
      { key: 'g', label: 'Goals', type: 'number', field: 'G' },
      { key: 'a', label: 'Assists', type: 'number', field: 'A' },
      { key: 'sog', label: 'Shots on Goal', type: 'number', field: 'SOG' }
    ],
  basketball: [
    { key: 'gp', label: 'GP', type: 'number', field: 'GP' },
    { key: 'pts', label: 'PTS', type: 'number', field: 'PTS' },
    { key: 'ppg', label: 'PPG', type: 'number', field: 'PPG' },
    { key: 'rpg', label: 'RPG', type: 'number', field: 'RPG' },
    { key: 'apg', label: 'APG', type: 'number', field: 'APG' },
    { key: 'spg', label: 'SPG', type: 'number', field: 'SPG' },
    { key: 'bpg', label: 'BPG', type: 'number', field: 'BPG' },
    { key: 'tpg', label: 'TPG', type: 'number', field: 'TPG' },
    { key: 'offr', label: 'OFFR', type: 'number', field: 'OFFR' },
    { key: 'defr', label: 'DEFR', type: 'number', field: 'DEFR' },
    { key: 'pfpg', label: 'PF', type: 'number', field: 'PFPG' }
  ],
  volleyball: [
    { key: 'gp', label: 'GP', type: 'number', field: 'GP' },
    { key: 'k', label: 'K', type: 'number', field: 'K' },
    { key: 'kpg', label: 'K/G', type: 'number', field: 'K/G' },
    { key: 'dig', label: 'DIG', type: 'number', field: 'DIG' },
    { key: 'dpg', label: 'D/G', type: 'number', field: 'D/G' },
    { key: 'ace', label: 'ACE', type: 'number', field: 'ACE' },
    { key: 'apg', label: 'A/G', type: 'number', field: 'A/G' },
    { key: 'blk', label: 'BLK', type: 'number', field: 'BLK' },
    { key: 'bpg', label: 'B/G', type: 'number', field: 'B/G' },
    { key: 'ast', label: 'AST', type: 'number', field: 'AST' },
    { key: 'aspg', label: 'AS/G', type: 'number', field: 'AS/G' }
  ],
  football_passing: [
    { key: 'gp', label: 'GP', type: 'number', field: 'GP' },
    { key: 'comp', label: 'COMP', type: 'number', field: 'COMP' },
    { key: 'att', label: 'ATT', type: 'number', field: 'ATT' },
    { key: 'pct', label: 'PCT', type: 'number', field: 'PCT' },
    { key: 'yds', label: 'YDS', type: 'number', field: 'YDS' },
    { key: 'ypg', label: 'YPG', type: 'number', field: 'YPG' },
    { key: 'td', label: 'TD', type: 'number', field: 'TD' },
    { key: 'int', label: 'INT', type: 'number', field: 'INT' },
    { key: 'qbr', label: 'QBR', type: 'number', field: 'QBR' },
    { key: 'rating', label: 'Rating', type: 'number', field: 'Rating' }
  ],
  football_rushing: [
    { key: 'gp', label: 'GP', type: 'number', field: 'GP' },
    { key: 'att', label: 'ATT', type: 'number', field: 'ATT' },
    { key: 'yds', label: 'YDS', type: 'number', field: 'YDS' },
    { key: 'avg', label: 'AVG', type: 'number', field: 'AVG' },
    { key: 'ypg', label: 'YPG', type: 'number', field: 'YPG' },
    { key: 'td', label: 'TD', type: 'number', field: 'TD' },
    { key: 'long', label: 'Long', type: 'number', field: 'Long' },
    { key: 'fum', label: 'FUM', type: 'number', field: 'FUM' },
    { key: 'rec', label: 'REC', type: 'number', field: 'REC' },
    { key: 'recyds', label: 'Rec YDS', type: 'number', field: 'Rec YDS' },
    { key: 'rectd', label: 'Rec TD', type: 'number', field: 'Rec TD' }
  ],
  football_receiving: [
    { key: 'gp', label: 'GP', type: 'number', field: 'GP' },
    { key: 'rec', label: 'REC', type: 'number', field: 'REC' },
    { key: 'recyds', label: 'YDS', type: 'number', field: 'Rec YDS' },
    { key: 'recypg', label: 'YPG', type: 'number', field: 'Rec YPG' },
    { key: 'rectd', label: 'TD', type: 'number', field: 'Rec TD' },
    { key: 'fum', label: 'FUM', type: 'number', field: 'FUM' },
    { key: 'avg', label: 'AVG', type: 'number', field: 'AVG' },
    { key: 'long', label: 'Long', type: 'number', field: 'Long' }
  ],
  football_defense: [
    { key: 'gp', label: 'GP', type: 'number', field: 'GP' },
    { key: 'tackles', label: 'Tackles', type: 'number', field: 'Tackles' },
    { key: 'solo', label: 'Solo', type: 'number', field: 'Solo' },
    { key: 'ast', label: 'AST', type: 'number', field: 'AST' },
    { key: 'tfl', label: 'TFL', type: 'number', field: 'TFL' },
    { key: 'sacks', label: 'Sacks', type: 'number', field: 'Sacks' },
    { key: 'int', label: 'INT', type: 'number', field: 'INT' },
    { key: 'pd', label: 'PD', type: 'number', field: 'PD' },
    { key: 'ff', label: 'FF', type: 'number', field: 'FF' },
    { key: 'fr', label: 'FR', type: 'number', field: 'FR' },
    { key: 'td', label: 'TD', type: 'number', field: 'TD' }
  ],
  baseball_batting: [
    { key: 'gp', label: 'GP', type: 'number', field: 'GP' },
    { key: 'avg', label: 'AVG', type: 'number', field: 'AVG' },
    { key: 'ab', label: 'AB', type: 'number', field: 'AB' },
    { key: 'h', label: 'H', type: 'number', field: 'H' },
    { key: '2b', label: '2B', type: 'number', field: '2B' },
    { key: '3b', label: '3B', type: 'number', field: '3B' },
    { key: 'hr', label: 'HR', type: 'number', field: 'HR' },
    { key: 'rbi', label: 'RBI', type: 'number', field: 'RBI' },
    { key: 'r', label: 'R', type: 'number', field: 'R' },
    { key: 'sb', label: 'SB', type: 'number', field: 'SB' },
    { key: 'bb', label: 'BB', type: 'number', field: 'BB' },
    { key: 'so', label: 'SO', type: 'number', field: 'SO' },
    { key: 'obp', label: 'OBP', type: 'number', field: 'OBP' },
    { key: 'slg', label: 'SLG', type: 'number', field: 'SLG' }
  ],
  baseball_pitching: [
    { key: 'gp', label: 'GP', type: 'number', field: 'GP' },
    { key: 'w', label: 'W', type: 'number', field: 'W' },
    { key: 'l', label: 'L', type: 'number', field: 'L' },
    { key: 'era', label: 'ERA', type: 'number', field: 'ERA' },
    { key: 'ip', label: 'IP', type: 'number', field: 'IP' },
    { key: 'h', label: 'H', type: 'number', field: 'H' },
    { key: 'r', label: 'R', type: 'number', field: 'R' },
    { key: 'er', label: 'ER', type: 'number', field: 'ER' },
    { key: 'bb', label: 'BB', type: 'number', field: 'BB' },
    { key: 'so', label: 'SO', type: 'number', field: 'SO' },
    { key: 'sv', label: 'SV', type: 'number', field: 'SV' },
    { key: 'whip', label: 'WHIP', type: 'number', field: 'WHIP' }
  ],
  softball_batting: [
    { key: 'gp', label: 'GP', type: 'number', field: 'GP' },
    { key: 'avg', label: 'AVG', type: 'number', field: 'AVG' },
    { key: 'ab', label: 'AB', type: 'number', field: 'AB' },
    { key: 'h', label: 'H', type: 'number', field: 'H' },
    { key: '2b', label: '2B', type: 'number', field: '2B' },
    { key: '3b', label: '3B', type: 'number', field: '3B' },
    { key: 'hr', label: 'HR', type: 'number', field: 'HR' },
    { key: 'rbi', label: 'RBI', type: 'number', field: 'RBI' },
    { key: 'r', label: 'R', type: 'number', field: 'R' },
    { key: 'sb', label: 'SB', type: 'number', field: 'SB' },
    { key: 'bb', label: 'BB', type: 'number', field: 'BB' },
    { key: 'so', label: 'SO', type: 'number', field: 'SO' },
    { key: 'obp', label: 'OBP', type: 'number', field: 'OBP' },
    { key: 'slg', label: 'SLG', type: 'number', field: 'SLG' }
  ],
  softball_pitching: [
    { key: 'gp', label: 'GP', type: 'number', field: 'GP' },
    { key: 'w', label: 'W', type: 'number', field: 'W' },
    { key: 'l', label: 'L', type: 'number', field: 'L' },
    { key: 'era', label: 'ERA', type: 'number', field: 'ERA' },
    { key: 'ip', label: 'IP', type: 'number', field: 'IP' },
    { key: 'h', label: 'H', type: 'number', field: 'H' },
    { key: 'r', label: 'R', type: 'number', field: 'R' },
    { key: 'er', label: 'ER', type: 'number', field: 'ER' },
    { key: 'bb', label: 'BB', type: 'number', field: 'BB' },
    { key: 'so', label: 'SO', type: 'number', field: 'SO' },
    { key: 'sv', label: 'SV', type: 'number', field: 'SV' },
    { key: 'whip', label: 'WHIP', type: 'number', field: 'WHIP' }
  ]
};

const basketballCoreColumns = [
  { key: 'gp', label: 'GP', type: 'number', field: 'GP' },
  { key: 'pts', label: 'PTS', type: 'number', field: 'PTS' },
  { key: 'ppg', label: 'PPG', type: 'number', field: 'PPG' },
  { key: 'reb', label: 'REB', type: 'number', field: 'REB', derivedRateField: 'RPG' },
  { key: 'ast_total', label: 'AST', type: 'number', field: 'AST', derivedRateField: 'APG' },
  { key: 'stl_total', label: 'STL', type: 'number', field: 'STL', derivedRateField: 'SPG' },
  { key: 'blk_total', label: 'BLK', type: 'number', field: 'BLK', derivedRateField: 'BPG' }
];

const basketballAdvancedColumns = [
  { key: 'rpg', label: 'RPG', type: 'number', field: 'RPG' },
  { key: 'apg', label: 'APG', type: 'number', field: 'APG' },
  { key: 'spg', label: 'SPG', type: 'number', field: 'SPG' },
  { key: 'bpg', label: 'BPG', type: 'number', field: 'BPG' },
  { key: 'tpg', label: 'TPG', type: 'number', field: 'TPG' },
  { key: 'offr', label: 'OFFR', type: 'number', field: 'OFFR' },
  { key: 'defr', label: 'DEFR', type: 'number', field: 'DEFR' },
  { key: 'pfpg', label: 'PF', type: 'number', field: 'PFPG' }
];

const baseballSoftballBattingCoreKeys = ['gp', 'avg', 'hr', 'rbi'];
const baseballSoftballPitchingCoreKeys = ['gp', 'w', 'l', 'era', 'ip', 'h', 'r', 'bb', 'so'];
const footballCoreKeysByCategory = {
  passing: ['gp', 'comp', 'att', 'yds', 'ypg', 'td', 'int'],
  rushing: ['gp', 'att', 'yds', 'ypg', 'td', 'fum'],
  receiving: ['gp', 'rec', 'recyds', 'recypg', 'rectd', 'fum'],
  defense: ['gp', 'tackles', 'solo', 'ast', 'tfl', 'sacks', 'int']
};

function splitColumnsByCoreKeys(allColumns, coreKeys) {
  const columnByKey = new Map(allColumns.map(col => [col.key, col]));
  const coreColumns = coreKeys
    .map(key => columnByKey.get(key))
    .filter(Boolean);
  const coreKeySet = new Set(coreColumns.map(col => col.key));
  const advancedColumns = allColumns.filter(col => !coreKeySet.has(col.key));

  return { coreColumns, advancedColumns };
}

function detectSportType(sport) {
  const sportLower = (sport || '').toLowerCase();
  if (sportLower.includes('soccer')) return 'soccer';
  if (sportLower.includes('basketball')) return 'basketball';
  if (sportLower.includes('volleyball')) return 'volleyball';
  if (sportLower.includes('football')) return 'football';
  if (sportLower.includes('baseball')) return 'baseball';
  if (sportLower.includes('softball')) return 'softball';
  return 'basketball'; // default
}

function getSportColumns(sport, statCategory = 'batting') {
  const sportType = detectSportType(sport);
  
  // For baseball, softball, and football - append the stat category
  if (sportType === 'baseball' || sportType === 'softball') {
    const key = `${sportType}_${statCategory}`;
    return sportColumns[key] || sportColumns[`${sportType}_batting`];
  }
  
  if (sportType === 'football') {
    const key = `${sportType}_${statCategory}`;
    return sportColumns[key] || sportColumns['football_rushing'];
  }
  
  return sportColumns[sportType] || sportColumns.basketball;
}

function getDisplayColumns(sport, statCategory = 'batting') {
  const sportType = detectSportType(sport);

  if (sportType === 'basketball') {
    return showAdvancedStats
      ? [...basketballCoreColumns, ...basketballAdvancedColumns]
      : basketballCoreColumns;
  }

  if (sportType === 'baseball' || sportType === 'softball') {
    const allColumns = getSportColumns(sport, statCategory);
    const coreKeys = statCategory === 'pitching'
      ? baseballSoftballPitchingCoreKeys
      : baseballSoftballBattingCoreKeys;
    const { coreColumns, advancedColumns } = splitColumnsByCoreKeys(allColumns, coreKeys);

    return showAdvancedStats
      ? [...coreColumns, ...advancedColumns]
      : coreColumns;
  }

  if (sportType === 'football') {
    const allColumns = getSportColumns(sport, statCategory);
    const coreKeys = footballCoreKeysByCategory[statCategory] || footballCoreKeysByCategory.rushing;
    const { coreColumns, advancedColumns } = splitColumnsByCoreKeys(allColumns, coreKeys);

    return showAdvancedStats
      ? [...coreColumns, ...advancedColumns]
      : coreColumns;
  }

  return getSportColumns(sport, statCategory);
}

function sportNeedsCategories(sport) {
  const sportType = detectSportType(sport);
  return sportType === 'baseball' || sportType === 'softball' || sportType === 'football';
}

function getCategoriesForSport(sport) {
  const sportType = detectSportType(sport);
  
  if (sportType === 'baseball' || sportType === 'softball') {
    return [
      { key: 'batting', label: 'Batting' },
      { key: 'pitching', label: 'Pitching' }
    ];
  }
  
  if (sportType === 'football') {
    return [
      { key: 'passing', label: 'Passing' },
      { key: 'rushing', label: 'Rushing' },
      { key: 'receiving', label: 'Receiving' },
      { key: 'defense', label: 'Defense' }
    ];
  }
  
   return [];
}

function getDefaultSortKey(sport, statCategory = 'batting') {
  const sportType = detectSportType(sport);

  if (sportType === 'basketball') return 'pts';
  if (sportType === 'soccer') return 'g';
  if (sportType === 'volleyball') return 'k';

  if (sportType === 'baseball' || sportType === 'softball') {
    return statCategory === 'pitching' ? 'era' : 'avg';
  }

  if (sportType === 'football') {
    switch (statCategory) {
      case 'passing':
        return 'yds';
      case 'rushing':
        return 'yds';
      case 'receiving':
        return 'recyds';
      case 'defense':
        return 'tackles';
      default:
        return 'yds';
    }
  }

  return 'pts';
}

const schoolAbbreviations = {
  // Big 6 Conference - Division 1
  'Maryland School for the Deaf': 'MSD',
  'Model Secondary School for the Deaf': 'MSSD',
  'California School for the Deaf, Fremont': 'CSDF',
  'California School for the Deaf-Fremont': 'CSDF',
  'California School for the Deaf, Riverside': 'CSDR',
  'California School for the Deaf-Riverside': 'CSDR',
  'Indiana School for the Deaf': 'ISD',
  'Texas School for the Deaf': 'TSD',
  
  // ESDAA Conference - Division 2
  'Lexington School for the Deaf': 'LSD',
  'Ohio School for the Deaf': 'OSD',
  'American School for the Deaf': 'ASD',
  'Delaware School for the Deaf': 'DelSD',
  'Marie H. Katzenbach School for the Deaf': 'KSD',
  'The Learning Center for the Deaf': 'TLC',
  'Western Pennsylvania School for the Deaf': 'WPSD',
  'West Pennyslvania School for the Deaf': 'WPSD', // typo in DB
  'West Pennsylvania School for the Deaf': 'WPSD',  // partial variation safety 
  'Governor Baxter School for the Deaf': 'GBSD',
  'New York State School for the Deaf': 'NYSSD',
  'Rochester School for the Deaf': 'RSD',
  'West Virginia Schools for the Deaf and Blind': 'WVSDB',
  'Marie Philip School for the Deaf': 'MPSD',
  'Rhode Island School for the Deaf': 'RISD',
  'New York School for the Deaf': 'NYSD',
  'Pennsylvania School for the Deaf': 'PSD',
  'Scranton School for the Deaf': 'SSD',
  
  // GPSD Conference - Division 2
  'Arkansas School for the Deaf': 'ASD-AR',
  'Iowa School for the Deaf': 'ISD-IA',
  'Kansas School for the Deaf': 'KSD',
  'Minnesota State Academy for the Deaf': 'MSAD',
  'Missouri School for the Deaf': 'MSD-MO',
  'New Mexico School for the Deaf': 'NMSD',
  'North Dakota School for the Deaf': 'NDSD',
  'Oklahoma School for the Deaf': 'OSD-OK',
  'Wisconsin School for the Deaf': 'WSD',
  
  // MDSDAA Conference - Division 2
  'Alabama School for the Deaf': 'ASDB',
  'Alabama Institute for the Deaf and Blind': 'AIDB', 
  'Alabama School for the Deaf and Blind': 'ASDB',
  'Eastern North Carolina School for the Deaf': 'ENCSD',
  'Florida School for the Deaf and Blind': 'FSDB',
  'Georgia School for the Deaf': 'GSD',
  'Kentucky School for the Deaf': 'KSD-KY',
  'Louisiana School for the Deaf': 'LSD-LA',
  'Mississippi School for the Deaf': 'MSD-MS',
  'North Carolina School for the Deaf': 'NCSD',
  'South Carolina School for the Deaf and Blind': 'SCSDB',
  'Tennessee School for the Deaf': 'TSD-TN',
  'Virginia School for the Deaf and the Blind': 'VSDB',
  
  // Independent - Division 2
  'Hawaii School for the Deaf and the Blind': 'HSDB',
  'Illinois School for the Deaf': 'ISD-IL',
  'Michigan School for the Deaf': 'MSD-MI',

  // Western States Basketball Classic (WSBC) - Division 2
  'Arizona School for the Deaf': 'ASD-AZ',
  'Arizona State School for the Deaf': 'ASD-AZ',
  'Washington School for the Deaf': 'WSD-WA',
  'Phoenix Day School for the Deaf': 'PDSD',
  'Colorado School for the Deaf and Blind': 'CSDB',
  'Oregon School for the Deaf': 'OSD-OR',
  'Utah School for the Deaf and Blind': 'USDB',
};

function getSchoolAbbrev(fullSchool) {
  if (!fullSchool) return '';
  
  console.log('Getting abbreviation for:', fullSchool);
  
  // Direct match first
  if (schoolAbbreviations[fullSchool]) {
    console.log('  -> Found direct match:', schoolAbbreviations[fullSchool]);
    return schoolAbbreviations[fullSchool];
  }
  
  // Normalize school name: remove punctuation, extra spaces, lowercase
  const normalizeSchool = (name) => {
    return name.toLowerCase()
      .replace(/[,.\-\s]+/g, ' ')  // Replace punctuation and multiple spaces with single space
      .trim()
      .replace(/\s+/g, '');  // Remove all spaces
  };
  
  const normalizedInput = normalizeSchool(fullSchool);
  
  // Try to find a match
  for (const [key, value] of Object.entries(schoolAbbreviations)) {
    if (normalizeSchool(key) === normalizedInput) {
      console.log('  -> Found normalized match:', value);
      return value;
    }
  }
  
  // If no match, try to extract abbreviation from school name
  // e.g., "California School for the Deaf-Riverside" -> "CSDR"
  const words = fullSchool.split(/[\s\-,]+/);
  const hasRiverside = fullSchool.toLowerCase().includes('riverside');
  const hasFremont = fullSchool.toLowerCase().includes('fremont');
  
  if (fullSchool.toLowerCase().includes('california') && fullSchool.toLowerCase().includes('deaf')) {
    if (hasRiverside) {
      console.log('  -> Extracted: CSDR');
      return 'CSDR';
    }
    if (hasFremont) {
      console.log('  -> Extracted: CSDF');
      return 'CSDF';
    }
  }
  
  if (fullSchool.toLowerCase().includes('indiana') && fullSchool.toLowerCase().includes('deaf')) {
    console.log('  -> Extracted: ISD');
    return 'ISD';
  }
  
  if (fullSchool.toLowerCase().includes('maryland') && fullSchool.toLowerCase().includes('deaf')) {
    console.log('  -> Extracted: MSD');
    return 'MSD';
  }
  
  if (fullSchool.toLowerCase().includes('texas') && fullSchool.toLowerCase().includes('deaf')) {
    console.log('  -> Extracted: TSD');
    return 'TSD';
  }
  
  // Return original name if no match found
  console.log('  -> No match found, returning original');
  return fullSchool;
}

function normalizeStatKey(key) {
  return String(key || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

const statAliases = {
  AVG: ['BA', 'BAVG', 'BATTINGAVERAGE', 'BATTINGAVG'],
  AB: ['ATBAT', 'ATBATS'],
  H: ['HITS'],
  GP: ['GAMESPLAYED'],
  PTS: ['POINTS'],
  REB: ['REBOUNDS', 'TRB', 'TOTREB'],
  AST: ['ASSISTS'],
  STL: ['STEALS'],
  BLK: ['BLOCKS'],
  COMP: ['COMPLETIONS'],
  ATT: ['ATTEMPTS'],
  YDS: ['YARDS'],
  REC: ['RECEPTIONS'],
  'Rec YDS': ['RECYDS', 'RECEIVINGYARDS'],
  'Rec YPG': ['RECYPG', 'RECEIVINGYPG'],
  'Rec TD': ['RECTD', 'RECEIVINGTD'],
  INT: ['INTERCEPTIONS'],
  FUM: ['FUMBLES'],
  '2B': ['DOUBLES'],
  '3B': ['TRIPLES']
};

function getStatAliases(field) {
  return statAliases[field] || [];
}

function getRawStatValue(statRow, field, aliases = []) {
  if (!statRow) return '';

  if (statRow[field] !== undefined && statRow[field] !== null && statRow[field] !== '') {
    return statRow[field];
  }

  const targets = new Set([
    normalizeStatKey(field),
    ...aliases.map(alias => normalizeStatKey(alias))
  ]);

  for (const [key, value] of Object.entries(statRow)) {
    if (value === undefined || value === null || value === '') continue;
    if (targets.has(normalizeStatKey(key))) {
      return value;
    }
  }

  return '';
}

function getNumericStatValue(statRow, field, aliases = []) {
  const rawValue = getRawStatValue(statRow, field, aliases);
  if (rawValue === '') return 0;

  const numeric = parseFloat(String(rawValue).replace(/,/g, ''));
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatBattingAverage(hits, atBats) {
  if (atBats <= 0) return '0.000';
  return (hits / atBats).toFixed(3);
}

function getDerivedBasketballTotal(record, totalField, rateField) {
  const explicitTotal = getNumericStatValue(record.stat_row, totalField, getStatAliases(totalField));
  if (explicitTotal > 0) {
    return explicitTotal;
  }

  const gp = getNumericStatValue(record.stat_row, 'GP', getStatAliases('GP'));
  const perGameRate = getNumericStatValue(record.stat_row, rateField, getStatAliases(rateField));

  if (gp <= 0 || perGameRate <= 0) {
    return 0;
  }

  return gp * perGameRate;
}

function getColumnNumericValue(record, col, sportType) {
  if (sportType === 'basketball' && col.derivedRateField) {
    return getDerivedBasketballTotal(record, col.field, col.derivedRateField);
  }

  let value = getNumericStatValue(record.stat_row, col.field, getStatAliases(col.field));

  if (sportType === 'basketball' && col.key === 'pts' && value === 0) {
    const gp = getNumericStatValue(record.stat_row, 'GP', getStatAliases('GP'));
    const ppg = getNumericStatValue(record.stat_row, 'PPG', getStatAliases('PPG'));
    if (gp > 0 && ppg > 0) {
      value = gp * ppg;
    }
  }

  if (sportType === 'football' && col.key === 'recypg' && value === 0) {
    const gp = getNumericStatValue(record.stat_row, 'GP', getStatAliases('GP'));
    const receivingYards = getNumericStatValue(record.stat_row, 'Rec YDS', getStatAliases('Rec YDS'));
    if (gp > 0 && receivingYards > 0) {
      value = receivingYards / gp;
    }
  }

  if (col.key === 'avg') {
    const hits = getNumericStatValue(record.stat_row, 'H', getStatAliases('H'));
    const atBats = getNumericStatValue(record.stat_row, 'AB', getStatAliases('AB'));
    if (atBats > 0) {
      value = parseFloat(formatBattingAverage(hits, atBats));
    }
  }

  return value;
}

   // season limit update
function aggregateCareerStats(records, maxSeasons = Infinity) {
  const playerMap = new Map();
  
  // Detect sport type from records
  const sportType = records.length > 0 ? detectSportType(records[0].sport) : 'basketball';
  const columns = getSportColumns(records[0]?.sport || 'basketball', currentStatCategory);
  
  records.forEach(record => {
    const rawName = record.stat_row?.["Athlete Name"];
    if (!rawName) return;
    
    // Strip year designation (Fr, So, Jr, Sr) from name for aggregation
    // e.g., "A. Senics(Fr)" -> "A. Senics"
    const cleanName = rawName.replace(/\((Fr|So|Jr|Sr)\)/i, '').trim();
    
    const key = `${cleanName}|${record.school}|${record.sport}`; // Key by name + school + sport
    if (!playerMap.has(key)) {
      const statTotals = {};
      columns.forEach(col => {
        statTotals[col.field] = 0;
      });
      
      playerMap.set(key, {
        name: cleanName,
        school: record.school,
        sport: record.sport,
        seasons: new Set(),
        seasonData: new Map(), // Track data per season to avoid duplicates
        totalGP: 0,
        statTotals
      });
    }
    
    const player = playerMap.get(key);
    const season = record.season || 'unknown';
    
      // Enforce season limit if needed

      // Only process each season once (avoid duplicates)
       if (!player.seasonData.has(season)) {
       player.seasons.add(season);
      
      const gp = parseFloat(record.stat_row?.["GP"]) || 0;
      player.totalGP += gp;
      
      // Store season data
      player.seasonData.set(season, {
        gp: gp,
        processed: true
      });
      
      // Aggregate all stat fields dynamically
      columns.forEach(col => {
        if (col.key === 'gp') return; // Skip GP, we handle it separately
        
        let value = getNumericStatValue(record.stat_row, col.field, getStatAliases(col.field));
        
        // Special handling for PTS - calculate from PPG if PTS is missing
        if (col.key === 'pts' && value === 0 && sportType === 'basketball') {
          const ppg = parseFloat(record.stat_row?.["PPG"]) || 0;
          value = ppg * gp; // Total points for this season
        }
        
        // For per-game stats (ending in /G or PG), multiply by GP to get totals
        if (col.label.endsWith('/G') || col.label.endsWith('PG')) {
          player.statTotals[col.field] += value * gp;
        } else {
          // For counting stats, just add them
          player.statTotals[col.field] += value;
        }
      });
    }
  });
  
  return Array.from(playerMap.values()).map(player => {
    // Enforce season limit properly AFTER collecting all seasons
    let seasonArray = Array.from(player.seasons).sort();

    if (maxSeasons !== Infinity) {
    seasonArray = seasonArray.slice(-maxSeasons);
    }
    // 👇 PASTE NEW BLOCK RIGHT HERE
    // Recalculate totals if limited to 4-year standard
    let effectiveSeasons = seasonArray;

    let filteredTotals = {};
    let filteredGP = 0;

    if (maxSeasons !== Infinity) {
     columns.forEach(col => {
     filteredTotals[col.field] = 0;
     });

     effectiveSeasons.forEach(season => {
      const seasonRecord = player.seasonData.get(season);
      if (!seasonRecord) return;

     const gp = parseFloat(seasonRecord.gp) || 0;
      filteredGP += gp;

     columns.forEach(col => {
      if (col.key === 'gp') return;

      let value = getNumericStatValue(
        seasonRecord.stat_row,
        col.field,
        getStatAliases(col.field)
      );

      if (col.label.endsWith('/G') || col.label.endsWith('PG')) {
        filteredTotals[col.field] += value * gp;
      } else {
        filteredTotals[col.field] += value;
      }
    });
  });
}
    // Format season range
    let seasonDisplay = '';
    
    if (seasonArray.length === 0) {
      seasonDisplay = '';
    } else if (seasonArray.length === 1) {
      seasonDisplay = seasonArray[0];
    } else {
      const firstSeason = seasonArray[0];
      const lastSeason = seasonArray[seasonArray.length - 1];
      const firstParts = firstSeason.split('-');
      const lastParts = lastSeason.split('-');
      const firstYear = firstParts[0] || firstSeason;
      const lastYear = lastParts[1] || lastParts[0] || lastSeason;
      seasonDisplay = `${firstYear}-${lastYear}`;
    }
    
      // Build career stat_row
       const careerStats = {
       "Athlete Name":
       maxSeasons === Infinity && player.seasons.size > 4
       ? `${player.name}*`
       : player.name,
        "GP": (maxSeasons !== Infinity ? filteredGP : player.totalGP).toFixed(0)
        };
    
    // Calculate career averages or totals for each stat
    columns.forEach(col => {
      if (col.key === 'gp') return; // Already handled
      
      const total = maxSeasons !== Infinity
       ? filteredTotals[col.field]
       : player.statTotals[col.field];
      
      // For per-game stats, calculate career average
      if (col.label.endsWith('/G') || col.label.endsWith('PG')) {
        careerStats[col.field] = player.totalGP > 0 
          ? (total / player.totalGP).toFixed(1) 
          : '0.0';
      } else if (col.label === 'AVG') {
        // Compute batting average from H/AB whenever AB data exists
        const hits = player.statTotals['H'] || 0;
        const atBats = player.statTotals['AB'] || 0;
        if (atBats > 0) {
          careerStats[col.field] = formatBattingAverage(hits, atBats);
        } else {
          // For other AVG fields, keep existing averaging behavior
          const count = player.seasons.size;
          careerStats[col.field] = count > 0 
            ? (total / count).toFixed(3)
            : '0.000';
        }
      } else {
        // For counting stats (K, DIG, ACE, H, HR, etc), show career totals
        careerStats[col.field] = total.toFixed(0);
      }
    });
    
    return {
      stat_row: careerStats,
      school: getSchoolAbbrev(player.school), // Use abbreviation
      sport: player.sport,
      season: seasonDisplay
    };
  });
}

function consolidateSeasonRows(records) {
  const seasonMap = new Map();

records.forEach(record => {
  const rawName = record.stat_row?.["Athlete Name"] || "";
  const name = rawName.replace(/\((Fr|So|Jr|Sr)\)/i, '').trim();
  const school = (record.school || "").trim();
  const sport = (record.sport || "").trim();
  const season = (record.season || "").trim();

  const key = `${name}|${school}|${sport}|${season}`;

  if (!seasonMap.has(key)) {
    seasonMap.set(key, {
      ...record,
      stat_row: { ...record.stat_row }
    });
  } else {
    const existing = seasonMap.get(key);

    Object.entries(record.stat_row || {}).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== "") {
        existing.stat_row[k] = v;
      }
    });
  }
});

  return Array.from(seasonMap.values());
}

export function setStatsView(view) {
  currentStatsView = view;
}

export function setStatCategory(category) {
  currentStatCategory = category;
}

export function getStatCategory() {
  return currentStatCategory;
}

export function renderRecords(container, statsView = 'season', filters = {}, records = null) {
  currentStatsView = statsView;
  currentFilters = filters;

  if (records) {
    rawRecords = records;
  }

  let displayRecords = [...rawRecords];

  // 🔥 Consolidate multiple stat rows per season first
    displayRecords = consolidateSeasonRows(displayRecords);

    if (statsView === 'career-standard') {
     displayRecords = aggregateCareerStats(displayRecords, 4);
      } else if (statsView === 'career-extended') {
     displayRecords = aggregateCareerStats(displayRecords, Infinity);
     }
  // 🔥 FORCE default PTS sort for basketball (fresh render only)
if (!records && displayRecords.length > 0) {
  const sportType = detectSportType(displayRecords[0].sport);

  if (sportType === 'basketball') {
    const columnsForSort = getDisplayColumns(
      filters.sport || displayRecords[0].sport,
      currentStatCategory
    );

    const ptsColumn = columnsForSort.find(c => c.key === 'pts');

    if (ptsColumn) {
      displayRecords.sort((a, b) => {
        const aVal = getColumnNumericValue(a, ptsColumn, sportType);
        const bVal = getColumnNumericValue(b, ptsColumn, sportType);
        return bVal - aVal;
      });

      currentSort.column = 'pts';
      currentSort.ascending = false;
    }
  }
}
  // Determine which columns to hide based on filters
  const hideSchool = filters.schoolId && filters.schoolId !== '';
  const hideSport = filters.sport && filters.sport !== '';
  
  // Set default stat category based on sport if not already set appropriately
  if (displayRecords.length > 0) {
    const sportType = detectSportType(displayRecords[0].sport);
    if (sportType === 'football' && ['batting', 'pitching'].includes(currentStatCategory)) {
      currentStatCategory = 'rushing'; // Default for football
    } else if ((sportType === 'baseball' || sportType === 'softball') && 
               ['passing', 'rushing', 'defense'].includes(currentStatCategory)) {
      currentStatCategory = 'batting'; // Default for baseball/softball
    }
  }
    currentRecords = [...displayRecords];

// 🔥 Apply intelligent default sort (only on fresh render)
if (!records && currentRecords.length > 0) {
  const defaultKey = getDefaultSortKey(
    filters.sport || currentRecords[0]?.sport,
    currentStatCategory
  );

  const sportType = detectSportType(currentRecords[0]?.sport);
  const columnsForSort = getDisplayColumns(
    filters.sport || currentRecords[0]?.sport,
    currentStatCategory
  );

  const colConfig = columnsForSort.find(c => c.key === defaultKey);

  if (colConfig) {
    currentRecords.sort((a, b) => {
      const aVal = getColumnNumericValue(a, colConfig, sportType);
      const bVal = getColumnNumericValue(b, colConfig, sportType);

      return defaultKey === 'era'
        ? aVal - bVal   // ERA ascending
        : bVal - aVal;  // everything else descending
    });

    currentSort.column = defaultKey;
    currentSort.ascending = defaultKey === 'era';
  }
}
  if (!displayRecords.length) {
    container.innerHTML = "<p>No records found.</p>";
    return;
  }

// Determine sport type safely based on filter
let sportType = 'mixed';

if (filters.sport && filters.sport !== '') {
  sportType = detectSportType(filters.sport);
}

const columns = sportType === 'mixed'
  ? basketballCoreColumns   // safe neutral columns
  : getDisplayColumns(filters.sport, currentStatCategory);

const needsCategories = sportType !== 'mixed' && sportNeedsCategories(filters.sport);

const canShowAdvancedToggle =
  sportType !== 'mixed' &&
  ['basketball', 'baseball', 'softball', 'football'].includes(sportType);

const totalPages = Math.ceil(currentRecords.length / recordsPerPage);
const start = (currentPage - 1) * recordsPerPage;
const end = start + recordsPerPage;
const pageRecords = currentRecords.slice(start, end);

  // Generate dynamic table headers
  const statHeaders = columns.map(col => 
    `<th data-sort="${col.key}">${col.label}</th>`
  ).join('');

  // Generate stat category tabs for baseball/softball/football
  const categoryTabsHTML = needsCategories ? `
    <div class="stat-category-tabs">
      ${getCategoriesForSport(displayRecords[0]?.sport).map(cat => `
        <button class="stat-tab ${currentStatCategory === cat.key ? 'active' : ''}" data-category="${cat.key}">
          ${cat.label}
        </button>
      `).join('')}
    </div>
  ` : '';

  const advancedToggleHTML = canShowAdvancedToggle ? `
    <button class="advanced-toggle" type="button" aria-expanded="${showAdvancedStats}">
      ${showAdvancedStats ? '− Hide Advanced Stats' : '+ Advanced Stats'}
    </button>
  ` : '';

  const tableHTML = `
    ${categoryTabsHTML}
    <div class="pagination-controls">
      <div class="pagination-info">
      Showing ${start + 1}-${Math.min(end, displayRecords.length)} of ${displayRecords.length} ${
       statsView === 'career-standard'
        ? 'players (4-year standard)'
        : statsView === 'career-extended'
        ? 'players (full participation)'
        : 'season records'
}
      </div>
      <div class="pagination-actions">
        ${advancedToggleHTML}
        <label for="perPage">Show:</label>
        <select id="perPage" class="per-page-selector">
          <option value="25" ${recordsPerPage === 25 ? 'selected' : ''}>25</option>
          <option value="50" ${recordsPerPage === 50 ? 'selected' : ''}>50</option>
          <option value="100" ${recordsPerPage === 100 ? 'selected' : ''}>100</option>
        </select>
        <div class="page-nav">
          <button class="prev-page" ${currentPage === 1 ? 'disabled' : ''}>← Prev</button>
          <span class="page-numbers">Page ${currentPage} of ${totalPages}</span>
          <button class="next-page" ${currentPage === totalPages ? 'disabled' : ''}>Next →</button>
        </div>
      </div>
    </div>
    <div class="stats-table-container">
      <table class="stats-table">
        <thead>
          <tr>
            <th data-sort="rank">#</th>
            <th data-sort="name">Player</th>
            ${hideSchool ? '' : '<th data-sort="school">School</th>'}
            ${hideSport ? '' : '<th data-sort="sport">Sport</th>'}
            <th data-sort="season">Season</th>
            ${statHeaders}
          </tr>
        </thead>
        <tbody>
          ${renderTableRows(pageRecords, start, sportType, hideSchool, hideSport, columns)}
        </tbody>
        </table>
         </div>
    ${statsView === 'career-extended' ? `
      <div class="eligibility-legend">
        * Indicates participation beyond the standard 4-year eligibility window.
      </div>
    ` : ''}

  `;

  container.innerHTML = tableHTML;

  // Add click handlers to table headers for sorting
  container.querySelectorAll("th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const column = th.dataset.sort;
      sortTable(column, container);
    });
  });

  // Stat category tabs
  container.querySelectorAll(".stat-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const category = tab.dataset.category;
      if (category !== currentStatCategory) {
        currentStatCategory = category;
        renderRecords(container, currentStatsView, currentFilters);
      }
    });
  });

  // Advanced toggle
  const advancedToggle = container.querySelector('.advanced-toggle');
  if (advancedToggle) {
    advancedToggle.addEventListener('click', () => {
      showAdvancedStats = !showAdvancedStats;
      renderRecords(container, currentStatsView, currentFilters);
    });
  }

  // Per page selector
  const perPageSelector = container.querySelector("#perPage");
  if (perPageSelector) {
    perPageSelector.addEventListener("change", (e) => {
      recordsPerPage = parseInt(e.target.value);
      currentPage = 1;
      renderRecords(container, currentStatsView, currentFilters);
    });
  }

  // Prev button
  const prevButton = container.querySelector(".prev-page");
  if (prevButton) {
    prevButton.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        renderRecords(container, currentStatsView, currentFilters);
      }
    });
  }

  // Next button
  const nextButton = container.querySelector(".next-page");
  if (nextButton) {
    nextButton.addEventListener("click", () => {
      const totalPages = Math.ceil(currentRecords.length / recordsPerPage);
      if (currentPage < totalPages) {
        currentPage++;
        renderRecords(container, currentStatsView, currentFilters);
      }
    });
  }
  // Apply intelligent default sort
  const defaultKey = getDefaultSortKey(
  filters.sport || displayRecords[0]?.sport,
  currentStatCategory
  );

  // Reset sort if sport or category changed
  if (currentSort.column !== defaultKey) {
  currentSort.column = defaultKey;

  // ERA should be ascending (lower is better)
  currentSort.ascending = defaultKey === 'era';
 }
}

function renderTableRows(records, startIndex = 0, sportType = 'basketball', hideSchool = false, hideSport = false, columns = []) {
  
  return records
    .map((record, index) => {
      const athleteName = record.stat_row?.["Athlete Name"] || "Unknown";
      const school = getSchoolAbbrev(record.school);
      const sport = record.sport || "";
      const season = record.season || "";
      
      // Generate dynamic stat cells based on sport columns
      const statCells = columns.map(col => {
        let value = getRawStatValue(record.stat_row, col.field, getStatAliases(col.field));

        if (sportType === 'basketball' && col.derivedRateField) {
          const derivedTotal = getDerivedBasketballTotal(record, col.field, col.derivedRateField);
          value = derivedTotal > 0 ? derivedTotal.toFixed(0) : '';
        }
        
        // Special handling for PTS column in basketball
        if (col.key === 'pts' && !value && currentStatsView === 'season' && sportType === 'basketball') {
          const gp = parseFloat(record.stat_row?.["GP"]) || 0;
          const ppg = parseFloat(record.stat_row?.["PPG"]) || 0;
          value = gp > 0 && ppg > 0 ? (gp * ppg).toFixed(0) : "";
        }

         // Display-only data quality hint for unusually high basketball career GP totals
          if (
          col.key === 'gp' &&
          (currentStatsView === 'career-standard' || currentStatsView === 'career-extended') &&
          sportType === 'basketball'
        ) {
         const gpValue = parseFloat(value) || 0;
         if (gpValue > 140) {
         value = `${value} ⚠`;
         }
        }

        // Derive AVG from H/AB whenever AB is available in row data
        if (col.key === 'avg') {
          const hits = getNumericStatValue(record.stat_row, 'H', getStatAliases('H'));
          const atBats = getNumericStatValue(record.stat_row, 'AB', getStatAliases('AB'));
          if (atBats > 0) {
            value = formatBattingAverage(hits, atBats);
          }
        }

        if (sportType === 'football' && col.key === 'recypg' && !value) {
          const gp = getNumericStatValue(record.stat_row, 'GP', getStatAliases('GP'));
          const receivingYards = getNumericStatValue(record.stat_row, 'Rec YDS', getStatAliases('Rec YDS'));
          if (gp > 0 && receivingYards > 0) {
            value = (receivingYards / gp).toFixed(1);
          }
        }
        
        return `<td>${value}</td>`;
      }).join('');

      return `
        <tr>
          <td>${startIndex + index + 1}</td>
          <td class="athlete-name">${athleteName}</td>
          ${hideSchool ? '' : `<td>${school}</td>`}
          ${hideSport ? '' : `<td>${sport}</td>`}
          <td>${season}</td>
          ${statCells}
        </tr>
      `;
    })
    .join("");
}

function sortTable(column, container) {
    if (!currentRecords || currentRecords.length === 0) return;
    if (currentSort.column === column) {
    currentSort.ascending = !currentSort.ascending;
  } else {
    currentSort.column = column;
    currentSort.ascending = false;
  }

  const sorted = [...currentRecords].sort((a, b) => {
    let aVal, bVal;

    switch (column) {
      case "rank":
        return 0;
      case "name":
        aVal = a.stat_row?.["Athlete Name"] || "";
        bVal = b.stat_row?.["Athlete Name"] || "";
        break;
      case "school":
        aVal = a.school || "";
        bVal = b.school || "";
        break;
      case "sport":
        aVal = a.sport || "";
        bVal = b.sport || "";
        break;
      case "season":
        aVal = a.season || "";
        bVal = b.season || "";
        break;
      default:
        // Dynamic column lookup - find the field mapping from sport columns
        const sportType = a.sport ? detectSportType(a.sport) : 'basketball';
        const columns = getDisplayColumns(a.sport || 'basketball', currentStatCategory);
        const colConfig = columns.find(c => c.key === column);
        
        if (colConfig) {
          aVal = getColumnNumericValue(a, colConfig, sportType);
          bVal = getColumnNumericValue(b, colConfig, sportType);
        } else {
          return 0;
        }
    }

    if (typeof aVal === "string") {
      return currentSort.ascending
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    } else {
      return currentSort.ascending ? aVal - bVal : bVal - aVal;
    }
  });

   currentRecords = sorted;
   currentPage = 1;

   // Re-render using already sorted records
   renderRecords(container, currentStatsView, currentFilters, currentRecords);
}
