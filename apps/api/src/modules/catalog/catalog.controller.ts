import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CatalogService } from './catalog.service';
import { CatalogItemResponseDto } from './dto/catalog-item-response.dto';
import { CreateCatalogItemDto } from './dto/create-catalog-item.dto';
import { ListCatalogItemsDto } from './dto/list-catalog-items.dto';
import { UpdateCatalogItemDto } from './dto/update-catalog-item.dto';

/**
 * API REST de la maestra generica CatalogItem.
 * El controller solo recibe HTTP, aplica DTOs y delega en el service.
 */
@ApiTags('catalog-items')
@Controller('catalog-items')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Post()
  @ApiOperation({ summary: 'Crea un elemento de catalogo.' })
  @ApiBody({ type: CreateCatalogItemDto })
  @ApiResponse({ status: 201, description: 'Elemento creado.', type: CatalogItemResponseDto })
  @ApiResponse({ status: 400, description: 'Datos de entrada invalidos.' })
  @ApiResponse({ status: 409, description: 'Ya existe (catalog, code).' })
  create(@Body() dto: CreateCatalogItemDto) {
    return this.catalogService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista elementos de catalogo, con filtros opcionales.' })
  @ApiQuery({ name: 'catalog', required: false, description: 'Filtra por maestra (se normaliza a MAYUSCULAS).' })
  @ApiQuery({ name: 'active', required: false, type: Boolean, description: 'Filtra por estado activo.' })
  @ApiResponse({ status: 200, description: 'Listado de elementos.', type: [CatalogItemResponseDto] })
  @ApiResponse({ status: 400, description: 'Parametros de filtro invalidos.' })
  findMany(@Query() filters: ListCatalogItemsDto) {
    return this.catalogService.findMany(filters);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtiene un elemento de catalogo por id.' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Identificador UUID del elemento.' })
  @ApiResponse({ status: 200, description: 'Elemento encontrado.', type: CatalogItemResponseDto })
  @ApiResponse({ status: 400, description: 'El id no es un UUID valido.' })
  @ApiResponse({ status: 404, description: 'Elemento no encontrado.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalogService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualiza label, active o sortOrder de un elemento.' })
  @ApiBody({ type: UpdateCatalogItemDto })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Identificador UUID del elemento.' })
  @ApiResponse({ status: 200, description: 'Elemento actualizado.', type: CatalogItemResponseDto })
  @ApiResponse({ status: 400, description: 'Datos de entrada invalidos o id no UUID.' })
  @ApiResponse({ status: 404, description: 'Elemento no encontrado.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCatalogItemDto,
  ) {
    return this.catalogService.update(id, dto);
  }
}
