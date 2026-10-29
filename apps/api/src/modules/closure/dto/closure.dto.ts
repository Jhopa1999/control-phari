import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Estado funcional del cierre del proyecto (derivado, no persistido). */
export const CLOSURE_PHASES = [
  'EN_EJECUCION',
  'PENDIENTE_DOCUMENTACION',
  'PENDIENTE_APROBACION_DOCUMENTAL',
  'EJECUCION_FINALIZADA',
  'PENDIENTE_APROBACION_CIERRE',
  'CERRADO',
  'NO_APLICA',
] as const;
export type ClosurePhase = (typeof CLOSURE_PHASES)[number];

export class ClosureRecordDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['PENDIENTE', 'APROBADO', 'RECHAZADO'] })
  status!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  requestedAt!: Date;

  @ApiProperty({ type: String, format: 'uuid' })
  requestedByUserId!: string;

  @ApiProperty({ type: String, nullable: true })
  requestedByName!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  decidedAt!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  decidedByName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  decisionReason!: string | null;
}

export class ClosureDocumentDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String })
  title!: string;

  @ApiProperty({ type: String })
  status!: string;

  @ApiProperty({ type: String, nullable: true })
  reviewReason!: string | null;
}

/** Resumen del cierre de un proyecto: validaciones, documentos e historial. */
export class ClosureStatusDto {
  @ApiProperty({ type: String, format: 'uuid' })
  requestId!: string;

  @ApiProperty({ type: String, description: 'Estado operativo de la solicitud.' })
  requestState!: string;

  @ApiProperty({ enum: CLOSURE_PHASES, description: 'Estado funcional del cierre.' })
  phase!: ClosurePhase;

  @ApiProperty({ type: Number })
  tasksTotal!: number;

  @ApiProperty({ type: Number })
  tasksCompleted!: number;

  @ApiProperty({ type: [ClosureDocumentDto], description: 'Documentación de cierre (categoría CIERRE).' })
  documents!: ClosureDocumentDto[];

  @ApiProperty({ type: Boolean })
  canRequestClosure!: boolean;

  @ApiProperty({ type: [String], description: 'Motivos por los que aún no se puede solicitar el cierre.' })
  blockers!: string[];

  @ApiProperty({ type: ClosureRecordDto, nullable: true, description: 'Solicitud de cierre pendiente.' })
  pending!: ClosureRecordDto | null;

  @ApiProperty({ type: [ClosureRecordDto], description: 'Historial de solicitudes de cierre.' })
  history!: ClosureRecordDto[];

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  closedAt!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  closedByName!: string | null;
}

/** Fila de la cola de cierres por aprobar. */
export class PendingClosureDto {
  @ApiProperty({ type: String, format: 'uuid' })
  closureId!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  requestId!: string;

  @ApiProperty({ type: String })
  requestTitle!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  requestedAt!: Date;

  @ApiProperty({ type: String, nullable: true })
  requestedByName!: string | null;
}

export class ClosureDecisionDto {
  @ApiProperty({ enum: ['APROBAR', 'RECHAZAR'] })
  @IsIn(['APROBAR', 'RECHAZAR'], { message: 'Decisión inválida.' })
  decision!: 'APROBAR' | 'RECHAZAR';

  @ApiPropertyOptional({ type: String, maxLength: 2000, description: 'Observaciones (obligatorias al rechazar).' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class ReopenProjectDto {
  @ApiProperty({ type: String, maxLength: 2000, description: 'Motivo de la reapertura (obligatorio).' })
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  reason!: string;
}
