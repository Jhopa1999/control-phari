import { BadRequestException, ValidationError } from '@nestjs/common';

/** Nombre legible de las propiedades de DTO más comunes. Si falta, «el campo». */
export const FIELD_LABELS: Record<string, string> = {
  title: 'título',
  name: 'nombre',
  description: 'descripción',
  code: 'código',
  label: 'etiqueta',
  identifier: 'identificador',
  username: 'usuario',
  password: 'contraseña',
  newPassword: 'nueva contraseña',
  email: 'correo',
  role: 'rol',
  roleCode: 'rol',
  roleCodes: 'roles',
  state: 'estado',
  status: 'estado',
  reason: 'motivo',
  comment: 'comentario',
  note: 'nota',
  notes: 'notas',
  text: 'texto',
  content: 'contenido',
  summary: 'resumen',
  justification: 'justificación',
  decision: 'decisión',
  date: 'fecha',
  startDate: 'fecha de inicio',
  endDate: 'fecha de fin',
  dueDate: 'fecha límite',
  targetDate: 'fecha objetivo',
  commitmentDate: 'fecha de compromiso',
  weekStart: 'inicio de semana',
  periodFrom: 'inicio del periodo',
  periodTo: 'fin del periodo',
  startTime: 'hora de inicio',
  endTime: 'hora de fin',
  meetingDate: 'fecha de la reunión',
  meetingTime: 'hora de la reunión',
  hours: 'horas',
  estimatedHours: 'horas estimadas',
  estimateHours: 'horas estimadas',
  availableHours: 'horas disponibles',
  committedHours: 'horas comprometidas',
  actualHours: 'horas reales',
  durationMinutes: 'duración (minutos)',
  progressPercent: 'avance',
  percentage: 'porcentaje',
  month: 'mes',
  year: 'año',
  week: 'semana',
  page: 'página',
  pageSize: 'tamaño de página',
  take: 'cantidad',
  limit: 'límite',
  q: 'búsqueda',
  sort: 'orden',
  order: 'orden',
  id: 'identificador',
  userId: 'persona',
  areaId: 'área',
  processId: 'proceso',
  mainProcessId: 'proceso principal',
  requestId: 'solicitud',
  planId: 'plan',
  taskId: 'tarea',
  phaseId: 'fase',
  meetingId: 'reunión',
  documentId: 'documento',
  assetId: 'activo',
  requesterId: 'solicitante',
  responsibleUserId: 'responsable',
  mainResponsibleUserId: 'responsable principal',
  assignedUserId: 'persona asignada',
  processIds: 'procesos',
  participantUserIds: 'participantes',
  participantProcessIds: 'procesos participantes',
  attachmentIds: 'adjuntos',
  predecessorTaskId: 'tarea predecesora',
  dependentTaskId: 'tarea dependiente',
  demandTypeCode: 'tipo de demanda',
  criticalityCode: 'criticidad',
  sizeCode: 'tamaño',
  dataAvailabilityCode: 'disponibilidad de datos',
  classificationCode: 'clasificación',
  categoryCode: 'categoría',
  gateCode: 'control',
  phaseCode: 'fase',
  validationTypeCode: 'tipo de validación',
  resultCode: 'resultado',
  requesterName: 'nombre del solicitante',
  requesterArea: 'área del solicitante',
  agenda: 'agenda',
  decisions: 'decisiones',
  commitments: 'compromisos',
  participants: 'participantes',
  blockReason: 'motivo de bloqueo',
  cancelReason: 'motivo de cancelación',
  returnReason: 'motivo de devolución',
  evidenceUrl: 'enlace de evidencia',
  evidenceRef: 'referencia de evidencia',
  url: 'enlace',
  fileName: 'nombre del archivo',
  fileBase64: 'archivo',
  contentType: 'tipo de contenido',
  cadence: 'periodicidad',
  intervalCount: 'intervalo',
  anticipationDays: 'días de anticipación',
  active: 'activo',
  enabled: 'habilitado',
  model: 'modelo',
  modelId: 'modelo',
  temperature: 'temperatura',
  maxTokens: 'máximo de tokens',
  basePrompt: 'instrucciones base',
  host: 'servidor',
  port: 'puerto',
  fromAddress: 'remitente',
  fromName: 'nombre del remitente',
  secure: 'conexión segura',
  kind: 'tipo',
  type: 'tipo',
  category: 'categoría',
  catalog: 'maestra',
  sortOrder: 'orden',
  version: 'versión',
  token: 'enlace',
  objectType: 'tipo de objeto',
  objectId: 'objeto',
  action: 'acción',
  from: 'desde',
  to: 'hasta',
};

