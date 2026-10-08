import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Decisiones de aprobacion (design §1.2). */
export const APPROVAL_DECISIONS = ['APROBAR', 'DEVOLVER'] as const;
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number];

/**
 * Entrada para la decision de aprobacion (design §3.4). `reason` es requerido
 * solo si `DEVOLVER` (validacion condicional en el service -> 400 si falta).
 */
export class CreateApprovalDto {
  @ApiProperty({ description: 'Decision de aprobacion.', enum: APPROVAL_DECISIONS })
  @IsIn(APPROVAL_DECISIONS)
  decision!: ApprovalDecision;

  @ApiPropertyOptional({
    type: String,
    description: 'Motivo (obligatorio si DEVOLVER).',
    maxLength: 2000,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
