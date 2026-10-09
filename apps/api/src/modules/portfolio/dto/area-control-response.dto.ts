import { ApiProperty } from '@nestjs/swagger';

/**
 * DTOs de respuesta del Control del area (design §5.1/§5.2). Envoltura comun
 * "No aplica": `applicable=false` => `reason` legible (+ `futureDataNote` para
 * los indicadores de dato futuro); nunca se devuelve `0` para representar la
 * ausencia de dato (eso se reserva para conteos reales).
 */
export class IndicatorStatusDto {
  @ApiProperty({ type: Boolean, description: 'false => "No aplica".' })
  applicable!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Motivo legible cuando applicable=false.',
  })
  reason!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Que falta capturar (indicadores de dato futuro).',
  })
  futureDataNote!: string | null;
}

export class EvaluationTimeIndicatorDto {
  @ApiProperty({ type: Number, nullable: true, description: 'Mediana de dias o null.' })
  medianDays!: number | null;

  @ApiProperty({ type: Number, description: 'Casos pendientes de decision inicial (0 valido).' })
  pendingCount!: number;

  @ApiProperty({ type: Number, description: 'Numero de decisiones en el periodo.' })
  sampleSize!: number;

  @ApiProperty({ type: IndicatorStatusDto })
  status!: IndicatorStatusDto;
}

export class MilestoneComplianceIndicatorDto {
  @ApiProperty({ type: Number, nullable: true, description: 'Porcentaje o null si denominador 0.' })
  percentage!: number | null;

  @ApiProperty({ type: Number, description: 'Hitos cumplidos a tiempo (numerador).' })
  met!: number;

  @ApiProperty({ type: Number, description: 'Hitos con vencimiento en el periodo (denominador).' })
  due!: number;

  @ApiProperty({ type: IndicatorStatusDto })
  status!: IndicatorStatusDto;
}

export class DeliveryTimeGroupDto {
  @ApiProperty({ type: String, description: 'Clave del grupo (ruta o complejidad).' })
  key!: string;

  @ApiProperty({ type: String, description: 'Etiqueta legible del grupo.' })
  label!: string;

  @ApiProperty({ type: Number, description: 'Mediana de dias del grupo.' })
  medianDays!: number;

  @ApiProperty({ type: Number, description: 'Numero de cerradas medibles del grupo.' })
  count!: number;
}

export class DeliveryTimeIndicatorDto {
  @ApiProperty({ type: Number, nullable: true, description: 'Mediana global de dias o null.' })
  medianDays!: number | null;

  @ApiProperty({ type: Number, description: 'Numero de cerradas medibles.' })
  count!: number;

  @ApiProperty({ type: Number, description: 'Cerradas sin compromiso/cierre registrable.' })
  unmeasurableClosed!: number;

  @ApiProperty({ type: [DeliveryTimeGroupDto], description: 'Desglose por ruta de gobierno.' })
  byRoute!: DeliveryTimeGroupDto[];

  @ApiProperty({ type: [DeliveryTimeGroupDto], description: 'Desglose por complejidad (sizeCode).' })
  byComplexity!: DeliveryTimeGroupDto[];

  @ApiProperty({ type: IndicatorStatusDto })
  status!: IndicatorStatusDto;
}

export class BlockCauseDto {
  @ApiProperty({ type: String, description: 'Causa del bloqueo.' })
  cause!: string;

  @ApiProperty({
    type: String,
    enum: ['REQUEST_FLAG', 'ISSUE'],
    description: 'Origen de la senal del bloqueo.',
  })
  origin!: 'REQUEST_FLAG' | 'ISSUE';

  @ApiProperty({ type: Number, description: 'Numero de bloqueos con esta causa/origen.' })
  count!: number;

  @ApiProperty({ type: Number, description: 'Dias acumulados de los bloqueos de esta causa/origen.' })
  accumulatedDays!: number;
}

export class BlocksIndicatorDto {
  @ApiProperty({ type: Number, description: 'Solicitudes con bloqueo activo (0 valido).' })
  blockedRequests!: number;

  @ApiProperty({ type: Number, description: 'Issues BLOQUEO abiertas (0 valido).' })
  openBlockingIssues!: number;

  @ApiProperty({ type: [BlockCauseDto], description: 'Desglose por causa fusionando ambas senales.' })
  byCause!: BlockCauseDto[];

  @ApiProperty({ type: IndicatorStatusDto, description: 'applicable=true salvo error; conteos 0 NO son "No aplica".' })
  status!: IndicatorStatusDto;
}

export class FutureIndicatorDto {
  @ApiProperty({ type: IndicatorStatusDto, description: 'applicable=false + futureDataNote.' })
  status!: IndicatorStatusDto;
}

export class AreaIndicatorsResponseDto {
  @ApiProperty({ type: String, description: 'Eco del periodo resuelto (YYYY-MM-DD, inclusivo).' })
  periodFrom!: string;

  @ApiProperty({ type: String, description: 'Eco del periodo resuelto (YYYY-MM-DD, exclusivo).' })
  periodTo!: string;

  @ApiProperty({ type: EvaluationTimeIndicatorDto })
  evaluationTime!: EvaluationTimeIndicatorDto;

  @ApiProperty({ type: MilestoneComplianceIndicatorDto })
  milestoneCompliance!: MilestoneComplianceIndicatorDto;

  @ApiProperty({ type: DeliveryTimeIndicatorDto })
  deliveryTime!: DeliveryTimeIndicatorDto;

  @ApiProperty({ type: BlocksIndicatorDto })
  blocks!: BlocksIndicatorDto;

  @ApiProperty({ type: FutureIndicatorDto })
  failedChanges!: FutureIndicatorDto;

  @ApiProperty({ type: FutureIndicatorDto })
  recovery!: FutureIndicatorDto;

  @ApiProperty({ type: FutureIndicatorDto })
  adoptionValue!: FutureIndicatorDto;
}

export class StateCountDto {
  @ApiProperty({ type: String, description: 'Estado operativo (RequestState).' })
  state!: string;

  @ApiProperty({ type: Number, description: 'Numero de solicitudes en ese estado (0 valido).' })
  count!: number;
}

export class BandCountDto {
  @ApiProperty({
    type: String,
    enum: ['P1', 'P2', 'P3', 'P4', 'SIN_PRIORIZAR'],
    description: 'Banda de prioridad o SIN_PRIORIZAR.',
  })
  band!: string;

  @ApiProperty({ type: Number, description: 'Numero de solicitudes en esa banda (0 valido).' })
  count!: number;
}

export class DemandSummaryResponseDto {
  @ApiProperty({ type: Number, description: 'Total de solicitudes en alcance.' })
  total!: number;

  @ApiProperty({ type: Number, description: 'Solicitudes con bloqueo activo.' })
  blockedActive!: number;

  @ApiProperty({ type: [StateCountDto], description: 'Conteo por estado (todos los estados, incl. 0).' })
  byState!: StateCountDto[];

  @ApiProperty({ type: [BandCountDto], description: 'Conteo por banda (incl. SIN_PRIORIZAR).' })
  byPriorityBand!: BandCountDto[];
}
