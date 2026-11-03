import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Devolucion de un diario o semanal a borrador: el motivo es obligatorio. */
export class ReturnWorklogDto {
  @ApiProperty({
    type: String,
    description: 'Motivo de la devolucion (lo ve el autor).',
    minLength: 10,
    maxLength: 1000,
  })
  @Transform(trim)
  @IsString()
  @MinLength(10, { message: 'El motivo debe tener al menos 10 caracteres.' })
  @MaxLength(1000)
  reason!: string;
}
