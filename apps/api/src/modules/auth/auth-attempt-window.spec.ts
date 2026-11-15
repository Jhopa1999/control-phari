import { AttemptWindow } from './auth-attempt-window';

const MIN = 60_000;

describe('AttemptWindow', () => {
  it('cuenta solo los intentos dentro de la ventana', () => {
    const w = new AttemptWindow();
    w.record('k', 0);
    w.record('k', 10 * MIN);
    expect(w.count('k', 15 * MIN, 14 * MIN)).toBe(2);
    expect(w.count('k', 15 * MIN, 16 * MIN)).toBe(1);
    expect(w.count('k', 15 * MIN, 26 * MIN)).toBe(0);
  });

  it('retryAfterMs es 0 por debajo del máximo y el resto de la espera cuando lo alcanza', () => {
    const w = new AttemptWindow();
    for (let i = 0; i < 4; i += 1) w.record('k', i * MIN);
    expect(w.retryAfterMs('k', 5, 15 * MIN, 4 * MIN)).toBe(0);
    w.record('k', 4 * MIN);
    // Con 5 de 5, se libera cuando salga el más antiguo (t=0): 15 min tras él.
    expect(w.retryAfterMs('k', 5, 15 * MIN, 4 * MIN)).toBe(11 * MIN);
    w.record('k', 5 * MIN);
    // Con 6 de 5 deben salir dos: el segundo más antiguo (t=1 min).
    expect(w.retryAfterMs('k', 5, 15 * MIN, 5 * MIN)).toBe(11 * MIN);
  });

  it('clear olvida la clave', () => {
    const w = new AttemptWindow();
    w.record('k', 0);
    w.clear('k');
    expect(w.count('k', MIN, 1)).toBe(0);
  });

  it('acota la memoria: marcas por clave y claves vivas', () => {
    const w = new AttemptWindow(MIN, 3, 2);
    for (let i = 0; i < 10; i += 1) w.record('k', i);
    expect(w.count('k', MIN, 10)).toBe(2);
    w.record('a', 0);
    w.record('b', 0);
    w.record('c', 3 * MIN);
    w.record('d', 3 * MIN);
    // Al superar el tope se purgan las claves cuya última marca superó la retención.
    expect(w.size).toBeLessThanOrEqual(3);
  });
});
