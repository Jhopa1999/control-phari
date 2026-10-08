import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/**
 * Entrada para aceptar/retirar la aceptacion de una tarea (design §3.4/§2.7).
 * Accion de gestion del plan (rol `plan`), precondicion TERMINADA en el service.
 */
export class AcceptTaskDto {
  @ApiProperty({ type: Boolean, description: 'true acepta la tarea; false retira la aceptacion.' })
  @IsBoolean()
  accepted!: boolean;
}
