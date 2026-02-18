/**
 * SUBMIT GAME - Athletic Director Interface
 * Handles all three submission methods and connects to parsers
 */

import { supabase } from '../supabaseClient.js';
import { parseTextBoxScore } from '../parsers/textParser.js';
import { parseCSV } from '../parsers/csvParser.js';
import { processAndSubmit, previewSubmission } from '../parsers/dataFormatter.js';

// State
let currentMethod = 'text';
let parsedData = null;
let currentUser = null;
let csvFileContent = null;

// Initialize
window.addEventListener('DOMContentLoaded', async () => {
  // Check authentication
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return;
  }

  // Get user profile
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  currentUser = profile;
  console.log('Logged in as:', currentUser.full_name);

  // Setup event listeners
  setupMethodSelector();
  setupTextParsing();
  setupCSVUpload();
  setupManualForm();
  setupPreview();
});

/**
 * Method selector setup
 */
function setupMethodSelector() {
  const cards = document.querySelectorAll('.method-card');
  const areas = document.querySelectorAll('.upload-area');

  cards.forEach(card => {
    card.addEventListener('click', () => {
      const method = card.dataset.method;
      
      // Update active states
      cards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      
      areas.forEach(a => a.classList.remove('active'));
      document.getElementById(`${method}Area`).classList.add('active');
      
      currentMethod = method;
      hidePreview();
    });
  });
}

/**
 * Text parsing setup
 */
function setupTextParsing() {
  const parseBtn = document.getElementById('parseTextBtn');
  const textInput = document.getElementById('textInput');

  parseBtn.addEventListener('click', async () => {
    const text = textInput.value.trim();
    
    if (!text) {
      alert('Please paste box score text first');
      return;
    }

    parseBtn.textContent = '🤖 Parsing...';
    parseBtn.disabled = true;

    try {
      // Parse the text
      parsedData = parseTextBoxScore(text);
      
      // Show preview
      displayPreview(parsedData, 'text', text);
      
    } catch (error) {
      alert('Error parsing text: ' + error.message);
      console.error(error);
    } finally {
      parseBtn.textContent = 'Parse & Preview';
      parseBtn.disabled = false;
    }
  });
}

/**
 * CSV upload setup
 */
function setupCSVUpload() {
  const dropZone = document.getElementById('csvDropZone');
  const fileInput = document.getElementById('csvInput');
  const fileNameDiv = document.getElementById('csvFileName');
  const parseBtn = document.getElementById('parseCSVBtn');

  // Click to browse
  dropZone.addEventListener('click', () => {
    fileInput.click();
  });

  // File selected
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      handleCSVFile(file);
    }
  });

  // Drag and drop
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
      handleCSVFile(file);
    } else {
      alert('Please upload a CSV file');
    }
  });

  // Parse button
  parseBtn.addEventListener('click', async () => {
    if (!csvFileContent) {
      alert('No CSV file loaded');
      return;
    }

    parseBtn.textContent = '🤖 Parsing CSV...';
    parseBtn.disabled = true;

    try {
      parsedData = parseCSV(csvFileContent);
      displayPreview(parsedData, 'csv', csvFileContent);
    } catch (error) {
      alert('Error parsing CSV: ' + error.message);
      console.error(error);
    } finally {
      parseBtn.textContent = 'Parse & Preview';
      parseBtn.disabled = false;
    }
  });
}

/**
 * Handle CSV file upload
 */
function handleCSVFile(file) {
  const reader = new FileReader();
  
  reader.onload = (e) => {
    csvFileContent = e.target.result;
    
    // Show file name
    const fileNameDiv = document.getElementById('csvFileName');
    fileNameDiv.innerHTML = `
      <div style="padding: 12px; background: #f7fafc; border-radius: 6px; display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 24px;">📄</span>
        <div>
          <strong>${file.name}</strong>
          <div style="font-size: 12px; color: #718096;">${(file.size / 1024).toFixed(2)} KB</div>
        </div>
      </div>
    `;
    fileNameDiv.style.display = 'block';
    
    // Show parse button
    document.getElementById('parseCSVBtn').style.display = 'block';
  };
  
  reader.readAsText(file);
}

/**
 * Manual form setup
 */
function setupManualForm() {
  const form = document.getElementById('manualForm');
  
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    
    // Collect form data
    const formData = {
      game: {
        date: document.getElementById('gameDate').value,
        sport: document.getElementById('sport').value,
        gender: document.getElementById('gender').value,
        location: document.getElementById('location').value,
        homeTeam: document.getElementById('homeTeam').value,
        homeScore: parseInt(document.getElementById('homeScore').value),
        awayTeam: document.getElementById('awayTeam').value,
        awayScore: parseInt(document.getElementById('awayScore').value)
      },
      players: [], // Manual form doesn't include player stats yet
      confidence: 100 // Manual entry is 100% confident
    };
    
    parsedData = formData;
    displayPreview(parsedData, 'manual');
  });
}

