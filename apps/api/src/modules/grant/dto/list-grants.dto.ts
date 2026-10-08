import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

const toBool = ({ value }: { value: unknown }): unknown => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

/** Filtros opcionales para GET /grants (design 4.3). */
export class ListGrantsDto {
  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Filtra por usuario.' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Filtra por proceso.' })
  @IsOptional()
  @IsUUID()
  processId?: string;

  @ApiPropertyOptional({ type: Boolean, description: 'Filtra por estado activo.' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  active?: boolean;
}
