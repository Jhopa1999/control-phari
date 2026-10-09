/**
 * Codigos de maestras de Fase 5 usados en validacion de entrada (`@IsIn`) y en
 * las reglas de clasificacion server-side (design §1.7/§2.3). Espejan el seed de
 * `prisma/seed.ts` (familias ACTIVITY_CLASS, ISSUE_TYPE); se mantienen alineados
 * con el seed. RECORD_STATE vive en `record-state.ts` (es tambien maquina de
 * estado).
 */

/** Clasificacion de actividad del diario (BR-014). */
export const ACTIVITY_CLASS_CODES = [
  'PLANIFICADA',
  'SOPORTE',
  'INTERNA',
  'EXTRAORDINARIA',
] as const;

export type ActivityClassCode = (typeof ACTIVITY_CLASS_CODES)[number];

/** Tipo de novedad (familia confirmada en `20`; BLOQUEO por defecto). */
export const ISSUE_TYPE_CODES = [
  'BLOQUEO',
  'INCIDENTE',
  'CALIDAD_DATOS',
  'SOLICITUD_APOYO',
] as const;
