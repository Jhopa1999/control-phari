import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { AssetModel } from '../../generated/prisma/models/Asset';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';

/**
 * Fuente unica de verdad del alcance de activos y documentos (design §2.2),
 * analogo a `capacity-scope.service.ts`. La LECTURA no distingue rol
 * (`assetScopeWhere`): integrante y lider leen igual sus procesos con grant
 * activo; el jefe ve todo. La frontera POR ROL (quien escribe/cambia estado)
 * vive SOLO en `requireAssetWritable`. Politica: 404 fuera de alcance de
 * lectura, 403 rol insuficiente.
 */
@Injectable()
export class KnowledgeScopeService {
  /**
   * Lectura/consulta (design §2.2). Jefe = sin frontera (`{}`); el resto = sus
   * procesos con grant activo (`scopedProcessIds`, union de grants, sin mirar
   * roleCode). Fuera de este `where` -> 404 (findFirst no encuentra).
   */
  assetScopeWhere(actor: CurrentActor): Prisma.AssetWhereInput {
    if (actor.isJefeArea) {
      return {};
    }
    return { processId: { in: Array.from(actor.scopedProcessIds) } };
  }

  /** Procesos donde el actor es LIDER_PROCESO (no cualquier grant). */
  private leaderProcessIds(actor: CurrentActor): string[] {
    return actor.grants
      .filter((grant) => grant.roleCode === RoleCode.LIDER_PROCESO)
      .map((grant) => grant.processId);
  }

  /**
   * Escritura/estado (design §2.2): jefe, o lider del proceso del activo. El
   * integrante con grant en el proceso solo puede crear/editar metadatos
   * mientras el activo permanezca en BORRADOR y la operacion no mueva el estado
   * (proponer); nunca cambiar el estado ni tocar un ACTIVO/RETIRADO. En otro
   * caso -> 403.
   */
  requireAssetWritable(
    actor: CurrentActor,
    asset: Pick<AssetModel, 'processId' | 'status'>,
    nextStatus: string,
  ): void {
    if (actor.isJefeArea) {
      return;
    }
    if (this.leaderProcessIds(actor).includes(asset.processId)) {
      return;
    }
    const scoped = actor.scopedProcessIds.has(asset.processId);
    const onlyBorrador = asset.status === 'BORRADOR' && nextStatus === 'BORRADOR';
    if (scoped && onlyBorrador) {
      return;
    }
    throw new ForbiddenException('Tu rol solo permite proponer en borrador.');
  }

  /**
   * Autoridad reservada a lider/jefe (design §2.3): cambiar el estado del
   * documento. El integrante nunca puede, aunque el activo este en BORRADOR.
   * Jefe ⇒ ok; lider del proceso del activo ⇒ ok; en otro caso ⇒ 403.
   */
  requireProcessManager(
    actor: CurrentActor,
    asset: Pick<AssetModel, 'processId'>,
  ): void {
    if (actor.isJefeArea) {
      return;
    }
    if (this.leaderProcessIds(actor).includes(asset.processId)) {
      return;
    }
    throw new ForbiddenException('Solo el lider del proceso o el jefe de area puede gestionar el estado.');
  }
}
