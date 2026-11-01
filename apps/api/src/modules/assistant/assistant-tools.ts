import type { ConverseTool } from '../ai/bedrock-converse';

/**
 * Puerta de herramientas del asistente (BL-032 F2/F3): el asistente NO habla
 * con los servicios del backend; consume las capacidades a través del MCP del
 * portal, reenviando el token de la persona. Así hereda su alcance y sus
 * permisos, y el MCP sigue siendo la única puerta de herramientas. La interfaz
 * permite sustituir el MCP real por un doble en las pruebas.
 *
 * Las herramientas de LECTURA se ejecutan directamente. Las de ESCRITURA de la
 * lista permitida (`PROPOSAL_TOOLS`) nunca se ejecutan desde el modelo: generan
 * una propuesta que la persona confirma.
 */

/** Resultado de ejecutar una herramienta. */
export interface AssistantToolResult {
  /** Texto (normalmente JSON) que se devuelve al modelo. */
  text: string;
  isError: boolean;
}

/** Herramienta del MCP con su naturaleza (lectura o escritura). */
export interface AssistantTool extends ConverseTool {
  /** `true` = solo lectura (se ejecuta); `false` = escritura (solo propuesta). */
  readOnly: boolean;
}

/** Sesión abierta contra el MCP con la identidad de una persona. */
export interface AssistantToolSession {
  /** Herramientas que el asistente puede usar: lectura y escritura permitida. */
  listTools(): Promise<AssistantTool[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<AssistantToolResult>;
  close(): Promise<void>;
}

export interface AssistantToolGateway {
  /** Si hay un MCP configurado; sin él, el asistente no está disponible. */
  isConfigured(): boolean;
  /** Abre una sesión con el `Authorization` completo ("Bearer <token>"). */
  open(authorization: string): Promise<AssistantToolSession>;
}

/** Token de inyección (permite sustituir el MCP real en las pruebas). */
export const ASSISTANT_TOOL_GATEWAY = Symbol('ASSISTANT_TOOL_GATEWAY');

/** Familias de tools que nunca se ofrecen al asistente (infraestructura/dev). */
const EXCLUDED_PREFIXES = ['dev.', 'health.'];

/**
 * Herramientas de escritura que el asistente puede PROPONER, con el título de la
 * acción para la persona. Quedan fuera a propósito las decisiones (aprobar,
 * autorizar o devolver un plan, aceptar tareas, compuertas de gobierno), el
 * borrado y la administración (usuarios, permisos, maestras, procesos): esas
 * las hace una persona en la pantalla correspondiente.
 */
export const PROPOSAL_TOOLS: Readonly<Record<string, string>> = {
  'request.create': 'Crear solicitud',
  'request.update': 'Editar solicitud',
  'request.triage.create': 'Registrar triage',
  'request.priority.create': 'Registrar prioridad',
  'plan.create': 'Crear plan',
  'task.create': 'Crear tarea',
  'task.update': 'Editar tarea',
  'task.status.update': 'Cambiar estado de tarea',
  'issue.create': 'Registrar hallazgo',
  'issue.update': 'Editar hallazgo',
  'issue.transition': 'Cambiar estado de hallazgo',
  'meeting.create': 'Registrar reunión',
  'meeting.update': 'Editar reunión',
  'commitment.create': 'Registrar compromiso',
  'commitment.update': 'Editar compromiso',
  'commitment.transition': 'Cambiar estado de compromiso',
};

export function isProposalTool(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(PROPOSAL_TOOLS, name);
}

export function proposalTitle(name: string): string {
  return PROPOSAL_TOOLS[name] ?? name;
}

/**
 * Una tool se ofrece si es de lectura, o si es de escritura de la lista
 * permitida y no está marcada como destructiva. Las de infraestructura/dev
 * nunca se ofrecen.
 */
export function isToolAllowed(
  name: string,
  readOnly: boolean,
  destructive = false,
): boolean {
  if (EXCLUDED_PREFIXES.some((p) => name.startsWith(p))) return false;
  if (readOnly) return true;
  return !destructive && isProposalTool(name);
}

/** Argumento extra que el modelo rellena en las herramientas de escritura. */
export const PROPOSAL_SUMMARY_FIELD = 'resumen_para_la_persona';

/**
 * Versión de una herramienta de escritura para el modelo: avisa de que no se
 * ejecuta sola y exige una frase para la persona (`PROPOSAL_SUMMARY_FIELD`),
 * que se usa en la tarjeta de confirmación y no se envía a la API.
 */
export function asProposalTool(tool: AssistantTool): ConverseTool {
  const schema = tool.inputSchema as {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  return {
    name: tool.name,
    description:
      `[Propone una acción: NO se ejecuta; la persona debe confirmarla] ${tool.description}`,
    inputSchema: {
      ...tool.inputSchema,
      type: 'object',
      properties: {
        ...(schema.properties ?? {}),
        [PROPOSAL_SUMMARY_FIELD]: {
          type: 'string',
          description:
            'Frase corta en español que describe a la persona qué hará esta acción, con nombres y no con identificadores (p. ej. «Crear la solicitud «Reporte de ventas» en el proceso BI»).',
        },
      },
      required: [...(schema.required ?? []), PROPOSAL_SUMMARY_FIELD],
    },
  };
}

/**
 * Campos obligatorios que faltan en los argumentos, según el esquema de la
 * tool: los de primer nivel y los de `body` (así se estructuran las tools de
 * escritura del MCP). Permite devolver al modelo un error útil antes de crear
 * una propuesta que fallaría al confirmarse.
 */
export function missingRequired(
  schema: Record<string, unknown>,
  args: Record<string, unknown>,
): string[] {
  const missing: string[] = [];
  const isMissing = (value: unknown): boolean => value === undefined || value === null || value === '';

  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  for (const key of required) {
    if (isMissing(args[key])) missing.push(key);
  }

  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  const bodySchema = properties?.body;
  const body = args.body;
  if (
    bodySchema &&
    Array.isArray(bodySchema.required) &&
    body !== null &&
    typeof body === 'object'
  ) {
    for (const key of bodySchema.required as string[]) {
      if (isMissing((body as Record<string, unknown>)[key])) missing.push(`body.${key}`);
    }
  }
  return missing;
}

/** Etiqueta legible (para la interfaz) según la familia de la herramienta. */
const LABELS: Record<string, string> = {
  request: 'solicitudes',
  portfolio: 'portafolio',
  plan: 'planes',
  task: 'tareas',
  process: 'procesos',
  catalog: 'catálogos',
  user: 'usuarios',
  grant: 'permisos',
  me: 'tus permisos',
  audit: 'auditoría',
  governance: 'gobierno',
  area: 'áreas',
  'area-control': 'control del área',
  requester: 'solicitantes',
  notification: 'notificaciones',
  'my-work': 'tu trabajo',
  closure: 'cierres',
  asset: 'activos',
  document: 'documentos',
  evidence: 'evidencias',
  capacity: 'capacidad',
  worklog: 'bitácora',
  'weekly-report': 'reportes semanales',
  issue: 'hallazgos',
  meeting: 'reuniones',
  commitment: 'compromisos',
  validation: 'validaciones',
  recurring: 'actividades recurrentes',
  help: 'la ayuda del portal',
};

export function toolLabel(name: string): string {
  const family = name.split('.')[0];
  return LABELS[family] ?? 'datos del portal';
}
