import * as React from 'react';

/**
 * Ejecuta `reset` DURANTE el render cuando cambia alguna dependencia (y en el
 * primer render). Es el patrón que recomienda React para «ajustar el estado
 * cuando cambia una prop» (https://react.dev/learn/you-might-not-need-an-effect):
 * React descarta el render en curso y vuelve a renderizar enseguida con el estado
 * ya ajustado, sin pasar por un render intermedio con datos viejos ni disparar
 * renders en cascada desde un `useEffect`.
 *
 * Úsalo para reiniciar el estado de un formulario cuando se abre un diálogo o
 * cambia el registro que se edita. `reset` debe ser puro salvo por llamadas a
 * `setState` del propio componente, y debe encargarse de no hacer nada cuando no
 * corresponde (p. ej. `if (!open) return`).
 */
export function useResetOnChange(deps: readonly unknown[], reset: () => void): void {
  const [prev, setPrev] = React.useState<readonly unknown[] | null>(null);
  if (prev === null || prev.length !== deps.length || deps.some((d, i) => !Object.is(d, prev[i]))) {
    setPrev(deps);
    reset();
  }
}
