import { describe, expect, it, vi } from 'vitest';
import { OpenAiTriageClient } from '../../src/infra/openai/openai-triage-client.js';

describe('OpenAiTriageClient', () => {
  it('sends only the message and requests structured route classification', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ output_text: '{"route":"commercial","confidence":0.94}' }), {
        status: 200,
      }),
    );
    const client = new OpenAiTriageClient('api-key', 'model-id', fetcher);

    await expect(client.classify('Preciso de um orçamento')).resolves.toEqual({
      route: 'commercial',
      confidence: 0.94,
    });
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.openai.com/v1/responses',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer api-key' }),
      }),
    );
  });
});
