import { ApiProperty } from '@nestjs/swagger';

/** Un pendiente de la guia, por categoria (design §2.1). */
export class PlanGuidePendingDto {
  @ApiProperty({ type: String, description: 'Categoria del pendiente (datesPhases/tasksResponsibles/...).' })
  category!: string;

  @ApiProperty({ type: String, description: 'Codigo estable del tipo de pendiente.' })
  code!: string;

  @ApiProperty({ type: String, description: 'Mensaje legible del pendiente.' })
  message!: string;

  @ApiProperty({ type: String, required: false, nullable: true, description: 'Id del objeto afectado (fase/tarea).' })
  targetId?: string;
}

/**
 * Guia "Resuelve el siguiente paso" (design §2.1): pendientes por categoria y el
 * gate de envio. `canSubmit` es la unica fuente de verdad del gate.
 */
export class PlanGuideDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Plan evaluado.' })
  planId!: string;

  @ApiProperty({ type: Boolean, description: 'true solo si no hay pendientes en categorias implementadas.' })
  canSubmit!: boolean;

  @ApiProperty({ type: [PlanGuidePendingDto], description: 'Pendientes por categoria.' })
  pendings!: PlanGuidePendingDto[];

  @ApiProperty({ type: [String], description: 'Categorias gancho de fases futuras (siempre 0 pendientes hoy).' })
  futureCategories!: string[];
}
