/**
 * Seed sintetico idempotente para desarrollo (Fase 1 · Fundaciones).
 *
 * - Datos ficticios/anonimizados (dominio demo.local); sin datos personales
 *   reales ni valores de "ruido"/"aa".
 * - Idempotente: usa `upsert` por clave unica en cada entidad, de modo que
 *   re-ejecutarlo no duplica filas.
 * - Las escrituras del seed NO registran actorUserId (actor del sistema): no
 *   se crean AuditEvent aqui.
 *
 * Se ejecuta con tsx (devDependency), cableado via migrations.seed en
 * prisma.config.ts. Prisma 7 no autocarga el .env: lo cargamos explicitamente
 * desde la raiz del monorepo, igual que prisma.config.ts.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { hashPassword } from '../src/modules/auth/password-hash';
import { DEFAULT_AGENT_CONFIGS } from '../src/modules/ai/ai-defaults';

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, '../../../.env') });

const connectionString = process.env.DATABASE_URL;
if (!connectionString || connectionString.trim() === '') {
  throw new Error(
    'Database configuration missing: la variable de entorno DATABASE_URL no esta definida.',
  );
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// Contrasena comun para los usuarios sembrados (equipo real + genericos de
// respaldo). Pensada para arrancar las pruebas con el equipo; cada persona
// deberia cambiarla al entrar. Con AUTH_MODE=jwt, POST /auth/login la usa; el
// modo dev-header NO (sigue resolviendo por X-Actor-Id).
const DEV_PASSWORD = 'Prueba2026*';


// --- Datos sinteticos -------------------------------------------------------

const ROLES: Array<{ code: string; name: string }> = [
  { code: 'JEFE_AREA', name: 'Jefe de area' },
  { code: 'LIDER_PROCESO', name: 'Lider de proceso' },
  { code: 'INTEGRANTE', name: 'Integrante' },
];

// Areas organizativas. Se siembran PRIMERO porque Process.areaId es NOT NULL y
// referencia a Area. Por ahora solo Analitica; el admin podra crear mas.
const AREAS: Array<{ code: string; name: string; sortOrder: number }> = [
  { code: 'ANALITICA', name: 'Analitica', sortOrder: 0 },
];

const PROCESSES: Array<{
  code: string;
  name: string;
  framework: string;
  kind: string;
  sortOrder: number;
}> = [
  { code: 'FIBI', name: 'BI', framework: 'INS-006', kind: 'PROCESS', sortOrder: 1 },
  { code: 'FIID', name: 'Integraciones', framework: 'INS-005', kind: 'PROCESS', sortOrder: 2 },
  { code: 'FIAA', name: 'IA', framework: 'INS-004', kind: 'PROCESS', sortOrder: 3 },
  {
    code: 'FMAA',
    name: 'Coordinacion multiproceso',
    framework: 'INS-007',
    kind: 'COORDINATION',
    sortOrder: 4,
  },
];

const USERS: Array<{ identifier: string; name: string; isAdmin?: boolean }> = [
  // --- Equipo real (dominio corporativo) --------------------------------
  // Jhonatan: Jefe de area + Admin de SISTEMA (administra SMTP, areas, etc.).
  {
    identifier: 'jhonatan.pacheco@pharitechservices.com',
    name: 'Jhonatan Pacheco',
    isAdmin: true,
  },
  { identifier: 'julian.melo@pharitechservices.com', name: 'Julian Melo' },
  { identifier: 'rafael.monsalve@pharitechservices.com', name: 'Rafael Monsalve' },
  { identifier: 'wilmer.castro@pharitechservices.com', name: 'Wilmer Castro' },
  { identifier: 'brayan.fonseca@pharitechservices.com', name: 'Brayan Fonseca' },
  // --- Usuarios genericos de respaldo (uno por rol) ---------------------
  // Dominio demo.local para distinguirlos del equipo real. Utiles para probar
  // cada rol sin usar una cuenta real. admin@demo.local se conserva como
  // respaldo de acceso administrativo por si el login del equipo falla.
  { identifier: 'admin@demo.local', name: 'Admin Generico', isAdmin: true },
  { identifier: 'jefe@demo.local', name: 'Jefe Generico' },
  { identifier: 'lider@demo.local', name: 'Lider Generico' },
  { identifier: 'integrante@demo.local', name: 'Integrante Generico' },
];

/**
 * Grants del equipo real + los genericos de respaldo. Procesos: BI=FIBI,
 * Integraciones=FIID, IA=FIAA, Coordinacion=FMAA. Nota: LIDER_PROCESO ya
 * incluye las capacidades de INTEGRANTE en su proceso, por eso un "lider y
 * miembro" se modela con un unico grant de lider.
 */
