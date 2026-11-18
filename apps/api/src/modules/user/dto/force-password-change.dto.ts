import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsUUID,
} from 'class-validator';

/**
 * Cuerpo de POST /users/force-password-change. Exige exactamente una de
 * `all: true` o `userIds` (lo valida el servicio, con 400 en español).
 */
export class ForcePasswordChangeDto {
  @ApiPropertyOptional({
    type: Boolean,
    description:
      'true aplica a todos los usuarios con contraseña (con enabled=true, excepto quien ejecuta la acción).',
  })
  @IsOptional()
  @IsBoolean()
  all?: boolean;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Usuarios a los que aplicar (1 a 500). Quien ejecuta puede incluirse a propósito.',
    minItems: 1,
    maxItems: 500,
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  userIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Solo con all=true: usuarios que se dejan fuera (p. ej. la cuenta del MCP). Máximo 100.',
    maxItems: 100,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  excludeUserIds?: string[];

  @ApiPropertyOptional({
    type: Boolean,
    default: true,
    description: 'true (por defecto) exige el cambio; false retira la exigencia.',
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

/** Resultado de POST /users/force-password-change. */
export class ForcePasswordChangeResponseDto {
  @ApiProperty({ type: Number, description: 'Usuarios cuyo indicador cambió.' })
  updated!: number;

  @ApiProperty({
    type: Number,
    description: 'Usuarios omitidos: sin contraseña o que ya estaban en el estado pedido.',
  })
  skipped!: number;

  @ApiProperty({
    type: Boolean,
    description: 'true si all=true dejó fuera a quien ejecuta la acción.',
  })
  excludedSelf!: boolean;
}
