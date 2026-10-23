import { ApiProperty } from '@nestjs/swagger';
import { AuditEventResponseDto } from './audit-event-response.dto';

/**
 * Pagina de eventos de auditoria (design 4.2 / Fase B). Estilo de paginacion
 * adoptado en el portal: page/pageSize 1-based con respuesta envuelta
 * { data, page, pageSize, total, hasMore }. El generador de OpenAPI corre con
 * tsx sin el plugin de swagger, asi que NO infiere genericos: cada campo lleva
 * @ApiProperty con type explicito y `data` materializa el tipo del item.
 */
export class PaginatedAuditEventsResponseDto {
  @ApiProperty({
    type: [AuditEventResponseDto],
    description: 'Eventos de la pagina, los mas recientes primero.',
  })
  data!: AuditEventResponseDto[];

  @ApiProperty({ type: Number, description: 'Pagina actual (1-based).', example: 1 })
  page!: number;

  @ApiProperty({ type: Number, description: 'Tamano de pagina aplicado (acotado a 100).', example: 25 })
  pageSize!: number;

  @ApiProperty({ type: Number, description: 'Total de eventos en alcance para el filtro vigente.' })
  total!: number;

  @ApiProperty({ type: Boolean, description: 'Hay al menos una pagina mas despues de esta.' })
  hasMore!: boolean;
}