const GRANTS: Array<{ userIdentifier: string; roleCode: string; processCode: string }> = [
  // --- Equipo real ------------------------------------------------------
  // Jhonatan Pacheco: Jefe de area sobre los 4 procesos (control total del area).
  { userIdentifier: 'jhonatan.pacheco@pharitechservices.com', roleCode: 'JEFE_AREA', processCode: 'FIBI' },
  { userIdentifier: 'jhonatan.pacheco@pharitechservices.com', roleCode: 'JEFE_AREA', processCode: 'FIID' },
  { userIdentifier: 'jhonatan.pacheco@pharitechservices.com', roleCode: 'JEFE_AREA', processCode: 'FIAA' },
  { userIdentifier: 'jhonatan.pacheco@pharitechservices.com', roleCode: 'JEFE_AREA', processCode: 'FMAA' },
  // Julian Melo: Lider de BI (incluye capacidades de miembro en BI).
  { userIdentifier: 'julian.melo@pharitechservices.com', roleCode: 'LIDER_PROCESO', processCode: 'FIBI' },
  // Rafael Monsalve: Lider de Integraciones (incluye miembro en Integraciones).
  { userIdentifier: 'rafael.monsalve@pharitechservices.com', roleCode: 'LIDER_PROCESO', processCode: 'FIID' },
  // Wilmer Castro: Lider de IA.
  { userIdentifier: 'wilmer.castro@pharitechservices.com', roleCode: 'LIDER_PROCESO', processCode: 'FIAA' },
  // Brayan Fonseca: Integrante de IA.
  { userIdentifier: 'brayan.fonseca@pharitechservices.com', roleCode: 'INTEGRANTE', processCode: 'FIAA' },
  // --- Genericos de respaldo -------------------------------------------
  // Jefe generico: JEFE_AREA en los 4 procesos.
  { userIdentifier: 'jefe@demo.local', roleCode: 'JEFE_AREA', processCode: 'FIBI' },
  { userIdentifier: 'jefe@demo.local', roleCode: 'JEFE_AREA', processCode: 'FIID' },
  { userIdentifier: 'jefe@demo.local', roleCode: 'JEFE_AREA', processCode: 'FIAA' },
  { userIdentifier: 'jefe@demo.local', roleCode: 'JEFE_AREA', processCode: 'FMAA' },
  // Lider generico: LIDER_PROCESO en BI (proceso de ejemplo para probar el rol).
  { userIdentifier: 'lider@demo.local', roleCode: 'LIDER_PROCESO', processCode: 'FIBI' },
  // Integrante generico: INTEGRANTE en BI.
  { userIdentifier: 'integrante@demo.local', roleCode: 'INTEGRANTE', processCode: 'FIBI' },
];

