import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Entrada para crear un solicitante: el area es obligatoria (SOL-02). */
export class CreateRequesterDto {
  @ApiProperty({ type: String, description: 'Nombre del solicitante.', maxLength: 255 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Area del maestro de areas.' })
  @IsUUID()
  areaId!: string;
}
