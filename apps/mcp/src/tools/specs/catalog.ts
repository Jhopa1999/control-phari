/** Tools de catálogo (maestras). */
import type { ToolSpec } from '../spec.js';

export const CATALOG_SPECS: ReadonlyArray<ToolSpec> = [
  {
    name: 'catalog.list',
    operation: 'GET /catalog-items',
    access: 'read',
    description:
      'Lista elementos de catálogo (GET /catalog-items), con filtros ' +
      'opcionales por estado activo y por maestra.',
  },
  {
    name: 'catalog.get',
    operation: 'GET /catalog-items/{id}',
    access: 'read',
    description: 'Obtiene un elemento de catálogo por id (GET /catalog-items/{id}).',
  },
  {
    name: 'catalog.create',
    operation: 'POST /catalog-items',
    access: 'write',
    description:
      'Crea un elemento de catálogo (POST /catalog-items). El cuerpo debe ' +
      'cumplir CreateCatalogItemDto; el backend valida los datos.',
  },
  {
    name: 'catalog.update',
    operation: 'PATCH /catalog-items/{id}',
    access: 'write',
    description:
      'Actualiza un elemento de catálogo (PATCH /catalog-items/{id}). El ' +
      'cuerpo debe cumplir UpdateCatalogItemDto; el backend valida los datos.',
  },
];
