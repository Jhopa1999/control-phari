import type { ConverseTool } from '../ai/bedrock-converse';

/**
 * Puerta de herramientas del asistente (BL-032 F2): el asistente NO habla con
 * los servicios del backend; consume las capacidades a traves del MCP del
 * portal, reenviando el token de la persona. Asi hereda su alcance y sus
 * permisos, y el MCP sigue siendo la unica puerta de herramientas. La interfaz
 * permite sustituir el MCP real por un doble en las pruebas.
 */

/** Resultado de ejecutar una herramienta. */
export interface AssistantToolResult {
  /** Texto (normalmente JSON) que se devuelve al modelo. */
  text: string;
  isError: boolean;
}

/** Sesion abierta contra el MCP con la identidad de una persona. */
export interface AssistantToolSession {
  /** Herramientas que el asistente puede usar (solo lectura). */
  listTools(): Promise<ConverseTool[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<AssistantToolResult>;
  close(): Promise<void>;
}

export interface AssistantToolGateway {
  /** Si hay un MCP configurado; sin el, el asistente no esta disponible. */
  isConfigured(): boolean;
  /** Abre una sesion con el `Authorization` completo ("Bearer <token>"). */
  open(authorization: string): Promise<AssistantToolSession>;
}

/** Token de inyeccion (permite sustituir el MCP real en las pruebas). */
export const ASSISTANT_TOOL_GATEWAY = Symbol('ASSISTANT_TOOL_GATEWAY');

/** Familias de tools que nunca se ofrecen al asistente (infraestructura/dev). */
const EXCLUDED_PREFIXES = ['dev.', 'health.'];

/** Una tool se ofrece solo si es de lectura y no es de infraestructura. */
export function isToolAllowed(name: string, readOnly: boolean): boolean {
  return readOnly && !EXCLUDED_PREFIXES.some((p) => name.startsWith(p));
}

/** Etiqueta legible (para la interfaz) segun la familia de la herramienta. */
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
