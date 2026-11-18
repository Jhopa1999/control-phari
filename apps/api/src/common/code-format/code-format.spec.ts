import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAreaDto } from '../../modules/area/dto/create-area.dto';
import { CreateCatalogItemDto } from '../../modules/catalog/dto/create-catalog-item.dto';
import { CreateProcessDto } from '../../modules/process/dto/create-process.dto';
import { CODE_MESSAGES } from './code-format';

const AREA_ID = '5f0c2f4e-9d3a-4a39-8c3b-0a8a7c8e9f10';

async function errorsOf<T extends object>(
  cls: new () => T,
  plain: Record<string, unknown>,
  property: string,
): Promise<string[]> {
  const instance = plainToInstance(cls, plain);
  const errors = await validate(instance);
  return errors
    .filter((e) => e.property === property)
    .flatMap((e) => Object.values(e.constraints ?? {}));
}

const area = (code: unknown) =>
  errorsOf(CreateAreaDto, { code, name: 'Analítica' }, 'code');
const proceso = (code: unknown) =>
  errorsOf(CreateProcessDto, { code, name: 'BI', areaId: AREA_ID }, 'code');
const maestraCode = (code: unknown) =>
  errorsOf(CreateCatalogItemDto, { catalog: 'TIPO', code, label: 'Tipo' }, 'code');
const maestraCatalog = (catalog: unknown) =>
  errorsOf(CreateCatalogItemDto, { catalog, code: 'A', label: 'Tipo' }, 'catalog');

describe.each([
  ['área', area],
  ['proceso', proceso],
  ['elemento de maestra', maestraCode],
])('formato del código de %s', (_nombre, validar) => {
  it.each(['ANALITICA', 'FIBI_2', 'A', '2026_Q1', 'X'.repeat(40)])(
    'acepta «%s»',
    async (code) => {
      expect(await validar(code)).toEqual([]);
    },
  );

  it('normaliza minúsculas y espacios de los extremos: «  analitica » es válido', async () => {
    expect(await validar('  analitica ')).toEqual([]);
  });

  it.each([
    ['mal codigo', 'espacio'],
    ['MAL-CODIGO', 'guion'],
    ['ANALÍTICA', 'tilde'],
    ['COD.1', 'punto'],
    ['COD/1', 'barra'],
    ['ÑANDÚ', 'letra fuera de A-Z'],
  ])('rechaza «%s» (%s) con el mensaje en español', async (code) => {
    expect(await validar(code)).toEqual([CODE_MESSAGES.code.format]);
  });

  it.each(['', '   '])('rechaza el vacío «%s» solo como obligatorio', async (code) => {
    expect(await validar(code)).toEqual([CODE_MESSAGES.code.required]);
  });

  it('rechaza más de 40 caracteres con el mensaje de longitud', async () => {
    expect(await validar('X'.repeat(41))).toEqual([CODE_MESSAGES.code.maxLength]);
  });

  it('rechaza un valor que no es texto', async () => {
    const errores = await validar(123);
    expect(errores).toContain(CODE_MESSAGES.code.format);
  });
});

describe('formato del catálogo de maestras', () => {
  it('acepta y normaliza «tipo_solicitud»', async () => {
    expect(await maestraCatalog('tipo_solicitud')).toEqual([]);
  });

  it.each(['TIPO SOLICITUD', 'TIPO-SOLICITUD', 'TIPO.SOLICITUD'])(
    'rechaza «%s» con el mensaje del catálogo',
    async (catalog) => {
      expect(await maestraCatalog(catalog)).toEqual([CODE_MESSAGES.catalog.format]);
    },
  );

  it('rechaza el vacío y la longitud con sus mensajes', async () => {
    expect(await maestraCatalog('')).toEqual([CODE_MESSAGES.catalog.required]);
    expect(await maestraCatalog('C'.repeat(41))).toEqual([
      CODE_MESSAGES.catalog.maxLength,
    ]);
  });
});

describe('textos del formato de código', () => {
  it('coinciden con la especificación visual (la web los reconoce por texto exacto)', () => {
    expect(CODE_MESSAGES.code.format).toBe(
      'El código solo admite letras mayúsculas, números y guion bajo.',
    );
    expect(CODE_MESSAGES.code.maxLength).toBe(
      'El código admite como máximo 40 caracteres.',
    );
    expect(CODE_MESSAGES.catalog.format).toBe(
      'El catálogo solo admite letras mayúsculas, números y guion bajo.',
    );
    expect(CODE_MESSAGES.catalog.maxLength).toBe(
      'El catálogo admite como máximo 40 caracteres.',
    );
  });
});
