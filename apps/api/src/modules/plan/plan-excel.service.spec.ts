import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PlanExcelService } from './plan-excel.service';
import type { CurrentActor } from '../auth/current-actor';

const actor = { userId: 'u1' } as unknown as CurrentActor;
const d = (s: string): Date => new Date(`${s}T00:00:00.000Z`);

interface Fixture {
  phases?: unknown[][];
  tasks?: unknown[][];
  plan?: unknown[];
}

async function workbookBase64(f: Fixture): Promise<string> {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('Plan').addRow(['h']);
  wb.getWorksheet('Plan')!.addRow(f.plan ?? [d('2026-01-05'), d('2026-03-27'), null, 'r', 'm']);
  const phases = wb.addWorksheet('Fases');
  phases.addRow(['h']);
  (f.phases ?? [[1, 'Diseño', d('2026-01-05'), d('2026-02-06'), 'Doc']]).forEach((r) =>
    phases.addRow(r),
  );
  const tasks = wb.addWorksheet('Tareas');
  tasks.addRow(['h']);
  (
    f.tasks ?? [
      ['Diseño', 'T1', 'Uno', '', '', d('2026-01-05'), d('2026-01-16'), 8, '', '', ''],
      ['Diseño', 'T2', 'Dos', 'ana', '', d('2026-01-19'), d('2026-02-06'), 16, '', '', 'T1'],
    ]
  ).forEach((r) => tasks.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
}

function build() {
  const plan = {
    importPlan: jest.fn().mockResolvedValue({ message: 'ok' }),
    exportPlan: jest.fn(),
    findByRequest: jest.fn(),
  };
  const prisma = {
    user: {
      findMany: jest.fn().mockResolvedValue([{ identifier: 'ana', name: 'Ana' }]),
    },
  };
  return { service: new PlanExcelService(plan as never, prisma as never), plan };
}

async function errorsOf(promise: Promise<unknown>): Promise<string[]> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(BadRequestException);
    return ((e as BadRequestException).getResponse() as { errors: string[] }).errors;
  }
  throw new Error('Se esperaba un error de validación');
}

describe('PlanExcelService.importExcel', () => {
  it('traduce el Excel válido al documento del plan y delega la importación', async () => {
    const { service, plan } = build();
    await service.importExcel(actor, 'r1', await workbookBase64({}));
    const doc = plan.importPlan.mock.calls[0][2];
    expect(doc.phases).toHaveLength(1);
    expect(doc.phases[0].tasks.map((t: { ref: string }) => t.ref)).toEqual(['T1', 'T2']);
    expect(doc.phases[0].tasks[1].responsibleIdentifier).toBe('ana');
    expect(doc.phases[0].tasks[1].estimateHours).toBe(16);
    expect(doc.dependencies).toEqual([{ dependentRef: 'T2', predecessorRef: 'T1' }]);
  });

  it('informa todos los errores a la vez y no importa nada', async () => {
    const { service, plan } = build();
    const file = await workbookBase64({
      tasks: [
        // fin anterior al inicio
        ['Diseño', 'T1', 'Uno', '', '', d('2026-01-16'), d('2026-01-05'), 8, '', '', ''],
        // fuera del rango de la fase
        ['Diseño', 'T2', 'Dos', '', '', d('2026-03-01'), d('2026-03-10'), 8, '', '', ''],
        // fase inexistente, horas inválidas, responsable desconocido, predecesora inexistente
        ['Otra', 'T3', 'Tres', 'nadie', '', null, null, 'x', '', '', ''],
        ['Diseño', 'T4', 'Cuatro', 'nadie', '', null, null, 4, '', '', 'T9'],
      ],
    });
    const errors = await errorsOf(service.importExcel(actor, 'r1', file));
    const text = errors.join('\n');
    expect(text).toContain('fila 2');
    expect(text).toContain('anterior a la de inicio');
    expect(text).toContain('posterior al fin de la fase');
    expect(text).toContain('no existe en la hoja "Fases"');
    expect(text).toContain('esfuerzo');
    expect(text).toContain('"T9" no existe');
    expect(plan.importPlan).not.toHaveBeenCalled();
  });

  it('el archivo exportado se puede importar de nuevo con la misma estructura', async () => {
    const { service, plan } = build();
    const doc = {
      kind: 'control-phari-plan',
      formatVersion: '1.0',
      plan: {
        periodStart: '2026-01-05T00:00:00.000Z',
        periodEnd: '2026-03-27T00:00:00.000Z',
        commitmentDate: null,
        risks: 'R',
        mitigations: 'M',
      },
      phases: [
        {
          order: 0,
          name: 'Diseño',
          startDate: '2026-01-05T00:00:00.000Z',
          endDate: '2026-02-06T00:00:00.000Z',
          deliverable: 'Doc',
          tasks: [
            {
              ref: 't0',
              title: 'Uno',
              isMilestone: false,
              responsibleIdentifier: 'ana',
              estimateHours: 8,
              startDate: '2026-01-05T00:00:00.000Z',
              endDate: '2026-01-16T00:00:00.000Z',
              description: 'd',
              acceptanceCriteria: 'c',
            },
            {
              ref: 't1',
              title: 'Dos',
              isMilestone: false,
              responsibleIdentifier: null,
              estimateHours: null,
              startDate: null,
              endDate: null,
              description: null,
              acceptanceCriteria: null,
            },
          ],
        },
      ],
      dependencies: [{ dependentRef: 't1', predecessorRef: 't0' }],
    };
    plan.exportPlan.mockResolvedValue(doc);
    const buffer = await service.exportExcel(actor, 'r1');
    await service.importExcel(actor, 'r1', buffer.toString('base64'));
    const imported = plan.importPlan.mock.calls[0][2];
    expect(imported.plan.risks).toBe('R');
    expect(imported.phases[0].name).toBe('Diseño');
    expect(imported.phases[0].startDate).toBe(doc.phases[0].startDate);
    expect(imported.phases[0].tasks[0]).toMatchObject({
      ref: 't0',
      title: 'Uno',
      responsibleIdentifier: 'ana',
      estimateHours: 8,
      startDate: doc.phases[0].tasks[0].startDate,
      endDate: doc.phases[0].tasks[0].endDate,
    });
    expect(imported.dependencies).toEqual(doc.dependencies);
  });

  it('rechaza fases con fin anterior al inicio y archivos que no son Excel', async () => {
    const { service } = build();
    const errors = await errorsOf(
      service.importExcel(
        actor,
        'r1',
        await workbookBase64({
          phases: [[1, 'Diseño', d('2026-02-06'), d('2026-01-05'), '']],
          tasks: [],
        }),
      ),
    );
    expect(errors.join('\n')).toContain('fin de la fase no puede ser anterior');
    await expect(
      service.importExcel(actor, 'r1', Buffer.from('no-es-excel').toString('base64')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
