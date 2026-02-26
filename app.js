const state = {
  people: new Map(), // personId -> { id, name, normalizedName }
  normalizedNameToPersonId: new Map(), // normalizedName -> personId
  occurrences: [],
  editingOccurrenceId: null,
  filters: {
    person: "",
    type: "",
    date: "",
  },
  csv: {
    connected: false,
    mode: "disconnected",
    filename: null,
    fileHandle: null,
    conflicts: [],
  },
};

const ui = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  setupFallbackBanner();
  bindCsvActions();
  bindOccurrenceForm();
  bindFilters();
  bindTableActions();
  renderAll();
});

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

function isOccurrenceId(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function cacheElements() {
  ui.csvStatus = document.querySelector('[data-role="csv-status"]');
  ui.fallbackWarning = document.querySelector('[data-role="fallback-warning"]');
  ui.csvConflicts = document.querySelector('[data-role="csv-conflicts"]');
  ui.connectCsvBtn = document.querySelector('[data-action="connect-csv"]');
  ui.importCsvBtn = document.querySelector('[data-action="import-csv"]');
  ui.exportCsvBtn = document.querySelector('[data-action="export-csv"]');

  ui.occurrenceForm = document.querySelector('[data-role="occurrence-form"]');
  ui.personName = document.querySelector('[data-field="person-name"]');
  ui.personIdPreview = document.querySelector('[data-role="person-id-preview"]');
  ui.occurrenceType = document.querySelector('[data-field="occurrence-type"]');
  ui.occurrenceDate = document.querySelector('[data-field="occurrence-date"]');
  ui.occurrenceNotes = document.querySelector('[data-field="occurrence-notes"]');

  ui.kpiTotalToday = document.querySelector('[data-kpi="total-today"]');
  ui.kpiUniquePeople = document.querySelector('[data-kpi="unique-people"]');
  ui.kpiTopType = document.querySelector('[data-kpi="top-type"]');

  ui.chartCanvas = document.querySelector('[data-role="occurrence-chart"]');

  ui.filterPerson = document.querySelector('[data-filter="person"]');
  ui.filterType = document.querySelector('[data-filter="type"]');
  ui.filterDate = document.querySelector('[data-filter="date"]');
  ui.clearFiltersBtn = document.querySelector('[data-action="clear-filters"]');

  ui.occurrencesBody = document.querySelector('[data-role="occurrences-body"]');
  ui.toastContainer = document.querySelector('[data-role="toast-container"]');
}

function setupFallbackBanner() {
  const hasFsApi = typeof window.showOpenFilePicker === "function";
  if (!hasFsApi) {
    state.csv.mode = "fallback";
    ui.fallbackWarning.hidden = false;
    ui.connectCsvBtn.disabled = true;
  }
}

function bindCsvActions() {
  ui.connectCsvBtn.addEventListener("click", () => {
    state.csv.connected = true;
    state.csv.mode = "connected";
    state.csv.filename = "ocorrencias.csv";
    showToast("CSV conectado com sucesso", "success");
    renderCsvStatus();
  });

  ui.importCsvBtn.addEventListener("click", async () => {
    try {
      const csvText = await readCsvInput();
      if (!csvText) {
        showToast("Nenhum conteúdo de CSV informado.", "error");
        return;
      }
      const parsed = parseCsv(csvText);
      importFromParsedCsv(parsed);
      showToast("CSV importado com sucesso.", "success");
      renderAll();
    } catch (error) {
      showToast(`Falha na importação: ${error.message}`, "error");
    }
  });

  ui.exportCsvBtn.addEventListener("click", () => {
    const csv = toCsv();
    downloadCsv(csv, state.csv.filename || "ocorrencias.csv");
    showToast("CSV exportado.", "success");
  });
}

function bindOccurrenceForm() {
  ui.personName.addEventListener("input", () => {
    renderPersonIdPreview();
  });

  ui.occurrenceForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const values = [ui.personName, ui.occurrenceType, ui.occurrenceDate];
    const hasInvalid = values.some((input) => {
      const invalid = !input.value.trim();
      input.classList.toggle("is-invalid", invalid);
      input.classList.toggle("is-valid", !invalid);
      return invalid;
    });

    if (hasInvalid) {
      showToast("Preencha os campos obrigatórios.", "error");
      return;
    }

    const person = ensurePerson(ui.personName.value);
    const baseOccurrence = {
      id: state.editingOccurrenceId || generateOccurrenceId(),
      personId: person.id,
      person: person.name,
      type: ui.occurrenceType.value,
      date: ui.occurrenceDate.value,
      notes: ui.occurrenceNotes.value.trim(),
      createdAt: new Date().toISOString(),
    };

    if (state.editingOccurrenceId) {
      const idx = state.occurrences.findIndex((item) => item.id === state.editingOccurrenceId);
      if (idx !== -1) {
        state.occurrences[idx] = { ...state.occurrences[idx], ...baseOccurrence };
      }
      showToast("Ocorrência atualizada.", "success");
    } else {
      state.occurrences.unshift(baseOccurrence);
      showToast("Ocorrência registrada.", "success");
    }

    resetOccurrenceForm();
    renderAll();
  });
}