/** Maestras base confirmadas de `20-master-data.md` (sin valores de ruido). */
const CATALOG_ITEMS: Array<{ catalog: string; code: string; label: string; sortOrder: number }> =
  [
    // TRIAGE_DECISION
    { catalog: 'TRIAGE_DECISION', code: 'CONTINUAR', label: 'Continuar', sortOrder: 1 },
    { catalog: 'TRIAGE_DECISION', code: 'DEVOLVER', label: 'Devolver', sortOrder: 2 },
    { catalog: 'TRIAGE_DECISION', code: 'RECHAZAR', label: 'Rechazar', sortOrder: 3 },
    // CRITICALITY
    { catalog: 'CRITICALITY', code: 'BAJA', label: 'Baja', sortOrder: 1 },
    { catalog: 'CRITICALITY', code: 'MEDIA', label: 'Media', sortOrder: 2 },
    { catalog: 'CRITICALITY', code: 'ALTA', label: 'Alta', sortOrder: 3 },
    { catalog: 'CRITICALITY', code: 'CRITICA', label: 'Critica', sortOrder: 4 },
    // DATA_AVAILABILITY
    { catalog: 'DATA_AVAILABILITY', code: 'SI', label: 'Si', sortOrder: 1 },
    { catalog: 'DATA_AVAILABILITY', code: 'PARCIAL', label: 'Parcial', sortOrder: 2 },
    { catalog: 'DATA_AVAILABILITY', code: 'NO', label: 'No', sortOrder: 3 },
    // PRIORITY
    { catalog: 'PRIORITY', code: 'MUY_ALTA', label: 'Muy alta', sortOrder: 1 },
    { catalog: 'PRIORITY', code: 'ALTA', label: 'Alta', sortOrder: 2 },
    { catalog: 'PRIORITY', code: 'MEDIA', label: 'Media', sortOrder: 3 },
    { catalog: 'PRIORITY', code: 'BAJA', label: 'Baja', sortOrder: 4 },
    // TASK_STATUS
    { catalog: 'TASK_STATUS', code: 'POR_HACER', label: 'Por hacer', sortOrder: 1 },
    { catalog: 'TASK_STATUS', code: 'EN_CURSO', label: 'En curso', sortOrder: 2 },
    { catalog: 'TASK_STATUS', code: 'BLOQUEADA', label: 'Bloqueada', sortOrder: 3 },
    { catalog: 'TASK_STATUS', code: 'EN_REVISION', label: 'En revision', sortOrder: 4 },
    { catalog: 'TASK_STATUS', code: 'TERMINADA', label: 'Terminada', sortOrder: 5 },
    // DOC_STATUS
    { catalog: 'DOC_STATUS', code: 'BORRADOR', label: 'Borrador', sortOrder: 1 },
    { catalog: 'DOC_STATUS', code: 'VIGENTE', label: 'Vigente', sortOrder: 2 },
    { catalog: 'DOC_STATUS', code: 'ARCHIVADA', label: 'Archivada', sortOrder: 3 },
    { catalog: 'DOC_STATUS', code: 'PENDIENTE_APROBACION', label: 'Pendiente de aprobación', sortOrder: 4 },
    { catalog: 'DOC_STATUS', code: 'RECHAZADO', label: 'Rechazado', sortOrder: 5 },
    // DEMAND_TYPE
    { catalog: 'DEMAND_TYPE', code: 'DESARROLLO', label: 'Desarrollo', sortOrder: 1 },
    { catalog: 'DEMAND_TYPE', code: 'EVOLUCION', label: 'Evolucion', sortOrder: 2 },
    {
      catalog: 'DEMAND_TYPE',
      code: 'SOPORTE_INCIDENTE',
      label: 'Soporte-Incidente',
      sortOrder: 3,
    },
    { catalog: 'DEMAND_TYPE', code: 'DEUDA_TECNICA', label: 'Deuda tecnica', sortOrder: 4 },
    { catalog: 'DEMAND_TYPE', code: 'EXPLORACION', label: 'Exploracion', sortOrder: 5 },
    // ASSET_TYPE
    { catalog: 'ASSET_TYPE', code: 'MODELO_DATOS', label: 'Modelo de datos', sortOrder: 1 },
    { catalog: 'ASSET_TYPE', code: 'DASHBOARD', label: 'Dashboard', sortOrder: 2 },
    { catalog: 'ASSET_TYPE', code: 'INTEGRACION', label: 'Integracion', sortOrder: 3 },
    { catalog: 'ASSET_TYPE', code: 'API', label: 'API', sortOrder: 4 },
    { catalog: 'ASSET_TYPE', code: 'AGENTE', label: 'Agente', sortOrder: 5 },
    { catalog: 'ASSET_TYPE', code: 'MODELO_IA', label: 'Modelo de IA', sortOrder: 6 },
    { catalog: 'ASSET_TYPE', code: 'PIPELINE', label: 'Pipeline', sortOrder: 7 },
    { catalog: 'ASSET_TYPE', code: 'BASE_DATOS', label: 'Base de datos', sortOrder: 8 },
    { catalog: 'ASSET_TYPE', code: 'REPORTE', label: 'Reporte', sortOrder: 9 },
    { catalog: 'ASSET_TYPE', code: 'OTRO', label: 'Otro', sortOrder: 10 },
    // TRIAGE_ROUTE (Fase 2) - rutas confirmadas por BR-003.
    { catalog: 'TRIAGE_ROUTE', code: 'BI', label: 'BI', sortOrder: 1 },
    { catalog: 'TRIAGE_ROUTE', code: 'INTEGRACIONES', label: 'Integraciones', sortOrder: 2 },
    { catalog: 'TRIAGE_ROUTE', code: 'IA', label: 'IA', sortOrder: 3 },
    { catalog: 'TRIAGE_ROUTE', code: 'MULTIPROCESO', label: 'Multiproceso (FMAA)', sortOrder: 4 },
    // TRIAGE_SIZE (Fase 2) - escala conservadora provisional (D8), a revisar con el Site.
    { catalog: 'TRIAGE_SIZE', code: 'S', label: 'S', sortOrder: 1 },
    { catalog: 'TRIAGE_SIZE', code: 'M', label: 'M', sortOrder: 2 },
    { catalog: 'TRIAGE_SIZE', code: 'L', label: 'L', sortOrder: 3 },
    { catalog: 'TRIAGE_SIZE', code: 'XL', label: 'XL', sortOrder: 4 },
    // ACTIVITY_CLASS (Fase 5 · BR-014) - clasificacion de actividad del diario.
    { catalog: 'ACTIVITY_CLASS', code: 'PLANIFICADA', label: 'Trabajo planificado', sortOrder: 1 },
    { catalog: 'ACTIVITY_CLASS', code: 'SOPORTE', label: 'Operacion/soporte', sortOrder: 2 },
    { catalog: 'ACTIVITY_CLASS', code: 'INTERNA', label: 'Gestion interna', sortOrder: 3 },
    { catalog: 'ACTIVITY_CLASS', code: 'EXTRAORDINARIA', label: 'Extraordinaria', sortOrder: 4 },
    // ISSUE_TYPE (Fase 5) - BLOQUEO confirmado por `29`; el resto es seed P
    // reversible (`20` lista la familia pero no enumera estos codigos, §1.7/NIT-2).
    { catalog: 'ISSUE_TYPE', code: 'BLOQUEO', label: 'Bloqueo', sortOrder: 1 },
    { catalog: 'ISSUE_TYPE', code: 'INCIDENTE', label: 'Incidente', sortOrder: 2 },
    { catalog: 'ISSUE_TYPE', code: 'CALIDAD_DATOS', label: 'Calidad de datos', sortOrder: 3 },
    { catalog: 'ISSUE_TYPE', code: 'SOLICITUD_APOYO', label: 'Solicitud de apoyo', sortOrder: 4 },
    // RECORD_STATE (Fase 5 · `06`) - estado de registro (novedad/compromiso).
    { catalog: 'RECORD_STATE', code: 'BORRADOR', label: 'Borrador', sortOrder: 1 },
    { catalog: 'RECORD_STATE', code: 'EN_CURSO', label: 'En curso', sortOrder: 2 },
    { catalog: 'RECORD_STATE', code: 'BLOQUEADO', label: 'Bloqueado', sortOrder: 3 },
    { catalog: 'RECORD_STATE', code: 'COMPLETADO', label: 'Completado', sortOrder: 4 },
    { catalog: 'RECORD_STATE', code: 'ARCHIVADO', label: 'Archivado', sortOrder: 5 },
    // Fase 6 (activos y documentos · `20`/design §7). ASSET_TYPE y DOC_STATUS
    // ya se sembraron arriba (Fase 2 / Fase 1): NO se re-siembran. Las familias
    // TECHNOLOGY/SOURCE/FREQUENCY/DOC_CATEGORY son seed inicial `P` (valores de
    // ejemplo, lista no exhaustiva; ampliables por gestion de maestras sin
    // migracion).
    // TECHNOLOGY (plataforma/tecnologia; valores de ejemplo P).
    { catalog: 'TECHNOLOGY', code: 'QLIK', label: 'Qlik', sortOrder: 1 },
    { catalog: 'TECHNOLOGY', code: 'AWS', label: 'AWS', sortOrder: 2 },
    { catalog: 'TECHNOLOGY', code: 'PYTHON', label: 'Python', sortOrder: 3 },
    { catalog: 'TECHNOLOGY', code: 'SQL', label: 'SQL', sortOrder: 4 },
    { catalog: 'TECHNOLOGY', code: 'TALEND', label: 'Talend', sortOrder: 5 },
    { catalog: 'TECHNOLOGY', code: 'POWER_BI', label: 'Power BI', sortOrder: 6 },
    // SOURCE (fuente; valores de ejemplo P).
    { catalog: 'SOURCE', code: 'DATA_LAKE', label: 'Data Lake', sortOrder: 1 },
    { catalog: 'SOURCE', code: 'API', label: 'API', sortOrder: 2 },
    { catalog: 'SOURCE', code: 'BASE_DATOS', label: 'Base de datos', sortOrder: 3 },
    { catalog: 'SOURCE', code: 'ARCHIVO', label: 'Archivo', sortOrder: 4 },
    { catalog: 'SOURCE', code: 'APLICACION', label: 'Aplicacion', sortOrder: 5 },
    // FREQUENCY (frecuencia; valores de ejemplo P).
    { catalog: 'FREQUENCY', code: 'TIEMPO_REAL', label: 'Tiempo real', sortOrder: 1 },
    { catalog: 'FREQUENCY', code: 'CADA_HORA', label: 'Cada hora', sortOrder: 2 },
    { catalog: 'FREQUENCY', code: 'DIARIA', label: 'Diaria', sortOrder: 3 },
    { catalog: 'FREQUENCY', code: 'SEMANAL', label: 'Semanal', sortOrder: 4 },
    { catalog: 'FREQUENCY', code: 'MENSUAL', label: 'Mensual', sortOrder: 5 },
    { catalog: 'FREQUENCY', code: 'BAJO_DEMANDA', label: 'Bajo demanda', sortOrder: 6 },
    // DOC_CATEGORY (categoria de documento; conjunto minimo reversible P).
    { catalog: 'DOC_CATEGORY', code: 'TECNICA', label: 'Tecnica', sortOrder: 1 },
    { catalog: 'DOC_CATEGORY', code: 'FUNCIONAL', label: 'Funcional', sortOrder: 2 },
    { catalog: 'DOC_CATEGORY', code: 'OPERATIVA', label: 'Operativa', sortOrder: 3 },
    { catalog: 'DOC_CATEGORY', code: 'OTRO', label: 'Otro', sortOrder: 4 },
    { catalog: 'DOC_CATEGORY', code: 'CIERRE', label: 'Cierre de proyecto', sortOrder: 5 },
    // Fase 7 (gobierno de la demanda · design §2.7). Catalogos nuevos del marco
    // FCGR §4/§6/§7; seed inicial reversible (ampliable por gestion de maestras
    // sin migracion). GOVERNANCE_ROUTE = ruta proporcional (distinta de
    // TRIAGE_ROUTE); PRIORITY_BAND = banda P1-P4 del marco (la familia PRIORITY
    // orientadora existente NO se toca).
    // GOVERNANCE_ROUTE (marco §6).
    { catalog: 'GOVERNANCE_ROUTE', code: 'COMPLETA', label: 'Ruta completa', sortOrder: 1 },
    { catalog: 'GOVERNANCE_ROUTE', code: 'SIMPLIFICADA', label: 'Ruta simplificada', sortOrder: 2 },
    { catalog: 'GOVERNANCE_ROUTE', code: 'EXPLORACION', label: 'Ruta de exploracion', sortOrder: 3 },
    // VALIDATION_TYPE (6 tipos exactos del marco §7).
    {
      catalog: 'VALIDATION_TYPE',
      code: 'FUNCIONAL_ACEPTACION',
      label: 'Funcional y aceptacion',
      sortOrder: 1,
    },
    {
      catalog: 'VALIDATION_TYPE',
      code: 'COMPONENTE_INTEGRACION',
      label: 'Componente e integracion',
      sortOrder: 2,
    },
    { catalog: 'VALIDATION_TYPE', code: 'REGRESION', label: 'Regresion', sortOrder: 3 },
    { catalog: 'VALIDATION_TYPE', code: 'INFORMACION', label: 'Informacion', sortOrder: 4 },
    {
      catalog: 'VALIDATION_TYPE',
      code: 'ACCESO_SEGURIDAD',
      label: 'Acceso y seguridad',
      sortOrder: 5,
    },
    {
      catalog: 'VALIDATION_TYPE',
      code: 'RENDIMIENTO_CONTINUIDAD',
      label: 'Rendimiento y continuidad',
      sortOrder: 6,
    },
    // VALIDATION_RESULT (resultado de una prueba; el flag `blocking` del
    // registro es ortogonal al resultado).
    { catalog: 'VALIDATION_RESULT', code: 'APROBADA', label: 'Aprobada', sortOrder: 1 },
    {
      catalog: 'VALIDATION_RESULT',
      code: 'APROBADA_CON_OBSERVACIONES',
      label: 'Aprobada con observaciones',
      sortOrder: 2,
    },
    { catalog: 'VALIDATION_RESULT', code: 'FALLIDA', label: 'Fallida', sortOrder: 3 },
    { catalog: 'VALIDATION_RESULT', code: 'BLOQUEADA', label: 'Bloqueada por defecto', sortOrder: 4 },
    // PRIORITY_BAND (marco §4, D-A4): banda P1-P4 con glosa de la decision de
    // planificacion. La familia PRIORITY orientadora se conserva aparte.
    {
      catalog: 'PRIORITY_BAND',
      code: 'P1',
      label: 'P1 · Primera consideracion para compromiso',
      sortOrder: 1,
    },
    {
      catalog: 'PRIORITY_BAND',
      code: 'P2',
      label: 'P2 · Programacion en el horizonte cercano',
      sortOrder: 2,
    },
    {
      catalog: 'PRIORITY_BAND',
      code: 'P3',
      label: 'P3 · Planificacion ordinaria segun capacidad',
      sortOrder: 3,
    },
    {
      catalog: 'PRIORITY_BAND',
      code: 'P4',
      label: 'P4 · Reserva de demanda, reformulacion o cierre motivado',
      sortOrder: 4,
    },
    // RECURRING_ACTIVITY_TYPE (FEAT-001) - tipo de actividad recurrente. Seed
    // inicial reversible (ampliable por gestion de maestras sin migracion).
    { catalog: 'RECURRING_ACTIVITY_TYPE', code: 'REPORTE', label: 'Reporte', sortOrder: 1 },
    { catalog: 'RECURRING_ACTIVITY_TYPE', code: 'VALIDACION', label: 'Validacion', sortOrder: 2 },
    { catalog: 'RECURRING_ACTIVITY_TYPE', code: 'REVISION', label: 'Revision', sortOrder: 3 },
  ];

