import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/pagination/pagination-query.dto';
import { RECORD_STATES } from '../../record-state';

/**
 * Query de listado de reuniones (design §3). Filtros intersectados con alcance
 * (nunca lo amplían), búsqueda `q` y paginación `page`/`pageSize`. Sin página se
 * devuelve el alcance completo con un tope de 1000 filas (cabecera X-Truncated).
 * `q` busca en el título, el nombre del responsable y el código o título de la
 * solicitud relacionada. `dir` ordena por fecha de la reunión (por defecto la
 * más reciente primero).
 */
export class ListMeetingsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Filtra por proceso.' })
  @IsOptional()
  @IsUUID()
  processId?: string;

  @ApiPropertyOptional({ enum: RECORD_STATES, description: 'Filtra por estado.' })
  @IsOptional()
  @IsIn(RECORD_STATES, { message: 'Estado invalido.' })
  state?: string;

  @ApiPropertyOptional({
    type: Boolean,
    description:
      'true: solo actas abiertas (no cerradas ni archivadas); false: solo cerradas o archivadas.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean({ message: 'open debe ser true o false.' })
  open?: boolean;

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
