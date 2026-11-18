import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function controllers(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return controllers(full);
    return name.endsWith('.controller.ts') ? [full] : [];
  });
}

/**
 * Lista cerrada de rutas que un usuario con cambio de contraseña pendiente
 * puede usar. Quien añada otra tiene que tocar este test y justificarlo.
 */
describe('@AllowPasswordChangePending (lista cerrada)', () => {
  it('solo aparece, una vez, en me.controller.ts y auth-password.controller.ts', () => {
    const found: Record<string, number> = {};
    for (const file of controllers(join(__dirname, '..', '..'))) {
      const count = (readFileSync(file, 'utf8').match(/@AllowPasswordChangePending\(\)/g) ?? []).length;
      if (count > 0) found[file.split(/[\\/]/).pop() as string] = count;
    }
    expect(found).toEqual({ 'me.controller.ts': 1, 'auth-password.controller.ts': 1 });
  });
});
