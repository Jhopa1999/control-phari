import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Entrada para marcar un gate NO_APLICA (design §5, D-D2): `waiverReason` es
 * obligatorio y solo se permite en rutas SIMPLIFICADA/EXPLORACION (validado en
 * el service).
 */
export class WaiveGateDto {
  @ApiProperty({
    type: String,
    description: 'Motivo documentado del NO_APLICA.',
    minLength: 1,
    maxLength: 2000,
  })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  waiverReason!: string;
}
