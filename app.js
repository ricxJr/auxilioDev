const state = {
  people: new Map(),
  occurrences: [],
  filters: {
    person: "",
    type: "",
    date: "",
  },
  csv: {
    connected: false,
    mode: "disconnected",
    filename: null,
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

function cacheElements() {
  ui.csvStatus = document.querySelector('[data-role="csv-status"]');
  ui.fallbackWarning = document.querySelector('[data-role="fallback-warning"]');
  ui.connectCsvBtn = document.querySelector('[data-action="connect-csv"]');
  ui.importCsvBtn = document.querySelector('[data-action="import-csv"]');
  ui.exportCsvBtn = document.querySelector('[data-action="export-csv"]');

  ui.occurrenceForm = document.querySelector('[data-role="occurrence-form"]');
  ui.personName = document.querySelector('[data-field="person-name"]');
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

  ui.importCsvBtn.addEventListener("click", () => {
    showToast("Importação de CSV preparada para integração.");
  });

  ui.exportCsvBtn.addEventListener("click", () => {
    showToast("Exportação de CSV preparada para integração.");
  });
}

function bindOccurrenceForm() {
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

    const occurrence = {
      id: crypto.randomUUID(),
      person: ui.personName.value.trim(),
      type: ui.occurrenceType.value,
      date: ui.occurrenceDate.value,
      notes: ui.occurrenceNotes.value.trim(),
      createdAt: new Date().toISOString(),
    };

    state.occurrences.unshift(occurrence);
    state.people.set(occurrence.person.toLowerCase(), occurrence.person);

    ui.occurrenceForm.reset();
    values.forEach((input) => input.classList.remove("is-valid", "is-invalid"));

    showToast("Ocorrência registrada.", "success");
    renderAll();
  });
}

function bindFilters() {
  ui.filterPerson.addEventListener("input", (event) => {
    state.filters.person = event.target.value.toLowerCase().trim();
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
      showToast("Ocorrência removida.", "success");
      renderAll();
      return;
    }

    if (actionButton.dataset.action === "duplicate-occurrence") {
      const item = state.occurrences.find((entry) => entry.id === rowId);
      if (!item) return;
      state.occurrences.unshift({ ...item, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
      showToast("Ocorrência duplicada.", "success");
      renderAll();
    }
  });
}

function getFilteredOccurrences() {
  return state.occurrences.filter((entry) => {
    const byPerson = !state.filters.person || entry.person.toLowerCase().includes(state.filters.person);
    const byType = !state.filters.type || entry.type === state.filters.type;
    const byDate = !state.filters.date || entry.date === state.filters.date;
    return byPerson && byType && byDate;
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
  ui.kpiUniquePeople.textContent = String(new Set(todayEntries.map((entry) => entry.person)).size);

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
        <td>${escapeHtml(entry.person)}</td>
        <td>${escapeHtml(entry.type)}</td>
        <td>${escapeHtml(entry.date)}</td>
        <td>${escapeHtml(entry.notes || "-")}</td>
        <td class="actions-cell">
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

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
