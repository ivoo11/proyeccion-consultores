/* ===============================
   DEPENDENCIAS
   - express: servidor HTTP
   - cors: habilita requests desde el frontend local
   - xlsx: lectura de datasets Excel
   - fs/path: acceso a archivos y rutas del sistema
================================ */
const express = require("express");
const cors = require("cors");
const xlsx = require("xlsx");
const fs = require("fs");
const path = require("path");

/* ===============================
   CONFIG Y LÓGICA DE NEGOCIO
   - cfg: configuración central del proyecto
   - stats.js: helpers de filtros, labels y armado del dashboard
================================ */
const cfg = require("./config");
const {
  applyFilters,
  isNullish,
  buildDashboard,
  labelFor,
  resolveRowValue
} = require("./stats");

const app = express();

/* Middleware base del backend */
app.use(cors());
app.use(express.json());

/* ===============================
   DATASETS
   - DATA_DIR: carpeta donde viven los XLSX
   - datasets: cache en memoria por clave year_month
   - datasetIndex: listado resumido de datasets disponibles
   - rawData: dataset actualmente activo
   - loaded: indica si ya hay dataset seleccionado
   - currentDataset: clave del dataset activo
================================ */

const DATA_DIR = path.join(__dirname, "data");

let datasets = {};
let datasetIndex = [];
let rawData = [];
let loaded = false;
let currentDataset = null;

/* ===============================
   HELPERS
================================ */

/*
  Lista blanca de variables que pueden entrar como filtros
  en /dashboard:
  - filtros globales declarados en config
  - variables habilitadas para crossfilter desde charts
*/
const allowedFilterVars = [...new Set([
  ...cfg.globalFilters,
  ...(cfg.crossFilterVars || [])
])];

/*
  Ordena valores de filtros para el endpoint /meta:
  - si ambos son numéricos, orden ascendente numérico
  - si no, orden alfabético en español
*/
function sortFilterValues(values) {
  return values.sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);

    const aIsNum = Number.isFinite(na);
    const bIsNum = Number.isFinite(nb);

    if (aIsNum && bIsNum) return na - nb;
    return String(a).localeCompare(String(b), "es");
  });
}

/* ===============================
   CARGAR TODOS LOS XLSX
================================ */

/*
  Lee todos los archivos válidos de /data con formato:
  YYYY_MM.xlsx

  Para cada archivo:
  - lo carga en memoria
  - guarda sus filas en datasets
  - agrega un resumen a datasetIndex

  Luego ordena datasetIndex del más reciente al más antiguo.
*/
function loadAllDatasets() {
  if (!fs.existsSync(DATA_DIR)) {
    console.log("Carpeta /data no encontrada");
    return;
  }

  const files = fs
    .readdirSync(DATA_DIR)
    .filter((file) => file.endsWith(".xlsx"));

  for (const file of files) {
    const match = file.match(/^(\d{4})_(\d{2})\.xlsx$/);
    if (!match) continue;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const fullPath = path.join(DATA_DIR, file);

    try {
      const workbook = xlsx.readFile(fullPath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });

      datasets[`${year}_${month}`] = rows;

      datasetIndex.push({
        year,
        month,
        rows: rows.length
      });
    } catch (error) {
      console.log("Error leyendo", file, error.message);
    }
  }

  datasetIndex.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });

  console.log("Datasets cargados:", datasetIndex.length);
}

/* ===============================
   HEALTH
================================ */

/*
  Endpoint de diagnóstico rápido.
  Devuelve:
  - datasets detectados
  - dataset actualmente activo
  - cantidad de filas del dataset cargado
*/
app.get("/health", (req, res) => {
  res.json({
    datasets: datasetIndex,
    currentDataset,
    rows: rawData.length
  });
});

/* ===============================
   LISTA DATASETS
================================ */

/* Devuelve el índice resumido de datasets disponibles */
app.get("/datasets", (req, res) => {
  res.json(datasetIndex);
});

/* ===============================
   CAMBIAR DATASET
================================ */

/*
  Activa un dataset en memoria a partir de year + month.
  Si existe:
  - rawData pasa a apuntar a ese dataset
  - loaded se marca en true
  - currentDataset guarda la clave activa
*/
app.get("/dataset", (req, res) => {
  const { year, month } = req.query;
  const key = `${year}_${month}`;

  if (!datasets[key]) {
    return res.status(404).json({
      error: "Dataset no encontrado"
    });
  }

  rawData = datasets[key];
  loaded = true;
  currentDataset = key;

  res.json({
    ok: true,
    dataset: key,
    rows: rawData.length
  });
});

/* ===============================
   META
================================ */

/*
  Devuelve metadata para construir filtros globales en frontend:
  - qué filtros existen
  - qué valores posibles tiene cada uno

  Usa:
  - resolveRowValue para compatibilidades de columnas
  - isNullish para ignorar vacíos
  - labelFor para devolver etiquetas legibles
*/
app.get("/meta", (req, res) => {
  if (!loaded) {
    return res.json({
      loaded: false,
      globalFilters: cfg.globalFilters,
      options: {}
    });
  }

  const options = {};

  for (const filterKey of cfg.globalFilters) {
    const set = new Set();

    for (const row of rawData) {
      const value = resolveRowValue(row, filterKey);
      if (isNullish(value)) continue;

      set.add(String(value));
    }

    options[filterKey] = sortFilterValues([...set]).map((value) => ({
      value,
      label: labelFor(filterKey, value)
    }));
  }

  res.json({
    loaded: true,
    globalFilters: cfg.globalFilters,
    options
  });
});

/* ===============================
   DASHBOARD
================================ */

/*
  Endpoint principal del frontend.

  Flujo:
  1. valida que haya dataset cargado
  2. arma un objeto filters usando solo variables permitidas
  3. aplica filtros al dataset activo
  4. construye la respuesta completa del dashboard
  5. devuelve también meta.filtersApplied para trazabilidad visual
*/
app.get("/dashboard", (req, res) => {
  if (!loaded) {
    return res.status(400).json({
      error: "Dataset no seleccionado"
    });
  }

  const filters = {};

  for (const key of allowedFilterVars) {
    if (req.query[key] !== undefined && req.query[key] !== "") {
      filters[key] = req.query[key];
    }
  }

  const filtered = applyFilters(rawData, filters);
  const result = buildDashboard(filtered);

  res.json({
    meta: { filtersApplied: filters },
    ...result
  });
});

/* ===============================
   START SERVER
================================ */

/* Carga datasets al iniciar el proceso */
loadAllDatasets();

/* Levanta servidor local para consumo del frontend */
app.listen(3000, () => {
  console.log("Servidor en http://localhost:3000");
});