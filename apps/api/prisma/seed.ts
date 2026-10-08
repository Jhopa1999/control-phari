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

// --- Datos sinteticos -------------------------------------------------------

const ROLES: Array<{ code: string; name: string }> = [
  { code: 'JEFE_AREA', name: 'Jefe de area' },
  { code: 'LIDER_PROCESO', name: 'Lider de proceso' },
  { code: 'INTEGRANTE', name: 'Integrante' },
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

const USERS: Array<{ identifier: string; name: string }> = [
  { identifier: 'jefe@demo.local', name: 'Ana Jefa' },
  { identifier: 'lider.bi@demo.local', name: 'Beto Lider BI' },
  { identifier: 'integrante.bi@demo.local', name: 'Carla Integrante BI' },
  { identifier: 'lider.ia@demo.local', name: 'Diego Lider IA' },
];

/** Grants que ejercitan los controles negativos de `10`. */
const GRANTS: Array<{ userIdentifier: string; roleCode: string; processCode: string }> = [
  // Jefa: JEFE_AREA en los 4 procesos (control de area completa).
  { userIdentifier: 'jefe@demo.local', roleCode: 'JEFE_AREA', processCode: 'FIBI' },
  { userIdentifier: 'jefe@demo.local', roleCode: 'JEFE_AREA', processCode: 'FIID' },
  { userIdentifier: 'jefe@demo.local', roleCode: 'JEFE_AREA', processCode: 'FIAA' },
  { userIdentifier: 'jefe@demo.local', roleCode: 'JEFE_AREA', processCode: 'FMAA' },
  // Lider BI: LIDER_PROCESO solo en FIBI.
  { userIdentifier: 'lider.bi@demo.local', roleCode: 'LIDER_PROCESO', processCode: 'FIBI' },
  // Integrante BI: INTEGRANTE solo en FIBI.
  { userIdentifier: 'integrante.bi@demo.local', roleCode: 'INTEGRANTE', processCode: 'FIBI' },
  // Lider IA: LIDER_PROCESO solo en FIAA.
  { userIdentifier: 'lider.ia@demo.local', roleCode: 'LIDER_PROCESO', processCode: 'FIAA' },
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

  // Procesos. Idempotente por `code` unico (mismo patron que Roles).
  for (const proc of PROCESSES) {
    const data = {
      name: proc.name,
      framework: proc.framework,
      kind: proc.kind,
      sortOrder: proc.sortOrder,
    };
    const existing = await prisma.process.findFirst({ where: { code: proc.code } });
    if (existing) {
      await prisma.process.update({ where: { id: existing.id }, data });
    } else {
      await prisma.process.create({ data: { code: proc.code, ...data } });
    }
  }

  // Usuarios. Idempotente por `identifier` unico (mismo patron que Roles).
  for (const user of USERS) {
    const existing = await prisma.user.findFirst({
      where: { identifier: user.identifier },
    });
    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { name: user.name },
      });
    } else {
      await prisma.user.create({
        data: { identifier: user.identifier, name: user.name },
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

  const [roles, processes, users, grants] = await Promise.all([
    prisma.role.count(),
    prisma.process.count(),
    prisma.user.count(),
    prisma.grant.count(),
  ]);

  // eslint-disable-next-line no-console
  console.log(
    `Seed OK: ${roles} roles, ${processes} procesos, ${users} usuarios, ${grants} grants, ${CATALOG_ITEMS.length} maestras.`,
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
