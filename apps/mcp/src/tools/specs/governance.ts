/** Tools del ciclo de gobierno (gates GC1-GC5). */
import type { ToolSpec } from '../spec.js';

/**
 * Secuencia de cierre:
 *   EN_EJECUCION -(request-validation)-> EN_VALIDACION -(mark-ready)->
 *   LISTA_PARA_LIBERAR -(GC4 approve)-> EN_ESTABILIZACION
 *   -(confirm-stabilization)-> OPERATIVA -(cierre formal: solicitud del líder y\n *   aprobación del jefe)-> CERRADA, con GC5 reflejado como CUMPLIDO.
 */
export const GOVERNANCE_SPECS: ReadonlyArray<ToolSpec> = [
  {
    name: 'governance.gates.get',
    operation: 'GET /requests/{id}/gates',
    access: 'read',
    description:
      'Obtiene el tablero de los 5 gates GC1-GC5 de una solicitud ' +
      '(GET /requests/{id}/gates), con estado derivado, pendientes y resumen ' +
      'de validaciones de GC4. Solo lectura.',
  },
  {
    name: 'governance.gc4.request-validation',
    operation: 'POST /requests/{id}/gates/GC4/request-validation',
    access: 'write',
    optionalBody: true,
    description:
      'Preparacion GC4: mueve la solicitud de EN_EJECUCION a EN_VALIDACION ' +
      '(POST /requests/{id}/gates/GC4/request-validation). Rol JEFE_AREA/' +
      'LIDER_PROCESO. El cuerpo (AdvanceStageDto { note? }) es opcional. ' +
      '409 si el estado actual no es EN_EJECUCION.',
  },
  {
    name: 'governance.gc4.mark-ready',
    operation: 'POST /requests/{id}/gates/GC4/mark-ready',
    access: 'write',
    optionalBody: true,
    description:
      'Preparacion GC4: mueve la solicitud de EN_VALIDACION a ' +
      'LISTA_PARA_LIBERAR (POST /requests/{id}/gates/GC4/mark-ready). ' +
      'Recomputa §1.5: no debe haber validaciones bloqueantes sin resolver y, ' +
      'segun la ruta (COMPLETA/SIMPLIFICADA), exige una validacion ' +
      'funcional/aceptacion aprobatoria. Rol JEFE_AREA/LIDER_PROCESO. El ' +
      'cuerpo (AdvanceStageDto { note? }) es opcional. 409 si falta algo o el ' +
      'estado no es EN_VALIDACION.',
  },
  {
    name: 'governance.gc5.confirm-stabilization',
    operation: 'POST /requests/{id}/gates/GC5/confirm-stabilization',
    access: 'write',
    optionalBody: true,
    description:
      'Preparacion GC5: mueve la solicitud de EN_ESTABILIZACION a OPERATIVA ' +
      '(POST /requests/{id}/gates/GC5/confirm-stabilization). Rol JEFE_AREA/' +
      'LIDER_PROCESO. El cuerpo (AdvanceStageDto { note? }) es opcional. ' +
      '409 si el estado actual no es EN_ESTABILIZACION.',
  },
  {
    name: 'governance.gate.approve',
    operation: 'POST /requests/{id}/gates/{gateCode}/approve',
    access: 'write',
    optionalBody: true,
    description:
      'Aprueba el gate GC4 por la autoridad (POST /requests/{id}/gates/{gateCode}/' +
      'approve): LISTA_PARA_LIBERAR -> EN_ESTABILIZACION. Recomputa la ' +
      'aprobabilidad §1.5 (409 si hay bloqueo o falta la validación obligatoria). ' +
      'GC1-GC3 se derivan del estado y responden 409. GC5 ya no cierra la ' +
      'solicitud: refleja el cierre formal, así que sin un cierre aprobado ' +
      'responde 409 («El cierre se solicita y se aprueba desde el cierre del ' +
      'proyecto»); el cierre formal lo solicita el líder y lo aprueba el jefe desde el portal (consulta su estado con closure.get). ' +
      'Una solicitud CERRADA congela sus controles (409). Rol JEFE_AREA/' +
      'LIDER_PROCESO. gateCode es "GC4" o "GC5". El cuerpo (ApproveGateDto ' +
      '{ authorityNote? }) es opcional.',
  },
];
