// State Management
let CURRENT_DATA = window.R358_CURRENT_DATA || [];
let SUMMARY = window.R358_SUMMARY || { months: [], analysts: [], dates_by_month: {} };

let selectedMonth = window.R358_DEFAULT_MONTH || "2026-09";
let selectedDate = "";
let selectedTimeMode = "hourly"; // 'hourly' or 'monthly'
let selectedAnalyst = "EHUAMANIQ";
let isCompareAllMode = false;

let chartVarMes = null;
let chartVarDia = null;
let chartDesembolso = null;

// Playback State for Monthly Evolution
let isPlaying = false;
let playbackTimer = null;
let playbackCurrentDayIdx = 0;

const PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6',
  '#06b6d4', '#f97316', '#14b8a6', '#6366f1', '#e11d48'
];

function formatCurrency(val) {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 0 }).format(val || 0);
}

function formatNumber(val) {
  return new Intl.NumberFormat('es-PE').format(val || 0);
}

function formatPercent(val) {
  return (val || 0).toFixed(2) + '%';
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadInitialData();
  initFilters();
  initEventListeners();
  setupSyncButtonForPlatform();
  renderDashboard();
});

function isLocalEnvironment() {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

function setupSyncButtonForPlatform() {
  const btn = document.getElementById('btn-sync-outlook');
  if (!btn) return;

  if (!isLocalEnvironment()) {
    // We are on GitHub Pages / Cloud
    btn.innerHTML = `<i data-lucide="cloud-check" class="w-3.5 h-3.5"></i> <span>Info Sincronización</span>`;
    btn.className = "px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold flex items-center gap-2 transition text-xs border border-slate-700";
    if (window.lucide) lucide.createIcons();
  }
}

async function loadInitialData() {
  if (!SUMMARY.months || SUMMARY.months.length === 0) {
    try {
      const resp = await fetch('summary.json');
      SUMMARY = await resp.json();
    } catch (e) {
      console.error("Error loading summary:", e);
    }
  }

  const months = SUMMARY.months || ["2026-09"];
  selectedMonth = months.includes("2026-09") ? "2026-09" : (months.includes("2026-08") ? "2026-08" : months[months.length - 1]);
  
  try {
    const resp = await fetch(`data_by_month/${selectedMonth}.json`);
    CURRENT_DATA = await resp.json();
  } catch (e) {
    console.warn("Fallback to bundled data", e);
  }
}

function initFilters() {
  const monthSelect = document.getElementById('filter-month');
  monthSelect.innerHTML = (SUMMARY.months || []).map(m => 
    `<option value="${m}" ${m === selectedMonth ? 'selected' : ''}>${m}</option>`
  ).join('');

  updateDateDropdown();
  updateAnalystDropdown();
  renderAnalystChips();

  document.getElementById('nav-last-sync').textContent = SUMMARY.last_sync || "Hoy";
}

function updateDateDropdown() {
  const dates = (SUMMARY.dates_by_month && SUMMARY.dates_by_month[selectedMonth]) ? SUMMARY.dates_by_month[selectedMonth] : [];
  const dateSelect = document.getElementById('filter-date');
  
  if (dates.length > 0) {
    dateSelect.innerHTML = dates.map(d => `<option value="${d}">${d}</option>`).join('');
    selectedDate = dates[dates.length - 1];
    dateSelect.value = selectedDate;

    const slider = document.getElementById('playback-slider');
    if (slider) {
      slider.max = dates.length;
      slider.value = dates.length;
      document.getElementById('playback-day-label').textContent = dates[dates.length - 1].slice(8);
    }
  } else {
    dateSelect.innerHTML = `<option value="">Sin datos</option>`;
    selectedDate = "";
  }
}

function updateAnalystDropdown() {
  const analystSelect = document.getElementById('filter-analyst');
  const monthMembers = Array.from(new Set(CURRENT_DATA.filter(r => r.cat === 'ANALISTA').map(r => r.name))).sort();
  const list = monthMembers.length > 0 ? monthMembers : SUMMARY.analysts;

  let optionsHtml = '<option value="COMPARE_ALL">👥 COMPARAR TODOS LOS INTEGRANTES</option>';
  optionsHtml += '<option value="TOTAL COMITÉ">⭐ TOTAL COMITÉ (Consolidado)</option>';
  optionsHtml += list.map(a => `<option value="${a}" ${!isCompareAllMode && a === selectedAnalyst ? 'selected' : ''}>${a}</option>`).join('');
  analystSelect.innerHTML = optionsHtml;

  if (isCompareAllMode) {
    analystSelect.value = "COMPARE_ALL";
  } else if (!list.includes(selectedAnalyst) && selectedAnalyst !== 'TOTAL COMITÉ') {
    selectedAnalyst = list[0] || 'TOTAL COMITÉ';
    analystSelect.value = selectedAnalyst;
  }
}

function renderAnalystChips() {
  const container = document.getElementById('analyst-chips-container');
  const monthMembers = Array.from(new Set(CURRENT_DATA.filter(r => r.cat === 'ANALISTA').map(r => r.name))).sort();

  container.innerHTML = monthMembers.map((a, i) => {
    const isSelected = !isCompareAllMode && selectedAnalyst === a;
    const color = PALETTE[i % PALETTE.length];
    return `
      <button onclick="selectAnalyst('${a}')" 
        class="px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition flex items-center gap-1.5 border ${
          isSelected 
            ? 'bg-blue-600 text-white border-blue-400 shadow-md ring-1 ring-blue-400/50' 
            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
        }">
        <span class="w-2 h-2 rounded-full" style="background-color: ${color}"></span>
        ${a}
      </button>
    `;
  }).join('');
}

function selectAnalyst(name) {
  isCompareAllMode = false;
  selectedAnalyst = name;
  document.getElementById('filter-analyst').value = name;
  updateCompareButtonUI();
  renderAnalystChips();
  renderDashboard();
}

function toggleCompareAll() {
  isCompareAllMode = !isCompareAllMode;
  if (isCompareAllMode) {
    document.getElementById('filter-analyst').value = "COMPARE_ALL";
  } else {
    document.getElementById('filter-analyst').value = selectedAnalyst;
  }
  updateCompareButtonUI();
  renderAnalystChips();
  renderDashboard();
}

function updateCompareButtonUI() {
  const btn = document.getElementById('btn-compare-all');
  if (!btn) return;
  if (isCompareAllMode) {
    btn.classList.add('active-toggle', 'ring-2', 'ring-blue-400');
    document.getElementById('btn-compare-all-label').textContent = '✓ Modo Comparativo Activo';
  } else {
    btn.classList.remove('active-toggle', 'ring-2', 'ring-blue-400');
    document.getElementById('btn-compare-all-label').textContent = '👥 Comparar Todos los Integrantes';
  }
}

function initEventListeners() {
  document.getElementById('filter-month').addEventListener('change', async (e) => {
    selectedMonth = e.target.value;
    pausePlayback();
    try {
      const resp = await fetch(`data_by_month/${selectedMonth}.json`);
      CURRENT_DATA = await resp.json();
    } catch (err) {
      console.error("Error loading month data:", err);
    }
    updateDateDropdown();
    updateAnalystDropdown();
    renderAnalystChips();
    renderDashboard();
  });

  document.getElementById('filter-time-mode').addEventListener('change', (e) => {
    selectedTimeMode = e.target.value;
    pausePlayback();
    const dateContainer = document.getElementById('container-filter-date');
    const playbackBar = document.getElementById('playback-toolbar');
    if (selectedTimeMode === 'hourly') {
      dateContainer.classList.remove('opacity-40', 'pointer-events-none');
      playbackBar.classList.add('hidden');
    } else {
      dateContainer.classList.add('opacity-40', 'pointer-events-none');
      playbackBar.classList.remove('hidden');
    }
    renderDashboard();
  });

  document.getElementById('filter-date').addEventListener('change', (e) => {
    selectedDate = e.target.value;
    renderDashboard();
  });

  document.getElementById('filter-analyst').addEventListener('change', (e) => {
    if (e.target.value === "COMPARE_ALL") {
      isCompareAllMode = true;
    } else {
      isCompareAllMode = false;
      selectedAnalyst = e.target.value;
    }
    updateCompareButtonUI();
    renderAnalystChips();
    renderDashboard();
  });

  document.getElementById('btn-compare-all').addEventListener('click', toggleCompareAll);
  document.getElementById('btn-select-total').addEventListener('click', () => selectAnalyst('TOTAL COMITÉ'));

  document.getElementById('btn-play-pause').addEventListener('click', togglePlayback);
  document.getElementById('btn-reset-playback').addEventListener('click', resetPlayback);
  document.getElementById('playback-slider').addEventListener('input', (e) => {
    const dates = (SUMMARY.dates_by_month && SUMMARY.dates_by_month[selectedMonth]) ? SUMMARY.dates_by_month[selectedMonth] : [];
    const idx = parseInt(e.target.value) - 1;
    if (dates[idx]) {
      playbackCurrentDayIdx = idx;
      document.getElementById('playback-day-label').textContent = dates[idx].slice(8);
      renderDashboard(idx + 1);
    }
  });

  document.getElementById('btn-sync-outlook').addEventListener('click', handleSyncClick);
}

function togglePlayback() {
  if (isPlaying) {
    pausePlayback();
  } else {
    startPlayback();
  }
}

function startPlayback() {
  const dates = (SUMMARY.dates_by_month && SUMMARY.dates_by_month[selectedMonth]) ? SUMMARY.dates_by_month[selectedMonth] : [];
  if (dates.length === 0) return;

  isPlaying = true;
  document.getElementById('play-text').textContent = 'Pausar';
  document.getElementById('play-icon').setAttribute('data-lucide', 'pause');
  lucide.createIcons();

  const speedMs = parseInt(document.getElementById('playback-speed').value) || 600;

  if (playbackCurrentDayIdx >= dates.length - 1) {
    playbackCurrentDayIdx = 0;
  }

  playbackTimer = setInterval(() => {
    playbackCurrentDayIdx++;
    if (playbackCurrentDayIdx >= dates.length) {
      pausePlayback();
      return;
    }
    document.getElementById('playback-slider').value = playbackCurrentDayIdx + 1;
    document.getElementById('playback-day-label').textContent = dates[playbackCurrentDayIdx].slice(8);
    renderDashboard(playbackCurrentDayIdx + 1);
  }, speedMs);
}

function pausePlayback() {
  isPlaying = false;
  if (playbackTimer) {
    clearInterval(playbackTimer);
    playbackTimer = null;
  }
  const btnText = document.getElementById('play-text');
  if (btnText) btnText.textContent = 'Reproducir Mes';
  const icon = document.getElementById('play-icon');
  if (icon) icon.setAttribute('data-lucide', 'play');
  lucide.createIcons();
}

function resetPlayback() {
  pausePlayback();
  playbackCurrentDayIdx = 0;
  const dates = (SUMMARY.dates_by_month && SUMMARY.dates_by_month[selectedMonth]) ? SUMMARY.dates_by_month[selectedMonth] : [];
  document.getElementById('playback-slider').value = 1;
  if (dates.length > 0) {
    document.getElementById('playback-day-label').textContent = dates[0].slice(8);
  }
  renderDashboard(1);
}

async function handleSyncClick() {
  if (!isLocalEnvironment()) {
    alert(
      "📌 ESTÁS EN LA VERSIÓN WEB DE INTERNET (GitHub):\n\n" +
      "• Para actualizar nuevos datos desde tu computadora, dale doble clic al archivo 'Actualizar_R358_Dashboard.bat' en tu Escritorio.\n\n" +
      "• La actualización también se realiza automáticamente cada hora mientras tu computadora esté encendida.\n\n" +
      "• Para sincronizar manualmente desde el navegador, abre la versión local: http://localhost:8555"
    );
    return;
  }

  const btn = document.getElementById('btn-sync-outlook');
  const icon = document.getElementById('sync-icon');
  
  btn.disabled = true;
  btn.classList.add('opacity-75', 'cursor-not-allowed');
  if (icon) icon.classList.add('animate-spin');
  btn.querySelector('span').textContent = 'Sincronizando...';

  try {
    const response = await fetch('/api/sync', { method: 'POST' });
    const result = await response.json();
    
    if (result.status === 'success') {
      SUMMARY = result.summary;
      document.getElementById('nav-last-sync').textContent = SUMMARY.last_sync;
      
      const respMonth = await fetch(`data_by_month/${selectedMonth}.json`);
      CURRENT_DATA = await respMonth.json();
      
      updateDateDropdown();
      updateAnalystDropdown();
      renderAnalystChips();
      renderDashboard();
      alert('¡Sincronización con Outlook completada con éxito!');
    } else {
      alert('Error en la sincronización: ' + result.message);
    }
  } catch (err) {
    console.error('Error sincronizando:', err);
    alert('No se pudo sincronizar automáticamente. Verifica que server.py esté activo.');
  } finally {
    btn.disabled = false;
    btn.classList.remove('opacity-75', 'cursor-not-allowed');
    if (icon) icon.classList.remove('animate-spin');
    btn.querySelector('span').textContent = 'Sincronizar Outlook';
  }
}

function renderDashboard(limitDaysCount = null) {
  const badgeLabel = isCompareAllMode ? 'Todos los Integrantes' : selectedAnalyst;
  document.getElementById('badge-analyst-1').textContent = badgeLabel;
  document.getElementById('badge-analyst-2').textContent = badgeLabel;
  document.getElementById('badge-analyst-3').textContent = badgeLabel;

  const monthMembers = Array.from(new Set(CURRENT_DATA.filter(r => r.cat === 'ANALISTA').map(r => r.name))).sort();

  if (selectedTimeMode === 'hourly') {
    document.getElementById('chart1-subtitle').textContent = `Eje X: 08:00 a 23:00 hrs • Día: ${selectedDate} • Eje Y: Variación del Mes Cartera Bruta`;
    document.getElementById('chart2-subtitle').textContent = `Eje X: 08:00 a 23:00 hrs • Día: ${selectedDate} • Eje Y: Variación del Día Cartera Bruta`;
    document.getElementById('chart3-subtitle').textContent = `Eje X: 08:00 a 23:00 hrs • Día: ${selectedDate} • Eje Y: Desembolso del Día`;

    const dayRecords = CURRENT_DATA.filter(r => r.date === selectedDate);
    const hours = Array.from(new Set(dayRecords.map(r => r.time))).sort();

    if (isCompareAllMode) {
      const seriesVarMes = [];
      const seriesVarDia = [];
      const seriesDesemb = [];

      monthMembers.forEach((m, idx) => {
        const mRecords = dayRecords.filter(r => r.name === m);
        const map = {};
        mRecords.forEach(r => { map[r.time] = r; });

        seriesVarMes.push({
          name: m,
          data: hours.map(h => map[h] ? map[h].vcb_m : 0),
          color: PALETTE[idx % PALETTE.length]
        });

        seriesVarDia.push({
          name: m,
          data: hours.map(h => map[h] ? map[h].vcb_d : 0),
          color: PALETTE[idx % PALETTE.length]
        });

        seriesDesemb.push({
          name: m,
          data: hours.map(h => map[h] ? map[h].mto_des : 0),
          color: PALETTE[idx % PALETTE.length]
        });
      });

      renderApexMultiLine('apex-chart-var-mes', chartVarMes, (c) => chartVarMes = c, hours, seriesVarMes, 'Var Mes Cartera');
      renderApexMultiLine('apex-chart-var-dia', chartVarDia, (c) => chartVarDia = c, hours, seriesVarDia, 'Var Día Cartera');
      renderApexMultiLine('apex-chart-desembolso', chartDesembolso, (c) => chartDesembolso = c, hours, seriesDesemb, 'Desembolso Día', true);

      renderTradingTable(dayRecords);
      updateKPIs(dayRecords);

    } else {
      const targetRecords = selectedAnalyst === 'TOTAL COMITÉ'
        ? dayRecords.filter(r => r.cat === 'TOTAL_COMITE')
        : dayRecords.filter(r => r.name === selectedAnalyst);

      const hourMap = {};
      targetRecords.forEach(r => { hourMap[r.time] = r; });

      const records = hours.map(h => {
        const rec = hourMap[h] || { time: h, vcb_m: 0, vcb_d: 0, mto_des: 0, num_des: 0, cb: 0, ca: 0, pm: 0, vc_m: 0 };
        return { ...rec, timeLabel: rec.time };
      });

      renderLineChartSingle('apex-chart-var-mes', chartVarMes, (c) => chartVarMes = c, records, 'vcb_m', 'Var Mes Cartera', '#3b82f6');
      renderLineChartSingle('apex-chart-var-dia', chartVarDia, (c) => chartVarDia = c, records, 'vcb_d', 'Var Día Cartera', '#14b8a6');
      renderLineChartSingle('apex-chart-desembolso', chartDesembolso, (c) => chartDesembolso = c, records, 'mto_des', 'Desembolso Día', '#10b981', true);

      renderTradingTable(records);
      updateKPIs(records);
    }

  } else {
    document.getElementById('chart1-subtitle').textContent = `Eje X: Día 01 al 31 (${selectedMonth}) • Eje Y: Variación del Mes Cartera Bruta`;
    document.getElementById('chart2-subtitle').textContent = `Eje X: Día 01 al 31 (${selectedMonth}) • Eje Y: Variación del Día Cartera Bruta`;
    document.getElementById('chart3-subtitle').textContent = `Eje X: Día 01 al 31 (${selectedMonth}) • Eje Y: Desembolso del Día`;

    let dates = (SUMMARY.dates_by_month && SUMMARY.dates_by_month[selectedMonth]) ? SUMMARY.dates_by_month[selectedMonth] : [];
    if (limitDaysCount && limitDaysCount > 0 && limitDaysCount <= dates.length) {
      dates = dates.slice(0, limitDaysCount);
    }

    const xLabels = dates.map(d => `D${d.slice(8)}`);

    if (isCompareAllMode) {
      const seriesVarMes = [];
      const seriesVarDia = [];
      const seriesDesemb = [];

      monthMembers.forEach((m, idx) => {
        const mRecords = CURRENT_DATA.filter(r => r.name === m);
        const dayMap = {};
        mRecords.forEach(r => {
          if (!dayMap[r.date] || r.dt > dayMap[r.date].dt) dayMap[r.date] = r;
        });

        seriesVarMes.push({
          name: m,
          data: dates.map(d => dayMap[d] ? dayMap[d].vcb_m : 0),
          color: PALETTE[idx % PALETTE.length]
        });

        seriesVarDia.push({
          name: m,
          data: dates.map(d => dayMap[d] ? dayMap[d].vcb_d : 0),
          color: PALETTE[idx % PALETTE.length]
        });

        seriesDesemb.push({
          name: m,
          data: dates.map(d => dayMap[d] ? dayMap[d].mto_des : 0),
          color: PALETTE[idx % PALETTE.length]
        });
      });

      renderApexMultiLine('apex-chart-var-mes', chartVarMes, (c) => chartVarMes = c, xLabels, seriesVarMes, 'Var Mes Cartera');
      renderApexMultiLine('apex-chart-var-dia', chartVarDia, (c) => chartVarDia = c, xLabels, seriesVarDia, 'Var Día Cartera');
      renderApexMultiLine('apex-chart-desembolso', chartDesembolso, (c) => chartDesembolso = c, xLabels, seriesDesemb, 'Desembolso Día', true);

      const latestDate = dates[dates.length - 1];
      const snapshotRecords = CURRENT_DATA.filter(r => r.date === latestDate);
      renderTradingTable(snapshotRecords);
      updateKPIs(snapshotRecords);

    } else {
      const monthData = selectedAnalyst === 'TOTAL COMITÉ'
        ? CURRENT_DATA.filter(r => r.cat === 'TOTAL_COMITE')
        : CURRENT_DATA.filter(r => r.name === selectedAnalyst);

      const records = dates.map(d => {
        const dayRecs = monthData.filter(r => r.date === d);
        if (dayRecs.length > 0) {
          const lastRec = dayRecs.reduce((max, r) => r.dt > max ? r.dt : max, dayRecs[0].dt);
          const rec = dayRecs.find(r => r.dt === lastRec) || dayRecs[0];
          return { ...rec, timeLabel: `D${d.slice(8)}` };
        } else {
          return { date: d, timeLabel: `D${d.slice(8)}`, vcb_m: 0, vcb_d: 0, mto_des: 0, num_des: 0, cb: 0, ca: 0, pm: 0, vc_m: 0 };
        }
      });

      renderLineChartSingle('apex-chart-var-mes', chartVarMes, (c) => chartVarMes = c, records, 'vcb_m', 'Var Mes Cartera', '#3b82f6');
      renderLineChartSingle('apex-chart-var-dia', chartVarDia, (c) => chartVarDia = c, records, 'vcb_d', 'Var Día Cartera', '#14b8a6');
      renderLineChartSingle('apex-chart-desembolso', chartDesembolso, (c) => chartDesembolso = c, records, 'mto_des', 'Desembolso Día', '#10b981', true);

      renderTradingTable(records);
      updateKPIs(records);
    }
  }
}

function updateKPIs(records) {
  if (records.length === 0) return;
  const latest = records[records.length - 1];

  const kpiVarMesEl = document.getElementById('kpi-var-mes-cart');
  kpiVarMesEl.textContent = formatCurrency(latest.vcb_m);
  kpiVarMesEl.className = `text-base font-bold font-mono ${latest.vcb_m >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;

  const kpiVarDiaEl = document.getElementById('kpi-var-dia-cart');
  kpiVarDiaEl.textContent = formatCurrency(latest.vcb_d);
  kpiVarDiaEl.className = `text-base font-bold font-mono ${latest.vcb_d >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;

  document.getElementById('kpi-desemb-dia').textContent = formatCurrency(latest.mto_des);
  document.getElementById('kpi-cart-bruta').textContent = formatCurrency(latest.cb);
  document.getElementById('kpi-mora-pct').textContent = formatPercent(latest.pm);
  document.getElementById('kpi-var-cli').textContent = `${formatNumber(latest.vc_m)} cli`;
}

function renderLineChartSingle(containerId, chartRef, setChartRef, records, fieldKey, seriesName, strokeColor, isDesembolso = false) {
  const categories = records.map(r => r.timeLabel);
  const dataValues = records.map(r => r[fieldKey] || 0);

  const options = {
    series: [{
      name: seriesName,
      data: dataValues
    }],
    chart: {
      type: 'line',
      height: 310,
      background: '#0b0f19',
      toolbar: {
        show: true,
        offsetX: -10,
        offsetY: -53,
        tools: { download: true, selection: true, zoom: true, zoomin: true, zoomout: true, pan: true, reset: true }
      },
      zoom: { enabled: true }
    },
    colors: [strokeColor],
    stroke: {
      curve: 'straight',
      width: 3.5
    },
    markers: {
      size: 6,
      colors: [strokeColor],
      strokeColors: '#ffffff',
      strokeWidth: 2,
      hover: { size: 9 }
    },
    dataLabels: {
      enabled: true,
      formatter: function (val) {
        if (isDesembolso && val === 0) return '0';
        return formatCurrency(val);
      },
      offsetY: -8,
      style: {
        fontSize: '11px',
        fontFamily: 'monospace',
        fontWeight: 'bold',
        colors: ['#ffffff']
      },
      background: { enabled: false },
      dropShadow: {
        enabled: true,
        top: 1,
        left: 1,
        blur: 2,
        color: '#000000',
        opacity: 0.95
      }
    },
    grid: {
      borderColor: '#1e293b',
      strokeDashArray: 3,
      padding: { top: 15, right: 15, bottom: 5, left: 10 },
      xaxis: { lines: { show: true } },
      yaxis: { lines: { show: true } }
    },
    annotations: {
      yaxis: [{
        y: 0,
        borderColor: '#fbbf24',
        borderWidth: 2.5,
        strokeDashArray: 0,
        label: {
          text: 'EJE BASE 0.00',
          borderColor: '#fbbf24',
          style: {
            color: '#000000',
            background: '#fbbf24',
            fontSize: '10px',
            fontWeight: 'bold'
          }
        }
      }]
    },
    xaxis: {
      categories: categories,
      title: {
        text: selectedTimeMode === 'hourly' ? 'Horas del Día (Cortes R358)' : 'Días del Mes',
        style: { color: '#94a3b8', fontSize: '11px', fontWeight: 'bold' }
      },
      labels: {
        style: { colors: '#94a3b8', fontSize: '11px', fontFamily: 'monospace', fontWeight: 'bold' }
      },
      axisBorder: { color: '#334155' }
    },
    yaxis: {
      title: {
        text: `${seriesName} (S/.)`,
        style: { color: strokeColor, fontSize: '11px', fontWeight: 'bold' }
      },
      labels: {
        style: { colors: '#94a3b8', fontSize: '11px', fontFamily: 'monospace' },
        formatter: (val) => formatCurrency(val)
      }
    },
    tooltip: {
      theme: 'dark',
      y: { formatter: (val) => formatCurrency(val) }
    }
  };

  if (chartRef) chartRef.destroy();
  const newChart = new ApexCharts(document.querySelector(`#${containerId}`), options);
  newChart.render();
  setChartRef(newChart);
}

function renderApexMultiLine(containerId, chartRef, setChartRef, categories, seriesList, metricTitle, isDesembolso = false) {
  const options = {
    series: seriesList.map(s => ({
      name: s.name,
      data: s.data
    })),
    chart: {
      type: 'line',
      height: 310,
      background: '#0b0f19',
      toolbar: {
        show: true,
        offsetX: -10,
        offsetY: -53,
        tools: { download: true, selection: true, zoom: true, zoomin: true, zoomout: true, pan: true, reset: true }
      }
    },
    colors: seriesList.map(s => s.color),
    stroke: {
      curve: 'straight',
      width: 2.5
    },
    markers: {
      size: 5,
      strokeWidth: 1.5,
      hover: { size: 8 }
    },
    dataLabels: {
      enabled: seriesList.length <= 3,
      formatter: (val) => formatCurrency(val),
      offsetY: -6,
      style: {
        fontSize: '10px',
        fontFamily: 'monospace',
        fontWeight: 'bold',
        colors: ['#ffffff']
      },
      background: { enabled: false },
      dropShadow: { enabled: true, top: 1, left: 1, blur: 2, color: '#000000', opacity: 0.95 }
    },
    grid: {
      borderColor: '#1e293b',
      strokeDashArray: 3,
      padding: { top: 15, right: 15, bottom: 5, left: 10 }
    },
    annotations: {
      yaxis: [{
        y: 0,
        borderColor: '#fbbf24',
        borderWidth: 2.5,
        strokeDashArray: 0,
        label: {
          text: 'EJE BASE 0.00',
          borderColor: '#fbbf24',
          style: { color: '#000000', background: '#fbbf24', fontSize: '10px', fontWeight: 'bold' }
        }
      }]
    },
    legend: {
      position: 'top',
      horizontalAlign: 'left',
      labels: { colors: '#cbd5e1' },
      fontFamily: 'monospace',
      fontWeight: 'bold',
      fontSize: '11px',
      offsetY: -8
    },
    xaxis: {
      categories: categories,
      title: {
        text: selectedTimeMode === 'hourly' ? 'Horas del Día' : 'Días del Mes',
        style: { color: '#94a3b8', fontSize: '11px', fontWeight: 'bold' }
      },
      labels: {
        style: { colors: '#94a3b8', fontSize: '11px', fontFamily: 'monospace', fontWeight: 'bold' }
      }
    },
    yaxis: {
      title: {
        text: `${metricTitle} (S/.)`,
        style: { color: '#94a3b8', fontSize: '11px', fontWeight: 'bold' }
      },
      labels: {
        style: { colors: '#94a3b8', fontSize: '11px', fontFamily: 'monospace' },
        formatter: (val) => formatCurrency(val)
      }
    },
    tooltip: {
      theme: 'dark',
      shared: true,
      intersect: false,
      y: { formatter: (val) => formatCurrency(val) }
    }
  };

  if (chartRef) chartRef.destroy();
  const newChart = new ApexCharts(document.querySelector(`#${containerId}`), options);
  newChart.render();
  setChartRef(newChart);
}

function renderTradingTable(records) {
  const tbody = document.getElementById('trading-table-body');
  document.getElementById('table-badge-count').textContent = `${records.length} cortes`;

  tbody.innerHTML = records.map(r => {
    const varMesClass = r.vcb_m >= 0 ? 'text-emerald-400' : 'text-rose-400';
    const varDiaClass = r.vcb_d >= 0 ? 'text-emerald-400' : 'text-rose-400';
    const moraClass = r.pm > 8 ? 'text-rose-400 font-bold' : (r.pm > 4 ? 'text-amber-400' : 'text-emerald-400');

    return `
      <tr class="hover:bg-slate-900/80 transition">
        <td class="p-2.5 text-slate-400 font-bold">${r.timeLabel || r.time}</td>
        <td class="p-2.5 text-white font-bold">${r.name || selectedAnalyst}</td>
        <td class="p-2.5 text-right font-bold ${varMesClass}">${formatCurrency(r.vcb_m)}</td>
        <td class="p-2.5 text-right font-bold ${varDiaClass}">${formatCurrency(r.vcb_d)}</td>
        <td class="p-2.5 text-right text-emerald-400 font-bold">${formatCurrency(r.mto_des)}</td>
        <td class="p-2.5 text-right text-slate-300">${formatNumber(r.num_des)}</td>
        <td class="p-2.5 text-right text-slate-300">${formatCurrency(r.cb)}</td>
        <td class="p-2.5 text-right text-slate-400">${formatCurrency(r.ca)}</td>
        <td class="p-2.5 text-right ${moraClass}">${formatPercent(r.pm)}</td>
        <td class="p-2.5 text-right ${r.vc_m >= 0 ? 'text-purple-400' : 'text-rose-400'}">${formatNumber(r.vc_m)}</td>
      </tr>
    `;
  }).join('');
}