function bindFilters() {
  ui.filterPerson.addEventListener("input", (event) => {
    state.filters.person = normalizeName(event.target.value);
    renderTable();
  });

  ui.filterType.addEventListener("change", (event) => {
    state.filters.type = event.target.value;
    renderTable();
  });

  ui.filterDate.addEventListener("change", (event) => {
    state.filters.date = event.target.value;
    renderTable();
  });

  ui.clearFiltersBtn.addEventListener("click", () => {
    state.filters = { person: "", type: "", date: "" };
    ui.filterPerson.value = "";
    ui.filterType.value = "";
    ui.filterDate.value = "";
    renderTable();
  });
}

function bindTableActions() {
  ui.occurrencesBody.addEventListener("click", (event) => {
    const actionButton = event.target.closest("button[data-action]");
    if (!actionButton) return;

    const rowId = actionButton.dataset.id;
    if (actionButton.dataset.action === "delete-occurrence") {
      state.occurrences = state.occurrences.filter((item) => item.id !== rowId);
      if (state.editingOccurrenceId === rowId) resetOccurrenceForm();
      showToast("Ocorrência removida.", "success");
      renderAll();
      return;
    }

    if (actionButton.dataset.action === "duplicate-occurrence") {
      const item = state.occurrences.find((entry) => entry.id === rowId);
      if (!item) return;
      state.occurrences.unshift({ ...item, id: generateOccurrenceId(), createdAt: new Date().toISOString() });
      showToast("Ocorrência duplicada.", "success");
      renderAll();
      return;
    }

    if (actionButton.dataset.action === "edit-occurrence") {
      const item = state.occurrences.find((entry) => entry.id === rowId);
      if (!item) return;
      state.editingOccurrenceId = rowId;
      ui.personName.value = item.person;
      ui.occurrenceType.value = item.type;
      ui.occurrenceDate.value = item.date;
      ui.occurrenceNotes.value = item.notes;
      renderPersonIdPreview();
      showToast("Editando ocorrência selecionada.");
    }
  });
}

function ensurePerson(rawName, forcedPersonId = null) {
  const normalizedName = normalizeName(rawName);
  if (!normalizedName) return null;

  const existingPersonId = state.normalizedNameToPersonId.get(normalizedName);
  if (existingPersonId) {
    const person = state.people.get(existingPersonId);
    if (person && person.name !== rawName.trim()) {
      state.people.set(existingPersonId, { ...person, name: rawName.trim() });
      syncOccurrencePersonName(existingPersonId, rawName.trim());
      return state.people.get(existingPersonId);
    }
    return person;
  }

  const personId = forcedPersonId || getNextPersonId();
  const person = {
    id: personId,
    name: rawName.trim(),
    normalizedName,
  };

  state.people.set(personId, person);
  state.normalizedNameToPersonId.set(normalizedName, personId);
  return person;
}

