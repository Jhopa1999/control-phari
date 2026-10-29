import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

const toBool = ({ value }: { value: unknown }): unknown => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

/** Filtros de GET /notifications. */
export class ListNotificationsDto {
  @ApiPropertyOptional({ type: Boolean, description: 'Solo no leídas.' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  unreadOnly?: boolean;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, description: 'Máximo de resultados (30 por defecto).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;
}
