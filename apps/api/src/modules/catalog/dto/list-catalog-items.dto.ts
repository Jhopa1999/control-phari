import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

/**
 * Filtros opcionales para GET /catalog-items.
 * `active` llega como string en el query y se transforma a boolean.
 */
export class ListCatalogItemsDto {
  @IsOptional()
  @IsString()
  catalog?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  active?: boolean;
}
