import { ApiProperty } from '@nestjs/swagger';

/** Faltante registrado de un gate (design §3.4). */
export class GatePendingItemResponseDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Identificador unico.' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'GateCheck al que pertenece.' })
  gateCheckId!: string;

  @ApiProperty({ type: String, description: 'Lo que falta.' })
  description!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Responsable de resolverlo.' })
  ownerUserId!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Fecha de revision.' })
  reviewDate!: Date | null;

  @ApiProperty({ type: Boolean, description: 'Resuelto si/no.' })
  resolved!: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Fecha de resolucion.' })
  resolvedAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de creacion.' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de actualizacion.' })
  updatedAt!: Date;
}

/**
 * Resumen de validaciones de un gate (design §3.3): se adjunta a GC4 para que la
 * UI muestre si hay bloqueo y por que no se puede aprobar.
 */
export class GateValidationSummaryDto {
  @ApiProperty({ type: Number, description: 'Total de validaciones registradas.' })
  total!: number;

  @ApiProperty({ type: Number, description: 'Validaciones con defecto bloqueante sin resolver.' })
  blockingUnresolved!: number;

  @ApiProperty({ type: Boolean, description: 'Existe validacion obligatoria de la ruta aprobada.' })
  hasMandatoryApproving!: boolean;

  @ApiProperty({ type: Boolean, description: 'El gate es aprobable segun el recomputo server-side.' })
  approvable!: boolean;

  @ApiProperty({
    type: [String],
    description: 'Motivos de bloqueo (vacio si es aprobable).',
  })
  blockingReasons!: string[];
}

/** Contrato HTTP de un GateCheck (design §3.4). Separado del modelo Prisma. */
export class GateCheckResponseDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Identificador unico.' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Solicitud a la que pertenece.' })
  requestId!: string;

  @ApiProperty({ type: String, description: 'Codigo del gate (GC1..GC5).' })
  gateCode!: string;

  @ApiProperty({ type: String, description: 'Titulo del gate (marco FCGR §5).' })
  title!: string;

  @ApiProperty({ type: String, description: 'Estado (PENDIENTE/CUMPLIDO/NO_APLICA).' })
  status!: string;

  @ApiProperty({ type: String, description: 'Condicion para avanzar (texto del marco).' })
  conditionText!: string;

  @ApiProperty({ type: String, description: 'Autoridad del control (texto del marco).' })
  authorityText!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Motivo de NO_APLICA.' })
  waiverReason!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Fecha de decision.' })
  decidedAt!: Date | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Usuario que decidio.' })
  decidedByUserId!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Nombre de quien decidio el control resuelto.',
  })
  decidedByName!: string | null;

  @ApiProperty({ type: [GatePendingItemResponseDto], description: 'Faltantes del gate.' })
  pendingItems!: GatePendingItemResponseDto[];

  @ApiProperty({
    type: GateValidationSummaryDto,
    nullable: true,
    description: 'Resumen de validaciones (solo GC4; null en los demas).',
  })
  validationSummary!: GateValidationSummaryDto | null;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de creacion.' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de actualizacion.' })
  updatedAt!: Date;
}

/** Respuesta del tablero de gobierno de una Request (design §4). */
export class GovernanceBoardResponseDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Solicitud.' })
  requestId!: string;

  @ApiProperty({ type: String, description: 'Estado operativo actual.' })
  operationalState!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Ruta proporcional (GOVERNANCE_ROUTE) o null.' })
  governanceRoute!: string | null;

  @ApiProperty({ type: Boolean, description: 'Bloqueada (flag transversal) si/no.' })
  blocked!: boolean;

  @ApiProperty({ type: String, nullable: true, description: 'Motivo del bloqueo vigente.' })
  blockedReason!: string | null;

  @ApiProperty({ type: [GateCheckResponseDto], description: 'Los 5 gates GC1-GC5.' })
  gates!: GateCheckResponseDto[];
}
