import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
// NOTA: los @Inject() explicitos de PrismaService y AuditService son necesarios
// porque el generador de OpenAPI corre con tsx (esbuild), y esbuild no emite
// `design:paramtypes` de forma fiable cuando el constructor mezcla parametros
// sin decorar con uno decorado con @Inject (el token BEDROCK_CLIENT). Sin ellos,
// Nest no resuelve PrismaService al construir AppModule fuera de tsc.
import { CurrentActor } from '../auth/current-actor';
import { encryptSecret, decryptSecret } from './ai-crypto';
import {
  assertModelAllowed,
  BEDROCK_MODEL_CATALOG_ENTRIES,
} from './bedrock-model-catalog';
import { AiConfigResponseDto } from './dto/ai-config-response.dto';
import { BEDROCK_CLIENT, BedrockClient } from './bedrock.client';
import { AiGlobalConfigResponseDto } from './dto/ai-global-config-response.dto';
import { AiAgentConfigResponseDto } from './dto/ai-agent-config-response.dto';
import { AiConnectionTestDto } from './dto/ai-connection-test.dto';
import { UpdateAiGlobalConfigDto } from './dto/update-ai-global-config.dto';
import { UpdateAiAgentConfigDto } from './dto/update-ai-agent-config.dto';
import type { AiGlobalConfigModel } from '../../generated/prisma/models/AiGlobalConfig';
import type { AiAgentConfigModel } from '../../generated/prisma/models/AiAgentConfig';

/**
 * Administracion de la configuracion de IA en runtime (IA Fase 1, FEAT-001).
 * Calca SmtpConfigService: lee/escribe el singleton global y las filas de
 * agente, cifra el secret (lazy, ai-crypto = settings-crypto) y audita los
 * cambios. NUNCA devuelve el secret ni el ciphertext; solo `secretSet` y
 * `accessKeyIdLast4`.
 */
