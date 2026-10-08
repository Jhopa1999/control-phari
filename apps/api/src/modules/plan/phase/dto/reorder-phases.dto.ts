import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

/**
 * Entrada para reordenar las fases de un plan (design §3.4). `phaseIds` es la
 * lista ordenada completa de ids de fases del plan; el service valida que el
 * conjunto coincida exactamente (400 si falta/sobra alguno) y recomputa `order`
 * 0-based respetando @@unique([planId, order]).
 */
export class ReorderPhasesDto {
  @ApiProperty({ type: [String], description: 'Ids de fases en el orden deseado.' })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  phaseIds!: string[];
}
