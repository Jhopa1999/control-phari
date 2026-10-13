import { ApiProperty } from '@nestjs/swagger';

/**
 * Resultado de importar un plan (design §5.7). `message` es la fuente unica del
 * texto de exito; el frontend lo muestra tal cual. `replaced` es siempre true:
 * deja explicito el caracter destructivo (REPLACE) de la operacion.
 */
export class ImportPlanResultDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Solicitud del plan importado.' })
  requestId!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Plan destino de la importacion.' })
  planId!: string;

  @ApiProperty({ type: Boolean, description: 'Siempre true: el contenido anterior fue reemplazado.' })
  replaced!: boolean;

  @ApiProperty({ type: Number, description: 'Fases creadas.' })
  phasesCreated!: number;

  @ApiProperty({ type: Number, description: 'Tareas creadas.' })
  tasksCreated!: number;

  @ApiProperty({ type: Number, description: 'Dependencias creadas.' })
  dependenciesCreated!: number;

  @ApiProperty({ type: String, description: 'Resumen legible del reemplazo.' })
  message!: string;
}
