import { describe, expect, it } from 'vitest';
import { identifyEquipment } from '../../src/modules/conversations/domain/equipment-catalog.js';

describe('equipment catalog', () => {
  it.each([
    ['Meu chiller parou', 'chiller', 'hvac'],
    ['A CompoGuard queimou', 'compoguard', 'hemotherapy'],
    ['A Compomath G5 apresentou alarme', 'compomat', 'hemotherapy'],
    ['A bolsa de sangue está com problema', 'blood-bag', 'hemotherapy'],
    ['Falha no compressor scroll', 'compressor', 'hvac'],
    ['A placa controladora do chiller não liga', 'chiller-controller', 'hvac'],
    ['Erro no módulo de I/O e na placa de relé', 'control-io', 'hvac'],
    ['A IHM OptiView está apagada', 'control-interface', 'hvac'],
    ['Falha na Carel pCOXS', 'carel-controller', 'hvac'],
    ['Controladora Danfoss MCX apresentou alarme', 'danfoss-controller', 'hvac'],
    ['Sem comunicação BACnet com o BMS', 'control-communication', 'hvac'],
  ])('recognizes %s', (message, id, domain) => {
    expect(identifyEquipment(message)).toMatchObject({ id, domain });
  });
});
