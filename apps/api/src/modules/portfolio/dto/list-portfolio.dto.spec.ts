import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListPortfolioDto, MAX_FILTER_VALUES } from './list-portfolio.dto';

const U1 = '11111111-1111-1111-1111-111111111111';
const U2 = '22222222-2222-2222-2222-222222222222';

async function parse(query: Record<string, unknown>) {
  const dto = plainToInstance(ListPortfolioDto, query);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, errors };
}

describe('ListPortfolioDto (seleccion multiple)', () => {
  it('un valor suelto se convierte en arreglo de un elemento', async () => {
    const { dto, errors } = await parse({
      mainProcessId: U1,
      state: 'EN_EJECUCION',
      band: 'P1',
    });
    expect(errors).toHaveLength(0);
    expect(dto.mainProcessId).toEqual([U1]);
    expect(dto.state).toEqual(['EN_EJECUCION']);
    expect(dto.band).toEqual(['P1']);
  });

  it('sin filtros queda undefined y valida', async () => {
    const { dto, errors } = await parse({});
    expect(errors).toHaveLength(0);
    expect(dto.state).toBeUndefined();
  });

  it('acepta parametros repetidos (arreglo) en cada filtro', async () => {
    const { dto, errors } = await parse({
      mainProcessId: [U1, 'SIN_PROCESO', U2],
      state: ['EN_EJECUCION', 'BLOQUEADA'],
      band: ['P1', 'SIN_PRIORIZAR'],
    });
    expect(errors).toHaveLength(0);
    expect(dto.mainProcessId).toEqual([U1, 'SIN_PROCESO', U2]);
    expect(dto.band).toEqual(['P1', 'SIN_PRIORIZAR']);
  });

  it.each([
    ['mainProcessId', [U1, 'no-es-uuid']],
    ['state', ['EN_EJECUCION', 'INVENTADO']],
    ['band', ['P1', 'P9']],
  ])('rechaza un elemento invalido en %s', async (campo, valor) => {
    const { errors } = await parse({ [campo]: valor });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe(campo);
    expect(Object.values(errors[0].constraints ?? {}).join(' ')).toContain(
      'Cada valor de',
    );
  });

  it('rechaza una cadena vacia como elemento', async () => {
    const { errors } = await parse({ state: '' });
    expect(errors).toHaveLength(1);
  });

  it('aplica el tope de elementos por filtro', async () => {
    const ok = await parse({ band: Array(MAX_FILTER_VALUES).fill('P1') });
    expect(ok.errors).toHaveLength(0);
    const ko = await parse({ band: Array(MAX_FILTER_VALUES + 1).fill('P1') });
    expect(ko.errors).toHaveLength(1);
    expect(Object.values(ko.errors[0].constraints ?? {}).join(' ')).toContain(
      `máximo ${MAX_FILTER_VALUES}`,
    );
  });
});
