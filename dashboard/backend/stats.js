const cfg = require("./config");

/* ===============================
   HELPERS BÁSICOS
================================ */

/*
  Considera como vacío/nulo cualquier valor que no deba participar
  en filtros, distribuciones o cálculos ponderados.
*/
function isNullish(v) {
  return (
    v === null ||
    v === undefined ||
    v === "" ||
    v === "#¡NULO!" ||
    v === "#N/A" ||
    v === "#NULL!"
  );
}

/*
  Convierte un valor a número si es posible.
  Si el valor es nulo/inválido, devuelve null.
*/
function toNum(v) {
  if (isNullish(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/*
  Obtiene el peso del caso según la columna configurada en cfg.weightCol.
  Si el peso no es usable, devuelve 0.
*/
function weight(row) {
  const w = toNum(row[cfg.weightCol]);
  return w === null ? 0 : w;
}

/* Suma la ponderación total de un conjunto de filas */
function sumWeights(data) {
  let total = 0;
  for (const row of data) total += weight(row);
  return total;
}

/*
  Traduce un valor codificado a su etiqueta visible usando cfg.labels.
  Si no existe mapping, devuelve el valor como texto.
*/
function labelFor(variable, value) {
  const map = cfg.labels?.[variable];
  if (!map) return String(value);

  const key = String(value);
  return map[key] ?? map[value] ?? String(value);
}

/* ===============================
   COMPATIBILIDAD DE COLUMNAS
================================ */

/*
  Resuelve el valor de una columna considerando compatibilidades
  entre nombres viejos y nuevos.

  Caso actual:
  - NEDU1 <-> NEDUNUEVO
*/
function resolveRowValue(row, key) {
  if (row[key] !== undefined) return row[key];

  // Compatibilidad puntual para nivel educativo
  if (key === "NEDU1" && row.NEDUNUEVO !== undefined) return row.NEDUNUEVO;
  if (key === "NEDUNUEVO" && row.NEDU1 !== undefined) return row.NEDU1;

  return undefined;
}

/* ===============================
   FILTROS
================================ */

/*
  Aplica filtros exactos por igualdad de valor.
  Usa resolveRowValue para soportar compatibilidades de columnas.
*/
function applyFilters(data, filters) {
  return data.filter((row) => {
    for (const [key, wanted] of Object.entries(filters)) {
      if (wanted === undefined || wanted === "") continue;

      const current = resolveRowValue(row, key);

      if (String(current) !== String(wanted)) {
        return false;
      }
    }

    return true;
  });
}

/* ===============================
   DISTRIBUCIONES
================================ */

/*
  Calcula distribución ponderada de una variable simple:
  - excluye nulos
  - usa suma de pesos como denominador
  - devuelve porcentaje por categoría
  - ordena de mayor a menor porcentaje
*/
function weightedDistribution(data, variable) {
  const validRows = data.filter((row) => !isNullish(resolveRowValue(row, variable)));
  const denominator = sumWeights(validRows);

  if (!denominator) return [];

  const buckets = new Map();

  for (const row of validRows) {
    const key = String(resolveRowValue(row, variable));
    buckets.set(key, (buckets.get(key) || 0) + weight(row));
  }

  return Array.from(buckets.entries())
    .map(([value, weightedCount]) => ({
      value,
      label: labelFor(variable, value),
      percentage: +((weightedCount / denominator) * 100).toFixed(1)
    }))
    .sort((a, b) => b.percentage - a.percentage);
}

/* ===============================
   MULTI RESPUESTA
================================ */

/*
  Calcula el porcentaje ponderado de selección para variables
  binarias de multi-respuesta, donde 1 significa "marcado".
*/
function weightedMulti(data, variable) {
  const denominator = sumWeights(data);
  if (!denominator) return 0;

  let marked = 0;

  for (const row of data) {
    if (toNum(resolveRowValue(row, variable)) === 1) {
      marked += weight(row);
    }
  }

  return +((marked / denominator) * 100).toFixed(1);
}

/* ===============================
   INDICES
================================ */

/*
  Calcula media ponderada para un índice existente como columna.
  Actualmente se usa para IPE.

  Nota:
  - excluye null
  - excluye 0
  - excluye filas sin peso válido
*/
function weightedIndexMean(data, variable) {
  let numerator = 0;
  let denominator = 0;

  for (const row of data) {
    const value = toNum(resolveRowValue(row, variable));

    if (value === null) continue;
    if (value === 0) continue;

    const w = weight(row);
    if (!w) continue;

    numerator += value * w;
    denominator += w;
  }

  if (!denominator) return null;

  return +(numerator / denominator).toFixed(2);
}

/*
  Calcula el valor fila a fila del ICG derivado:
  promedio simple entre EVAGOB, IMPACTOPOL, CAPACIDADGOB y RUMBO
  usando solo los valores presentes de esa fila.
*/
function computeICGRow(row) {
  const variables = ["EVAGOB", "IMPACTOPOL", "CAPACIDADGOB", "RUMBO"];

  const values = variables
    .map((variable) => toNum(resolveRowValue(row, variable)))
    .filter((value) => value !== null);

  if (!values.length) return null;

  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

/*
  Calcula media ponderada de un valor derivado por fila,
  provisto por una función rowValueFn.
*/
function weightedDerivedMean(data, rowValueFn) {
  let numerator = 0;
  let denominator = 0;

  for (const row of data) {
    const value = rowValueFn(row);

    if (value === null || value === undefined) continue;

    const w = weight(row);
    if (!w) continue;

    numerator += value * w;
    denominator += w;
  }

  if (!denominator) return null;

  return +(numerator / denominator).toFixed(2);
}

/* ===============================
   MULTI POR PREFIJO (TAB4)
================================ */

/*
  Busca automáticamente todas las columnas que arrancan con un prefijo
  y calcula su frecuencia ponderada de selección (valor 1).

  Se usa para la tab Imagen Presidencial:
  - PRESIDENTE IDEAL
  - atributos de Milei
*/
function multiByPrefix(data, prefix) {
  if (!data.length) return [];

  const cols = Object.keys(data[0]).filter((key) => key.startsWith(prefix));
  const denominator = sumWeights(data);

  if (!denominator) return [];

  const out = cols.map((col) => {
    let marked = 0;

    for (const row of data) {
      if (toNum(resolveRowValue(row, col)) === 1) {
        marked += weight(row);
      }
    }

    return {
      col,
      label: col.slice(prefix.length).replaceAll("_", " "),
      percentage: +((marked / denominator) * 100).toFixed(1)
    };
  });

  out.sort((a, b) => b.percentage - a.percentage);

  return out;
}

/* ===============================
   DASHBOARD
================================ */

/*
  Construye la respuesta completa del dashboard a partir del dataset
  ya filtrado.

  Devuelve:
  - bases
  - índices principales
  - estructura por tabs
*/
function buildDashboard(data) {
  const basePonderada = sumWeights(data);

  /* IPE usa la columna configurada en cfg.indices.IPE */
  const ipe = weightedIndexMean(data, cfg.indices.IPE);

  // ICG NO usa la columna cruda ICG.
  // Se recalcula como promedio fila a fila de:
  // EVAGOB + IMPACTOPOL + CAPACIDADGOB + RUMBO
  // incluyendo los 0 cuando existen como valor válido.
  const icg = weightedDerivedMean(data, computeICGRow);

  /* TAB 1: KPIs multi-respuesta de principales preocupaciones */
  const tab1 = { kpis: {} };

  for (const variable of cfg.overviewMulti) {
    tab1.kpis[variable] = {
      label: cfg.pretty[variable] || variable,
      value: weightedMulti(data, variable)
    };
  }

  /* TAB 2: Economía */
  const tab2 = {};
  for (const variable of cfg.economia) {
    tab2[variable] = weightedDistribution(data, variable);
  }
  tab2.IPE = ipe;

  /* TAB 3: Evaluación de Gobierno */
  const tab3 = {};
  for (const variable of cfg.evaluacion) {
    tab3[variable] = weightedDistribution(data, variable);
  }
  tab3.ICG = icg;

  /* TAB 4: Imagen Presidencial */
  const tab4 = {
    ideal: multiByPrefix(data, cfg.imagen.idealPrefix),
    milei: multiByPrefix(data, cfg.imagen.mileiPrefix)
  };

  /* TAB 5: Ideología y Elecciones Hoy */
  const tab5 = {
    IDEOLOGIA: weightedDistribution(data, "IDEOLOGIA"),
    ELECCIONESHOY: weightedDistribution(data, "ELECCIONESHOY")
  };

  return {
    bases: {
      real: data.length,
      ponderada: +basePonderada.toFixed(2)
    },
    ipe,
    icg,
    tab1,
    tab2,
    tab3,
    tab4,
    tab5
  };
}

/* ===============================
   EXPORTS
================================ */

module.exports = {
  applyFilters,
  buildDashboard,
  isNullish,
  labelFor,
  resolveRowValue
};