import { ApiProperty } from '@nestjs/swagger';
import { ActivityResponseDto } from './activity-response.dto';

/**
 * Contrato HTTP de un registro diario (design §3.4). `date` se expone como
 * `YYYY-MM-DD`; incluye las actividades (1:N). El total de horas del dia es la
 * suma de `hours` (calculo de lectura, §11 D1).
 */
/** Qué puede hacer quien consulta con este diario (lo calcula el servidor). */
export class DailyLogActionsDto {
  @ApiProperty({ type: Boolean, description: 'Puede editar notas y actividades.' })
  edit!: boolean;

  @ApiProperty({ type: Boolean, description: 'Puede eliminar el diario.' })
  delete!: boolean;

  @ApiProperty({ type: Boolean, description: 'Puede enviarlo a revisión.' })
  submit!: boolean;

  @ApiProperty({ type: Boolean, description: 'Puede retirar el envío (autor, mientras siga enviado).' })
  recall!: boolean;

  @ApiProperty({ type: Boolean, description: 'Puede marcarlo como revisado.' })
  review!: boolean;

  @ApiProperty({ type: Boolean, description: 'Puede devolverlo con un motivo.' })
  return!: boolean;
}

export class DailyLogResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Autor del diario.' })
  authorUserId!: string;

  @ApiProperty({ type: String, description: 'Nombre del autor del diario.' })
  authorName!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Proceso del diario.' })
  processId!: string;

  @ApiProperty({ type: String, description: 'Nombre del proceso del diario.' })
  processName!: string;

  @ApiProperty({ type: String, description: 'Dia del registro (YYYY-MM-DD).', example: '2025-03-10' })
  date!: string;

  @ApiProperty({ type: String, description: 'Estado (BORRADOR/ENVIADO/REVISADO).' })
  status!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  submittedAt!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  dayNotes!: string | null;

  @ApiProperty({ type: Number, description: 'Suma de horas de las actividades (dedicacion del dia).' })
  totalHours!: number;

  @ApiProperty({
    type: Number,
    description: 'Horas del autor en esa fecha sumando todos sus diarios (cualquier proceso y estado).',
  })
  authorDayTotalHours!: number;

  @ApiProperty({
    type: Number,
    description: 'Jornada diaria configurada (maestra WORKLOG_PARAM / WORKDAY_HOURS; 9 por defecto).',
  })
  workdayHours!: number;

  @ApiProperty({ type: Boolean, description: 'El total del día supera la jornada (aviso, no bloquea).' })
  overWorkday!: boolean;

@ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Cuando se marco como revisado.' })
  reviewedAt!: Date | null;

  @ApiProperty({ type: String, nullable: true, description: 'Quien lo reviso (nombre).' })
  reviewedByName!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Ultima devolucion a borrador.' })
  returnedAt!: Date | null;

  @ApiProperty({ type: String, nullable: true, description: 'Quien lo devolvio (nombre).' })
  returnedByName!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Motivo de la ultima devolucion.' })
  returnReason!: string | null;

  @ApiProperty({ type: Boolean, description: 'true si está en borrador por una devolución vigente.' })
  returned!: boolean;

  @ApiProperty({ type: DailyLogActionsDto, description: 'Acciones permitidas a quien consulta.' })
  actions!: DailyLogActionsDto;

  @ApiProperty({ type: [ActivityResponseDto], description: 'Actividades del dia.' })
  activities!: ActivityResponseDto[];

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
