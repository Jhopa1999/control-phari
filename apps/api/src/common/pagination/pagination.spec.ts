import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  DEFAULT_PAGE_SIZE,
  LIST_HARD_CAP,
  MAX_PAGE_SIZE,
  buildPageResult,
  normalizeSearch,
  resolveLegacyTakeWindow,
  resolvePage,
  setPaginationHeaders,
  sliceWindow,
} from './pagination';
import { PaginationQueryDto } from './pagination-query.dto';

describe('pagination', () => {
  describe('resolvePage', () => {
    it('sin page ni pageSize: una ventana con el tope (comportamiento anterior)', () => {
      expect(resolvePage({})).toEqual({
        paginated: false,
        page: 1,
        pageSize: LIST_HARD_CAP,
        skip: 0,
        take: LIST_HARD_CAP,
      });
    });

    it('solo page: tamaño por defecto', () => {
      expect(resolvePage({ page: 3 })).toMatchObject({
        paginated: true,
        page: 3,
        pageSize: DEFAULT_PAGE_SIZE,
        skip: 2 * DEFAULT_PAGE_SIZE,
      });
    });

    it('acota pageSize al máximo y page a 1 como mínimo', () => {
      expect(resolvePage({ page: 0, pageSize: 5000 })).toMatchObject({
        page: 1,
        pageSize: MAX_PAGE_SIZE,
        skip: 0,
        take: MAX_PAGE_SIZE,
      });
    });

    it('skip = (page - 1) * pageSize', () => {
      expect(resolvePage({ page: 4, pageSize: 10 })).toMatchObject({ skip: 30, take: 10 });
    });
  });

  describe('resolveLegacyTakeWindow (take obsoleto)', () => {
    it('take solo: primeras N filas sin marca de truncado', () => {
      const window = resolveLegacyTakeWindow({ take: 7 });
      expect(window).toMatchObject({ skip: 0, take: 7, paginated: true });
      expect(buildPageResult([], 50, window).truncated).toBe(false);
    });

    it('take y pageSize: gana pageSize', () => {
      expect(resolveLegacyTakeWindow({ take: 7, pageSize: 20 })).toMatchObject({ take: 20 });
    });
  });

  describe('buildPageResult', () => {
    it('marca truncado solo si no se pidió página y el total supera el tope', () => {
      expect(buildPageResult([], LIST_HARD_CAP + 1, resolvePage({})).truncated).toBe(true);
      expect(buildPageResult([], LIST_HARD_CAP, resolvePage({})).truncated).toBe(false);
      expect(buildPageResult([], 5000, resolvePage({ pageSize: 10 })).truncated).toBe(false);
    });
  });

  it('sliceWindow recorta la ventana de una lista en memoria', () => {
    expect(sliceWindow([1, 2, 3, 4, 5], resolvePage({ page: 2, pageSize: 2 }))).toEqual([3, 4]);
  });

  it('setPaginationHeaders escribe las cuatro cabeceras', () => {
    const headers: Record<string, string> = {};
    setPaginationHeaders(
      { setHeader: (name, value) => (headers[name] = value) },
      buildPageResult([], 12, resolvePage({ page: 2, pageSize: 5 })),
    );
    expect(headers).toEqual({
      'X-Total-Count': '12',
      'X-Page': '2',
      'X-Page-Size': '5',
      'X-Truncated': 'false',
    });
  });

  it('normalizeSearch recorta espacios y trata el vacío como sin búsqueda', () => {
    expect(normalizeSearch('  PRY-0012 ')).toBe('PRY-0012');
    expect(normalizeSearch('   ')).toBeUndefined();
    expect(normalizeSearch(undefined)).toBeUndefined();
  });

  describe('PaginationQueryDto', () => {
    async function errors(plain: Record<string, unknown>): Promise<string[]> {
      const dto = plainToInstance(PaginationQueryDto, plain);
      return (await validate(dto)).map((e) => e.property);
    }

    it('acepta parámetros omitidos (compatibilidad)', async () => {
      expect(await errors({})).toEqual([]);
    });

    it('convierte page y pageSize de la query string', async () => {
      const dto = plainToInstance(PaginationQueryDto, { page: '2', pageSize: '50' });
      expect(dto.page).toBe(2);
      expect(dto.pageSize).toBe(50);
      expect(await validate(dto)).toEqual([]);
    });

    it('rechaza pageSize mayor que el máximo, page 0 y dir inválido', async () => {
      expect(await errors({ pageSize: String(MAX_PAGE_SIZE + 1) })).toEqual(['pageSize']);
      expect(await errors({ page: '0' })).toEqual(['page']);
      expect(await errors({ dir: 'up' })).toEqual(['dir']);
    });

    it('q se recorta y admite como máximo 200 caracteres', async () => {
      const dto = plainToInstance(PaginationQueryDto, { q: '  hola ' });
      expect(dto.q).toBe('hola');
      expect(await errors({ q: 'x'.repeat(201) })).toEqual(['q']);
    });
  });
});
