const state = {
  people: new Map(),
  occurrences: [],
  filters: {
    person: "",
    date: "",
  },
  csv: {
    connected: false,
    mode: "disconnected",
    filename: null,
  },
  editingOccurrenceId: null,
  personSequence: 1,
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

function cacheElements() {
  ui.csvStatus = document.querySelector('[data-role="csv-status"]');
  ui.fallbackWarning = document.querySelector('[data-role="fallback-warning"]');
  ui.connectCsvBtn = document.querySelector('[data-action="connect-csv"]');
  ui.importCsvBtn = document.querySelector('[data-action="import-csv"]');
  ui.exportCsvBtn = document.querySelector('[data-action="export-csv"]');

  ui.occurrenceForm = document.querySelector('[data-role="occurrence-form"]');
  ui.personName = document.querySelector('[data-field="person-name"]');
  ui.personPreview = document.querySelector('[data-role="person-preview"]');
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

  ui.importCsvBtn.addEventListener("click", () => {
    showToast("Importação de CSV preparada para integração.");
  });

  ui.exportCsvBtn.addEventListener("click", () => {
    showToast("Exportação de CSV preparada para integração.");
  });
}

function bindOccurrenceForm() {
  ui.personName.addEventListener("input", renderPersonPreview);

  ui.cancelEditButton.addEventListener("click", () => {
    clearFormMode();
    showToast("Edição cancelada.");
  });

  ui.occurrenceForm.addEventListener("submit", (event) => {
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

      showToast("Ocorrência atualizada.", "success");
      clearFormMode();
      renderAll();
      return;
    }

    const occurrence = {
      occurrenceId: crypto.randomUUID(),
      personId: person.personId,
      personName: person.name,
      date: ui.occurrenceDate.value,
      durationMinutes: durationResult.value,
      createdAt: now,
      updatedAt: now,
    };

    state.occurrences.unshift(occurrence);

    ui.occurrenceForm.reset();
    ui.personPreview.textContent = "";
    requiredFields.forEach(({ input }) => input.classList.remove("is-valid", "is-invalid"));

    showToast("Ocorrência registrada.", "success");
    renderAll();
  });
}

function bindFilters() {
  ui.filterPerson.addEventListener("input", (event) => {
    state.filters.person = event.target.value.toLowerCase().trim();
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
  ui.occurrencesBody.addEventListener("click", (event) => {
    const actionButton = event.target.closest("button[data-action]");
    if (!actionButton) return;

    const rowId = actionButton.dataset.id;
    if (actionButton.dataset.action === "delete-occurrence") {
      const shouldDelete = window.confirm("Deseja realmente excluir esta ocorrência?");
      if (!shouldDelete) return;

      state.occurrences = state.occurrences.filter((item) => item.occurrenceId !== rowId);
      if (state.editingOccurrenceId === rowId) {
        clearFormMode();
      }
      showToast("Ocorrência removida.", "success");
      renderAll();
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
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });
}

function getFilteredOccurrences() {
  return state.occurrences.filter((entry) => {
    const byPerson = !state.filters.person || entry.personName.toLowerCase().includes(state.filters.person);
    const byDate = !state.filters.date || entry.date === state.filters.date;
    return byPerson && byDate;
  });
}

function renderAll() {
  renderCsvStatus();
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
      <tr data-id="${entry.occurrenceId}">
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

function renderPersonPreview() {
  const rawName = ui.personName.value.trim();
  if (!rawName) {
    ui.personPreview.textContent = "";
    return;
  }

  const key = rawName.toLowerCase();
  const existing = state.people.get(key);
  if (existing) {
    ui.personPreview.textContent = `Pessoa existente: ${existing.personId}`;
    return;
  }

  ui.personPreview.textContent = `Nova pessoa será criada com ID: ${getNextPersonId()}`;
}

function getOrCreatePerson(name) {
  const key = name.toLowerCase();
  const existing = state.people.get(key);
  if (existing) {
    if (existing.name !== name) {
      existing.name = name;
    }
    return existing;
  }

  const person = {
    personId: getNextPersonId(),
    name,
  };

  state.people.set(key, person);
  state.personSequence += 1;
  return person;
}

function getNextPersonId() {
  return `P${String(state.personSequence).padStart(4, "0")}`;
}

function clearFormMode() {
  state.editingOccurrenceId = null;
  ui.occurrenceForm.reset();
  ui.personPreview.textContent = "";
  ui.saveButton.textContent = "Salvar ocorrência";
  ui.cancelEditButton.hidden = true;
  [ui.personName, ui.occurrenceDate, ui.occurrenceDuration].forEach((input) =>
    input.classList.remove("is-valid", "is-invalid"),
  );
}

function parseDurationToMinutes(rawValue) {
  const input = rawValue.trim().toLowerCase();

  if (!input) {
    return { valid: false, error: "Informe a duração." };
  }

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

  return {
    valid: false,
    error: "Formato inválido. Use 90, 1:30 ou 1h 30m.",
  };
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
