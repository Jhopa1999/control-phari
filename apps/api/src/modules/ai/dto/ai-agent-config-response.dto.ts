import { ApiProperty } from '@nestjs/swagger';

/**
 * Estado de la configuracion de un AGENTE de IA para el ADMIN. No contiene
 * secretos (las credenciales viven en la config global). `updatedAt` es ISO o
 * null segun la convencion de respuesta del modulo.
 */
export class AiAgentConfigResponseDto {
  @ApiProperty({ type: String, description: 'Code estable del agente (p. ej. TRIAGE).' })
  code!: string;

  @ApiProperty({ type: String, description: 'Nombre visible del agente.' })
  displayName!: string;

  @ApiProperty({ type: Boolean, description: 'Agente encendido.' })
  enabled!: boolean;

  @ApiProperty({ type: String, description: 'Region de AWS del agente.' })
  region!: string;

  @ApiProperty({ type: String, description: 'ID del modelo de Bedrock en uso.' })
  model!: string;

  @ApiProperty({ type: String, description: 'Prompt base del agente.' })
  basePrompt!: string;

  @ApiProperty({ type: Number, description: 'Temperatura de muestreo (0..1).' })
  temperature!: number;

  @ApiProperty({ type: Number, description: 'Maximo de tokens de salida.' })
  maxTokens!: number;

  @ApiProperty({ type: Number, description: 'Timeout de invocacion en ms.' })
  timeoutMs!: number;

  @ApiProperty({ type: String, nullable: true, description: 'Ultima actualizacion (ISO) o null.' })
  updatedAt!: string | null;
}
