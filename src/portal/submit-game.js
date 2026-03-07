import { supabase } from "../supabaseClient.js";
import { inspectSpreadsheet, finalizeSpreadsheetParse } from "../parsers/spreadsheetParser.js";
import { formatForSupabase, submitToSupabase } from "../parsers/dataFormatter.js";
import { parseBoxScoreText } from "../parsers/boxScoreParser.js";

let currentUser = null;
let selectedFile = null;
let inspectionResult = null;
let finalizedData = null;
let mode2ParsedData = null;

const sportSelection = document.getElementById("sportSelection");
const seasonHint = document.getElementById("seasonHint");
const fileDropzone = document.getElementById("fileDropzone");
const spreadsheetInput = document.getElementById("spreadsheetInput");
const selectedFileBox = document.getElementById("selectedFile");
const inspectBtn = document.getElementById("inspectBtn");
const resetBtn = document.getElementById("resetBtn");
const leftStatus = document.getElementById("leftStatus");

const reviewCard = document.getElementById("reviewCard");
const reviewMetaGrid = document.getElementById("reviewMetaGrid");
const confidenceLabel = document.getElementById("confidenceLabel");
const confidenceBarFill = document.getElementById("confidenceBarFill");
const warningsList = document.getElementById("warningsList");
const mappingTableBody = document.getElementById("mappingTableBody");
const sheetPreviewHead = document.getElementById("sheetPreviewHead");
const sheetPreviewBody = document.getElementById("sheetPreviewBody");
const buildPreviewBtn = document.getElementById("buildPreviewBtn");

const finalPreviewCard = document.getElementById("finalPreviewCard");
const finalSummary = document.getElementById("finalSummary");
const playerPreviewList = document.getElementById("playerPreviewList");
const submitBtn = document.getElementById("submitBtn");
const backToReviewBtn = document.getElementById("backToReviewBtn");

const mode1Btn = document.getElementById("mode1Btn");
const mode2Btn = document.getElementById("mode2Btn");
const mode1Panel = document.getElementById("mode1Panel");
const mode2Panel = document.getElementById("mode2Panel");

const boxSportSelection = document.getElementById("boxSportSelection");
const boxScoreInput = document.getElementById("boxScoreInput");
const parseBoxScoreBtn = document.getElementById("parseBoxScoreBtn");
const boxStatus = document.getElementById("boxStatus");
const mode2PreviewCard = document.getElementById("mode2PreviewCard");
const mode2Summary = document.getElementById("mode2Summary");
const mode2Warnings = document.getElementById("mode2Warnings");
const mode2Players = document.getElementById("mode2Players");
const submitMode2Btn = document.getElementById("submitMode2Btn");

window.addEventListener("DOMContentLoaded", async () => {
  await requireAuth();
  setupFileUI();
  setupActions();
  switchSubmitMode("mode1");
});

async function requireAuth() {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = "login.html";
    return;
  }

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", session.user.id)
    .single();

  if (error || !profile) {
    alert("Could not load your profile. Please sign in again.");
    await supabase.auth.signOut();
    window.location.href = "login.html";
    return;
  }

  currentUser = profile;
  setStatus(`Signed in as ${profile.full_name} • ${profile.school_name || "School not set"}`);
}

function setupFileUI() {
  sportSelection.addEventListener("change", updateInspectState);
  spreadsheetInput.addEventListener("change", onFilePicked);

  fileDropzone.addEventListener("click", () => spreadsheetInput.click());

  fileDropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    fileDropzone.classList.add("dragover");
  });

  fileDropzone.addEventListener("dragleave", () => {
    fileDropzone.classList.remove("dragover");
  });

  fileDropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    fileDropzone.classList.remove("dragover");

    const file = event.dataTransfer.files?.[0];
    if (!file) return;

    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls") && !lower.endsWith(".csv")) {
      alert("Please upload an Excel or CSV file.");
      return;
    }

    selectedFile = file;
    renderSelectedFile();
    updateInspectState();
  });
}

