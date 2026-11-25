import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/pagination/pagination-query.dto';
import { RECORD_STATES } from '../../record-state';

/** Vistas del seguimiento de compromisos que filtra el servidor. */
export const COMMITMENT_VIEWS = ['ABIERTOS', 'VENCIDOS', 'TERMINADOS'] as const;
export type CommitmentView = (typeof COMMITMENT_VIEWS)[number];

/**
 * Query de listado de compromisos (design §3). Filtros intersectados con el
 * alcance (nunca lo amplían), búsqueda `q` y paginación `page`/`pageSize`. Sin
 * página se devuelve el alcance completo con un tope de 1000 filas (cabecera
 * X-Truncated). `q` busca en el título, el resultado esperado, el título del
 * acta de origen y el código o título de la solicitud relacionada. `dir` ordena
 * por vencimiento (por defecto el más próximo primero).
 */
export class ListCommitmentsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: RECORD_STATES, description: 'Filtra por estado.' })
  @IsOptional()
  @IsIn(RECORD_STATES, { message: 'Estado invalido.' })
  state?: string;

  @ApiPropertyOptional({
    enum: COMMITMENT_VIEWS,
    description:
      'ABIERTOS: en curso o bloqueados; VENCIDOS: abiertos con vencimiento anterior a hoy; TERMINADOS: completados o archivados.',
  })
  @IsOptional()
  @IsIn(COMMITMENT_VIEWS as readonly string[], { message: 'view invalido.' })
  view?: CommitmentView;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Filtra por proceso.' })
  @IsOptional()
  @IsUUID()
  processId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Filtra por asignado.' })
  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description: 'Filtra por persona: la que tiene el compromiso asignado o es su responsable.',
  })
  @IsOptional()
  @IsUUID()
  personId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Filtra por acta de origen.' })
  @IsOptional()
  @IsUUID()
  meetingId?: string;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'true: solo compromisos sin acta de origen. Tiene prioridad sobre meetingId.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean({ message: 'withoutMeeting debe ser true o false.' })
  withoutMeeting?: boolean;

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
