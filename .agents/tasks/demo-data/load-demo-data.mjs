#!/usr/bin/env node
/**
 * Carga de datos de prueba "demo-ui" para el portal control-phari.
 *
 * - Usa EXCLUSIVAMENTE la API REST real: las reglas de negocio, las maquinas de
 *   estado y la auditoria se aplican igual que desde la UI. Nada de SQL ni Prisma.
 * - Solo CREA entidades y avanza estados de lo que este script creo. Nunca
 *   modifica ni borra datos preexistentes (lo que no esta en manifest.json).
 * - Idempotente respecto a manifest.json: cada paso tiene una clave estable; si
 *   la clave ya esta registrada, el paso se omite y no se duplica nada.
 * - Todo lo creado queda en manifest.json en orden de creacion para una limpieza
 *   posterior en orden inverso de dependencias (esta tarea NO limpia nada).
 *
 * Uso (desde la raiz del repo):
 *   node .agents/tasks/demo-data/load-demo-data.mjs            carga + verificacion
 *   node .agents/tasks/demo-data/load-demo-data.mjs --verify   solo verificacion (no muta)
 *
 * Configuracion por variables de entorno (valores por defecto de desarrollo):
 *   DEMO_API_BASE   URL base de la API   (por defecto http://localhost:3001)
 *   DEMO_PASSWORD   clave de los usuarios semilla (por defecto dev1234)
 *
 * Los textos se envian con fetch + JSON.stringify (UTF-8), nunca con
 * Invoke-RestMethod, para no corromper tildes ni enes.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.join(HERE, 'manifest.json');
const API_BASE = (process.env.DEMO_API_BASE ?? 'http://localhost:3001').replace(/\/+$/, '');
const PASSWORD = process.env.DEMO_PASSWORD ?? 'dev1234';
const VERIFY_ONLY = process.argv.includes('--verify');

/** Marca de prueba al final de los campos libres de descripcion/notas. */
const MARKER = 'Dato de prueba (demo-ui)';
/** Dominio reservado de las personas creadas por este dataset. */
const DEMO_DOMAIN = '@demo-ui.local';

const mark = (text) => `${text}\n${MARKER}`;
/** Fecha de dia en el mismo formato que envia la UI (medianoche UTC). */
const day = (iso) => `${iso}T00:00:00.000Z`;
/** Fecha-hora UTC (las horas de Colombia son UTC-5). */
const at = (iso, time = '15:00') => `${iso}T${time}:00.000Z`;

/** Usuarios semilla que pueden iniciar sesion (actores de la carga). */
const ACTOR_IDENTIFIERS = {
  jefe: 'jefe@demo.local',
  beto: 'lider.bi@demo.local',
  carla: 'integrante.bi@demo.local',
  diego: 'lider.ia@demo.local',
};

// ---------------------------------------------------------------------------
// Manifiesto
// ---------------------------------------------------------------------------

function emptyManifest() {
  return {
    dataset: 'demo-ui',
    description:
      'Datos de prueba para verificar visualmente la renovacion de UI. Para limpiar, recorrer "entities" en orden inverso; "actions" lista las transiciones aplicadas a esas entidades.',
    script: '.agents/tasks/demo-data/load-demo-data.mjs',
    apiBase: API_BASE,
    marker: MARKER,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    entities: [],
    actions: [],
    skipped: [],
  };
}

const manifest = existsSync(MANIFEST_PATH)
  ? JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
  : emptyManifest();
manifest.entities ??= [];
manifest.actions ??= [];
manifest.skipped ??= [];

const entityByKey = new Map(manifest.entities.map((e) => [e.key, e]));
const actionKeys = new Set(manifest.actions.map((a) => a.key));
const runStats = { created: 0, actions: 0, skipped: 0 };
const warnings = [];

