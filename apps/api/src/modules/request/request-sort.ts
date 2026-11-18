/** Columnas por las que se puede ordenar Solicitudes y Portafolio (lista blanca del servidor). */
export const REQUEST_SORT_KEYS = [
  'registeredAt',
  'code',
  'title',
  'state',
  'score',
] as const;
export type RequestSortKey = (typeof REQUEST_SORT_KEYS)[number];