const FALLBACK_PREDICATE = 'no es válido.';

function labelOf(property: string): string {
  const label = FIELD_LABELS[property];
  return label ? `El campo «${label}»` : 'El campo';
}

/** Un mensaje por defecto de class-validator empieza por el nombre de la propiedad. */
function isDefaultMessage(message: string, property: string): boolean {
  return (
    message.startsWith(`${property} `) ||
    message.startsWith('each value in ') ||
    message.startsWith('nested property ') ||
    message.startsWith('property ')
  );
}

function lastNumber(message: string): string | undefined {
  const all = message.match(/-?\d+(?:\.\d+)?/g);
  return all ? all[all.length - 1] : undefined;
}

function predicate(constraint: string, message: string): string {
  const num = lastNumber(message);
  switch (constraint) {
    case 'isNotEmpty':
    case 'isDefined':
      return 'es obligatorio.';
    case 'isString':
      return 'debe ser un texto.';
    case 'isUuid':
      return 'no es un identificador válido.';
    case 'isInt':
      return 'debe ser un número entero.';
    case 'isNumber':
    case 'isNumberString':
      return 'debe ser un número.';
    case 'isBoolean':
      return 'debe ser verdadero o falso.';
    case 'isPositive':
      return 'debe ser mayor que cero.';
    case 'min':
      return num ? `no puede ser menor que ${num}.` : 'es menor que el mínimo permitido.';
    case 'max':
      return num ? `no puede ser mayor que ${num}.` : 'es mayor que el máximo permitido.';
    case 'minLength':
      return num ? `debe tener al menos ${num} caracteres.` : 'es demasiado corto.';
    case 'maxLength':
      return num ? `no puede superar ${num} caracteres.` : 'es demasiado largo.';
    case 'length':
      return 'no tiene la longitud permitida.';
    case 'isEnum':
    case 'isIn': {
      const values = /values?:\s*(.+)$/.exec(message)?.[1];
      return values ? `debe ser uno de estos valores: ${values}.` : 'no es un valor permitido.';
    }
    case 'isNotIn':
      return 'no es un valor permitido.';
    case 'matches':
      return 'tiene un formato no válido.';
    case 'isDateString':
    case 'isISO8601':
    case 'isDate':
      return 'debe ser una fecha válida.';
    case 'isArray':
      return 'debe ser una lista.';
    case 'arrayMaxSize':
      return num ? `admite como máximo ${num} elementos.` : 'tiene demasiados elementos.';
    case 'arrayMinSize':
      return num ? `requiere al menos ${num} elementos.` : 'tiene muy pocos elementos.';
    case 'arrayNotEmpty':
      return 'requiere al menos un elemento.';
    case 'arrayUnique':
      return 'no admite elementos repetidos.';
    case 'isEmail':
      return 'debe ser un correo válido.';
    case 'isUrl':
      return 'debe ser un enlace válido.';
    case 'isObject':
      return 'debe ser un objeto válido.';
    case 'whitelistValidation':
      return 'no está permitido.';
    default:
      return FALLBACK_PREDICATE;
  }
}

function collect(errors: ValidationError[], out: string[]): void {
  for (const error of errors) {
    for (const [constraint, message] of Object.entries(error.constraints ?? {})) {
      if (constraint === 'whitelistValidation') {
        out.push('Se envió un dato que no está permitido.');
        continue;
      }
      out.push(
        isDefaultMessage(message, error.property)
          ? `${labelOf(error.property)} ${predicate(constraint, message)}`
          : message,
      );
    }
    if (error.children?.length) collect(error.children, out);
  }
}

/** Traduce los errores de `class-validator` a español, sin exponer nombres internos. */
export function validationMessagesEs(errors: ValidationError[]): string[] {
  const messages: string[] = [];
  collect(errors, messages);
  return Array.from(new Set(messages));
}

/** `exceptionFactory` del `ValidationPipe`: mismo 400 y misma forma, mensajes en español. */
export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  return new BadRequestException(validationMessagesEs(errors));
}
