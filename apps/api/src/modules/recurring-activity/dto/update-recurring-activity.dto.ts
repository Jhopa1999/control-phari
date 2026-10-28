import { PartialType } from '@nestjs/swagger';
import { CreateRecurringActivityDto } from './create-recurring-activity.dto';

/**
 * Entrada para editar una DEFINICION de actividad recurrente (FEAT-002): mismos
 * campos que CreateRecurringActivityDto, todos opcionales. Las reglas cruzadas
 * (responsable coherente, activityType valido, alcance) las reaplica el
 * service sobre el estado resultante. El borrado es soft-delete (active=false)
 * por el endpoint DELETE, no por este DTO.
 */
export class UpdateRecurringActivityDto extends PartialType(
  CreateRecurringActivityDto,
) {}