function setupActions() {
  inspectBtn.addEventListener("click", handleInspect);
  resetBtn.addEventListener("click", hardReset);
  buildPreviewBtn.addEventListener("click", buildFinalPreview);
  backToReviewBtn.addEventListener("click", () => {
    finalPreviewCard.classList.add("hidden");
    reviewCard.classList.remove("hidden");
  });
  submitBtn.addEventListener("click", submitSpreadsheet);

  mode1Btn.addEventListener("click", () => switchSubmitMode("mode1"));
  mode2Btn.addEventListener("click", () => switchSubmitMode("mode2"));
  parseBoxScoreBtn.addEventListener("click", handleMode2Parse);
  submitMode2Btn.addEventListener("click", submitMode2BoxScore);
}

function onFilePicked(event) {
  const file = event.target.files?.[0];
  selectedFile = file || null;
  renderSelectedFile();
  updateInspectState();
}

function renderSelectedFile() {
  if (!selectedFile) {
    selectedFileBox.style.display = "none";
    selectedFileBox.innerHTML = "";
    return;
  }

  selectedFileBox.style.display = "block";
  selectedFileBox.innerHTML = `
    <strong>${selectedFile.name}</strong>
    <span>${(selectedFile.size / 1024).toFixed(1)} KB • Ready for inspection</span>
  `;
}

function updateInspectState() {
  inspectBtn.disabled = !(sportSelection.value && selectedFile);
}

function setStatus(message) {
  leftStatus.textContent = message;
}

function resolveSportSelection(value) {
  switch (value) {
    case "boys_basketball":
      return { sport: "basketball", gender: "boys", label: "Boys Basketball" };
    case "girls_basketball":
      return { sport: "basketball", gender: "girls", label: "Girls Basketball" };
    case "girls_volleyball":
      return { sport: "volleyball", gender: "girls", label: "Girls Volleyball" };
    case "boys_soccer":
      return { sport: "soccer", gender: "boys", label: "Boys Soccer" };
    case "girls_soccer":
      return { sport: "soccer", gender: "girls", label: "Girls Soccer" };
    case "football":
      return { sport: "football", gender: null, label: "Football" };
    case "baseball":
      return { sport: "baseball", gender: null, label: "Baseball" };
    case "softball":
      return { sport: "softball", gender: null, label: "Softball" };
    default:
      return { sport: null, gender: null, label: "" };
  }
}

async function handleInspect() {
  if (!selectedFile || !sportSelection.value) {
    alert("Choose a sport and file first.");
    return;
  }

  inspectBtn.disabled = true;
  inspectBtn.textContent = "Inspecting...";
  setStatus("Inspecting spreadsheet...");

  try {
    inspectionResult = await inspectSpreadsheet(selectedFile, sportSelection.value);
    finalizedData = null;
    renderReview(inspectionResult);
    reviewCard.classList.remove("hidden");
    finalPreviewCard.classList.add("hidden");
    setStatus("Inspection complete. Review the column mapping.");
  } catch (error) {
    console.error(error);
    alert(error.message || "Could not inspect spreadsheet.");
    setStatus("Inspection failed");
  } finally {
    inspectBtn.disabled = false;
    inspectBtn.textContent = "Inspect Spreadsheet";
  }
}

