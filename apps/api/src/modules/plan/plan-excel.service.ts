import { BadRequestException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PrismaService } from '../../database/prisma.service';
import { CurrentActor } from '../auth/current-actor';
import { ImportPlanResultDto } from './dto/import-plan-result.dto';
import {
  PLAN_DOCUMENT_FORMAT_VERSION,
  PLAN_DOCUMENT_KIND,
  PlanDocumentDto,
} from './dto/plan-document.dto';
import { PlanService } from './plan.service';

/** Tamaño máximo aceptado del archivo Excel (bytes). */
export const MAX_EXCEL_BYTES = 700 * 1024;
const MAX_REPORTED_ERRORS = 100;
const DATE_FORMAT = 'dd/mm/yyyy';

const SHEET_INSTRUCTIONS = 'Instrucciones';
const SHEET_PLAN = 'Plan';
const SHEET_PHASES = 'Fases';
const SHEET_TASKS = 'Tareas';

const PLAN_HEADERS = [
  'Inicio del periodo',
  'Fin del periodo',
  'Fecha de compromiso',
  'Riesgos',
  'Mitigaciones',
];
const PHASE_HEADERS = ['Orden', 'Nombre', 'Inicio', 'Fin', 'Entregable'];
const TASK_HEADERS = [
  'Fase',
  'Referencia',
  'Título',
  'Responsable (identificador)',
  'Responsable (nombre, informativo)',
  'Inicio',
  'Vencimiento',
  'Esfuerzo (horas)',
  'Descripción',
  'Criterios de aceptación',
  'Predecesoras (referencias)',
];

const INSTRUCTIONS = [
  'Plantilla de planificación de Control PHARI',
  '',
  'Cómo usar este archivo',
  '1. Hoja "Plan": una sola fila con el periodo, la fecha de compromiso, los riesgos y las mitigaciones.',
  '2. Hoja "Fases": una fila por fase. El nombre de la fase es obligatorio y no puede repetirse.',
  '3. Hoja "Tareas": una fila por tarea. La columna "Fase" debe coincidir con el nombre de una fase de la hoja "Fases".',
  '4. Las fechas se escriben como dd/mm/aaaa. El vencimiento no puede ser anterior al inicio.',
  '5. Las fechas de cada tarea deben estar dentro del rango de su fase.',
  '6. "Responsable (identificador)" es el identificador del usuario (opcional). La columna con el nombre es solo informativa.',
  '7. "Referencia" identifica la tarea (por ejemplo T1). "Predecesoras" lista las referencias de las tareas previas, separadas por coma.',
  '8. El esfuerzo se expresa en horas enteras.',
  '',
  'Importante: al importar se REEMPLAZAN las fases, tareas y dependencias del plan. Solo es posible con el plan en borrador o devuelto.',
  'El estado y el avance de las tareas no se importan: las tareas importadas quedan pendientes.',
];

/** Una fila leída del Excel con su número de fila para reportar errores. */
interface RowRef {
  sheet: string;
  row: number;
}

/**
 * Importación y exportación del plan en Excel (.xlsx). Es una capa de formato
 * sobre `PlanService`: el Excel se traduce al mismo documento del plan y se
 * delega en `PlanService.importPlan`, que aplica las reglas de negocio. Antes de
 * delegar se validan todas las filas y se informan TODOS los errores a la vez.
 */
@Injectable()
export class PlanExcelService {
  constructor(
    private readonly plan: PlanService,
    private readonly prisma: PrismaService,
  ) {}

  // ---------------------------------------------------------------- export

