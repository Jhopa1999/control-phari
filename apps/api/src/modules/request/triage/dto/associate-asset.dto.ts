import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * Entrada para asociar un activo EXISTENTE a una solicitud en el triage. El
 * triage NO crea activos (la creacion se realiza en el modulo de Activos, solo
 * por el jefe de area); aqui solo se asocia un activo visible para el actor. El
 * service valida que el activo este en alcance (404 si no) y habilitado para el
 * proceso principal de la solicitud (409 si no).
 */
export class AssociateAssetDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    description: 'Activo existente a asociar.',
  })
  @IsUUID()
  assetId!: string;
}
