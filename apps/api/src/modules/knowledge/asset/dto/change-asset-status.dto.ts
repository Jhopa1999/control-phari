import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ASSET_STATUSES } from '../asset-status';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Entrada para cambiar el estado de un activo (design §3.4/§4.1). La transicion
 * se valida contra la maquina minima en el service (salto invalido ⇒ 400).
 */
export class ChangeAssetStatusDto {
  @ApiProperty({ enum: ASSET_STATUSES, description: 'Estado destino.' })
  @IsIn(ASSET_STATUSES as readonly string[], { message: 'Estado destino invalido.' })
  targetStatus!: string;

  @ApiPropertyOptional({ type: String, description: 'Motivo del cambio.', maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
