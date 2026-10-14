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

  it('selects the commercial pipeline only when there is exactly one option', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ value: [{ Id: 50007488, Name: 'Vendas' }] }), { status: 200 }),
    );
    await expect(new PloomesClient('secret-key', fetcher).getActiveCommercialPipeline()).resolves.toEqual({
      Id: 50007488,
      Name: 'Vendas',
    });
  });

  it('builds the commercial overview even when one non-critical source is unavailable', async () => {
    const fetcher = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.endsWith('/Account')) return new Response(JSON.stringify({ Id: 7, Name: 'Life Engenharia' }));
      if (url.includes('Deals@Pipelines')) return new Response(JSON.stringify({ value: [{ Id: 3, Name: 'Vendas' }] }));
      if (url.includes('/Users?')) return new Response('forbidden', { status: 403 });
      return new Response(JSON.stringify({ value: [{ Id: 11, Title: 'Chiller', Amount: 2500, StageId: 1 }] }));
    });

    const overview = await new PloomesClient('secret-key', fetcher).getCommercialOverview();

    expect(overview.account?.Name).toBe('Life Engenharia');
    expect(overview.pipelines).toEqual([{ Id: 3, Name: 'Vendas' }]);
    expect(overview.metrics).toMatchObject({ totalDeals: 1, totalAmount: 2500 });
    expect(overview.sources).toEqual({ account: 'ok', pipelines: 'ok', users: 'unavailable', deals: 'ok', contacts: 'ok' });
  });

  it('creates a contact and opportunity only after resolving a single commercial pipeline', async () => {
    const fetcher = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input);
      if (url.includes('Deals@Pipelines'))
        return new Response(JSON.stringify({ value: [{ Id: 9, Name: 'Comercial' }] }));
      if (url.includes('/Contacts?')) return new Response(JSON.stringify({ value: [] }));
      if (url.endsWith('/Contacts')) {
        expect(init?.method).toBe('POST');
        return new Response(JSON.stringify({ Id: 45, Name: 'Renata' }), { status: 201 });
      }
      if (url.endsWith('/Deals')) {
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toMatchObject({ ContactId: 45, PipelineId: 9 });
        return new Response(JSON.stringify({ Id: 77 }), { status: 201 });
      }
      throw new Error(`Requisição inesperada: ${url}`);
    });

    await expect(new PloomesClient('secret-key', fetcher).syncCommercialLead({
      protocolReference: 'LFE-20261014-1234ABCD', service: 'Manutenção', contactName: 'Renata',
      phone: '79999999999', location: 'Aracaju', timeline: 'Esta semana', need: 'Revisar chiller',
    })).resolves.toEqual({ contactId: 45, dealId: 77, pipelineId: 9 });
  });
});