function getNextPersonId() {
  const max = [...state.people.keys()].reduce((acc, personId) => {
    const n = Number(String(personId).replace(/^P/i, ""));
    return Number.isFinite(n) ? Math.max(acc, n) : acc;
  }, 0);
  return `P${String(max + 1).padStart(4, "0")}`;
}

function getPreviewPersonId(name) {
  const normalizedName = normalizeName(name);
  if (!normalizedName) return getNextPersonId();
  return state.normalizedNameToPersonId.get(normalizedName) || getNextPersonId();
}

function renderPersonIdPreview() {
  ui.personIdPreview.textContent = `Próximo personId: ${getPreviewPersonId(ui.personName.value)}`;
}

function resetOccurrenceForm() {
  const values = [ui.personName, ui.occurrenceType, ui.occurrenceDate];
  state.editingOccurrenceId = null;
  ui.occurrenceForm.reset();
  values.forEach((input) => input.classList.remove("is-valid", "is-invalid"));
  renderPersonIdPreview();
}

function getFilteredOccurrences() {
  return state.occurrences.filter((entry) => {
    const byPerson = !state.filters.person || normalizeName(entry.person).includes(state.filters.person);
    const byType = !state.filters.type || entry.type === state.filters.type;
    const byDate = !state.filters.date || entry.date === state.filters.date;
    return byPerson && byType && byDate;
  });
}

function renderAll() {
  renderCsvStatus();
  renderCsvConflicts();
  renderPersonIdPreview();
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
  const today = new Date().toISOString().slice(0, 10);
  const todayEntries = state.occurrences.filter((entry) => entry.date === today);

  ui.kpiTotalToday.textContent = String(todayEntries.length);
  ui.kpiUniquePeople.textContent = String(new Set(todayEntries.map((entry) => entry.personId)).size);

  const countByType = todayEntries.reduce((acc, entry) => {
    acc[entry.type] = (acc[entry.type] || 0) + 1;
    return acc;
  }, {});

  const topType = Object.entries(countByType).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";
  ui.kpiTopType.textContent = topType;
}

function renderChart() {
  const ctx = ui.chartCanvas.getContext("2d");
  const width = ui.chartCanvas.width;
  const height = ui.chartCanvas.height;

  ctx.clearRect(0, 0, width, height);

  const counts = state.occurrences.reduce((acc, entry) => {
    acc[entry.type] = (acc[entry.type] || 0) + 1;
    return acc;
  }, {});

  const data = Object.entries(counts);
  if (!data.length) {
    ctx.fillStyle = "#6b7280";
    ctx.font = "16px sans-serif";
    ctx.fillText("Sem dados para o gráfico.", 20, 40);
    return;
  }

  const max = Math.max(...data.map(([, value]) => value), 1);
  const barWidth = 140;
  const gap = 36;

  data.forEach(([label, value], index) => {
    const x = 40 + index * (barWidth + gap);
    const barHeight = Math.round((value / max) * 150);
    const y = height - 50 - barHeight;

    ctx.fillStyle = "#2f6df6";
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.fillStyle = "#1f2937";
    ctx.font = "14px sans-serif";
    ctx.fillText(label, x, height - 24);
    ctx.fillText(String(value), x + 4, y - 8);
  });
}

