import { describe, expect, it, vi } from 'vitest';
import { PloomesClient } from '../../src/infra/ploomes/ploomes-client.js';

describe('PloomesClient', () => {
  it('authenticates with the User-Key header when reading the account', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ Id: 7, Name: 'Life Engenharia' }), { status: 200 }),
      );

    await expect(new PloomesClient('secret-key', fetcher).getAccount()).resolves.toEqual({
      Id: 7,
      Name: 'Life Engenharia',
    });
    expect(fetcher).toHaveBeenCalledWith('https://public-api2.ploomes.com/Account', {
      headers: { 'Content-Type': 'application/json', 'User-Key': 'secret-key' },
    });
  });

  it('uses compact OData queries when discovering pipeline configuration', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ value: [{ Id: 31, Name: 'Comercial' }] }), { status: 200 }),
      );

    await expect(new PloomesClient('secret-key', fetcher).listPipelines()).resolves.toEqual([
      { Id: 31, Name: 'Comercial' },
    ]);
    expect(fetcher.mock.calls[0][0]).toContain('Deals@Pipelines?%24top=100&%24select=Id%2CName');
  });
});
