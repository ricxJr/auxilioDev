const CSV_HEADERS = [
  "occurrenceId",
  "personId",
  "personName",
  "occurrenceType",
  "date",
  "durationMinutes",
  "createdAt",
  "updatedAt",
];

const LEGACY_CSV_HEADERS = [
  "occurrenceId",
  "personId",
  "personName",
  "date",
  "durationMinutes",
  "createdAt",
  "updatedAt",
];

const HANDLE_DB_NAME = "occurrence-csv-db";
const HANDLE_STORE = "handles";
const HANDLE_KEY = "csv-file-handle";

const state = {
  people: new Map(),
  normalizedNameToPersonId: new Map(),
  occurrences: [],
  editingOccurrenceId: null,
  filters: {
    personId: "",
    type: "",
    personNameSearch: "",
    date: "",
    sort: "date-desc",
  },
  csv: {
    connected: false,
    mode: "disconnected",
    filename: null,
    fileHandle: null,
    conflicts: [],
  },
  chart: {
    mode: "selected-day",
    bars: [],
  },
  theme: "light",
};

const ui = {};

document.addEventListener("DOMContentLoaded", async () => {
  cacheElements();

  ui.occurrenceDate.value = new Date().toISOString().slice(0, 10);

  setupFallbackMode();
  bindCsvActions();
  bindOccurrenceForm();
  bindFilters();
  bindChartInteractions();
  bindTableActions();
  bindThemeActions();
  applyInitialTheme();
  await tryReconnectCsvFile();
  renderAll();
});

function cacheElements() {
  ui.csvStatus = document.querySelector('[data-role="csv-status"]');
  ui.fallbackWarning = document.querySelector('[data-role="fallback-warning"]');
  ui.csvConflicts = document.querySelector('[data-role="csv-conflicts"]');
  ui.connectCsvBtn = document.querySelector('[data-action="connect-csv"]');
  ui.importCsvBtn = document.querySelector('[data-action="import-csv"]');
  ui.exportCsvBtn = document.querySelector('[data-action="export-csv"]');
  ui.toggleThemeBtn = document.querySelector('[data-action="toggle-theme"]');

  ui.occurrenceForm = document.querySelector('[data-role="occurrence-form"]');
  ui.personName = document.querySelector('[data-field="person-name"]');
  ui.peopleSuggestions = document.querySelector('[data-role="people-suggestions"]');
  ui.personPreview = document.querySelector('[data-role="person-preview"]');
  ui.personIdPreview = document.querySelector('[data-role="person-id-preview"]');
  ui.occurrenceType = document.querySelector('[data-field="occurrence-type"]');
  ui.occurrenceDate = document.querySelector('[data-field="occurrence-date"]');
  ui.occurrenceDuration = document.querySelector('[data-field="occurrence-duration"]');
  ui.saveButton = document.querySelector('[data-action="save-occurrence"]');
  ui.cancelEditButton = document.querySelector('[data-action="cancel-edit"]');

  ui.kpiTotalToday = document.querySelector('[data-kpi="total-today"]');
  ui.kpiUniquePeople = document.querySelector('[data-kpi="unique-people"]');
  ui.kpiTopType = document.querySelector('[data-kpi="top-type"]');
  ui.kpiTotalGeneral = document.querySelector('[data-kpi="total-general"]');
  ui.kpiUniqueGeneral = document.querySelector('[data-kpi="unique-general"]');
  ui.kpiOccurrencesGeneral = document.querySelector('[data-kpi="occurrences-general"]');

  ui.chartCanvas = document.querySelector('[data-role="occurrence-chart"]');
  ui.chartScroll = document.querySelector('[data-role="chart-scroll"]');
  ui.chartTooltip = document.querySelector('[data-role="chart-tooltip"]');
  ui.chartModeButtons = [...document.querySelectorAll('[data-action="chart-mode"]')];

  ui.filterPerson = document.querySelector('[data-filter="person"]');
  ui.filterType = document.querySelector('[data-filter="type"]');
  ui.filterNameSearch = document.querySelector('[data-filter="name-search"]');
  ui.filterDate = document.querySelector('[data-filter="date"]');
  ui.sortOrder = document.querySelector('[data-filter="sort-order"]');
  ui.clearFiltersBtn = document.querySelector('[data-action="clear-filters"]');

  ui.dailyPeopleList = document.querySelector('[data-role="daily-people-list"]');
  ui.generalPeopleList = document.querySelector('[data-role="general-people-list"]');

  ui.occurrencesBody = document.querySelector('[data-role="occurrences-body"]');
  ui.toastContainer = document.querySelector('[data-role="toast-container"]');
}


