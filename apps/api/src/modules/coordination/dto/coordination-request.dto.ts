import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Solicitud o proyecto que se puede relacionar con un acta o un compromiso
 * (`GET /coordination/requests`). Solo datos no sensibles.
 */
export class CoordinationRequestDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Identificador de la solicitud.' })
  id!: string;

  @ApiProperty({ type: String, description: 'Código visible (PRY-0012).' })
  code!: string;

  @ApiProperty({ type: String, description: 'Título de la solicitud.' })
  title!: string;

  @ApiProperty({ type: Boolean, description: 'La solicitud ya fue cerrada formalmente.' })
  closed!: boolean;
}

/** Query de `GET /coordination/requests`. */
export class ListCoordinationRequestsDto {
  @ApiPropertyOptional({
    type: String,
    maxLength: 100,
    description: 'Busca por código o título, sin distinguir mayúsculas.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  q?: string;
}
