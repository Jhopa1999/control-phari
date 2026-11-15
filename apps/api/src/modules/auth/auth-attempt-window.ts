/**
 * Ventana deslizante de intentos por clave, en memoria. Estructura pura (sin
 * Nest ni BD) para poder probarla con un reloj inyectado.
 *
 * Límite conocido: el estado vive en el proceso de la API. Se pierde al
 * reiniciarla y, si algún día hay varias réplicas, cada una cuenta por
 * separado. `compose.prod.yaml` corre un único contenedor `api`, así que hoy el
 * conteo es exacto.
 */
export class AttemptWindow {
  private readonly hits = new Map<string, number[]>();
  constructor(
    /** Tiempo máximo que se conserva una marca, aunque la ventana pedida sea menor. */
    private readonly retentionMs: number = 24 * 60 * 60 * 1000,
    /** Tope de claves vivas; al superarlo se purgan las vencidas. */
    private readonly maxKeys: number = 10_000,
    /** Tope de marcas por clave (protege la memoria ante un ataque sostenido). */
    private readonly maxHitsPerKey: number = 1_000,
  ) {}
  /** Marcas de `key` dentro de la ventana, de la más antigua a la más reciente. */
  private recent(key: string, windowMs: number, now: number): number[] {
    const list = this.hits.get(key);
    if (!list) return [];
    return list.filter((at) => at > now - windowMs);
  }
  /** Cantidad de intentos de `key` dentro de la ventana. */
  count(key: string, windowMs: number, now: number): number {
    return this.recent(key, windowMs, now).length;
  }
  /** Registra un intento de `key`. */
  record(key: string, now: number): void {
    const list = (this.hits.get(key) ?? []).filter(
      (at) => at > now - this.retentionMs,
    );
    list.push(now);
    if (list.length > this.maxHitsPerKey) {
      list.splice(0, list.length - this.maxHitsPerKey);
    }
    this.hits.set(key, list);
    if (this.hits.size > this.maxKeys) {
      this.sweep(now);
    }
  }
  /** Olvida los intentos de `key`. */
  clear(key: string): void {
    this.hits.delete(key);
  }
  /**
   * Milisegundos que faltan para que `key` vuelva a quedar por debajo de
   * `max` intentos dentro de la ventana; 0 si ya lo está.
   */
  retryAfterMs(key: string, max: number, windowMs: number, now: number): number {
    const recent = this.recent(key, windowMs, now);
    if (recent.length < max) return 0;
    const oldestThatMustLeave = recent[recent.length - max];
    return Math.max(0, oldestThatMustLeave + windowMs - now);
  }
  /** Número de claves vivas (para pruebas y diagnóstico). */
  get size(): number {
    return this.hits.size;
  }
  private sweep(now: number): void {
    for (const [key, list] of this.hits) {
      const last = list[list.length - 1];
      if (last === undefined || last <= now - this.retentionMs) {
        this.hits.delete(key);
      }
    }
  }
}