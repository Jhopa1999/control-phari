import { ApiProperty } from '@nestjs/swagger';

/**
 * Resultado por ítem de una operación en lote no atómica (aprobar solicitudes,
 * y después tareas). Cada ítem se procesa por separado: uno omitido no frena
 * a los demás.
 */
export const BATCH_ITEM_STATUSES = ['APROBADA', 'OMITIDA'] as const;
export type BatchItemStatus = (typeof BATCH_ITEM_STATUSES)[number];

/** Tope técnico de ítems por lote (cota de protección de la API). */
export const MAX_BATCH_SIZE = 25;

export class BatchItemResultDto {
  @ApiProperty({ format: 'uuid', description: 'Id pedido en el lote.' })
  id!: string;

  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'ID visible (p. ej. PRY-0012). Nulo si no se encontró o está fuera de alcance.',
  })
  code!: string | null;

  @ApiProperty({
    enum: BATCH_ITEM_STATUSES,
    description: 'APROBADA si se aplicó; OMITIDA si se dejó sin cambios.',
  })
  status!: BatchItemStatus;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Motivo en español cuando el ítem se omitió; nulo si se aprobó.',
  })
  reason!: string | null;
}

export class BatchResultDto {
  @ApiProperty({
    type: [BatchItemResultDto],
    description: 'Un resultado por ítem, en el orden pedido.',
  })
  results!: BatchItemResultDto[];

  @ApiProperty({ description: 'Cantidad de ítems aprobados.' })
  approved!: number;

  @ApiProperty({ description: 'Cantidad de ítems omitidos.' })
  skipped!: number;
}
