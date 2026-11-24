import { ApiProperty } from '@nestjs/swagger';

/**
 * Contadores de la franja del Portafolio. Se calculan sobre el mismo alcance y
 * filtros que `GET /portfolio` (sin `alert`), así cada cifra coincide con el
 * total de `GET /portfolio?alert=...`. Una iniciativa puede contar en varios
 * grupos: las cifras no se suman.
 */
export class PortfolioSummaryResponseDto {
  @ApiProperty({
    type: Number,
    description: 'Iniciativas del alcance filtrado (sin alert) que se evaluaron.',
  })
  total!: number;

  @ApiProperty({
    type: Number,
    description: 'Vencidas: dueStatus VENCIDO (alert=VENCIDA).',
  })
  overdue!: number;

  @ApiProperty({
    type: Number,
    description: 'Próximas a vencer: dueStatus PROXIMO_A_VENCER (alert=PROXIMA).',
  })
  dueSoon!: number;

  @ApiProperty({
    type: Number,
    description:
      'Con desviación: scheduleVarianceDays mayor que 0 (alert=CON_DESVIACION).',
  })
  withVariance!: number;

  @ApiProperty({
    type: Number,
    description: 'Bloqueadas: bloqueo activo sin resolver (alert=BLOQUEADA).',
  })
  blocked!: number;

  @ApiProperty({
    type: Boolean,
    description:
      'true si el alcance filtrado superó las 1000 iniciativas y solo se contaron las primeras 1000.',
  })
  truncated!: boolean;
}
