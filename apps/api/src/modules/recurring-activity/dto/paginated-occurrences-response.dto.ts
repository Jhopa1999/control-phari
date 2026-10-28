import { ApiProperty } from '@nestjs/swagger';
import { OccurrenceResponseDto } from './occurrence-response.dto';

/**
 * Pagina de ocurrencias { data, page, pageSize, total, hasMore } (FEAT-002).
 * Mismo estilo de paginacion 1-based que PaginatedAuditEventsResponseDto. El
 * generador de OpenAPI corre con tsx sin el plugin de swagger, asi que cada
 * campo lleva @ApiProperty con type explicito y `data` materializa el item.
 */
export class PaginatedOccurrencesResponseDto {
  @ApiProperty({
    type: [OccurrenceResponseDto],
    description: 'Ocurrencias de la pagina.',
  })
  data!: OccurrenceResponseDto[];

  @ApiProperty({ type: Number, description: 'Pagina actual (1-based).', example: 1 })
  page!: number;

  @ApiProperty({ type: Number, description: 'Tamano de pagina aplicado (acotado a 100).', example: 25 })
  pageSize!: number;

  @ApiProperty({ type: Number, description: 'Total de ocurrencias en alcance para el filtro vigente.' })
  total!: number;

  @ApiProperty({ type: Boolean, description: 'Hay al menos una pagina mas despues de esta.' })
  hasMore!: boolean;
}
