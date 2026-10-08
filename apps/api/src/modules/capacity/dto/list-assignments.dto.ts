import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, Matches } from 'class-validator';
import { MONTH_PATTERN } from '../month';

/**
 * Query de asignaciones por mes (design §2.4). `month` requerido; filtros
 * opcionales `processId`/`userId`/`requestId` que se intersectan con el `where`
 * de alcance (nunca lo amplian).
 */
export class ListAssignmentsDto {
  @ApiProperty({
    type: String,
    description: 'Mes a consultar en formato YYYY-MM.',
    example: '2025-03',
    pattern: '^\\d{4}-(0[1-9]|1[0-2])$',
  })
  @Matches(MONTH_PATTERN, { message: 'El mes debe tener el formato YYYY-MM.' })
  month!: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Filtra por proceso.' })
  @IsOptional()
  @IsUUID()
  processId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Filtra por persona.' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Filtra por solicitud.' })
  @IsOptional()
  @IsUUID()
  requestId?: string;
}
