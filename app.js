const CSV_HEADERS = [
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
    person: "",
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

document.addEventListener("DOMContentLoaded", async () => {
  cacheElements();
  setupFallbackMode();
  bindCsvActions();
  bindOccurrenceForm();
  bindFilters();
  bindTableActions();
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

  ui.occurrenceForm = document.querySelector('[data-role="occurrence-form"]');
  ui.personName = document.querySelector('[data-field="person-name"]');
  ui.personPreview = document.querySelector('[data-role="person-preview"]');
  ui.personIdPreview = document.querySelector('[data-role="person-id-preview"]');
  ui.occurrenceDate = document.querySelector('[data-field="occurrence-date"]');
  ui.occurrenceDuration = document.querySelector('[data-field="occurrence-duration"]');
  ui.saveButton = document.querySelector('[data-action="save-occurrence"]');
  ui.cancelEditButton = document.querySelector('[data-action="cancel-edit"]');

  ui.kpiTotalToday = document.querySelector('[data-kpi="total-today"]');
  ui.kpiUniquePeople = document.querySelector('[data-kpi="unique-people"]');
  ui.kpiTopType = document.querySelector('[data-kpi="top-type"]');

  ui.chartCanvas = document.querySelector('[data-role="occurrence-chart"]');

  ui.filterPerson = document.querySelector('[data-filter="person"]');
  ui.filterDate = document.querySelector('[data-filter="date"]');
  ui.clearFiltersBtn = document.querySelector('[data-action="clear-filters"]');

  ui.occurrencesBody = document.querySelector('[data-role="occurrences-body"]');
  ui.toastContainer = document.querySelector('[data-role="toast-container"]');
}

function supportsFsAccessApi() {
  return typeof window.showOpenFilePicker === "function" && typeof window.showSaveFilePicker === "function";
}

function setupFallbackMode() {
  if (!supportsFsAccessApi()) {
    state.csv.mode = "fallback";
    ui.fallbackWarning.hidden = false;
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
        showToast("Ocorrência para edição não encontrada.", "error");
        return;
      }

      occurrence.personId = person.personId;
      occurrence.personName = person.name;
      occurrence.date = ui.occurrenceDate.value;
      occurrence.durationMinutes = durationResult.value;
      occurrence.updatedAt = now;

      clearFormMode();
      await persistOccurrencesWithFeedback("Ocorrência atualizada.");
      return;
    }

    state.occurrences.unshift({
      occurrenceId: generateOccurrenceId(),
      personId: person.personId,
      personName: person.name,
      date: ui.occurrenceDate.value,
      durationMinutes: durationResult.value,
      createdAt: now,
      updatedAt: now,
    });

    clearFormMode();
    await persistOccurrencesWithFeedback("Ocorrência registrada.");
  });
}

function bindFilters() {
  ui.filterPerson.addEventListener("input", (event) => {
    state.filters.person = normalizeName(event.target.value);
    renderTable();
  });

  ui.filterDate.addEventListener("change", (event) => {
    state.filters.date = event.target.value;
    renderTable();
  });

  ui.clearFiltersBtn.addEventListener("click", () => {
    state.filters = { person: "", date: "" };
    ui.filterPerson.value = "";
    ui.filterDate.value = "";
    renderTable();
  });
}

function bindTableActions() {
  ui.occurrencesBody.addEventListener("click", async (event) => {
    const actionButton = event.target.closest("button[data-action]");
    if (!actionButton) return;

    const rowId = actionButton.dataset.id;

    if (actionButton.dataset.action === "delete-occurrence") {
      if (!window.confirm("Deseja realmente excluir esta ocorrência?")) return;
      state.occurrences = state.occurrences.filter((item) => item.occurrenceId !== rowId);
      if (state.editingOccurrenceId === rowId) clearFormMode();
      await persistOccurrencesWithFeedback("Ocorrência removida.");
      return;
    }

    if (actionButton.dataset.action === "edit-occurrence") {
      const item = state.occurrences.find((entry) => entry.occurrenceId === rowId);
      if (!item) return;

      state.editingOccurrenceId = item.occurrenceId;
      ui.personName.value = item.personName;
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
  ui.saveButton.textContent = "Salvar ocorrência";
  ui.cancelEditButton.hidden = true;
  [ui.personName, ui.occurrenceDate, ui.occurrenceDuration].forEach((input) =>
    input.classList.remove("is-valid", "is-invalid"),
  );
  renderPersonPreview();
  renderPersonIdPreview();
}

function getFilteredOccurrences() {
  return state.occurrences.filter((entry) => {
    const byPerson = !state.filters.person || normalizeName(entry.personName).includes(state.filters.person);
    const byDate = !state.filters.date || entry.date === state.filters.date;
    return byPerson && byDate;
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

  const totalDuration = todayEntries.reduce((acc, entry) => acc + entry.durationMinutes, 0);
  ui.kpiTopType.textContent = todayEntries.length ? `${Math.round(totalDuration / todayEntries.length)} min méd.` : "-";
}

function renderChart() {
  const ctx = ui.chartCanvas.getContext("2d");
  const width = ui.chartCanvas.width;
  const height = ui.chartCanvas.height;

  ctx.clearRect(0, 0, width, height);

  const counts = state.occurrences.reduce((acc, entry) => {
    acc[entry.personName] = (acc[entry.personName] || 0) + 1;
    return acc;
  }, {});

  const data = Object.entries(counts).slice(0, 5);
  if (!data.length) {
    ctx.fillStyle = "#6b7280";
    ctx.font = "16px sans-serif";
    ctx.fillText("Sem dados para o gráfico.", 20, 40);
    return;
  }

  const max = Math.max(...data.map(([, value]) => value), 1);
  const barWidth = 140;
  const gap = 24;

  data.forEach(([label, value], index) => {
    const x = 40 + index * (barWidth + gap);
    const barHeight = Math.round((value / max) * 150);
    const y = height - 50 - barHeight;

    ctx.fillStyle = "#2f6df6";
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.fillStyle = "#1f2937";
    ctx.font = "14px sans-serif";
    ctx.fillText(label.slice(0, 12), x, height - 24);
    ctx.fillText(String(value), x + 4, y - 8);
  });
}

function renderTable() {
  const rows = getFilteredOccurrences();
  if (!rows.length) {
    ui.occurrencesBody.innerHTML = '<tr><td colspan="4">Nenhuma ocorrência encontrada.</td></tr>';
    return;
  }

  ui.occurrencesBody.innerHTML = rows
    .map(
      (entry) => `
      <tr>
        <td>${escapeHtml(entry.date)}</td>
        <td>${escapeHtml(entry.personName)} <small>(${escapeHtml(entry.personId)})</small></td>
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
  if (normalizedHeader.join(",") !== CSV_HEADERS.join(",")) {
    throw new Error("Cabeçalho CSV inválido.");
  }

  return body
    .filter((columns) => columns.some((value) => value !== ""))
    .map((columns) => ({
      occurrenceId: columns[0] || generateOccurrenceId(),
      personId: columns[1] || "",
      personName: columns[2] || "",
      date: columns[3] || "",
      durationMinutes: Number(columns[4] || 0),
      createdAt: columns[5] || new Date().toISOString(),
      updatedAt: columns[6] || new Date().toISOString(),
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
    const handle = await window.showSaveFilePicker({
      suggestedName: "ocorrencias.csv",
      types: [{ description: "Arquivo CSV", accept: { "text/csv": [".csv"] } }],
    });

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