function bindThemeActions() {
  if (!ui.toggleThemeBtn) return;

  ui.toggleThemeBtn.addEventListener("click", () => {
    const nextTheme = state.theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    showToast(nextTheme === "dark" ? "Tema escuro ativado." : "Tema claro ativado.");
    renderChart();
  });
}

function applyInitialTheme() {
  const stored = window.localStorage.getItem("auxilio-theme");
  const systemPrefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const initial = stored === "dark" || stored === "light" ? stored : systemPrefersDark ? "dark" : "light";
  applyTheme(initial, false);
}

function applyTheme(theme, persist = true) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  if (ui.toggleThemeBtn) {
    ui.toggleThemeBtn.textContent = theme === "dark" ? "Tema claro" : "Tema escuro";
  }

  if (persist) {
    window.localStorage.setItem("auxilio-theme", theme);
  }
}

function getThemeColor(token) {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim();
}

function supportsFsAccessApi() {
  const hasPicker = typeof window.showOpenFilePicker === "function" || typeof window.showSaveFilePicker === "function";
  return Boolean(window.isSecureContext && hasPicker);
}

function setupFallbackMode() {
  if (!supportsFsAccessApi()) {
    state.csv.mode = "fallback";
    ui.fallbackWarning.hidden = false;
    ui.fallbackWarning.textContent = window.isSecureContext
      ? "Modo fallback ativo: seu navegador não expõe File System Access API nesta sessão."
      : "Modo fallback ativo: abra em contexto seguro (https:// ou http://localhost). Em file:// a File System Access API pode não estar disponível.";
    ui.connectCsvBtn.disabled = true;
  }
}

function bindCsvActions() {
  ui.connectCsvBtn.addEventListener("click", connectCsvFile);

  ui.importCsvBtn.addEventListener("click", async () => {
    try {
      const csvText = await readCsvFromInput();
      if (!csvText.trim()) {
        showToast("Nenhum conteúdo de CSV informado.", "error");
        return;
      }
      loadCsvText(csvText);
      showToast("CSV importado com sucesso.", "success");
      renderAll();
    } catch (error) {
      showToast(`Falha na importação: ${error.message}`, "error");
    }
  });

  ui.exportCsvBtn.addEventListener("click", async () => {
    const csv = serializeCSV(state.occurrences);
    if (state.csv.connected && state.csv.fileHandle) {
      try {
        await writeCsvToConnectedFile(csv);
        showToast("CSV salvo no arquivo conectado.", "success");
      } catch (error) {
        showToast(`Falha ao salvar no arquivo conectado: ${error.message}`, "error");
      }
      return;
    }

    downloadCsv(csv, state.csv.filename || "ocorrencias.csv");
    showToast("CSV exportado por download.", "success");
  });
}

function bindOccurrenceForm() {
  ui.personName.addEventListener("input", () => {
    renderPersonPreview();
    renderPersonIdPreview();
  });

  ui.cancelEditButton.addEventListener("click", () => {
    clearFormMode();
    showToast("Edição cancelada.");
  });

  ui.occurrenceForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const durationResult = parseDurationToMinutes(ui.occurrenceDuration.value);
    const requiredFields = [
      { input: ui.personName, valid: Boolean(ui.personName.value.trim()) },
      { input: ui.occurrenceType, valid: Boolean(ui.occurrenceType.value.trim()) },
      { input: ui.occurrenceDate, valid: Boolean(ui.occurrenceDate.value.trim()) },
      { input: ui.occurrenceDuration, valid: durationResult.valid },
    ];

    const hasInvalid = requiredFields.some(({ input, valid }) => {
      input.classList.toggle("is-invalid", !valid);
      input.classList.toggle("is-valid", valid);
      return !valid;
    });

    if (hasInvalid) {
      showToast(durationResult.valid ? "Preencha os campos obrigatórios." : durationResult.error, "error");
      return;
    }

    const now = new Date().toISOString();
    const person = getOrCreatePerson(ui.personName.value.trim());

    if (state.editingOccurrenceId) {
      const occurrence = state.occurrences.find((item) => item.occurrenceId === state.editingOccurrenceId);
      if (!occurrence) {
        clearFormMode();
        showToast("Auxílio para edição não encontrada.", "error");
        return;
      }

      occurrence.personId = person.personId;
      occurrence.personName = person.name;
      occurrence.occurrenceType = ui.occurrenceType.value;
      occurrence.date = ui.occurrenceDate.value;
      occurrence.durationMinutes = durationResult.value;
      occurrence.updatedAt = now;

      clearFormMode();
      await persistOccurrencesWithFeedback("Auxílio atualizada.");
      return;
    }

    state.occurrences.unshift({
      occurrenceId: generateOccurrenceId(),
      personId: person.personId,
      personName: person.name,
      occurrenceType: ui.occurrenceType.value,
      date: ui.occurrenceDate.value,
      durationMinutes: durationResult.value,
      createdAt: now,
      updatedAt: now,
    });

    clearFormMode();
    await persistOccurrencesWithFeedback("Auxílio registrada.");
  });
}

