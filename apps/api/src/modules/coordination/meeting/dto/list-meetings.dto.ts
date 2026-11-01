import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { RECORD_STATES } from '../../record-state';

/** Query de listado de reuniones (design §3). Filtros intersectados con alcance. */
export class ListMeetingsDto {
  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Filtra por proceso.' })
  @IsOptional()
  @IsUUID()
  processId?: string;

  @ApiPropertyOptional({ enum: RECORD_STATES, description: 'Filtra por estado.' })
  @IsOptional()
  @IsIn(RECORD_STATES, { message: 'Estado invalido.' })
  state?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description:
      'Filtra por solicitud (proyecto): relacionada o proyecto relacionado.',
  })
  @IsOptional()
  @IsUUID()
  requestId?: string;
}
