import { OmitType } from '@nestjs/swagger';
import { ListPortfolioDto } from './list-portfolio.dto';

/**
 * Filtros de `GET /portfolio/summary`: los mismos del listado (búsqueda,
 * proceso, estado y banda) salvo paginación, orden y `alert`. Los contadores se
 * calculan sin `alert` para que las cuatro cifras sigan siendo comparables.
 */
export class PortfolioSummaryQueryDto extends OmitType(ListPortfolioDto, [
  'page',
  'pageSize',
  'sort',
  'dir',
  'alert',
] as const) {}
