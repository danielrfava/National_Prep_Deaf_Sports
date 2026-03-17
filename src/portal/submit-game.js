import { supabase } from "../supabaseClient.js";
import { inspectSpreadsheet, finalizeSpreadsheetParse } from "../parsers/spreadsheetParser.js";
import { formatForSupabase, submitToSupabase } from "../parsers/dataFormatter.js";
import { parseBoxScoreText } from "../parsers/boxScoreParser.js";
import {
  getHistoricalTemplates,
  getTemplateDefinitionById,
  resolveSportTemplate,
  triggerTemplateDownload,
} from "./submissionTemplateCatalog.js";
import {
  buildAccountStatusHref,
  buildActivationHref,
  fetchCurrentSessionProfile,
  getBlockedAccessMessage,
  isAdminProfile,
  isApprovedSchoolProfile,
  needsActivationProfile,
  setPortalFlash,
} from "./schoolAccess.js";
import {
  footballFormatLabel,
  isFootballSportValue,
  normalizeFootballFormat,
  populateFootballFormatSelect,
  resolveFootballFormatForSport,
} from "../footballFormat.js";

const MODE2_MAPPING_STORAGE_KEY = "npds_mode2_mapping_profiles_v1";

let currentUser = null;
let selectedFile = null;
let inspectionResult = null;
let finalizedData = null;
let mode2ParsedData = null;
let mode2SelectedFile = null;
let pdfSelectedFile = null;
let pdfDraftPayload = null;
let activeSubmissionMode = "modern";
let activeSubmitMode = "mode1";
let templateGuideOpen = false;
let historicalTemplatesOpen = false;

const sportSelection = document.getElementById("sportSelection");
const footballFormatField = document.getElementById("footballFormatField");
const footballFormatSelection = document.getElementById("footballFormatSelection");
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
const mode1MetaFields = document.getElementById("mode1MetaFields");
const mode1Panel = document.getElementById("mode1Panel");
const mode2Panel = document.getElementById("mode2Panel");
const mode1QuickIntake = document.getElementById("mode1QuickIntake");
const mode2QuickHint = document.getElementById("mode2QuickHint");
const modeCardModern = document.getElementById("modeCardModern");
const modeCardPdf = document.getElementById("modeCardPdf");
const modeCardSchedule = document.getElementById("modeCardSchedule");
const modeCardArchive = document.getElementById("modeCardArchive");
const modeModernPanel = document.getElementById("modeModernPanel");
const modePdfPanel = document.getElementById("modePdfPanel");
const modeSchedulePanel = document.getElementById("modeSchedulePanel");
const modeArchivePanel = document.getElementById("modeArchivePanel");
const templateToolkitTitle = document.getElementById("templateToolkitTitle");
const templateToolkitDescription = document.getElementById("templateToolkitDescription");
const templateToolkitContext = document.getElementById("templateToolkitContext");
const downloadTemplateBtn = document.getElementById("downloadTemplateBtn");
const headerGuideBtn = document.getElementById("headerGuideBtn");
const historicalTemplateBtn = document.getElementById("historicalTemplateBtn");
const headerGuidePanel = document.getElementById("headerGuidePanel");
const historicalTemplatePanel = document.getElementById("historicalTemplatePanel");

const boxSportSelection = document.getElementById("boxSportSelection");
const boxFootballFormatField = document.getElementById("boxFootballFormatField");
const boxFootballFormatSelection = document.getElementById("boxFootballFormatSelection");
const mode2SourceSelection = document.getElementById("mode2SourceSelection");
const mode2LaneSelection = document.getElementById("mode2LaneSelection");
const mode2TextLane = document.getElementById("mode2TextLane");
const mode2FileLane = document.getElementById("mode2FileLane");
const boxScoreInput = document.getElementById("boxScoreInput");
const parseBoxScoreBtn = document.getElementById("parseBoxScoreBtn");
const mode2SeasonHint = document.getElementById("mode2SeasonHint");
const mode2FileDropzone = document.getElementById("mode2FileDropzone");
const mode2FileInput = document.getElementById("mode2FileInput");
const mode2SelectedFileBox = document.getElementById("mode2SelectedFile");
const processMode2FileBtn = document.getElementById("processMode2FileBtn");
const boxStatus = document.getElementById("boxStatus");
const mode2PreviewCard = document.getElementById("mode2PreviewCard");
const mode2Summary = document.getElementById("mode2Summary");
const mode2Warnings = document.getElementById("mode2Warnings");
const mode2Players = document.getElementById("mode2Players");
const submitMode2Btn = document.getElementById("submitMode2Btn");
const pdfSportSelection = document.getElementById("pdfSportSelection");
const pdfFootballFormatField = document.getElementById("pdfFootballFormatField");
const pdfFootballFormatSelection = document.getElementById("pdfFootballFormatSelection");
const pdfSeasonHint = document.getElementById("pdfSeasonHint");
const pdfDropzone = document.getElementById("pdfDropzone");
const pdfInput = document.getElementById("pdfInput");
const pdfSelectedFileBox = document.getElementById("pdfSelectedFile");
const pdfInspectBtn = document.getElementById("pdfInspectBtn");
const pdfStatus = document.getElementById("pdfStatus");
const pdfPreviewCard = document.getElementById("pdfPreviewCard");
const pdfSummary = document.getElementById("pdfSummary");
const pdfWarnings = document.getElementById("pdfWarnings");
const submitPdfBtn = document.getElementById("submitPdfBtn");

window.addEventListener("DOMContentLoaded", async () => {
  await requireAuth();
  setupFootballFormatFields();
  setupFileUI();
  setupMode2FileUI();
  setupPdfFileUI();
  setupActions();
  switchSubmissionMode("modern");
  switchSubmitMode("mode1");
  renderTemplateToolkit();
});

async function requireAuth() {
  const { session, profile, profileError } = await fetchCurrentSessionProfile();

  if (!session) {
    window.location.href = "login.html";
    return;
  }

  if (profileError || !profile) {
    setPortalFlash("Could not load your profile. Please sign in again.");
    await supabase.auth.signOut();
    window.location.href = "login.html";
    return;
  }

  if (isAdminProfile(profile)) {
    window.location.href = "../admin/admin-dashboard.html";
    return;
  }

  if (needsActivationProfile(profile)) {
    window.location.href = buildActivationHref();
    return;
  }

  if (!isApprovedSchoolProfile(profile)) {
    setPortalFlash(getBlockedAccessMessage(profile));
    window.location.href = buildAccountStatusHref();
    return;
  }

  currentUser = profile;
  setStatus(`Signed in as ${profile.full_name} - ${profile.school_name || "School not set"}`);
}

function setupFootballFormatFields() {
  populateFootballFormatSelect(footballFormatSelection);
  populateFootballFormatSelect(boxFootballFormatSelection);
  populateFootballFormatSelect(pdfFootballFormatSelection);

  syncFootballFormatField(sportSelection, footballFormatField);
  syncFootballFormatField(boxSportSelection, boxFootballFormatField);
  syncFootballFormatField(pdfSportSelection, pdfFootballFormatField);
}

