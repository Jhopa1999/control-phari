import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  BEDROCK_MODEL_TIERS,
  type BedrockModelTier,
} from '../bedrock-model-catalog';

/** Campos editables de un modelo del catalogo (todos opcionales en PATCH). */
export class UpdateAiModelDto {
  @ApiPropertyOptional({ type: String, description: 'Nombre legible.', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label?: string;

  @ApiPropertyOptional({ type: String, enum: BEDROCK_MODEL_TIERS, description: 'Categoria orientativa.' })
  @IsOptional()
  @IsIn(BEDROCK_MODEL_TIERS, { message: 'Tier invalido.' })
  tier?: BedrockModelTier;

  @ApiPropertyOptional({ type: Boolean, description: 'Disponible para asignarse a agentes.' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ type: Boolean, description: 'Acepta temperature.' })
  @IsOptional()
  @IsBoolean()
  supportsTemperature?: boolean;

  @ApiPropertyOptional({ type: Boolean, description: 'Soporta tool use.' })
  @IsOptional()
  @IsBoolean()
  supportsTools?: boolean;

  @ApiPropertyOptional({ type: Boolean, description: 'Acepta imagenes.' })
  @IsOptional()
  @IsBoolean()
  supportsVision?: boolean;

  @ApiPropertyOptional({ type: Boolean, description: 'Acepta documentos.' })
  @IsOptional()
  @IsBoolean()
  supportsDocuments?: boolean;

  @ApiPropertyOptional({ type: Number, description: 'Orden en el selector (menor primero).', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description:
      'USD por millon de tokens de entrada. null quita el precio (el consumo del modelo deja de sumar al costo).',
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  inputUsdPerMTok?: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description:
      'USD por millon de tokens de salida. null quita el precio (el consumo del modelo deja de sumar al costo).',
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  outputUsdPerMTok?: number | null;
}

/** Alta de un modelo: `modelId` obligatorio e inmutable despues. */
export class CreateAiModelDto extends UpdateAiModelDto {
  @ApiProperty({
    type: String,
    description: 'ID invocable en Bedrock (perfil de inferencia, p. ej. us.anthropic.claude-...).',
    maxLength: 200,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  @Matches(/^[A-Za-z0-9._:-]+$/, { message: 'El id del modelo solo admite letras, numeros, . _ : -' })
  modelId!: string;

  @ApiProperty({ type: String, description: 'Nombre legible.', maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  override label!: string;
}
