import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

/**
 * Entrada para actualizar solo el avance de una tarea. El estado no cambia: la
 * regla de qué estados admiten editar el avance y el permiso los aplica el
 * service.
 */
export class UpdateTaskProgressDto {
  @ApiProperty({
    type: Number,
    description: 'Avance de la tarea en porcentaje (entero de 0 a 100).',
    minimum: 0,
    maximum: 100,
    example: 40,
  })
  @IsInt()
  @Min(0)
  @Max(100)
  progress!: number;
}
