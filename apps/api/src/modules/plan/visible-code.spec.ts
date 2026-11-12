import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateRequestDto } from '../request/dto/create-request.dto';
import { UpdateRequestDto } from '../request/dto/update-request.dto';
import { CreatePhaseDto } from './phase/dto/create-phase.dto';
import { UpdatePhaseDto } from './phase/dto/update-phase.dto';
import { CreateTaskDto } from './task/dto/create-task.dto';
import { UpdateTaskDto } from './task/dto/update-task.dto';
import { PlanDocumentDto } from './dto/plan-document.dto';
import {
  VISIBLE_CODE_PREFIX,
  codeSearchConditions,
  formatPhaseCode,
  formatRequestCode,
  formatTaskCode,
  nextRequestNumber,
  parseVisibleCode,
  reservePlanSequence,
  shortCode,
} from './visible-code';

describe('visible-code', () => {
  describe('formato', () => {
    it('solicitud: prefijo PRY y 4 dígitos mínimo; crece a 5+ sin truncar', () => {
      expect(VISIBLE_CODE_PREFIX).toBe('PRY');
      expect(formatRequestCode(1)).toBe('PRY-0001');
      expect(formatRequestCode(12)).toBe('PRY-0012');
      expect(formatRequestCode(9999)).toBe('PRY-9999');
      expect(formatRequestCode(10000)).toBe('PRY-10000');
      expect(formatRequestCode(123456)).toBe('PRY-123456');
    });

    it('fase: sin relleno (F1, F2, ... F10)', () => {
      expect(formatPhaseCode('PRY-0012', 1)).toBe('PRY-0012-F1');
      expect(formatPhaseCode('PRY-0012', 10)).toBe('PRY-0012-F10');
    });

    it('tarea: 2 dígitos mínimo; crece a 3+ sin truncar', () => {
      expect(formatTaskCode('PRY-0012', 7)).toBe('PRY-0012-T07');
      expect(formatTaskCode('PRY-0012', 99)).toBe('PRY-0012-T99');
      expect(formatTaskCode('PRY-0012', 100)).toBe('PRY-0012-T100');
      expect(formatTaskCode('PRY-0012', 1234)).toBe('PRY-0012-T1234');
    });

    it('forma corta para mostrar dentro de un plan', () => {
      expect(shortCode('PRY-0012-T07')).toBe('T07');
      expect(shortCode('PRY-0012-F2')).toBe('F2');
      expect(shortCode('PRY-0012')).toBe('PRY-0012');
    });
  });

  describe('codeSearchConditions', () => {
    it('vacío -> sin condiciones', () => {
      expect(codeSearchConditions('   ')).toEqual([]);
    });

    it('código completo o parcial: contains sin distinguir mayúsculas', () => {
      expect(codeSearchConditions('pry-0012')).toEqual([
        { code: { contains: 'pry-0012', mode: 'insensitive' } },
      ]);
    });

    it('forma corta de tarea (T07 / t7) añade coincidencia por sufijo con relleno', () => {
      const expected = { code: { endsWith: '-T07', mode: 'insensitive' } };
      expect(codeSearchConditions('T07')).toContainEqual(expected);
      expect(codeSearchConditions('t7')).toContainEqual(expected);
    });

    it('forma corta de fase (F2) añade coincidencia por sufijo sin relleno', () => {
      expect(codeSearchConditions('f2')).toContainEqual({
        code: { endsWith: '-F2', mode: 'insensitive' },
      });
    });
  });

  describe('parseVisibleCode', () => {
    it.each([
      ['PRY-0012', 'REQUEST', 'PRY-0012'],
      ['pry-0012', 'REQUEST', 'PRY-0012'],
      ['PRY-00012', 'REQUEST', 'PRY-00012'],
      ['PRY-0012-F2', 'PHASE', 'PRY-0012'],
      ['PRY-0012-T07', 'TASK', 'PRY-0012'],
      [' pry 0012 t07 ', 'TASK', 'PRY-0012'],
      ['PRY_0012–F2', 'PHASE', 'PRY-0012'],
    ])('"%s" -> %s', (raw, kind, requestCode) => {
      const parsed = parseVisibleCode(raw);
      expect(parsed?.kind).toBe(kind);
      expect(parsed?.requestCode).toBe(requestCode);
      expect(parsed?.code).toMatch(/^PRY-\d{4,}(-[FT]\d+)?$/);
    });

    it.each(['', 'PRY-12', 'PRY-0012-X1', 'PRY-0012-T', 'T07', 'F2', 'PRY-0012-T07-1', `PRY-${'9'.repeat(40)}`])(
      '"%s" no tiene forma de código',
      (raw) => {
        expect(parseVisibleCode(raw)).toBeNull();
      },
    );
  });
  describe('reserva atómica', () => {
    it('reserva N números con un único update y devuelve el primero reservado', async () => {
      const update = jest.fn().mockResolvedValue({
        phaseSeqNext: 1,
        taskSeqNext: 18,
        request: { code: 'PRY-0012' },
      });
      const tx = { plan: { update } } as never;
      const res = await reservePlanSequence(tx, 'plan1', 'task', 5);
      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][0].data).toEqual({ taskSeqNext: { increment: 5 } });
      // El update devuelve el valor ya incrementado (18): el primero reservado es 13.
      expect(res).toEqual({ requestCode: 'PRY-0012', first: 13 });
    });

    it('nextRequestNumber convierte el bigint de la secuencia', async () => {
      const tx = { $queryRaw: jest.fn().mockResolvedValue([{ n: BigInt(42) }]) } as never;
      await expect(nextRequestNumber(tx)).resolves.toBe(42);
    });
  });

  describe('los DTO de entrada no aceptan code ni number', () => {
    const opts = { whitelist: true, forbidNonWhitelisted: true } as const;

    async function rejects<T extends object>(cls: new () => T, body: Record<string, unknown>) {
      const errors = await validate(plainToInstance(cls, body) as object, opts);
      return errors.flatMap((e) => e.property);
    }

    it('solicitud (crear/editar)', async () => {
      expect(await rejects(CreateRequestDto, { title: 'X', code: 'PRY-0001' })).toContain('code');
      expect(await rejects(CreateRequestDto, { title: 'X', number: 5 })).toContain('number');
      expect(await rejects(UpdateRequestDto, { code: 'PRY-0001' })).toContain('code');
    });

    it('fase (crear/editar)', async () => {
      expect(await rejects(CreatePhaseDto, { name: 'F', code: 'PRY-0001-F1' })).toContain('code');
      expect(await rejects(UpdatePhaseDto, { code: 'PRY-0001-F1' })).toContain('code');
    });

    it('tarea (crear/editar)', async () => {
      expect(await rejects(CreateTaskDto, { title: 'T', code: 'PRY-0001-T01' })).toContain('code');
      expect(await rejects(UpdateTaskDto, { code: 'PRY-0001-T01' })).toContain('code');
    });

    it('documento de importación: el code informativo se acepta (opcional) y un archivo antiguo sin él también', async () => {
      const base = {
        kind: 'control-phari-plan',
        formatVersion: '1.0',
        plan: {},
        dependencies: [],
      };
      const withCode = {
        ...base,
        phases: [
          {
            order: 0,
            name: 'F',
            code: 'PRY-0001-F1',
            tasks: [{ ref: 't0', code: 'PRY-0001-T01', title: 'A', isMilestone: false }],
          },
        ],
      };
      const legacy = {
        ...base,
        phases: [{ order: 0, name: 'F', tasks: [{ ref: 't0', title: 'A', isMilestone: false }] }],
      };
      expect(await validate(plainToInstance(PlanDocumentDto, withCode), opts)).toEqual([]);
      expect(await validate(plainToInstance(PlanDocumentDto, legacy), opts)).toEqual([]);
    });
  });
});
