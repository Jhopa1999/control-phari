---
inclusion: auto
name: Entorno local, worktrees y e2e
description: Cómo levantar la API y la web en local o en un worktree, correr Playwright y Jest sin contaminar la BD de desarrollo ni chocar con los servidores del usuario. Aplicar al ejecutar e2e, arrancar servidores de prueba, trabajar en .worktrees/ o diagnosticar pruebas que pasan en local y fallan en CI.
---

# Entorno local, worktrees y e2e

## Puertos

- `3000` (web) y `3001` (API) son del usuario: no los ocupes ni los detengas
  salvo que él lo pida.
- Para pruebas propias usa `3100` (web) y `3101` (API).
- El stack Docker por red (`compose.prod.yaml`) vive en `8080`; no es para
  pruebas.

## Antes de arrancar

1. Docker Desktop debe responder (`docker info`). La BD de desarrollo es el
   contenedor `plantilla-portales-postgres-1` (puerto 5433); no se destruye.
2. El shell persistente acumula variables de ejecuciones anteriores
   (`NEXT_PUBLIC_*`, `DATABASE_URL`, `AUTH_MODE`, `CORS_ORIGINS`, `PORT`,
   `E2E_*`). Bórralas antes de compilar, probar o usar docker compose.
3. En un worktree (`.worktrees/<nombre>`):
   - copia el `.env` raíz del repo principal (está ignorado por git; trae
     `JWT_SECRET` y `DATABASE_URL`);
   - **no** copies `apps/web/.env.local`: contamina el build; pasa las
     variables `NEXT_PUBLIC_*` por entorno;
   - ejecuta `npm run prisma:generate --workspace apps/api`;
   - al cambiar de rama dentro del mismo worktree, recompila el cliente
     (`npm run build --workspace packages/api-client`) antes del typecheck.

## Arrancar (modo dev-header, el de los e2e)

Desde la raíz del worktree o del repo:

```
cmd /c "set AUTH_MODE=dev-header&& set PORT=3101&& set CORS_ORIGINS=http://localhost:3100&& npm run start:dev --workspace apps/api"
```

Desde `apps/web`:

```
cmd /c "set NEXT_PUBLIC_AUTH_MODE=dev-header&& set NEXT_PUBLIC_API_BASE_URL=http://localhost:3101&& npx next dev -p 3100"
```

Para probar la sesión real, cambia ambos modos a `jwt`. Next no admite dos
`next dev` en la misma carpeta: si el usuario tiene uno abierto en ese
directorio, usa otro worktree o pídele permiso.

## Playwright

```
cmd /c "set E2E_WEB_URL=http://localhost:3100&& set E2E_API_URL=http://localhost:3101&& npx playwright test <specs>"
```

- Corre primero los specs afectados y `e2e/web-lib.spec.ts`; la suite completa,
  una vez al final.
- Un fallo intermitente se repite aislado (`--repeat-each=3`) antes de darlo
  por ajeno; anótalo en el PR.
- Usuarios demo: `jefe@`, `lider@`, `integrante@`, `admin@demo.local` con la
  contraseña del seed. No los modifiques (ver `30-pruebas.md`).

## Build de la web

`npm run build --workspace apps/web` sin `apps/web/.env.local` (renómbralo a
`.bak` y restáuralo), con `NEXT_PUBLIC_API_BASE_URL` por entorno. Restaura
`apps/web/next-env.d.ts` si el build lo reescribe.

## Al terminar

- Detén los procesos node/nest que arrancaste (los que usen el worktree o los
  puertos 3100/3101) y comprueba que los puertos quedaron libres.
- Borra `test-results/` y `playwright-report/`.
- No dejes archivos sueltos en la raíz del repo principal.
