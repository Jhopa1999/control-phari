import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

const upper = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

/**
 * Entrada para fijar/cambiar la ruta proporcional (design §5, D-D1): `route` es
 * un code del catalogo GOVERNANCE_ROUTE, validado en el service con
 * assertCatalogCode (400 si no existe/activo).
 */
export class SetRouteDto {
  @ApiProperty({
    type: String,
    description: 'Code de la ruta proporcional (catalogo GOVERNANCE_ROUTE).',
    minLength: 1,
    maxLength: 100,
  })
  @Transform(upper)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  route!: string;
}