  async exportExcel(actor: CurrentActor, requestId: string): Promise<Buffer> {
    const doc = await this.plan.exportPlan(actor, requestId);

    const identifiers = new Set<string>();
    for (const phase of doc.phases) {
      for (const task of phase.tasks) {
        if (task.responsibleIdentifier) identifiers.add(task.responsibleIdentifier);
      }
    }
    const names = new Map<string, string>();
    if (identifiers.size > 0) {
      const users = await this.prisma.user.findMany({
        where: { identifier: { in: [...identifiers] } },
        select: { identifier: true, name: true },
      });
      for (const u of users) names.set(u.identifier, u.name);
    }

    const wb = this.buildWorkbook();
    const planSheet = wb.getWorksheet(SHEET_PLAN) as ExcelJS.Worksheet;
    planSheet.addRow([
      this.toDate(doc.plan.periodStart),
      this.toDate(doc.plan.periodEnd),
      this.toDate(doc.plan.commitmentDate),
      doc.plan.risks ?? '',
      doc.plan.mitigations ?? '',
    ]);

    const phaseSheet = wb.getWorksheet(SHEET_PHASES) as ExcelJS.Worksheet;
    const taskSheet = wb.getWorksheet(SHEET_TASKS) as ExcelJS.Worksheet;
    const predecessorsByRef = new Map<string, string[]>();
    for (const dep of doc.dependencies) {
      const list = predecessorsByRef.get(dep.dependentRef) ?? [];
      list.push(dep.predecessorRef);
      predecessorsByRef.set(dep.dependentRef, list);
    }
    doc.phases.forEach((phase, index) => {
      phaseSheet.addRow([
        index + 1,
        phase.name,
        this.toDate(phase.startDate),
        this.toDate(phase.endDate),
        phase.deliverable ?? '',
      ]);
      for (const task of phase.tasks) {
        taskSheet.addRow([
          phase.name,
          task.ref,
          task.title,
          task.responsibleIdentifier ?? '',
          task.responsibleIdentifier ? (names.get(task.responsibleIdentifier) ?? '') : '',
          this.toDate(task.startDate),
          this.toDate(task.endDate),
          task.estimateHours ?? '',
          task.description ?? '',
          task.acceptanceCriteria ?? '',
          (predecessorsByRef.get(task.ref) ?? []).join(', '),
        ]);
      }
    });

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /** Plantilla descargable: misma estructura, con una fila de ejemplo. */
  async templateExcel(actor: CurrentActor, requestId: string): Promise<Buffer> {
    // Verifica alcance/permiso sobre el plan antes de entregar la plantilla.
    await this.plan.findByRequest(actor, requestId);
    const wb = this.buildWorkbook();
    (wb.getWorksheet(SHEET_PLAN) as ExcelJS.Worksheet).addRow([
      new Date(Date.UTC(2026, 0, 5)),
      new Date(Date.UTC(2026, 2, 27)),
      new Date(Date.UTC(2026, 2, 31)),
      'Riesgo de ejemplo',
      'Mitigación de ejemplo',
    ]);
    (wb.getWorksheet(SHEET_PHASES) as ExcelJS.Worksheet).addRow([
      1,
      'Diseño',
      new Date(Date.UTC(2026, 0, 5)),
      new Date(Date.UTC(2026, 1, 6)),
      'Documento de diseño',
    ]);
    const tasks = wb.getWorksheet(SHEET_TASKS) as ExcelJS.Worksheet;
    tasks.addRow([
      'Diseño',
      'T1',
      'Levantar requerimientos',
      '',
      '',
      new Date(Date.UTC(2026, 0, 5)),
      new Date(Date.UTC(2026, 0, 16)),
      16,
      'Descripción de ejemplo',
      'Criterios de ejemplo',
      '',
    ]);
    tasks.addRow([
      'Diseño',
      'T2',
      'Diseñar la solución',
      '',
      '',
      new Date(Date.UTC(2026, 0, 19)),
      new Date(Date.UTC(2026, 1, 6)),
      24,
      '',
      '',
      'T1',
    ]);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  private buildWorkbook(): ExcelJS.Workbook {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Control PHARI';

    const info = wb.addWorksheet(SHEET_INSTRUCTIONS);
    info.getColumn(1).width = 120;
    INSTRUCTIONS.forEach((line, i) => {
      const cell = info.getCell(i + 1, 1);
      cell.value = line;
      if (i === 0 || line === 'Cómo usar este archivo') cell.font = { bold: true };
      cell.alignment = { wrapText: true };
    });

    const addSheet = (name: string, headers: string[], widths: number[]) => {
      const ws = wb.addWorksheet(name);
      ws.addRow(headers);
      ws.getRow(1).font = { bold: true };
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      widths.forEach((w, i) => {
        ws.getColumn(i + 1).width = w;
      });
      return ws;
    };
    const plan = addSheet(SHEET_PLAN, PLAN_HEADERS, [20, 20, 22, 50, 50]);
    [1, 2, 3].forEach((c) => (plan.getColumn(c).numFmt = DATE_FORMAT));
    const phases = addSheet(SHEET_PHASES, PHASE_HEADERS, [8, 32, 14, 14, 50]);
    [3, 4].forEach((c) => (phases.getColumn(c).numFmt = DATE_FORMAT));
    const tasks = addSheet(
      SHEET_TASKS,
      TASK_HEADERS,
      [24, 12, 40, 28, 28, 14, 14, 16, 50, 50, 26],
    );
    [6, 7].forEach((c) => (tasks.getColumn(c).numFmt = DATE_FORMAT));
    return wb;
  }

  // ---------------------------------------------------------------- import

  async importExcel(
    actor: CurrentActor,
    requestId: string,
    fileBase64: string,
  ): Promise<ImportPlanResultDto> {
    const buffer = Buffer.from(fileBase64, 'base64');
    if (buffer.length === 0) {
      throw new BadRequestException('El archivo está vacío.');
    }
    if (buffer.length > MAX_EXCEL_BYTES) {
      throw new BadRequestException(
        'El archivo supera el tamaño máximo permitido (700 KB).',
      );
    }

    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    } catch {
      throw new BadRequestException(
        'No fue posible leer el archivo. Verifica que sea un Excel (.xlsx) válido.',
      );
    }

    const errors: string[] = [];
    const fail = (ref: RowRef | string, message: string): void => {
      if (errors.length >= MAX_REPORTED_ERRORS) return;
      errors.push(
        typeof ref === 'string'
          ? `${ref}: ${message}`
          : `Hoja "${ref.sheet}", fila ${ref.row}: ${message}`,
      );
    };

    const planWs = wb.getWorksheet(SHEET_PLAN);
    const phasesWs = wb.getWorksheet(SHEET_PHASES);
    const tasksWs = wb.getWorksheet(SHEET_TASKS);
    for (const [ws, name] of [
      [planWs, SHEET_PLAN],
      [phasesWs, SHEET_PHASES],
      [tasksWs, SHEET_TASKS],
    ] as const) {
      if (!ws) fail(`Archivo`, `falta la hoja "${name}". Usa la plantilla descargable.`);
    }
    if (!planWs || !phasesWs || !tasksWs) {
      throw new BadRequestException({
        message: 'El archivo no cumple la estructura esperada.',
        errors,
      });
    }

    // ---- Plan (fila 2)
    const planRef: RowRef = { sheet: SHEET_PLAN, row: 2 };
    const periodStart = this.readDate(planWs.getRow(2).getCell(1), planRef, 'Inicio del periodo', fail);
    const periodEnd = this.readDate(planWs.getRow(2).getCell(2), planRef, 'Fin del periodo', fail);
    const commitment = this.readDate(planWs.getRow(2).getCell(3), planRef, 'Fecha de compromiso', fail);
    if (periodStart && periodEnd && periodEnd < periodStart) {
      fail(planRef, 'el fin del periodo no puede ser anterior al inicio.');
    }
    const risks = this.cellText(planWs.getRow(2).getCell(4)) || null;
    const mitigations = this.cellText(planWs.getRow(2).getCell(5)) || null;

    // ---- Fases
    interface ParsedPhase {
      order: number;
      name: string;
      start: Date | null;
      end: Date | null;
      deliverable: string | null;
      tasks: PlanDocumentDto['phases'][number]['tasks'];
    }
    const phases: ParsedPhase[] = [];
    const phaseByName = new Map<string, ParsedPhase>();
    phasesWs.eachRow({ includeEmpty: false }, (row, n) => {
      if (n === 1 || this.rowIsEmpty(row, PHASE_HEADERS.length)) return;
      const ref: RowRef = { sheet: SHEET_PHASES, row: n };
      const name = this.cellText(row.getCell(2));
      if (!name) {
        fail(ref, 'el nombre de la fase es obligatorio.');
        return;
      }
      if (name.length > 255) fail(ref, 'el nombre de la fase supera 255 caracteres.');
      const key = name.toLowerCase();
      if (phaseByName.has(key)) {
        fail(ref, `la fase "${name}" está repetida.`);
        return;
      }
      const start = this.readDate(row.getCell(3), ref, 'Inicio', fail);
      const end = this.readDate(row.getCell(4), ref, 'Fin', fail);
      if (start && end && end < start) {
        fail(ref, 'la fecha de fin de la fase no puede ser anterior a la de inicio.');
      }
      const orderRaw = Number(this.cellText(row.getCell(1)));
      const parsed: ParsedPhase = {
        order: Number.isFinite(orderRaw) && orderRaw > 0 ? orderRaw : n,
        name,
        start,
        end,
        deliverable: this.cellText(row.getCell(5)) || null,
        tasks: [],
      };
      phases.push(parsed);
      phaseByName.set(key, parsed);
    });
    if (phases.length === 0 && errors.length === 0) {
      fail(SHEET_PHASES, 'el archivo debe tener al menos una fase.');
    }

    // ---- Tareas
    const refs = new Set<string>();
    const refRows = new Map<string, number>();
    const predecessorSpecs: Array<{ ref: string; preds: string[]; row: number }> = [];
    let autoRef = 0;
    tasksWs.eachRow({ includeEmpty: false }, (row, n) => {
      if (n === 1 || this.rowIsEmpty(row, TASK_HEADERS.length)) return;
      const ref: RowRef = { sheet: SHEET_TASKS, row: n };
      const phaseName = this.cellText(row.getCell(1));
      const phase = phaseByName.get(phaseName.toLowerCase());
      if (!phaseName) {
        fail(ref, 'la fase es obligatoria.');
      } else if (!phase) {
        fail(ref, `la fase "${phaseName}" no existe en la hoja "Fases".`);
      }
      const title = this.cellText(row.getCell(3));
      if (!title) fail(ref, 'el título es obligatorio.');
      if (title.length > 255) fail(ref, 'el título supera 255 caracteres.');

      let taskRef = this.cellText(row.getCell(2));
      if (!taskRef) {
        autoRef += 1;
        taskRef = `fila-${n}-${autoRef}`;
      }
      if (taskRef.length > 128) fail(ref, 'la referencia supera 128 caracteres.');
      const refKey = taskRef.toLowerCase();
      if (refs.has(refKey)) {
        fail(ref, `la referencia "${taskRef}" está repetida (también en la fila ${refRows.get(refKey)}).`);
      }
      refs.add(refKey);
      refRows.set(refKey, n);

      const start = this.readDate(row.getCell(6), ref, 'Inicio', fail);
      const end = this.readDate(row.getCell(7), ref, 'Vencimiento', fail);
      if (start && end && end < start) {
        fail(ref, 'la fecha de vencimiento no puede ser anterior a la de inicio.');
      }
      if (phase) {
        if (start && phase.start && start < phase.start) {
          fail(ref, `el inicio de la tarea es anterior al inicio de la fase "${phase.name}".`);
        }
        if (end && phase.end && end > phase.end) {
          fail(ref, `el vencimiento de la tarea es posterior al fin de la fase "${phase.name}".`);
        }
        if (start && phase.end && start > phase.end) {
          fail(ref, `el inicio de la tarea es posterior al fin de la fase "${phase.name}".`);
        }
        if (end && phase.start && end < phase.start) {
          fail(ref, `el vencimiento de la tarea es anterior al inicio de la fase "${phase.name}".`);
        }
      }

      const hoursText = this.cellText(row.getCell(8));
      let hours: number | null = null;
      if (hoursText) {
        const parsedHours = Number(hoursText.replace(',', '.'));
        if (!Number.isInteger(parsedHours) || parsedHours < 0) {
          fail(ref, 'el esfuerzo debe ser un número entero de horas, mayor o igual a 0.');
        } else {
          hours = parsedHours;
        }
      }

      const description = this.cellText(row.getCell(9));
      const criteria = this.cellText(row.getCell(10));
      if (description.length > 4000) fail(ref, 'la descripción supera 4000 caracteres.');
      if (criteria.length > 4000) fail(ref, 'los criterios de aceptación superan 4000 caracteres.');

      const preds = this.cellText(row.getCell(11))
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      predecessorSpecs.push({ ref: taskRef, preds, row: n });

      if (phase && title) {
        phase.tasks.push({
          ref: taskRef,
          title,
          isMilestone: false,
          responsibleIdentifier: this.cellText(row.getCell(4)) || null,
          estimateHours: hours,
          startDate: start ? start.toISOString() : null,
          endDate: end ? end.toISOString() : null,
          description: description || null,
          acceptanceCriteria: criteria || null,
        });
      }
    });

    // Dependencias
    const canonical = new Map<string, string>();
    for (const phase of phases) for (const t of phase.tasks) canonical.set(t.ref.toLowerCase(), t.ref);
    const dependencies: PlanDocumentDto['dependencies'] = [];
    for (const spec of predecessorSpecs) {
      const dependent = canonical.get(spec.ref.toLowerCase());
      if (!dependent) continue; // la fila ya reportó su propio error
      const seen = new Set<string>();
      for (const p of spec.preds) {
        const pred = canonical.get(p.toLowerCase());
        const ref: RowRef = { sheet: SHEET_TASKS, row: spec.row };
        if (!pred) {
          fail(ref, `la predecesora "${p}" no existe en el archivo.`);
        } else if (pred === dependent) {
          fail(ref, 'una tarea no puede ser predecesora de sí misma.');
        } else if (!seen.has(pred)) {
          seen.add(pred);
          dependencies.push({ dependentRef: dependent, predecessorRef: pred });
        }
      }
    }

    // Responsables
    const identifiers = new Set<string>();
    for (const phase of phases) {
      for (const t of phase.tasks) {
        if (t.responsibleIdentifier) identifiers.add(t.responsibleIdentifier.toLowerCase());
      }
    }
    if (identifiers.size > 0) {
      const users = await this.prisma.user.findMany({
        where: { active: true },
        select: { identifier: true },
      });
      const known = new Set(users.map((u) => u.identifier.trim().toLowerCase()));
      for (const spec of predecessorSpecs) {
        const task = phases.flatMap((p) => p.tasks).find((t) => t.ref === spec.ref);
        const id = task?.responsibleIdentifier?.toLowerCase();
        if (id && !known.has(id)) {
          fail(
            { sheet: SHEET_TASKS, row: spec.row },
            `el responsable "${task?.responsibleIdentifier}" no existe o está inactivo.`,
          );
        }
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException({
        message: `El archivo tiene ${errors.length} error(es). Corrígelos y vuelve a importarlo; no se guardó ningún cambio.`,
        errors,
      });
    }

    const document: PlanDocumentDto = {
      kind: PLAN_DOCUMENT_KIND,
      formatVersion: PLAN_DOCUMENT_FORMAT_VERSION,
      plan: {
        periodStart: periodStart ? periodStart.toISOString() : null,
        periodEnd: periodEnd ? periodEnd.toISOString() : null,
        commitmentDate: commitment ? commitment.toISOString() : null,
        risks,
        mitigations,
      },
      phases: [...phases]
        .sort((a, b) => a.order - b.order)
        .map((p, index) => ({
          order: index,
          name: p.name,
          startDate: p.start ? p.start.toISOString() : null,
          endDate: p.end ? p.end.toISOString() : null,
          deliverable: p.deliverable,
          tasks: p.tasks,
        })),
      dependencies,
    };
    return this.plan.importPlan(actor, requestId, document);
  }

  // --------------------------------------------------------------- helpers

  private toDate(value: string | null | undefined): Date | '' {
    return value ? new Date(value) : '';
  }

  private rowIsEmpty(row: ExcelJS.Row, columns: number): boolean {
    for (let c = 1; c <= columns; c += 1) {
      if (this.cellText(row.getCell(c)) !== '') return false;
    }
    return true;
  }

  /** Texto plano de una celda (admite texto enriquecido, fórmulas y fechas). */
  private cellText(cell: ExcelJS.Cell): string {
    const v = cell.value;
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === 'object') {
      if ('richText' in v) return v.richText.map((t) => t.text).join('').trim();
      if ('text' in v && typeof v.text === 'string') return v.text.trim();
      if ('result' in v && v.result !== undefined && v.result !== null) {
        return v.result instanceof Date
          ? v.result.toISOString().slice(0, 10)
          : String(v.result).trim();
      }
      return '';
    }
    return String(v).trim();
  }

  /** Lee una fecha (celda de fecha, dd/mm/aaaa o aaaa-mm-dd) como UTC 00:00. */
  private readDate(
    cell: ExcelJS.Cell,
    ref: RowRef,
    label: string,
    fail: (ref: RowRef, message: string) => void,
  ): Date | null {
    const v = cell.value;
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) {
      return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
    }
    const text = this.cellText(cell);
    if (!text) return null;
    let y: number;
    let m: number;
    let d: number;
    const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
    const ymd = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
    if (dmy) {
      [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
    } else if (ymd) {
      [y, m, d] = [Number(ymd[1]), Number(ymd[2]), Number(ymd[3])];
    } else {
      fail(ref, `"${label}" no es una fecha válida (usa dd/mm/aaaa).`);
      return null;
    }
    const date = new Date(Date.UTC(y, m - 1, d));
    if (
      date.getUTCFullYear() !== y ||
      date.getUTCMonth() !== m - 1 ||
      date.getUTCDate() !== d
    ) {
      fail(ref, `"${label}" no es una fecha válida (usa dd/mm/aaaa).`);
      return null;
    }
    return date;
  }
}
