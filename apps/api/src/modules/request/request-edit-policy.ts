import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';
import { RequestState } from './request-state';

/** Mínimo de caracteres de la justificación de una edición posterior al compromiso. */
export const EDIT_JUSTIFICATION_MIN_LENGTH = 10;

/** Estados en los que, además de líder y jefe, edita quien registró la solicitud (D4). */
export const CREATOR_EDITABLE_STATES: readonly string[] = [
  RequestState.REGISTRADA,
  RequestState.DEVUELTA,
];

/**
 * Estados desde la aprobación del compromiso hasta antes del cierre: editar la
 * ficha exige justificación (D4). `CERRADA` no entra: su 409 lo resuelve el
 * servicio antes de aplicar esta política.
 */
export const JUSTIFIED_EDIT_STATES: readonly string[] = [
  RequestState.COMPROMETIDA,
  RequestState.EN_PLANIFICACION,
  RequestState.EN_EJECUCION,
  RequestState.BLOQUEADA,
  RequestState.EN_VALIDACION,
  RequestState.LISTA_PARA_LIBERAR,
  RequestState.EN_ESTABILIZACION,
  RequestState.OPERATIVA,
];

interface RequestOwnership {
  mainProcessId: string | null;
  createdByUserId: string | null;
}

/** Quien registró la solicitud. */
export function isRequestCreator(actor: CurrentActor, request: RequestOwnership): boolean {
  return request.createdByUserId !== null && request.createdByUserId === actor.userId;
}

/**
 * Gestiona la solicitud: jefe de área o líder del proceso principal. Mientras la
 * solicitud no tiene proceso principal (aún sin triar) basta ser líder de algún
 * proceso, porque todavía no hay un proceso concreto del que serlo.
 */
export function isRequestManager(actor: CurrentActor, request: RequestOwnership): boolean {
  if (actor.isJefeArea) return true;
  if (request.mainProcessId === null) return actor.isLiderProceso;
  return actor.grants.some(
    (g) => g.roleCode === RoleCode.LIDER_PROCESO && g.processId === request.mainProcessId,
  );
}
