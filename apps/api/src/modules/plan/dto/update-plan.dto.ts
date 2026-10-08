import { PartialType } from '@nestjs/swagger';
import { CreatePlanDto } from './create-plan.dto';

/**
 * Entrada para editar un plan (design §3.4): mismos campos que CreatePlanDto, no
 * incluye `status`/`submitted*`/`authorized*` (los fija el flujo, no un PATCH).
 */
export class UpdatePlanDto extends PartialType(CreatePlanDto) {}
