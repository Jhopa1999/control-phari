import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentActor } from '../auth/current-actor';
import {
  BEDROCK_MODEL_TIERS,
  DEFAULT_MODEL_CATALOG,
  type BedrockModelTier,
} from './bedrock-model-catalog';
import { AiModelCatalogEntryDto } from './dto/ai-model-catalog-entry.dto';
import { CreateAiModelDto, UpdateAiModelDto } from './dto/save-ai-model.dto';
import type { AiModelModel } from '../../generated/prisma/models/AiModel';

/**
 * Catalogo de modelos de IA en BD (BL-032 F0). Sustituye a la lista cerrada en
 * codigo: el Admin da de alta/edita modelos y sus CAPACIDADES sin desplegar. Los
 * modelos por defecto se siembran al arrancar sin pisar cambios del admin.
 */
@Injectable()
export class AiModelCatalogService implements OnModuleInit {
  private readonly logger = new Logger(AiModelCatalogService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** Siembra los modelos por defecto; un fallo no impide arrancar la API. */
  async onModuleInit(): Promise<void> {
    try {
      await this.ensureDefaults();
    } catch (error) {
      this.logger.warn(
        `No se pudo asegurar el catalogo de modelos de IA: ${
          error instanceof Error ? error.message : 'error desconocido'
        }`,
      );
    }
  }

  /** Crea los modelos por defecto que falten (update vacio: no pisa al admin). */
  async ensureDefaults(): Promise<void> {
    for (const model of DEFAULT_MODEL_CATALOG) {
      await this.prisma.aiModel.upsert({
        where: { modelId: model.modelId },
        update: {},
        create: { ...model, enabled: true },
      });
    }
  }

  private toEntry(row: AiModelModel): AiModelCatalogEntryDto {
    return {
      id: row.modelId,
      label: row.label,
      tier: (BEDROCK_MODEL_TIERS as readonly string[]).includes(row.tier)
        ? (row.tier as BedrockModelTier)
        : 'other',
      enabled: row.enabled,
      supportsTemperature: row.supportsTemperature,
      supportsTools: row.supportsTools,
      supportsVision: row.supportsVision,
      supportsDocuments: row.supportsDocuments,
      inputUsdPerMTok: row.inputUsdPerMTok,
      outputUsdPerMTok: row.outputUsdPerMTok,
      sortOrder: row.sortOrder,
    };
  }

  /** Modelos habilitados (selector del Admin y validacion de agentes). */
  async listEnabled(): Promise<AiModelCatalogEntryDto[]> {
    const rows = await this.prisma.aiModel.findMany({
      where: { enabled: true },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    return rows.map((row) => this.toEntry(row));
  }

  /** Todos los modelos, incluidos los deshabilitados (gestion del Admin). */
  async listAll(): Promise<AiModelCatalogEntryDto[]> {
    const rows = await this.prisma.aiModel.findMany({
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    return rows.map((row) => this.toEntry(row));
  }

  /** 400 si el modelo no existe en el catalogo o esta deshabilitado. */
  async assertAllowed(modelId: string): Promise<void> {
    const row = await this.prisma.aiModel.findUnique({ where: { modelId } });
    if (!row || !row.enabled) {
      throw new BadRequestException(
        'El modelo seleccionado no esta en el catalogo de modelos permitidos.',
      );
    }
  }

  /**
   * Si el modelo acepta `temperature`. Un modelo desconocido se asume que si
   * (comportamiento previo); los modelos que la rechazan se marcan en el catalogo.
   */
  async supportsTemperature(modelId: string): Promise<boolean> {
    const row = await this.prisma.aiModel.findUnique({ where: { modelId } });
    return row ? row.supportsTemperature : true;
  }

  async create(
    actor: CurrentActor,
    dto: CreateAiModelDto,
  ): Promise<AiModelCatalogEntryDto> {
    const existing = await this.prisma.aiModel.findUnique({
      where: { modelId: dto.modelId },
    });
    if (existing) {
      throw new ConflictException('Ya existe un modelo con ese id.');
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.aiModel.create({
        data: {
          modelId: dto.modelId,
          label: dto.label,
          ...(dto.tier !== undefined ? { tier: dto.tier } : {}),
          ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
          ...(dto.supportsTemperature !== undefined
            ? { supportsTemperature: dto.supportsTemperature }
            : {}),
          ...(dto.supportsTools !== undefined
            ? { supportsTools: dto.supportsTools }
            : {}),
          ...(dto.supportsVision !== undefined
            ? { supportsVision: dto.supportsVision }
            : {}),
          ...(dto.supportsDocuments !== undefined
            ? { supportsDocuments: dto.supportsDocuments }
            : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          ...(dto.inputUsdPerMTok !== undefined
            ? { inputUsdPerMTok: dto.inputUsdPerMTok }
            : {}),
          ...(dto.outputUsdPerMTok !== undefined
            ? { outputUsdPerMTok: dto.outputUsdPerMTok }
            : {}),
        },
      });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'CREATE',
        objectType: 'AI_CONFIG',
        objectId: created.id,
        scopeProcessId: null,
        before: null,
        after: null,
      });
      return created;
    });
    return this.toEntry(row);
  }

  async update(
    actor: CurrentActor,
    modelId: string,
    dto: UpdateAiModelDto,
  ): Promise<AiModelCatalogEntryDto> {
    const existing = await this.prisma.aiModel.findUnique({ where: { modelId } });
    if (!existing) {
      throw new NotFoundException(`Modelo de IA "${modelId}" no encontrado.`);
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.aiModel.update({
        where: { id: existing.id },
        data: {
          ...(dto.label !== undefined ? { label: dto.label } : {}),
          ...(dto.tier !== undefined ? { tier: dto.tier } : {}),
          ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
          ...(dto.supportsTemperature !== undefined
            ? { supportsTemperature: dto.supportsTemperature }
            : {}),
          ...(dto.supportsTools !== undefined
            ? { supportsTools: dto.supportsTools }
            : {}),
          ...(dto.supportsVision !== undefined
            ? { supportsVision: dto.supportsVision }
            : {}),
          ...(dto.supportsDocuments !== undefined
            ? { supportsDocuments: dto.supportsDocuments }
            : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          ...(dto.inputUsdPerMTok !== undefined
            ? { inputUsdPerMTok: dto.inputUsdPerMTok }
            : {}),
          ...(dto.outputUsdPerMTok !== undefined
            ? { outputUsdPerMTok: dto.outputUsdPerMTok }
            : {}),
        },
      });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'UPDATE',
        objectType: 'AI_CONFIG',
        objectId: updated.id,
        scopeProcessId: null,
        before: null,
        after: null,
      });
      return updated;
    });
    return this.toEntry(row);
  }
}