function renderReview(inspection) {
  const sportMeta = resolveSportSelection(sportSelection.value);

  reviewMetaGrid.innerHTML = `
    <div class="meta-chip">
      <span class="label">School</span>
      <span class="value">${currentUser.school_name || currentUser.school_id || "Unknown"}</span>
    </div>
    <div class="meta-chip">
      <span class="label">Sport</span>
      <span class="value">${sportMeta.label}</span>
    </div>
    <div class="meta-chip">
      <span class="label">File</span>
      <span class="value">${inspection.fileName}</span>
    </div>
    <div class="meta-chip">
      <span class="label">Rows found</span>
      <span class="value">${inspection.dataRows.length}</span>
    </div>
  `;

  confidenceLabel.textContent = `${inspection.confidence}%`;
  confidenceBarFill.style.width = `${inspection.confidence}%`;

  warningsList.innerHTML = "";
  if (inspection.warnings.length) {
    inspection.warnings.forEach((warning) => {
      const li = document.createElement("li");
      li.textContent = warning;
      warningsList.appendChild(li);
    });
  } else {
    const li = document.createElement("li");
    li.textContent = "No major warnings found during inspection.";
    warningsList.appendChild(li);
  }

  mappingTableBody.innerHTML = inspection.mappings.map((mapping) => {
    const statusClass =
      mapping.status === "exact"
        ? "tag-exact"
        : mapping.status === "likely"
        ? "tag-likely"
        : "tag-unknown";

    const statusLabel =
      mapping.status === "exact"
        ? "Recognized"
        : mapping.status === "likely"
        ? "Needs quick check"
        : "Needs confirmation";

    const options = buildOptionsForMapping(mapping, inspection.options);

    const mappedValue = mapping.mappedTo || mapping.suggested || "";

    return `
      <tr>
        <td><strong>${escapeHtml(mapping.originalHeader)}</strong></td>
        <td><span class="tag ${statusClass}">${statusLabel}</span></td>
        <td>
          <select class="mapping-select" data-header="${escapeHtmlAttr(mapping.originalHeader)}">
            ${options.map((option) => `
              <option value="${escapeHtmlAttr(option.value)}" ${option.value === mappedValue ? "selected" : ""}>
                ${escapeHtml(option.label)}
              </option>
            `).join("")}
          </select>
        </td>
        <td class="sample-values">${escapeHtml(mapping.sampleValues.join(" • ") || "No sample values")}</td>
      </tr>
    `;
  }).join("");

  renderSheetPreview(inspection);
}

function buildOptionsForMapping(mapping, defaultOptions) {
  const all = [...defaultOptions];
  const currentValues = new Set(all.map((o) => o.value));

  (mapping.options || []).forEach((value) => {
    if (!currentValues.has(value)) {
      all.push({ value, label: value });
      currentValues.add(value);
    }
  });

  return all;
}

function renderSheetPreview(inspection) {
  sheetPreviewHead.innerHTML = `
    <tr>
      ${inspection.rawHeaders.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}
    </tr>
  `;

  sheetPreviewBody.innerHTML = inspection.previewRows.map((row) => `
    <tr>
      ${inspection.rawHeaders.map((header) => `<td>${escapeHtml(String(row[header] ?? ""))}</td>`).join("")}
    </tr>
  `).join("");
}

function collectMappingSelections() {
  const selections = {};
  document.querySelectorAll(".mapping-select").forEach((select) => {
    selections[select.dataset.header] = select.value;
  });
  return selections;
}

function buildFinalPreview() {
  if (!inspectionResult) {
    alert("Inspect a spreadsheet first.");
    return;
  }

  const sportMeta = resolveSportSelection(sportSelection.value);

  try {
    finalizedData = finalizeSpreadsheetParse(inspectionResult, collectMappingSelections(), {
      sport: sportMeta.sport,
      gender: sportMeta.gender,
      seasonHint: seasonHint.value.trim(),
      defaultSchoolId: currentUser.school_id || null,
      defaultSchoolName: currentUser.school_name || null,
    });

    renderFinalPreview(finalizedData, sportMeta.label);
    reviewCard.classList.add("hidden");
    finalPreviewCard.classList.remove("hidden");
    setStatus("Preview ready. Submit when satisfied.");
  } catch (error) {
    console.error(error);
    alert(error.message || "Could not build final preview.");
  }
}

