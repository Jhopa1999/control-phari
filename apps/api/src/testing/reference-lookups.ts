/**
 * Utilidad de pruebas (no se usa en runtime). Las respuestas de solicitud traen
 * el nombre y código del proceso y el nombre del activo (BL-039), que
 * `RequestStateService` resuelve con `process.findMany` y `asset.findMany`.
 * Muchos mocks de Prisma escritos a mano no declaran esas consultas: este helper
 * las añade (devuelven `[]`) sin tocar las que la prueba ya definió con una
 * implementación propia. Modifica el objeto en el sitio y lo devuelve.
 */
type MockFn = ((...args: unknown[]) => unknown) & {
  getMockImplementation?: () => unknown;
  mockResolvedValue?: (value: unknown) => unknown;
};

function ensureFindMany(prisma: Record<string, unknown>, model: string): void {
  const delegate = (prisma[model] ??= {}) as Record<string, unknown>;
  const current = delegate.findMany as MockFn | undefined;
  if (current === undefined) {
    delegate.findMany = async (): Promise<unknown[]> => [];
    return;
  }
  // jest.fn() sin implementación devolvería undefined: se fija [] por defecto.
  if (
    typeof current.getMockImplementation === 'function' &&
    current.getMockImplementation() === undefined &&
    typeof current.mockResolvedValue === 'function'
  ) {
    current.mockResolvedValue([]);
  }
}

export function withReferenceLookups<T>(prisma: T): T {
  const target = prisma as unknown as Record<string, unknown>;
  ensureFindMany(target, 'process');
  ensureFindMany(target, 'asset');
  return prisma;
}
