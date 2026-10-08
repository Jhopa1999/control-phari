import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

/**
 * Entrada para editar una disponibilidad (design §2.1). Solo `availableHours` es
 * editable: `userId`/`month` definen la identidad persona/mes y no se cambian
 * por PATCH (para "mover" se borra/crea).
 */
export class UpdateAvailabilityDto {
  @ApiProperty({
    type: Number,
    description: 'Horas disponibles en el mes (entero >= 0).',
    minimum: 0,
    example: 150,
  })
  @IsInt({ message: 'Las horas deben ser un numero entero.' })
  @Min(0, { message: 'Las horas no pueden ser negativas.' })
  availableHours!: number;
}
