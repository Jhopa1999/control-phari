// Seed autonomo para el entorno de PRODUCCION (Docker).
//
// El seed de desarrollo (apps/api/prisma/seed.ts) importa archivos de `src/`
// que NO estan en la imagen runtime de produccion. Este script es equivalente
// pero se apoya solo en artefactos presentes en la imagen:
//   - el Prisma Client COMPILADO en dist/generated/prisma
//   - bcrypt (dependencia de produccion)
//
// Idempotente (findFirst + create/update). Lee DATABASE_URL del entorno.
// Se ejecuta DENTRO del contenedor api:
//   docker compose -f compose.prod.yaml --env-file .env.production \
//     run --rm --entrypoint sh api -c \
//     "node apps/api/dist-seed/prod-seed-users.mjs"
//
// NOTA: la contrasena DEV_PASSWORD es la credencial inicial compartida para que
// el equipo pueda entrar. Cambiala por usuario desde la administracion del
// portal en cuanto sea posible; no es un secreto fuerte.
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '/repo/apps/api/dist/generated/prisma/client.js';
import bcrypt from 'bcrypt';
const DEV_PASSWORD = 'dev1234';
const BCRYPT_COST = 10;
const connectionString = process.env.DATABASE_URL;
if (!connectionString || connectionString.trim() === '') {
  throw new Error('DATABASE_URL no esta definida.');
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });
const ROLES = [
  { code: 'JEFE_AREA', name: 'Jefe de area' },
  { code: 'LIDER_PROCESO', name: 'Lider de proceso' },
  { code: 'INTEGRANTE', name: 'Integrante' },
];
const PROCESSES = [
  { code: 'FIBI', name: 'BI', framework: 'INS-006', kind: 'PROCESS', sortOrder: 1 },
  { code: 'FIID', name: 'Integraciones', framework: 'INS-005', kind: 'PROCESS', sortOrder: 2 },
  { code: 'FIAA', name: 'IA', framework: 'INS-004', kind: 'PROCESS', sortOrder: 3 },
  { code: 'FMAA', name: 'Coordinacion multiproceso', framework: 'INS-007', kind: 'COORDINATION', sortOrder: 4 },
];
const USERS = [
  // Admin de SISTEMA inicial (design h): sembrado directo con isAdmin=true, sin
  // grants (su alcance es global). dev1234 es credencial inicial a cambiar.
  { identifier: 'admin@demo.local', name: 'Alex Admin', isAdmin: true },
  { identifier: 'jefe@demo.local', name: 'Ana Jefa' },
  { identifier: 'lider.bi@demo.local', name: 'Beto Lider BI' },
  { identifier: 'integrante.bi@demo.local', name: 'Carla Integrante BI' },
  { identifier: 'lider.ia@demo.local', name: 'Diego Lider IA' },
];
const GRANTS = [
  { userIdentifier: 'jefe@demo.local', roleCode: 'JEFE_AREA', processCode: 'FIBI' },
  { userIdentifier: 'jefe@demo.local', roleCode: 'JEFE_AREA', processCode: 'FIID' },
  { userIdentifier: 'jefe@demo.local', roleCode: 'JEFE_AREA', processCode: 'FIAA' },
  { userIdentifier: 'jefe@demo.local', roleCode: 'JEFE_AREA', processCode: 'FMAA' },
  { userIdentifier: 'lider.bi@demo.local', roleCode: 'LIDER_PROCESO', processCode: 'FIBI' },
  { userIdentifier: 'integrante.bi@demo.local', roleCode: 'INTEGRANTE', processCode: 'FIBI' },
  { userIdentifier: 'lider.ia@demo.local', roleCode: 'LIDER_PROCESO', processCode: 'FIAA' },
];
async function main() {
  for (const role of ROLES) {
    const existing = await prisma.role.findFirst({ where: { code: role.code } });
    if (existing) {
      await prisma.role.update({ where: { id: existing.id }, data: { name: role.name } });
    } else {
      await prisma.role.create({ data: { code: role.code, name: role.name } });
    }
  }
  for (const proc of PROCESSES) {
    const data = { name: proc.name, framework: proc.framework, kind: proc.kind, sortOrder: proc.sortOrder };
    const existing = await prisma.process.findFirst({ where: { code: proc.code } });
    if (existing) {
      await prisma.process.update({ where: { id: existing.id }, data });
    } else {
      await prisma.process.create({ data: { code: proc.code, ...data } });
    }
  }
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, BCRYPT_COST);
  for (const user of USERS) {
    const existing = await prisma.user.findFirst({ where: { identifier: user.identifier } });
    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { name: user.name, passwordHash, isAdmin: user.isAdmin ?? false },
      });
    } else {
      await prisma.user.create({
        data: {
          identifier: user.identifier,
          name: user.name,
          passwordHash,
          isAdmin: user.isAdmin ?? false,
        },
      });
    }
  }
  const [roleByCode, processByCode, userByIdentifier] = await Promise.all([
    prisma.role.findMany().then((rows) => new Map(rows.map((r) => [r.code, r.id]))),
    prisma.process.findMany().then((rows) => new Map(rows.map((p) => [p.code, p.id]))),
    prisma.user.findMany().then((rows) => new Map(rows.map((u) => [u.identifier, u.id]))),
  ]);
  for (const grant of GRANTS) {
    const userId = userByIdentifier.get(grant.userIdentifier);
    const roleId = roleByCode.get(grant.roleCode);
    const processId = processByCode.get(grant.processCode);
    if (!userId || !roleId || !processId) {
      throw new Error(`Grant invalido: ${grant.userIdentifier} / ${grant.roleCode} / ${grant.processCode}`);
    }
    await prisma.grant.upsert({
      where: { grant_user_role_process_unique: { userId, roleId, processId } },
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
  console.log(`Seed PROD OK: ${roles} roles, ${processes} procesos, ${users} usuarios, ${grants} grants.`);
}
main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error('Seed PROD fallo:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