/**
 * Display preview of parsed data
 */
function displayPreview(data, method, originalData = null) {
  const previewSection = document.getElementById('previewSection');
  const previewContent = document.getElementById('previewContent');
  
  const game = data.game || {};
  const players = data.players || [];
  const confidence = data.confidence || 0;

  // Determine confidence class
  let confidenceClass = 'confidence-low';
  if (confidence >= 80) confidenceClass = 'confidence-high';
  else if (confidence >= 50) confidenceClass = 'confidence-medium';

  // Generate preview HTML
  previewContent.innerHTML = `
    <div class="preview-card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h3>Game Summary</h3>
        <span class="confidence-badge ${confidenceClass}">
          ${confidence}% Confidence
        </span>
      </div>

      <div class="stat-row">
        <strong>Date:</strong>
        <span>${game.date || 'Not specified'}</span>
      </div>

      <div class="stat-row">
        <strong>Sport:</strong>
        <span>${game.sport || 'Not specified'} (${game.gender || 'Not specified'})</span>
      </div>

      <div class="stat-row">
        <strong>Score:</strong>
        <span>${game.homeTeam} ${game.homeScore} - ${game.awayScore} ${game.awayTeam}</span>
      </div>

      <div class="stat-row">
        <strong>Location:</strong>
        <span>${game.location || 'Not specified'}</span>
      </div>

      <h4 style="margin-top: 24px; margin-bottom: 12px;">
        Player Statistics (${players.length} players)
      </h4>

      ${players.length > 0 ? `
        <div style="max-height: 300px; overflow-y: auto;">
          ${players.map(p => `
            <div class="stat-row">
              <strong>${p.name}</strong>
              <span style="font-family: monospace;">
                ${Object.entries(p.stats || {}).map(([key, val]) => `${key}: ${val}`).join(', ')}
              </span>
            </div>
          `).join('')}
        </div>
      ` : `
        <p style="color: #718096; font-style: italic;">No player stats included</p>
      `}

      ${confidence < 70 ? `
        <div style="margin-top: 20px; padding: 12px; background: #fef5e7; border-left: 4px solid #f39c12; border-radius: 4px;">
          <strong>⚠️ Low Confidence</strong>
          <p style="margin: 4px 0 0 0; font-size: 14px;">
            Some data may not have been parsed correctly. Please review carefully before submitting.
          </p>
        </div>
      ` : ''}
    </div>
  `;

  // Store original data for submission
  previewSection.dataset.method = method;
  previewSection.dataset.originalData = originalData || '';

  // Show preview section
  previewSection.style.display = 'block';
  previewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Setup preview actions (Submit & Edit buttons)
 */
function setupPreview() {
  const submitBtn = document.getElementById('submitBtn');
  const editBtn = document.getElementById('editBtn');

  submitBtn.addEventListener('click', async () => {
    if (!parsedData) {
      alert('No data to submit');
      return;
    }

    submitBtn.textContent = '📤 Submitting...';
    submitBtn.disabled = true;

    try {
      const previewSection = document.getElementById('previewSection');
      const method = previewSection.dataset.method;
      const originalData = previewSection.dataset.originalData;

      // Prepare metadata
      const metadata = {
        userId: currentUser.id,
        schoolId: currentUser.school_id,
        submissionMethod: method + '_paste',
        originalData: originalData,
        source: 'athletic_director_portal'
      };

      // Get the input data based on method
      let inputData;
      if (method === 'text') {
        inputData = originalData;
      } else if (method === 'csv') {
        inputData = originalData;
      } else {
        inputData = parsedData;
      }

      // Submit to Supabase (goes through parser -> formatter -> supabase)
      const result = await processAndSubmit(inputData, method, metadata);

      if (result.success) {
        alert('✅ Game submitted successfully! It will appear after admin approval.');
        window.location.href = 'dashboard.html';
      } else {
        throw new Error(result.error || 'Submission failed');
      }

    } catch (error) {
      alert('❌ Error submitting game: ' + error.message);
      console.error('Submission error:', error);
      submitBtn.textContent = '✓ Submit for Review';
      submitBtn.disabled = false;
    }
  });

  editBtn.addEventListener('click', () => {
    hidePreview();
  });
}

/**
 * Hide preview section
 */
function hidePreview() {
  document.getElementById('previewSection').style.display = 'none';
  parsedData = null;
}