function bindFilters() {
  ui.filterPerson.addEventListener("change", (event) => {
    state.filters.personId = event.target.value;
    renderTable();
    renderChart();
  });

  ui.filterType.addEventListener("change", (event) => {
    state.filters.type = event.target.value;
    renderDashboard();
    renderTable();
    renderChart();
  });

  ui.filterNameSearch.addEventListener("input", (event) => {
    state.filters.personNameSearch = normalizeName(event.target.value);
    renderTable();
    renderChart();
  });

  ui.filterDate.addEventListener("change", (event) => {
    state.filters.date = event.target.value;
    renderDashboard();
    renderTable();
    renderChart();
  });

  ui.sortOrder.addEventListener("change", (event) => {
    state.filters.sort = event.target.value;
    renderTable();
    renderChart();
  });

  ui.clearFiltersBtn.addEventListener("click", () => {
    state.filters = { personId: "", type: "", personNameSearch: "", date: "", sort: "date-desc" };
    ui.filterPerson.value = "";
    ui.filterType.value = "";
    ui.filterNameSearch.value = "";
    ui.filterDate.value = "";
    ui.sortOrder.value = "date-desc";
    renderDashboard();
    renderTable();
    renderChart();
  });
}

function bindChartInteractions() {
  ui.chartModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.mode;
      if (!mode || state.chart.mode === mode) return;
      state.chart.mode = mode;
      renderChart();
    });
  });

  ui.chartCanvas.addEventListener("mousemove", (event) => {
    const rect = ui.chartCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hoveredBar = state.chart.bars.find(
      (bar) => x >= bar.x && x <= bar.x + bar.width && y >= bar.y && y <= bar.y + bar.height,
    );

    if (!hoveredBar) {
      hideChartTooltip();
      return;
    }

    const scrollLeft = ui.chartScroll.scrollLeft;
    ui.chartTooltip.hidden = false;
    ui.chartTooltip.textContent = `${hoveredBar.label} · ${formatDurationClock(hoveredBar.totalMinutes)}`;
    ui.chartTooltip.style.left = `${hoveredBar.x + hoveredBar.width / 2 - ui.chartTooltip.offsetWidth / 2 + scrollLeft}px`;
    ui.chartTooltip.style.top = `${Math.max(8, hoveredBar.y - 34)}px`;
  });

  ui.chartCanvas.addEventListener("mouseleave", hideChartTooltip);
  ui.chartScroll.addEventListener("scroll", hideChartTooltip);
}

function hideChartTooltip() {
  ui.chartTooltip.hidden = true;
}