function renderFinalPreview(data, sportLabel) {
  finalSummary.innerHTML = `
    <div class="summary-row">
      <strong>Submission type</strong>
      <span>Spreadsheet upload (${data.submission_scope})</span>
    </div>
    <div class="summary-row">
      <strong>School</strong>
      <span>${currentUser.school_name || currentUser.school_id || "Unknown"}</span>
    </div>
    <div class="summary-row">
      <strong>Sport</strong>
      <span>${sportLabel}</span>
    </div>
    <div class="summary-row">
      <strong>Players parsed</strong>
      <span>${data.players.length}</span>
    </div>
    <div class="summary-row">
      <strong>Confidence</strong>
      <span>${data.confidence}%</span>
    </div>
    <div class="summary-row">
      <strong>Detected seasons</strong>
      <span>${(data.parse_review?.detected_seasons || []).join(", ") || seasonHint.value.trim() || "Not detected"}</span>
    </div>
  `;

  playerPreviewList.innerHTML = data.players.slice(0, 30).map((player) => `
    <div class="player-preview-item">
      <strong>${escapeHtml(player.name)}</strong>
      <span>${escapeHtml(
        Object.entries(player.stats || {})
          .map(([key, value]) => `${key}: ${value}`)
          .join(", ") || "No parsed stats"
      )}</span>
    </div>
  `).join("");
}

