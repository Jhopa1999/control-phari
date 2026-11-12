import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateActivityDto } from './create-activity.dto';
import { UpdateActivityDto } from './update-activity.dto';
import { WorklogOptionsQueryDto } from './worklog-options.dto';

// Mismas opciones que el ValidationPipe global (app.config.ts).
const opts = { whitelist: true, forbidNonWhitelisted: true } as const;

describe('DTO de actividad de la bitÃ¡cora', () => {
  it('relatedIssueId ya no se acepta al crear: se rechaza (400 por el ValidationPipe)', async () => {
    const dto = plainToInstance(CreateActivityDto, {
      classificationCode: 'INTERNA',
      relatedIssueId: '44444444-4444-4444-4444-444444444444',
    });
    const errors = await validate(dto, opts);
    expect(errors.map((e) => e.property)).toContain('relatedIssueId');
  });

  it('relatedIssueId ya no se acepta al editar', async () => {
    const dto = plainToInstance(UpdateActivityDto, {
      relatedIssueId: '44444444-4444-4444-4444-444444444444',
    });
    const errors = await validate(dto, opts);
    expect(errors.map((e) => e.property)).toContain('relatedIssueId');
  });

  it('una actividad vÃ¡lida sin relatedIssueId no tiene errores', async () => {
    const dto = plainToInstance(CreateActivityDto, {
      classificationCode: 'PLANIFICADA',
      taskId: '3f2b8c1e-1d2a-4b3c-8d4e-5f6a7b8c9d0e',
    });
    expect(await validate(dto, opts)).toHaveLength(0);
  });
});

describe('WorklogOptionsQueryDto', () => {
  it('processId es obligatorio y uuid', async () => {
    const errors = await validate(plainToInstance(WorklogOptionsQueryDto, {}), opts);
    expect(errors.map((e) => e.property)).toContain('processId');
  });

  it('convierte includeTerminated=true y acepta scope mine|all', async () => {
    const dto = plainToInstance(WorklogOptionsQueryDto, {
      processId: '2b66a8ae-3722-439a-8bf7-b7a86d48a9e7',
      includeTerminated: 'true',
      scope: 'all',
      date: '2026-11-11',
      q: ' T07 ',
    });
    expect(await validate(dto, opts)).toHaveLength(0);
    expect(dto.includeTerminated).toBe(true);
    expect(dto.q).toBe('T07');
  });

  it('rechaza scope y fecha invÃ¡lidos', async () => {
    const dto = plainToInstance(WorklogOptionsQueryDto, {
      processId: '2b66a8ae-3722-439a-8bf7-b7a86d48a9e7',
      scope: 'todos',
      date: '11/11/2026',
    });
    const props = (await validate(dto, opts)).map((e) => e.property);
    expect(props).toEqual(expect.arrayContaining(['scope', 'date']));
  });
});
