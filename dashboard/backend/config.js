module.exports = {
  /*
    Columna de ponderación principal utilizada en todos
    los cálculos estadísticos del dashboard.
  */
  weightCol: "PONDFINAL",

  /*
    Filtros globales visibles en la UI.
    IDEOLOGIA queda afuera a propósito porque se usa
    dentro de la tab de voto/crossfilter y no como filtro global.
  */
  globalFilters: ["SEXO", "EDADNUEVO", "NEDU1", "REGIONNUEVO", "VOTO2025"],

  /*
    Variables habilitadas para cross-filter desde charts.
    Son las únicas que el frontend puede enviar como filtros
    interactivos adicionales al backend.
  */
  crossFilterVars: [
    "EVAGOB",
    "ELECCIONESHOY",
    "IDEOLOGIA",
    "PRESTAMOS",
    "RUMBO",
    "SITECO",
    "CAPACIDADGOB",
    "SITECO6MESES",
    "IMPACTOPOL"
  ],

  /*
    Variables multi-respuesta de la tab 1
    (Principales preocupaciones).
    Cada una se procesa como porcentaje ponderado de casos marcados.
  */
  overviewMulti: [
    "BAJOSSAL",
    "INFLACION",
    "DESEMPLEO",
    "INSEGURIDAD",
    "SALUD",
    "EDU",
    "DESORDEN",
    "CORRUPCION",
    "JUSTICIA",
    "VIVIENDA"
  ],

  /*
    Variables simples que alimentan la tab Economía.
  */
  economia: ["SITECO", "SITECO6MESES", "PRESTAMOS", "RUMBO"],

  /*
    Variables simples que alimentan la tab Evaluación de Gobierno.
  */
  evaluacion: ["EVAGOB", "IMPACTOPOL", "CAPACIDADGOB"],

  /*
    Índices principales.
    - IPE se toma directamente de la columna IPE
    - ICG se recalcula en stats.js y no se consume como columna cruda
  */
  indices: { IPE: "IPE", ICG: "ICG" },

  /*
    Prefijos usados para detectar automáticamente columnas binarias
    de la tab Imagen Presidencial.
  */
  imagen: { idealPrefix: "PRESIDEAL_", mileiPrefix: "MILEI_" },

  /*
    Labels legibles para filtros y distribuciones.
    El backend los usa para devolver etiquetas visibles al frontend
    a partir de valores codificados.
  */
  labels: {
    SEXO: { 1: "Varón", 2: "Mujer" },

    EDADNUEVO: {
      1: "16 a 34 años",
      2: "35 a 54 años",
      3: "55 o más años"
    },

    NEDU1: {
      1: "Bajo",
      2: "Medio",
      3: "Alto"
    },

    /*
      Compatibilidad mínima si alguna base vieja sigue trayendo
      NEDUNUEVO en lugar de NEDU1.
    */
    NEDUNUEVO: {
      1: "Bajo",
      2: "Medio",
      3: "Alto"
    },

    REGIONNUEVO: {
      1: "AMBA",
      2: "CENTRO",
      3: "INTERIOR"
    },

    VOTO2025: {
      1: "LLA",
      2: "Fuerza Patria",
      3: "Provincias Unidas",
      4: "Desencantados (Izquierda-Resto-Blanco)"
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

    PRESTAMOS: {
      1: "Sí, pedimos dinero a un banco",
      2: "Sí, pedimos dinero a una entidad financiera",
      3: "Sí, utilizamos tarjeta de crédito, pagando el mínimo o en cuotas",
      4: "Sí, pedimos dinero a familiares/amigos",
      5: "Sí, pedimos préstamos en Mercado Pago y utilizamos las cuotas",
      6: "No tuvimos que pedir dinero prestado"
    },

    EVAGOB: {
      0: "No lo sé",
      1: "Muy malo",
      2: "Malo",
      3: "Bueno",
      4: "Muy bueno"
    },

    IMPACTOPOL: {
      0: "No lo sé",
      1: "Muy negativo",
      2: "Algo negativo",
      3: "Algo positivo",
      4: "Muy positivo"
    },

    CAPACIDADGOB: {
      0: "No lo sé",
      1: "Nada de capacidad",
      2: "Poca capacidad",
      3: "Algo de capacidad",
      4: "Mucha capacidad"
    },

    RUMBO: {
      0: "No lo sé",
      1: "Muy equivocado",
      2: "Equivocado",
      3: "Correcto",
      4: "Muy correcto"
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
    }
  },

  /*
    Nombres lindos para mostrar los KPIs multi de overview
    en lugar de los nombres técnicos de columnas.
  */
  pretty: {
    BAJOSSAL: "Bajos salarios",
    INFLACION: "Inflación",
    DESEMPLEO: "Desempleo",
    INSEGURIDAD: "Inseguridad",
    SALUD: "Salud",
    EDU: "Educación",
    DESORDEN: "Desorden",
    CORRUPCION: "Corrupción",
    JUSTICIA: "Justicia",
    VIVIENDA: "Vivienda"
  }
};