// --- Ejecucion idempotente --------------------------------------------------

async function main(): Promise<void> {
  // Roles. Idempotente por `code` unico. Para los uniques de un solo campo con
  // `name` custom, Prisma 7 no acepta ese campo en el `where` de upsert, asi
  // que resolvemos la fila por `findFirst` y creamos/actualizamos por `id`.
  for (const role of ROLES) {
    const existing = await prisma.role.findFirst({ where: { code: role.code } });
    if (existing) {
      await prisma.role.update({
        where: { id: existing.id },
        data: { name: role.name },
      });
    } else {
      await prisma.role.create({ data: { code: role.code, name: role.name } });
    }
  }

  // Areas. Se siembran ANTES que los procesos porque Process.areaId es NOT
  // NULL. Idempotente por `code` unico (mismo patron que Roles).
  for (const area of AREAS) {
    const existing = await prisma.area.findFirst({ where: { code: area.code } });
    if (existing) {
      await prisma.area.update({
        where: { id: existing.id },
        data: { name: area.name, sortOrder: area.sortOrder },
      });
    } else {
      await prisma.area.create({
        data: { code: area.code, name: area.name, sortOrder: area.sortOrder },
      });
    }
  }

  // Resolver el id del area Analitica para asignarla a todos los procesos
  // sembrados (escritura directa del campo areaId, sin pasar por DTO/API).
  const analiticaArea = await prisma.area.findFirst({
    where: { code: 'ANALITICA' },
  });
  if (!analiticaArea) {
    throw new Error(
      'Seed invalido: no se resolvio el area ANALITICA requerida por los procesos.',
    );
  }

  // Procesos. Idempotente por `code` unico (mismo patron que Roles). Todos los
  // procesos del seed pertenecen al area Analitica (areaId directo).
  for (const proc of PROCESSES) {
    const data = {
      name: proc.name,
      framework: proc.framework,
      kind: proc.kind,
      sortOrder: proc.sortOrder,
      areaId: analiticaArea.id,
    };
    const existing = await prisma.process.findFirst({ where: { code: proc.code } });
    if (existing) {
      await prisma.process.update({ where: { id: existing.id }, data });
    } else {
      await prisma.process.create({ data: { code: proc.code, ...data } });
    }
  }

  // Usuarios. Idempotente por `identifier` unico (mismo patron que Roles). Se
  // siembra `passwordHash` (hash bcrypt de DEV_PASSWORD) para poder probar el
  // login JWT en local; el modo dev-header no lo usa.
  const devPasswordHash = await hashPassword(DEV_PASSWORD);
  for (const user of USERS) {
    const existing = await prisma.user.findFirst({
      where: { identifier: user.identifier },
    });
    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          name: user.name,
          passwordHash: devPasswordHash,
          isAdmin: user.isAdmin ?? false,
        },
      });
    } else {
      await prisma.user.create({
        data: {
          identifier: user.identifier,
          name: user.name,
          passwordHash: devPasswordHash,
          isAdmin: user.isAdmin ?? false,
        },
      });
    }
  }

  // Maestras base en CatalogItem (upsert por catalog+code unico).
  for (const item of CATALOG_ITEMS) {
    await prisma.catalogItem.upsert({
      where: { catalog_code_unique: { catalog: item.catalog, code: item.code } },
      update: { label: item.label, sortOrder: item.sortOrder },
      create: {
        catalog: item.catalog,
        code: item.code,
        label: item.label,
        sortOrder: item.sortOrder,
      },
    });
  }

  // Grants (upsert por la combinacion unica userId+roleId+processId).
  // Se resuelven los ids a partir de las claves naturales ya sembradas.
  const [roleByCode, processByCode, userByIdentifier] = await Promise.all([
    prisma.role.findMany().then((rows) => new Map(rows.map((r) => [r.code, r.id]))),
    prisma.process.findMany().then((rows) => new Map(rows.map((p) => [p.code, p.id]))),
    prisma.user
      .findMany()
      .then((rows) => new Map(rows.map((u) => [u.identifier, u.id]))),
  ]);

  for (const grant of GRANTS) {
    const userId = userByIdentifier.get(grant.userIdentifier);
    const roleId = roleByCode.get(grant.roleCode);
    const processId = processByCode.get(grant.processCode);

    if (!userId || !roleId || !processId) {
      throw new Error(
        `Grant invalido: no se resolvieron las claves (${grant.userIdentifier}, ${grant.roleCode}, ${grant.processCode}).`,
      );
    }

    await prisma.grant.upsert({
      where: {
        grant_user_role_process_unique: { userId, roleId, processId },
      },
      // Reactivar un grant previo en vez de crear otro (soft-delete, §1.2).
      update: { active: true },
      create: { userId, roleId, processId, active: true },
    });
  }

  // IA Fase 1 (FEAT-001): configuracion inicial APAGADA, idempotente. La IA no
  // hace nada hasta que el ADMIN la encienda desde la plataforma.
  // - AiGlobalConfig es singleton: no tiene clave natural, se resuelve por
  //   findFirst y se crea solo si no existe (no se pisa lo que el admin cambie).
  // - AiAgentConfig (code='TRIAGE') por code unico (upsert idempotente).
  const existingAiGlobal = await prisma.aiGlobalConfig.findFirst();
  if (!existingAiGlobal) {
    await prisma.aiGlobalConfig.create({
      data: { enabled: false, credentialMode: 'iam-role' },
    });
  }

  // Fuente unica de los valores: src/modules/ai/ai-defaults.ts (tambien la usa la API al arrancar).
  for (const agent of DEFAULT_AGENT_CONFIGS) {
    await prisma.aiAgentConfig.upsert({
      where: { code: agent.code },
      // Re-ejecutar no reactiva ni cambia la config que el admin haya tocado: solo
      // asegura la existencia de la fila. Por eso update es vacio.
      update: {},
      create: { ...agent },
    });
  }

  const [areas, roles, processes, users, grants] = await Promise.all([
    prisma.area.count(),
    prisma.role.count(),
    prisma.process.count(),
    prisma.user.count(),
    prisma.grant.count(),
  ]);

  // eslint-disable-next-line no-console
  console.log(
    `Seed OK: ${areas} areas, ${roles} roles, ${processes} procesos, ${users} usuarios, ${grants} grants, ${CATALOG_ITEMS.length} maestras.`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error('Seed fallo:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
