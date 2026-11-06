import { diffTaskSnapshots, collectReferencedIds } from './task-history';

const resolve = (field: string, value: string | null): string | null => {
  if (value === null) return null;
  if (field === 'responsibleUserId') return value === 'u1' ? 'Ana' : 'Beto';
  if (field === 'phaseId') return value === 'p1' ? 'Diseño' : 'Ejecución';
  return value;
};

describe('task-history', () => {
  it('devuelve solo los campos que cambiaron, con nombres de fase y responsable', () => {
    const changes = diffTaskSnapshots(
      { status: 'POR_HACER', progress: 0, responsibleUserId: 'u1', phaseId: 'p1', title: 'A' },
      { status: 'EN_CURSO', progress: 40, responsibleUserId: 'u2', phaseId: 'p1', title: 'A' },
      resolve,
    );
    expect(changes).toEqual([
      { field: 'status', from: 'POR_HACER', to: 'EN_CURSO' },
      { field: 'progress', from: '0', to: '40' },
      { field: 'responsible', from: 'Ana', to: 'Beto' },
    ]);
  });

  it('registra el motivo de bloqueo al bloquear y al limpiarlo', () => {
    expect(
      diffTaskSnapshots(
        { status: 'EN_CURSO', blockedReason: null },
        { status: 'BLOQUEADA', blockedReason: 'Falta acceso' },
        resolve,
      ),
    ).toEqual([
      { field: 'status', from: 'EN_CURSO', to: 'BLOQUEADA' },
      { field: 'blockedReason', from: null, to: 'Falta acceso' },
    ]);
    expect(
      diffTaskSnapshots(
        { blockedReason: 'Falta acceso' },
        { blockedReason: null },
        resolve,
      ),
    ).toEqual([{ field: 'blockedReason', from: 'Falta acceso', to: null }]);
  });

  it('no inventa cambios cuando un snapshot antiguo no trae el campo', () => {
    const changes = diffTaskSnapshots(
      { status: 'POR_HACER' },
      { status: 'POR_HACER', startDate: '2026-01-01T00:00:00.000Z' },
      resolve,
    );
    expect(changes).toEqual([]);
  });

  it('trata null y vacío como sin valor y registra el borrado de una fecha', () => {
    const changes = diffTaskSnapshots(
      { endDate: '2026-02-01T00:00:00.000Z', description: '' },
      { endDate: null, description: null },
      resolve,
    );
    expect(changes).toEqual([{ field: 'endDate', from: '2026-02-01T00:00:00.000Z', to: null }]);
  });

  it('junta los ids de usuario y fase de todos los eventos', () => {
    const ids = collectReferencedIds([
      { before: { responsibleUserId: 'u1', phaseId: 'p1' }, after: { responsibleUserId: 'u2' } },
      { before: null, after: { phaseId: 'p2' } },
    ]);
    expect(ids.userIds.sort()).toEqual(['u1', 'u2']);
    expect(ids.phaseIds.sort()).toEqual(['p1', 'p2']);
  });
});