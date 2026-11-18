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
      'Crea un elemento de catálogo (POST /catalog-items). Solo el jefe de ' +
      'área (módulo admin): integrante, líder y administrador reciben 403. El ' +
      'cuerpo debe cumplir CreateCatalogItemDto; catalog y code solo admiten ' +
      'letras mayúsculas, números y guion bajo (máximo 40; se normalizan a ' +
      'mayúsculas) o el backend responde 400 en español.',
  },
  {
    name: 'catalog.update',
    operation: 'PATCH /catalog-items/{id}',
    access: 'write',
    description:
      'Actualiza un elemento de catálogo (PATCH /catalog-items/{id}). Solo el ' +
      'jefe de área (módulo admin): integrante, líder y administrador reciben ' +
      '403. El cuerpo debe cumplir UpdateCatalogItemDto; el backend valida los datos.',
  },
];
