import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { MONTH_PATTERN } from '../month';

/** Query de disponibilidades por mes (design §2.4). `month` requerido. */
export class ListAvailabilityDto {
  @ApiProperty({
    type: String,
    description: 'Mes a consultar en formato YYYY-MM.',
    example: '2025-03',
    pattern: '^\\d{4}-(0[1-9]|1[0-2])$',
  })
  @Matches(MONTH_PATTERN, { message: 'El mes debe tener el formato YYYY-MM.' })
  month!: string;
}
