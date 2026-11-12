'use client';
import * as React from 'react';
import {
  ACTOR_STORAGE_KEY,
  SESSION_HINT_STORAGE_KEY,
  purgeLegacySession,
  type AuthUser,
  type MyPermissions,
} from './api-client';
import { getAuthMode, type AuthMode } from './auth-mode';
import { logout as logoutRequest } from './auth';
import { ApiError, getMyPermissions } from './me';
type PermissionsState = 'loading' | 'success' | 'error' | 'none';

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
   * la define la cookie de sesion). Persiste en localStorage.
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
   * La identidad ya se resolvio: en dev-header se leyo el actor de
   * localStorage; en jwt la API respondio a GET /me/permissions (con o sin
   * sesion). Vale false en el SSR y hasta entonces; el guard no decide nada.
   */
  identityReady: boolean;
  /**
   * La sesion se cerro de forma explicita (logout). El guard no anade `next`
   * en ese caso: otro usuario no debe aterrizar en la ruta del anterior.
   */
  signedOut: boolean;
  /**
   * Registra la sesion jwt recien abierta. La cookie HttpOnly ya la puso la API
   * en la respuesta del login; aqui solo se guarda el usuario en memoria y se
   * cargan los permisos. El token del cuerpo de la respuesta se descarta.
   */
  login: (user: AuthUser) => void;
  /** Cierra la sesion jwt: la API borra la cookie y se limpia el estado local. */
  logout: () => Promise<void>;
}
const ActorContext = React.createContext<ActorContextValue | null>(null);

function readSessionHint(): boolean {
  try {
    return window.localStorage.getItem(SESSION_HINT_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeSessionHint(active: boolean): void {
  try {
    if (active) window.localStorage.setItem(SESSION_HINT_STORAGE_KEY, '1');
    else window.localStorage.removeItem(SESSION_HINT_STORAGE_KEY);
  } catch {
    // Sin almacenamiento: solo se pierde la distincion «caduco» / «nunca hubo».
  }
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
  // Identidad (jwt) cuyos permisos ya se cargaron: evita pedirlos dos veces
  // cuando la comprobacion de arranque fija `actorId`.
  const loadedIdentifierRef = React.useRef<string | null>(null);
  // Se incrementa en cada login/logout para descartar la respuesta tardia de
  // una comprobacion de arranque que ya no corresponde al estado actual.
  const epochRef = React.useRef(0);

  const clearSession = React.useCallback(() => {
    epochRef.current += 1;
    loadedIdentifierRef.current = null;
    setAuthUser(null);
    setActorIdState(null);
    setPermissions(null);
    setState('none');
  }, []);

  // Arranque. En dev-header lee el actor del selector. En jwt el token ya no
  // esta al alcance de JS (cookie HttpOnly): se purga la sesion heredada de
  // localStorage y se pregunta a la API quien es el usuario (GET /me/permissions).
  React.useEffect(() => {
    if (authMode !== 'jwt') {
      let stored: string | null = null;
      try {
        stored = window.localStorage.getItem(ACTOR_STORAGE_KEY);
      } catch {
        // localStorage no disponible: se trata como "sin sesion".
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lee el actor de localStorage tras montar (no existe en el servidor); la identidad e identityReady se publican en la misma tanda.
      setActorIdState(stored && stored.length > 0 ? stored : null);
      setIdentityReady(true);
      return;
    }
    purgeLegacySession();
    const epoch = epochRef.current;
    setState('loading');
    getMyPermissions()
      .then((data) => {
        if (epoch !== epochRef.current) return;
        loadedIdentifierRef.current = data.identifier;
        setPermissions(data);
        setAuthUser({ id: data.userId, name: data.name, identifier: data.identifier });
        setActorIdState(data.identifier);
        setState('success');
        writeSessionHint(true);
        setIdentityReady(true);
      })
      .catch((err: unknown) => {
        if (epoch !== epochRef.current) return;
        if (err instanceof ApiError && err.status === 401) {
          // Con pista = la sesion caduco; sin pista = nunca hubo sesion.
          if (readSessionHint()) setSessionExpired(true);
          writeSessionHint(false);
          setState('none');
        } else {
          setState('error');
        }
        setIdentityReady(true);
      });
  }, [authMode]);

  // Otras pestanas: al cerrar sesion se borra la pista y esta pestana sale.
  React.useEffect(() => {
    if (authMode !== 'jwt') return;
    function onStorage(event: StorageEvent): void {
      if (event.key === SESSION_HINT_STORAGE_KEY && event.newValue === null) {
        setSignedOut(true);
        clearSession();
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [authMode, clearSession]);

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
        if (authMode === 'jwt') loadedIdentifierRef.current = id;
        setPermissions(data);
        setState('success');
      } catch (err) {
        // En jwt, un 401 al cargar permisos = sesion invalida/expirada: se
        // limpia la sesion y se marca la expiracion para que el guard redirija.
        if (
          authMode === 'jwt' &&
          err instanceof ApiError &&
          err.status === 401
        ) {
          writeSessionHint(false);
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
    if (authMode === 'jwt' && actorId !== null && loadedIdentifierRef.current === actorId) {
      return;
    }
    // Carga los permisos cuando cambia la identidad; el paso a 'loading' es parte del contrato del contexto (lo usa el guard de rutas).
    void loadPermissions(actorId);
  }, [authMode, actorId, loadPermissions]);
  const setActorId = React.useCallback((identifier: string | null) => {
    if (identifier && identifier.length > 0) {
      window.localStorage.setItem(ACTOR_STORAGE_KEY, identifier);
      setActorIdState(identifier);
    } else {
      window.localStorage.removeItem(ACTOR_STORAGE_KEY);
      setActorIdState(null);
    }
  }, []);
  const login = React.useCallback((user: AuthUser) => {
    // Al autenticar en jwt se limpia cualquier actorId de dev para no mezclar
    // mecanismos de identidad.
    window.localStorage.removeItem(ACTOR_STORAGE_KEY);
    writeSessionHint(true);
    epochRef.current += 1;
    loadedIdentifierRef.current = null;
    setSessionExpired(false);
    setSignedOut(false);
    setAuthUser(user);
    // Dispara la carga de permisos via el efecto (identidad = identifier).
    setActorIdState(user.identifier);
  }, []);
  const logout = React.useCallback(async () => {
    try {
      await logoutRequest();
    } catch {
      // Sin red o error del servidor: se limpia igualmente el estado local; la
      // cookie caduca sola por su Max-Age.
    }
    writeSessionHint(false);
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
