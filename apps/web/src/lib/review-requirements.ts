/**
 * Requisitos para enviar una tarea a revisión (regla de cierre, BL-036 E3).
 * Módulo puro. La regla vive en el backend: aquí solo se LEEN las banderas que
 * la API calcula (`evidenceRequired`, `hasEvidence`) y el avance, para anticipar
 * al usuario qué le falta. Si una bandera no llega (respuesta antigua), se trata
 * como «sin requisito» y el servidor responde con su propio mensaje.
 */
export interface ReviewRequirementsSource {
  progress: number;
  evidenceRequired?: boolean;
  hasEvidence?: boolean;
}

export interface ReviewRequirements {
  /** Falta poner el avance en 100 %. */
  needsProgress: boolean;
  /** Se exige evidencia y la tarea no tiene. */
  needsEvidence: boolean;
  /** La tarea exige evidencia (aunque ya la tenga): decide si se pinta esa fila. */
  evidenceRequired: boolean;
}

export function reviewRequirementsOf(item: ReviewRequirementsSource): ReviewRequirements {
  const evidenceRequired = item.evidenceRequired === true;
  return {
    needsProgress: item.progress < 100,
    needsEvidence: evidenceRequired && item.hasEvidence !== true,
    evidenceRequired,
  };
}

/** ¿Falta algo antes de enviar a revisión? Si no, el envío es directo, sin diálogo. */
export function hasPendingReviewRequirements(item: ReviewRequirementsSource): boolean {
  const req = reviewRequirementsOf(item);
  return req.needsProgress || req.needsEvidence;
}

/** Límite del campo de evidencia del DTO (`evidenceUrl`). */
export const EVIDENCE_NOTE_MAX = 2048;

/** Frase que lista lo que falta: «avance al 100 % y evidencia». */
export function missingRequirementsText(req: Pick<ReviewRequirements, 'needsProgress' | 'needsEvidence'>): string {
  const parts: string[] = [];
  if (req.needsProgress) parts.push('avance al 100 %');
  if (req.needsEvidence) parts.push('evidencia');
  return parts.join(' y ');
}
