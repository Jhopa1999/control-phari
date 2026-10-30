'use client';
import * as React from 'react';
import {
  ACTOR_STORAGE_KEY,
  TOKEN_STORAGE_KEY,
  type AuthUser,
  type MyPermissions,
} from './api-client';
import { getAuthMode, type AuthMode } from './auth-mode';
import { ApiError, getMyPermissions } from './me';
type PermissionsState = 'loading' | 'success' | 'error' | 'none';
/** Clave de localStorage donde se guarda el usuario autenticado (modo jwt). */
const AUTH_USER_STORAGE_KEY = 'authUser';
/**
 * Centinela interno de identidad para modo jwt cuando hay token pero el usuario
 * persistido no es legible (ausente o corrupto en localStorage). Sirve solo para
 * que el efecto de carga dispare GET /me/permissions y la identidad real quede
 * resuelta por el backend. NUNCA se envia como cabecera: en jwt onRequest solo
 * manda Authorization: Bearer <token>, nunca X-Actor-Id. No es un identifier real.
 */
const JWT_IDENTITY_SENTINEL = '__jwt__';
interface ActorContextValue {
  /** Modo de autenticacion efectivo del frontend ('jwt' | 'dev-header'). */
  authMode: AuthMode;
  /**
   * identifier de la identidad activa. En dev-header es el actor del selector;
   * en jwt es el identifier del usuario autenticado (o null sin sesion).
   */
  actorId: string | null;
  /**
   * Cambia el actor actual (solo relevante en dev-header; en jwt la identidad
   * la define el token). Persiste en localStorage.
   */
  setActorId: (identifier: string | null) => void;
  /** Permisos del actor (null mientras carga o si no hay actor). */
  permissions: MyPermissions | null;
  /** Modulos permitidos derivados de /me/permissions (vacio si no hay actor). */
  allowedModules: Set<string>;
  /** Estado de la carga de permisos. */
  state: PermissionsState;
  /** Recarga los permisos del actor actual. */
  reload: () => void;
  /** Usuario autenticado en modo jwt (null sin sesion o en dev-header). */
  authUser: AuthUser | null;
  /** Hay sesion jwt activa (siempre false en dev-header). */
  isAuthenticated: boolean;
  /** La ultima sesion jwt caduco (401 en peticion autenticada). */
  sessionExpired: boolean;
  /**
   * La identidad persistida ya se leyo de localStorage. Vale false en el SSR y
   * en el primer render; el guard no decide nada hasta que vale true.
   */
  identityReady: boolean;
  /**
   * La sesion se cerro de forma explicita (logout). El guard no anade `next`
   * en ese caso: otro usuario no debe aterrizar en la ruta del anterior.
   */
  signedOut: boolean;
  /** Inicia sesion jwt: guarda token + usuario y carga permisos. */
  login: (token: string, user: AuthUser) => void;
  /** Cierra la sesion jwt: borra token, usuario y permisos. */
  logout: () => void;
}
const ActorContext = React.createContext<ActorContextValue | null>(null);
/** Identidad persistida en localStorage. */
interface PersistedIdentity {
  actorId: string | null;
  authUser: AuthUser | null;
}
/**
 * Lee la identidad persistida. En jwt deriva del token + usuario guardados; en
 * dev-header, del actorId del selector. Puede lanzar si localStorage no esta
 * disponible: quien la llama lo trata como "sin sesion".
 */
