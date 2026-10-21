import { describe, expect, it, vi } from 'vitest';
import { OpenAiResponseRefiner } from '../../src/infra/openai/openai-response-refiner.js';

describe('OpenAiResponseRefiner', () => {
  it('uses a structured, non-persistent Responses request to improve only the wording', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: '{"reply":"Recebi sua atualização. A equipe seguirá com você por aqui."}',
        }),
        { status: 200 },
      ),
    );
    const refiner = new OpenAiResponseRefiner('api-key', 'model-id', fetcher);

    await expect(
      refiner.refine('Sua solicitação está registrada.', 'Muito obrigado'),
    ).resolves.toBe('Recebi sua atualização. A equipe seguirá com você por aqui.');

    const request = fetcher.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(request.body));
    expect(payload).toMatchObject({ model: 'model-id', store: false });
    expect(payload.text.format).toMatchObject({ type: 'json_schema', strict: true });
    expect(payload.instructions).toContain('Nunca ofereça diagnóstico');
  });
});
