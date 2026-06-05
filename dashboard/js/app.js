/* ===============================
   MAPA DE NOMBRES VISIBLES
   Traduce los nombres técnicos de variables a etiquetas
   legibles para UI, filtros y chips de filtros activos.
================================ */
const FILTER_LABELS = {
  SEXO: "Sexo",
  EDADNUEVO: "Edad",
  NEDU1: "Nivel educativo",
  NEDUNUEVO: "Nivel educativo",
  REGIONNUEVO: "Región",
  VOTO2025: "Voto 2025",
  EVAGOB: "Evaluación de gobierno",
  ELECCIONESHOY: "Elecciones hoy",
  IDEOLOGIA: "Ideología",
  PRESTAMOS: "Préstamos",
  RUMBO: "Rumbo",
  SITECO: "Situación económica actual",
  SITECO6MESES: "Situación económica en 6 meses",
  CAPACIDADGOB: "Capacidad de gobierno",
  IMPACTOPOL: "Impacto de políticas"
};

/* URL base del backend local */
/*const API = "http://localhost:3000";*/
const API = "https://proyeccion-consultores.onrender.com";

/* ===============================
   ESTADO GLOBAL DEL DASHBOARD
   - metaCache: metadata y opciones de filtros del backend
   - charts: instancias activas de Chart.js
   - datasets: datasets disponibles detectados por backend
   - currentYear/currentMonth: dataset seleccionado
   - chartFilters: filtros cruzados aplicados desde charts
================================ */
let metaCache = null;
let charts = {};

let datasets = [];
let currentYear = null;
let currentMonth = null;
let chartFilters = {};

/* Helper corto para obtener elementos por id */
function el(id){ return document.getElementById(id); }

/*
  Se usa para evitar el "flash" inicial de la tab overview
  mientras se restaura el estado guardado (tab/filtros/dataset).
*/
function setDashboardVisibility(isVisible){
  const content = document.querySelector(".content");
  if(content){
    content.style.visibility = isVisible ? "visible" : "hidden";
  }
}

/* ---------------- CHART HELPERS ---------------- */

/*
  Destruye la instancia previa del chart y recrea el canvas.
  Esto evita estados rotos de Chart.js al rerenderizar con
  distintas configuraciones o al reconstruir overlays.
*/
function destroyChart(id){
  if(charts[id]){
    charts[id].destroy();
    charts[id] = null;
  }

  const canvas = el(id);

  if(canvas){
    const parent = canvas.parentNode;
    const newCanvas = document.createElement("canvas");
    newCanvas.id = id;
    parent.replaceChild(newCanvas, canvas);
  }
}

