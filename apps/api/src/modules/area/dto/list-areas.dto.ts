import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

const toBool = ({ value }: { value: unknown }): unknown => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

/** Filtros opcionales para GET /areas (design 4.3). */
export class ListAreasDto {
  @ApiPropertyOptional({ type: Boolean, description: 'Filtra por estado activo.' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  active?: boolean;
}
