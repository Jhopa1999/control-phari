import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateTaskStatusDto } from './update-task-status.dto';

function parse(body: Record<string, unknown>) {
  const dto = plainToInstance(UpdateTaskStatusDto, body);
  return { dto, errors: validateSync(dto) };
}

describe('UpdateTaskStatusDto.blockedReason', () => {
  it('es opcional', () => {
    expect(parse({ status: 'BLOQUEADA' }).errors).toHaveLength(0);
  });

  it('se recorta y acepta hasta 500 caracteres', () => {
    const { dto, errors } = parse({ status: 'BLOQUEADA', blockedReason: `  ${'a'.repeat(500)}  ` });
    expect(errors).toHaveLength(0);
    expect(dto.blockedReason).toHaveLength(500);
  });

  it('más de 500 caracteres -> error de validación', () => {
    const { errors } = parse({ status: 'BLOQUEADA', blockedReason: 'a'.repeat(501) });
    expect(errors.map((e) => e.property)).toContain('blockedReason');
  });

  it('texto vacío o solo espacios se trata como ausente', () => {
    const { dto, errors } = parse({ status: 'BLOQUEADA', blockedReason: '   ' });
    expect(errors).toHaveLength(0);
    expect(dto.blockedReason).toBeUndefined();
  });
});
