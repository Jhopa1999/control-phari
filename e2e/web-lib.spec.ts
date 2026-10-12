import { expect, test } from '@playwright/test';
import {
  postLoginPath,
  safeInternalPath,
} from '../apps/web/src/lib/safe-redirect';

/**
 * Pruebas de funciones puras de apps/web/src/lib (design §7.9.2) con el runner
 * de Playwright y sin el fixture `page`: no abren navegador. Los módulos que se
 * importan solo usan importaciones relativas, lucide-react e `import type`, así
 * que Node los carga sin la configuración de Next.
 */

test.describe('safe-redirect', () => {
  test('safeInternalPath conserva una ruta interna válida', () => {
    expect(safeInternalPath('/seguimiento/plan?requestId=abc')).toBe(
      '/seguimiento/plan?requestId=abc',
    );
  });

  test('safeInternalPath rechaza destinos externos, /login y valores vacíos', () => {
    const rejected: Array<string | null> = [
      'https://ejemplo.invalid',
      '//ejemplo.invalid',
      '/\\ejemplo.invalid',
      '/\t/ejemplo.invalid',
      'javascript:alert(1)',
      '/login',
      '/login?next=/x',
      '',
      null,
    ];
    for (const raw of rejected) {
      expect(safeInternalPath(raw), JSON.stringify(raw)).toBeNull();
    }
  });

  test('postLoginPath usa un next válido y, si no, /inicio', () => {
    expect(
      postLoginPath(new URLSearchParams('next=%2Fdemanda%2Ftriage')),
    ).toBe('/demanda/triage');
    expect(postLoginPath(new URLSearchParams('expired=1'))).toBe('/inicio');
    expect(
      postLoginPath(new URLSearchParams('next=https%3A%2F%2Fejemplo.invalid')),
    ).toBe('/inicio');
  });
});
