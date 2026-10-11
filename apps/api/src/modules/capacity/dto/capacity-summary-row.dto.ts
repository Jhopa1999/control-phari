import { ApiProperty } from '@nestjs/swagger';

/** Estados posibles de una fila del resumen de carga (design Â§2.4). */
export type CapacitySummaryEstado =
  | 'OK'
  | 'SOBRECARGA'
  | 'SIN_DISPONIBILIDAD'
  | 'CARGA_PARCIAL';

/**
 * Fila del resumen de carga por persona/mes (design Â§1.4/Â§2.4), calculada
 * server-side (no persistida). `utilizacion`/`libre` son `null` cuando no hay
 * disponibilidad (`SIN_DISPONIBILIDAD`) o cuando la carga es parcial para el
 * actor (`CARGA_PARCIAL`, solo lider/integrante). `disponible` es `null` si la
 * persona no tiene disponibilidad registrada ese mes.
 *
 * Vinculacion CAPACIDAD â†” PLAN (cambio ADITIVO): junto a `comprometido` (horas
 * registradas manualmente en asignaciones) se expone `planificado` (horas
 * estimadas derivadas de las tareas del plan asignadas a la persona ese mes).
 * Son datos SEPARADOS: `planificado` NO altera `comprometido`, `utilizacion`,
 * `libre`, `estado`, `sobrecargado` ni `cargaParcial`.
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
    description:
      'Horas comprometidas: suma de Assignment.committedHours (horas registradas manualmente en asignaciones) visibles en el alcance del actor. Independiente de `planificado`.',
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
    description: 'Estado derivado de la fila (se calcula SOLO sobre `comprometido`).',
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

  @ApiProperty({
    type: Number,
    description:
      'Horas planificadas: suma de Task.estimateHours de las tareas del plan asignadas a la persona ese mes (estimacion, status != TERMINADA, estimateHours > 0). Dato informativo paralelo a `comprometido`; 0 si ninguna tarea aporta.',
  })
  planificado!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Porcentaje de utilizacion planificada (round(planificado/disponible*100)) o null si no hay disponibilidad (>0). Misma guarda contra division por cero que `utilizacion`.',
  })
  utilizacionPlan!: number | null;

  @ApiProperty({
    type: Boolean,
    description:
      'True si planificado > disponible (con disponible > 0). Senal informativa; NO altera `estado` ni `sobrecargado`, que siguen derivando solo de `comprometido`.',
  })
  planSobreDisponible!: boolean;
}