async function submitSpreadsheet() {
  if (!finalizedData) {
    alert("Build the final preview first.");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting...";
  setStatus("Submitting to Supabase...");

  try {
    const metadata = {
      userId: currentUser.id,
      schoolId: currentUser.school_id,
      defaultSchoolId: currentUser.school_id,
      defaultSchoolName: currentUser.school_name,
      submissionMethod: "csv_upload",
      originalData: selectedFile ? selectedFile.name : null,
      source: "athletic_director_portal",
      selectedSportValue: sportSelection.value,
      seasonHint: seasonHint.value.trim() || null,
    };

    const formatted = await formatForSupabase(finalizedData, metadata);
    const result = await submitToSupabase(formatted);

    if (!result.success) {
      throw new Error(result.error || "Submission failed.");
    }

    alert("✅ Spreadsheet submitted successfully. It is now pending admin review.");
    window.location.href = "dashboard.html";
  } catch (error) {
    console.error(error);
    alert(`❌ ${error.message || "Could not submit spreadsheet."}`);
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit for Admin Review";
    setStatus("Submission failed");
  }
}

function hardReset() {
  selectedFile = null;
  inspectionResult = null;
  finalizedData = null;
  spreadsheetInput.value = "";
  sportSelection.value = "";
  seasonHint.value = "";
  renderSelectedFile();
  updateInspectState();
  reviewCard.classList.add("hidden");
  finalPreviewCard.classList.add("hidden");
  setStatus("Waiting for file");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeHtmlAttr(value) {
  return escapeHtml(value);
}

function switchSubmitMode(mode) {
  const isMode1 = mode === "mode1";

  mode1Panel.classList.toggle("hidden", !isMode1);
  mode2Panel.classList.toggle("hidden", isMode1);

  mode1Btn.classList.toggle("portal-btn-primary", isMode1);
  mode1Btn.classList.toggle("portal-btn-secondary", !isMode1);

  mode2Btn.classList.toggle("portal-btn-primary", !isMode1);
  mode2Btn.classList.toggle("portal-btn-secondary", isMode1);
}

function handleMode2Parse() {
  const sportValue = boxSportSelection.value;
  const text = boxScoreInput.value.trim();

  if (!sportValue) {
    alert("Select a sport first.");
    return;
  }

  if (!text) {
    alert("Paste a box score or game summary first.");
    return;
  }

  parseBoxScoreBtn.disabled = true;
  parseBoxScoreBtn.textContent = "Parsing...";
  boxStatus.textContent = "Parsing box score...";

  try {
    mode2ParsedData = parseBoxScoreText(text, sportValue);
    renderMode2Preview(mode2ParsedData);
    mode2PreviewCard.classList.remove("hidden");
    boxStatus.textContent = "Box score parsed. Review before submit.";
  } catch (error) {
    console.error(error);
    alert(error.message || "Could not parse box score.");
    boxStatus.textContent = "Box score parsing failed.";
  } finally {
    parseBoxScoreBtn.disabled = false;
    parseBoxScoreBtn.textContent = "Parse Box Score";
  }
}

function renderMode2Preview(data) {
  const game = data.game || {};
  const players = data.players || [];

  mode2Summary.innerHTML = `
    <div class="summary-row">
      <strong>Date</strong>
      <span>${game.date || "Not detected"}</span>
    </div>
    <div class="summary-row">
      <strong>Sport</strong>
      <span>${game.sport || "Not detected"} ${game.gender ? `(${game.gender})` : ""}</span>
    </div>
    <div class="summary-row">
      <strong>Game</strong>
      <span>${game.homeTeam || "Home"} ${game.homeScore ?? "?"} - ${game.awayScore ?? "?"} ${game.awayTeam || "Away"}</span>
    </div>
    <div class="summary-row">
      <strong>Location</strong>
      <span>${game.location || "Not detected"}</span>
    </div>
    <div class="summary-row">
      <strong>Players parsed</strong>
      <span>${players.length}</span>
    </div>
    <div class="summary-row">
      <strong>Confidence</strong>
      <span>${data.confidence || 0}%</span>
    </div>
  `;

  mode2Warnings.innerHTML = "";
  const warnings = data.warnings || [];
  if (warnings.length) {
    warnings.forEach((warning) => {
      const li = document.createElement("li");
      li.textContent = warning;
      mode2Warnings.appendChild(li);
    });
  } else {
    const li = document.createElement("li");
    li.textContent = "No major warnings found.";
    mode2Warnings.appendChild(li);
  }

  mode2Players.innerHTML = players.length
    ? players.map((player) => `
        <div class="player-preview-item">
          <strong>${escapeHtml(player.name)}</strong>
          <span>${escapeHtml(
            Object.entries(player.stats || {})
              .map(([key, value]) => `${key}: ${value}`)
              .join(", ") || "No parsed stats"
          )}</span>
        </div>
      `).join("")
    : `<div class="player-preview-item"><strong>No players detected</strong><span>Try pasting cleaner game summary text.</span></div>`;
}

async function submitMode2BoxScore() {
  if (!mode2ParsedData) {
    alert("Parse a box score first.");
    return;
  }

  submitMode2Btn.disabled = true;
  submitMode2Btn.textContent = "Submitting...";
  boxStatus.textContent = "Submitting box score...";

  try {
    const sportMeta = resolveMode2Sport(boxSportSelection.value);

    const metadata = {
      userId: currentUser.id,
      schoolId: currentUser.school_id,
      defaultSchoolId: currentUser.school_id,
      defaultSchoolName: currentUser.school_name,
      submissionMethod: "text_paste",
      originalData: boxScoreInput.value.trim(),
      source: "athletic_director_portal",
      sport: sportMeta.sport,
      gender: sportMeta.gender,
    };

    const formatted = await formatForSupabase(mode2ParsedData, metadata);
    const result = await submitToSupabase(formatted);

    if (!result.success) {
      throw new Error(result.error || "Submission failed.");
    }

    boxStatus.textContent = "✅ Box score submitted successfully and is now pending admin review.";
    mode2PreviewCard.classList.add("hidden");
    boxScoreInput.value = "";
    boxSportSelection.value = "";
    mode2ParsedData = null;
  } catch (error) {
    console.error(error);
    alert(`❌ ${error.message || "Could not submit box score."}`);
    boxStatus.textContent = "Box score submission failed.";
  } finally {
    submitMode2Btn.disabled = false;
    submitMode2Btn.textContent = "Submit Box Score";
  }
}

function resolveMode2Sport(value) {
  switch (value) {
    case "boys_basketball":
      return { sport: "basketball", gender: "boys" };
    case "girls_basketball":
      return { sport: "basketball", gender: "girls" };
    case "girls_volleyball":
      return { sport: "volleyball", gender: "girls" };
    case "boys_soccer":
      return { sport: "soccer", gender: "boys" };
    case "girls_soccer":
      return { sport: "soccer", gender: "girls" };
    case "football":
      return { sport: "football", gender: null };
    case "baseball":
      return { sport: "baseball", gender: null };
    case "softball":
      return { sport: "softball", gender: null };
    default:
      return { sport: null, gender: null };
  }
}
