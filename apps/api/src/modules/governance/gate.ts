import { RequestState } from '../request/request-state';

/**
 * Enum logico de los puntos de control del ciclo de gobierno (design §1.2 /
 * §2.1, marco FCGR §5). Conjunto cerrado y tipado (como RequestState): gobierna
 * la logica de los gates y nunca es un campo libre. La columna
 * `GateCheck.gateCode` guarda el `code` (texto) de uno de estos valores.
 */
export enum GateCode {
  GC1 = 'GC1',
  GC2 = 'GC2',
  GC3 = 'GC3',
  GC4 = 'GC4',
  GC5 = 'GC5',
}

/**
 * Estado logico de un GateCheck (design §2.1): PENDIENTE (no cumplido),
 * CUMPLIDO (condicion satisfecha) o NO_APLICA (eximido por ruta proporcional,
 * D-D2). La columna `GateCheck.status` guarda el `code` (texto); solo el
 * GovernanceStateService/GateCheckService lo escribe dentro de su $transaction.
 */
export enum GateStatus {
  PENDIENTE = 'PENDIENTE',
  CUMPLIDO = 'CUMPLIDO',
  NO_APLICA = 'NO_APLICA',
}

/** Orden canonico de los 5 gates (design §2.1). */
export const GATE_ORDER: readonly GateCode[] = [
  GateCode.GC1,
  GateCode.GC2,
  GateCode.GC3,
  GateCode.GC4,
  GateCode.GC5,
];

/** True si el valor es un miembro del enum GateCode. */
export function isGateCode(value: string): value is GateCode {
  return (GATE_ORDER as readonly string[]).includes(value);
}

/**
 * Texto de condicion y autoridad de cada gate (design §1.2). Es el texto
 * LITERAL del marco FCGR §5 (constante de DOMINIO, no configuracion de ambiente:
 * regla de la steering "Datos y configuracion"). Se persiste como snapshot en
 * `GateCheck.conditionText`/`authorityText` al materializar cada gate.
 */
export const GATE_DEFINITIONS: Record<
  GateCode,
  { title: string; conditionText: string; authorityText: string }
> = {
  [GateCode.GC1]: {
    title: 'GC1 Admisión',
    conditionText: 'Información suficiente y asignación aceptada.',
    authorityText: 'Líder del área receptora; comité ante conflicto.',
  },
  [GateCode.GC2]: {
    title: 'GC2 Compromiso',
    conditionText: 'Prioridad, capacidad, patrocinio y horizonte registrados.',
    authorityText: 'Comité o líder con delegación vigente.',
  },
  [GateCode.GC3]: {
    title: 'GC3 Ejecución',
    conditionText:
      'Alcance aceptado; diseño, riesgos, recursos y pruebas preparados.',
    authorityText:
      'Dueño funcional para alcance y líder técnico para solución.',
  },
  [GateCode.GC4]: {
    title: 'GC4 Liberación',
    conditionText:
      'Pruebas, aceptación, recuperación, comunicación y soporte listos antes de producción.',
    authorityText:
      'Autoridad de cambios delegada; comité para cambios mayores o críticos.',
  },
  [GateCode.GC5]: {
    title: 'GC5 Cierre',
    conditionText:
      'Estabilidad, transferencia, aceptación y expediente completos.',
    authorityText:
      'Dueño funcional y responsable operativo; líder registra el cierre.',
  },
};

/**
 * Transiciones de PREPARACION de etapa (design §1.2 D-B4). Son acciones previas
 * del equipo (capacidad `review`), NO la aprobacion del gate. Cada clave es un
 * endpoint; el valor fija `from -> to` que el GovernanceStateService valida
 * contra el `operationalState` actual antes de delegar en assertTransition.
 */
export const STAGE_ADVANCE_TO_STATE: Record<
  'request-validation' | 'mark-ready' | 'confirm-stabilization',
  { from: RequestState; to: RequestState }
> = {
  'request-validation': {
    from: RequestState.EN_EJECUCION,
    to: RequestState.EN_VALIDACION,
  },
  'mark-ready': {
    from: RequestState.EN_VALIDACION,
    to: RequestState.LISTA_PARA_LIBERAR,
  },
  'confirm-stabilization': {
    from: RequestState.EN_ESTABILIZACION,
    to: RequestState.OPERATIVA,
  },
};

/**
 * Mapa de APROBACION de gate por la autoridad (design §1.2 D-B4): solo GC4 y
 * GC5 mueven el estado al aprobarse. GC1-GC3 se derivan de fases previas y no
 * se aprueban desde gobierno (D-B3), por eso no estan aqui. Cada entrada fija
 * `from -> to` que se valida contra el estado actual antes de assertTransition.
 */
export const GATE_APPROVE_TO_STATE: Partial<
  Record<GateCode, { from: RequestState; to: RequestState }>
> = {
  [GateCode.GC4]: {
    from: RequestState.LISTA_PARA_LIBERAR,
    to: RequestState.EN_ESTABILIZACION,
  },
  [GateCode.GC5]: {
    from: RequestState.OPERATIVA,
    to: RequestState.CERRADA,
  },
};

/** Rutas proporcionales (catalogo GOVERNANCE_ROUTE, design §1.4 / §2.7). */
export const GOVERNANCE_ROUTE = {
  COMPLETA: 'COMPLETA',
  SIMPLIFICADA: 'SIMPLIFICADA',
  EXPLORACION: 'EXPLORACION',
} as const;
export type GovernanceRoute =
  (typeof GOVERNANCE_ROUTE)[keyof typeof GOVERNANCE_ROUTE];

/** Tipo de validacion obligatorio minimo para aprobar GC4 (design §1.5). */
export const MANDATORY_VALIDATION_TYPE = 'FUNCIONAL_ACEPTACION';

/** Resultados aprobatorios de una validacion (design §1.5 D-C3b). */
export const APPROVING_VALIDATION_RESULTS: readonly string[] = [
  'APROBADA',
  'APROBADA_CON_OBSERVACIONES',
];
