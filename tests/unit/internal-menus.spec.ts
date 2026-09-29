import { describe, expect, it } from 'vitest';
import { internalMenuFor } from '../../src/modules/internal_operations/domain/internal-menus.js';

describe('internal menus', () => {
  it('limits each menu to options of the requested role', () => {
    expect(internalMenuFor('commercial')).toContain('Novas oportunidades');
    expect(internalMenuFor('technical')).toContain('Fila técnica autorizada');
    expect(internalMenuFor('administration')).toContain('Números autorizados');
  });
});