function syncFootballFormatField(sportSelect, formatField) {
  if (!sportSelect || !formatField) {
    return;
  }

  formatField.classList.toggle("hidden", !isFootballSportValue(sportSelect.value));
}

function setupFileUI() {
  sportSelection.addEventListener("change", () => {
    syncFootballFormatField(sportSelection, footballFormatField);
    updateInspectState();
    renderTemplateToolkit();
  });
  footballFormatSelection?.addEventListener("change", updateInspectState);
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

function setupMode2FileUI() {
  if (!mode2FileInput || !mode2FileDropzone || !mode2SelectedFileBox) {
    return;
  }

  mode2FileInput.addEventListener("change", onMode2FilePicked);
  mode2FileDropzone.addEventListener("click", () => mode2FileInput.click());

  mode2FileDropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    mode2FileDropzone.classList.add("dragover");
  });

  mode2FileDropzone.addEventListener("dragleave", () => {
    mode2FileDropzone.classList.remove("dragover");
  });

  mode2FileDropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    mode2FileDropzone.classList.remove("dragover");

    const file = event.dataTransfer.files?.[0];
    if (!file) return;

    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls") && !lower.endsWith(".csv")) {
      alert("Please upload an Excel or CSV export file.");
      return;
    }

    mode2SelectedFile = file;
    renderMode2SelectedFile();
  });
}