function readPersistedIdentity(authMode: AuthMode): PersistedIdentity {
  if (authMode === 'jwt') {
    const token = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) {
      return { actorId: null, authUser: null };
    }
    const rawUser = window.localStorage.getItem(AUTH_USER_STORAGE_KEY);
    if (rawUser) {
      try {
        const parsed = JSON.parse(rawUser) as AuthUser;
        return { actorId: parsed.identifier, authUser: parsed };
      } catch {
        // Usuario corrupto en storage: se mantiene el token y la carga de
        // permisos resolvera la identidad; si falla con 401, se limpia.
      }
    }
    // Token sin usuario legible: aun asi hay sesion. Se usa el centinela
    // JWT_IDENTITY_SENTINEL (no un identifier real) solo para disparar la
    // carga de permisos; ver su definicion arriba.
    return { actorId: JWT_IDENTITY_SENTINEL, authUser: null };
  }
  const stored = window.localStorage.getItem(ACTOR_STORAGE_KEY);
  return { actorId: stored && stored.length > 0 ? stored : null, authUser: null };
}
export function ActorProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const authMode = React.useMemo<AuthMode>(() => getAuthMode(), []);
  const [actorId, setActorIdState] = React.useState<string | null>(null);
  const [authUser, setAuthUser] = React.useState<AuthUser | null>(null);
  const [permissions, setPermissions] = React.useState<MyPermissions | null>(
    null,
  );
  const [state, setState] = React.useState<PermissionsState>('none');
  const [sessionExpired, setSessionExpired] = React.useState(false);
  const [identityReady, setIdentityReady] = React.useState(false);
  const [signedOut, setSignedOut] = React.useState(false);
  // Lee la identidad persistida una sola vez al montar (evita desajustes SSR).
  // identityReady pasa a true en todas las ramas, en la misma tanda de
  // actualizaciones que actorId: el render siguiente trae ambos a la vez.
  React.useEffect(() => {
    let identity: PersistedIdentity;
    try {
      identity = readPersistedIdentity(authMode);
    } catch {
      // localStorage no disponible: se trata como "sin sesion".
      identity = { actorId: null, authUser: null };
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lee la sesión de localStorage tras montar (no existe en el servidor); la identidad e identityReady se publican en la misma tanda.
    setAuthUser(identity.authUser);
    setActorIdState(identity.actorId);
    setIdentityReady(true);
  }, [authMode]);
  const clearSession = React.useCallback(() => {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    setAuthUser(null);
    setActorIdState(null);
    setPermissions(null);
    setState('none');
  }, []);
  const loadPermissions = React.useCallback(
    async (id: string | null) => {
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
      } catch (err) {
        // En jwt, un 401 al cargar permisos = token invalido/expirado: se
        // limpia la sesion y se marca la expiracion para que el guard redirija.
        if (
          authMode === 'jwt' &&
          err instanceof ApiError &&
          err.status === 401
        ) {
          setSessionExpired(true);
          clearSession();
          return;
        }
        setPermissions(null);
        setState('error');
      }
    },
    [authMode, clearSession],
  );
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga los permisos cuando cambia la identidad; el paso a 'loading' es parte del contrato del contexto (lo usa el guard de rutas).
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
  const login = React.useCallback((token: string, user: AuthUser) => {
    // Al autenticar en jwt se limpia cualquier actorId de dev para no mezclar
    // mecanismos de identidad.
    window.localStorage.removeItem(ACTOR_STORAGE_KEY);
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    window.localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
    setSessionExpired(false);
    setSignedOut(false);
    setAuthUser(user);
    // Dispara la carga de permisos via el efecto (identidad = identifier).
    setActorIdState(user.identifier);
  }, []);
  const logout = React.useCallback(() => {
    setSessionExpired(false);
    setSignedOut(true);
    clearSession();
  }, [clearSession]);
  const reload = React.useCallback(() => {
    void loadPermissions(actorId);
  }, [actorId, loadPermissions]);
  const allowedModules = React.useMemo(
    () => new Set<string>(permissions?.allowedModules ?? []),
    [permissions],
  );
  const isAuthenticated = authMode === 'jwt' && actorId !== null;
  const value = React.useMemo<ActorContextValue>(
    () => ({
      authMode,
      actorId,
      setActorId,
      permissions,
      allowedModules,
      state,
      reload,
      authUser,
      isAuthenticated,
      sessionExpired,
      identityReady,
      signedOut,
      login,
      logout,
    }),
    [
      authMode,
      actorId,
      setActorId,
      permissions,
      allowedModules,
      state,
      reload,
      authUser,
      isAuthenticated,
      sessionExpired,
      identityReady,
      signedOut,
      login,
      logout,
    ],
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
