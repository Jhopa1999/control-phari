/**
 * Preferencia del usuario guardada en localStorage, lista para
 * `React.useSyncExternalStore`.
 *
 * Sustituye al patrón «estado inicial neutro + useEffect que lee localStorage»:
 * - En el servidor y durante la hidratación React usa `serverValue`, así que no hay
 *   desajuste de hidratación; ya en el cliente pasa al valor guardado.
 * - Los cambios se notifican a los componentes suscritos (y a otras pestañas, por
 *   el evento `storage`).
 * - Si localStorage no está disponible (modo privado, política del navegador), la
 *   elección se recuerda en memoria hasta recargar, igual que antes.
 *
 * `read` y `write` ya se encargan de sus propios try/catch; `read` debe devolver
 * un valor primitivo (el snapshot tiene que ser estable entre llamadas).
 */
export interface LocalPrefStore<T> {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => T;
  getServerSnapshot: () => T;
  set: (value: T) => void;
}

export function createLocalPrefStore<T extends string>(
  read: () => T,
  write: (value: T) => void,
  serverValue: T,
): LocalPrefStore<T> {
  const listeners = new Set<() => void>();
  // Respaldo en memoria cuando no se puede persistir; null = usar lo guardado.
  let memory: T | null = null;

  const notify = (): void => {
    listeners.forEach((listener) => listener());
  };
  // Otra pestaña cambió el valor guardado: manda lo guardado.
  const onStorage = (): void => {
    memory = null;
    notify();
  };

  return {
    subscribe(onChange) {
      listeners.add(onChange);
      if (listeners.size === 1) window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(onChange);
        if (listeners.size === 0) window.removeEventListener('storage', onStorage);
      };
    },
    getSnapshot: () => memory ?? read(),
    getServerSnapshot: () => serverValue,
    set(value) {
      memory = value;
      write(value);
      notify();
    },
  };
}
