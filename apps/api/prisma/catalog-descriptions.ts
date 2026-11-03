/**
 * Descripciones de las opciones de maestra del triage (se muestran en los
 * desplegables). Clave "MAESTRA:CODIGO". Solo se aplican al CREAR la opcion: el
 * administrador puede editarlas despues y el seed no las pisa. La migracion
 * 20261106120000_catalog_item_description carga los mismos textos en bases
 * existentes.
 */
export const CATALOG_DESCRIPTIONS: Record<string, string> = {
  'TRIAGE_SIZE:S': 'Cambio puntual y acotado, de un solo equipo y sin dependencias. Se resuelve rápido.',
  'TRIAGE_SIZE:M': 'Alcance claro con algunas piezas por construir o ajustar; puede requerir coordinar con otra persona o área.',
  'TRIAGE_SIZE:L': 'Varias piezas o fuentes de datos, dependencias entre equipos y pruebas con usuarios. Necesita un plan por fases.',
  'TRIAGE_SIZE:XL': 'Iniciativa de varios procesos o áreas, con alto riesgo o incertidumbre. Conviene dividirla en partes antes de priorizarla.',
  'CRITICALITY:BAJA': 'No afecta la operación; puede esperar sin consecuencias.',
  'CRITICALITY:MEDIA': 'Afecta a un grupo reducido o tiene alternativa manual; se atiende en el ciclo normal.',
  'CRITICALITY:ALTA': 'Afecta decisiones o procesos importantes y no hay buena alternativa; debe atenderse pronto.',
  'CRITICALITY:CRITICA': 'Detiene la operación o genera un riesgo legal, financiero o de seguridad; atención inmediata.',
  'DATA_AVAILABILITY:SI': 'Los datos necesarios ya están disponibles y se puede acceder a ellos.',
  'DATA_AVAILABILITY:PARCIAL': 'Hay parte de los datos, o falta depurarlos, completarlos o conseguir el acceso.',
  'DATA_AVAILABILITY:NO': 'Los datos no existen o no hay acceso a ellos; hay que conseguirlos antes de empezar.',
  'TRIAGE_ROUTE:BI': 'Reportes, tableros y modelos de datos para análisis.',
  'TRIAGE_ROUTE:INTEGRACIONES': 'Conexión y movimiento de datos entre sistemas (APIs, cargas, pipelines).',
  'TRIAGE_ROUTE:IA': 'Modelos, agentes o automatizaciones con inteligencia artificial.',
  'TRIAGE_ROUTE:MULTIPROCESO': 'Requiere trabajo coordinado de dos o más de las rutas anteriores.',
  'DEMAND_TYPE:DESARROLLO': 'Construir algo nuevo que hoy no existe.',
  'DEMAND_TYPE:EVOLUCION': 'Mejorar o ampliar algo que ya existe.',
  'DEMAND_TYPE:SOPORTE_INCIDENTE': 'Algo que ya funcionaba falló o se comporta mal y hay que corregirlo.',
  'DEMAND_TYPE:DEUDA_TECNICA': 'Ordenar o rehacer lo construido para que sea más estable y fácil de mantener.',
  'DEMAND_TYPE:EXPLORACION': 'Investigar si algo es viable antes de comprometerse a construirlo.',
};
