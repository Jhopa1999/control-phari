import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { ProcessKind } from './create-process.dto';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const toBool = ({ value }: { value: unknown }): unknown => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

/** Filtros opcionales para GET /processes (design 4.3). */
export class ListProcessesDto {
  @ApiPropertyOptional({ type: Boolean, description: 'Filtra por estado activo.' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ enum: ProcessKind, description: 'Filtra por tipo de proceso.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsIn([ProcessKind.PROCESS, ProcessKind.COORDINATION])
  kind?: ProcessKind;
}
