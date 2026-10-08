'use client';

import * as React from 'react';
import { ACTOR_STORAGE_KEY, type MyPermissions } from './api-client';
import { getMyPermissions } from './me';

type PermissionsState = 'loading' | 'success' | 'error' | 'none';

interface ActorContextValue {
  /** identifier del actor seleccionado (null si no hay seleccion). */
  actorId: string | null;
  /** Cambia el actor actual y lo persiste en localStorage. */
  setActorId: (identifier: string | null) => void;
  /** Permisos del actor (null mientras carga o si no hay actor). */
  permissions: MyPermissions | null;
  /** Modulos permitidos derivados de /me/permissions (vacio si no hay actor). */
  allowedModules: Set<string>;
  /** Estado de la carga de permisos. */
  state: PermissionsState;
  /** Recarga los permisos del actor actual. */
  reload: () => void;
}

const ActorContext = React.createContext<ActorContextValue | null>(null);

export function ActorProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [actorId, setActorIdState] = React.useState<string | null>(null);
  const [permissions, setPermissions] = React.useState<MyPermissions | null>(
    null,
  );
  const [state, setState] = React.useState<PermissionsState>('none');

  // Lee el actor persistido una sola vez al montar (evita desajustes de SSR).
  React.useEffect(() => {
    const stored = window.localStorage.getItem(ACTOR_STORAGE_KEY);
    setActorIdState(stored && stored.length > 0 ? stored : null);
  }, []);

  const loadPermissions = React.useCallback(async (id: string | null) => {
    if (!id) {
      setPermissions(null);
      setState('none');
      return;
    }
    setState('loading');
    try {
      const data = await getMyPermissions();
      setPermissions(data);
      setState('success');
    } catch {
      setPermissions(null);
      setState('error');
    }
  }, []);

  React.useEffect(() => {
    void loadPermissions(actorId);
  }, [actorId, loadPermissions]);

  const setActorId = React.useCallback((identifier: string | null) => {
    if (identifier && identifier.length > 0) {
      window.localStorage.setItem(ACTOR_STORAGE_KEY, identifier);
      setActorIdState(identifier);
    } else {
      window.localStorage.removeItem(ACTOR_STORAGE_KEY);
      setActorIdState(null);
    }
  }, []);

  const reload = React.useCallback(() => {
    void loadPermissions(actorId);
  }, [actorId, loadPermissions]);

  const allowedModules = React.useMemo(
    () => new Set<string>(permissions?.allowedModules ?? []),
    [permissions],
  );

  const value = React.useMemo<ActorContextValue>(
    () => ({
      actorId,
      setActorId,
      permissions,
      allowedModules,
      state,
      reload,
    }),
    [actorId, setActorId, permissions, allowedModules, state, reload],
  );

  return (
    <ActorContext.Provider value={value}>{children}</ActorContext.Provider>
  );
}

export function useActor(): ActorContextValue {
  const ctx = React.useContext(ActorContext);
  if (!ctx) {
    throw new Error('useActor debe usarse dentro de <ActorProvider>.');
  }
  return ctx;
}
