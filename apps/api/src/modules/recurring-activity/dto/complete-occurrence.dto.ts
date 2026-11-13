import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Entrada para completar una ocurrencia. Registra que se realizo (texto) y las
 * horas reales. Si la definicion exige evidencia, el service ademas comprueba
 * que haya al menos un adjunto (409). El service valida la ventana, la
 * transicion de estado y el alcance.
 */
export class CompleteOccurrenceDto {
  @ApiProperty({
    type: String,
    description: 'Que se realizo (obligatorio, 1 a 2000 caracteres).',
    minLength: 1,
    maxLength: 2000,
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  comment!: string;

  @ApiProperty({
    type: Number,
    description: 'Horas reales dedicadas (> 0, hasta 2 decimales).',
    minimum: 0.01,
    maximum: 999.99,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999.99)
  actualHours!: number;
}