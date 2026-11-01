import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

/** Query del resumen de consumo: mes `YYYY-MM` (por defecto, el mes actual). */
export class AiUsageQueryDto {
  @ApiPropertyOptional({
    type: String,
    example: '2026-11',
    description: 'Mes a consultar en formato YYYY-MM (UTC). Por defecto, el mes actual.',
  })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'El mes debe tener el formato YYYY-MM.' })
  month?: string;
}

/** Estado del presupuesto mensual de IA. */
export class AiBudgetStatusDto {
  @ApiProperty({ type: String, description: 'Mes (YYYY-MM, UTC) al que corresponde.' })
  month!: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Tope mensual en USD, o null si no hay tope.',
  })
  budgetUsd!: number | null;

  @ApiProperty({ type: Number, description: 'Porcentaje del tope a partir del cual hay alerta.' })
  alertPct!: number;

  @ApiProperty({ type: Number, description: 'Gasto estimado del mes en USD.' })
  spentUsd!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Porcentaje del tope consumido, o null si no hay tope.',
  })
  usedPct!: number | null;

  @ApiProperty({ type: Boolean, description: 'Se alcanzo el umbral de alerta.' })
  alert!: boolean;

  @ApiProperty({
    type: Boolean,
    description: 'Se agoto el tope: las llamadas de IA se rechazan hasta el mes siguiente o hasta subir el tope.',
  })
  exceeded!: boolean;
}

/** Consumo agregado por una clave (agente o modelo). */
export class AiUsageBreakdownDto {
  @ApiProperty({ type: String, description: 'Agente (p. ej. TRIAGE) o id del modelo.' })
  key!: string;

  @ApiProperty({ type: Number, description: 'Llamadas.' })
  calls!: number;

  @ApiProperty({ type: Number, description: 'Tokens de entrada.' })
  inputTokens!: number;

  @ApiProperty({ type: Number, description: 'Tokens de salida.' })
  outputTokens!: number;

  @ApiProperty({ type: Number, description: 'Costo estimado en USD (solo llamadas con precio).' })
  costUsd!: number;
}

/** Resumen de consumo de IA de un mes. */
export class AiUsageSummaryDto {
  @ApiProperty({ type: String, description: 'Mes (YYYY-MM, UTC).' })
  month!: string;

  @ApiProperty({ type: Number, description: 'Llamadas al modelo en el mes.' })
  calls!: number;

  @ApiProperty({ type: Number, description: 'Tokens de entrada del mes.' })
  inputTokens!: number;

  @ApiProperty({ type: Number, description: 'Tokens de salida del mes.' })
  outputTokens!: number;

  @ApiProperty({ type: Number, description: 'Costo estimado del mes en USD.' })
  costUsd!: number;

  @ApiProperty({
    type: Number,
    description: 'Llamadas de modelos sin precio configurado (no suman al costo).',
  })
  unpricedCalls!: number;

  @ApiProperty({ type: [AiUsageBreakdownDto], description: 'Consumo por agente.' })
  byAgent!: AiUsageBreakdownDto[];

  @ApiProperty({ type: [AiUsageBreakdownDto], description: 'Consumo por modelo.' })
  byModel!: AiUsageBreakdownDto[];

  @ApiProperty({ type: AiBudgetStatusDto, description: 'Estado del presupuesto del mes.' })
  budget!: AiBudgetStatusDto;
}
