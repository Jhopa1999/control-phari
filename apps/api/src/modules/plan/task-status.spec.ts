import { isTaskTransitionAllowed, TaskStatus } from './task-status';

describe('isTaskTransitionAllowed (design §1.3)', () => {
  it('admite las aristas permitidas', () => {
    const allowed: Array<[TaskStatus, TaskStatus]> = [
      [TaskStatus.POR_HACER, TaskStatus.EN_CURSO],
      [TaskStatus.POR_HACER, TaskStatus.BLOQUEADA],
      [TaskStatus.EN_CURSO, TaskStatus.BLOQUEADA],
      [TaskStatus.EN_CURSO, TaskStatus.POR_HACER],
      [TaskStatus.EN_CURSO, TaskStatus.EN_REVISION],
      [TaskStatus.BLOQUEADA, TaskStatus.POR_HACER],
      [TaskStatus.BLOQUEADA, TaskStatus.EN_CURSO],
      [TaskStatus.EN_REVISION, TaskStatus.EN_CURSO],
      [TaskStatus.EN_REVISION, TaskStatus.BLOQUEADA],
      [TaskStatus.EN_REVISION, TaskStatus.TERMINADA],
      [TaskStatus.TERMINADA, TaskStatus.EN_CURSO],
    ];
    for (const [from, to] of allowed) {
      expect(isTaskTransitionAllowed(from, to)).toBe(true);
    }
  });

  it('rechaza una muestra de aristas prohibidas', () => {
    const forbidden: Array<[TaskStatus, TaskStatus]> = [
      [TaskStatus.POR_HACER, TaskStatus.TERMINADA],
      [TaskStatus.POR_HACER, TaskStatus.EN_REVISION],
      [TaskStatus.BLOQUEADA, TaskStatus.TERMINADA],
      [TaskStatus.TERMINADA, TaskStatus.TERMINADA],
      [TaskStatus.EN_CURSO, TaskStatus.TERMINADA],
    ];
    for (const [from, to] of forbidden) {
      expect(isTaskTransitionAllowed(from, to)).toBe(false);
    }
  });
});
