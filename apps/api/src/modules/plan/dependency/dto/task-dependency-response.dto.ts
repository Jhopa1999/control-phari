import { ApiProperty } from '@nestjs/swagger';

/** Contrato HTTP de una dependencia (predecesora) de tarea (design §3.4). */
export class TaskDependencyResponseDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Id de la arista de dependencia.' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Tarea dependiente.' })
  dependentTaskId!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Tarea predecesora.' })
  predecessorTaskId!: string;

  @ApiProperty({ type: String, description: 'Titulo de la predecesora.' })
  predecessorTitle!: string;

  @ApiProperty({ type: String, description: 'Estado de la predecesora (TaskStatus).' })
  predecessorStatus!: string;

  @ApiProperty({ type: Boolean, description: 'Aceptacion de la predecesora.' })
  predecessorAccepted!: boolean;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de creacion.' })
  createdAt!: Date;
}