@Injectable()
export class AiConfigService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(BEDROCK_CLIENT) private readonly bedrock: BedrockClient,
  ) {}

  /** Lee el singleton global (0 o 1 fila). */
  private async loadGlobal(): Promise<AiGlobalConfigModel | null> {
    return this.prisma.aiGlobalConfig.findFirst();
  }

  private toGlobalResponse(
    row: AiGlobalConfigModel | null,
  ): AiGlobalConfigResponseDto {
    const accessKeyId = row?.awsAccessKeyId ?? null;
    return {
      enabled: row?.enabled ?? false,
      credentialMode:
        (row?.credentialMode as AiGlobalConfigResponseDto['credentialMode']) ??
        'iam-role',
      secretSet: !!(
        row &&
        row.awsSecretAccessKeyCipher &&
        row.awsSecretAccessKeyCipher.trim() !== ''
      ),
      accessKeyIdLast4:
        accessKeyId && accessKeyId.length >= 4 ? accessKeyId.slice(-4) : null,
      updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
    };
  }

  private toAgentResponse(row: AiAgentConfigModel): AiAgentConfigResponseDto {
    return {
      code: row.code,
      displayName: row.displayName,
      enabled: row.enabled,
      region: row.region,
      model: row.model,
      basePrompt: row.basePrompt,
      temperature: row.temperature,
      maxTokens: row.maxTokens,
      timeoutMs: row.timeoutMs,
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
    };
  }

  /**
   * Estado global + lista de agentes + catalogo de modelos permitidos (nunca
   * secretos). El catalogo se deriva de BEDROCK_MODEL_CATALOG para alimentar el
   * selector del Admin sin duplicar la lista en el frontend.
   */
  async getConfig(): Promise<AiConfigResponseDto> {
    const [globalRow, agentRows] = await Promise.all([
      this.loadGlobal(),
      this.prisma.aiAgentConfig.findMany({ orderBy: { code: 'asc' } }),
    ]);
    return {
      global: this.toGlobalResponse(globalRow),
      agents: agentRows.map((a) => this.toAgentResponse(a)),
      models: BEDROCK_MODEL_CATALOG_ENTRIES.map((m) => ({
        id: m.id,
        label: m.label,
        tier: m.tier,
      })),
    };
  }

  /**
   * Crea/actualiza el singleton global. Reglas deterministas del secret
   * (identicas al password SMTP). Cifra con encryptSecret y audita UPDATE.
   */
  async updateGlobal(
    actor: CurrentActor,
    dto: UpdateAiGlobalConfigDto,
  ): Promise<AiGlobalConfigResponseDto> {
    if (dto.awsSecretAccessKey === '') {
      throw new BadRequestException(
        'El secret no puede ser una cadena vacia; usa clearCredentials para limpiarlo.',
      );
    }
    if (
      dto.clearCredentials === true &&
      dto.awsSecretAccessKey !== undefined &&
      dto.awsSecretAccessKey !== ''
    ) {
      throw new BadRequestException(
        'No envies awsSecretAccessKey y clearCredentials a la vez.',
      );
    }

    const existing = await this.loadGlobal();

    let secretCipher: string | null | undefined;
    if (dto.awsSecretAccessKey !== undefined && dto.awsSecretAccessKey !== '') {
      secretCipher = encryptSecret(dto.awsSecretAccessKey);
    } else if (dto.clearCredentials === true) {
      secretCipher = null;
    } else {
      secretCipher = undefined;
    }

    // clearCredentials tambien limpia el access key id (es parte del par).
    const accessKeyIdTarget: string | null | undefined =
      dto.clearCredentials === true
        ? null
        : dto.awsAccessKeyId !== undefined
          ? dto.awsAccessKeyId
          : undefined;

    await this.prisma.$transaction(async (tx) => {
      let rowId: string;
      if (existing) {
        const updated = await tx.aiGlobalConfig.update({
          where: { id: existing.id },
          data: {
            ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
            ...(dto.credentialMode !== undefined
              ? { credentialMode: dto.credentialMode }
              : {}),
            ...(accessKeyIdTarget !== undefined
              ? { awsAccessKeyId: accessKeyIdTarget }
              : {}),
            ...(secretCipher !== undefined
              ? { awsSecretAccessKeyCipher: secretCipher }
              : {}),
            updatedByUserId: actor.userId,
          },
        });
        rowId = updated.id;
      } else {
        const created = await tx.aiGlobalConfig.create({
          data: {
            enabled: dto.enabled ?? false,
            credentialMode: dto.credentialMode ?? 'iam-role',
            awsAccessKeyId:
              accessKeyIdTarget === undefined ? null : accessKeyIdTarget,
            awsSecretAccessKeyCipher:
              secretCipher === undefined ? null : secretCipher,
            updatedByUserId: actor.userId,
          },
        });
        rowId = created.id;
      }

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'AI_CONFIG',
        objectId: rowId,
        scopeProcessId: null,
        before: null,
        after: null,
      });
    });

    return this.toGlobalResponse(await this.loadGlobal());
  }

  /** Lee un agente por code o lanza 404. */
  private async requireAgent(code: string): Promise<AiAgentConfigModel> {
    const row = await this.prisma.aiAgentConfig.findUnique({ where: { code } });
    if (!row) {
      throw new NotFoundException(`Agente de IA "${code}" no encontrado.`);
    }
    return row;
  }

  async getAgent(code: string): Promise<AiAgentConfigResponseDto> {
    return this.toAgentResponse(await this.requireAgent(code));
  }

  /**
   * Actualiza un agente. Valida `model` contra el catalogo cerrado y audita.
   * No toca secretos (viven en la config global).
   */
  async updateAgent(
    actor: CurrentActor,
    code: string,
    dto: UpdateAiAgentConfigDto,
  ): Promise<AiAgentConfigResponseDto> {
    const existing = await this.requireAgent(code);

    if (dto.model !== undefined) {
      assertModelAllowed(dto.model);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.aiAgentConfig.update({
        where: { id: existing.id },
        data: {
          ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
          ...(dto.region !== undefined ? { region: dto.region } : {}),
          ...(dto.model !== undefined ? { model: dto.model } : {}),
          ...(dto.basePrompt !== undefined
            ? { basePrompt: dto.basePrompt }
            : {}),
          ...(dto.temperature !== undefined
            ? { temperature: dto.temperature }
            : {}),
          ...(dto.maxTokens !== undefined ? { maxTokens: dto.maxTokens } : {}),
          ...(dto.timeoutMs !== undefined ? { timeoutMs: dto.timeoutMs } : {}),
          updatedByUserId: actor.userId,
        },
      });

      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'AI_CONFIG',
        objectId: existing.id,
        scopeProcessId: null,
        before: null,
        after: null,
      });
    });

    return this.toAgentResponse(await this.requireAgent(code));
  }

  /**
   * Prueba de conexion de un agente: en modo access-keys descifra el secret solo
   * en ese momento e invoca BedrockClient.ping. Devuelve { ok, message } legible
   * SIN secretos ni stack. Si el descifrado o la invocacion fallan -> ok:false
   * con mensaje amable.
   */
  async testAgent(code: string): Promise<AiConnectionTestDto> {
    const [agent, globalRow] = await Promise.all([
      this.requireAgent(code),
      this.loadGlobal(),
    ]);

    const mode = globalRow?.credentialMode ?? 'iam-role';
    let credentials: { accessKeyId: string; secretAccessKey: string } | undefined;

    if (mode === 'access-keys') {
      const accessKeyId = globalRow?.awsAccessKeyId ?? '';
      const cipher = globalRow?.awsSecretAccessKeyCipher ?? '';
      if (accessKeyId.trim() === '' || cipher.trim() === '') {
        return {
          ok: false,
          message:
            'IA mal configurada: faltan credenciales de AWS para el modo access-keys.',
        };
      }
      try {
        const secretAccessKey = decryptSecret(cipher);
        credentials = { accessKeyId, secretAccessKey };
      } catch {
        return { ok: false, message: 'IA mal configurada' };
      }
    }

    try {
      await this.bedrock.ping({
        region: agent.region,
        modelId: agent.model,
        temperature: agent.temperature,
        maxTokens: agent.maxTokens,
        timeoutMs: agent.timeoutMs,
        ...(credentials ? { credentials } : {}),
      });
      return { ok: true, message: 'Conexion con el modelo de IA exitosa.' };
    } catch {
      // Nunca se expone el detalle (stack/credenciales): mensaje breve y legible.
      return {
        ok: false,
        message: 'No se pudo conectar con el modelo de IA. Revisa la configuracion.',
      };
    }
  }
}
