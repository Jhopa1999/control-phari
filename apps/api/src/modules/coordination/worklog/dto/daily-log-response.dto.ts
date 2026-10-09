import { ApiProperty } from '@nestjs/swagger';
import { ActivityResponseDto } from './activity-response.dto';

/**
 * Contrato HTTP de un registro diario (design §3.4). `date` se expone como
 * `YYYY-MM-DD`; incluye las actividades (1:N). El total de horas del dia es la
 * suma de `hours` (calculo de lectura, §11 D1).
 */
export class DailyLogResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Autor del diario.' })
  authorUserId!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Proceso del diario.' })
  processId!: string;

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

  @ApiProperty({ type: [ActivityResponseDto], description: 'Actividades del dia.' })
  activities!: ActivityResponseDto[];

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