function bindTableActions() {
  ui.occurrencesBody.addEventListener("click", async (event) => {
    const actionButton = event.target.closest("button[data-action]");
    if (!actionButton) return;

    const rowId = actionButton.dataset.id;

    if (actionButton.dataset.action === "delete-occurrence") {
      if (!window.confirm("Deseja realmente excluir esta auxílio?")) return;
      state.occurrences = state.occurrences.filter((item) => item.occurrenceId !== rowId);
      if (state.editingOccurrenceId === rowId) clearFormMode();
      await persistOccurrencesWithFeedback("Auxílio removida.");
      return;
    }

    if (actionButton.dataset.action === "edit-occurrence") {
      const item = state.occurrences.find((entry) => entry.occurrenceId === rowId);
      if (!item) return;

      state.editingOccurrenceId = item.occurrenceId;
      ui.personName.value = item.personName;
      ui.occurrenceType.value = item.occurrenceType || "";
      ui.occurrenceDate.value = item.date;
      ui.occurrenceDuration.value = formatDurationInput(item.durationMinutes);
      ui.saveButton.textContent = "Salvar edição";
      ui.cancelEditButton.hidden = false;
      renderPersonPreview();
      renderPersonIdPreview();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });
}

function normalizeName(name) {
  return String(name || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function generateOccurrenceId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `occ-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getOrCreatePerson(name) {
  const normalized = normalizeName(name);
  const existingId = state.normalizedNameToPersonId.get(normalized);
  if (existingId) {
    const existing = state.people.get(existingId);
    if (existing && existing.name !== name) existing.name = name;
    return existing;
  }

  const person = {
    personId: getNextPersonId(),
    name,
    normalizedName: normalized,
  };

  state.people.set(person.personId, person);
  state.normalizedNameToPersonId.set(normalized, person.personId);
  return person;
}

function getNextPersonId() {
  const max = [...state.people.keys()].reduce((acc, id) => {
    const n = Number(String(id).replace(/^P/i, ""));
    return Number.isFinite(n) ? Math.max(acc, n) : acc;
  }, 0);
  return `P${String(max + 1).padStart(4, "0")}`;
}

function getPreviewPersonId(name) {
  const normalized = normalizeName(name);
  if (!normalized) return getNextPersonId();
  return state.normalizedNameToPersonId.get(normalized) || getNextPersonId();
}

function renderPersonIdPreview() {
  ui.personIdPreview.textContent = `Próximo personId: ${getPreviewPersonId(ui.personName.value)}`;
}

function renderPersonPreview() {
  const rawName = ui.personName.value.trim();
  if (!rawName) {
    ui.personPreview.textContent = "";
    return;
  }

  const normalized = normalizeName(rawName);
  const personId = state.normalizedNameToPersonId.get(normalized);
  if (personId) {
    ui.personPreview.textContent = `Pessoa existente: ${personId}`;
    return;
  }

  ui.personPreview.textContent = `Nova pessoa será criada com ID: ${getNextPersonId()}`;
}

function clearFormMode() {
  state.editingOccurrenceId = null;
  ui.occurrenceForm.reset();
  ui.saveButton.textContent = "Salvar auxílio";
  ui.cancelEditButton.hidden = true;
  [ui.personName, ui.occurrenceType, ui.occurrenceDate, ui.occurrenceDuration].forEach((input) =>
    input.classList.remove("is-valid", "is-invalid"),
  );
  ui.occurrenceDate.value = new Date().toISOString().slice(0, 10);
  renderPersonPreview();
  renderPersonIdPreview();
}

function getFilteredOccurrences() {
  const filtered = state.occurrences.filter((entry) => {
    const byPerson = !state.filters.personId || entry.personId === state.filters.personId;
    const byType = !state.filters.type || (entry.occurrenceType || "") === state.filters.type;
    const byNameSearch =
      !state.filters.personNameSearch || normalizeName(entry.personName).includes(state.filters.personNameSearch);
    const byDate = !state.filters.date || entry.date === state.filters.date;
    return byPerson && byType && byNameSearch && byDate;
  });

  return filtered.sort((a, b) => {
    if (state.filters.sort === "duration-desc") {
      const durationDiff = Number(b.durationMinutes || 0) - Number(a.durationMinutes || 0);
      if (durationDiff !== 0) return durationDiff;
    }

    const dateDiff = String(b.date || "").localeCompare(String(a.date || ""));
    if (dateDiff !== 0) return dateDiff;

    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });
}


function aggregateByDay(occurrences, selectedDate) {
  const normalizedDate = selectedDate || "";
  const scopedOccurrences = occurrences.filter((entry) => !normalizedDate || entry.date === normalizedDate);
  const byPerson = aggregateByPerson(scopedOccurrences, "selected-day");

  return {
    selectedDate: normalizedDate,
    totalMinutes: scopedOccurrences.reduce((total, entry) => total + Number(entry.durationMinutes || 0), 0),
    totalDistinctPeople: byPerson.length,
    totalOccurrences: scopedOccurrences.length,
    byPerson,
  };
}

function aggregateByPerson(occurrences, mode = "history") {
  const normalizedMode = typeof mode === "string" ? { type: mode } : mode;
  const scopedOccurrences =
    normalizedMode.type === "selected-day"
      ? occurrences.filter((entry) => !normalizedMode.selectedDate || entry.date === normalizedMode.selectedDate)
      : occurrences;

  const grouped = scopedOccurrences.reduce((acc, entry) => {
    const key = `${entry.personId}::${entry.personName}`;
    if (!acc[key]) {
      acc[key] = {
        personId: entry.personId,
        personName: entry.personName,
        occurrences: 0,
        totalMinutes: 0,
      };
    }

    acc[key].occurrences += 1;
    acc[key].totalMinutes += Number(entry.durationMinutes || 0);
    return acc;
  }, {});

  const ordered = Object.values(grouped).sort((a, b) => {
    const diff = b.totalMinutes - a.totalMinutes;
    if (diff !== 0) return diff;
    return a.personName.localeCompare(b.personName);
  });

  return ordered;
}


function getChartScopedOccurrences() {
  return state.occurrences.filter((entry) => {
    const byPerson = !state.filters.personId || entry.personId === state.filters.personId;
    const byType = !state.filters.type || (entry.occurrenceType || "") === state.filters.type;
    const byNameSearch =
      !state.filters.personNameSearch || normalizeName(entry.personName).includes(state.filters.personNameSearch);
    return byPerson && byType && byNameSearch;
  });
}

function renderPersonFilterOptions() {
  const people = [...state.people.values()].sort((a, b) => a.name.localeCompare(b.name));
  ui.filterPerson.innerHTML = ['<option value="">Todas</option>', ...people.map((person) => `<option value="${escapeHtml(person.personId)}">${escapeHtml(person.name)} (${escapeHtml(person.personId)})</option>`)].join("");
  ui.filterPerson.value = state.filters.personId;
}

function renderTypeFilterOptions() {
  const types = [...new Set(state.occurrences.map((item) => item.occurrenceType).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
  ui.filterType.innerHTML = ['<option value="">Todos</option>', ...types.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`)].join("");
  ui.filterType.value = state.filters.type;
}

