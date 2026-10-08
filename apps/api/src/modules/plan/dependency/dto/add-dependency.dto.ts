import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * Entrada para anadir una predecesora a una tarea (design §3.4/§2.3). El service
 * valida auto-dependencia, mismo plan, duplicado y ciclos antes de persistir.
 */
export class AddDependencyDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Id de la tarea predecesora.' })
  @IsUUID()
  predecessorTaskId!: string;
}
