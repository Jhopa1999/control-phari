import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

const toBool = ({ value }: { value: unknown }): unknown => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

/** Filtros opcionales para GET /requesters. */
export class ListRequestersDto {
  @ApiPropertyOptional({ type: Boolean, description: 'Filtra por estado activo.' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Filtra por area.' })
  @IsOptional()
  @IsUUID()
  areaId?: string;
}