function renderPeopleSuggestions() {
  const people = [...state.people.values()].sort((a, b) => a.name.localeCompare(b.name));
  ui.peopleSuggestions.innerHTML = people.map((person) => `<option value="${escapeHtml(person.name)}"></option>`).join("");
}

function renderAll() {
  renderCsvStatus();
  renderCsvConflicts();
  renderPersonIdPreview();
  renderPersonFilterOptions();
  renderTypeFilterOptions();
  renderPeopleSuggestions();
  renderDashboard();
  renderChart();
  renderTable();
}

function renderCsvStatus() {
  const statusLabel = state.csv.connected
    ? `Conectado (${state.csv.filename || "arquivo.csv"})`
    : state.csv.mode === "fallback"
      ? "Modo fallback"
      : "Desconectado";
  ui.csvStatus.textContent = statusLabel;
}

function renderCsvConflicts() {
  if (!state.csv.conflicts.length) {
    ui.csvConflicts.hidden = true;
    ui.csvConflicts.innerHTML = "";
    return;
  }

  ui.csvConflicts.hidden = false;
  ui.csvConflicts.innerHTML = `
    <strong>Conflitos detectados no CSV:</strong>
    <ul>${state.csv.conflicts.map((conflict) => `<li>${escapeHtml(conflict)}</li>`).join("")}</ul>
  `;
}

function renderDashboard() {
  const selectedDate = state.filters.date || new Date().toISOString().slice(0, 10);
  const source = getChartScopedOccurrences();
  const dayAggregation = aggregateByDay(source, selectedDate);
  const generalAggregation = aggregateByDay(source, "");

  ui.kpiTotalToday.textContent = String(dayAggregation.totalMinutes);
  ui.kpiUniquePeople.textContent = String(dayAggregation.totalDistinctPeople);
  ui.kpiTopType.textContent = String(dayAggregation.totalOccurrences);
  ui.kpiTotalGeneral.textContent = String(generalAggregation.totalMinutes);
  ui.kpiUniqueGeneral.textContent = String(generalAggregation.totalDistinctPeople);
  ui.kpiOccurrencesGeneral.textContent = String(generalAggregation.totalOccurrences);

  if (!dayAggregation.byPerson.length) {
    ui.dailyPeopleList.innerHTML = '<p class="muted-inline">Nenhuma auxílio para a data selecionada.</p>';
    return;
  }

  ui.dailyPeopleList.innerHTML = `
    <ul>
      ${dayAggregation.byPerson
        .map(
          (person) => `
            <li>
              <strong>${escapeHtml(person.personName)} (${escapeHtml(person.personId)})</strong>
              <span>${person.occurrences} auxílio(s) · ${formatDurationLabel(person.totalMinutes)}</span>
            </li>
          `,
        )
        .join("")}
    </ul>
  `;

  if (!generalAggregation.byPerson.length) {
    ui.generalPeopleList.innerHTML = '<p class="muted-inline">Nenhuma auxílio no histórico atual.</p>';
    return;
  }

  ui.generalPeopleList.innerHTML = `
    <ul>
      ${generalAggregation.byPerson
        .map(
          (person) => `
            <li>
              <strong>${escapeHtml(person.personName)} (${escapeHtml(person.personId)})</strong>
              <span>${person.occurrences} auxílio(s) · ${formatDurationLabel(person.totalMinutes)}</span>
            </li>
          `,
        )
        .join("")}
    </ul>
  `;
}