function setupPdfFileUI() {
  if (!pdfInput || !pdfDropzone || !pdfSelectedFileBox) {
    return;
  }

  pdfInput.addEventListener("change", onPdfFilePicked);
  pdfDropzone.addEventListener("click", () => pdfInput.click());

  pdfDropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    pdfDropzone.classList.add("dragover");
  });

  pdfDropzone.addEventListener("dragleave", () => {
    pdfDropzone.classList.remove("dragover");
  });

  pdfDropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    pdfDropzone.classList.remove("dragover");

    const file = event.dataTransfer.files?.[0];
    if (!file) return;

    if (!isPdfFile(file)) {
      alert("Please upload a PDF evidence file.");
      return;
    }

    pdfSelectedFile = file;
    renderPdfSelectedFile();
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

  if (mode1Btn) {
    mode1Btn.addEventListener("click", () => switchSubmitMode("mode1"));
  }

  if (mode2Btn) {
    mode2Btn.addEventListener("click", () => switchSubmitMode("mode2"));
  }

  if (downloadTemplateBtn) {
    downloadTemplateBtn.addEventListener("click", handleTemplateDownloadClick);
  }

  if (headerGuideBtn) {
    headerGuideBtn.addEventListener("click", handleHeaderGuideClick);
  }

  if (historicalTemplateBtn) {
    historicalTemplateBtn.addEventListener("click", handleHistoricalTemplatesClick);
  }

  if (historicalTemplatePanel) {
    historicalTemplatePanel.addEventListener("click", handleHistoricalTemplatePanelClick);
  }

  if (mode2LaneSelection) {
    mode2LaneSelection.addEventListener("change", handleMode2LaneChange);
  }

  if (boxSportSelection) {
    boxSportSelection.addEventListener("change", () => {
      syncFootballFormatField(boxSportSelection, boxFootballFormatField);
      renderTemplateToolkit();
    });
  }

  if (pdfSportSelection) {
    pdfSportSelection.addEventListener("change", () => {
      syncFootballFormatField(pdfSportSelection, pdfFootballFormatField);
    });
  }

  if (parseBoxScoreBtn) {
    parseBoxScoreBtn.addEventListener("click", handleMode2Parse);
  }

  if (processMode2FileBtn) {
    processMode2FileBtn.addEventListener("click", handleMode2FileProcess);
  }

  if (submitMode2Btn) {
    submitMode2Btn.addEventListener("click", submitMode2BoxScore);
  }

  if (modeCardModern) {
    modeCardModern.addEventListener("click", () => switchSubmissionMode("modern"));
  }

  if (modeCardPdf) {
    modeCardPdf.addEventListener("click", () => switchSubmissionMode("pdf"));
  }

  if (modeCardSchedule) {
    modeCardSchedule.addEventListener("click", () => switchSubmissionMode("schedule"));
  }

  if (modeCardArchive) {
    modeCardArchive.addEventListener("click", () => switchSubmissionMode("archive"));
  }

  if (pdfInspectBtn) {
    pdfInspectBtn.addEventListener("click", handlePdfInspect);
  }

  if (submitPdfBtn) {
    submitPdfBtn.addEventListener("click", submitPdfUpload);
  }
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
    <span>${(selectedFile.size / 1024).toFixed(1)} KB - Ready for inspection</span>
  `;
}

function onMode2FilePicked(event) {
  const file = event.target.files?.[0];
  mode2SelectedFile = file || null;
  renderMode2SelectedFile();
}

function renderMode2SelectedFile() {
  if (!mode2SelectedFileBox) {
    return;
  }

  if (!mode2SelectedFile) {
    mode2SelectedFileBox.style.display = "none";
    mode2SelectedFileBox.innerHTML = "";
    return;
  }

  mode2SelectedFileBox.style.display = "block";
  mode2SelectedFileBox.innerHTML = `
    <strong>${mode2SelectedFile.name}</strong>
    <span>${(mode2SelectedFile.size / 1024).toFixed(1)} KB - Ready to process</span>
  `;
}

function onPdfFilePicked(event) {
  const file = event.target.files?.[0];
  pdfSelectedFile = file || null;
  renderPdfSelectedFile();
}

function renderPdfSelectedFile() {
  if (!pdfSelectedFileBox) {
    return;
  }

  if (!pdfSelectedFile) {
    pdfSelectedFileBox.style.display = "none";
    pdfSelectedFileBox.innerHTML = "";
    return;
  }

  pdfSelectedFileBox.style.display = "block";
  pdfSelectedFileBox.innerHTML = `
    <strong>${pdfSelectedFile.name}</strong>
    <span>${(pdfSelectedFile.size / 1024).toFixed(1)} KB - Ready for evidence inspection</span>
  `;
}

function updateInspectState() {
  const requiresFootballFormat = isFootballSportValue(sportSelection.value);
  const hasFootballFormat =
    !requiresFootballFormat ||
    Boolean(normalizeFootballFormat(footballFormatSelection?.value, { allowBlank: true }));

  inspectBtn.disabled = !(sportSelection.value && selectedFile && hasFootballFormat);
}

function setStatus(message) {
  leftStatus.textContent = message;
}

function renderTemplateToolkit() {
  if (!templateToolkitTitle || !templateToolkitDescription || !templateToolkitContext) {
    return;
  }

  const context = buildTemplateToolkitContext();
  const activeTemplate = context.activeTemplate;

  templateToolkitTitle.textContent = context.title;
  templateToolkitDescription.textContent = context.description;
  templateToolkitContext.textContent = context.contextNote;

  if (downloadTemplateBtn) {
    downloadTemplateBtn.textContent = activeTemplate ? `Download ${activeTemplate.label}` : "Download Template";
    downloadTemplateBtn.disabled = !context.canDownloadCurrentTemplate;
  }

  if (headerGuideBtn) {
    headerGuideBtn.disabled = !context.canShowHeaderGuide;
  }

  if (headerGuidePanel) {
    const showGuide = templateGuideOpen && context.canShowHeaderGuide;
    headerGuidePanel.classList.toggle("hidden", !showGuide);
    headerGuidePanel.innerHTML = showGuide ? renderHeaderGuide(activeTemplate) : "";
  }

  if (historicalTemplatePanel) {
    historicalTemplatePanel.classList.toggle("hidden", !historicalTemplatesOpen);
    historicalTemplatePanel.innerHTML = historicalTemplatesOpen ? renderHistoricalTemplatePanel() : "";
  }
}

function buildTemplateToolkitContext() {
  if (activeSubmissionMode !== "modern") {
    return {
      title: "Templates live in Mode 1",
      description: "Switch back to the structured spreadsheet lane to access current-sport templates and historical downloads.",
      contextNote: "Evidence, schedule/results, and archive lanes stay review-routed and do not use spreadsheet template downloads.",
      activeTemplate: null,
      canDownloadCurrentTemplate: false,
      canShowHeaderGuide: false,
    };
  }

  if (activeSubmitMode === "mode1") {
    return buildLaneTemplateContext({
      laneLabel: "Spreadsheet upload",
      selectedSportValue: sportSelection?.value || "",
      allowSportTemplate: true,
    });
  }

  const selectedLane = mode2LaneSelection?.value || "boxscore_text";
  const isExportLane = selectedLane === "export_file";

  return buildLaneTemplateContext({
    laneLabel: isExportLane ? "Flexible export file" : "Flexible text box score",
    selectedSportValue: boxSportSelection?.value || "",
    allowSportTemplate: isExportLane,
  });
}

function buildLaneTemplateContext({ laneLabel, selectedSportValue, allowSportTemplate }) {
  const activeTemplate = allowSportTemplate ? resolveSportTemplate(selectedSportValue) : null;

  if (!allowSportTemplate) {
    return {
      title: "Templates support spreadsheet-style uploads",
      description: "Text box score intake does not use downloadable headers. Historical templates remain available when you need structured spreadsheets.",
      contextNote: "Switch to Spreadsheet or Flexible Export File to use sport-specific templates.",
      activeTemplate: null,
      canDownloadCurrentTemplate: false,
      canShowHeaderGuide: false,
    };
  }

  if (activeTemplate) {
    return {
      title: `${activeTemplate.label} ready`,
      description: `${activeTemplate.description} This is the best fit for the ${laneLabel} lane right now.`,
      contextNote: "Historical templates remain separate for archive-heavy intake and team schedule/results work.",
      activeTemplate,
      canDownloadCurrentTemplate: true,
      canShowHeaderGuide: true,
    };
  }

  if (selectedSportValue) {
    return {
      title: "First-wave templates are selective tonight",
      description: "Current sport-aware templates are available for basketball and volleyball. Other sports can still use the historical starter files for structured intake.",
      contextNote: "Pick basketball or volleyball for a parser-matched template, or open Historical Template for archive-focused downloads.",
      activeTemplate: null,
      canDownloadCurrentTemplate: false,
      canShowHeaderGuide: false,
    };
  }

  return {
    title: "Templates for Spreadsheet Uploads",
    description: "Select basketball or volleyball to unlock a parser-matched file and header guide for this lane.",
    contextNote: "Historical individual-season and schedule/results templates stay available even before a sport is selected.",
    activeTemplate: null,
    canDownloadCurrentTemplate: false,
    canShowHeaderGuide: false,
  };
}

function handleTemplateDownloadClick() {
  const context = buildTemplateToolkitContext();
  if (!context.canDownloadCurrentTemplate || !context.activeTemplate) {
    return;
  }

  triggerTemplateDownload(context.activeTemplate);
}

function handleHeaderGuideClick() {
  const context = buildTemplateToolkitContext();
  if (!context.canShowHeaderGuide || !context.activeTemplate) {
    return;
  }

  templateGuideOpen = !templateGuideOpen;
  renderTemplateToolkit();
}

function handleHistoricalTemplatesClick() {
  historicalTemplatesOpen = !historicalTemplatesOpen;
  renderTemplateToolkit();
}

function handleHistoricalTemplatePanelClick(event) {
  const button = event.target.closest("[data-template-download]");
  if (!button) {
    return;
  }

  const template = getTemplateDefinitionById(button.dataset.templateDownload);
  if (!template) {
    return;
  }

  triggerTemplateDownload(template);
}

function renderHeaderGuide(template) {
  if (!template) {
    return "";
  }

  return `
    <div class="template-drawer-head">
      <span class="template-kicker">Header Guide</span>
      <strong>${escapeHtml(template.label)}</strong>
      <p>${escapeHtml(template.description)}</p>
    </div>
    <div class="template-guide-grid">
      ${template.guideSections
        .map(
          (section) => `
            <article class="template-guide-card">
              <strong>${escapeHtml(section.label)}</strong>
              <div class="template-chip-row">
                ${section.headers.map((header) => `<span class="template-chip">${escapeHtml(header)}</span>`).join("")}
              </div>
            </article>
          `
        )
        .join("")}
    </div>
    <ul class="template-note-list">
      ${template.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}
    </ul>
  `;
}

function renderHistoricalTemplatePanel() {
  return `
    <div class="template-drawer-head">
      <span class="template-kicker">Historical Templates</span>
      <strong>Archive-friendly starter files</strong>
      <p>These templates are built for older season totals and school schedule/results work where admin review is still expected.</p>
    </div>
    <div class="template-history-grid">
      ${getHistoricalTemplates()
        .map(
          (template) => `
            <article class="template-history-card">
              <strong>${escapeHtml(template.label)}</strong>
              <p>${escapeHtml(template.description)}</p>
              <div class="template-chip-row">
                ${template.headers.map((header) => `<span class="template-chip">${escapeHtml(header)}</span>`).join("")}
              </div>
              <ul class="template-note-list">
                ${template.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}
              </ul>
              <div class="template-card-actions">
                <button
                  class="portal-btn portal-btn-secondary portal-btn-inline"
                  type="button"
                  data-template-download="${escapeHtmlAttr(template.id)}"
                >
                  Download CSV
                </button>
              </div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function ensureSchoolConfigured() {
  if (currentUser?.school_id) {
    return true;
  }

  alert("Your account is missing a school assignment. Ask an admin to update your profile before submitting.");
  return false;
}

function getValidatedFootballFormat(sportValue, formatSelect) {
  if (!isFootballSportValue(sportValue)) {
    return null;
  }

  const selectedValue = normalizeFootballFormat(formatSelect?.value, { allowBlank: true });
  if (selectedValue) {
    return selectedValue;
  }

  alert("Select a football format before continuing. Choose 11-man, 8-man, 6-man, or Unknown / Not Sure.");
  formatSelect?.focus();
  return false;
}

function buildFootballFormatSummaryRow(footballFormat) {
  if (!footballFormat) {
    return "";
  }

  return `
    <div class="summary-row">
      <strong>Football Format</strong>
      <span>${footballFormatLabel(footballFormat)}</span>
    </div>
  `;
}

function formatSportSummaryLabel(sport, gender, footballFormat) {
  if (!sport) {
    return "Not detected";
  }

  const prettySport = String(sport)
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
  const sportLabel = gender ? `${prettySport} (${gender})` : prettySport;
  if (!isFootballSportValue(sport) || !footballFormat) {
    return sportLabel;
  }

  return `${sportLabel} - ${footballFormatLabel(footballFormat)}`;
}

function resolveSportSelection(value, footballFormatValue = "") {
  switch (value) {
    case "boys_basketball":
      return { sport: "basketball", gender: "boys", label: "Boys Basketball", footballFormat: null };
    case "girls_basketball":
      return { sport: "basketball", gender: "girls", label: "Girls Basketball", footballFormat: null };
    case "girls_volleyball":
      return { sport: "volleyball", gender: "girls", label: "Girls Volleyball", footballFormat: null };
    case "boys_soccer":
      return { sport: "soccer", gender: "boys", label: "Boys Soccer", footballFormat: null };
    case "girls_soccer":
      return { sport: "soccer", gender: "girls", label: "Girls Soccer", footballFormat: null };
    case "football":
      return {
        sport: "football",
        gender: null,
        label: "Football",
        footballFormat: resolveFootballFormatForSport("football", footballFormatValue, {
          allowBlank: true,
        }),
      };
    case "baseball":
      return { sport: "baseball", gender: null, label: "Baseball", footballFormat: null };
    case "softball":
      return { sport: "softball", gender: null, label: "Softball", footballFormat: null };
    default:
      return { sport: null, gender: null, label: "", footballFormat: null };
  }
}

async function handleInspect() {
  if (!selectedFile || !sportSelection.value) {
    alert("Choose a sport and file first.");
    return;
  }

  if (getValidatedFootballFormat(sportSelection.value, footballFormatSelection) === false) {
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
  const sportMeta = resolveSportSelection(
    sportSelection.value,
    footballFormatSelection?.value || ""
  );

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
    ${
      sportMeta.footballFormat
        ? `
    <div class="meta-chip">
      <span class="label">Football Format</span>
      <span class="value">${footballFormatLabel(sportMeta.footballFormat)}</span>
    </div>
    `
        : ""
    }
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

  mappingTableBody.innerHTML = inspection.mappings
    .map((mapping) => {
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
            ${options
              .map(
                (option) => `
              <option value="${escapeHtmlAttr(option.value)}" ${option.value === mappedValue ? "selected" : ""}>
                ${escapeHtml(option.label)}
              </option>
            `
              )
              .join("")}
          </select>
        </td>
        <td class="sample-values">${escapeHtml(mapping.sampleValues.join(" | ") || "No sample values")}</td>
      </tr>
    `;
    })
    .join("");

  renderSheetPreview(inspection);
}

