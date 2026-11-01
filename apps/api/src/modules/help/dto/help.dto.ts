import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

/** Consulta a la ayuda del portal. */
export class HelpSearchQueryDto {
  @ApiProperty({
    type: String,
    minLength: 2,
    maxLength: 200,
    description: 'Pregunta o palabras clave (p. ej. «aprobar un documento»).',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2, { message: 'Escribe al menos 2 caracteres.' })
  @MaxLength(200)
  q!: string;

  @ApiPropertyOptional({
    type: Number,
    minimum: 1,
    maximum: 8,
    default: 4,
    description: 'Máximo de secciones a devolver (1..8).',
  })
  @Transform(({ value }: { value: unknown }) =>
    value === undefined || value === '' ? undefined : Number(value),
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  limit?: number;
}

/** Sección de la documentación que responde la consulta. */
export class HelpMatchDto {
  @ApiProperty({ type: String, description: 'Documento de origen (p. ej. «Pantallas del portal»).' })
  source!: string;

  @ApiProperty({ type: String, description: 'Archivo de origen en docs/aplicacion.' })
  file!: string;

  @ApiProperty({ type: String, description: 'Encabezado de la sección (con el padre si aplica).' })
  heading!: string;

  @ApiProperty({ type: String, description: 'Texto de la sección en Markdown (recortado).' })
  excerpt!: string;

  @ApiProperty({ type: Number, description: 'Relevancia relativa respecto a la consulta.' })
  score!: number;
}

/** Resultado de buscar en la ayuda. */
export class HelpSearchResponseDto {
  @ApiProperty({ type: String, description: 'Consulta tal como se evaluó.' })
  query!: string;

  @ApiProperty({
    type: [HelpMatchDto],
    description: 'Secciones más relevantes, de mayor a menor; vacío si nada coincide.',
  })
  results!: HelpMatchDto[];
}
