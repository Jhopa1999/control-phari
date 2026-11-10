import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/**
 * Resuelve el conjunto de procesos que intervienen en una Request a partir de
 * los ids pedidos (design §2.3). Regla compartida por el triage y por la
 * gestión de procesos del plan (una sola fuente de verdad):
 *
 * - El proceso principal participa SIEMPRE (BR-001): se deduplica y se antepone.
 * - Cada proceso extra debe existir y estar activo (400 si no, sin exponer
 *   Prisma). La coordinación multiproceso (kind COORDINATION) SÍ puede
 *   participar; lo que no puede es ser el proceso principal (eso lo valida el
 *   triage al fijar el principal).
 * - NO filtra por alcance: intervenir no amplía el scope de nadie.
 *
 * Devuelve `[mainProcessId, ...extras]` sin duplicados.
 */
export async function resolveParticipantProcessIds(
  prisma: PrismaService,
  mainProcessId: string,
  participantProcessIds: string[] | undefined,
): Promise<string[]> {
  const requested = new Set<string>(participantProcessIds ?? []);
  // El principal se materializa siempre; se deduplica para no duplicarlo.
  requested.delete(mainProcessId);

  const extra = Array.from(requested);
  if (extra.length > 0) {
    const active = await prisma.process.findMany({
      where: { id: { in: extra }, active: true },
      select: { id: true },
    });
    if (active.length !== extra.length) {
      throw new BadRequestException('Revisa los datos ingresados.');
    }
  }

  return [mainProcessId, ...extra];
}
