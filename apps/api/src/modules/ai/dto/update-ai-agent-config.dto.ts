import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Entrada para actualizar la configuracion de un AGENTE de IA (por `code`).
 * PATCH (no PUT): todos los campos son opcionales; el service solo toca lo
 * presente. `model` se valida contra el catalogo cerrado (assertModelAllowed) en
 * el service. Limites de `basePrompt`/`temperature`/`maxTokens`/`timeoutMs`
 * acotan el costo y evitan payloads abusivos.
 */
export class UpdateAiAgentConfigDto {
  @ApiPropertyOptional({ type: Boolean, description: 'Enciende/apaga este agente.' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ type: String, description: 'Region de AWS (p. ej. us-east-2).', maxLength: 32 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(32)
  region?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'ID del modelo de Bedrock (debe estar en el catalogo permitido).',
    maxLength: 128,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(128)
  model?: string;

  @ApiPropertyOptional({ type: String, description: 'Prompt base del agente.', maxLength: 8000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(8000)
  basePrompt?: string;

  @ApiPropertyOptional({ type: Number, description: 'Temperatura 0..1.', minimum: 0, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  temperature?: number;

  @ApiPropertyOptional({ type: Number, description: 'Maximo de tokens 1..8192.', minimum: 1, maximum: 8192 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8192)
  maxTokens?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'Timeout de invocacion en ms (1000..60000).',
    minimum: 1000,
    maximum: 60000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(60000)
  timeoutMs?: number;
}
