import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Tipos de proceso (design 1.2). FMAA = COORDINATION. */
export enum ProcessKind {
  PROCESS = 'PROCESS',
  COORDINATION = 'COORDINATION',
}

/**
 * Entrada para crear un Process (design 4.3). `code` se normaliza a MAYUSCULAS
 * en el service; `kind` por defecto PROCESS.
 */
export class CreateProcessDto {
  @ApiProperty({
    type: String,
    description: 'Codigo estable del proceso (se normaliza a MAYUSCULAS).',
    example: 'FIBI',
    maxLength: 50,
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code!: string;

  @ApiProperty({
    type: String,
    description: 'Nombre del proceso.',
    example: 'BI',
    maxLength: 255,
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Marco asociado observado.',
    example: 'INS-006',
    maxLength: 50,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  framework?: string;

  @ApiPropertyOptional({
    enum: ProcessKind,
    description: 'Tipo de proceso. Por defecto PROCESS.',
    default: ProcessKind.PROCESS,
  })
  @IsOptional()
  @IsEnum(ProcessKind)
  kind?: ProcessKind;

  @ApiPropertyOptional({
    type: Number,
    description: 'Orden de presentacion. Por defecto 0.',
    minimum: 0,
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