function saveManifest() {
  manifest.updatedAt = new Date().toISOString();
  const tmp = `${MANIFEST_PATH}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  renameSync(tmp, MANIFEST_PATH);
}

function warn(message) {
  warnings.push(message);
  console.warn(`  ! ${message}`);
}

function idOf(key) {
  const entry = entityByKey.get(key);
  if (!entry) {
    throw new Error(`Falta en el manifiesto la entidad "${key}".`);
  }
  return entry.id;
}

function hasEntity(key) {
  return entityByKey.has(key);
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

class ApiError extends Error {
  constructor(method, route, status, body) {
    super(
      `${method} ${route} -> ${status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`,
    );
    this.status = status;
    this.body = body;
  }
}

const tokens = new Map();

async function login(actor) {
  const identifier = ACTOR_IDENTIFIERS[actor];
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ identifier, password: PASSWORD }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new ApiError('POST', '/auth/login', res.status, text);
  }
  tokens.set(actor, JSON.parse(text).accessToken);
}

async function api(actor, method, route, body, retried = false) {
  if (!tokens.has(actor)) {
    await login(actor);
  }
  const headers = {
    Authorization: `Bearer ${tokens.get(actor)}`,
    Accept: 'application/json',
  };
  const init = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json; charset=utf-8';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${route}`, init);
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (res.status === 401 && !retried) {
    tokens.delete(actor);
    return api(actor, method, route, body, true);
  }
  if (!res.ok) {
    throw new ApiError(method, route, res.status, data);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Pasos idempotentes
// ---------------------------------------------------------------------------

function recordEntities(entries) {
  for (const entry of entries) {
    manifest.entities.push(entry);
    entityByKey.set(entry.key, entry);
    runStats.created += 1;
  }
  saveManifest();
}

/**
 * Crea una entidad si su clave no esta en el manifiesto. `extraEntities`
 * registra, en la misma escritura del manifiesto, filas creadas como efecto de
 * la misma llamada (participantes de la solicitud, version 1 del documento...).
 */
async function ensureEntity(key, spec) {
  const existing = entityByKey.get(key);
  if (existing) {
    return existing;
  }
  const res = await api(spec.actor, spec.method, spec.route, spec.body);
  const id = spec.idOf ? spec.idOf(res) : res?.id;
  if (!id) {
    throw new Error(`Paso ${key}: la respuesta no trae id.`);
  }
  const createdAt =
    (res && typeof res === 'object' && res.createdAt) || new Date().toISOString();
  const entry = {
    key,
    entity: spec.entity,
    id,
    parentIds: spec.parentIds ?? {},
    createdVia: `${spec.method} ${spec.route}`,
    actor: ACTOR_IDENTIFIERS[spec.actor],
    createdAt,
    ...(spec.label ? { label: spec.label } : {}),
  };
  const extra = (spec.extraEntities ? spec.extraEntities(res) : []).map((e) => ({
    actor: ACTOR_IDENTIFIERS[spec.actor],
    createdAt,
    ...e,
  }));
  recordEntities([entry, ...extra.filter((e) => !entityByKey.has(e.key))]);
  if (spec.after) {
    await spec.after(res, entry);
  }
  return entry;
}

/** Aplica una transicion/accion una sola vez (clave registrada en "actions"). */
async function ensureAction(key, spec) {
  if (actionKeys.has(key)) {
    return null;
  }
  const res = await api(spec.actor, spec.method, spec.route, spec.body);
  manifest.actions.push({
    key,
    action: `${spec.method} ${spec.route}`,
    target: spec.target,
    actor: ACTOR_IDENTIFIERS[spec.actor],
    at: new Date().toISOString(),
    ...(spec.detail ? { detail: spec.detail } : {}),
  });
  actionKeys.add(key);
  runStats.actions += 1;
  saveManifest();
  return res;
}

/** Deja constancia de algo que NO se creo por chocar con datos preexistentes. */
function skip(key, reason) {
  runStats.skipped += 1;
  if (!manifest.skipped.some((s) => s.key === key)) {
    manifest.skipped.push({ key, reason, at: new Date().toISOString() });
    saveManifest();
  }
  console.log(`  - omitido ${key}: ${reason}`);
}

function assertMaxLength(label, value, max) {
  if (typeof value === 'string' && value.length > max) {
    throw new Error(`${label} excede ${max} caracteres (${value.length}).`);
  }
}

// ---------------------------------------------------------------------------
// Contexto resuelto en tiempo de ejecucion
// ---------------------------------------------------------------------------

/** code de proceso -> id */
const P = {};
/** id de proceso -> code */
const PROCESS_CODE = {};
/** clave de persona (jefe, beto, ..., valentina) -> userId */
const U = {};

// ===========================================================================
// DATASET (textos realistas del area de Analitica; sin prefijos tipo [DEMO])
// ===========================================================================

/** Personas nuevas (sin contrasena: no inician sesion; responsables y capacidad). */
const NEW_USERS = [
  {
    key: 'valentina',
    identifier: 'valentina.rios@demo-ui.local',
    name: 'Valentina Ríos',
    grants: [['LIDER_PROCESO', 'FIID']],
  },
  {
    key: 'mateo',
    identifier: 'mateo.cardenas@demo-ui.local',
    name: 'Mateo Cárdenas',
    grants: [
      ['INTEGRANTE', 'FIID'],
      ['INTEGRANTE', 'FIBI'],
    ],
  },
  {
    key: 'sofia',
    identifier: 'sofia.pena@demo-ui.local',
    name: 'Sofía Peña',
    grants: [['INTEGRANTE', 'FIAA']],
  },
  {
    key: 'julian',
    identifier: 'julian.munoz@demo-ui.local',
    name: 'Julián Muñoz',
    grants: [['INTEGRANTE', 'FIBI']],
  },
];

/** Criterios de prioridad (1-5) en el orden de los pesos del backend. */
const crit = (impact, alignment, riskControl, urgency, scope, dataAvailability, feasibility, reuse) => ({
  impact,
  alignment,
  riskControl,
  urgency,
  scope,
  dataAvailability,
  feasibility,
  reuse,
});
const WEIGHTS = {
  impact: 25,
  alignment: 15,
  riskControl: 15,
  urgency: 10,
  scope: 10,
  dataAvailability: 10,
  feasibility: 10,
  reuse: 5,
};
const scoreOf = (c) =>
  Math.round(Object.entries(WEIGHTS).reduce((sum, [k, w]) => sum + w * (c[k] / 5), 0));
const bandOf = (s) => (s >= 80 ? 'P1' : s >= 65 ? 'P2' : s >= 45 ? 'P3' : 'P4');

const triageBody = (
  decision,
  routeCode,
  demandTypeCode,
  criticalityCode,
  sizeCode,
  dataAvailabilityCode,
  totalEffortHours,
  mainResponsible,
  notes,
  dependencies,
) => ({
  decision,
  routeCode,
  demandTypeCode,
  criticalityCode,
  sizeCode,
  dataAvailabilityCode,
  totalEffortHours,
  mainResponsible,
  ...(dependencies ? { dependencies } : {}),
  notes: mark(notes),
});

const LONG_TITLE_BI =
  'Consolidación del modelo semántico corporativo de clientes, productos y canales para unificar los indicadores comerciales de todas las regionales y eliminar las diferencias entre los reportes de gerencia, mercadeo y finanzas';

const LONG_RESULT_BI = mark(`Contar con un único modelo semántico corporativo, publicado en Power BI y documentado en el catálogo de datos, que integre las dimensiones de cliente, producto, canal, regional y tiempo con definiciones de negocio acordadas por Gerencia, Mercadeo y Finanzas.

Alcance esperado:
1. Inventario de los 37 reportes comerciales vigentes y de las fórmulas con las que cada área calcula hoy la venta neta, el margen, las devoluciones y el cumplimiento de presupuesto.
2. Glosario con una sola definición aprobada por indicador, con su dueño funcional, la regla de cálculo y los filtros por defecto.
3. Modelo semántico certificado, con seguridad por regional y por línea de negocio, actualizado a diario antes de las 7:00 a. m.
4. Migración gradual de los reportes existentes al modelo certificado, empezando por los tableros de la Gerencia General.
5. Tablero de conciliación que muestre, mientras dure la transición, las diferencias entre las cifras antiguas y las del modelo nuevo.

Criterios de éxito: diferencias inferiores al 0,5 % frente al cierre contable mensual; cero reportes paralelos para los indicadores certificados al cierre del primer semestre de 2027, y consultas que respondan en menos de 3 segundos en el 95 % de los casos.

Riesgos identificados: resistencia de las áreas a abandonar sus fórmulas propias, calidad irregular del maestro de clientes en las regionales del sur y dependencia de la capacidad del equipo de Integraciones para exponer los datos de devoluciones.`);

const LONG_TITLE_IA =
  'Evaluación de viabilidad para incorporar modelos de lenguaje en la atención de solicitudes internas de soporte de primer nivel, incluyendo análisis de riesgos de privacidad, costos de operación y criterios de éxito medibles';

const LONG_RESULT_IA = mark(`Documento de viabilidad que permita decidir si se incorpora un asistente basado en modelos de lenguaje para resolver las solicitudes de soporte de primer nivel (restablecimiento de contraseñas, acceso a aplicaciones, configuración de correo y VPN), que hoy representan cerca del 46 % de los casos de la mesa de servicio.

El documento debe incluir:
• Análisis de los 12.000 casos cerrados en los últimos seis meses para identificar los temas automatizables.
• Evaluación de al menos dos alternativas tecnológicas (servicio administrado y modelo desplegado en la nube privada), con costos de operación estimados a 12 meses.
• Análisis de riesgos de privacidad y seguridad de la información, revisado por Jurídica y por Seguridad de la Información.
• Criterios de éxito medibles: porcentaje de solución sin intervención humana, satisfacción del usuario y tiempo promedio de atención.
• Recomendación final con un plan de piloto de ocho semanas si la evaluación resulta favorable.`);

const LONG_TRIAGE_DEPENDENCIES_IA = `1. Extracción anonimizada de los casos de la mesa de servicio de los últimos seis meses (equipo de Integraciones).
2. Concepto de Jurídica sobre el tratamiento de datos personales en servicios de terceros.
3. Concepto de Seguridad de la Información sobre la clasificación de los datos que podría consultar el asistente.
4. Cotizaciones de al menos dos proveedores de servicios de modelos de lenguaje, gestionadas por Compras.
5. Disponibilidad de un analista de la mesa de servicio durante cuatro semanas para etiquetar casos de ejemplo.`;

const LONG_TRIAGE_NOTES_IA = `La solicitud es exploratoria: no compromete la implementación, solo el estudio de viabilidad. En la sesión de triage se acordó limitar el alcance a las solicitudes de primer nivel, sin incluir incidentes de infraestructura ni cambios a aplicaciones.

Se identificaron tres preocupaciones principales: (1) la privacidad de los datos de los colaboradores que aparecen en los casos, (2) el costo de operación por consulta si el volumen crece más de lo previsto y (3) la aceptación de los usuarios, que hoy valoran la atención telefónica.

Antes de priorizar se requiere que la Mesa de Servicio entregue el volumen mensual por categoría y que Seguridad de la Información confirme si los casos pueden procesarse fuera de la red corporativa. Si alguna de estas condiciones no se cumple, la recomendación será reformular la solicitud como una mejora del portal de autoservicio.`;

/**
 * Solicitudes. Estado objetivo (comentario) = resultado de aplicar triage,
 * evaluaciones, aprobacion, plan y gobierno a traves de la API.
 */
const REQUESTS = [
  // --- BI (FIBI) -----------------------------------------------------------
  {
    // EN_EJECUCION (plan PA) · P1 86 · ruta COMPLETA · GC4 con bloqueo
    key: 'R01',
    actor: 'beto',
    process: 'FIBI',
    participants: ['FIID'],
    body: {
      title: 'Tablero ejecutivo de ventas y margen por canal',
      requesterArea: 'Gerencia Comercial',
      requesterName: 'Laura Gómez',
      functionalOwner: 'Andrés Salazar – Planeación Comercial',
      expectedResult: mark(
        'Tablero en Power BI con ventas, margen bruto y cumplimiento de presupuesto por canal, regional y línea de producto, actualizado a diario antes de las 7:00 a. m. Debe permitir comparar contra el mismo periodo del año anterior y bajar al detalle por cliente.',
      ),
      targetDate: day('2026-12-11'),
      initialCommitmentDate: day('2026-12-04'),
      referenceUrl: 'https://intranet.example.com/demanda/tablero-ventas-margen',
    },
    triage: {
      actor: 'beto',
      body: triageBody(
        'CONTINUAR', 'BI', 'DESARROLLO', 'ALTA', 'L', 'PARCIAL', 220, 'Beto Lider BI',
        'Se presenta al comité de demanda de octubre. Validar con Finanzas las reglas de asignación de costos antes de construir el modelo.',
        'Extracción de ventas y costos estándar desde el ERP a cargo del equipo de Integraciones.',
      ),
    },
    priorities: [
      {
        actor: 'beto',
        criteria: crit(5, 4, 4, 5, 4, 4, 4, 3),
        justification:
          'Alto impacto en las decisiones comerciales del cierre de año y alineado con la meta de rentabilidad 2026. Los datos de costos están solo parcialmente disponibles.',
      },
    ],
    approval: { actor: 'jefe', decision: 'APROBAR', reason: 'Aprobado en el comité de demanda del 2 de octubre.' },
  },
  {
    // COMPROMETIDA + BLOQUEADA (flag) · P2 72
    key: 'R02',
    actor: 'beto',
    process: 'FIBI',
    body: {
      title: 'Reporte regulatorio de cartera vencida para la Superintendencia Financiera',
      requesterArea: 'Riesgo de Crédito',
      requesterName: 'Martha Lucía Rincón',
      functionalOwner: 'Dirección de Riesgos',
      expectedResult: mark(
        'Reporte mensual en el formato exigido por la Superintendencia con la cartera vencida por altura de mora, calificación y provisión, generado automáticamente desde el data lake y con controles de cuadre contra contabilidad.',
      ),
      targetDate: day('2026-11-30'),
      initialCommitmentDate: day('2026-11-30'),
    },
    triage: {
      actor: 'beto',
      body: triageBody(
        'CONTINUAR', 'BI', 'DESARROLLO', 'CRITICA', 'M', 'NO', 160, 'Beto Lider BI',
        'Obligación regulatoria: el primer envío debe hacerse con el cierre de noviembre.',
        'Permiso de lectura sobre la vista de cartera castigada del data lake (Tecnología).',
      ),
    },
    priorities: [
      {
        actor: 'beto',
        criteria: crit(4, 4, 4, 5, 3, 2, 3, 2),
        justification:
          'Obligatorio por regulación; la disponibilidad de datos es baja mientras no se otorgue el acceso a la vista de cartera castigada.',
      },
    ],
    approval: { actor: 'jefe', decision: 'APROBAR', reason: 'Compromiso regulatorio: se aprueba con prioridad para noviembre.' },
  },
  {
    // EN_TRIAGE (triage Continuar, sin evaluacion)
    key: 'R03',
    actor: 'beto',
    process: 'FIBI',
    body: {
      title: 'Migración de tableros de Qlik a Power BI – fase 1: Finanzas',
      requesterArea: 'Vicepresidencia Financiera',
      requesterName: 'Jorge Iván Pérez',
      functionalOwner: 'Contraloría',
      expectedResult: mark(
        'Migrar a Power BI los 12 tableros de Finanzas que hoy están en Qlik, sin pérdida de funcionalidad, con la misma seguridad por usuario y apagando las licencias de Qlik al finalizar.',
      ),
      targetDate: day('2026-12-18'),
    },
    triage: {
      actor: 'beto',
      body: triageBody(
        'CONTINUAR', 'BI', 'EVOLUCION', 'MEDIA', 'XL', 'SI', 480, 'Beto Lider BI',
        'Antes de priorizar se debe estimar cada tablero por separado y confirmar cuáles siguen en uso.',
      ),
    },
  },
  {
    // BACKLOG_PRIORIZADO · P3 52
    key: 'R04',
    actor: 'beto',
    process: 'FIBI',
    body: {
      title: 'Indicadores de rotación de inventario por bodega',
      requesterArea: 'Logística',
      requesterName: 'Paola Andrea Castro',
      functionalOwner: 'Jefatura de Inventarios',
      expectedResult: mark(
        'Indicadores semanales de rotación, días de inventario y referencias sin movimiento por bodega, con alertas cuando una referencia supere 90 días sin salida.',
      ),
      targetDate: day('2026-11-27'),
    },
    triage: {
      actor: 'beto',
      body: triageBody(
        'CONTINUAR', 'BI', 'DESARROLLO', 'MEDIA', 'M', 'SI', 96, 'Carla Integrante BI',
        'Se puede reutilizar el modelo de inventarios existente en el data lake.',
      ),
    },
    priorities: [
      {
        actor: 'beto',
        criteria: crit(3, 3, 2, 2, 3, 2, 3, 2),
        justification: 'Beneficio operativo moderado; no hay fecha regulatoria ni comercial que lo urja.',
      },
    ],
  },
  {
    // REGISTRADA · caso de borde: titulo y descripcion muy largos
    key: 'R05',
    actor: 'beto',
    process: 'FIBI',
    participants: ['FIID', 'FIAA'],
    body: {
      title: LONG_TITLE_BI,
      requesterArea: 'Gerencia de Planeación y Análisis Estratégico de la Vicepresidencia Comercial y de Mercadeo',
      requesterName: 'Juan Sebastián Montoya Echeverri',
      functionalOwner: 'Comité de Datos Comerciales (Gerencia Comercial, Mercadeo y Finanzas)',
      expectedResult: LONG_RESULT_BI,
      targetDate: day('2026-12-15'),
      referenceUrl:
        'https://intranet.example.com/sites/datos-comerciales/Documentos%20compartidos/Propuestas/2026/modelo-semantico-corporativo-clientes-productos-canales/propuesta-inicial-v3.pdf',
    },
  },
  {
    // REGISTRADA · caso de borde: datos minimos (solo titulo y proceso; la registra una integrante)
    key: 'R06',
    actor: 'carla',
    process: 'FIBI',
    minimal: true,
    body: { title: 'Ajuste de filtros en reporte de recaudo' },
  },
  // --- Integraciones (FIID) -----------------------------------------------
  {
    // LISTA_PARA_LIBERAR (plan PB) · P1 81 · ruta COMPLETA
    key: 'R07',
    actor: 'jefe',
    process: 'FIID',
    participants: ['FIBI'],
    body: {
      title: 'Integración de pedidos del ERP con la plataforma logística',
      requesterArea: 'Operaciones Logísticas',
      requesterName: 'Ricardo Benítez',
      functionalOwner: 'Gerencia de Distribución',
      expectedResult: mark(
        'Los pedidos aprobados en el ERP deben llegar a la plataforma logística en menos de 5 minutos, con confirmación de recepción, reintentos automáticos y una bandeja de errores para el equipo de soporte.',
      ),
      targetDate: day('2026-10-30'),
      initialCommitmentDate: day('2026-10-23'),
      referenceUrl: 'https://intranet.example.com/demanda/integracion-pedidos-logistica',
    },
    triage: {
      actor: 'jefe',
      body: triageBody(
        'CONTINUAR', 'INTEGRACIONES', 'DESARROLLO', 'ALTA', 'L', 'SI', 180, 'Valentina Ríos',
        'Bloquea la operación de la temporada de fin de año si no sale antes de noviembre.',
        'Ambiente de pruebas de la plataforma logística habilitado por el proveedor.',
      ),
    },
    priorities: [
      {
        actor: 'jefe',
        criteria: crit(4, 4, 4, 4, 4, 4, 4, 5),
        justification:
          'Impacto directo en los tiempos de despacho de la temporada alta; se reutiliza el conector de mensajería existente.',
      },
    ],
    approval: { actor: 'jefe', decision: 'APROBAR', reason: 'Aprobado en comité; liberar antes del inicio de la temporada alta.' },
  },
  {
    // CERRADA (plan PC; GC4 y GC5 aprobados) · P2 76 · ruta SIMPLIFICADA
    key: 'R08',
    actor: 'jefe',
    process: 'FIID',
    body: {
      title: 'API de consulta de saldos para el portal de clientes',
      requesterArea: 'Canales Digitales',
      requesterName: 'Natalia Duarte',
      functionalOwner: 'Gerencia de Experiencia del Cliente',
      expectedResult: mark(
        'API REST segura para que el portal de clientes consulte saldos y movimientos de los últimos 90 días, con tiempo de respuesta inferior a 800 ms y autenticación OAuth 2.0.',
      ),
      targetDate: day('2026-10-09'),
      initialCommitmentDate: day('2026-08-14'),
    },
    triage: {
      actor: 'jefe',
      body: triageBody(
        'CONTINUAR', 'INTEGRACIONES', 'DESARROLLO', 'ALTA', 'M', 'SI', 120, 'Valentina Ríos',
        'Se reutiliza la capa de seguridad del portal; el alcance excluye pagos.',
      ),
    },
    priorities: [
      {
        actor: 'jefe',
        criteria: crit(4, 4, 4, 4, 3, 4, 4, 2),
        justification: 'Mejora la autogestión de clientes y reduce las llamadas al centro de contacto.',
      },
    ],
    approval: { actor: 'jefe', decision: 'APROBAR', reason: 'Aprobado con fecha objetivo del 9 de octubre.' },
  },
  {
    // DEVUELTA (triage Devolver)
    key: 'R09',
    actor: 'jefe',
    process: 'FIID',
    body: {
      title: 'Sincronización nocturna del maestro de proveedores',
      requesterArea: 'Compras',
      requesterName: 'Felipe Arango',
      functionalOwner: 'Coordinación de Abastecimiento',
      expectedResult: mark(
        'Sincronizar cada noche el maestro de proveedores entre el ERP y el sistema de compras para evitar duplicados y datos bancarios desactualizados.',
      ),
      targetDate: day('2026-11-13'),
    },
    triage: {
      actor: 'jefe',
      body: triageBody(
        'DEVOLVER', 'INTEGRACIONES', 'EVOLUCION', 'MEDIA', 'S', 'PARCIAL', 40, 'Valentina Ríos',
        'Se devuelve al solicitante: falta definir cuál sistema es la fuente de verdad del maestro y quién aprueba los cambios de datos bancarios.',
      ),
    },
  },
  {
    // BACKLOG_PRIORIZADO + BLOQUEADA (flag) · P2 65 (limite inferior de P2)
    key: 'R10',
    actor: 'jefe',
    process: 'FIID',
    body: {
      title: 'Conector de facturación electrónica con validación previa de la DIAN',
      requesterArea: 'Contabilidad',
      requesterName: 'Diana Marcela Ortiz',
      functionalOwner: 'Jefatura de Impuestos',
      expectedResult: mark(
        'Conector que envíe las facturas al proveedor tecnológico, reciba la validación previa de la DIAN y actualice el estado de cada factura en el ERP, con reproceso de rechazos.',
      ),
      targetDate: day('2026-12-01'),
    },
    triage: {
      actor: 'jefe',
      body: triageBody(
        'CONTINUAR', 'INTEGRACIONES', 'DESARROLLO', 'CRITICA', 'L', 'PARCIAL', 200, 'Valentina Ríos',
        'Cambio normativo con fecha límite; requiere coordinación con el proveedor tecnológico.',
        'Credenciales del ambiente de habilitación del proveedor tecnológico.',
      ),
    },
    priorities: [
      {
        actor: 'jefe',
        criteria: crit(3, 4, 3, 4, 3, 3, 3, 3),
        justification: 'Obligación normativa con fecha cercana, pero con alta dependencia de un tercero.',
      },
    ],
  },
  {
    // RECHAZADA (triage Rechazar)
    key: 'R11',
    actor: 'jefe',
    process: 'FIID',
    body: {
      title: 'Webhook de notificaciones de despacho para clientes corporativos',
      requesterArea: 'Servicio al Cliente',
      requesterName: 'Camilo Restrepo',
      functionalOwner: 'Gerencia de Servicio',
      expectedResult: mark(
        'Notificar automáticamente a los clientes corporativos cada cambio de estado de sus despachos mediante un webhook configurable.',
      ),
      targetDate: day('2026-11-20'),
    },
    triage: {
      actor: 'jefe',
      body: triageBody(
        'RECHAZAR', 'INTEGRACIONES', 'EVOLUCION', 'BAJA', 'S', 'SI', 32, 'Valentina Ríos',
        'Se rechaza: la integración de pedidos con la plataforma logística ya publica los cambios de estado y cubre la necesidad.',
      ),
    },
  },
  // --- IA (FIAA) -----------------------------------------------------------
  {
    // COMPROMETIDA (aprobada, sin plan todavia) · P1 92
    key: 'R12',
    actor: 'diego',
    process: 'FIAA',
    participants: ['FIBI'],
    body: {
      title: 'Modelo de predicción de demanda semanal por SKU',
      requesterArea: 'Planeación de la Demanda',
      requesterName: 'Carolina Vélez',
      functionalOwner: 'Gerencia de Cadena de Abastecimiento',
      expectedResult: mark(
        'Pronóstico semanal de demanda por SKU y bodega con horizonte de 12 semanas y error MAPE menor al 18 %, integrado al proceso de compras.',
      ),
      targetDate: day('2026-12-18'),
      initialCommitmentDate: day('2026-12-18'),
    },
    triage: {
      actor: 'diego',
      body: triageBody(
        'CONTINUAR', 'IA', 'DESARROLLO', 'ALTA', 'L', 'SI', 260, 'Diego Lider IA',
        'Se dispone de tres años de histórico de ventas y quiebres de stock en el data lake.',
      ),
    },
    priorities: [
      {
        actor: 'diego',
        criteria: crit(5, 5, 4, 5, 4, 4, 5, 4),
        justification:
          'Reduce el sobreinventario y los quiebres de stock; datos disponibles y equipo con experiencia en series de tiempo.',
      },
    ],
    approval: { actor: 'jefe', decision: 'APROBAR', reason: 'Aprobado: iniciar la planeación detallada en octubre.' },
  },
  {
    // EN_PLANIFICACION (plan PD devuelto, guia con pendientes) · P2 68 · ruta EXPLORACION
    key: 'R13',
    actor: 'diego',
    process: 'FIAA',
    body: {
      title: 'Prueba de concepto: asistente de consulta de políticas internas con IA generativa',
      requesterArea: 'Talento Humano',
      requesterName: 'Mónica Serna',
      functionalOwner: 'Dirección de Cultura y Bienestar',
      expectedResult: mark(
        'Prototipo de asistente conversacional que responda preguntas de los colaboradores sobre políticas internas citando la fuente, para evaluar exactitud, riesgos y costo antes de decidir una implementación.',
      ),
      targetDate: day('2026-12-18'),
    },
    triage: {
      actor: 'diego',
      body: triageBody(
        'CONTINUAR', 'IA', 'EXPLORACION', 'MEDIA', 'M', 'PARCIAL', 140, 'Diego Lider IA',
        'Exploración: no se autoriza el paso a producción en esta etapa.',
      ),
    },
    priorities: [
      {
        actor: 'diego',
        criteria: crit(4, 3, 3, 3, 4, 3, 3, 4),
        justification: 'Potencial alto de reutilización en otras áreas; existen riesgos de privacidad por evaluar.',
      },
    ],
    approval: { actor: 'jefe', decision: 'APROBAR', reason: 'Aprobada como prueba de concepto con alcance acotado.' },
  },
  {
    // BACKLOG_PRIORIZADO · historial de evaluaciones: P3 45 (limite) -> P3 58
    key: 'R14',
    actor: 'diego',
    process: 'FIAA',
    body: {
      title: 'Clasificación automática de PQRS por tema y urgencia',
      requesterArea: 'Servicio al Cliente',
      requesterName: 'Andrea Lozano',
      functionalOwner: 'Coordinación de PQRS',
      expectedResult: mark(
        'Clasificar automáticamente las PQRS entrantes por tema y nivel de urgencia para enrutarlas al área responsable en menos de una hora.',
      ),
      targetDate: day('2026-12-04'),
    },
    triage: {
      actor: 'diego',
      body: triageBody(
        'CONTINUAR', 'IA', 'DESARROLLO', 'MEDIA', 'M', 'SI', 150, 'Sofía Peña',
        'Se requiere depurar el etiquetado histórico antes de entrenar.',
      ),
    },
    priorities: [
      {
        actor: 'diego',
        criteria: crit(2, 3, 3, 2, 2, 2, 2, 1),
        justification: 'Evaluación inicial: el histórico etiquetado parecía insuficiente.',
      },
      {
        actor: 'diego',
        criteria: crit(3, 3, 3, 3, 3, 3, 2, 3),
        justification:
          'Re-evaluación: se confirmó un histórico etiquetado de 18 meses, lo que mejora la factibilidad.',
      },
    ],
  },
  {
    // BACKLOG_PRIORIZADO · P4 38
    key: 'R15',
    actor: 'diego',
    process: 'FIAA',
    body: {
      title: 'Detección de anomalías en consumos de energía de las sedes',
      requesterArea: 'Infraestructura y Mantenimiento',
      requesterName: 'Hernán Quintero',
      functionalOwner: 'Coordinación de Sostenibilidad',
      expectedResult: mark(
        'Alertas tempranas cuando el consumo de energía de una sede se desvíe del patrón esperado, para programar mantenimiento preventivo.',
      ),
      targetDate: day('2026-12-18'),
    },
    triage: {
      actor: 'diego',
      body: triageBody(
        'CONTINUAR', 'IA', 'EXPLORACION', 'BAJA', 'M', 'PARCIAL', 120, 'Sofía Peña',
        'Solo hay medición horaria en cuatro de las once sedes.',
      ),
    },
    priorities: [
      {
        actor: 'diego',
        criteria: crit(2, 2, 2, 1, 2, 2, 2, 2),
        justification:
          'Beneficio acotado y datos de medición incompletos; se sugiere reformular cuando se instalen los medidores.',
      },
    ],
  },
  {
    // EN_TRIAGE · caso de borde: titulo, descripcion, dependencias y notas muy largos
    key: 'R16',
    actor: 'diego',
    process: 'FIAA',
    body: {
      title: LONG_TITLE_IA,
      requesterArea: 'Mesa de Servicio de Tecnología',
      requesterName: 'Óscar Mauricio Villegas',
      functionalOwner: 'Gerencia de Tecnología y Transformación Digital',
      expectedResult: LONG_RESULT_IA,
      targetDate: day('2026-12-11'),
    },
    triage: {
      actor: 'diego',
      body: triageBody(
        'CONTINUAR', 'IA', 'EXPLORACION', 'MEDIA', 'L', 'PARCIAL', 300, 'Diego Lider IA',
        LONG_TRIAGE_NOTES_IA,
        LONG_TRIAGE_DEPENDENCIES_IA,
      ),
    },
  },
  // --- Coordinacion multiproceso (FMAA) ------------------------------------
  {
    // EN_TRIAGE tras devolucion de la aprobacion · P4 31
    key: 'R17',
    actor: 'jefe',
    process: 'FMAA',
    participants: ['FIBI', 'FIID', 'FIAA'],
    body: {
      title: 'Catálogo corporativo de datos y glosario de negocio',
      requesterArea: 'Oficina de Gobierno de Datos',
      requesterName: 'Luisa Fernanda Mejía',
      functionalOwner: 'Comité de Gobierno de Datos',
      expectedResult: mark(
        'Catálogo con los conjuntos de datos críticos, su dueño, linaje y definiciones de negocio, consultable por todas las áreas.',
      ),
      targetDate: day('2026-12-18'),
    },
    triage: {
      actor: 'jefe',
      body: triageBody(
        'CONTINUAR', 'MULTIPROCESO', 'DESARROLLO', 'MEDIA', 'XL', 'PARCIAL', 400, 'Ana Jefa',
        'Iniciativa transversal: requiere dueños de datos designados por cada vicepresidencia.',
      ),
    },
    priorities: [
      {
        actor: 'jefe',
        criteria: crit(1, 2, 2, 2, 1, 1, 2, 2),
        justification: 'Alcance muy amplio para la capacidad del trimestre; conviene dividirlo en fases.',
      },
    ],
    approval: {
      actor: 'jefe',
      decision: 'DEVOLVER',
      reason:
        'Reformular por fases: la propuesta excede la capacidad del trimestre. Presentar una primera fase acotada a Finanzas.',
    },
  },
  {
    // REGISTRADA · caso de borde: datos minimos
    key: 'R18',
    actor: 'jefe',
    process: 'FMAA',
    minimal: true,
    body: { title: 'Tablero de seguimiento de compromisos del comité' },
  },
  {
    // BACKLOG_PRIORIZADO (cola de aprobacion) · P1 84 · requisito pendiente en GC2
    key: 'R19',
    actor: 'jefe',
    process: 'FMAA',
    participants: ['FIBI', 'FIID', 'FIAA'],
    body: {
      title: 'Gobierno del dato maestro de clientes entre BI, Integraciones e IA',
      requesterArea: 'Vicepresidencia de Operaciones',
      requesterName: 'Gabriel Torres',
      functionalOwner: 'Oficina de Gobierno de Datos',
      expectedResult: mark(
        'Definir y poner en marcha reglas comunes de calidad y unificación del maestro de clientes que consumen los tableros, las integraciones y los modelos analíticos.',
      ),
      targetDate: day('2026-12-11'),
    },
    triage: {
      actor: 'jefe',
      body: triageBody(
        'CONTINUAR', 'MULTIPROCESO', 'EVOLUCION', 'ALTA', 'L', 'PARCIAL', 240, 'Ana Jefa',
        'Depende de que cada área designe un dueño de datos para el maestro de clientes.',
      ),
    },
    priorities: [
      {
        actor: 'jefe',
        criteria: crit(5, 5, 4, 4, 4, 3, 3, 4),
        justification:
          'Las diferencias del maestro de clientes afectan a tres procesos; alto valor de reutilización.',
      },
    ],
  },
];

// --- Planes ----------------------------------------------------------------

const tk = (key, phase, title, responsible, start, end, hours, description, extra = {}) => ({
  key,
  phase,
  title,
  responsible,
  start,
  end,
  hours,
  milestone: false,
  description,
  ...extra,
});
const ms = (key, phase, title, responsible, date, description) => ({
  key,
  phase,
  title,
  responsible,
  start: date,
  end: date,
  hours: 0,
  milestone: true,
  description,
});
/** Camino completo hasta TERMINADA (EN_CURSO -> TERMINADA directo no esta permitido). */
const DONE = [
  ['EN_CURSO', 40],
  ['EN_REVISION', 90],
  ['TERMINADA', 100],
];

/**
 * Planes de 4 solicitudes aprobadas. `statuses` se aplica en orden (respeta el
 * gate de predecesoras: solo se inicia una tarea con todas sus predecesoras
 * TERMINADA y aceptadas).
 */
const PLANS = [
  {
    // R01: plan AUTORIZADO, solicitud EN_EJECUCION, todos los estados de tarea.
    key: 'PA',
    request: 'R01',
    actor: 'beto',
    authorizer: 'jefe',
    body: {
      periodStart: day('2026-09-14'),
      periodEnd: day('2026-12-11'),
      commitmentDate: day('2026-12-11'),
      risks:
        '1. Las reglas de asignación de costos por canal dependen de definiciones de Finanzas que aún no están cerradas.\n2. La extracción desde el ERP compite con el cierre contable mensual por la ventana nocturna.\n3. Las regionales podrían rechazar cifras que no coincidan con sus reportes actuales.',
      mitigations: mark(
        '1. Comité quincenal con Finanzas y escalamiento a la jefatura si una definición supera cinco días hábiles.\n2. Cargas incrementales fuera de la ventana de cierre (después de las 2:00 a. m.).\n3. Tablero de conciliación temporal y sesiones de validación con cada regional.',
      ),
    },
    phases: [
      { key: 'F1', name: 'Levantamiento y diseño', start: '2026-09-14', end: '2026-10-02', deliverable: 'Documento de requerimientos y maqueta funcional aprobados por la Gerencia Comercial.' },
      { key: 'F2', name: 'Modelo de datos e integración', start: '2026-09-28', end: '2026-10-23', deliverable: 'Modelo dimensional de ventas y margen cargado en el data lake.' },
      { key: 'F3', name: 'Construcción del tablero', start: '2026-10-26', end: '2026-11-20', deliverable: 'Tablero publicado en el ambiente de pruebas con seguridad por regional.' },
      { key: 'F4', name: 'Validación y salida a producción', start: '2026-11-23', end: '2026-12-11', deliverable: 'Acta de aceptación firmada y tablero en producción.' },
    ],
    tasks: [
      tk('T1', 'F1', 'Entrevistas con Gerencia Comercial y Finanzas', 'beto', '2026-09-14', '2026-09-18', 16,
        'Sesiones con los gerentes de canal y con Finanzas para levantar indicadores, cortes y frecuencia de actualización.',
        { acceptanceCriteria: 'Lista de indicadores priorizada y validada por la Gerencia Comercial.' }),
      tk('T2', 'F1', 'Maqueta funcional del tablero', 'julian', '2026-09-21', '2026-09-30', 12,
        'Maqueta navegable en Power BI con datos de ejemplo para validar la distribución de páginas y filtros.',
        { acceptanceCriteria: 'Maqueta revisada en sesión con al menos dos gerentes de canal.', evidenceUrl: 'https://repositorio.example.com/bi/tablero-ventas-margen/maqueta-v2.pbix' }),
      ms('T3', 'F1', 'Diseño aprobado por la Gerencia Comercial', 'beto', '2026-10-02',
        'Hito de aprobación formal del diseño funcional y de la maqueta.'),
      tk('T4', 'F2', 'Extracción de ventas y costos desde el ERP', 'mateo', '2026-09-28', '2026-10-09', 32,
        'Carga incremental diaria de facturación y costos estándar desde el ERP hacia la zona cruda del data lake.',
        { acceptanceCriteria: 'Cinco cargas diarias consecutivas sin errores y con totales cuadrados contra el ERP.', process: 'FIID' }),
      tk('T5', 'F2', 'Modelo dimensional de ventas y margen', 'carla', '2026-10-05', '2026-10-23', 40,
        'Dimensiones de cliente, producto, canal y regional; hechos de ventas y costos con medidas de margen y cumplimiento.',
        { acceptanceCriteria: 'Totales de ventas y margen con diferencia menor al 0,5 % frente al cierre contable.' }),
      tk('T6', 'F2', 'Reglas de asignación de costos por canal', 'beto', '2026-10-05', '2026-10-16', 16,
        'Definir con Finanzas cómo se distribuyen los costos logísticos y comerciales entre canales.',
        { acceptanceCriteria: 'Reglas documentadas y aprobadas por Finanzas.' }),
      tk('T7', 'F3', 'Visualizaciones de ventas, margen y presupuesto', 'julian', '2026-10-26', '2026-11-13', 40,
        'Construcción de las páginas ejecutiva, por canal y por regional, con comparativo contra el año anterior.'),
      tk('T8', 'F3', 'Seguridad por fila para regionales', 'carla', '2026-11-03', '2026-11-13', 16,
        'Roles de seguridad para que cada gerente regional vea únicamente su información.'),
      tk('T11', 'F3', 'Gestión de licencias Power BI Premium para regionales', 'jefe', '2026-10-26', '2026-10-30', 4,
        'Solicitar y aprobar las licencias necesarias para publicar el tablero a los gerentes regionales.'),
      tk('T9', 'F4', 'Pruebas de aceptación con usuarios comerciales', 'beto', '2026-11-23', '2026-12-04', 20,
        'Ejecución del plan de pruebas con gerentes de canal y registro de observaciones.',
        { acceptanceCriteria: 'Acta de aceptación sin observaciones bloqueantes.', frameworkPhaseRequired: 'GC4 Liberación' }),
      ms('T10', 'F4', 'Tablero en producción', 'beto', '2026-12-11',
        'Hito de publicación del tablero en el espacio de trabajo productivo.'),
    ],
    deps: [
      ['T2', 'T1'],
      ['T3', 'T2'],
      ['T4', 'T1'],
      ['T5', 'T3'],
      ['T6', 'T3'],
      ['T7', 'T5'],
      ['T8', 'T5'],
      ['T9', 'T7'],
      ['T9', 'T8'],
      ['T10', 'T9'],
    ],
    submit: true,
    authorize: true,
    statuses: [
      { task: 'T1', actor: 'beto', path: DONE, accept: 'beto' },
      { task: 'T2', actor: 'beto', path: DONE, accept: 'beto' },
      { task: 'T3', actor: 'beto', path: DONE, accept: 'beto' },
      { task: 'T4', actor: 'beto', path: [['EN_CURSO', 50], ['EN_REVISION', 90]] },
      { task: 'T5', actor: 'carla', path: [['EN_CURSO', 45]] },
      { task: 'T6', actor: 'beto', path: [['EN_CURSO', 20], ['BLOQUEADA', 20]] },
    ],
  },
  {
    // R07: plan AUTORIZADO; la solicitud se lleva luego a LISTA_PARA_LIBERAR.
    key: 'PB',
    request: 'R07',
    actor: 'jefe',
    authorizer: 'jefe',
    body: {
      periodStart: day('2026-09-07'),
      periodEnd: day('2026-10-30'),
      commitmentDate: day('2026-10-23'),
      risks:
        '1. El proveedor de la plataforma logística puede cambiar el contrato de su API durante el proyecto.\n2. El volumen de pedidos de la temporada alta puede triplicar el promedio diario.',
      mitigations: mark(
        '1. Contrato OpenAPI versionado y pruebas de contrato automatizadas.\n2. Prueba de rendimiento con volumen de temporada antes de liberar.',
      ),
    },
    phases: [
      { key: 'F1', name: 'Análisis y diseño de la integración', start: '2026-09-07', end: '2026-09-18', deliverable: 'Mapeo de campos y contrato OpenAPI aprobados.' },
      { key: 'F2', name: 'Desarrollo de servicios', start: '2026-09-21', end: '2026-10-09', deliverable: 'Servicios de publicación de pedidos y manejo de errores desplegados en pruebas.' },
      { key: 'F3', name: 'Pruebas integrales', start: '2026-10-05', end: '2026-10-16', deliverable: 'Actas de pruebas funcionales, de integración y de rendimiento.' },
      { key: 'F4', name: 'Despliegue y estabilización', start: '2026-10-19', end: '2026-10-30', deliverable: 'Integración en producción con monitoreo y soporte definidos.' },
    ],
    tasks: [
      tk('T1', 'F1', 'Mapeo de campos del pedido entre el ERP y la plataforma logística', 'valentina', '2026-09-07', '2026-09-11', 12,
        'Correspondencia de campos, catálogos y reglas de transformación del pedido.'),
      tk('T2', 'F1', 'Diseño del contrato OpenAPI de pedidos', 'mateo', '2026-09-14', '2026-09-18', 10,
        'Definición del contrato de publicación y confirmación de pedidos, con códigos de error.'),
      tk('T3', 'F2', 'Servicio de publicación de pedidos', 'mateo', '2026-09-21', '2026-10-02', 36,
        'Servicio que toma los pedidos aprobados del ERP y los publica en la plataforma logística.',
        { acceptanceCriteria: 'Pedidos publicados en menos de 5 minutos en el ambiente de pruebas.' }),
      tk('T4', 'F2', 'Manejo de reintentos y bandeja de errores', 'valentina', '2026-09-28', '2026-10-09', 24,
        'Reintentos con espera exponencial y bandeja de errores para el equipo de soporte.'),
      tk('T5', 'F3', 'Pruebas integrales con la plataforma logística', 'mateo', '2026-10-05', '2026-10-09', 20,
        'Ejecución de los casos de prueba de punta a punta con el proveedor.',
        { acceptanceCriteria: 'Todos los casos críticos aprobados.', frameworkPhaseRequired: 'GC4 Liberación' }),
      tk('T6', 'F3', 'Pruebas de rendimiento con volumen de temporada', 'valentina', '2026-10-07', '2026-10-14', 12,
        'Prueba con 48.000 pedidos por hora para simular la temporada alta.'),
      tk('T7', 'F4', 'Manual de operación y monitoreo', 'valentina', '2026-10-19', '2026-10-23', 8,
        'Procedimiento de operación, alertas y escalamiento para la mesa de servicio.'),
      ms('T8', 'F4', 'Salida a producción', 'valentina', '2026-10-26',
        'Hito de puesta en producción de la integración.'),
    ],
    deps: [
      ['T2', 'T1'],
      ['T3', 'T2'],
      ['T4', 'T3'],
      ['T5', 'T3'],
      ['T6', 'T4'],
      ['T7', 'T4'],
      ['T8', 'T5'],
      ['T8', 'T6'],
    ],
    submit: true,
    authorize: true,
    statuses: [
      { task: 'T1', actor: 'jefe', path: DONE, accept: 'jefe' },
      { task: 'T2', actor: 'jefe', path: DONE, accept: 'jefe' },
      { task: 'T3', actor: 'jefe', path: DONE, accept: 'jefe' },
      { task: 'T4', actor: 'jefe', path: DONE, accept: 'jefe' },
      // Terminada pero pendiente de aceptacion: deja bloqueado el inicio del hito.
      { task: 'T5', actor: 'jefe', path: DONE },
      { task: 'T6', actor: 'jefe', path: [['EN_CURSO', 60], ['EN_REVISION', 90]] },
      { task: 'T7', actor: 'jefe', path: [['EN_CURSO', 30]] },
    ],
  },
  {
    // R08: plan AUTORIZADO y todas las tareas terminadas y aceptadas (se cierra por GC5).
    key: 'PC',
    request: 'R08',
    actor: 'jefe',
    authorizer: 'jefe',
    body: {
      periodStart: day('2026-08-17'),
      periodEnd: day('2026-10-13'),
      commitmentDate: day('2026-10-09'),
      risks: '1. La consulta de movimientos puede degradar la base transaccional en horas pico.',
      mitigations: mark('1. Réplica de lectura dedicada y caché de 60 segundos para los saldos.'),
    },
    phases: [
      { key: 'F1', name: 'Diseño', start: '2026-08-17', end: '2026-08-28', deliverable: 'Contrato de la API y modelo de seguridad aprobados.' },
      { key: 'F2', name: 'Construcción y pruebas', start: '2026-08-31', end: '2026-09-25', deliverable: 'API desplegada en pruebas con pruebas funcionales y de seguridad aprobadas.' },
      { key: 'F3', name: 'Liberación y estabilización', start: '2026-09-28', end: '2026-10-13', deliverable: 'API en producción, estabilizada y transferida a la mesa de servicio.' },
    ],
    tasks: [
      tk('T1', 'F1', 'Diseño de endpoints y modelo de seguridad', 'valentina', '2026-08-17', '2026-08-21', 12,
        'Diseño de recursos, paginación y autenticación OAuth 2.0 con el equipo del portal.'),
      tk('T2', 'F2', 'Desarrollo de la API de saldos y movimientos', 'mateo', '2026-08-31', '2026-09-11', 40,
        'Implementación de los endpoints de saldos y movimientos sobre la réplica de lectura.'),
      tk('T3', 'F2', 'Pruebas de seguridad y control de acceso', 'valentina', '2026-09-14', '2026-09-18', 12,
        'Pruebas de autorización por cliente, expiración de tokens y limitación de peticiones.'),
      tk('T4', 'F2', 'Pruebas funcionales con el equipo del portal', 'mateo', '2026-09-21', '2026-09-25', 12,
        'Validación de los casos de uso del portal con datos de clientes de prueba.'),
      ms('T5', 'F3', 'API publicada en producción', 'valentina', '2026-10-02',
        'Hito de publicación de la API para el portal de clientes.'),
      tk('T6', 'F3', 'Acompañamiento post-salida y transferencia a soporte', 'mateo', '2026-10-05', '2026-10-09', 8,
        'Monitoreo de errores y tiempos de respuesta durante la primera semana y entrega a la mesa de servicio.'),
      ms('T7', 'F3', 'Cierre de estabilización', 'valentina', '2026-10-13',
        'Hito de cierre del periodo de estabilización con indicadores dentro de la meta.'),
    ],
    deps: [
      ['T2', 'T1'],
      ['T3', 'T2'],
      ['T4', 'T2'],
      ['T5', 'T3'],
      ['T5', 'T4'],
      ['T6', 'T5'],
      ['T7', 'T6'],
    ],
    submit: true,
    authorize: true,
    statuses: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map((task) => ({
      task,
      actor: 'jefe',
      path: DONE,
      accept: 'jefe',
    })),
  },
  {
    // R13: plan enviado y DEVUELTO con motivo; luego se agregan piezas incompletas
    // para que la guia de pendientes muestre items (fase sin fechas, tareas sin
    // responsable o sin fechas).
    key: 'PD',
    request: 'R13',
    actor: 'diego',
    body: {
      periodStart: day('2026-10-19'),
      periodEnd: day('2026-12-18'),
      commitmentDate: day('2026-12-11'),
      risks:
        '1. Exposición de información sensible de colaboradores en las preguntas al asistente.\n2. Respuestas inexactas que se interpreten como posición oficial de la compañía.',
      mitigations: mark(
        '1. Corpus anonimizado y registro de conversaciones sin datos personales.\n2. Respuestas siempre con cita de la política fuente y aviso de prototipo.',
      ),
    },
    phases: [
      { key: 'F1', name: 'Preparación del corpus documental', start: '2026-10-19', end: '2026-10-30', deliverable: 'Corpus de políticas vigentes anonimizado y versionado.' },
      { key: 'F2', name: 'Construcción del prototipo', start: '2026-11-03', end: '2026-11-27', deliverable: 'Prototipo funcional con búsqueda semántica y respuestas citadas.' },
    ],
    tasks: [
      tk('T1', 'F1', 'Inventario de políticas y normativas vigentes', 'sofia', '2026-10-19', '2026-10-23', 16,
        'Recopilar con Talento Humano las políticas vigentes y sus responsables.'),
      tk('T2', 'F1', 'Anonimización y limpieza del corpus', 'sofia', '2026-10-26', '2026-10-30', 24,
        'Eliminar datos personales y versiones obsoletas de los documentos.'),
      tk('T3', 'F2', 'Indexación semántica de documentos', 'diego', '2026-11-03', '2026-11-13', 32,
        'Fragmentación, embeddings e índice vectorial del corpus.'),
      ms('T7', 'F2', 'Demostración al comité de innovación', 'diego', '2026-11-27',
        'Hito de demostración del prototipo al comité de innovación.'),
    ],
    deps: [
      ['T2', 'T1'],
      ['T3', 'T2'],
      ['T7', 'T3'],
    ],
    submit: true,
    returnWith: {
      actor: 'jefe',
      reason:
        'Falta incluir la evaluación con usuarios piloto y la revisión de riesgos de privacidad con Jurídica antes de autorizar.',
    },
    afterReturn: {
      phases: [
        { key: 'F3', name: 'Evaluación con usuarios piloto', deliverable: 'Informe de exactitud, satisfacción y costos del prototipo.' },
      ],
      tasks: [
        tk('T4', 'F2', 'Prototipo de interfaz conversacional', null, '2026-11-09', '2026-11-20', 32,
          'Interfaz web de chat con citas a la política fuente y aviso de prototipo.'),
        tk('T5', 'F3', 'Pruebas de exactitud de respuestas', 'sofia', null, null, 20,
          'Batería de 150 preguntas frecuentes con respuesta esperada validada por Talento Humano.'),
        tk('T6', 'F3', 'Encuesta de satisfacción con usuarios piloto', null, null, null, 8,
          'Encuesta corta a los 30 colaboradores del piloto.'),
      ],
      deps: [
        ['T4', 'T3'],
        ['T5', 'T4'],
      ],
    },
    statuses: [],
  },
];

// --- Activos y documentos ----------------------------------------------------

const ASSETS = [
  {
    key: 'A01', actor: 'beto', process: 'FIBI', request: 'R01', owner: 'beto',
    body: {
      name: 'Tablero ejecutivo de ventas y margen',
      typeCode: 'DASHBOARD', technologyCode: 'POWER_BI', sourceCode: 'DATA_LAKE', frequencyCode: 'DIARIA',
      documentationRef: 'https://repositorio.example.com/bi/tablero-ventas-margen',
      functionalDescription: mark('Tablero ejecutivo con ventas, margen bruto y cumplimiento de presupuesto por canal, regional y línea de producto.'),
      dependencies: 'Modelo dimensional de ventas (data mart comercial); licencias Power BI Premium.',
    },
  },
  {
    // Propuesto por una integrante en borrador; lo activa el lider.
    key: 'A02', actor: 'carla', process: 'FIBI', request: 'R01', owner: 'carla',
    body: {
      name: 'Modelo dimensional de ventas (data mart comercial)',
      typeCode: 'MODELO_DATOS', technologyCode: 'SQL', sourceCode: 'BASE_DATOS', frequencyCode: 'DIARIA',
      functionalDescription: mark('Modelo estrella con dimensiones de cliente, producto, canal, regional y tiempo, y hechos de ventas y costos.'),
      dependencies: 'Extracción incremental de ventas y costos desde el ERP.',
    },
  },
  {
    key: 'A03', actor: 'beto', process: 'FIBI', owner: 'julian',
    body: {
      name: 'Reporte de recaudo diario',
      typeCode: 'REPORTE', technologyCode: 'QLIK', sourceCode: 'BASE_DATOS', frequencyCode: 'DIARIA',
      functionalDescription: mark('Reporte diario de recaudo por banco, canal de pago y regional para Tesorería.'),
    },
  },
  {
    key: 'A04', actor: 'beto', process: 'FIBI', owner: 'beto',
    body: {
      name: 'Tablero de cartera (Qlik) – versión 2019',
      typeCode: 'DASHBOARD', technologyCode: 'QLIK', sourceCode: 'BASE_DATOS', frequencyCode: 'SEMANAL',
      functionalDescription: mark('Tablero histórico de cartera por edades de mora, usado por Riesgo de Crédito hasta 2026.'),
    },
  },
  {
    key: 'A05', actor: 'jefe', process: 'FIID', request: 'R07', owner: 'valentina',
    body: {
      name: 'Integración de pedidos ERP – plataforma logística',
      typeCode: 'INTEGRACION', technologyCode: 'AWS', sourceCode: 'APLICACION', frequencyCode: 'TIEMPO_REAL',
      documentationRef: 'https://repositorio.example.com/integraciones/pedidos-logistica',
      functionalDescription: mark('Servicio que publica los pedidos aprobados del ERP en la plataforma logística, con reintentos y bandeja de errores.'),
      dependencies: 'Cola de mensajería corporativa; API de la plataforma logística v2.',
    },
  },
  {
    key: 'A06', actor: 'jefe', process: 'FIID', request: 'R08', owner: 'mateo',
    body: {
      name: 'API de saldos para el portal de clientes',
      typeCode: 'API', technologyCode: 'AWS', sourceCode: 'BASE_DATOS', frequencyCode: 'TIEMPO_REAL',
      documentationRef: 'https://repositorio.example.com/integraciones/api-saldos',
      functionalDescription: mark('API REST de consulta de saldos y movimientos de los últimos 90 días para el portal de clientes.'),
      dependencies: 'Réplica de lectura de la base transaccional; servidor de autorización OAuth 2.0.',
    },
  },
  {
    key: 'A07', actor: 'jefe', process: 'FIID', owner: 'mateo',
    body: {
      name: 'Pipeline de ingesta de facturación al data lake',
      typeCode: 'PIPELINE', technologyCode: 'TALEND', sourceCode: 'APLICACION', frequencyCode: 'CADA_HORA',
      functionalDescription: mark('Pipeline que copia cada hora la facturación del ERP a la zona cruda del data lake.'),
    },
  },
  {
    key: 'A08', actor: 'diego', process: 'FIAA', request: 'R12', owner: 'diego',
    body: {
      name: 'Modelo de pronóstico de demanda por SKU',
      typeCode: 'MODELO_IA', technologyCode: 'PYTHON', sourceCode: 'DATA_LAKE', frequencyCode: 'SEMANAL',
      functionalDescription: mark('Modelo de gradiente que pronostica la demanda semanal por SKU y bodega con horizonte de 12 semanas.'),
    },
  },
  {
    key: 'A09', actor: 'diego', process: 'FIAA', request: 'R13', owner: 'sofia',
    body: {
      name: 'Asistente de políticas internas (prototipo)',
      typeCode: 'AGENTE', technologyCode: 'PYTHON', sourceCode: 'ARCHIVO', frequencyCode: 'BAJO_DEMANDA',
      functionalDescription: mark('Prototipo de asistente conversacional que responde preguntas sobre políticas internas citando la fuente.'),
    },
  },
  {
    key: 'A10', actor: 'diego', process: 'FIAA', owner: 'sofia',
    body: {
      name: 'Dataset histórico de PQRS etiquetadas',
      typeCode: 'BASE_DATOS', technologyCode: 'SQL', sourceCode: 'APLICACION', frequencyCode: 'MENSUAL',
      functionalDescription: mark('Conjunto de 18 meses de PQRS con tema, urgencia y área responsable, usado para entrenar clasificadores.'),
    },
  },
  {
    key: 'A11', actor: 'jefe', process: 'FMAA', request: 'R17', owner: 'jefe',
    body: {
      name: 'Glosario de negocio – versión preliminar',
      typeCode: 'OTRO', sourceCode: 'ARCHIVO', frequencyCode: 'BAJO_DEMANDA',
      functionalDescription: mark('Primera versión del glosario con 40 términos de negocio priorizados por el comité de datos.'),
    },
  },
];

const DOC_D1_V1 = `# Manual de usuario – Tablero ejecutivo de ventas y margen

## Propósito
Consultar en un solo lugar las ventas, el margen bruto y el cumplimiento de presupuesto por canal, regional y línea de producto.

## Páginas del tablero
1. **Resumen ejecutivo**: indicadores del mes, acumulado del año y comparativo contra el año anterior.
2. **Canales**: comparación entre canal tradicional, moderno y digital.
3. **Regionales**: detalle por regional; cada gerente ve solo su información.

## Actualización de los datos
Los datos se actualizan a diario antes de las 7:00 a. m. con el cierre del día anterior.`;

const DOC_D1_V2 = `${DOC_D1_V1}

## Filtros disponibles
- Periodo (mes o rango de fechas).
- Canal, regional y línea de producto.
- Cliente (solo en la página de detalle).

## Preguntas frecuentes
**¿Por qué el margen de hoy no coincide con contabilidad?** El cierre contable se refleja a partir del quinto día hábil de cada mes; antes de esa fecha el margen es preliminar.`;

const DOC_D2_V1 = `# Diccionario de datos – Data mart comercial

| Tabla | Campo | Descripción |
|---|---|---|
| dim_cliente | id_cliente | Identificador único del cliente en el ERP. |
| dim_cliente | segmento | Segmento comercial (hogar, empresa, gobierno). |
| dim_producto | sku | Código de la referencia. |
| fact_ventas | valor_neto | Venta neta después de descuentos, en pesos colombianos. |`;

const DOC_D2_V2 = `${DOC_D2_V1}
| dim_canal | canal | Canal de venta: tradicional, moderno o digital. |
| fact_ventas | costo_estandar | Costo estándar de la referencia al momento de la venta. |
| fact_ventas | margen_bruto | valor_neto menos costo_estandar. |`;

const DOC_D2_V3 = `${DOC_D2_V2}

## Reglas de calidad
- Toda factura debe tener canal asignado; las que no lo tienen se reportan en la bandeja de calidad.
- El margen bruto no puede superar el 95 % de la venta neta; si ocurre, se revisa el costo estándar.
- Los totales diarios deben cuadrar con el ERP con una diferencia menor al 0,5 %.`;

const DOC_D3_V1 = `# Acta de pruebas de aceptación – Integración de pedidos

**Ambiente:** pruebas · **Fecha:** 9 de octubre de 2026 · **Versión probada:** 1.4.0

| Caso | Descripción | Resultado |
|---|---|---|
| CP-01 | Pedido estándar de 10 líneas | Aprobado |
| CP-02 | Pedido con 500 líneas | Aprobado |
| CP-03 | Pedido con dirección incompleta | Aprobado (queda en la bandeja de errores) |
| CP-04 | Reintento tras caída de la plataforma | Aprobado |`;

const DOC_D3_V2 = `${DOC_D3_V1}

## Observaciones
- El mensaje de error del caso CP-03 debe mostrarse en español al usuario de bodega.
- Se recomienda monitorear la bandeja de errores durante la primera semana.

## Aprobación
Aprobado con observaciones por Ricardo Benítez (Operaciones Logísticas) y Valentina Ríos (Integraciones).`;

const DOC_D4_V1 = `# Runbook de operación – API de saldos

## Monitoreo
- Tiempo de respuesta p95 menor a 800 ms (alerta a partir de 1.200 ms).
- Tasa de errores 5xx menor al 0,5 % en ventanas de 15 minutos.

## Procedimientos
1. **Reinicio controlado**: drenar el tráfico del nodo y reiniciar el servicio.
2. **Caché de saldos**: si la réplica se atrasa más de 2 minutos, ampliar la caché a 5 minutos.`;

const DOC_D4_V2 = `${DOC_D4_V1}

## Escalamiento
| Nivel | Responsable | Tiempo de respuesta |
|---|---|---|
| 1 | Mesa de servicio | 15 minutos |
| 2 | Equipo de Integraciones | 1 hora |
| 3 | Proveedor de nube | 4 horas |`;

const DOC_D5_V1 = `# Ficha técnica – Modelo de pronóstico de demanda por SKU

- **Objetivo:** pronóstico semanal por SKU y bodega con horizonte de 12 semanas.
- **Algoritmo candidato:** gradiente potenciado con variables de calendario, precio y promociones.
- **Línea base:** modelo ETS por familia de producto (MAPE 24 %).
- **Meta:** MAPE menor al 18 % en el conjunto de validación de 2026.

## Datos de entrada
Ventas diarias de 2023 a 2026, quiebres de stock, calendario de promociones y festivos de Colombia.`;

const DOC_D6_V1 = `# Procedimiento de soporte – Tablero de cartera (Qlik)

1. Verificar que la recarga nocturna haya terminado antes de las 6:00 a. m.
2. Si la recarga falla, reprocesar desde la consola de Qlik con el usuario de servicio.
3. Informar a Riesgo de Crédito si el reproceso supera una hora.`;

const DOC_D6_V2 = `${DOC_D6_V1}
4. Registrar la novedad en el portal con el tipo «Incidente».

> Este procedimiento quedará sin uso cuando el tablero se reemplace por la versión en Power BI.`;

const DOC_D7_V1 = `# Informe de hallazgos preliminares – Prueba de concepto del asistente de políticas

## Hallazgos iniciales
- El 30 % de las políticas tiene más de una versión vigente publicada en la intranet.
- Las preguntas más frecuentes de los colaboradores son sobre vacaciones, teletrabajo y auxilios educativos.

## Próximos pasos
- Obtener el concepto de Jurídica sobre el uso de documentos internos.
- Definir con Talento Humano el grupo de 30 colaboradores del piloto.`;

const DOCUMENTS = [
  { key: 'D1', asset: 'A01', title: 'Manual de usuario del tablero ejecutivo de ventas', categoryCode: 'FUNCIONAL', versions: [DOC_D1_V1, DOC_D1_V2] },
  { key: 'D2', asset: 'A02', title: 'Diccionario de datos del data mart comercial', categoryCode: 'TECNICA', versions: [DOC_D2_V1, DOC_D2_V2, DOC_D2_V3] },
  { key: 'D3', asset: 'A05', title: 'Acta de pruebas de aceptación – integración de pedidos', categoryCode: 'FUNCIONAL', versions: [DOC_D3_V1, DOC_D3_V2] },
  { key: 'D4', asset: 'A06', title: 'Runbook de operación de la API de saldos', categoryCode: 'OPERATIVA', versions: [DOC_D4_V1, DOC_D4_V2] },
  { key: 'D5', asset: 'A08', title: 'Ficha técnica del modelo de pronóstico de demanda', categoryCode: 'TECNICA', versions: [DOC_D5_V1] },
  { key: 'D6', asset: 'A04', title: 'Procedimiento de soporte del tablero de cartera (Qlik)', categoryCode: 'OPERATIVA', versions: [DOC_D6_V1, DOC_D6_V2] },
  { key: 'D7', asset: 'A09', title: 'Informe de hallazgos preliminares de la prueba de concepto', categoryCode: 'OTRO', versions: [DOC_D7_V1] },
];

/**
 * Orden de los pasos de activos/documentos (respeta permisos: la integrante solo
 * propone en BORRADOR; el estado lo mueve el lider o el jefe).
 * ['asset', A] | ['doc', D, version, actor] | ['assetStatus', A, estado, actor, motivo]
 * | ['docStatus', D, estado, actor, motivo]
 */
const KNOWLEDGE_STEPS = [
  ['asset', 'A01'],
  ['doc', 'D1', 1, 'beto'],
  ['doc', 'D1', 2, 'beto'],
  ['asset', 'A02'],
  ['doc', 'D2', 1, 'carla'],
  ['assetStatus', 'A02', 'ACTIVO', 'beto', 'Modelo validado en pruebas; se habilita para el consumo de los tableros.'],
  ['doc', 'D2', 2, 'beto'],
  ['doc', 'D2', 3, 'beto'],
  ['docStatus', 'D2', 'VIGENTE', 'beto', 'Diccionario revisado con el equipo de BI.'],
  ['asset', 'A03'],
  ['assetStatus', 'A03', 'ACTIVO', 'beto', 'Activo en operación desde 2023.'],
  ['asset', 'A04'],
  ['assetStatus', 'A04', 'ACTIVO', 'beto', 'Registro del activo histórico de cartera.'],
  ['doc', 'D6', 1, 'beto'],
  ['doc', 'D6', 2, 'beto'],
  ['docStatus', 'D6', 'VIGENTE', 'beto', 'Procedimiento aprobado por Riesgo de Crédito.'],
  ['assetStatus', 'A04', 'RETIRADO', 'beto', 'Reemplazado por el tablero de cartera en Power BI; se conserva solo para consulta histórica.'],
  ['docStatus', 'D6', 'ARCHIVADA', 'beto', 'El activo fue retirado.'],
  ['asset', 'A05'],
  ['assetStatus', 'A05', 'ACTIVO', 'jefe', 'Desplegado en pruebas y en preparación para producción.'],
  ['doc', 'D3', 1, 'jefe'],
  ['doc', 'D3', 2, 'jefe'],
  ['docStatus', 'D3', 'VIGENTE', 'jefe', 'Acta firmada por Operaciones Logísticas.'],
  ['asset', 'A06'],
  ['assetStatus', 'A06', 'ACTIVO', 'jefe', 'En producción desde el 2 de octubre de 2026.'],
  ['doc', 'D4', 1, 'jefe'],
  ['doc', 'D4', 2, 'jefe'],
  ['docStatus', 'D4', 'VIGENTE', 'jefe', 'Runbook validado por la mesa de servicio.'],
  ['asset', 'A07'],
  ['assetStatus', 'A07', 'ACTIVO', 'jefe', 'Pipeline en operación.'],
  ['asset', 'A08'],
  ['doc', 'D5', 1, 'diego'],
  ['asset', 'A09'],
  ['doc', 'D7', 1, 'diego'],
  ['asset', 'A10'],
  ['assetStatus', 'A10', 'ACTIVO', 'diego', 'Dataset depurado y aprobado por la Coordinación de PQRS.'],
  ['asset', 'A11'],
];

// --- Capacidad -----------------------------------------------------------------

/**
 * Disponibilidad mensual. Se omite a proposito:
 * - Julian en octubre (SIN_DISPONIBILIDAD en octubre, con horas planificadas);
 * - Ana en noviembre (SIN_DISPONIBILIDAD en noviembre, con asignacion).
 * Beto (oct/nov) y Carla (nov) ya tienen disponibilidad preexistente: no se toca.
 */
const AVAILABILITY = [
  ['jefe', '2026-10', 80],
  ['jefe', '2026-12', 64],
  ['beto', '2026-12', 120],
  ['carla', '2026-10', 152],
  ['carla', '2026-12', 120],
  ['diego', '2026-10', 140],
  ['diego', '2026-11', 144],
  ['diego', '2026-12', 112],
  ['valentina', '2026-10', 152],
  ['valentina', '2026-11', 96],
  ['valentina', '2026-12', 120],
  ['mateo', '2026-10', 120],
  ['mateo', '2026-11', 152],
  ['mateo', '2026-12', 120],
  ['sofia', '2026-10', 32],
  ['sofia', '2026-11', 144],
  ['sofia', '2026-12', 100],
  ['julian', '2026-11', 160],
  ['julian', '2026-12', 128],
];

/**
 * Asignaciones manuales [creador, persona, mes, proceso, solicitud|null, horas, descripcion].
 * Octubre: Mateo 130 h > 120 h disponibles (SOBRECARGA); Sofia 32 h = 32 h
 * disponibles con 40 h planificadas (planificado > disponible).
 * Noviembre: Valentina 100 h > 96 h (SOBRECARGA).
 */
const ASSIGNMENTS = [
  ['jefe', 'jefe', '2026-10', 'FMAA', null, 24, 'Comité de demanda, seguimiento de capacidad y reuniones con líderes.'],
  ['jefe', 'jefe', '2026-10', 'FMAA', 'R19', 16, 'Coordinación de la definición de dueños de datos del maestro de clientes.'],
  ['beto', 'beto', '2026-10', 'FIBI', 'R01', 40, 'Levantamiento de reglas de costos y seguimiento semanal del tablero.'],
  ['beto', 'beto', '2026-10', 'FIBI', 'R02', 16, 'Revisión del formato regulatorio y gestión del acceso a la vista de cartera.'],
  ['beto', 'carla', '2026-10', 'FIBI', 'R01', 60, 'Construcción del modelo dimensional de ventas y margen.'],
  ['beto', 'mateo', '2026-10', 'FIBI', 'R01', 40, 'Extracción incremental de ventas y costos desde el ERP.'],
  ['jefe', 'mateo', '2026-10', 'FIID', 'R07', 60, 'Pruebas integrales y ajustes del servicio de publicación de pedidos.'],
  ['jefe', 'mateo', '2026-10', 'FIID', 'R08', 30, 'Acompañamiento post-salida de la API de saldos.'],
  ['jefe', 'valentina', '2026-10', 'FIID', 'R07', 80, 'Coordinación técnica, pruebas de rendimiento y manual de operación.'],
  ['jefe', 'valentina', '2026-10', 'FIID', 'R08', 24, 'Cierre de estabilización y transferencia a la mesa de servicio.'],
  ['jefe', 'valentina', '2026-10', 'FIID', 'R10', 16, 'Gestión de credenciales y diseño preliminar con el proveedor tecnológico.'],
  ['diego', 'diego', '2026-10', 'FIAA', 'R12', 40, 'Exploración de datos y modelos base del pronóstico.'],
  ['diego', 'diego', '2026-10', 'FIAA', 'R13', 30, 'Alcance de la prueba de concepto y revisión con Jurídica.'],
  ['jefe', 'diego', '2026-10', 'FMAA', 'R19', 16, 'Participación en las mesas de reglas del maestro de clientes.'],
  ['diego', 'sofia', '2026-10', 'FIAA', 'R13', 24, 'Inventario y anonimización del corpus de políticas.'],
  ['diego', 'sofia', '2026-10', 'FIAA', 'R14', 8, 'Depuración del etiquetado histórico de PQRS.'],
  ['jefe', 'jefe', '2026-11', 'FMAA', 'R19', 24, 'Seguimiento de las reglas de calidad del maestro de clientes.'],
  ['beto', 'beto', '2026-11', 'FIBI', 'R01', 40, 'Pruebas de aceptación y coordinación con las regionales.'],
  ['beto', 'julian', '2026-11', 'FIBI', 'R01', 120, 'Construcción de las visualizaciones del tablero.'],
  ['beto', 'mateo', '2026-11', 'FIBI', 'R01', 60, 'Ajustes de la extracción y soporte a la seguridad por fila.'],
  ['jefe', 'mateo', '2026-11', 'FIID', 'R07', 40, 'Soporte a la salida a producción de la integración de pedidos.'],
  ['jefe', 'valentina', '2026-11', 'FIID', 'R07', 40, 'Estabilización de la integración de pedidos.'],
  ['jefe', 'valentina', '2026-11', 'FIID', 'R10', 60, 'Desarrollo del conector de facturación electrónica.'],
  ['diego', 'diego', '2026-11', 'FIAA', 'R12', 60, 'Entrenamiento y validación del modelo de pronóstico.'],
  ['diego', 'diego', '2026-11', 'FIAA', 'R13', 60, 'Construcción del prototipo del asistente de políticas.'],
  ['diego', 'sofia', '2026-11', 'FIAA', 'R13', 100, 'Pruebas de exactitud y evaluación con usuarios piloto.'],
  ['jefe', 'jefe', '2026-12', 'FMAA', null, 24, 'Cierre anual del portafolio y planeación 2027.'],
  ['beto', 'beto', '2026-12', 'FIBI', 'R01', 30, 'Salida a producción del tablero y transferencia a soporte.'],
  ['beto', 'carla', '2026-12', 'FIBI', 'R01', 40, 'Ajustes posteriores a las pruebas de aceptación.'],
  ['beto', 'julian', '2026-12', 'FIBI', 'R01', 60, 'Correcciones de las pruebas de aceptación.'],
  ['jefe', 'mateo', '2026-12', 'FIID', 'R10', 40, 'Pruebas del conector con el ambiente de habilitación.'],
  ['jefe', 'valentina', '2026-12', 'FIID', 'R10', 60, 'Coordinación de pruebas con el proveedor tecnológico.'],
  ['diego', 'diego', '2026-12', 'FIAA', 'R12', 80, 'Integración del pronóstico con el proceso de compras.'],
  ['diego', 'sofia', '2026-12', 'FIAA', 'R13', 60, 'Informe final de la prueba de concepto.'],
];

// --- Novedades, reuniones y compromisos -------------------------------------------

/** `transitions`: estados destino en orden (estado inicial del backend: EN_CURSO). */
const ISSUES = [
  {
    key: 'I1', actor: 'beto', process: 'FIBI', date: '2026-10-07', typeCode: 'BLOQUEO',
    title: 'Reglas de asignación de costos por canal sin definir',
    request: 'R01', task: 'PA.T6', resolver: 'beto', targetDate: '2026-10-16',
    detail: 'Finanzas no ha entregado las reglas para distribuir los costos logísticos y comerciales entre canales.',
    impact: 'Retrasa el inicio de las visualizaciones de margen previsto para el 26 de octubre.',
    transitions: [],
  },
  {
    key: 'I2', actor: 'carla', process: 'FIBI', date: '2026-10-09', typeCode: 'CALIDAD_DATOS',
    title: 'Diferencias de margen en la regional Antioquia frente al cierre contable',
    request: 'R01', task: 'PA.T4', resolver: 'mateo', targetDate: '2026-10-14',
    detail: 'La prueba de regresión muestra una diferencia de 2,3 % en el margen de la regional Antioquia para septiembre.',
    impact: 'Impide aprobar la validación de regresión del tablero.',
    transitions: ['BLOQUEADO'],
  },
  {
    key: 'I3', actor: 'jefe', process: 'FIID', date: '2026-10-06', typeCode: 'INCIDENTE',
    title: 'Caída del servicio de publicación de pedidos en pruebas',
    request: 'R07', task: 'PB.T5', resolver: 'mateo', targetDate: '2026-10-07',
    assetRef: 'Integración de pedidos ERP – plataforma logística',
    detail: 'El servicio dejó de publicar pedidos durante 40 minutos por agotamiento del pool de conexiones.',
    impact: 'Retrasó un día las pruebas integrales.',
    resolution: 'Se amplió el pool de conexiones y se agregó reintento con espera exponencial.',
    transitions: ['COMPLETADO'],
  },
  {
    key: 'I4', actor: 'diego', process: 'FIAA', date: '2026-10-07', typeCode: 'SOLICITUD_APOYO',
    title: 'Concepto de Jurídica para usar documentos internos en el prototipo',
    request: 'R13', resolver: 'diego', targetDate: '2026-10-23',
    detail: 'Se requiere concepto escrito sobre el uso de políticas internas y datos de colaboradores en un servicio de IA generativa.',
    impact: 'Sin el concepto no puede iniciarse la preparación del corpus.',
    transitions: [],
  },
  {
    key: 'I5', actor: 'jefe', process: 'FIID', date: '2026-10-01', typeCode: 'BLOQUEO',
    title: 'Credenciales del ambiente de habilitación de facturación electrónica pendientes',
    request: 'R10', resolver: 'valentina', targetDate: '2026-10-09',
    detail: 'El proveedor tecnológico no ha entregado las credenciales del ambiente de habilitación de la DIAN.',
    impact: 'No se pueden ejecutar pruebas del conector.',
    transitions: [],
  },
  {
    key: 'I6', actor: 'diego', process: 'FIAA', date: '2026-09-30', typeCode: 'CALIDAD_DATOS',
    title: 'Etiquetas inconsistentes en el histórico de PQRS de 2024',
    request: 'R14', resolver: 'sofia', targetDate: '2026-10-06',
    detail: 'El 12 % de las PQRS de 2024 tiene etiquetas de tema que no corresponden al texto.',
    impact: 'Reduce la exactitud esperada del clasificador.',
    resolution: 'Se reetiquetaron 1.430 casos con apoyo de la Coordinación de PQRS.',
    transitions: ['COMPLETADO', 'ARCHIVADO'],
  },
  {
    key: 'I7', actor: 'carla', process: 'FIBI', date: '2026-09-29', typeCode: 'INCIDENTE',
    title: 'El reporte de recaudo diario no se actualizó',
    resolver: 'julian', targetDate: '2026-09-29',
    assetRef: 'Reporte de recaudo diario',
    detail: 'La carga nocturna del 29 de septiembre falló y el reporte mostró datos del día anterior.',
    impact: 'Tesorería trabajó con cifras desactualizadas durante la mañana.',
    resolution: 'Se renovó la credencial de la fuente y se reprocesó la carga.',
    transitions: ['COMPLETADO', 'ARCHIVADO'],
  },
  {
    key: 'I8', actor: 'jefe', process: 'FMAA', date: '2026-10-06', typeCode: 'SOLICITUD_APOYO',
    title: 'Definir dueños de datos del maestro de clientes',
    request: 'R19', resolver: 'jefe', targetDate: '2026-10-20',
    detail: 'Cada vicepresidencia debe designar un dueño de datos para el maestro de clientes.',
    impact: 'Sin dueños designados no se pueden aprobar las reglas de calidad.',
    transitions: [],
  },
];

/** `state`: estado final via PATCH (la reunion nace BORRADOR). */
const MEETINGS = [
  {
    key: 'M1', actor: 'jefe', process: 'FMAA', title: 'Comité de demanda – octubre',
    date: '2026-10-02', time: '10:00', participants: ['jefe', 'beto', 'diego', 'valentina'], responsible: 'jefe',
    request: 'R19',
    agenda: '1. Solicitudes nuevas y resultado del triage.\n2. Priorización P1–P4 del backlog.\n3. Capacidad disponible para noviembre.',
    decisions: '• Se aprueban el tablero ejecutivo de ventas y el modelo de pronóstico de demanda.\n• El catálogo corporativo de datos se devuelve para reformularlo por fases.',
    notes: 'Asistieron los tres líderes de proceso. Próximo comité: 6 de noviembre.',
    state: 'COMPLETADO',
  },
  {
    key: 'M2', actor: 'beto', process: 'FIBI', title: 'Seguimiento semanal del tablero de ventas y margen',
    date: '2026-10-08', time: '15:00', participants: ['beto', 'carla', 'julian', 'mateo'], responsible: 'beto',
    request: 'R01', projectRequest: 'R01',
    agenda: 'Avance del modelo dimensional, extracción del ERP y reglas de costos.',
    decisions: 'Se registra como bloqueo la falta de reglas de costos de Finanzas.',
    notes: 'La extracción del ERP pasa a revisión; el modelo dimensional avanza al 45 %.',
    state: 'COMPLETADO',
  },
  {
    key: 'M3', actor: 'jefe', process: 'FIID', title: 'Revisión de pruebas de la integración de pedidos',
    date: '2026-10-09', time: '09:30', participants: ['valentina', 'mateo', 'jefe'], responsible: 'valentina',
    request: 'R07', projectRequest: 'R07',
    agenda: 'Resultados de pruebas integrales y de rendimiento; defectos abiertos.',
    decisions: 'Se solicita la validación funcional con Operaciones Logísticas.',
    notes: 'El defecto de los pedidos con más de 200 líneas quedó resuelto.',
    state: 'COMPLETADO',
  },
  {
    key: 'M4', actor: 'diego', process: 'FIAA', title: 'Kickoff de la prueba de concepto del asistente de políticas',
    date: '2026-10-14', time: '11:00', participants: ['diego', 'sofia', 'jefe'], responsible: 'diego',
    request: 'R13',
    agenda: 'Objetivos, alcance, riesgos de privacidad y cronograma de la prueba de concepto.',
    notes: 'Invitar a Jurídica y a Talento Humano.',
    state: null,
  },
  {
    key: 'M5', actor: 'jefe', process: 'FMAA', title: 'Revisión quincenal de capacidad del área',
    date: '2026-10-09', time: '16:00', participants: ['jefe', 'beto', 'diego', 'valentina'], responsible: 'jefe',
    agenda: 'Sobrecargas de octubre y disponibilidad de noviembre.',
    notes: 'Mateo Cárdenas supera su disponibilidad de octubre; revisar la redistribución.',
    state: 'EN_CURSO',
  },
];

/** `transitions`: estados destino en orden (estado inicial del backend: EN_CURSO). */
const COMMITMENTS = [
  {
    key: 'C1', actor: 'jefe', process: 'FMAA', title: 'Presentar el alcance por fases del catálogo de datos',
    dueDate: '2026-10-16', meeting: 'M1', assigned: 'jefe', responsible: 'jefe', request: 'R17',
    expectedResult: 'Propuesta de una primera fase acotada a Finanzas para el comité de noviembre.',
    transitions: [],
  },
  {
    // Vencido (en curso con vencimiento anterior a hoy).
    key: 'C2', actor: 'jefe', process: 'FIID', title: 'Confirmar la capacidad de Integraciones para noviembre',
    dueDate: '2026-10-07', meeting: 'M1', assigned: 'valentina', responsible: 'jefe', request: 'R10',
    expectedResult: 'Capacidad confirmada por persona para noviembre.',
    transitions: [],
  },
  {
    key: 'C3', actor: 'beto', process: 'FIBI', title: 'Definir con Finanzas las reglas de asignación de costos',
    dueDate: '2026-10-13', meeting: 'M2', assigned: 'beto', responsible: 'beto', request: 'R01',
    expectedResult: 'Reglas aprobadas por Finanzas.',
    blockers: 'Finanzas no ha designado un interlocutor.',
    transitions: ['BLOQUEADO'],
  },
  {
    // Vencido.
    key: 'C4', actor: 'beto', process: 'FIBI', title: 'Corregir las diferencias de margen en la regional Antioquia',
    dueDate: '2026-10-06', meeting: 'M2', assigned: 'mateo', responsible: 'carla', request: 'R01',
    expectedResult: 'Diferencia menor al 0,5 % frente al cierre contable.',
    transitions: [],
  },
  {
    key: 'C5', actor: 'jefe', process: 'FIID', title: 'Ejecutar la prueba de volumen con datos de temporada',
    dueDate: '2026-10-09', meeting: 'M3', assigned: 'mateo', responsible: 'valentina', request: 'R07',
    expectedResult: 'Prueba con 48.000 pedidos por hora sin errores.',
    result: 'Prueba ejecutada sin errores; tiempo promedio de publicación de 1,8 minutos.',
    transitions: ['COMPLETADO'],
  },
  {
    key: 'C6', actor: 'jefe', process: 'FIID', title: 'Enviar el acta de pruebas firmada a Operaciones Logísticas',
    dueDate: '2026-10-09', assigned: 'valentina', responsible: 'valentina', request: 'R07',
    expectedResult: 'Acta firmada y archivada en el expediente.',
    result: 'Acta enviada y firmada el 9 de octubre.',
    transitions: ['COMPLETADO', 'ARCHIVADO'],
  },
  {
    key: 'C7', actor: 'jefe', process: 'FMAA', title: 'Actualizar el glosario con la definición de cliente activo',
    dueDate: '2026-10-30', assigned: 'jefe', responsible: 'jefe', request: 'R19',
    expectedResult: 'Definición aprobada e incluida en el glosario.',
    transitions: [],
  },
];

// --- Bitacora diaria y semanal ------------------------------------------------------

/** Actividad: clasificacion, horas, descripcion y referencias segun la maestra ACTIVITY_CLASS. */
const A = (cls, hours, description, opts = {}) => ({ cls, hours, description, ...opts });

/**
 * Diarios de los ultimos 10 dias habiles (28/09 al 09/10/2026) para los 4
 * usuarios que inician sesion. `draft` = dias que quedan en BORRADOR (sin enviar).
 */
const WORKLOG = [
  {
    author: 'beto',
    process: 'FIBI',
    draft: ['2026-10-09'],
    days: [
      { date: '2026-09-28', notes: 'Semana de cierre del diseño del tablero de ventas.', acts: [
        A('PLANIFICADA', 3, 'Revisión de la maqueta funcional con Julián.', { task: 'PA.T2', result: 'Se acordaron ajustes de navegación entre páginas.', status: 'COMPLETADO' }),
        A('INTERNA', 2, 'Planeación semanal del equipo de BI.', { status: 'COMPLETADO' }),
        A('SOPORTE', 2, 'Optimización de una consulta lenta del reporte de recaudo.', { asset: 'Reporte de recaudo diario', result: 'Tiempo de carga reducido de 40 a 12 segundos.', status: 'COMPLETADO' }),
      ] },
      { date: '2026-09-29', notes: 'Falla en la actualización del reporte de recaudo.', acts: [
        A('SOPORTE', 3, 'Diagnóstico de la falla de actualización del reporte de recaudo.', { asset: 'Reporte de recaudo diario', issue: 'I7', result: 'Causa identificada: credencial vencida de la fuente.', status: 'COMPLETADO' }),
        A('PLANIFICADA', 4, 'Preparación de la sesión de validación del diseño con la Gerencia Comercial.', { req: 'R01', status: 'COMPLETADO' }),
      ] },
      { date: '2026-09-30', notes: 'Ajustes al diseño según comentarios de Finanzas.', acts: [
        A('PLANIFICADA', 5, 'Ajustes a la maqueta según los comentarios de Finanzas.', { req: 'R01', status: 'COMPLETADO' }),
        A('INTERNA', 2, 'Revisión del backlog de BI con la jefatura.', { status: 'COMPLETADO' }),
      ] },
      { date: '2026-10-01', notes: 'Día con solicitud urgente para la junta directiva.', acts: [
        A('EXTRAORDINARIA', 3, 'Preparación de cifras de ventas por canal para la junta directiva.', { requester: 'Laura Gómez – Gerencia Comercial', justification: 'Cifras requeridas para la junta directiva del 2 de octubre; no estaba planificado.', status: 'COMPLETADO' }),
        A('PLANIFICADA', 4, 'Versión final del documento de requerimientos del tablero.', { req: 'R01', status: 'COMPLETADO' }),
      ] },
      { date: '2026-10-02', notes: 'Aprobación del diseño y comité de demanda.', acts: [
        A('PLANIFICADA', 3, 'Sesión de aprobación del diseño con la Gerencia Comercial.', { task: 'PA.T3', result: 'Diseño aprobado sin observaciones bloqueantes.', status: 'COMPLETADO' }),
        A('INTERNA', 2, 'Participación en el comité de demanda de octubre.', { status: 'COMPLETADO' }),
        A('PLANIFICADA', 2, 'Revisión del formato regulatorio de cartera con Riesgos.', { req: 'R02', next: 'Solicitar acceso a la vista de cartera castigada.', nextDate: '2026-10-05', status: 'COMPLETADO' }),
      ] },
      { date: '2026-10-05', notes: 'Inicio de la fase de modelo de datos.', acts: [
        A('PLANIFICADA', 4, 'Levantamiento de reglas de asignación de costos con Finanzas.', { task: 'PA.T6', status: 'EN_CURSO' }),
        A('INTERNA', 1, 'Planeación semanal del equipo de BI.', { status: 'COMPLETADO' }),
        A('PLANIFICADA', 2, 'Radicación de la solicitud de acceso TI-4821 a la vista de cartera castigada.', { req: 'R02', next: 'Hacer seguimiento con Tecnología.', nextDate: '2026-10-08', status: 'BLOQUEADO' }),
      ] },
      { date: '2026-10-06', notes: 'Propuesta de reglas de costos.', acts: [
        A('PLANIFICADA', 3, 'Propuesta de reglas de costos por canal para revisión de Finanzas.', { task: 'PA.T6', status: 'EN_CURSO' }),
        A('SOPORTE', 2, 'Atención de la consulta de un usuario sobre el tablero de cartera antiguo.', { asset: 'Tablero de cartera (Qlik) – versión 2019', status: 'COMPLETADO' }),
        A('INTERNA', 2, 'Entrevistas de selección para el cargo de analista de BI.', { status: 'COMPLETADO' }),
      ] },
      { date: '2026-10-07', notes: 'Reglas de costos detenidas por falta de definiciones.', acts: [
        A('PLANIFICADA', 2, 'Seguimiento a Finanzas por las definiciones de costos pendientes.', { task: 'PA.T6', issue: 'I1', next: 'Escalar a la jefatura si no hay respuesta el viernes.', nextDate: '2026-10-09', status: 'BLOQUEADO' }),
        A('PLANIFICADA', 4, 'Revisión del avance del modelo dimensional con Carla.', { req: 'R01', status: 'COMPLETADO' }),
      ] },
      { date: '2026-10-08', notes: 'Seguimiento semanal del tablero.', acts: [
        A('INTERNA', 2, 'Seguimiento semanal del tablero de ventas y margen.', { status: 'COMPLETADO' }),
        A('PLANIFICADA', 3, 'Estimación del alcance de los indicadores de rotación de inventario.', { req: 'R04', status: 'COMPLETADO' }),
        A('SOPORTE', 2, 'Validación de la carga del reporte de recaudo tras el cambio de credenciales.', { asset: 'Reporte de recaudo diario', status: 'COMPLETADO' }),
      ] },
      { date: '2026-10-09', notes: 'Revisión de la extracción entregada por Integraciones.', acts: [
        A('PLANIFICADA', 3, 'Revisión de la extracción de ventas y costos entregada por Mateo.', { task: 'PA.T4', result: 'Se detectan diferencias en la regional Antioquia.', status: 'EN_CURSO' }),
        A('INTERNA', 2, 'Preparación del informe semanal.', { status: 'EN_CURSO' }),
      ] },
    ],
  },
  {
    author: 'carla',
    process: 'FIBI',
    draft: ['2026-10-09'],
    days: [
      { date: '2026-09-28', notes: 'Inventario de fuentes para el modelo de ventas.', acts: [
        A('PLANIFICADA', 4, 'Inventario de fuentes de ventas y costos disponibles en el data lake.', { req: 'R01', status: 'COMPLETADO' }),
        A('INTERNA', 3, 'Capacitación en modelado dimensional con Power BI.', { status: 'COMPLETADO' }),
      ] },
      { date: '2026-09-29', notes: 'Soporte por la falla del reporte de recaudo.', acts: [
        A('SOPORTE', 4, 'Reproceso manual de la carga del reporte de recaudo.', { asset: 'Reporte de recaudo diario', issue: 'I7', result: 'Reporte disponible a las 11:00 a. m.', status: 'COMPLETADO' }),
        A('PLANIFICADA', 3, 'Perfilamiento de los datos de costos estándar.', { req: 'R01', status: 'COMPLETADO' }),
      ] },
      { date: '2026-09-30', notes: 'Perfilamiento de ventas por canal.', acts: [
        A('PLANIFICADA', 6, 'Perfilamiento de los datos de ventas por canal.', { req: 'R01', result: 'Se encontraron 214 facturas sin canal asignado.', status: 'COMPLETADO' }),
        A('INTERNA', 1, 'Reunión de equipo.', { status: 'COMPLETADO' }),
      ] },
      { date: '2026-10-01', notes: 'Apoyo a la estimación de inventarios.', acts: [
        A('PLANIFICADA', 5, 'Revisión de los datos de inventario por bodega para la estimación.', { req: 'R04', status: 'COMPLETADO' }),
        A('SOPORTE', 2, 'Validación de la carga posterior a la corrección de credenciales.', { asset: 'Reporte de recaudo diario', status: 'COMPLETADO' }),
      ] },
      { date: '2026-10-02', notes: 'Diseño preliminar del modelo.', acts: [
        A('PLANIFICADA', 4, 'Diseño preliminar de dimensiones y hechos del modelo de ventas.', { req: 'R01', status: 'COMPLETADO' }),
        A('INTERNA', 2, 'Revisión de pares del diseño del modelo.', { status: 'COMPLETADO' }),
      ] },
      { date: '2026-10-05', notes: 'Inicio de la construcción del modelo dimensional.', acts: [
        A('PLANIFICADA', 6, 'Construcción de las dimensiones de canal y regional.', { task: 'PA.T5', status: 'COMPLETADO' }),
        A('INTERNA', 1, 'Planeación semanal del equipo.', { status: 'COMPLETADO' }),
      ] },
      { date: '2026-10-06', notes: 'Construcción de hechos y solicitud urgente de Finanzas.', acts: [
        A('PLANIFICADA', 5, 'Construcción de la tabla de hechos de ventas.', { task: 'PA.T5', status: 'COMPLETADO' }),
        A('EXTRAORDINARIA', 2, 'Extracción de ventas por línea de producto para la revisión presupuestal.', { requester: 'Jorge Iván Pérez – Vicepresidencia Financiera', justification: 'Extracción puntual solicitada con urgencia por la Vicepresidencia para la revisión presupuestal.', status: 'COMPLETADO' }),
      ] },
      { date: '2026-10-07', notes: 'Medidas de margen.', acts: [
        A('PLANIFICADA', 5, 'Medidas de margen bruto y cumplimiento de presupuesto.', { task: 'PA.T5', status: 'EN_CURSO' }),
        A('INTERNA', 2, 'Documentación del modelo en el diccionario de datos.', { status: 'COMPLETADO' }),
      ] },
      { date: '2026-10-08', notes: 'Ajustes tras la revisión con Beto.', acts: [
        A('PLANIFICADA', 4, 'Ajustes al modelo tras la revisión con Beto.', { task: 'PA.T5', status: 'COMPLETADO' }),
        A('INTERNA', 2, 'Seguimiento semanal del tablero de ventas y margen.', { status: 'COMPLETADO' }),
      ] },
      { date: '2026-10-09', notes: 'Prueba de regresión de totales de margen.', acts: [
        A('PLANIFICADA', 4, 'Prueba de regresión de totales de margen frente al cierre contable.', { task: 'PA.T4', issue: 'I2', result: 'Diferencia de 2,3 % en la regional Antioquia.', status: 'BLOQUEADO' }),
        A('PLANIFICADA', 3, 'Carga incremental del modelo en el ambiente de pruebas.', { task: 'PA.T5', status: 'EN_CURSO' }),
      ] },
    ],
  },
  {
    author: 'diego',
    process: 'FIAA',
    draft: [],
    days: [
      { date: '2026-09-28', notes: 'Exploración del histórico de ventas.', acts: [
        A('PLANIFICADA', 4, 'Exploración del histórico de ventas por SKU de los últimos tres años.', { req: 'R12', status: 'COMPLETADO' }),
        A('INTERNA', 2, 'Planeación semanal del equipo de IA.', { status: 'COMPLETADO' }),
      ] },
      { date: '2026-09-29', notes: 'Estacionalidad y soporte del dataset de PQRS.', acts: [
        A('PLANIFICADA', 5, 'Análisis de estacionalidad y quiebres de stock.', { req: 'R12', result: 'Se identifican picos en junio y diciembre.', status: 'COMPLETADO' }),
        A('SOPORTE', 2, 'Actualización mensual del dataset de PQRS.', { asset: 'Dataset histórico de PQRS etiquetadas', status: 'COMPLETADO' }),
      ] },
      { date: '2026-09-30', notes: 'Revisión del etiquetado de PQRS.', acts: [
        A('PLANIFICADA', 4, 'Revisión del etiquetado histórico de PQRS.', { req: 'R14', issue: 'I6', result: 'El 12 % de las etiquetas de 2024 es inconsistente.', status: 'COMPLETADO' }),
        A('INTERNA', 3, 'Revisión de propuestas de proveedores de IA generativa.', { status: 'COMPLETADO' }),
      ] },
      { date: '2026-10-01', notes: 'Alcance de la prueba de concepto.', acts: [
        A('PLANIFICADA', 5, 'Definición del alcance de la prueba de concepto con Talento Humano.', { req: 'R13', status: 'COMPLETADO' }),
        A('INTERNA', 2, 'Mentoría a Sofía en evaluación de modelos.', { status: 'COMPLETADO' }),
      ] },
      { date: '2026-10-02', notes: 'Comité de demanda.', acts: [
        A('INTERNA', 3, 'Participación en el comité de demanda de octubre.', { status: 'COMPLETADO' }),
        A('PLANIFICADA', 3, 'Selección de variables explicativas del pronóstico.', { req: 'R12', status: 'COMPLETADO' }),
      ] },
      { date: '2026-10-05', notes: 'Inventario de políticas y re-evaluación de PQRS.', acts: [
        A('PLANIFICADA', 4, 'Inventario preliminar de políticas con Talento Humano.', { req: 'R13', status: 'COMPLETADO' }),
        A('PLANIFICADA', 3, 'Re-evaluación de la prioridad de PQRS con el nuevo histórico.', { req: 'R14', status: 'COMPLETADO' }),
      ] },
      { date: '2026-10-06', notes: 'Modelos base y solicitud urgente de Mercadeo.', acts: [
        A('PLANIFICADA', 5, 'Prueba de modelos base (ingenuo estacional y ETS).', { req: 'R12', status: 'COMPLETADO' }),
        A('EXTRAORDINARIA', 2, 'Estimación del impacto de la promoción de fin de mes.', { requester: 'Carolina Vélez – Planeación de la Demanda', justification: 'Estimación rápida solicitada para la promoción de fin de mes; no estaba en el plan del equipo.', status: 'COMPLETADO' }),
      ] },
      { date: '2026-10-07', notes: 'Reunión con Jurídica.', acts: [
        A('PLANIFICADA', 3, 'Reunión con Jurídica sobre el uso de documentos internos en el prototipo.', { req: 'R13', issue: 'I4', next: 'Esperar el concepto escrito de Jurídica.', nextDate: '2026-10-23', status: 'BLOQUEADO' }),
        A('PLANIFICADA', 4, 'Validación cruzada temporal de los modelos base.', { req: 'R12', status: 'COMPLETADO' }),
      ] },
      { date: '2026-10-08', notes: 'Comparación de modelos.', acts: [
        A('PLANIFICADA', 6, 'Comparación de modelos de gradiente y ETS por familia de producto.', { req: 'R12', result: 'El modelo de gradiente reduce el MAPE de 24 % a 17 %.', status: 'COMPLETADO' }),
        A('INTERNA', 1, 'Actualización del tablero de seguimiento del equipo de IA.', { status: 'COMPLETADO' }),
      ] },
      { date: '2026-10-09', notes: 'Cierre de semana.', acts: [
        A('INTERNA', 2, 'Preparación del informe semanal.', { status: 'COMPLETADO' }),
        A('PLANIFICADA', 4, 'Preparación del kickoff de la prueba de concepto.', { req: 'R13', status: 'COMPLETADO' }),
      ] },
    ],
  },
  {
    author: 'jefe',
    process: 'FMAA',
    draft: [],
    days: [
      { date: '2026-09-28', notes: 'Planeación del cuarto trimestre.', acts: [
        A('INTERNA', 3, 'Revisión de la capacidad del área para el cuarto trimestre.', { status: 'COMPLETADO' }),
        A('PLANIFICADA', 2, 'Reunión con la Vicepresidencia de Operaciones sobre el maestro de clientes.', { req: 'R19', status: 'COMPLETADO' }),
      ] },
      { date: '2026-09-29', notes: 'Preparación del comité de demanda.', acts: [
        A('INTERNA', 4, 'Preparación del comité de demanda de octubre.', { status: 'COMPLETADO' }),
        A('EXTRAORDINARIA', 2, 'Elaboración del informe ejecutivo de avance para la junta directiva.', { requester: 'Presidencia', justification: 'Informe ejecutivo del avance de analítica solicitado para la junta directiva.', status: 'COMPLETADO' }),
      ] },
      { date: '2026-09-30', notes: 'Revisión del catálogo de datos.', acts: [
        A('PLANIFICADA', 3, 'Revisión de la propuesta del catálogo corporativo de datos.', { req: 'R17', status: 'COMPLETADO' }),
        A('INTERNA', 2, 'Seguimiento uno a uno con los líderes de proceso.', { status: 'COMPLETADO' }),
      ] },
      { date: '2026-10-01', notes: 'Consolidación de la priorización.', acts: [
        A('INTERNA', 4, 'Consolidación de la priorización de solicitudes para el comité.', { status: 'COMPLETADO' }),
        A('PLANIFICADA', 2, 'Mapa de sistemas que consumen el maestro de clientes.', { req: 'R19', status: 'COMPLETADO' }),
      ] },
      { date: '2026-10-02', notes: 'Comité de demanda de octubre.', acts: [
        A('INTERNA', 4, 'Comité de demanda de octubre.', { status: 'COMPLETADO' }),
        A('INTERNA', 2, 'Comunicación de las decisiones del comité a los solicitantes.', { status: 'COMPLETADO' }),
      ] },
      { date: '2026-10-05', notes: 'Presupuesto 2027.', acts: [
        A('INTERNA', 3, 'Revisión del presupuesto de licencias 2027.', { status: 'COMPLETADO' }),
        A('PLANIFICADA', 2, 'Retroalimentación al alcance del catálogo de datos.', { req: 'R17', status: 'COMPLETADO' }),
      ] },
      { date: '2026-10-06', notes: 'Riesgos del portafolio.', acts: [
        A('INTERNA', 3, 'Revisión de riesgos del portafolio del área.', { status: 'COMPLETADO' }),
        A('PLANIFICADA', 2, 'Definición de dueños de datos con las áreas.', { req: 'R19', issue: 'I8', status: 'EN_CURSO' }),
      ] },
      { date: '2026-10-07', notes: 'Requerimiento de Auditoría Interna.', acts: [
        A('INTERNA', 2, 'Seguimiento de compromisos vencidos del comité.', { status: 'COMPLETADO' }),
        A('EXTRAORDINARIA', 3, 'Atención del requerimiento de Auditoría Interna sobre accesos a datos.', { requester: 'Auditoría Interna', justification: 'Requerimiento de información sobre accesos a datos con plazo de 48 horas.', status: 'COMPLETADO' }),
      ] },
      { date: '2026-10-08', notes: 'Revisión de pruebas de Integraciones.', acts: [
        A('PLANIFICADA', 2, 'Revisión de las pruebas de la integración de pedidos.', { req: 'R07', status: 'COMPLETADO' }),
        A('INTERNA', 2, 'Evaluaciones de desempeño del trimestre.', { status: 'EN_CURSO' }),
      ] },
      { date: '2026-10-09', notes: 'Cierre de semana.', acts: [
        A('INTERNA', 2, 'Revisión de la bitácora del equipo.', { status: 'COMPLETADO' }),
        A('PLANIFICADA', 2, 'Revisión del plan de la prueba de concepto antes de su autorización.', { req: 'R13', status: 'COMPLETADO' }),
        A('INTERNA', 1, 'Revisión quincenal de capacidad del área.', { status: 'COMPLETADO' }),
      ] },
    ],
  },
];

/** Semanales (se anclan al lunes). `submit` = se envia (ENVIADO); si no, queda BORRADOR. */
const WEEKLY = [
  {
    key: 'W1', author: 'beto', process: 'FIBI', weekStart: '2026-09-28', submit: true,
    body: {
      results: '• Diseño del tablero de ventas y margen aprobado por la Gerencia Comercial (2 de octubre).\n• Falla del reporte de recaudo corregida el 29 de septiembre (credencial vencida).\n• Cifras de ventas por canal entregadas para la junta directiva.',
      proposals: 'Incluir el margen por cliente en una segunda fase del tablero.',
      blockers: 'Acceso a la vista de cartera castigada pendiente (solicitud TI-4821).',
      commitmentsText: 'Iniciar el modelo dimensional y revisar la extracción del ERP con Integraciones.',
      decisions: 'Confirmar con Finanzas quién define las reglas de asignación de costos por canal.',
    },
  },
  {
    key: 'W2', author: 'diego', process: 'FIAA', weekStart: '2026-09-28', submit: true,
    body: {
      results: '• Exploración del histórico de ventas por SKU terminada.\n• Etiquetado de PQRS revisado: 12 % de inconsistencias en 2024.\n• Alcance de la prueba de concepto acordado con Talento Humano.',
      proposals: 'Usar el modelo de gradiente como línea base del pronóstico.',
      blockers: 'Concepto de Jurídica pendiente para usar documentos internos.',
      commitmentsText: 'Comparar los modelos de gradiente y ETS por familia de producto.',
      decisions: 'Aprobar la re-evaluación de la prioridad de la clasificación de PQRS con el nuevo histórico.',
    },
  },
  {
    key: 'W3', author: 'carla', process: 'FIBI', weekStart: '2026-10-05', submit: false,
    body: {
      results: '• Dimensiones de canal y regional construidas.\n• Tabla de hechos de ventas cargada en pruebas.',
      proposals: 'Automatizar la prueba de regresión de totales contra el cierre contable.',
      blockers: 'Diferencias de margen en la regional Antioquia (novedad registrada).',
      commitmentsText: 'Terminar las medidas de margen y la carga incremental.',
      decisions: 'Definir si se publica el modelo con la diferencia de Antioquia documentada.',
    },
  },
];

// ===========================================================================
// CARGA
// ===========================================================================

/** Codes de maestras usados por el dataset (se validan antes de mutar nada). */
function usedCatalogCodes() {
  const used = new Map();
  const add = (catalog, code) => {
    if (!code) return;
    if (!used.has(catalog)) used.set(catalog, new Set());
    used.get(catalog).add(code);
  };
  for (const r of REQUESTS) {
    const t = r.triage?.body;
    if (t) {
      add('TRIAGE_ROUTE', t.routeCode);
      add('DEMAND_TYPE', t.demandTypeCode);
      add('CRITICALITY', t.criticalityCode);
      add('TRIAGE_SIZE', t.sizeCode);
      add('DATA_AVAILABILITY', t.dataAvailabilityCode);
    }
  }
  for (const a of ASSETS) {
    add('ASSET_TYPE', a.body.typeCode);
    add('TECHNOLOGY', a.body.technologyCode);
    add('SOURCE', a.body.sourceCode);
    add('FREQUENCY', a.body.frequencyCode);
  }
  for (const d of DOCUMENTS) add('DOC_CATEGORY', d.categoryCode);
  for (const code of ['COMPLETA', 'SIMPLIFICADA', 'EXPLORACION']) add('GOVERNANCE_ROUTE', code);
  for (const code of ['FUNCIONAL_ACEPTACION', 'COMPONENTE_INTEGRACION', 'REGRESION', 'RENDIMIENTO_CONTINUIDAD', 'ACCESO_SEGURIDAD']) {
    add('VALIDATION_TYPE', code);
  }
  for (const code of ['APROBADA', 'APROBADA_CON_OBSERVACIONES', 'FALLIDA']) add('VALIDATION_RESULT', code);
  return used;
}

/** Valida longitudes contra los DTO antes de enviar (falla temprano y sin mutar). */
function validateDataset() {
  for (const r of REQUESTS) {
    assertMaxLength(`${r.key}.title`, r.body.title, 255);
    assertMaxLength(`${r.key}.expectedResult`, r.body.expectedResult, 2000);
    assertMaxLength(`${r.key}.referenceUrl`, r.body.referenceUrl, 2048);
    assertMaxLength(`${r.key}.requesterArea`, r.body.requesterArea, 255);
    if (r.triage) {
      assertMaxLength(`${r.key}.triage.notes`, r.triage.body.notes, 2000);
      assertMaxLength(`${r.key}.triage.dependencies`, r.triage.body.dependencies, 2000);
    }
    for (const p of r.priorities ?? []) {
      assertMaxLength(`${r.key}.priority.justification`, mark(p.justification), 2000);
    }
  }
  for (const plan of PLANS) {
    assertMaxLength(`${plan.key}.risks`, plan.body.risks, 4000);
    assertMaxLength(`${plan.key}.mitigations`, plan.body.mitigations, 4000);
    for (const t of [...plan.tasks, ...(plan.afterReturn?.tasks ?? [])]) {
      assertMaxLength(`${plan.key}.${t.key}.title`, t.title, 255);
      assertMaxLength(`${plan.key}.${t.key}.description`, mark(t.description), 4000);
    }
  }
  for (const d of DOCUMENTS) {
    d.versions.forEach((v, i) => assertMaxLength(`${d.key}.v${i + 1}`, mark(v), 200000));
  }
  const keys = new Set();
  for (const [, person, month, proc, req] of ASSIGNMENTS) {
    const key = `${month}.${person}.${proc}.${req ?? '-'}`;
    if (keys.has(key)) throw new Error(`Asignacion duplicada en el dataset: ${key}`);
    keys.add(key);
  }
}

async function preflight() {
  for (const actor of Object.keys(ACTOR_IDENTIFIERS)) {
    await login(actor);
  }

  const processes = await api('jefe', 'GET', '/processes');
  for (const p of processes) {
    P[p.code] = p.id;
    PROCESS_CODE[p.id] = p.code;
  }
  for (const code of ['FIBI', 'FIID', 'FIAA', 'FMAA']) {
    const process = processes.find((p) => p.code === code);
    if (!process || !process.active) {
      throw new Error(`El proceso ${code} no existe o no esta activo.`);
    }
  }

  const users = await api('jefe', 'GET', '/users');
  for (const [key, identifier] of Object.entries(ACTOR_IDENTIFIERS)) {
    const user = users.find((u) => u.identifier === identifier);
    if (!user) throw new Error(`No existe el usuario semilla ${identifier}.`);
    U[key] = user.id;
  }
  for (const nu of NEW_USERS) {
    if (hasEntity(`user.${nu.key}`)) U[nu.key] = idOf(`user.${nu.key}`);
  }

  if (VERIFY_ONLY) return;

  validateDataset();
  const items = await api('jefe', 'GET', '/catalog-items');
  const missing = [];
  for (const [catalog, codes] of usedCatalogCodes()) {
    for (const code of codes) {
      if (!items.some((i) => i.catalog === catalog && i.code === code && i.active)) {
        missing.push(`${catalog}/${code}`);
      }
    }
  }
  if (missing.length > 0) {
    throw new Error(`Maestras sin los codes requeridos (no se modifica ninguna): ${missing.join(', ')}`);
  }
}

// --- Personas ----------------------------------------------------------------

async function loadPeople() {
  for (const nu of NEW_USERS) {
    const key = `user.${nu.key}`;
    if (!hasEntity(key)) {
      try {
        await ensureEntity(key, {
          entity: 'User',
          actor: 'jefe',
          method: 'POST',
          route: '/users',
          body: { identifier: nu.identifier, name: nu.name },
          label: `${nu.name} <${nu.identifier}>`,
        });
      } catch (error) {
        // Solo se adopta un usuario existente si pertenece al dominio reservado del dataset.
        if (!(error instanceof ApiError) || error.status !== 409 || !nu.identifier.endsWith(DEMO_DOMAIN)) {
          throw error;
        }
        const users = await api('jefe', 'GET', '/users');
        const found = users.find((u) => u.identifier === nu.identifier);
        if (!found) throw error;
        recordEntities([
          {
            key,
            entity: 'User',
            id: found.id,
            parentIds: {},
            createdVia: 'POST /users (adoptado: ya existia en el dominio @demo-ui.local)',
            actor: ACTOR_IDENTIFIERS.jefe,
            createdAt: found.createdAt,
            label: `${nu.name} <${nu.identifier}>`,
            adopted: true,
          },
        ]);
      }
    }
    U[nu.key] = idOf(key);

    for (const [roleCode, processCode] of nu.grants) {
      const grantKey = `grant.${nu.key}.${roleCode}.${processCode}`;
      if (hasEntity(grantKey)) continue;
      try {
        await ensureEntity(grantKey, {
          entity: 'Grant',
          actor: 'jefe',
          method: 'POST',
          route: '/grants',
          body: { userId: U[nu.key], roleCode, processId: P[processCode] },
          parentIds: { userId: U[nu.key], processId: P[processCode] },
          label: `${nu.name} · ${roleCode} @ ${processCode}`,
        });
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 409) throw error;
        const grants = await api('jefe', 'GET', `/grants?userId=${U[nu.key]}&processId=${P[processCode]}`);
        const active = grants.filter((g) => g.active);
        if (active.length !== 1) throw error;
        recordEntities([
          {
            key: grantKey,
            entity: 'Grant',
            id: active[0].id,
            parentIds: { userId: U[nu.key], processId: P[processCode] },
            createdVia: 'POST /grants (adoptado: ya existia para el usuario demo-ui)',
            actor: ACTOR_IDENTIFIERS.jefe,
            createdAt: active[0].createdAt,
            label: `${nu.name} · ${roleCode} @ ${processCode}`,
            adopted: true,
          },
        ]);
      }
    }
  }
}

// --- Demanda -----------------------------------------------------------------

async function loadRequests() {
  for (const r of REQUESTS) {
    const participantIds = (r.participants ?? []).map((code) => P[code]);
    const body = {
      ...r.body,
      mainProcessId: P[r.process],
      ...(participantIds.length > 0 ? { participantProcessIds: participantIds } : {}),
    };
    const request = await ensureEntity(`req.${r.key}`, {
      entity: 'Request',
      actor: r.actor,
      method: 'POST',
      route: '/requests',
      body,
      parentIds: { mainProcessId: P[r.process], participantProcessIds: participantIds },
      label: `${r.key} · ${r.body.title}`,
      extraEntities: (res) =>
        (res.participants ?? []).map((p) => ({
          key: `req.${r.key}.participant.${PROCESS_CODE[p.processId] ?? p.processId}`,
          entity: 'RequestParticipant',
          id: p.id,
          parentIds: { requestId: res.id, processId: p.processId },
          createdVia: 'POST /requests (participante materializado con la solicitud)',
        })),
    });

    if (r.triage) {
      await ensureEntity(`req.${r.key}.triage`, {
        entity: 'Triage',
        actor: r.triage.actor,
        method: 'POST',
        route: `/requests/${request.id}/triage`,
        body: r.triage.body,
        parentIds: { requestId: request.id },
        label: `${r.key} triage ${r.triage.body.decision}`,
      });
    }

    for (const [index, p] of (r.priorities ?? []).entries()) {
      const expected = scoreOf(p.criteria);
      await ensureEntity(`req.${r.key}.priority.${index + 1}`, {
        entity: 'PriorityEvaluation',
        actor: p.actor,
        method: 'POST',
        route: `/requests/${request.id}/priority`,
        body: { ...p.criteria, justification: mark(p.justification) },
        parentIds: { requestId: request.id },
        label: `${r.key} evaluación ${index + 1}: ${expected} (${bandOf(expected)})`,
        after: (res) => {
          if (res.score !== expected) {
            warn(`${r.key}: score devuelto ${res.score} distinto del esperado ${expected}.`);
          }
        },
      });
    }

    if (r.approval) {
      await ensureEntity(`req.${r.key}.approval`, {
        entity: 'Approval',
        actor: r.approval.actor,
        method: 'POST',
        route: `/requests/${request.id}/approval`,
        body: { decision: r.approval.decision, reason: r.approval.reason },
        parentIds: { requestId: request.id },
        label: `${r.key} aprobación ${r.approval.decision}`,
      });
    }
  }
}

// --- Planes ------------------------------------------------------------------

function phaseBody(phase) {
  return {
    name: phase.name,
    ...(phase.start ? { startDate: day(phase.start) } : {}),
    ...(phase.end ? { endDate: day(phase.end) } : {}),
    ...(phase.deliverable ? { deliverable: phase.deliverable } : {}),
  };
}

function taskBody(task) {
  return {
    title: task.title,
    isMilestone: task.milestone,
    description: mark(task.description),
    ...(task.responsible ? { responsibleUserId: U[task.responsible] } : {}),
    ...(task.process ? { processId: P[task.process] } : {}),
    ...(task.start ? { startDate: day(task.start) } : {}),
    ...(task.end ? { endDate: day(task.end) } : {}),
    ...(task.hours !== null && task.hours !== undefined ? { estimateHours: task.hours } : {}),
    ...(task.acceptanceCriteria ? { acceptanceCriteria: task.acceptanceCriteria } : {}),
    ...(task.frameworkPhaseRequired ? { frameworkPhaseRequired: task.frameworkPhaseRequired } : {}),
    ...(task.evidenceUrl ? { evidenceUrl: task.evidenceUrl } : {}),
  };
}

async function createPlanContent(plan, planId, requestId, content) {
  for (const phase of content.phases ?? []) {
    await ensureEntity(`phase.${plan.key}.${phase.key}`, {
      entity: 'PlanPhase',
      actor: plan.actor,
      method: 'POST',
      route: `/plans/${planId}/phases`,
      body: phaseBody(phase),
      parentIds: { planId, requestId },
      label: `${plan.key} ${phase.key} · ${phase.name}`,
    });
  }
  for (const task of content.tasks ?? []) {
    const phaseId = idOf(`phase.${plan.key}.${task.phase}`);
    await ensureEntity(`task.${plan.key}.${task.key}`, {
      entity: 'Task',
      actor: plan.actor,
      method: 'POST',
      route: `/phases/${phaseId}/tasks`,
      body: taskBody(task),
      parentIds: { phaseId, planId, requestId },
      label: `${plan.key} ${task.key} · ${task.title}`,
    });
  }
  for (const [dependent, predecessor] of content.deps ?? []) {
    const dependentId = idOf(`task.${plan.key}.${dependent}`);
    const predecessorId = idOf(`task.${plan.key}.${predecessor}`);
    await ensureEntity(`dep.${plan.key}.${dependent}<-${predecessor}`, {
      entity: 'TaskDependency',
      actor: plan.actor,
      method: 'POST',
      route: `/tasks/${dependentId}/dependencies`,
      body: { predecessorTaskId: predecessorId },
      parentIds: { dependentTaskId: dependentId, predecessorTaskId: predecessorId },
      label: `${plan.key} ${dependent} depende de ${predecessor}`,
    });
  }
}

async function loadPlans() {
  for (const plan of PLANS) {
    const requestId = idOf(`req.${plan.request}`);
    const planEntry = await ensureEntity(`plan.${plan.key}`, {
      entity: 'Plan',
      actor: plan.actor,
      method: 'POST',
      route: `/requests/${requestId}/plan`,
      body: plan.body,
      parentIds: { requestId },
      label: `${plan.key} · plan de ${plan.request}`,
    });
    const planId = planEntry.id;
    const target = { entity: 'Plan', id: planId };

    await createPlanContent(plan, planId, requestId, plan);

    if (plan.submit) {
      await ensureAction(`plan.${plan.key}.submit`, {
        actor: plan.actor,
        method: 'POST',
        route: `/requests/${requestId}/plan/submit`,
        target,
      });
    }
    if (plan.authorize) {
      await ensureAction(`plan.${plan.key}.authorize`, {
        actor: plan.authorizer,
        method: 'POST',
        route: `/requests/${requestId}/plan/authorize`,
        target,
      });
    }
    if (plan.returnWith) {
      await ensureAction(`plan.${plan.key}.return`, {
        actor: plan.returnWith.actor,
        method: 'POST',
        route: `/requests/${requestId}/plan/return`,
        body: { reason: plan.returnWith.reason },
        target,
      });
      await createPlanContent(plan, planId, requestId, plan.afterReturn);
    }

    for (const s of plan.statuses ?? []) {
      const taskId = idOf(`task.${plan.key}.${s.task}`);
      const taskTarget = { entity: 'Task', id: taskId };
      for (const [index, [status, progress]] of s.path.entries()) {
        await ensureAction(`task.${plan.key}.${s.task}.status.${index + 1}.${status}`, {
          actor: s.actor,
          method: 'PATCH',
          route: `/tasks/${taskId}/status`,
          body: { status, ...(progress !== undefined ? { progress } : {}) },
          target: taskTarget,
          detail: { status, progress },
        });
      }
      if (s.accept) {
        await ensureAction(`task.${plan.key}.${s.task}.accept`, {
          actor: s.accept,
          method: 'PATCH',
          route: `/tasks/${taskId}/accept`,
          body: { accepted: true },
          target: taskTarget,
        });
      }
    }
  }
}

// --- Activos y documentos --------------------------------------------------------

async function loadKnowledge() {
  for (const stepDef of KNOWLEDGE_STEPS) {
    const [kind] = stepDef;
    if (kind === 'asset') {
      const asset = ASSETS.find((a) => a.key === stepDef[1]);
      const requestId = asset.request ? idOf(`req.${asset.request}`) : undefined;
      await ensureEntity(`asset.${asset.key}`, {
        entity: 'Asset',
        actor: asset.actor,
        method: 'POST',
        route: '/assets',
        body: {
          processId: P[asset.process],
          ...asset.body,
          ...(requestId ? { requestId } : {}),
          ...(asset.owner ? { ownerUserId: U[asset.owner] } : {}),
        },
        parentIds: {
          processId: P[asset.process],
          ...(requestId ? { requestId } : {}),
          ...(asset.owner ? { ownerUserId: U[asset.owner] } : {}),
        },
        label: `${asset.key} · ${asset.body.name}`,
      });
    } else if (kind === 'doc') {
      const [, docKey, version, actor] = stepDef;
      const doc = DOCUMENTS.find((d) => d.key === docKey);
      const content = mark(doc.versions[version - 1]);
      if (version === 1) {
        const assetId = idOf(`asset.${doc.asset}`);
        await ensureEntity(`doc.${docKey}`, {
          entity: 'Document',
          actor,
          method: 'POST',
          route: '/documents',
          body: { assetId, title: doc.title, categoryCode: doc.categoryCode, content },
          parentIds: { assetId },
          label: `${docKey} · ${doc.title}`,
          extraEntities: (res) => [
            {
              key: `docver.${docKey}.v1`,
              entity: 'DocumentVersion',
              id: res.currentVersion.id,
              parentIds: { documentId: res.id },
              createdVia: 'POST /documents (versión 1 creada con el documento)',
              createdAt: res.currentVersion.createdAt,
              label: `${docKey} v1`,
            },
          ],
        });
      } else {
        const documentId = idOf(`doc.${docKey}`);
        await ensureEntity(`docver.${docKey}.v${version}`, {
          entity: 'DocumentVersion',
          actor,
          method: 'POST',
          route: `/documents/${documentId}/versions`,
          body: { content },
          idOf: (res) => res.currentVersion.id,
          parentIds: { documentId },
          label: `${docKey} v${version}`,
          after: (res, entry) => {
            if (res.currentVersion.versionNumber !== version) {
              warn(`${docKey}: se esperaba la versión ${version} y la API devolvió ${res.currentVersion.versionNumber}.`);
            }
            entry.createdAt = res.currentVersion.createdAt;
            saveManifest();
          },
        });
      }
    } else if (kind === 'assetStatus') {
      const [, assetKey, targetStatus, actor, reason] = stepDef;
      const assetId = idOf(`asset.${assetKey}`);
      await ensureAction(`asset.${assetKey}.status.${targetStatus}`, {
        actor,
        method: 'POST',
        route: `/assets/${assetId}/status`,
        body: { targetStatus, reason },
        target: { entity: 'Asset', id: assetId },
        detail: { targetStatus },
      });
    } else if (kind === 'docStatus') {
      const [, docKey, targetStatus, actor, reason] = stepDef;
      const documentId = idOf(`doc.${docKey}`);
      await ensureAction(`doc.${docKey}.status.${targetStatus}`, {
        actor,
        method: 'POST',
        route: `/documents/${documentId}/status`,
        body: { targetStatus, reason },
        target: { entity: 'Document', id: documentId },
        detail: { targetStatus },
      });
    }
  }
}

// --- Gobierno -----------------------------------------------------------------

/** Registra en el manifiesto los 5 GateCheck materializados de forma perezosa. */
async function recordGates(reqKey) {
  const requestId = idOf(`req.${reqKey}`);
  const board = await api('jefe', 'GET', `/requests/${requestId}/gates`);
  const entries = board.gates
    .filter((g) => !hasEntity(`gate.${reqKey}.${g.gateCode}`))
    .map((g) => ({
      key: `gate.${reqKey}.${g.gateCode}`,
      entity: 'GateCheck',
      id: g.id,
      parentIds: { requestId },
      createdVia: `GET /requests/${requestId}/gates (materialización perezosa de los 5 controles)`,
      actor: ACTOR_IDENTIFIERS.jefe,
      createdAt: g.createdAt,
      label: `${reqKey} ${g.gateCode}`,
    }));
  if (entries.length > 0) {
    recordEntities(entries);
  }
}

async function setRoute(reqKey, actor, route) {
  const requestId = idOf(`req.${reqKey}`);
  await ensureAction(`gov.${reqKey}.route.${route}`, {
    actor,
    method: 'PUT',
    route: `/requests/${requestId}/governance-route`,
    body: { route },
    target: { entity: 'Request', id: requestId },
    detail: { route },
  });
  await recordGates(reqKey);
}

async function addPending(reqKey, gateCode, actor, itemKey, item) {
  const requestId = idOf(`req.${reqKey}`);
  return ensureEntity(`pending.${reqKey}.${gateCode}.${itemKey}`, {
    entity: 'GatePendingItem',
    actor,
    method: 'POST',
    route: `/requests/${requestId}/gates/${gateCode}/pending-items`,
    body: {
      description: mark(item.description),
      ...(item.owner ? { ownerUserId: U[item.owner] } : {}),
      ...(item.reviewDate ? { reviewDate: item.reviewDate } : {}),
    },
    parentIds: { requestId, gateCheckId: idOf(`gate.${reqKey}.${gateCode}`) },
    label: `${reqKey} ${gateCode} · ${item.description}`,
  });
}

async function resolvePending(reqKey, gateCode, actor, itemKey) {
  const requestId = idOf(`req.${reqKey}`);
  const itemId = idOf(`pending.${reqKey}.${gateCode}.${itemKey}`);
  await ensureAction(`pending.${reqKey}.${gateCode}.${itemKey}.resolve`, {
    actor,
    method: 'PATCH',
    route: `/requests/${requestId}/gates/${gateCode}/pending-items/${itemId}`,
    body: { resolved: true },
    target: { entity: 'GatePendingItem', id: itemId },
  });
}

async function addValidation(reqKey, actor, validationKey, v) {
  const requestId = idOf(`req.${reqKey}`);
  const evidenceDocumentId = v.evidenceDoc ? idOf(`doc.${v.evidenceDoc}`) : undefined;
  const evidenceDocumentVersionId = v.evidenceVersion ? idOf(`docver.${v.evidenceDoc}.${v.evidenceVersion}`) : undefined;
  return ensureEntity(`validation.${reqKey}.${validationKey}`, {
    entity: 'ValidationRecord',
    actor,
    method: 'POST',
    route: `/requests/${requestId}/validations`,
    body: {
      validationTypeCode: v.type,
      testCase: v.testCase,
      resultCode: v.result,
      blocking: v.blocking ?? false,
      executedByUserId: U[v.executedBy],
      executedAt: v.executedAt,
      ...(v.version ? { version: v.version } : {}),
      ...(v.environment ? { environment: v.environment } : {}),
      ...(v.evidenceRef ? { evidenceRef: v.evidenceRef } : {}),
      ...(evidenceDocumentId ? { evidenceDocumentId } : {}),
      ...(evidenceDocumentVersionId ? { evidenceDocumentVersionId } : {}),
      notes: mark(v.notes),
    },
    parentIds: {
      requestId,
      ...(evidenceDocumentId ? { evidenceDocumentId } : {}),
      ...(evidenceDocumentVersionId ? { evidenceDocumentVersionId } : {}),
    },
    label: `${reqKey} ${v.type} ${v.result}${v.blocking ? ' (bloqueante)' : ''}`,
  });
}

async function resolveBlocking(reqKey, actor, validationKey, resolutionNote) {
  const requestId = idOf(`req.${reqKey}`);
  const validationId = idOf(`validation.${reqKey}.${validationKey}`);
  await ensureAction(`validation.${reqKey}.${validationKey}.resolve-blocking`, {
    actor,
    method: 'PATCH',
    route: `/requests/${requestId}/validations/${validationId}/resolve-blocking`,
    body: { resolutionNote },
    target: { entity: 'ValidationRecord', id: validationId },
  });
}

async function advance(reqKey, actor, stage, note) {
  const requestId = idOf(`req.${reqKey}`);
  const gate = stage === 'confirm-stabilization' ? 'GC5' : 'GC4';
  await ensureAction(`gov.${reqKey}.${stage}`, {
    actor,
    method: 'POST',
    route: `/requests/${requestId}/gates/${gate}/${stage}`,
    body: note ? { note } : {},
    target: { entity: 'Request', id: requestId },
  });
}

async function approveGate(reqKey, actor, gateCode, authorityNote) {
  const requestId = idOf(`req.${reqKey}`);
  await ensureAction(`gov.${reqKey}.approve.${gateCode}`, {
    actor,
    method: 'POST',
    route: `/requests/${requestId}/gates/${gateCode}/approve`,
    body: { authorityNote },
    target: { entity: 'GateCheck', id: idOf(`gate.${reqKey}.${gateCode}`) },
  });
}

async function waiveGate(reqKey, actor, gateCode, waiverReason) {
  const requestId = idOf(`req.${reqKey}`);
  await ensureAction(`gov.${reqKey}.waive.${gateCode}`, {
    actor,
    method: 'POST',
    route: `/requests/${requestId}/gates/${gateCode}/waive`,
    body: { waiverReason },
    target: { entity: 'GateCheck', id: idOf(`gate.${reqKey}.${gateCode}`) },
  });
}

async function blockRequest(reqKey, actor, blockReason) {
  const requestId = idOf(`req.${reqKey}`);
  await ensureAction(`gov.${reqKey}.block`, {
    actor,
    method: 'POST',
    route: `/requests/${requestId}/block`,
    body: { blockReason },
    target: { entity: 'Request', id: requestId },
  });
}

/** Solicitudes con acciones de gobierno (se registran sus GateCheck). */
const GOVERNED_REQUESTS = ['R01', 'R02', 'R07', 'R08', 'R10', 'R13', 'R19'];

async function loadGovernance() {
  // R01 · En ejecucion, ruta completa: GC4 con faltantes y un defecto bloqueante abierto.
  await setRoute('R01', 'beto', 'COMPLETA');
  await addPending('R01', 'GC4', 'beto', 'P1', {
    description: 'Plan de reversión del modelo de datos sin documentar.',
    owner: 'beto',
    reviewDate: '2026-11-20',
  });
  await addPending('R01', 'GC4', 'beto', 'P2', {
    description: 'Definir el responsable de soporte de segundo nivel del tablero.',
    owner: 'jefe',
    reviewDate: '2026-11-27',
  });
  await addValidation('R01', 'beto', 'V1', {
    type: 'COMPONENTE_INTEGRACION',
    testCase: 'Carga incremental diaria de ventas y costos desde el ERP durante cinco días consecutivos.',
    version: '0.3.0',
    environment: 'Pruebas',
    result: 'APROBADA',
    executedBy: 'mateo',
    executedAt: at('2026-10-08', '19:00'),
    evidenceRef: 'https://repositorio.example.com/bi/tablero-ventas-margen/pruebas/carga-incremental.xlsx',
    notes: 'Totales cuadrados contra el ERP en las cinco cargas.',
  });
  await addValidation('R01', 'carla', 'V2', {
    type: 'REGRESION',
    testCase: 'Totales de margen por regional frente al cierre contable de septiembre.',
    version: '0.3.0',
    environment: 'Pruebas',
    result: 'FALLIDA',
    blocking: true,
    executedBy: 'carla',
    executedAt: at('2026-10-09', '21:30'),
    notes: 'Diferencia de 2,3 % en la regional Antioquia; se registró la novedad correspondiente.',
  });

  // R02 · Comprometida y bloqueada por acceso a datos.
  await setRoute('R02', 'beto', 'COMPLETA');
  await addPending('R02', 'GC3', 'beto', 'P1', {
    description: 'Acceso a la vista de cartera castigada aprobado por Seguridad de la Información.',
    owner: 'beto',
    reviewDate: '2026-10-20',
  });
  await blockRequest(
    'R02',
    'beto',
    'Sin acceso a la vista de cartera castigada del data lake: la solicitud de permisos TI-4821 sigue pendiente con Tecnología.',
  );

  // R07 · Solicitar validacion -> validaciones (bloqueante resuelto) -> marcar lista.
  await setRoute('R07', 'jefe', 'COMPLETA');
  await advance('R07', 'jefe', 'request-validation', 'Desarrollo terminado; se inician las validaciones de liberación.');
  await addValidation('R07', 'jefe', 'V1', {
    type: 'COMPONENTE_INTEGRACION',
    testCase: 'Publicación de pedidos con más de 200 líneas.',
    version: '1.3.2',
    environment: 'Pruebas',
    result: 'FALLIDA',
    blocking: true,
    executedBy: 'mateo',
    executedAt: at('2026-10-06', '20:00'),
    notes: 'La plataforma logística rechaza los mensajes que superan el tamaño máximo configurado.',
  });
  await resolveBlocking('R07', 'jefe', 'V1', 'Se ajustó el tamaño máximo de mensaje y se reprobó con pedidos de 500 líneas.');
  await addValidation('R07', 'jefe', 'V2', {
    type: 'COMPONENTE_INTEGRACION',
    testCase: 'Reprueba de pedidos de 200 a 500 líneas tras el ajuste del tamaño de mensaje.',
    version: '1.4.0',
    environment: 'Pruebas',
    result: 'APROBADA',
    executedBy: 'mateo',
    executedAt: at('2026-10-08', '16:00'),
    notes: 'Los 40 pedidos de prueba se publicaron sin errores.',
  });
  await addValidation('R07', 'jefe', 'V3', {
    type: 'FUNCIONAL_ACEPTACION',
    testCase: 'Casos de aceptación CP-01 a CP-04 con Operaciones Logísticas.',
    version: '1.4.0',
    environment: 'Pruebas',
    result: 'APROBADA_CON_OBSERVACIONES',
    executedBy: 'valentina',
    executedAt: at('2026-10-09', '17:00'),
    evidenceDoc: 'D3',
    evidenceVersion: 'v2',
    notes: 'Observación: traducir al español el mensaje de error del caso CP-03.',
  });
  await addValidation('R07', 'jefe', 'V4', {
    type: 'RENDIMIENTO_CONTINUIDAD',
    testCase: 'Carga sostenida de 48.000 pedidos por hora durante dos horas.',
    version: '1.4.0',
    environment: 'Preproducción',
    result: 'APROBADA',
    executedBy: 'valentina',
    executedAt: at('2026-10-09', '22:00'),
    notes: 'Tiempo promedio de publicación de 1,8 minutos; sin pérdida de mensajes.',
  });
  await addPending('R07', 'GC4', 'jefe', 'P1', {
    description: 'Plan de reversión aprobado por Arquitectura.',
    owner: 'valentina',
    reviewDate: '2026-10-14',
  });
  await resolvePending('R07', 'GC4', 'jefe', 'P1');
  await addPending('R07', 'GC4', 'jefe', 'P2', {
    description: 'Confirmar la ventana de despliegue con el centro de distribución.',
    owner: 'valentina',
    reviewDate: '2026-10-16',
  });
  await advance('R07', 'jefe', 'mark-ready', 'Validaciones obligatorias aprobadas; lista para la decisión de liberación.');

  // R08 · Ciclo completo hasta CERRADA (aprobacion de GC4 y GC5 por la autoridad).
  await setRoute('R08', 'jefe', 'SIMPLIFICADA');
  await advance('R08', 'jefe', 'request-validation', 'Construcción terminada.');
  await addValidation('R08', 'jefe', 'V1', {
    type: 'ACCESO_SEGURIDAD',
    testCase: 'Autorización por cliente, expiración de tokens y limitación de peticiones.',
    version: '1.0.0',
    environment: 'Pruebas',
    result: 'APROBADA',
    executedBy: 'valentina',
    executedAt: at('2026-09-18', '21:00'),
    notes: 'Sin hallazgos críticos ni altos.',
  });
  await addValidation('R08', 'jefe', 'V2', {
    type: 'FUNCIONAL_ACEPTACION',
    testCase: 'Consulta de saldos y movimientos desde el portal con 20 clientes de prueba.',
    version: '1.0.0',
    environment: 'Pruebas',
    result: 'APROBADA',
    executedBy: 'mateo',
    executedAt: at('2026-09-25', '20:00'),
    evidenceRef: 'https://repositorio.example.com/integraciones/api-saldos/pruebas/acta-aceptacion.pdf',
    notes: 'Aceptada por la Gerencia de Experiencia del Cliente.',
  });
  await advance('R08', 'jefe', 'mark-ready', 'Lista para liberar.');
  await approveGate('R08', 'jefe', 'GC4', 'Cambio estándar aprobado por la autoridad de cambios delegada.');
  await addPending('R08', 'GC5', 'jefe', 'P1', {
    description: 'Transferencia a la mesa de servicio con el runbook de operación.',
    owner: 'valentina',
    reviewDate: '2026-10-09',
  });
  await resolvePending('R08', 'GC5', 'jefe', 'P1');
  await advance('R08', 'jefe', 'confirm-stabilization', 'Una semana estable en producción con indicadores dentro de la meta.');
  await approveGate('R08', 'jefe', 'GC5', 'Cierre registrado: estabilidad, transferencia y expediente completos.');

  // R10 · Backlog priorizado, bloqueada por un tercero; falta confirmar capacidad (GC2).
  await setRoute('R10', 'jefe', 'COMPLETA');
  await addPending('R10', 'GC2', 'jefe', 'P1', {
    description: 'Confirmar la capacidad de Integraciones para noviembre.',
    owner: 'valentina',
    reviewDate: '2026-10-15',
  });
  await blockRequest(
    'R10',
    'jefe',
    'El proveedor tecnológico no ha entregado las credenciales del ambiente de habilitación; sin ellas no se pueden ejecutar pruebas.',
  );

  // R13 · Ruta de exploracion: GC4 no aplica (derivado) y GC5 dispensado con justificacion.
  await setRoute('R13', 'diego', 'EXPLORACION');
  await addPending('R13', 'GC3', 'diego', 'P1', {
    description: 'Concepto de Jurídica para usar documentos internos en el prototipo.',
    owner: 'diego',
    reviewDate: '2026-10-23',
  });
  await waiveGate(
    'R13',
    'diego',
    'GC5',
    'Prueba de concepto sin paso a producción: los hallazgos se documentan en el informe final y no hay transferencia a operación.',
  );

  // R19 · En cola de aprobacion con un requisito pendiente de compromiso.
  await setRoute('R19', 'jefe', 'COMPLETA');
  await addPending('R19', 'GC2', 'jefe', 'P1', {
    description: 'Patrocinio formal de la Vicepresidencia de Operaciones.',
    owner: 'jefe',
    reviewDate: '2026-10-16',
  });

  for (const reqKey of GOVERNED_REQUESTS) {
    await recordGates(reqKey);
  }
}

// --- Capacidad -----------------------------------------------------------------

async function loadCapacity() {
  const availabilityByMonth = new Map();
  for (const [person, month, hours] of AVAILABILITY) {
    const key = `avail.${person}.${month}`;
    if (hasEntity(key)) continue;
    if (!availabilityByMonth.has(month)) {
      availabilityByMonth.set(month, await api('jefe', 'GET', `/capacity/availability?month=${month}`));
    }
    const existing = availabilityByMonth.get(month).find((row) => row.userId === U[person]);
    if (existing) {
      skip(key, `ya existe disponibilidad preexistente (${existing.id}); no se modifica.`);
      continue;
    }
    await ensureEntity(key, {
      entity: 'MonthlyAvailability',
      actor: 'jefe',
      method: 'POST',
      route: '/capacity/availability',
      body: { userId: U[person], month, availableHours: hours },
      parentIds: { userId: U[person] },
      label: `${person} ${month}: ${hours} h`,
    });
  }

  for (const [creator, person, month, processCode, reqKey, hours, description] of ASSIGNMENTS) {
    const requestId = reqKey ? idOf(`req.${reqKey}`) : undefined;
    await ensureEntity(`assign.${month}.${person}.${processCode}.${reqKey ?? 'sin-solicitud'}`, {
      entity: 'Assignment',
      actor: creator,
      method: 'POST',
      route: '/capacity/assignments',
      body: {
        userId: U[person],
        month,
        processId: P[processCode],
        committedHours: hours,
        ...(requestId ? { requestId } : {}),
        description: mark(description),
      },
      parentIds: { userId: U[person], processId: P[processCode], ...(requestId ? { requestId } : {}) },
      label: `${person} ${month} ${processCode} ${reqKey ?? '-'}: ${hours} h`,
    });
  }
}

// --- Coordinacion ------------------------------------------------------------------

function activityBody(a) {
  return {
    classificationCode: a.cls,
    hours: a.hours,
    description: mark(a.description),
    ...(a.req ? { projectRequestId: idOf(`req.${a.req}`) } : {}),
    ...(a.task ? { taskId: idOf(`task.${a.task}`) } : {}),
    ...(a.issue ? { relatedIssueId: idOf(`issue.${a.issue}`) } : {}),
    ...(a.asset ? { assetRef: a.asset } : {}),
    ...(a.requester ? { requesterRef: a.requester } : {}),
    ...(a.justification ? { justification: a.justification } : {}),
    ...(a.result ? { result: a.result } : {}),
    ...(a.next ? { nextStep: a.next } : {}),
    ...(a.nextDate ? { nextStepDate: a.nextDate } : {}),
    ...(a.evidence ? { evidenceUrl: a.evidence } : {}),
    ...(a.status ? { activityStatus: a.status } : {}),
  };
}

async function loadIssues() {
  for (const i of ISSUES) {
    const requestId = i.request ? idOf(`req.${i.request}`) : undefined;
    const taskId = i.task ? idOf(`task.${i.task}`) : undefined;
    const issue = await ensureEntity(`issue.${i.key}`, {
      entity: 'Issue',
      actor: i.actor,
      method: 'POST',
      route: '/issues',
      body: {
        processId: P[i.process],
        date: i.date,
        title: i.title,
        typeCode: i.typeCode,
        detail: mark(i.detail),
        impact: i.impact,
        ...(requestId ? { relatedRequestId: requestId } : {}),
        ...(taskId ? { relatedTaskId: taskId } : {}),
        ...(i.assetRef ? { relatedAssetRef: i.assetRef } : {}),
        ...(i.resolver ? { resolverUserId: U[i.resolver] } : {}),
        ...(i.targetDate ? { targetDate: i.targetDate } : {}),
        ...(i.resolution ? { resolution: i.resolution } : {}),
      },
      parentIds: {
        processId: P[i.process],
        ...(requestId ? { relatedRequestId: requestId } : {}),
        ...(taskId ? { relatedTaskId: taskId } : {}),
        ...(i.resolver ? { resolverUserId: U[i.resolver] } : {}),
      },
      label: `${i.key} ${i.typeCode} · ${i.title}`,
    });
    for (const [index, toState] of i.transitions.entries()) {
      await ensureAction(`issue.${i.key}.transition.${index + 1}.${toState}`, {
        actor: i.actor,
        method: 'POST',
        route: `/issues/${issue.id}/transition`,
        body: { toState },
        target: { entity: 'Issue', id: issue.id },
        detail: { toState },
      });
    }
  }
}

async function loadMeetings() {
  for (const m of MEETINGS) {
    const requestId = m.request ? idOf(`req.${m.request}`) : undefined;
    const projectRequestId = m.projectRequest ? idOf(`req.${m.projectRequest}`) : undefined;
    const participantUserIds = m.participants.map((p) => U[p]);
    const meeting = await ensureEntity(`meeting.${m.key}`, {
      entity: 'Meeting',
      actor: m.actor,
      method: 'POST',
      route: '/meetings',
      body: {
        processId: P[m.process],
        title: m.title,
        meetingDate: m.date,
        meetingTime: m.time,
        participantUserIds,
        responsibleUserId: U[m.responsible],
        ...(requestId ? { relatedRequestId: requestId } : {}),
        ...(projectRequestId ? { relatedProjectRequestId: projectRequestId } : {}),
        agenda: m.agenda,
        ...(m.decisions ? { decisions: m.decisions } : {}),
        notes: mark(m.notes),
      },
      parentIds: {
        processId: P[m.process],
        participantUserIds,
        responsibleUserId: U[m.responsible],
        ...(requestId ? { relatedRequestId: requestId } : {}),
        ...(projectRequestId ? { relatedProjectRequestId: projectRequestId } : {}),
      },
      label: `${m.key} · ${m.title}`,
    });
    if (m.state) {
      await ensureAction(`meeting.${m.key}.state.${m.state}`, {
        actor: m.actor,
        method: 'PATCH',
        route: `/meetings/${meeting.id}`,
        body: { state: m.state },
        target: { entity: 'Meeting', id: meeting.id },
        detail: { state: m.state },
      });
    }
  }
}

async function loadCommitments() {
  for (const c of COMMITMENTS) {
    const requestId = c.request ? idOf(`req.${c.request}`) : undefined;
    const meetingId = c.meeting ? idOf(`meeting.${c.meeting}`) : undefined;
    const commitment = await ensureEntity(`commitment.${c.key}`, {
      entity: 'Commitment',
      actor: c.actor,
      method: 'POST',
      route: '/commitments',
      body: {
        processId: P[c.process],
        title: c.title,
        dueDate: c.dueDate,
        ...(meetingId ? { sourceMeetingId: meetingId } : {}),
        assignedUserId: U[c.assigned],
        responsibleUserId: U[c.responsible],
        ...(requestId ? { relatedRequestId: requestId } : {}),
        expectedResult: mark(c.expectedResult),
        ...(c.result ? { result: c.result } : {}),
        ...(c.blockers ? { blockers: c.blockers } : {}),
      },
      parentIds: {
        processId: P[c.process],
        ...(meetingId ? { sourceMeetingId: meetingId } : {}),
        assignedUserId: U[c.assigned],
        responsibleUserId: U[c.responsible],
        ...(requestId ? { relatedRequestId: requestId } : {}),
      },
      label: `${c.key} · ${c.title}`,
    });
    for (const [index, toState] of c.transitions.entries()) {
      await ensureAction(`commitment.${c.key}.transition.${index + 1}.${toState}`, {
        actor: c.actor,
        method: 'POST',
        route: `/commitments/${commitment.id}/transition`,
        body: { toState },
        target: { entity: 'Commitment', id: commitment.id },
        detail: { toState },
      });
    }
  }
}

async function loadWorklog() {
  for (const w of WORKLOG) {
    for (const d of w.days) {
      const key = `daily.${w.author}.${d.date}`;
      if (!hasEntity(key)) {
        const existing = await api(
          'jefe',
          'GET',
          `/worklog/daily?date=${d.date}&authorUserId=${U[w.author]}&processId=${P[w.process]}`,
        );
        if (existing.length > 0) {
          skip(key, `ya existe un diario preexistente (${existing[0].id}) para esa persona, proceso y fecha.`);
          continue;
        }
      }
      const log = await ensureEntity(key, {
        entity: 'DailyLog',
        actor: w.author,
        method: 'POST',
        route: '/worklog/daily',
        body: { processId: P[w.process], date: d.date, dayNotes: mark(d.notes) },
        parentIds: { authorUserId: U[w.author], processId: P[w.process] },
        label: `${w.author} ${d.date}`,
      });
      for (const [index, a] of d.acts.entries()) {
        await ensureEntity(`${key}.act.${index + 1}`, {
          entity: 'DailyLogActivity',
          actor: w.author,
          method: 'POST',
          route: `/worklog/daily/${log.id}/activities`,
          body: activityBody(a),
          parentIds: {
            dailyLogId: log.id,
            ...(a.req ? { projectRequestId: idOf(`req.${a.req}`) } : {}),
            ...(a.task ? { taskId: idOf(`task.${a.task}`) } : {}),
            ...(a.issue ? { relatedIssueId: idOf(`issue.${a.issue}`) } : {}),
          },
          label: `${w.author} ${d.date} ${a.cls} ${a.hours} h`,
        });
      }
      if (!w.draft.includes(d.date)) {
        await ensureAction(`${key}.submit`, {
          actor: w.author,
          method: 'POST',
          route: `/worklog/daily/${log.id}/submit`,
          target: { entity: 'DailyLog', id: log.id },
        });
      }
    }
  }
}

async function loadWeekly() {
  for (const w of WEEKLY) {
    const key = `weekly.${w.key}`;
    if (!hasEntity(key)) {
      const existing = await api('jefe', 'GET', `/weekly-reports?weekStart=${w.weekStart}&processId=${P[w.process]}`);
      const own = existing.find((r) => r.authorUserId === U[w.author]);
      if (own) {
        skip(key, `ya existe un semanal preexistente (${own.id}) para esa persona, proceso y semana.`);
        continue;
      }
    }
    const report = await ensureEntity(key, {
      entity: 'WeeklyReport',
      actor: w.author,
      method: 'POST',
      route: '/weekly-reports',
      body: {
        processId: P[w.process],
        weekStart: w.weekStart,
        ...w.body,
        decisions: mark(w.body.decisions),
      },
      parentIds: { authorUserId: U[w.author], processId: P[w.process] },
      label: `${w.key} ${w.author} semana ${w.weekStart}`,
    });
    if (w.submit) {
      await ensureAction(`${key}.submit`, {
        actor: w.author,
        method: 'POST',
        route: `/weekly-reports/${report.id}/submit`,
        target: { entity: 'WeeklyReport', id: report.id },
      });
    }
  }
}

// ===========================================================================
// VERIFICACION (solo lectura)
// ===========================================================================

const checks = [];

function check(label, ok, detail = '') {
  checks.push({ label, ok, detail });
  console.log(`  [${ok ? 'OK' : 'FALLA'}] ${label}${detail ? ` — ${detail}` : ''}`);
}

function countBy(rows, keyFn) {
  const counts = {};
  for (const row of rows) {
    const k = keyFn(row);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

const fmtCounts = (counts) =>
  Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');

const truncate = (text, max = 70) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

const idsOfEntity = (entity) =>
  new Set(manifest.entities.filter((e) => e.entity === entity).map((e) => e.id));

function codePoints(text) {
  return [...new Set([...text].filter((ch) => ch.codePointAt(0) > 127))]
    .slice(0, 6)
    .map((ch) => `${ch}=U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`)
    .join(' ');
}

function sameText(label, actual, expected) {
  const ok = actual === expected;
  check(`UTF-8 ${label}`, ok, `"${truncate(String(actual ?? ''), 80)}" [${codePoints(expected)}]`);
}

async function verify() {
  console.log('\n=== Verificación por la API (solo lectura) ===');

  // --- Conteos del manifiesto ---------------------------------------------------
  console.log('\nEntidades en el manifiesto:');
  const byEntity = countBy(manifest.entities, (e) => e.entity);
  for (const [entity, count] of Object.entries(byEntity)) {
    console.log(`  ${entity.padEnd(20)} ${count}`);
  }
  console.log(`  ${'(acciones)'.padEnd(20)} ${manifest.actions.length}`);
  console.log(`  ${'(omitidos)'.padEnd(20)} ${manifest.skipped.length}`);

  // --- Solicitudes ---------------------------------------------------------------
  console.log('\nSolicitudes:');
  const reqKeyById = new Map(
    REQUESTS.filter((r) => hasEntity(`req.${r.key}`)).map((r) => [idOf(`req.${r.key}`), r.key]),
  );
  const allRequests = await api('jefe', 'GET', '/requests');
  const mine = allRequests.filter((r) => reqKeyById.has(r.id));
  const portfolio = await api('jefe', 'GET', '/portfolio');
  const portfolioMine = portfolio
    .filter((p) => reqKeyById.has(p.id))
    .sort((a, b) => reqKeyById.get(a.id).localeCompare(reqKeyById.get(b.id)));
  for (const p of portfolioMine) {
    console.log(
      `  ${reqKeyById.get(p.id)} ${p.mainProcessCode} ${p.operationalState.padEnd(19)} ${String(p.priorityBand ?? '—').padEnd(3)} ${String(p.currentScore ?? '').padStart(3)} ${String(p.governanceRoute ?? '').padEnd(12)}${p.blocked ? ' [BLOQUEADA]' : ''} · ${truncate(p.title, 60)}`,
    );
  }
  const stateCounts = countBy(mine, (r) => r.operationalState);
  const bandCounts = countBy(portfolioMine, (p) => p.priorityBand ?? 'SIN_PRIORIZAR');
  console.log(`  Por estado: ${fmtCounts(stateCounts)}`);
  console.log(`  Por banda:  ${fmtCounts(bandCounts)}`);
  console.log(`  Por proceso: ${fmtCounts(countBy(portfolioMine, (p) => p.mainProcessCode))}`);
  check('19 solicitudes demo visibles', mine.length === REQUESTS.length, `${mine.length}`);
  for (const band of ['P1', 'P2', 'P3', 'P4']) {
    check(`Banda ${band} presente`, (bandCounts[band] ?? 0) > 0, `${bandCounts[band] ?? 0}`);
  }
  for (const state of ['REGISTRADA', 'EN_TRIAGE', 'DEVUELTA', 'RECHAZADA', 'BACKLOG_PRIORIZADO', 'COMPROMETIDA', 'EN_PLANIFICACION', 'EN_EJECUCION', 'LISTA_PARA_LIBERAR', 'CERRADA']) {
    check(`Estado ${state} presente`, (stateCounts[state] ?? 0) > 0, `${stateCounts[state] ?? 0}`);
  }
  const blocked = portfolioMine.filter((p) => p.blocked);
  check('Solicitudes bloqueadas con motivo', blocked.length >= 2 && blocked.every((p) => p.blockedReason), blocked.map((p) => reqKeyById.get(p.id)).join(', '));
  for (const r of REQUESTS) {
    const expected = r.priorities?.length ? scoreOf(r.priorities[r.priorities.length - 1].criteria) : null;
    const p = portfolioMine.find((x) => reqKeyById.get(x.id) === r.key);
    if (p && expected !== null && p.currentScore !== expected) {
      check(`${r.key} score esperado ${expected}`, false, `API ${p.currentScore}`);
    }
  }

  // --- Planes y tareas ---------------------------------------------------------------
  console.log('\nPlanes:');
  const allTasks = [];
  for (const plan of PLANS) {
    if (!hasEntity(`plan.${plan.key}`)) continue;
    const requestId = idOf(`req.${plan.request}`);
    const planRes = await api('jefe', 'GET', `/requests/${requestId}/plan`);
    const phases = await api('jefe', 'GET', `/plans/${planRes.id}/phases`);
    const tasks = await api('jefe', 'GET', `/plans/${planRes.id}/tasks`);
    const guide = await api('jefe', 'GET', `/requests/${requestId}/plan/guide`);
    allTasks.push(...tasks);
    const startBlocked = tasks.filter(
      (t) => t.status === 'POR_HACER' && t.predecessors.some((p) => p.status !== 'TERMINADA' || !p.accepted),
    );
    console.log(
      `  ${plan.key} (${plan.request}) plan ${planRes.status}${planRes.returnReason ? ` (devuelto: ${truncate(planRes.returnReason, 50)})` : ''} · ${phases.length} fases · ${tasks.length} tareas [${fmtCounts(countBy(tasks, (t) => t.status))}] · aceptadas ${tasks.filter((t) => t.accepted).length} · hitos ${tasks.filter((t) => t.isMilestone).length} · inicio bloqueado por predecesoras ${startBlocked.length} · guía ${guide.pendings.length} pendientes`,
    );
    for (const pending of guide.pendings) {
      console.log(`      - ${pending.code}: ${pending.message}`);
    }
    if (plan.key === 'PD') {
      check('Guía de pendientes con ítems (plan PD)', guide.pendings.length > 0 && !guide.canSubmit, `${guide.pendings.length} pendientes`);
    }
  }
  const taskStatusCounts = countBy(allTasks, (t) => t.status);
  for (const status of ['POR_HACER', 'EN_CURSO', 'BLOQUEADA', 'EN_REVISION', 'TERMINADA']) {
    check(`Tareas en ${status}`, (taskStatusCounts[status] ?? 0) > 0, `${taskStatusCounts[status] ?? 0}`);
  }
  check('Tareas terminadas y aceptadas', allTasks.some((t) => t.status === 'TERMINADA' && t.accepted));
  check('Tareas terminadas sin aceptar', allTasks.some((t) => t.status === 'TERMINADA' && !t.accepted));
  check(
    'Dependencias sin cumplir (inicio bloqueado)',
    allTasks.some((t) => t.status === 'POR_HACER' && t.predecessors.some((p) => p.status !== 'TERMINADA' || !p.accepted)),
  );

  // --- Gobierno ------------------------------------------------------------------------
  console.log('\nGobierno:');
  for (const reqKey of GOVERNED_REQUESTS) {
    if (!hasEntity(`req.${reqKey}`)) continue;
    const requestId = idOf(`req.${reqKey}`);
    const board = await api('jefe', 'GET', `/requests/${requestId}/gates`);
    const gates = board.gates.map((g) => `${g.gateCode}:${g.status}`).join(' ');
    const openPending = board.gates.flatMap((g) => g.pendingItems.filter((p) => !p.resolved).map(() => g.gateCode));
    const gc4 = board.gates.find((g) => g.gateCode === 'GC4');
    const summary = gc4?.validationSummary;
    console.log(
      `  ${reqKey} ${board.operationalState} ruta=${board.governanceRoute ?? '—'}${board.blocked ? ' BLOQUEADA' : ''} · ${gates} · faltantes abiertos ${openPending.length}${summary ? ` · GC4 aprobable=${summary.approvable} (bloqueantes sin resolver ${summary.blockingUnresolved})` : ''}`,
    );
    for (const reason of summary?.blockingReasons ?? []) {
      console.log(`      - ${reason}`);
    }
    if (reqKey === 'R01') {
      check('R01: GC4 no aprobable por defecto bloqueante y falta de validación funcional', summary && !summary.approvable && summary.blockingUnresolved > 0);
    }
    if (reqKey === 'R07') {
      check('R07: lista para liberar con GC4 aprobable', board.operationalState === 'LISTA_PARA_LIBERAR' && summary?.approvable === true);
    }
    if (reqKey === 'R08') {
      const gc5 = board.gates.find((g) => g.gateCode === 'GC5');
      check('R08: cerrada con GC4 y GC5 aprobados', board.operationalState === 'CERRADA' && gc4?.status === 'CUMPLIDO' && gc5?.status === 'CUMPLIDO');
    }
    if (reqKey === 'R13') {
      const gc5 = board.gates.find((g) => g.gateCode === 'GC5');
      check('R13: exploración con GC4 no aplica y GC5 dispensado', gc4?.status === 'NO_APLICA' && gc5?.status === 'NO_APLICA' && Boolean(gc5?.waiverReason));
    }
  }
  const validationIds = idsOfEntity('ValidationRecord');
  const validations = [];
  for (const reqKey of ['R01', 'R07', 'R08']) {
    if (!hasEntity(`req.${reqKey}`)) continue;
    const rows = await api('jefe', 'GET', `/requests/${idOf(`req.${reqKey}`)}/validations`);
    validations.push(...rows.filter((v) => validationIds.has(v.id)));
  }
  check('Validaciones bloqueantes sin resolver', validations.some((v) => v.blocking && !v.blockingResolved));
  check('Validaciones bloqueantes resueltas', validations.some((v) => v.blocking && v.blockingResolved));

  // --- Capacidad ---------------------------------------------------------------------------
  console.log('\nCapacidad (resumen como jefe):');
  for (const month of ['2026-10', '2026-11']) {
    const rows = await api('jefe', 'GET', `/capacity/summary?month=${month}`);
    console.log(`  ${month}:`);
    for (const row of rows) {
      console.log(
        `    ${row.userName.padEnd(22)} disp=${String(row.disponible ?? '—').padStart(4)} comp=${String(row.comprometido).padStart(4)} plan=${String(row.planificado).padStart(4)} ${row.estado}${row.planSobreDisponible ? ' · planificado > disponible' : ''}`,
      );
    }
    const estados = new Set(rows.map((r) => r.estado));
    for (const estado of ['OK', 'SOBRECARGA', 'SIN_DISPONIBILIDAD']) {
      check(`Capacidad ${month}: fila ${estado}`, estados.has(estado));
    }
    check(`Capacidad ${month}: valores de planificado`, rows.some((r) => r.planificado > 0));
    if (month === '2026-10') {
      check('Capacidad 2026-10: planificado > disponible', rows.some((r) => r.planSobreDisponible));
    }
  }

  // --- Coordinacion y conocimiento ---------------------------------------------------------
  console.log('\nTrabajo y conocimiento (solo registros demo):');
  const mineOf = (rows, entity) => {
    const ids = idsOfEntity(entity);
    return rows.filter((r) => ids.has(r.id));
  };
  const today = '2026-10-10';
  const issues = mineOf(await api('jefe', 'GET', '/issues'), 'Issue');
  console.log(`  Novedades: ${issues.length} · estados ${fmtCounts(countBy(issues, (i) => i.state))} · tipos ${fmtCounts(countBy(issues, (i) => i.typeCode))} · ligadas a tarea ${issues.filter((i) => i.relatedTaskId).length}`);
  const meetings = mineOf(await api('jefe', 'GET', '/meetings'), 'Meeting');
  console.log(`  Reuniones: ${meetings.length} · estados ${fmtCounts(countBy(meetings, (m) => m.state))}`);
  const commitments = mineOf(await api('jefe', 'GET', '/commitments'), 'Commitment');
  const overdue = commitments.filter((c) => c.dueDate < today && !['COMPLETADO', 'ARCHIVADO'].includes(c.state));
  console.log(`  Compromisos: ${commitments.length} · estados ${fmtCounts(countBy(commitments, (c) => c.state))} · vencidos ${overdue.length}`);
  check('Compromisos vencidos', overdue.length > 0, `${overdue.length}`);
  const logs = mineOf(await api('jefe', 'GET', '/worklog/daily'), 'DailyLog');
  const activityCount = logs.reduce((sum, l) => sum + l.activities.length, 0);
  console.log(`  Diarios: ${logs.length} · estados ${fmtCounts(countBy(logs, (l) => l.status))} · actividades ${activityCount} · clasificaciones ${fmtCounts(countBy(logs.flatMap((l) => l.activities), (a) => a.classificationCode))}`);
  const weekly = mineOf(await api('jefe', 'GET', '/weekly-reports'), 'WeeklyReport');
  console.log(`  Semanales: ${weekly.length} · estados ${fmtCounts(countBy(weekly, (w) => w.status))}`);
  const assets = mineOf(await api('jefe', 'GET', '/assets'), 'Asset');
  console.log(`  Activos: ${assets.length} · estados ${fmtCounts(countBy(assets, (a) => a.status))} · tipos ${fmtCounts(countBy(assets, (a) => a.typeCode))}`);
  const documents = mineOf(await api('jefe', 'GET', '/documents'), 'Document');
  const versionCounts = [];
  for (const d of documents) {
    const versions = await api('jefe', 'GET', `/documents/${d.id}/versions`);
    versionCounts.push(`${truncate(d.title, 32)}=${versions.length}`);
  }
  console.log(`  Documentos: ${documents.length} · estados ${fmtCounts(countBy(documents, (d) => d.status))}`);
  console.log(`    versiones: ${versionCounts.join(' | ')}`);

  // --- Lectura de vuelta de textos con tildes y enes -------------------------------------------
  console.log('\nTextos con tildes/ñ leídos de vuelta:');
  for (const nu of NEW_USERS) {
    if (!hasEntity(`user.${nu.key}`)) continue;
    const user = await api('jefe', 'GET', `/users/${idOf(`user.${nu.key}`)}`);
    sameText(`usuario ${nu.key}`, user.name, nu.name);
  }
  const r03 = REQUESTS.find((r) => r.key === 'R03');
  sameText('título R03', (await api('jefe', 'GET', `/requests/${idOf('req.R03')}`)).title, r03.body.title);
  const r05 = REQUESTS.find((r) => r.key === 'R05');
  sameText('resultado esperado R05 (largo)', (await api('jefe', 'GET', `/requests/${idOf('req.R05')}`)).expectedResult, r05.body.expectedResult);
  const r09 = REQUESTS.find((r) => r.key === 'R09');
  const triage09 = await api('jefe', 'GET', `/requests/${idOf('req.R09')}/triage`);
  sameText('observaciones del triage R09', triage09[0]?.notes, r09.triage.body.notes);
  const d3 = await api('jefe', 'GET', `/documents/${idOf('doc.D3')}/content`);
  sameText('contenido del documento D3 v2', d3.content, mark(DOC_D3_V2));
  if (hasEntity('daily.carla.2026-10-09')) {
    const log = await api('jefe', 'GET', `/worklog/daily/${idOf('daily.carla.2026-10-09')}`);
    const expected = WORKLOG.find((w) => w.author === 'carla').days.find((d) => d.date === '2026-10-09').acts[0];
    sameText('actividad de bitácora (Carla 09/10)', log.activities[0]?.description, mark(expected.description));
  }
  const m1 = await api('jefe', 'GET', `/meetings/${idOf('meeting.M1')}`);
  sameText('título de la reunión M1', m1.title, MEETINGS[0].title);

  const failed = checks.filter((c) => !c.ok);
  console.log(`\nComprobaciones: ${checks.length - failed.length}/${checks.length} correctas.`);
  if (failed.length > 0) {
    console.log('Fallidas:');
    for (const f of failed) console.log(`  - ${f.label}${f.detail ? ` (${f.detail})` : ''}`);
  }
  return failed.length === 0;
}

// ===========================================================================
// MAIN
// ===========================================================================

async function runPhase(name, fn) {
  const before = { ...runStats };
  const started = Date.now();
  await fn();
  console.log(
    `- ${name}: +${runStats.created - before.created} entidades, +${runStats.actions - before.actions} acciones` +
      `${runStats.skipped - before.skipped ? `, ${runStats.skipped - before.skipped} omitidos` : ''} (${Date.now() - started} ms)`,
  );
}

async function main() {
  console.log(`API ${API_BASE} · manifiesto ${path.relative(process.cwd(), MANIFEST_PATH)}`);
  await preflight();

  if (!VERIFY_ONLY) {
    console.log('\n=== Carga (idempotente) ===');
    await runPhase('Personas y permisos', loadPeople);
    await runPhase('Solicitudes, triage, prioridad y aprobación', loadRequests);
    await runPhase('Planes, fases, tareas, dependencias y estados', loadPlans);
    await runPhase('Activos y documentos', loadKnowledge);
    await runPhase('Gobierno (rutas, faltantes, validaciones, gates, bloqueos)', loadGovernance);
    await runPhase('Capacidad (disponibilidad y asignaciones)', loadCapacity);
    await runPhase('Novedades', loadIssues);
    await runPhase('Reuniones', loadMeetings);
    await runPhase('Compromisos', loadCommitments);
    await runPhase('Bitácora diaria', loadWorklog);
    await runPhase('Reportes semanales', loadWeekly);
    console.log(
      `Total de esta ejecución: +${runStats.created} entidades, +${runStats.actions} acciones, ${runStats.skipped} omitidos.`,
    );
    if (warnings.length > 0) {
      console.log(`Advertencias: ${warnings.length}`);
    }
  }

  const ok = await verify();
  if (!ok) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(`\nERROR: ${error.message}`);
  if (error instanceof ApiError) {
    console.error('El manifiesto conserva todo lo creado hasta este punto; al corregir y re-ejecutar, los pasos registrados se omiten.');
  }
  process.exitCode = 1;
});