function renderTable() {
  const rows = getFilteredOccurrences();
  if (!rows.length) {
    ui.occurrencesBody.innerHTML = '<tr><td colspan="5">Nenhuma ocorrência encontrada.</td></tr>';
    return;
  }

  ui.occurrencesBody.innerHTML = rows
    .map(
      (entry) => `
      <tr data-id="${entry.id}">
        <td>${escapeHtml(entry.person)} <small>(${escapeHtml(entry.personId)})</small></td>
        <td>${escapeHtml(entry.type)}</td>
        <td>${escapeHtml(entry.date)}</td>
        <td>${escapeHtml(entry.notes || "-")}</td>
        <td class="actions-cell">
          <button class="action-secondary" data-action="edit-occurrence" data-id="${entry.id}" type="button">Editar</button>
          <button class="action-secondary" data-action="duplicate-occurrence" data-id="${entry.id}" type="button">Duplicar</button>
          <button class="action-danger" data-action="delete-occurrence" data-id="${entry.id}" type="button">Excluir</button>
        </td>
      </tr>
    `,
    )
    .join("");
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

async function readCsvInput() {
  if (typeof window.showOpenFilePicker === "function") {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: "CSV", accept: { "text/csv": [".csv"] } }],
      multiple: false,
    });
    const file = await handle.getFile();
    state.csv.connected = true;
    state.csv.mode = "connected";
    state.csv.filename = file.name;
    state.csv.fileHandle = handle;
    return file.text();
  }

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
      file
        .text()
        .then(resolve)
        .catch(reject);
    });
    input.click();
  });
}

function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return [];
  const [headerLine, ...rows] = lines;
  const headers = headerLine.split(",").map((item) => item.trim());

  return rows.map((row) => {
    const values = row.split(",").map((item) => item.trim());
    return headers.reduce((acc, header, index) => {
      acc[header] = values[index] || "";
      return acc;
    }, {});
  });
}

function importFromParsedCsv(rows) {
  const nextPeople = new Map();
  const nextNormalizedNameToPersonId = new Map();
  const conflicts = [];

  const importedOccurrences = rows
    .map((row, index) => {
      const rowNumber = index + 2;
      const rawName = row.person || row.personName || "";
      const normalizedName = normalizeName(rawName);
      if (!normalizedName) return null;

      const rowPersonId = row.personId?.trim() || null;
      const occurrencePersonId = rowPersonId || `P${String(index + 1).padStart(4, "0")}`;

      const personIdByName = nextNormalizedNameToPersonId.get(normalizedName);
      if (personIdByName && personIdByName !== occurrencePersonId) {
        conflicts.push(`Linha ${rowNumber}: nome "${rawName}" possui IDs conflitantes (${personIdByName} vs ${occurrencePersonId}).`);
      }

      const existingById = nextPeople.get(occurrencePersonId);
      if (existingById && existingById.normalizedName !== normalizedName) {
        conflicts.push(
          `Linha ${rowNumber}: personId ${occurrencePersonId} já vinculado a "${existingById.name}", incompatível com "${rawName}".`,
        );
      }

      const personId = personIdByName || occurrencePersonId;
      nextPeople.set(personId, { id: personId, name: rawName.trim(), normalizedName });
      nextNormalizedNameToPersonId.set(normalizedName, personId);

      const occurrenceId = isOccurrenceId(row.id) ? row.id : generateOccurrenceId();
      return {
        id: occurrenceId,
        personId,
        person: rawName.trim(),
        type: row.type || "",
        date: row.date || "",
        notes: row.notes || "",
        createdAt: row.createdAt || new Date().toISOString(),
      };
    })
    .filter(Boolean);

  state.people = nextPeople;
  state.normalizedNameToPersonId = nextNormalizedNameToPersonId;
  state.occurrences = importedOccurrences;
  state.csv.conflicts = conflicts;
  resetOccurrenceForm();
}

function toCsv() {
  const headers = ["id", "personId", "person", "type", "date", "notes", "createdAt"];
  const rows = state.occurrences.map((entry) =>
    [entry.id, entry.personId, entry.person, entry.type, entry.date, entry.notes, entry.createdAt]
      .map((value) => `"${String(value || "").replaceAll('"', '""')}"`)
      .join(","),
  );
  return [headers.join(","), ...rows].join("\n");
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

function syncOccurrencePersonName(personId, personName) {
  state.occurrences = state.occurrences.map((occurrence) =>
    occurrence.personId === personId ? { ...occurrence, person: personName } : occurrence,
  );
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
