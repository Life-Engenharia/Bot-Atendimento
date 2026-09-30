import { describe, expect, it } from 'vitest';
import {
  AdministrativeMenuService,
  OperationalConfigurationStore,
  OperationalSetting,
} from '../../src/modules/internal_operations/application/administrative-menu-service.js';

class FakeConfigurationStore implements OperationalConfigurationStore {
  readonly settings: OperationalSetting[] = [];

  async appendSetting(setting: OperationalSetting): Promise<void> {
    this.settings.push(setting);
  }
}

describe('administrative menu', () => {
  it('allows only the configured number to confirm an operational change', async () => {
    const store = new FakeConfigurationStore();
    const service = new AdministrativeMenuService('5511999999999', store);

    expect(await service.handle('5511888888888', '/config')).toBeUndefined();
    expect(
      await service.handle('5511999999999', 'RESPONSAVEL Ana | +55 11 98888-8888 | comercial'),
    ).toMatchObject({
      state: 'ADMIN_CONFIRMATION',
    });
    expect(store.settings).toEqual([]);

    expect(await service.handle('5511999999999', 'CONFIRMAR')).toMatchObject({
      state: 'ADMIN_UPDATED',
    });
    expect(store.settings).toEqual([
      { key: 'responsaveis', value: { nome: 'Ana', telefone: '5511988888888', area: 'comercial' } },
    ]);
  });
});