function buildOptionsForMapping(mapping, defaultOptions) {
  const all = [...defaultOptions];
  const currentValues = new Set(all.map((option) => option.value));

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

  sheetPreviewBody.innerHTML = inspection.previewRows
    .map(
      (row) => `
    <tr>
      ${inspection.rawHeaders
        .map((header) => `<td>${escapeHtml(String(row[header] ?? ""))}</td>`)
        .join("")}
    </tr>
  `
    )
    .join("");
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

  const footballFormat = getValidatedFootballFormat(sportSelection.value, footballFormatSelection);
  if (footballFormat === false) {
    return;
  }

  const sportMeta = resolveSportSelection(sportSelection.value, footballFormat);

  try {
    finalizedData = finalizeSpreadsheetParse(inspectionResult, collectMappingSelections(), {
      sport: sportMeta.sport,
      gender: sportMeta.gender,
      footballFormat: sportMeta.footballFormat,
      seasonHint: seasonHint.value.trim(),
      defaultSchoolId: currentUser.school_id || null,
      defaultSchoolName: currentUser.school_name || null,
    });

    const confidence = Number(finalizedData.confidence || 0);
    const routeLabel =
      confidence >= 90
        ? "Ready for import"
        : confidence >= 70
        ? "Needs field mapping"
        : "Manual review needed";

    finalizedData.parse_review = {
      ...(finalizedData.parse_review || {}),
      route_label: routeLabel,
      duplicate_risk: confidence >= 80 ? "low" : "medium",
    };

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
  const footballFormat = data?.game?.football_format || data?.parse_review?.football_format || null;

  finalSummary.innerHTML = `
    <div class="summary-row">
      <strong>Submission type</strong>
      <span>Spreadsheet upload (${data.submission_scope})</span>
    </div>
    <div class="summary-row">
      <strong>Route label</strong>
      <span>${data.parse_review?.route_label || "Manual review needed"}</span>
    </div>
    <div class="summary-row">
      <strong>Duplicate risk</strong>
      <span>${data.parse_review?.duplicate_risk || "low"}</span>
    </div>
    <div class="summary-row">
      <strong>School</strong>
      <span>${currentUser.school_name || currentUser.school_id || "Unknown"}</span>
    </div>
    <div class="summary-row">
      <strong>Sport</strong>
      <span>${sportLabel}</span>
    </div>
    ${buildFootballFormatSummaryRow(footballFormat)}
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

  playerPreviewList.innerHTML = data.players
    .slice(0, 30)
    .map(
      (player) => `
    <div class="player-preview-item">
      <strong>${escapeHtml(player.name)}</strong>
      <span>${escapeHtml(
        Object.entries(player.stats || {})
          .map(([key, value]) => `${key}: ${value}`)
          .join(", ") || "No parsed stats"
      )}</span>
    </div>
  `
    )
    .join("");
}

async function submitSpreadsheet() {
  if (!finalizedData) {
    alert("Build the final preview first.");
    return;
  }

  if (!ensureSchoolConfigured()) {
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
      source: "school_dashboard",
      selectedSportValue: sportSelection.value,
      seasonHint: seasonHint.value.trim() || null,
      footballFormat:
        finalizedData?.game?.football_format ||
        resolveFootballFormatForSport(finalizedData?.game?.sport || sportSelection.value, footballFormatSelection?.value || "", {
          allowBlank: true,
        }) ||
        null,
    };

    const formatted = await formatForSupabase(finalizedData, metadata);
    const result = await submitToSupabase(formatted);

    if (!result.success) {
      throw new Error(result.error || "Submission failed.");
    }

    alert("Spreadsheet submitted successfully. It is now pending admin review.");
    window.location.href = "dashboard.html";
  } catch (error) {
    console.error(error);
    alert(`Submission failed: ${error.message || "Could not submit spreadsheet."}`);
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
  if (footballFormatSelection) {
    footballFormatSelection.value = "";
  }
  seasonHint.value = "";
  renderSelectedFile();
  syncFootballFormatField(sportSelection, footballFormatField);
  updateInspectState();
  reviewCard.classList.add("hidden");
  finalPreviewCard.classList.add("hidden");
  setStatus("Waiting for file");
  renderTemplateToolkit();
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

function switchSubmissionMode(mode) {
  activeSubmissionMode = mode;
  const panelMap = {
    modern: modeModernPanel,
    pdf: modePdfPanel,
    schedule: modeSchedulePanel,
    archive: modeArchivePanel,
  };

  const cardMap = {
    modern: modeCardModern,
    pdf: modeCardPdf,
    schedule: modeCardSchedule,
    archive: modeCardArchive,
  };

  Object.entries(panelMap).forEach(([key, panel]) => {
    if (!panel) return;
    panel.classList.toggle("hidden", key !== mode);
  });

  Object.entries(cardMap).forEach(([key, card]) => {
    if (!card) return;
    card.classList.toggle("is-active", key === mode);
  });

  if (mode === "modern") {
    switchSubmitMode("mode1");
  }

  renderTemplateToolkit();
}

function switchSubmitMode(mode) {
  activeSubmitMode = mode;
  const isMode1 = mode === "mode1";

  if (mode1Panel) {
    mode1Panel.classList.toggle("hidden", !isMode1);
  }

  if (mode2Panel) {
    mode2Panel.classList.toggle("hidden", isMode1);
  }

  if (mode1MetaFields) {
    mode1MetaFields.classList.toggle("hidden", !isMode1);
  }
  if (mode1QuickIntake) {
    mode1QuickIntake.classList.toggle("hidden", !isMode1);
  }
  if (mode2QuickHint) {
    mode2QuickHint.classList.toggle("hidden", isMode1);
  }

  if (mode1Btn) {
    mode1Btn.classList.toggle("portal-btn-primary", isMode1);
    mode1Btn.classList.toggle("portal-btn-secondary", !isMode1);
  }

  if (mode2Btn) {
    mode2Btn.classList.toggle("portal-btn-primary", !isMode1);
    mode2Btn.classList.toggle("portal-btn-secondary", isMode1);
  }

  if (!isMode1) {
    handleMode2LaneChange();
  }

  renderTemplateToolkit();
}

function handleMode2LaneChange() {
  if (!mode2LaneSelection) {
    return;
  }

  const lane = mode2LaneSelection.value;
  const isTextLane = lane === "boxscore_text";

  if (mode2TextLane) {
    mode2TextLane.classList.toggle("hidden", !isTextLane);
  }

  if (mode2FileLane) {
    mode2FileLane.classList.toggle("hidden", isTextLane);
  }

  mode2ParsedData = null;
  if (mode2PreviewCard) {
    mode2PreviewCard.classList.add("hidden");
  }

  if (boxStatus) {
    boxStatus.textContent = isTextLane
      ? "Waiting for pasted box score"
      : "Waiting for export file";
  }

  renderTemplateToolkit();
}

function handleMode2Parse() {
  const lane = mode2LaneSelection?.value || "boxscore_text";
  if (lane !== "boxscore_text") {
    alert("Switch upload type to Text box score, or use Process Export File.");
    return;
  }

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

  const footballFormat = getValidatedFootballFormat(
    boxSportSelection.value,
    boxFootballFormatSelection
  );
  if (footballFormat === false) {
    return;
  }

  parseBoxScoreBtn.disabled = true;
  parseBoxScoreBtn.textContent = "Parsing...";
  boxStatus.textContent = "Parsing game text...";

  try {
    mode2ParsedData = parseBoxScoreText(text, sportValue, { footballFormat });
    const confidence = Number(mode2ParsedData.confidence || 0);
    const routeLabel = confidence >= 80 ? "Ready for import" : "Manual review needed";
    mode2ParsedData.parse_review = {
      ...(mode2ParsedData.parse_review || {}),
      source_type: "text_box_score",
      upload_lane: "boxscore_text",
      export_source: mode2SourceSelection?.value || "other",
      football_format: mode2ParsedData?.game?.football_format || footballFormat || null,
      route_label: routeLabel,
      duplicate_risk: mode2ParsedData?.game?.date ? "medium" : "low",
    };

    renderMode2Preview(mode2ParsedData);
    mode2PreviewCard.classList.remove("hidden");
    boxStatus.textContent = "Game text parsed. Review before submit.";
  } catch (error) {
    console.error(error);
    alert(error.message || "Could not parse box score text.");
    boxStatus.textContent = "Text parsing failed.";
  } finally {
    parseBoxScoreBtn.disabled = false;
    parseBoxScoreBtn.textContent = "Parse Game Text";
  }
}
async function handleMode2FileProcess() {
  const lane = mode2LaneSelection?.value || "boxscore_text";
  if (lane !== "export_file") {
    alert("Switch upload type to Export file before processing a file.");
    return;
  }

  if (!boxSportSelection.value) {
    alert("Select a sport first.");
    return;
  }

  if (!mode2SelectedFile) {
    alert("Upload an export file first.");
    return;
  }

  const footballFormat = getValidatedFootballFormat(
    boxSportSelection.value,
    boxFootballFormatSelection
  );
  if (footballFormat === false) {
    return;
  }

  processMode2FileBtn.disabled = true;
  processMode2FileBtn.textContent = "Processing...";
  boxStatus.textContent = "Inspecting export file...";

  try {
    const inspection = await inspectSpreadsheet(mode2SelectedFile, boxSportSelection.value);
    const mappingSelections = Object.fromEntries(
      inspection.mappings.map((mapping) => [mapping.originalHeader, mapping.mappedTo || mapping.suggested || ""])
    );

    const savedMappings = loadMode2SavedMappings(
      boxSportSelection.value,
      mode2SourceSelection?.value || "other"
    );

    const appliedSavedMappings = applySavedMappingsToSelection(
      inspection,
      mappingSelections,
      savedMappings
    );

    const unresolvedHeaders = getUnresolvedMappingHeaders(inspection, mappingSelections);

    const hasAthleteName = inspection.mappings.some(
      (mapping) => resolveFinalMappingForHeader(mapping, mappingSelections) === "athlete_name"
    );

    if (!hasAthleteName) {
      throw new Error(
        "Could not resolve a player-name column in this export. Use a cleaner file or submit in Mode 1 for manual mapping."
      );
    }

    const sportMeta = resolveMode2Sport(boxSportSelection.value, footballFormat);

    mode2ParsedData = finalizeSpreadsheetParse(inspection, mappingSelections, {
      sport: sportMeta.sport,
      gender: sportMeta.gender,
      footballFormat: sportMeta.footballFormat,
      seasonHint: mode2SeasonHint?.value.trim() || "",
      defaultSchoolId: currentUser.school_id || null,
      defaultSchoolName: currentUser.school_name || null,
    });

    const routeLabel = unresolvedHeaders.length
      ? "Needs field mapping"
      : Number(mode2ParsedData.confidence || 0) >= 85
      ? "Ready for import"
      : "Manual review needed";

    mode2ParsedData.parse_review = {
      ...(mode2ParsedData.parse_review || {}),
      source_type: "mode2_export_file",
      upload_lane: "export_file",
      export_source: mode2SourceSelection?.value || "other",
      file_name: mode2SelectedFile.name,
      football_format: sportMeta.footballFormat,
      saved_mapping_hits: appliedSavedMappings,
      unresolved_headers: unresolvedHeaders,
      route_label: routeLabel,
      duplicate_risk: mode2SeasonHint?.value.trim() ? "medium" : "low",
    };

    if (unresolvedHeaders.length) {
      mode2ParsedData.warnings = [
        `${unresolvedHeaders.length} column(s) were unresolved and ignored: ${unresolvedHeaders.join(", ")}`,
        ...(mode2ParsedData.warnings || []),
      ];
    }

    const savedCount = persistMode2Mappings(
      boxSportSelection.value,
      mode2SourceSelection?.value || "other",
      inspection,
      mappingSelections
    );

    renderMode2Preview(mode2ParsedData);
    mode2PreviewCard.classList.remove("hidden");

    const statusParts = [
      "Export processed. Review before submit.",
      appliedSavedMappings > 0 ? `Auto-mapped from history: ${appliedSavedMappings}.` : "",
      savedCount > 0 ? `Mappings saved for future uploads: ${savedCount}.` : "",
    ].filter(Boolean);

    boxStatus.textContent = statusParts.join(" ");
  } catch (error) {
    console.error(error);
    alert(error.message || "Could not process export file.");
    boxStatus.textContent = "Export processing failed.";
  } finally {
    processMode2FileBtn.disabled = false;
    processMode2FileBtn.textContent = "Process Export File";
  }
}

function readMode2MappingStore() {
  try {
    const raw = localStorage.getItem(MODE2_MAPPING_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
    return {};
  } catch {
    return {};
  }
}

function writeMode2MappingStore(store) {
  try {
    localStorage.setItem(MODE2_MAPPING_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // no-op if storage is unavailable
  }
}

function buildMode2MappingKey(selectedSportValue, sourceValue) {
  const schoolKey = currentUser?.school_id || "unknown_school";
  const sportKey = selectedSportValue || "unknown_sport";
  const sourceKey = sourceValue || "other";
  return `${schoolKey}::${sportKey}::${sourceKey}`;
}

function loadMode2SavedMappings(selectedSportValue, sourceValue) {
  const store = readMode2MappingStore();
  const key = buildMode2MappingKey(selectedSportValue, sourceValue);
  return store[key]?.mappings || {};
}

function persistMode2Mappings(selectedSportValue, sourceValue, inspection, mappingSelections) {
  const store = readMode2MappingStore();
  const key = buildMode2MappingKey(selectedSportValue, sourceValue);

  const mappings = {};

  inspection.mappings.forEach((mapping) => {
    const finalValue = resolveFinalMappingForHeader(mapping, mappingSelections);
    if (!finalValue || finalValue === "__ignore__") {
      return;
    }

    if (mapping.normalizedHeader) {
      mappings[`n:${mapping.normalizedHeader}`] = finalValue;
    }

    const normalizedOriginal = normalizeStorageHeader(mapping.originalHeader);
    if (normalizedOriginal) {
      mappings[`h:${normalizedOriginal}`] = finalValue;
    }
  });

  store[key] = {
    updated_at: new Date().toISOString(),
    mappings,
  };

  writeMode2MappingStore(store);
  return Object.keys(mappings).length;
}

function applySavedMappingsToSelection(inspection, mappingSelections, savedMappings) {
  if (!savedMappings || typeof savedMappings !== "object") {
    return 0;
  }

  const defaultAllowedValues = new Set((inspection.options || []).map((option) => option.value));
  let applied = 0;

  inspection.mappings.forEach((mapping) => {
    const byNormalized = mapping.normalizedHeader
      ? savedMappings[`n:${mapping.normalizedHeader}`]
      : null;

    const byOriginal = savedMappings[`h:${normalizeStorageHeader(mapping.originalHeader)}`];
    const savedValue = byNormalized || byOriginal;

    if (!savedValue) {
      return;
    }

    if (!isValidSelectionValue(savedValue, mapping, defaultAllowedValues)) {
      return;
    }

    if (mappingSelections[mapping.originalHeader] === savedValue) {
      return;
    }

    mappingSelections[mapping.originalHeader] = savedValue;
    applied += 1;
  });

  return applied;
}

function isValidSelectionValue(value, mapping, defaultAllowedValues) {
  if (!value) return false;

  if (["__ignore__", "athlete_name", "school_name", "season"].includes(value)) {
    return true;
  }

  if (defaultAllowedValues.has(value)) {
    return true;
  }

  return (mapping.options || []).includes(value);
}

function normalizeStorageHeader(header) {
  return String(header || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function resolveFinalMappingForHeader(mapping, mappingSelections) {
  const selected = mappingSelections[mapping.originalHeader];
  if (selected !== undefined && selected !== null && selected !== "") {
    return selected;
  }

  return mapping.mappedTo || mapping.suggested || "";
}

function getUnresolvedMappingHeaders(inspection, mappingSelections) {
  return inspection.mappings
    .filter((mapping) => {
      const finalMapped = resolveFinalMappingForHeader(mapping, mappingSelections);
      if (finalMapped && finalMapped !== "__ignore__") {
        return false;
      }

      return mapping.status === "unknown" || mapping.status === "ambiguous";
    })
    .map((mapping) => mapping.originalHeader);
}
function renderMode2Preview(data) {
  const game = data.game || {};
  const players = data.players || [];
  const parseReview = data.parse_review || {};
  const footballFormat = game.football_format || parseReview.football_format || null;

  const uploadLane = parseReview.upload_lane || "boxscore_text";
  const sourceValue = parseReview.export_source || mode2SourceSelection?.value || "other";
  const detectedSeasons = parseReview.detected_seasons || [];
  const seasonText =
    detectedSeasons.length > 0
      ? detectedSeasons.join(", ")
      : mode2SeasonHint?.value.trim() || "Not detected";
  const routeLabel = parseReview.route_label || "Manual review needed";
  const duplicateRisk = parseReview.duplicate_risk || "low";

  const gameLine = game.homeTeam || game.awayTeam
    ? `${game.homeTeam || "Home"} ${game.homeScore ?? "?"} - ${game.awayScore ?? "?"} ${game.awayTeam || "Away"}`
    : "Not detected";

  mode2Summary.innerHTML = `
    <div class="summary-row">
      <strong>Submission scope</strong>
      <span>${data.submission_scope || "game_boxscore"}</span>
    </div>
    <div class="summary-row">
      <strong>Upload lane</strong>
      <span>${uploadLane}</span>
    </div>
    <div class="summary-row">
      <strong>Source</strong>
      <span>${sourceValue}</span>
    </div>
    <div class="summary-row">
      <strong>Route label</strong>
      <span>${routeLabel}</span>
    </div>
    <div class="summary-row">
      <strong>Duplicate risk</strong>
      <span>${duplicateRisk}</span>
    </div>
    <div class="summary-row">
      <strong>Date</strong>
      <span>${game.date || "Not detected"}</span>
    </div>
    <div class="summary-row">
      <strong>Sport</strong>
      <span>${formatSportSummaryLabel(game.sport, game.gender, footballFormat)}</span>
    </div>
    ${buildFootballFormatSummaryRow(footballFormat)}
    <div class="summary-row">
      <strong>Game</strong>
      <span>${gameLine}</span>
    </div>
    <div class="summary-row">
      <strong>Detected seasons</strong>
      <span>${seasonText}</span>
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
    ? players
        .map(
          (player) => `
        <div class="player-preview-item">
          <strong>${escapeHtml(player.name)}</strong>
          <span>${escapeHtml(
            Object.entries(player.stats || {})
              .map(([key, value]) => `${key}: ${value}`)
              .join(", ") || "No parsed stats"
          )}</span>
        </div>
      `
        )
        .join("")
    : "<div class=\"player-preview-item\"><strong>No players detected</strong><span>Try a cleaner upload input and process again.</span></div>";
}

async function submitMode2BoxScore() {
  if (!mode2ParsedData) {
    alert("Process a flexible lane upload first.");
    return;
  }

  if (!ensureSchoolConfigured()) {
    return;
  }

  submitMode2Btn.disabled = true;
  submitMode2Btn.textContent = "Submitting...";
  boxStatus.textContent = "Submitting flexible lane upload...";

  try {
    const lane = mode2LaneSelection?.value || "boxscore_text";
    const isExportLane = lane === "export_file";
    const sportMeta = resolveMode2Sport(
      boxSportSelection.value,
      boxFootballFormatSelection?.value || ""
    );
    const sourceValue = mode2SourceSelection?.value || "other";

    const metadata = {
      userId: currentUser.id,
      schoolId: currentUser.school_id,
      defaultSchoolId: currentUser.school_id,
      defaultSchoolName: currentUser.school_name,
      submissionMethod: isExportLane ? "csv_upload" : "text_paste",
      originalData: isExportLane
        ? mode2SelectedFile?.name || "mode2_export_file"
        : boxScoreInput.value.trim(),
      source: `school_dashboard_${sourceValue}`,
      sport: sportMeta.sport,
      gender: sportMeta.gender,
      selectedSportValue: boxSportSelection.value,
      seasonHint: mode2SeasonHint?.value.trim() || null,
      footballFormat:
        mode2ParsedData?.game?.football_format ||
        sportMeta.footballFormat ||
        null,
    };

    const formatted = await formatForSupabase(mode2ParsedData, metadata);
    const result = await submitToSupabase(formatted);

    if (!result.success) {
      throw new Error(result.error || "Submission failed.");
    }

    boxStatus.textContent = "Flexible lane upload submitted successfully and is now pending admin review.";
    mode2PreviewCard.classList.add("hidden");

    boxScoreInput.value = "";
    boxSportSelection.value = "";
    if (boxFootballFormatSelection) {
      boxFootballFormatSelection.value = "";
    }

    if (mode2SourceSelection) {
      mode2SourceSelection.value = "other";
    }

    if (mode2SeasonHint) {
      mode2SeasonHint.value = "";
    }

    if (mode2FileInput) {
      mode2FileInput.value = "";
    }

    mode2SelectedFile = null;
    mode2ParsedData = null;
    renderMode2SelectedFile();

    if (mode2LaneSelection) {
      mode2LaneSelection.value = "boxscore_text";
    }

    syncFootballFormatField(boxSportSelection, boxFootballFormatField);
    handleMode2LaneChange();
  } catch (error) {
    console.error(error);
    alert(`Submission failed: ${error.message || "Could not submit flexible lane upload."}`);
    boxStatus.textContent = "Flexible lane submission failed.";
  } finally {
    submitMode2Btn.disabled = false;
    submitMode2Btn.textContent = "Submit Flexible Upload";
  }
}

function isPdfFile(file) {
  const name = String(file?.name || "").toLowerCase();
  const type = String(file?.type || "").toLowerCase();
  return name.endsWith(".pdf") || type === "application/pdf";
}

function renderWarningList(target, warnings, fallbackText) {
  if (!target) {
    return;
  }

  target.innerHTML = "";
  if (warnings.length) {
    warnings.forEach((warning) => {
      const li = document.createElement("li");
      li.textContent = warning;
      target.appendChild(li);
    });
    return;
  }

  const li = document.createElement("li");
  li.textContent = fallbackText;
  target.appendChild(li);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function detectPdfType(file) {
  try {
    const buffer = await file.arrayBuffer();
    const sample = new Uint8Array(buffer.slice(0, 220000));
    const sampleText = new TextDecoder("latin1").decode(sample);

    const hasTextOps = /BT|Tf|TJ|Tj/.test(sampleText);
    const hasImageOps = /\/Image|\/Subtype\s*\/Image/.test(sampleText);

    if (hasTextOps) {
      return "Likely text-based PDF";
    }

    if (hasImageOps) {
      return "Likely image-based scan";
    }

    return "Unknown PDF type";
  } catch {
    return "Unknown PDF type";
  }
}

async function handlePdfInspect() {
  if (!pdfSportSelection?.value) {
    alert("Select a sport first.");
    return;
  }

  if (!pdfSelectedFile || !isPdfFile(pdfSelectedFile)) {
    alert("Upload a PDF evidence file first.");
    return;
  }

  pdfInspectBtn.disabled = true;
  pdfInspectBtn.textContent = "Inspecting...";
  pdfStatus.textContent = "Inspecting evidence...";

  try {
    const footballFormat = getValidatedFootballFormat(
      pdfSportSelection.value,
      pdfFootballFormatSelection
    );
    if (footballFormat === false) {
      return;
    }

    const sportMeta = resolveMode2Sport(pdfSportSelection.value, footballFormat);
    const seasonValue = pdfSeasonHint?.value.trim() || "";
    const pdfType = await detectPdfType(pdfSelectedFile);

    let confidence = 46;
    if (pdfType.includes("text-based")) confidence = 72;
    if (pdfType.includes("image-based")) confidence = 54;
    if (seasonValue) confidence += 4;
    confidence = clamp(confidence, 30, 88);

    const duplicateRisk = seasonValue ? "medium" : "low";
    const routeLabel = "Needs evidence review";

    const warnings = [
      "Evidence submissions are preview-first and always require admin review.",
      "Evidence uploads never auto-publish to live leaderboards.",
    ];

    if (!seasonValue) {
      warnings.push("Add a season note to improve duplicate detection.");
    }

    if (pdfType === "Unknown PDF type") {
      warnings.push("Evidence content type could not be detected and may need manual extraction.");
    }

    pdfDraftPayload = {
      parsedData: {
        submission_scope: "pdf_review",
        confidence,
        game: {
          date: null,
          sport: sportMeta.sport,
          gender: sportMeta.gender,
          football_format: sportMeta.footballFormat,
          location: null,
          homeTeam: null,
          awayTeam: null,
          homeScore: null,
          awayScore: null,
        },
        football_format: sportMeta.footballFormat,
        players: [],
        warnings,
        parse_review: {
          source_type: "pdf_report",
          upload_lane: "pdf_review",
          route_label: routeLabel,
          duplicate_risk: duplicateRisk,
          football_format: sportMeta.footballFormat,
          pdf_type: pdfType,
          file_name: pdfSelectedFile.name,
          file_size_bytes: pdfSelectedFile.size,
          detected_seasons: seasonValue ? [seasonValue] : [],
          missing_required_fields: seasonValue ? [] : ["season"],
        },
      },
      metadata: {
        submissionMethod: "manual_form",
        originalData: pdfSelectedFile.name,
        source: "school_dashboard_pdf",
        selectedSportValue: pdfSportSelection.value,
        seasonHint: seasonValue || null,
        footballFormat: sportMeta.footballFormat,
      },
    };

    pdfSummary.innerHTML = `
      <div class="summary-row">
        <strong>Route label</strong>
        <span>${routeLabel}</span>
      </div>
      <div class="summary-row">
        <strong>Duplicate risk</strong>
        <span>${duplicateRisk}</span>
      </div>
      <div class="summary-row">
        <strong>PDF type</strong>
        <span>${pdfType}</span>
      </div>
      <div class="summary-row">
        <strong>Sport</strong>
        <span>${formatSportSummaryLabel(
          sportMeta.sport,
          sportMeta.gender,
          sportMeta.footballFormat
        )}</span>
      </div>
      ${buildFootballFormatSummaryRow(sportMeta.footballFormat)}
      <div class="summary-row">
        <strong>Season hint</strong>
        <span>${seasonValue || "Not provided"}</span>
      </div>
      <div class="summary-row">
        <strong>Confidence</strong>
        <span>${confidence}%</span>
      </div>
      <div class="summary-row">
        <strong>File</strong>
        <span>${escapeHtml(pdfSelectedFile.name)}</span>
      </div>
    `;

    renderWarningList(pdfWarnings, warnings, "No warnings.");
    pdfPreviewCard.classList.remove("hidden");
    pdfStatus.textContent = "Evidence inspected. Review route labels before submit.";
  } catch (error) {
    console.error(error);
    alert(error.message || "Could not inspect evidence.");
    pdfStatus.textContent = "Evidence inspection failed.";
  } finally {
    pdfInspectBtn.disabled = false;
    pdfInspectBtn.textContent = "Inspect Evidence";
  }
}

async function submitPdfUpload() {
  if (!pdfDraftPayload) {
    alert("Inspect an evidence file first.");
    return;
  }

  await submitDraftPayload({
    draft: pdfDraftPayload,
    button: submitPdfBtn,
    pendingLabel: "Submitting...",
    idleLabel: "Submit Evidence for Review",
    statusTarget: pdfStatus,
    pendingStatus: "Submitting evidence intake...",
    successStatus: "Evidence submitted successfully and queued for admin review.",
    onSuccess: () => {
      pdfDraftPayload = null;
      pdfPreviewCard.classList.add("hidden");
      if (pdfInput) pdfInput.value = "";
      pdfSelectedFile = null;
      renderPdfSelectedFile();
      if (pdfSeasonHint) pdfSeasonHint.value = "";
      if (pdfSportSelection) pdfSportSelection.value = "";
      if (pdfFootballFormatSelection) pdfFootballFormatSelection.value = "";
      syncFootballFormatField(pdfSportSelection, pdfFootballFormatField);
    },
  });
}

async function submitDraftPayload({
  draft,
  button,
  pendingLabel,
  idleLabel,
  statusTarget,
  pendingStatus,
  successStatus,
  onSuccess,
}) {
  if (!button || !statusTarget) {
    alert("Submission UI is not ready. Refresh and try again.");
    return;
  }

  if (!ensureSchoolConfigured()) {
    return;
  }

  button.disabled = true;
  button.textContent = pendingLabel;
  statusTarget.textContent = pendingStatus;

  try {
    const metadata = {
      ...draft.metadata,
      userId: currentUser.id,
      schoolId: currentUser.school_id,
      defaultSchoolId: currentUser.school_id,
      defaultSchoolName: currentUser.school_name,
    };

    const formatted = await formatForSupabase(draft.parsedData, metadata);
    const result = await submitToSupabase(formatted);

    if (!result.success) {
      throw new Error(result.error || "Submission failed.");
    }

    statusTarget.textContent = successStatus;
    if (onSuccess) {
      onSuccess();
    }
  } catch (error) {
    console.error(error);
    alert(`Submission failed: ${error.message || "Could not submit."}`);
    statusTarget.textContent = "Submission failed.";
  } finally {
    button.disabled = false;
    button.textContent = idleLabel;
  }
}

function resolveMode2Sport(value, footballFormatValue = "") {
  switch (value) {
    case "boys_basketball":
      return { sport: "basketball", gender: "boys", footballFormat: null };
    case "girls_basketball":
      return { sport: "basketball", gender: "girls", footballFormat: null };
    case "girls_volleyball":
      return { sport: "volleyball", gender: "girls", footballFormat: null };
    case "boys_soccer":
      return { sport: "soccer", gender: "boys", footballFormat: null };
    case "girls_soccer":
      return { sport: "soccer", gender: "girls", footballFormat: null };
    case "football":
      return {
        sport: "football",
        gender: null,
        footballFormat: resolveFootballFormatForSport("football", footballFormatValue, {
          allowBlank: true,
        }),
      };
    case "baseball":
      return { sport: "baseball", gender: null, footballFormat: null };
    case "softball":
      return { sport: "softball", gender: null, footballFormat: null };
    default:
      return { sport: null, gender: null, footballFormat: null };
  }
}
