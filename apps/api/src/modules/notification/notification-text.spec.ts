import {
  NOTIFICATION_MAX_MESSAGE,
  NOTIFICATION_MAX_TITLE,
  entityRef,
  truncateText,
  withCode,
} from './notification-text';

describe('notification-text', () => {
  it('entityRef antepone el código y tolera su ausencia', () => {
    expect(entityRef('PRY-0012', 'Portal')).toBe('PRY-0012 «Portal»');
    expect(entityRef(null, 'Portal')).toBe('«Portal»');
  });

  it('withCode añade el código al título corto', () => {
    expect(withCode('Plan devuelto', 'PRY-0012')).toBe('Plan devuelto · PRY-0012');
    expect(withCode('Plan devuelto', undefined)).toBe('Plan devuelto');
  });

  describe('truncateText', () => {
    it('no toca un texto que cabe', () => {
      expect(truncateText('hola mundo', 20)).toBe('hola mundo');
    });

    it('corta en el último espacio, añade … y no supera el tope', () => {
      const text = 'palabra '.repeat(50).trim();
      const out = truncateText(text, 30);
      expect(out.length).toBeLessThanOrEqual(30);
      expect(out.endsWith('…')).toBe(true);
      expect(out.slice(0, -1).endsWith('palabra')).toBe(true);
    });

    it('sin espacios usa un corte duro dentro del tope', () => {
      const out = truncateText('x'.repeat(100), 10);
      expect(out).toHaveLength(10);
      expect(out.endsWith('…')).toBe(true);
    });

    it('el código al inicio de un mensaje largo sobrevive al tope de 1000', () => {
      const msg = `Se te asignó la tarea ${entityRef('PRY-0012-T07', 'Tarea')}. ${'detalle '.repeat(300)}`;
      const out = truncateText(msg, NOTIFICATION_MAX_MESSAGE);
      expect(out.length).toBeLessThanOrEqual(NOTIFICATION_MAX_MESSAGE);
      expect(out).toContain('PRY-0012-T07');
    });

    it('un título largo respeta el tope de 255', () => {
      const out = truncateText(withCode('t '.repeat(400), 'PRY-0012'), NOTIFICATION_MAX_TITLE);
      expect(out.length).toBeLessThanOrEqual(NOTIFICATION_MAX_TITLE);
    });
  });
});