function renderChart() {
  const modeConfig =
    state.chart.mode === "selected-day"
      ? { type: "selected-day", selectedDate: state.filters.date || new Date().toISOString().slice(0, 10) }
      : { type: "history" };
  const data = aggregateByPerson(getChartScopedOccurrences(), modeConfig);

  ui.chartModeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === state.chart.mode);
  });

  const ctx = ui.chartCanvas.getContext("2d");
  const height = ui.chartCanvas.height;

  if (!data.length) {
    ui.chartCanvas.width = 900;
    ctx.clearRect(0, 0, ui.chartCanvas.width, height);
    ctx.fillStyle = getThemeColor("--muted");
    ctx.font = "16px sans-serif";
    ctx.fillText("Sem dados para o gráfico.", 20, 40);
    state.chart.bars = [];
    hideChartTooltip();
    return;
  }

  const margin = { top: 20, right: 20, bottom: 70, left: 72 };
  const barWidth = 72;
  const gap = 20;
  const innerWidth = data.length * (barWidth + gap);
  const canvasWidth = Math.max(900, margin.left + margin.right + innerWidth);
  const plotHeight = height - margin.top - margin.bottom;

  ui.chartCanvas.width = canvasWidth;
  ctx.clearRect(0, 0, canvasWidth, height);

  const maxMinutes = Math.max(...data.map((item) => item.totalMinutes), 1);
  const yTicks = 5;

  ctx.strokeStyle = getThemeColor("--border");
  ctx.fillStyle = getThemeColor("--muted");
  ctx.font = "12px sans-serif";

  for (let i = 0; i <= yTicks; i += 1) {
    const ratio = i / yTicks;
    const y = margin.top + plotHeight - ratio * plotHeight;
    const value = Math.round(maxMinutes * ratio);
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(canvasWidth - margin.right, y);
    ctx.stroke();
    ctx.fillText(formatAxisDuration(value), 8, y + 4);
  }

  ctx.strokeStyle = getThemeColor("--muted");
  ctx.beginPath();
  ctx.moveTo(margin.left, margin.top);
  ctx.lineTo(margin.left, height - margin.bottom);
  ctx.lineTo(canvasWidth - margin.right, height - margin.bottom);
  ctx.stroke();

  state.chart.bars = data.map((person, index) => {
    const x = margin.left + index * (barWidth + gap);
    const barHeight = (person.totalMinutes / maxMinutes) * plotHeight;
    const y = height - margin.bottom - barHeight;
    const label = `${person.personName}(${person.personId})`;

    ctx.fillStyle = getThemeColor("--primary");
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.save();
    ctx.translate(x + barWidth / 2, height - margin.bottom + 12);
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = getThemeColor("--text");
    ctx.font = "12px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(label.slice(0, 24), 0, 0);
    ctx.restore();

    return { x, y, width: barWidth, height: barHeight, label, totalMinutes: person.totalMinutes };
  });

  hideChartTooltip();
}

function formatAxisDuration(totalMinutes) {
  if (totalMinutes >= 60) {
    const hours = totalMinutes / 60;
    return `${hours.toFixed(hours >= 10 ? 0 : 1)}h`;
  }
  return `${Math.round(totalMinutes)}m`;
}

