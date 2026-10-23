#!/usr/bin/env node
/**
 * check-docs-sync.mjs — Aviso (no bloqueo) de sincronía de documentación.
 *
 * Compara los archivos cambiados entre dos puntos de git. Si el cambio toca
 * código de DOMINIO pero NO toca la documentación de la aplicación, emite una
 * ADVERTENCIA visible. Por defecto SIEMPRE termina con exit 0 (nunca rompe el
 * build); solo avisa. Pensado para correr en CI (job `docs-sync` en
 * pull_request) y también en local.
 *
 * Node puro: usa `node:child_process` (execFileSync, SIN shell, para evitar
 * inyección) y `node:process`. No añade dependencias.
 *
 * Rango de diff:
 *   - Env DOCS_SYNC_BASE y DOCS_SYNC_HEAD (p. ej. los SHA del PR). Si ambos están
 *     definidos, se usan.
 *   - Si no, se intenta `origin/<rama-por-defecto>...HEAD`.
 *   - Fallback final: `HEAD~1 HEAD`.
 *
 * Flags:
 *   --strict  Si hay advertencia, termina con exit 1 (para quien quiera endurecer
 *             el check en el futuro). Por defecto SIN --strict: exit 0 siempre.
 *
 * Rutas vigiladas (si cambia alguna => "toca dominio"):
 *   - apps/api/src/modules/
 *   - apps/web/src/app/
 *   - apps/web/src/components/
 * Rutas de doc que "satisfacen" (si cambia alguna => "toca doc"):
 *   - docs/aplicacion/
 */
import { execFileSync } from 'node:child_process';
import process from 'node:process';

const DOMAIN_PREFIXES = [
  'apps/api/src/modules/',
  'apps/web/src/app/',
  'apps/web/src/components/',
];
const DOCS_PREFIX = 'docs/aplicacion/';

const isCi = Boolean(process.env.GITHUB_ACTIONS);
const strict = process.argv.includes('--strict');

/** Ejecuta git con argumentos fijos (sin shell) y devuelve stdout, o null si falla. */
function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' });
  } catch {
    return null;
  }
}

/** Resuelve [base, head] para el diff según env y fallbacks. */
function resolveRange() {
  const envBase = process.env.DOCS_SYNC_BASE;
  const envHead = process.env.DOCS_SYNC_HEAD;
  if (envBase && envHead) {
    return [envBase, envHead];
  }

  // Intentar origin/<rama-por-defecto>...HEAD.
  const headRef = git(['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']);
  if (headRef) {
    const base = headRef.trim(); // p. ej. refs/remotes/origin/main
    const name = base.replace('refs/remotes/', '');
    if (git(['rev-parse', '--verify', '--quiet', name]) !== null) {
      return [name, 'HEAD'];
    }
  }

  // Fallback: comparar con el commit anterior.
  return ['HEAD~1', 'HEAD'];
}

/** Lista los archivos cambiados entre base y head (separadores normalizados a /). */
function changedFiles(base, head) {
  const out = git(['diff', '--name-only', base, head]);
  if (out === null) {
    return null;
  }
  return out
    .split('\n')
    .map((line) => line.trim().replace(/\\/g, '/'))
    .filter((line) => line.length > 0);
}

function main() {
  const [base, head] = resolveRange();
  const files = changedFiles(base, head);

  if (files === null) {
    // No se pudo calcular el diff (p. ej. refs ausentes). No es un fallo del
    // cambio: se informa y se sale limpio para no romper el build.
    process.stdout.write(
      `[docs-sync] No se pudo calcular el diff entre "${base}" y "${head}"; se omite el aviso.\n`,
    );
    process.exit(0);
  }

  const touchesDomain = files.filter((f) =>
    DOMAIN_PREFIXES.some((p) => f.startsWith(p)),
  );
  const touchesDocs = files.some((f) => f.startsWith(DOCS_PREFIX));

  const shouldWarn = touchesDomain.length > 0 && !touchesDocs;

  process.stdout.write(
    `[docs-sync] Rango: ${base}..${head} — ${files.length} archivo(s) cambiado(s).\n`,
  );

  if (!shouldWarn) {
    process.stdout.write(
      '[docs-sync] OK: no se detecta documentación desincronizada.\n',
    );
    process.exit(0);
  }

  const warnBody =
    'El cambio toca código de dominio (' +
    touchesDomain.slice(0, 10).join(', ') +
    (touchesDomain.length > 10 ? ', …' : '') +
    `) pero no modifica ningún archivo de ${DOCS_PREFIX}. ` +
    'Actualiza la documentación de la aplicación o justifica por qué el cambio ' +
    'no la necesita.';

  if (isCi) {
    // Anotación visible en GitHub Actions.
    process.stdout.write(`::warning::[docs-sync] ${warnBody}\n`);
    const summary = process.env.GITHUB_STEP_SUMMARY;
    if (summary) {
      try {
        execFileSync(
          'node',
          [
            '-e',
            'require("fs").appendFileSync(process.argv[1], process.argv[2])',
            summary,
            `### ⚠️ Sincronía de documentación\n\n${warnBody}\n`,
          ],
          { encoding: 'utf8' },
        );
      } catch {
        // Si no se puede escribir el resumen, la anotación ::warning:: ya avisó.
      }
    }
  } else {
    process.stdout.write(`[docs-sync] ADVERTENCIA: ${warnBody}\n`);
  }

  process.exit(strict ? 1 : 0);
}

main();
