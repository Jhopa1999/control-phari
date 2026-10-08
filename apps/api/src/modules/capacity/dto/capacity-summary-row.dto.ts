import { ApiProperty } from '@nestjs/swagger';

/** Estados posibles de una fila del resumen de carga (design §2.4). */
export type CapacitySummaryEstado =
  | 'OK'
  | 'SOBRECARGA'
  | 'SIN_DISPONIBILIDAD'
  | 'CARGA_PARCIAL';

/**
 * Fila del resumen de carga por persona/mes (design §1.4/§2.4), calculada
 * server-side (no persistida). `utilizacion`/`libre` son `null` cuando no hay
 * disponibilidad (`SIN_DISPONIBILIDAD`) o cuando la carga es parcial para el
 * actor (`CARGA_PARCIAL`, solo lider/integrante). `disponible` es `null` si la
 * persona no tiene disponibilidad registrada ese mes.
 */
export class CapacitySummaryRowDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Persona del resumen.' })
  userId!: string;

  @ApiProperty({ type: String, description: 'Nombre de la persona.' })
  userName!: string;

  @ApiProperty({ type: String, description: 'Mes en formato YYYY-MM.', example: '2025-03' })
  month!: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Horas disponibles o null si no hay disponibilidad registrada.',
  })
  disponible!: number | null;

  @ApiProperty({
    type: Number,
    description: 'Suma de horas comprometidas visibles en el alcance del actor.',
  })
  comprometido!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Porcentaje de utilizacion (round(comprometido/disponible*100)) o null.',
  })
  utilizacion!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Horas libres (disponible - comprometido); puede ser negativo o null.',
  })
  libre!: number | null;

  @ApiProperty({
    type: String,
    enum: ['OK', 'SOBRECARGA', 'SIN_DISPONIBILIDAD', 'CARGA_PARCIAL'],
    description: 'Estado derivado de la fila.',
  })
  estado!: CapacitySummaryEstado;

  @ApiProperty({ type: Boolean, description: 'True cuando libre < 0 (se senala, no bloquea).' })
  sobrecargado!: boolean;

  @ApiProperty({
    type: Boolean,
    description:
      'True (solo lider/integrante) si la persona tiene asignaciones fuera del alcance del actor.',
  })
  cargaParcial!: boolean;
}
