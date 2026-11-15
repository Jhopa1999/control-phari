import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePriorityEvaluationDto } from './create-priority-evaluation.dto';

const CRITERIA = [
  'impact',
  'alignment',
  'riskControl',
  'urgency',
  'scope',
  'dataAvailability',
  'feasibility',
  'reuse',
] as const;

function complete(value = 3): Record<string, number> {
  return Object.fromEntries(CRITERIA.map((key) => [key, value]));
}

async function invalidFields(payload: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(CreatePriorityEvaluationDto, payload));
  return errors.map((e) => e.property).sort();
}

describe('CreatePriorityEvaluationDto: los ocho criterios son obligatorios', () => {
  it('acepta los ocho criterios entre 1 y 5', async () => {
    expect(await invalidFields(complete())).toEqual([]);
    expect(await invalidFields({ ...complete(1), impact: 5 })).toEqual([]);
  });

  it('un cuerpo vacío rechaza los ocho criterios (no hay valores por defecto)', async () => {
    expect(await invalidFields({})).toEqual([...CRITERIA].sort());
  });

  it.each(CRITERIA)('rechaza si falta «%s»', async (key) => {
    const payload = complete();
    delete payload[key];
    expect(await invalidFields(payload)).toEqual([key]);
  });

  it.each([0, 6, 3.5, -1])('rechaza el valor %s fuera de 1 a 5 o no entero', async (value) => {
    expect(await invalidFields({ ...complete(), urgency: value })).toEqual(['urgency']);
  });

  it('rechaza un criterio nulo o texto', async () => {
    expect(await invalidFields({ ...complete(), reuse: null })).toEqual(['reuse']);
    expect(await invalidFields({ ...complete(), reuse: '3' })).toEqual(['reuse']);
  });
});
