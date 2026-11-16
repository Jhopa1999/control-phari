import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

/**
 * Entrada para editar una disponibilidad (design §2.1). Solo `availableHours` es
 * editable: `userId`/`month` definen la identidad persona/mes y no se cambian
 * por PATCH (para "mover" se borra/crea).
 */
export class UpdateAvailabilityDto {
  @ApiProperty({
    type: Number,
    description: 'Horas disponibles en el mes (entero entre 0 y 744, un mes completo).',
    minimum: 0,
    maximum: 744,
    example: 150,
  })
  @IsInt({ message: 'Las horas deben ser un numero entero.' })
  @Min(0, { message: 'Las horas no pueden ser negativas.' })
  @Max(744, { message: 'La disponibilidad no puede superar 744 horas al mes.' })
  availableHours!: number;
}