/*
  Convierte colores hex a rgba para construir versiones más suaves
  de un mismo color en overlays/base backgrounds.
*/
function hexToRgba(color, alpha = 1){
  if(!color) return `rgba(92,194,230,${alpha})`;
  if(color.startsWith("rgba(") || color.startsWith("rgb(")){
    return color;
  }
  let hex = color.replace("#", "").trim();
  if(hex.length === 3){
    hex = hex.split("").map(ch => ch + ch).join("");
  }
  if(hex.length !== 6){
    return color;
  }
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* ===============================

   HELPERS RESPONSIVE SOLO PARA PRESTAMOS

================================ */
function getViewportBucket() {

  const w = window.innerWidth;
  if (w <= 560) return "mobile";
  if (w <= 1024) return "tablet";
  return "desktop";
}

function normalizeCanvasLabel(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function truncateCanvasLabel(text, maxLength) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function wrapCanvasLabel(text, maxLineLength = 26, maxLines = 2) {
  const source = normalizeCanvasLabel(text);
  const words = source.split(" ");
  const lines = [];
  let current = "";
  let consumed = 0;
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxLineLength) {
      current = next;
      consumed = i + 1;
      continue;
    }
    if (current) {
      lines.push(current);
      current = word;
      consumed = i + 1;
    } else {
      lines.push(word);
      current = "";
      consumed = i + 1;
    }
    if (lines.length === maxLines - 1) {
      break;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  const hasRemainingWords = consumed < words.length;
  if (hasRemainingWords && lines.length) {
    lines[lines.length - 1] = truncateCanvasLabel(lines[lines.length - 1], maxLineLength);
  }
  return lines.length ? lines : [source];
}

function formatPrestamosTickLabel(label) {
  const text = normalizeCanvasLabel(label);
  const bucket = getViewportBucket();
  if (bucket === "desktop") {
    return text;
  }
  if (bucket === "tablet") {
    return wrapCanvasLabel(text, 30, 2);
  }
  return wrapCanvasLabel(text, 20, 2);
}

function getPrestamosTickFont() {
  const bucket = getViewportBucket();
  if (bucket === "mobile") {
    return { size: 10, weight: "500" };
  }
  if (bucket === "tablet") {
    return { size: 11, weight: "500" };
  }
  return { size: 13, weight: "500" };
}

function getPrestamosBarThickness() {
  const bucket = getViewportBucket();
  if (bucket === "mobile") return { base: 22, overlay: 12 };
  if (bucket === "tablet") return { base: 24, overlay: 12 };
  return { base: 26, overlay: 12 };
}

function getPrestamosLayoutPadding() {
  const bucket = getViewportBucket();
  if (bucket === "mobile") {
    return { top: 6, right: 6, bottom: 0, left: 6 };
  }

  if (bucket === "tablet") {
    return { top: 8, right: 10, bottom: 0, left: 8 };
  }
  return { top: 8, right: 14, bottom: 0, left: 10 };
}
/*
  Gráfico horizontal con lógica tipo Power BI:
  - una base "suave" detrás
  - una capa filtrada encima
  - resalta visualmente la categoría seleccionada
*/
function buildSelectableOverlayBarChart({
  canvasId,
  labels,
  baseValues,
  filteredValues,
  baseColors,
  filteredColors,
  selectedIndex = -1,
  onClickCategory
}){

  destroyChart(canvasId);
  const ctx = el(canvasId).getContext("2d");
  const isPrestamos = canvasId === "chartPrestamos";
  const thickness = isPrestamos
    ? getPrestamosBarThickness()
    : { base: 26, overlay: 12 };
  const backgroundSoftColors = baseColors.map((c, i) => {
    if(selectedIndex < 0) return hexToRgba(c, 0.24);
    return i === selectedIndex ? hexToRgba(c, 0.42) : hexToRgba(c, 0.18);
  });

  const overlayColors = filteredColors.map((c, i) => {
    if(selectedIndex < 0) return hexToRgba(c, 0.92);
    return i === selectedIndex ? c : hexToRgba(c, 0.34);
  });

  const overlayBorders = filteredColors.map((c, i) => {
    if(selectedIndex < 0) return "rgba(255,255,255,0)";
    return i === selectedIndex ? "rgba(255,255,255,1)" : "rgba(255,255,255,0)";
  });

  const overlayBorderWidths = filteredColors.map((c, i) => {
    if(selectedIndex < 0) return 0;
    return i === selectedIndex ? 3 : 0;
  });

  charts[canvasId] = new Chart(ctx,{
    type:"bar",
    data:{
      labels,
      datasets:[

        {
          label:"Base",
          data: baseValues,
          backgroundColor: backgroundSoftColors,
          borderColor: backgroundSoftColors.map(() => "rgba(255,255,255,0)"),
          borderWidth: 0,
          borderRadius: 6,
          barThickness: thickness.base,
          grouped: false,
          order: 1
        },

        {
          label:"Filtro",
          data: filteredValues,
          backgroundColor: overlayColors,
          borderColor: overlayBorders,
          borderWidth: overlayBorderWidths,
          borderRadius: 6,
          barThickness: thickness.overlay,
          grouped: false,
          order: 2
        }
      ]
    },

    options:{
      responsive:true,
      maintainAspectRatio:false,
      animation:false,
      indexAxis:"y",
      layout: {
        padding: isPrestamos ? getPrestamosLayoutPadding() : { top: 0, right: 0, bottom: 0, left: 0 }
      },

      onClick:(evt, elements)=>{
        if(!elements?.length || typeof onClickCategory !== "function") return;
        const idx = elements[0].index;
        onClickCategory(idx);
      },
      plugins:{
        legend:{ display:false },
        tooltip:{
          callbacks:{
            title(items){
              return items?.[0]?.label ?? "";
            },
            label:(ctx)=>`${ctx.dataset.label}: ${ctx.raw}%`
          }
        }

      },
      scales:{
        x:{
          beginAtZero:true,
          ticks:{
            color:"#cfd8e3",
            callback:v=>v+"%"
          },
          grid:{
            color:"rgba(255,255,255,0.06)"
          }
        },
        y:{
          ticks:{
            color:"#cfd8e3",
            font: isPrestamos ? getPrestamosTickFont() : undefined,
            padding: isPrestamos ? 12 : 0,
            callback(value){
              const rawLabel = this.getLabelForValue(value);
              return isPrestamos ? formatPrestamosTickLabel(rawLabel) : rawLabel;
            }
          },

          grid:{
            display:false
          }
        }
      }
    }
  });
}

/*
  Misma lógica overlay que el horizontal, pero para barras verticales.
  Se usa donde el layout/tab ya quedó estabilizado con este formato.
*/
function buildSelectableOverlayVerticalBarChart({
  canvasId,
  labels,
  baseValues,
  filteredValues,
  baseColors,
  filteredColors,
  selectedIndex = -1,
  onClickCategory
}){
  destroyChart(canvasId);

  const ctx = el(canvasId).getContext("2d");

  const backgroundSoftColors = baseColors.map((c, i) => {
    if(selectedIndex < 0) return hexToRgba(c, 0.24);
    return i === selectedIndex ? hexToRgba(c, 0.42) : hexToRgba(c, 0.18);
  });

  const overlayColors = filteredColors.map((c, i) => {
    if(selectedIndex < 0) return hexToRgba(c, 0.92);
    return i === selectedIndex ? c : hexToRgba(c, 0.34);
  });

  const overlayBorders = filteredColors.map((c, i) => {
    if(selectedIndex < 0) return "rgba(255,255,255,0)";
    return i === selectedIndex ? "rgba(255,255,255,1)" : "rgba(255,255,255,0)";
  });

  const overlayBorderWidths = filteredColors.map((c, i) => {
    if(selectedIndex < 0) return 0;
    return i === selectedIndex ? 3 : 0;
  });

  charts[canvasId] = new Chart(ctx,{
    type:"bar",
    data:{
      labels,
      datasets:[
        {
          label:"Base",
          data: baseValues,
          backgroundColor: backgroundSoftColors,
          borderColor: backgroundSoftColors.map(() => "rgba(255,255,255,0)"),
          borderWidth: 0,
          borderRadius: 4,
          barThickness: 42,
          grouped: false,
          order: 1
        },
        {
          label:"Filtro",
          data: filteredValues,
          backgroundColor: overlayColors,
          borderColor: overlayBorders,
          borderWidth: overlayBorderWidths,
          borderRadius: 4,
          barThickness: 26,
          grouped: false,
          order: 2
        }
      ]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      animation:false,
      onClick:(evt, elements)=>{
        if(!elements?.length || typeof onClickCategory !== "function") return;
        const idx = elements[0].index;
        onClickCategory(idx);
      },
      plugins:{
        legend:{ display:false },
        tooltip:{
          callbacks:{
            label:(ctx)=>`${ctx.dataset.label}: ${ctx.raw}%`
          }
        }
      },
      scales:{
        x:{
          ticks:{
            color:"#cfd8e3",
            maxRotation:0,
            minRotation:0
          },
          grid:{
            display:false
          }
        },
        y:{
          beginAtZero:true,
          grid:{
            color:"rgba(255,255,255,0.08)"
          },
          ticks:{
            color:"#cfd8e3",
            callback:(v)=>v+"%"
          }
        }
      }
    }
  });
}

/*
  Implementación de torta interactiva ya estabilizada.
  Se mantiene separada porque las tortas necesitaron ajustes visuales
  propios para no romper proporciones ni leyendas.
*/
function buildSelectableOverlayPieChart({
  canvasId,
  labels,
  baseValues,
  filteredValues,
  baseColors,
  filteredColors,
  selectedIndex = -1,
  onClickCategory
}){
  destroyChart(canvasId);

  const ctx = el(canvasId).getContext("2d");

  const displayValues = filteredValues;

  const displayColors = filteredColors.map((c, i) => {
    if(selectedIndex < 0) return c;
    return i === selectedIndex ? c : hexToRgba(c, 0.25);
  });

  const borderColors = filteredColors.map((c, i) => {
    if(selectedIndex < 0) return "rgba(255,255,255,0.18)";
    return i === selectedIndex ? "rgba(255,255,255,1)" : "rgba(255,255,255,0.08)";
  });

  const borderWidths = filteredColors.map((c, i) => {
    if(selectedIndex < 0) return 1;
    return i === selectedIndex ? 3 : 1;
  });

  const offsetValues = filteredColors.map((c, i) => {
    if(selectedIndex < 0) return 0;
    return i === selectedIndex ? 12 : 0;
  });

  /* Ajustes específicos por chart, ya validados visualmente */
  let pieRadius = "100%";
  let piePadding = { top: 2, right: 2, bottom: 2, left: 2 };

  if(canvasId === "chartSiteco"){
    pieRadius = "92%";
    piePadding = { top: 6, right: 6, bottom: 10, left: 6 };
  }

  if(canvasId === "chartCapacidad"){
    pieRadius = "100%";
    piePadding = { top: 2, right: 2, bottom: 2, left: 2 };
  }

  charts[canvasId] = new Chart(ctx, {
    type: "pie",
    data: {
      labels,
      datasets: [{
        data: displayValues,
        backgroundColor: displayColors,
        borderColor: borderColors,
        borderWidth: borderWidths,
        offset: offsetValues,
        radius: pieRadius
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      layout: {
        padding: piePadding
      },
      onClick: (evt, elements) => {
        if(!elements?.length || typeof onClickCategory !== "function") return;
        const idx = elements[0].index;
        onClickCategory(idx);
      },
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          align: "center",
          labels: {
            color: "#cfd8e3",
            usePointStyle: true,
            pointStyle: "circle",
            boxWidth: 10,
            boxHeight: 10,
            padding: 25,
            font: { size: 11 }
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${ctx.raw}%`
          }
        }
      }
    }
  });
}

/* ---------------- COMMON HELPERS ---------------- */

/*
  Normaliza labels para comparar textos de forma robusta:
  quita tildes, espacios repetidos y diferencias de mayúsculas/minúsculas.
  Es clave para mapear labels provenientes del backend contra órdenes fijos.
*/
function normalizeLabel(text){
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/* Busca un item de serie comparando por label normalizado */
function findSeriesItemByLabel(series, label){
  return (series || []).find(item =>
    normalizeLabel(item.label) === normalizeLabel(label)
  );
}

/* Fuerza un orden visual concreto para una serie, aunque falten categorías */
function buildOrderedSeries(series, order){
  return order.map(label => {
    const found = findSeriesItemByLabel(series, label);

    return {
      value: found ? found.value : null,
      label,
      percentage: found ? found.percentage : 0
    };
  });
}

/*
  Fusiona serie base y serie filtrada en una estructura común
  para construir el overlay visual base vs filtro activo.
*/
function mergeBaseAndFilteredSeries(baseSeries, filteredSeries){
  return baseSeries.map(baseItem => {
    const filteredItem = (filteredSeries || []).find(
      item => String(item.value) === String(baseItem.value)
    );

    return {
      value: baseItem.value,
      label: baseItem.label,
      basePercentage: baseItem.percentage,
      filteredPercentage: filteredItem ? filteredItem.percentage : 0
    };
  });
}

/* Devuelve el índice visualmente seleccionado según chartFilters */
function getSelectedIndex(displaySeries, filterValue){
  return displaySeries.findIndex(
    item => String(item.value) === String(filterValue)
  );
}

/*
  Arma una serie "display" consistente a partir de:
  - serie base
  - serie filtrada
  - orden visual deseado

  Devuelve objetos con:
  value, label, basePercentage, filteredPercentage
*/
function buildDisplaySeriesFromOrder(baseSeries, filteredSeries, order){
  const orderedBase = buildOrderedSeries(baseSeries, order);
  const orderedFiltered = buildOrderedSeries(filteredSeries, order);
  return mergeBaseAndFilteredSeries(orderedBase, orderedFiltered);
}

/*
  Ordena por porcentaje descendente, excepto ciertas categorías
  que deben quedar fijadas al final en un orden explícito
  (por ejemplo "Ninguno" o "En blanco / impugnado").
*/
function sortDescendingExceptPinned(series, pinnedLabels){
  const pinnedNorm = pinnedLabels.map(normalizeLabel);

  const pinned = [];
  const regular = [];

  series.forEach(item => {
    const isPinned = pinnedNorm.includes(normalizeLabel(item.label));
    if(isPinned) pinned.push(item);
    else regular.push(item);
  });

  regular.sort((a, b) => b.percentage - a.percentage);

  pinned.sort((a, b) => {
    return pinnedNorm.indexOf(normalizeLabel(a.label)) - pinnedNorm.indexOf(normalizeLabel(b.label));
  });

  return [...regular, ...pinned];
}

/* Mapping visual estabilizado para colores de espacios políticos */
function colorByElectionLabel(label){
  const v = normalizeLabel(label);

  if(v.includes("libertad avanza")) return "#7c4dff";
  if(v.includes("fuerza patria") || v.includes("peronismo")) return "#2c7be5";
  if(v.includes("provincias unidas") || v.includes("gobernadores")) return "#3aec2a";
  if(v.includes("frente de izquierda") || v.includes("izquierda")) return "#ff3b3b";
  if(v.includes("blanco") || v.includes("impugn")) return "#9aa3ad";
  if(v.includes("pro")) return "#ffd54f";

  return "#5cc2e6";
}

/* Mapping visual estabilizado para colores de ideología */
function colorByIdeologyLabel(label){
  const v = normalizeLabel(label);

  if(v.includes("derecha")) return "#2c7be5";
  if(v === "centro") return "#f1f2f3";
  if(v.includes("izquierda")) return "#ff3b3b";
  if(v.includes("ninguno")) return "#9aa3ad";

  return "#5cc2e6";
}

/*
  Helper central para renderizar charts interactivos con crossfilter.
  Recibe la serie ya preparada para display y delega al tipo de gráfico:
  - pie
  - vertical
  - horizontal
*/
function renderSelectableDisplaySeries({
  chartType,
  canvasId,
  variable,
  displaySeries,
  colorResolver,
  onClickVariable = variable
}){
  const selectedIndex = getSelectedIndex(displaySeries, chartFilters[variable]);
  const colors = displaySeries.map(item => colorResolver(item.label));

  const baseConfig = {
    canvasId,
    labels: displaySeries.map(item => item.label),
    baseValues: displaySeries.map(item => item.basePercentage),
    filteredValues: displaySeries.map(item => item.filteredPercentage),
    baseColors: colors,
    filteredColors: colors,
    selectedIndex,
    onClickCategory: (idx) => {
      const item = displaySeries[idx];
      if(item?.value !== null && item?.value !== undefined){
        toggleChartFilter(onClickVariable, item.value);
      }
    }
  };

  if(chartType === "pie"){
    buildSelectableOverlayPieChart(baseConfig);
    return;
  }

  if(chartType === "vertical"){
    buildSelectableOverlayVerticalBarChart(baseConfig);
    return;
  }

  buildSelectableOverlayBarChart(baseConfig);
}

/* ---------------- FILTER HELPERS ---------------- */

/*
  Si el usuario clickea una categoría:
  - la aplica como filtro cruzado si no estaba activa
  - la quita si ya estaba seleccionada
  Luego recarga el dashboard completo con ese nuevo estado.
*/
function toggleChartFilter(variable, value){
  const current = chartFilters[variable];

  if(String(current) === String(value)){
    delete chartFilters[variable];
  }else{
    chartFilters[variable] = String(value);
  }

  loadData();
}

/* Borra todos los filtros cruzados aplicados desde charts */
function clearChartFilters(){
  chartFilters = {};
}

/* Elimina un único filtro cruzado y vuelve a renderizar */
function removeChartFilter(variable){
  delete chartFilters[variable];
  loadData();
}

/*
  Convierte valores codificados en etiquetas legibles para el visor
  de filtros activos. Primero intenta resolver desde metaCache y,
  si no alcanza, usa un fallback local por variable.
*/
function getVariablePrettyValue(key, value){
  const variableLabels = {
    EVAGOB: {
      0: "No lo sé",
      1: "Muy malo",
      2: "Malo",
      3: "Bueno",
      4: "Muy bueno"
    },
    IDEOLOGIA: {
      1: "Izquierda + Centro izquierda",
      2: "Centro",
      3: "Centro derecha + Derecha",
      4: "Ninguno"
    },
    ELECCIONESHOY: {
      1: "La Libertad Avanza",
      2: "PRO (Macrismo)",
      3: "Fuerza Patria (Peronismo-Kirchnerismo)",
      4: "Provincias Unidad (Gobernadores de centro)",
      5: "Frente de Izquierda",
      6: "En blanco / impugnado"
    },
    PRESTAMOS: {
      1: "Sí, pedimos dinero a un banco",
      2: "Sí, pedimos dinero a una entidad financiera",
      3: "Sí, utilizamos tarjeta de crédito, pagando el mínimo o en cuotas",
      4: "Sí, pedimos dinero a familiares/amigos",
      5: "Sí, pedimos préstamos en Mercado Pago y utilizamos las cuotas",
      6: "No tuvimos que pedir dinero prestado"
    },
    RUMBO: {
      0: "No lo sé",
      1: "Muy equivocado",
      2: "Equivocado",
      3: "Correcto",
      4: "Muy correcto"
    },
    SITECO: {
      1: "Empeoró",
      2: "Se mantuvo igual de mal",
      3: "Se mantuvo igual de bien",
      4: "Mejoró"
    },
    SITECO6MESES: {
      1: "Peor",
      2: "Igual de mal",
      3: "Igual de bien",
      4: "Mejor"
    },
    CAPACIDADGOB: {
      0: "No lo sé",
      1: "Nada de capacidad",
      2: "Poca capacidad",
      3: "Algo de capacidad",
      4: "Mucha capacidad"
    },
    IMPACTOPOL: {
      0: "No lo sé",
      1: "Muy negativo",
      2: "Algo negativo",
      3: "Algo positivo",
      4: "Muy positivo"
    }
  };

  const options = metaCache?.options?.[key] || [];
  const found = options.find(opt => String(opt.value) === String(value));
  if(found?.label) return found.label;

  return variableLabels[key]?.[value] ?? value;
}

/* Resumen textual de filtros aplicados, usado en la UI */
function buildAppliedFiltersSummary(appliedFilters){
  const entries = Object.entries(appliedFilters || {});
  if(!entries.length) return "";

  const parts = entries.map(([key, value]) => {
    const label = FILTER_LABELS[key] || key;
    const prettyValue = getVariablePrettyValue(key, value);
    return `${label}: ${prettyValue}`;
  });

  return parts.join(" | ");
}

/* Renderiza chips visibles para filtros cruzados activos */
function renderChartActiveFilters(){
  const container = el("chartActiveFilters");
  if(!container) return;

  const entries = Object.entries(chartFilters || {})
    .filter(([_, value]) => value !== undefined && value !== null && value !== "");

  if(!entries.length){
    container.innerHTML = "";
    return;
  }

  container.innerHTML = entries.map(([key, value]) => {
    const label = FILTER_LABELS[key] || key;
    const prettyValue = getVariablePrettyValue(key, value);

    return `
      <div class="chart-filter-chip">
        <span class="chart-filter-chip__label">${label}: ${prettyValue}</span>
        <button
          class="chart-filter-chip__remove"
          type="button"
          onclick="removeChartFilter('${key}')"
          aria-label="Quitar filtro ${label}"
          title="Quitar filtro"
        >×</button>
      </div>
    `;
  }).join("");
}

/* ---------------- FULLSCREEN ---------------- */

/* Acceso centralizado al botón de pantalla completa */
function getFullscreenButton(){
  return el("fullscreenBtn");
}

/* Sincroniza ícono y textos accesibles según el estado fullscreen */
function updateFullscreenButton(){
  const btn = getFullscreenButton();
  if(!btn) return;

  const icon = btn.querySelector(".fullscreen-btn__icon");
  const isFs = !!document.fullscreenElement;

  btn.classList.toggle("is-active", isFs);
  btn.setAttribute(
    "aria-label",
    isFs ? "Salir de pantalla completa" : "Entrar en pantalla completa"
  );
  btn.setAttribute(
    "title",
    isFs ? "Salir de pantalla completa" : "Pantalla completa"
  );

  if(icon){
    icon.textContent = isFs ? "✕" : "⛶";
  }
}

/*
  Alterna fullscreen del documento entero.
  Antes guarda estado de UI para que pueda restaurarse al salir.
*/
async function toggleFullscreen(){
  try{
    saveUiState();

    if(!document.fullscreenElement){
      await document.documentElement.requestFullscreen?.();
    }else{
      await document.exitFullscreen?.();
    }
  }catch(err){
    console.error("No se pudo cambiar el modo fullscreen:", err);
  }
}

/*
  Al salir de fullscreen se fuerza recarga completa.
  Esto se mantiene así porque es la variante ya estabilizada
  para no romper layout, charts y restauración de estado.
*/
function handleFullscreenChange(){
  updateFullscreenButton();

  if(!document.fullscreenElement){
    saveUiState();
    window.location.reload();
  }
}

/* ---------------- TABS ---------------- */

/*
  Cambia la tab visible:
  - actualiza clase activa en botones
  - oculta paneles no activos
  - muestra el panel correspondiente
  - fuerza resize suave de charts en la tab visible
*/
function showTab(name){
  sessionStorage.setItem("activeTab", name);

  document.querySelectorAll(".tab").forEach(t =>
    t.classList.toggle("active", t.dataset.tab === name)
  );

  document.querySelectorAll(".panel").forEach(p =>
    p.classList.add("hidden")
  );

  el("tab-"+name).classList.remove("hidden");

  setTimeout(()=>{
    const activePanel = el("tab-"+name);
    if(!activePanel) return;

    activePanel.querySelectorAll("canvas").forEach(cv=>{
      const chart = charts[cv.id];
      if(chart){
        chart.resize();
      }
    });
  },80);
}

/*
  Guarda el estado actual de la UI para poder restaurarlo luego:
  - tab activa
  - año/mes seleccionados
  - filtros globales
  - filtros aplicados desde charts
*/
function saveUiState(){
  const activeTabBtn = document.querySelector(".tab.active");
  const activeTabName = activeTabBtn?.dataset?.tab || "overview";
  sessionStorage.setItem("activeTab", activeTabName);

  if(el("yearSelect")){
    sessionStorage.setItem("selectedYear", el("yearSelect").value || "");
  }

  if(el("monthSelect")){
    sessionStorage.setItem("selectedMonth", el("monthSelect").value || "");
  }

  if(metaCache?.globalFilters){
    const filtersState = {};

    for(const f of metaCache.globalFilters){
      const select = el("flt-" + f);
      filtersState[f] = select ? select.value : "";
    }

    sessionStorage.setItem("dashboardFilters", JSON.stringify(filtersState));
  }

  sessionStorage.setItem("dashboardChartFilters", JSON.stringify(chartFilters));
}

/*
  Restaura el estado previo del dashboard desde sessionStorage.
  Orden importante:
  1. dataset
  2. chartFilters
  3. filtros globales
  4. tab activa
*/
async function restoreUiState(){
  const savedYear = sessionStorage.getItem("selectedYear");
  const savedMonth = sessionStorage.getItem("selectedMonth");
  const savedTab = sessionStorage.getItem("activeTab") || "overview";
  const savedFiltersRaw = sessionStorage.getItem("dashboardFilters");
  const savedChartFiltersRaw = sessionStorage.getItem("dashboardChartFilters");

  if(savedYear && el("yearSelect")){
    currentYear = Number(savedYear);
    el("yearSelect").value = savedYear;
    buildMonthOptions();
  }

  if(savedMonth && el("monthSelect")){
    currentMonth = Number(savedMonth);
    el("monthSelect").value = savedMonth;
  }

  if(savedChartFiltersRaw){
    try{
      chartFilters = JSON.parse(savedChartFiltersRaw) || {};
    }catch{
      chartFilters = {};
    }
  }

  if(savedYear || savedMonth){
    await loadDataset();
  }

  if(savedFiltersRaw && metaCache?.globalFilters){
    try{
      const savedFilters = JSON.parse(savedFiltersRaw);

      for(const f of metaCache.globalFilters){
        const select = el("flt-" + f);
        if(select && savedFilters[f] !== undefined){
          select.value = savedFilters[f];
        }
      }

      await loadData();
    }catch(err){
      console.error("No se pudieron restaurar los filtros guardados:", err);
    }
  }

  renderChartActiveFilters();

  if(el("tab-" + savedTab)){
    showTab(savedTab);
  }
}

/* ---------------- DATASETS ---------------- */

/*
  Carga la lista de datasets disponibles desde backend,
  arma filtros de fecha y selecciona por defecto el más reciente.
*/
async function loadDatasets(){
  const res = await fetch(`${API}/datasets`);
  datasets = await res.json();

  if(!datasets.length){
    el("status").textContent="No hay datasets disponibles";
    return;
  }

  buildDateFilters();

  const latest = datasets[0];

  currentYear = latest.year;
  currentMonth = latest.month;

  el("yearSelect").value = currentYear;

  buildMonthOptions();

  el("monthSelect").value = currentMonth;

  await loadDataset();
}

/* ---------------- FILTROS AÑO / MES ---------------- */

/*
  Construye visualmente los selects de año y mes
  usando la lista de datasets informada por backend.
*/
function buildDateFilters(){
  const years=[...new Set(datasets.map(d=>d.year))].sort((a,b)=>b-a);

  const row=el("datasetRow");
  row.innerHTML="";

  row.innerHTML=`
    <div class="filter-group">
      <div class="filter-title">Año</div>
      <select id="yearSelect" class="filter-box"></select>
    </div>

    <div class="filter-group">
      <div class="filter-title">Mes</div>
      <select id="monthSelect" class="filter-box"></select>
    </div>
  `;

  const yearSelect=el("yearSelect");
  const monthSelect=el("monthSelect");

  yearSelect.innerHTML=`<option value="">Seleccionar</option>`;

  years.forEach(y=>{
    yearSelect.innerHTML+=`<option value="${y}">${y}</option>`;
  });

  yearSelect.onchange=()=>{
    currentYear=Number(yearSelect.value);
    buildMonthOptions();
  };

  monthSelect.onchange=async ()=>{
    currentMonth=Number(monthSelect.value);
    await loadDataset();
  };
}

/* ---------------- MESES DISPONIBLES ---------------- */

/* Recalcula las opciones de mes disponibles según el año activo */
function buildMonthOptions(){
  const monthSelect=el("monthSelect");

  monthSelect.innerHTML=`<option value="">Seleccionar</option>`;

  const months=datasets
    .filter(d=>d.year===currentYear)
    .map(d=>d.month)
    .sort((a,b)=>a-b);

  months.forEach(m=>{
    monthSelect.innerHTML+=`<option value="${m}">${monthName(m)}</option>`;
  });
}

/* Traduce número de mes a nombre visible */
function monthName(m){
  const names=[
    "Enero","Febrero","Marzo","Abril",
    "Mayo","Junio","Julio","Agosto",
    "Septiembre","Octubre","Noviembre","Diciembre"
  ];
  return names[m-1]||m;
}

/* ---------------- CARGAR DATASET ---------------- */

/*
  Cambia el dataset activo en backend, luego vuelve a pedir:
  - metadata de filtros
  - datos completos del dashboard
*/
async function loadDataset(){
  const res=await fetch(`${API}/dataset?year=${currentYear}&month=${currentMonth}`);
  const data=await res.json();

  if(!res.ok){
    alert(data.error||"Error cargando dataset");
    return;
  }

  el("status").textContent =
    `Dataset ${currentYear}_${currentMonth} cargado (${data.rows} casos)`;

  await loadMeta();
  await loadData();
}

/* ---------------- META ---------------- */

/*
  Trae metadata del backend:
  - filtros globales disponibles
  - opciones visibles de cada filtro
  Y reconstruye la UI de selects globales.
*/
async function loadMeta(){
  const res=await fetch(`${API}/meta`);
  const meta=await res.json();

  metaCache=meta;

  const row=el("filtersRow");
  row.innerHTML="";

  for(const f of meta.globalFilters){
    const group=document.createElement("div");
    group.className="filter-group";

    const title=document.createElement("div");
    title.className="filter-title";
    title.textContent=FILTER_LABELS[f]||f;

    const select=document.createElement("select");
    select.className="filter-box";
    select.id="flt-"+f;
    select.onchange=()=>loadData();

    select.innerHTML=`<option value="">Todos</option>`;

    (meta.options?.[f]||[]).forEach(opt=>{
      select.innerHTML+=`<option value="${opt.value}">${opt.label}</option>`;
    });

    group.appendChild(title);
    group.appendChild(select);
    row.appendChild(group);
  }
}

/* ---------------- FILTROS ---------------- */

/* Lee solo los filtros globales seleccionados en la UI */
function currentSelectFilters(){
  const out={};

  if(metaCache?.globalFilters){
    for(const f of metaCache.globalFilters){
      const s=el("flt-"+f);

      if(s && s.value!==""){
        out[f]=s.value;
      }
    }
  }

  return out;
}

/*
  Combina:
  - filtros globales seleccionados en selects
  - filtros cruzados aplicados desde charts
  Esta combinación es la que se envía al backend para la vista filtrada.
*/
function currentFilters(){
  const out = { ...currentSelectFilters() };

  for(const [k,v] of Object.entries(chartFilters)){
    if(v !== undefined && v !== null && v !== ""){
      out[k] = v;
    }
  }

  return out;
}

/* Serializa un objeto de filtros como querystring */
function buildQuery(params){
  const esc=encodeURIComponent;

  const pairs=Object.entries(params)
    .map(([k,v])=>`${esc(k)}=${esc(v)}`);

  return pairs.length ? `?${pairs.join("&")}` : "";
}

/*
  Limpieza total del estado de filtrado:
  - resetea filtros globales
  - borra chartFilters
  - vuelve al dataset más reciente disponible
*/
async function clearFilters(){
  if(!datasets.length) return;

  if(metaCache?.globalFilters){
    for(const f of metaCache.globalFilters){
      const select = el("flt-" + f);
      if(select) select.value = "";
    }
  }

  clearChartFilters();

  const latest = datasets[0];
  currentYear = latest.year;
  currentMonth = latest.month;

  if(el("yearSelect")){
    el("yearSelect").value = String(currentYear);
  }

  buildMonthOptions();

  if(el("monthSelect")){
    el("monthSelect").value = String(currentMonth);
  }

  await loadDataset();
}

/* ---------------- TAB RENDERERS ---------------- */

/*
  Render de la tab Economía.
  Mantiene órdenes y colores visuales ya estabilizados
  para no romper consistencia histórica del dashboard.
*/
function renderEconomia(data, baseData){
  const sitecoOrder = [
    "Mejoró",
    "Se mantuvo igual de bien",
    "Se mantuvo igual de mal",
    "Empeoró"
  ];

  const sitecoColorMap = {
    "Mejoró": "#2c7be5",
    "Se mantuvo igual de bien": "#6ec5e9",
    "Se mantuvo igual de mal": "#ff8a8a",
    "Empeoró": "#ff3b3b"
  };

  const sitecoDisplay = buildDisplaySeriesFromOrder(
    baseData.tab2.SITECO,
    data.tab2.SITECO,
    sitecoOrder
  );

  renderSelectableDisplaySeries({
    chartType: "pie",
    canvasId: "chartSiteco",
    variable: "SITECO",
    displaySeries: sitecoDisplay,
    colorResolver: (label) => sitecoColorMap[label] || "#5cc2e6"
  });

  const siteco6Order = [
    "Mejor",
    "Igual de bien",
    "Igual de mal",
    "Peor"
  ];

  const siteco6ColorMap = {
    "Mejor": "#2c7be5",
    "Igual de bien": "#6ec5e9",
    "Igual de mal": "#ff8a8a",
    "Peor": "#ff3b3b"
  };

  const siteco6Display = buildDisplaySeriesFromOrder(
    baseData.tab2.SITECO6MESES,
    data.tab2.SITECO6MESES,
    siteco6Order
  );

  renderSelectableDisplaySeries({
    chartType: "vertical",
    canvasId: "chartSiteco6",
    variable: "SITECO6MESES",
    displaySeries: siteco6Display,
    colorResolver: (label) => siteco6ColorMap[label] || "#5cc2e6"
  });

  const prestamosOrder = [
    "Sí, pedimos dinero a familiares/amigos",
    "Sí, utilizamos tarjeta de crédito, pagando el mínimo o en cuotas",
    "Sí, pedimos dinero a un banco",
    "Sí, pedimos préstamos en Mercado Pago y utilizamos las cuotas",
    "Sí, pedimos dinero a una entidad financiera",
    "No tuvimos que pedir dinero prestado"
  ];

  const prestamosColorMap = {
    "Sí, pedimos dinero a familiares/amigos": "#ff3b3b",
    "Sí, utilizamos tarjeta de crédito, pagando el mínimo o en cuotas": "#ff3b3b",
    "Sí, pedimos dinero a un banco": "#ff3b3b",
    "Sí, pedimos préstamos en Mercado Pago y utilizamos las cuotas": "#ff3b3b",
    "Sí, pedimos dinero a una entidad financiera": "#ff3b3b",
    "No tuvimos que pedir dinero prestado": "#2c7be5"
  };

  const prestamosDisplay = buildDisplaySeriesFromOrder(
    baseData.tab2.PRESTAMOS,
    data.tab2.PRESTAMOS,
    prestamosOrder
  );

  renderSelectableDisplaySeries({
    chartType: "bar",
    canvasId: "chartPrestamos",
    variable: "PRESTAMOS",
    displaySeries: prestamosDisplay,
    colorResolver: (label) => prestamosColorMap[label] || "#5cc2e6"
  });

  const rumboOrder = [
    "Muy correcto",
    "Correcto",
    "Equivocado",
    "Muy equivocado",
    "No lo sé"
  ];

  const rumboColorMap = {
    "Muy correcto": "#2c7be5",
    "Correcto": "#6ec5e9",
    "Equivocado": "#ff8a8a",
    "Muy equivocado": "#ff3b3b",
    "No lo sé": "#9aa3ad"
  };

  const rumboDisplay = buildDisplaySeriesFromOrder(
    baseData.tab2.RUMBO,
    data.tab2.RUMBO,
    rumboOrder
  );

  renderSelectableDisplaySeries({
    chartType: "bar",
    canvasId: "chartRumbo",
    variable: "RUMBO",
    displaySeries: rumboDisplay,
    colorResolver: (label) => rumboColorMap[label] || "#5cc2e6"
  });
}

/*
  Render de la tab Evaluación de Gobierno.
  Usa órdenes fijos y mappings de color que replican
  la convención visual ya validada en esta solapa.
*/
function renderEvaluacion(data, baseData){
  const evagobOrder = [
    "Muy bueno",
    "Bueno",
    "Malo",
    "Muy malo",
    "No lo sé"
  ];

  const evagobColors = {
    "Muy bueno": "#2c7be5",
    "Bueno": "#6ec5e9",
    "Malo": "#ff8a8a",
    "Muy malo": "#ff3b3b",
    "No lo sé": "#9aa3ad"
  };

  const evagobDisplay = buildDisplaySeriesFromOrder(
    baseData.tab3.EVAGOB,
    data.tab3.EVAGOB,
    evagobOrder
  );

  renderSelectableDisplaySeries({
    chartType: "bar",
    canvasId: "chartEvagob",
    variable: "EVAGOB",
    displaySeries: evagobDisplay,
    colorResolver: (label) => evagobColors[label] || "#5cc2e6"
  });

  const capacidadOrder = [
    "Mucha capacidad",
    "Algo de capacidad",
    "Poca capacidad",
    "Nada de capacidad",
    "No lo sé"
  ];

  const capacidadColorMap = {
    "Mucha capacidad": "#2c7be5",
    "Algo de capacidad": "#6ec5e9",
    "Poca capacidad": "#ff8a8a",
    "Nada de capacidad": "#ff3b3b",
    "No lo sé": "#9aa3ad"
  };

  const capacidadDisplay = buildDisplaySeriesFromOrder(
    baseData.tab3.CAPACIDADGOB,
    data.tab3.CAPACIDADGOB,
    capacidadOrder
  );

  renderSelectableDisplaySeries({
    chartType: "pie",
    canvasId: "chartCapacidad",
    variable: "CAPACIDADGOB",
    displaySeries: capacidadDisplay,
    colorResolver: (label) => capacidadColorMap[label] || "#5cc2e6"
  });

  const impactoOrder = [
    "Muy positivo",
    "Algo positivo",
    "Algo negativo",
    "Muy negativo",
    "No lo sé"
  ];

  const impactoColorMap = {
    "Muy positivo": "#2c7be5",
    "Algo positivo": "#6ec5e9",
    "Algo negativo": "#ff8a8a",
    "Muy negativo": "#ff3b3b",
    "No lo sé": "#9aa3ad"
  };

  const impactoDisplay = buildDisplaySeriesFromOrder(
    baseData.tab3.IMPACTOPOL,
    data.tab3.IMPACTOPOL,
    impactoOrder
  );

  renderSelectableDisplaySeries({
    chartType: "vertical",
    canvasId: "chartImpacto",
    variable: "IMPACTOPOL",
    displaySeries: impactoDisplay,
    colorResolver: (label) => impactoColorMap[label] || "#5cc2e6"
  });
}

/*
  Render de Imagen Presidencial.
  Este chart se mantiene con construcción directa porque su lógica
  es distinta a la de los charts con crossfilter overlay.
*/
function renderImagen(data){
  destroyChart("chartComparacionImagen");

  charts["chartComparacionImagen"] = new Chart(
    el("chartComparacionImagen"),
    {
      type:"bar",
      data:{
        labels:data.tab4.ideal.map(x=>x.label),
        datasets:[
          {
            label:"Presidente ideal",
            data:data.tab4.ideal.map(x=>x.percentage),
            backgroundColor:"#5cc2e6",
            borderRadius:6,
            barThickness:18
          },
          {
            label:"Milei",
            data:data.tab4.milei.map(x=>x.percentage),
            backgroundColor:"#7c4dff",
            borderRadius:6,
            barThickness:18
          }
        ]
      },
      options:{
        responsive:true,
        maintainAspectRatio:false,
        animation:false,
        indexAxis:"y",
        layout:{
          padding:{
            top: 8,
            right: 8,
            bottom: 8,
            left: 4
          }
        },
        plugins:{
          legend:{
            position:"top",
            align:"start",
            labels:{
              color:"#ffffff",
              boxWidth:12,
              boxHeight:12,
              padding:10,
              font:{ size:11 }
            }
          },
          tooltip:{
            callbacks:{
              label:(ctx)=>`${ctx.dataset.label}: ${ctx.raw}%`
            }
          }
        },
        scales:{
          x:{
            beginAtZero:true,
            ticks:{
              color:"#cfd8e3",
              callback:v=>v+"%"
            },
            grid:{
              color:"rgba(255,255,255,0.06)"
            }
          },
          y:{
            ticks:{
              color:"#cfd8e3",
              font:{ size:11 },
              padding:6
            },
            grid:{
              display:false
            }
          }
        }
      }
    }
  );
}

/*
  Render de Elecciones Hoy / Ideología.
  Ordena por porcentaje descendente, pero conserva ciertas
  categorías fijas al final cuando corresponde.
*/
function renderVoto(data, baseData){
  const eleccionesBaseSorted = sortDescendingExceptPinned(
    baseData.tab5.ELECCIONESHOY,
    ["En blanco / impugnado", "En blanco/ impugnado", "En blanco/impugnado"]
  );

  const eleccionesDisplay = mergeBaseAndFilteredSeries(
    eleccionesBaseSorted,
    data.tab5.ELECCIONESHOY
  );

  renderSelectableDisplaySeries({
    chartType: "bar",
    canvasId: "chartElecciones",
    variable: "ELECCIONESHOY",
    displaySeries: eleccionesDisplay,
    colorResolver: colorByElectionLabel
  });

  const ideologiaBaseSorted = sortDescendingExceptPinned(
    baseData.tab5.IDEOLOGIA,
    ["Ninguno"]
  );

  const ideologiaDisplay = mergeBaseAndFilteredSeries(
    ideologiaBaseSorted,
    data.tab5.IDEOLOGIA
  );

  renderSelectableDisplaySeries({
    chartType: "bar",
    canvasId: "chartIdeologia",
    variable: "IDEOLOGIA",
    displaySeries: ideologiaDisplay,
    colorResolver: colorByIdeologyLabel
  });
}

/* ---------------- LOAD DATA ---------------- */

/*
  Pide dos vistas al backend:
  - filtered: filtros globales + chartFilters
  - base: solo filtros globales

  Eso permite construir el efecto visual overlay
  base vs. filtro activo en los charts.
*/
async function loadData(){
  const queryFiltered = buildQuery(currentFilters());
  const queryBase = buildQuery(currentSelectFilters());

  const [resFiltered, resBase] = await Promise.all([
    fetch(`${API}/dashboard${queryFiltered}`),
    fetch(`${API}/dashboard${queryBase}`)
  ]);

  const data = await resFiltered.json();
  const baseData = await resBase.json();

  if(!resFiltered.ok){
    el("status").textContent=data.error||"Error backend";
    return;
  }

  if(!resBase.ok){
    el("status").textContent=baseData.error||"Error backend";
    return;
  }

  const appliedSummary = buildAppliedFiltersSummary(data.meta?.filtersApplied || {});
  el("bases").textContent = appliedSummary ? `Filtros activos: ${appliedSummary}` : "";
  renderChartActiveFilters();

  renderOverviewKpis(data.tab1.kpis);
  renderIPE(data.ipe);
  renderICG(data.icg);

  renderEconomia(data, baseData);
  renderEvaluacion(data, baseData);
  renderImagen(data);
  renderVoto(data, baseData);
}

/* ---------------- KPI RENDER ---------------- */

/* Renderiza KPIs de overview ordenados de mayor a menor */
function renderOverviewKpis(kpis){
  const grid=el("kpiGrid");
  grid.innerHTML="";

  const sorted=Object.values(kpis)
    .sort((a,b)=>b.value-a.value);

  sorted.forEach((it,index)=>{
    const card=document.createElement("div");
    card.className=index<3?"kpi top3":"kpi";

    card.innerHTML=`
      <div class="val">${Number(it.value).toFixed(1)}%</div>
      <div class="lbl">${it.label}</div>
    `;

    grid.appendChild(card);
  });
}

/* ---------------- IPE ---------------- */

/* Actualiza valor y puntero visual del IPE */
function renderIPE(value){
  const elIPE=el("ipeValue");
  const pointer=el("ipePointer");

  if(value===null){
    elIPE.textContent="--";
    return;
  }

  const v=Number(value);
  elIPE.textContent=v.toFixed(2);

  const pct=(v-1)/3*100;
  pointer.style.left=pct+"%";
}

/* ---------------- ICG ---------------- */

/* Actualiza valor y puntero visual del ICG */
function renderICG(value){
  const elICG=el("icgValue");
  const pointer=el("icgPointer");

  if(value===null){
    elICG.textContent="--";
    return;
  }

  const v=Number(value);
  elICG.textContent=v.toFixed(2);

  const pct=(v-1)/3*100;
  pointer.style.left=pct+"%";
}

/* ---------------- INIT ---------------- */

/*
  Secuencia de arranque:
  1. oculta el contenido para evitar flash visual
  2. enlaza fullscreen
  3. carga datasets
  4. restaura estado previo
  5. muestra dashboard
*/
(async function init(){
  try{
    initStoryCounters();
    initLogoOnScroll();
    initFiltersButtonVisibility();
    setDashboardVisibility(false);
    await loadDatasets();
    await restoreUiState();
    setDashboardVisibility(true);
  }catch{
    setDashboardVisibility(true);
    el("status").textContent = "No se pudo conectar al backend";
  }
})();


/* Inicializa los contadores animados de la historia */
function initStoryCounters(){
  const section = document.querySelector(".story-block");
  const counters = document.querySelectorAll(".story-stat strong");

  if(!section || !counters.length) return;

  const observer = new IntersectionObserver((entries)=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting) return;

      document.querySelectorAll(".story-stat").forEach(stat=>{
        stat.classList.add("visible");
      });

      counters.forEach(el=>{
        const target = Number(el.dataset.count);
        const duration = 3800;
        const start = performance.now();

        function animate(now){
          const progress = Math.min((now - start) / duration, 1);
          const ease = 1 - Math.pow(1 - progress, 3);
          const value = Math.floor(target * ease);

          el.textContent = target >= 1000
            ? value.toLocaleString("es-AR")
            : value;

          if(progress < 1){
            requestAnimationFrame(animate);
          }else{
            if(target === 120000) el.textContent = "120.000+";
            if(target === 100) el.textContent = "100+";
            if(target === 200) el.textContent = "200+";
          }
        }

        requestAnimationFrame(animate);
      });
    });
  },{
    threshold:0.65
  });

  observer.observe(section);
}

/* Agrega clase al body para ocultar el logo lateral al hacer scroll */
/* Logo desaparece progresivamente al hacer scroll */
function initLogoOnScroll(){

  const logo = document.querySelector(".side-logo");

  if(!logo) return;

  window.addEventListener("scroll", () => {

    const maxScroll = 250;

    const progress = Math.min(
      window.scrollY / maxScroll,
      1
    );

    const scale = 1 - progress;
    const opacity = 1 - progress;

    logo.style.transform =
      `scale(${scale}) translateY(${-8 * progress}px)`;

    logo.style.opacity = opacity;

  });

}

/*OCULTAR BOTON FILTRO HASTA LLEGAR A DASH*/
function initFiltersButtonVisibility(){

  const laboratorio =
    document.querySelector(".lab-section");

  if(!laboratorio) return;

  const observer = new IntersectionObserver(

    ([entry]) => {

      document.body.classList.toggle(
        "filters-visible",
        entry.isIntersecting
      );

    },

    {
      threshold:0.90
    }

  );

  observer.observe(laboratorio);

}