function formatDurationClock(durationMinutes) {
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function renderTable() {
  const rows = getFilteredOccurrences();
  if (!rows.length) {
    ui.occurrencesBody.innerHTML = '<tr><td colspan="5">Nenhuma auxílio encontrada.</td></tr>';
    return;
  }

  ui.occurrencesBody.innerHTML = rows
    .map(
      (entry) => `
      <tr>
        <td>${escapeHtml(entry.date)}</td>
        <td>${escapeHtml(entry.personName)} <small>(${escapeHtml(entry.personId)})</small></td>
        <td>${escapeHtml(entry.occurrenceType || "-")}</td>
        <td>${escapeHtml(formatDurationLabel(entry.durationMinutes))}</td>
        <td class="actions-cell">
          <button class="action-secondary" data-action="edit-occurrence" data-id="${entry.occurrenceId}" type="button">Editar</button>
          <button class="action-danger" data-action="delete-occurrence" data-id="${entry.occurrenceId}" type="button">Excluir</button>
        </td>
      </tr>
    `,
    )
    .join("");
}

function parseDurationToMinutes(rawValue) {
  const input = rawValue.trim().toLowerCase();
  if (!input) return { valid: false, error: "Informe a duração." };

  if (/^\d+$/.test(input)) {
    const minutes = Number(input);
    if (!Number.isInteger(minutes) || minutes <= 0) {
      return { valid: false, error: "Duração deve ser maior que zero." };
    }
    return { valid: true, value: minutes };
  }

  const colonMatch = input.match(/^(\d{1,3}):(\d{1,2})$/);
  if (colonMatch) {
    const hours = Number(colonMatch[1]);
    const minutes = Number(colonMatch[2]);
    if (minutes >= 60) {
      return { valid: false, error: "No formato h:mm os minutos devem ficar entre 00 e 59." };
    }
    return { valid: true, value: hours * 60 + minutes };
  }

  const hmMatch = input.match(/^(\d+)h(?:\s*(\d+)m)?$/);
  if (hmMatch) {
    const hours = Number(hmMatch[1]);
    const minutes = hmMatch[2] ? Number(hmMatch[2]) : 0;
    if (minutes >= 60) {
      return { valid: false, error: "No formato 'xh ym' os minutos devem ficar entre 0 e 59." };
    }
    if (hours === 0 && minutes === 0) {
      return { valid: false, error: "Duração deve ser maior que zero." };
    }
    return { valid: true, value: hours * 60 + minutes };
  }

  return { valid: false, error: "Formato inválido. Use 90, 1:30 ou 1h 30m." };
}

function formatDurationLabel(durationMinutes) {
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  return `${String(hours).padStart(2, "0")}h${String(minutes).padStart(2, "0")}`;
}

function formatDurationInput(durationMinutes) {
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

function parseCSV(text) {
  const rows = parseCsvRows(text);
  if (!rows.length) return [];

  const [header, ...body] = rows;
  const normalizedHeader = header.map((item) => item.trim());
  const headerJoined = normalizedHeader.join(",");
  const isCurrent = headerJoined === CSV_HEADERS.join(",");
  const isLegacy = headerJoined === LEGACY_CSV_HEADERS.join(",");
  if (!isCurrent && !isLegacy) {
    throw new Error("Cabeçalho CSV inválido.");
  }

  return body
    .filter((columns) => columns.some((value) => value !== ""))
    .map((columns) => ({
      occurrenceId: columns[0] || generateOccurrenceId(),
      personId: columns[1] || "",
      personName: columns[2] || "",
      occurrenceType: isCurrent ? columns[3] || "" : "Não informado",
      date: isCurrent ? columns[4] || "" : columns[3] || "",
      durationMinutes: Number(isCurrent ? columns[5] || 0 : columns[4] || 0),
      createdAt: isCurrent ? columns[6] || new Date().toISOString() : columns[5] || new Date().toISOString(),
      updatedAt: isCurrent ? columns[7] || new Date().toISOString() : columns[6] || new Date().toISOString(),
    }));
}

function serializeCSV(occurrences) {
  const escapeCsv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const sortAsc = (a, b) => {
    const dateDiff = String(a.date || "").localeCompare(String(b.date || ""));
    if (dateDiff !== 0) return dateDiff;
    return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  };

  const ordered = [...occurrences].sort(sortAsc);
  const body = ordered.map((item) =>
    [
      item.occurrenceId,
      item.personId,
      item.personName,
      item.occurrenceType || "",
      item.date,
      Number(item.durationMinutes || 0),
      item.createdAt,
      item.updatedAt,
    ]
      .map(escapeCsv)
      .join(","),
  );

  return [CSV_HEADERS.join(","), ...body].join("\n");
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  if (value.length || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function loadCsvText(csvText) {
  const parsed = parseCSV(csvText);
  state.occurrences = parsed;

  state.people = new Map();
  state.normalizedNameToPersonId = new Map();
  parsed.forEach((item) => {
    if (!item.personId || !item.personName) return;
    const normalized = normalizeName(item.personName);
    state.people.set(item.personId, {
      personId: item.personId,
      name: item.personName,
      normalizedName: normalized,
    });
    state.normalizedNameToPersonId.set(normalized, item.personId);
  });

  state.csv.conflicts = [];
  clearFormMode();
}

async function connectCsvFile() {
  if (!supportsFsAccessApi()) return;

  try {
    let handle;
    if (typeof window.showOpenFilePicker === "function") {
      const [selectedHandle] = await window.showOpenFilePicker({
        multiple: false,
        types: [{ description: "Arquivo CSV", accept: { "text/csv": [".csv"] } }],
      });
      handle = selectedHandle;
    } else if (typeof window.showSaveFilePicker === "function") {
      handle = await window.showSaveFilePicker({
        suggestedName: "ocorrencias.csv",
        types: [{ description: "Arquivo CSV", accept: { "text/csv": [".csv"] } }],
      });
    } else {
      throw new Error("File picker indisponível neste navegador/contexto.");
    }

    state.csv.fileHandle = handle;
    state.csv.connected = true;
    state.csv.mode = "connected";
    state.csv.filename = handle.name;

    await saveFileHandle(handle);
    const file = await handle.getFile();
    const content = await file.text();

    if (content.trim()) loadCsvText(content);

    renderAll();
    showToast("CSV conectado com sucesso.", "success");
  } catch (error) {
    if (error && error.name === "AbortError") return;
    showToast(`Falha ao conectar CSV: ${error.message}`, "error");
  }
}

async function tryReconnectCsvFile() {
  if (!supportsFsAccessApi()) return;

  try {
    const handle = await readFileHandle();
    if (!handle) return;

    const permission = await ensureReadWritePermission(handle);
    if (permission !== "granted") return;

    state.csv.fileHandle = handle;
    state.csv.connected = true;
    state.csv.mode = "connected";
    state.csv.filename = handle.name;

    const file = await handle.getFile();
    const text = await file.text();
    if (text.trim()) loadCsvText(text);
    showToast("CSV reconectado automaticamente.", "success");
  } catch {
    // reconexão é best-effort
  }
}

async function persistOccurrencesWithFeedback(successMessage) {
  try {
    await persistOccurrences();
    renderAll();
    showToast(successMessage, "success");
  } catch (error) {
    renderAll();
    showToast(`Dados atualizados localmente, mas falhou ao salvar CSV: ${error.message}`, "error");
  }
}

async function persistOccurrences() {
  if (!(state.csv.connected && state.csv.fileHandle)) return;
  const csv = serializeCSV(state.occurrences);
  await writeCsvToConnectedFile(csv);
}

async function writeCsvToConnectedFile(content) {
  const permission = await ensureReadWritePermission(state.csv.fileHandle);
  if (permission !== "granted") {
    throw new Error("Permissão de escrita negada.");
  }
  const writable = await state.csv.fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function ensureReadWritePermission(handle) {
  const options = { mode: "readwrite" };
  const current = await handle.queryPermission(options);
  if (current === "granted") return current;
  return handle.requestPermission(options);
}

function readCsvFromInput() {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv";
    input.addEventListener("change", () => {
      const [file] = input.files || [];
      if (!file) {
        resolve("");
        return;
      }
      state.csv.filename = file.name;
      file.text().then(resolve).catch(reject);
    });
    input.click();
  });
}

function downloadCsv(content, filename) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function showToast(message, variant = "default") {
  const toast = document.createElement("div");
  toast.className = `toast ${variant === "default" ? "" : variant}`.trim();
  toast.textContent = message;
  ui.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function openHandleDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB indisponível"));
      return;
    }

    const request = window.indexedDB.open(HANDLE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HANDLE_STORE)) {
        db.createObjectStore(HANDLE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Falha ao abrir IndexedDB"));
  });
}

async function saveFileHandle(handle) {
  const db = await openHandleDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, "readwrite");
    tx.objectStore(HANDLE_STORE).put(handle, HANDLE_KEY);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error("Falha ao salvar handle"));
  });
  db.close();
}

async function readFileHandle() {
  const db = await openHandleDb();
  const handle = await new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, "readonly");
    const request = tx.objectStore(HANDLE_STORE).get(HANDLE_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("Falha ao ler handle"));
  });
  db.close();
  return handle;
}
