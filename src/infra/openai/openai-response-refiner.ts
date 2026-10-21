import { ResponseRefiner } from '../../modules/conversations/application/response-refiner.js';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

type OpenAiResponse = { output_text?: string };

/**
 * Humaniza confirmações já decididas pelo sistema. Este adaptador nunca recebe
 * autoridade para escolher rota, prioridade, preço, prazo ou orientação técnica.
 */
export class OpenAiResponseRefiner implements ResponseRefiner {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fetcher: typeof fetch = fetch,
  ) { }

  async refine(reply: string, latestCustomerMessage: string): Promise<string> {
    const response = await this.fetcher(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(3_000),
      body: JSON.stringify({
        model: this.model,
        store: false,
        instructions: [
          'Você revisa somente o tom de uma mensagem pronta da Life Engenharia, em português do Brasil.',
          'Devolva uma única mensagem curta, acolhedora e profissional.',
          'Preserve todos os fatos da mensagem pronta e não acrescente fatos.',
          'Nunca ofereça diagnóstico, preço, prazo, desconto, disponibilidade, instrução técnica ou orientação de segurança.',
          'Não altere protocolo, prioridade, rota, decisão humana ou dados do cliente.',
          'Não mencione que é IA.',
        ].join('\n'),
        input: `Mensagem recente do cliente:\n${latestCustomerMessage.slice(0, 600)}\n\nMensagem pronta a revisar:\n${reply.slice(0, 1_500)}`,
        text: {
          format: {
            type: 'json_schema',
            name: 'refined_customer_reply',
            strict: true,
            schema: {
              type: 'object',
              properties: { reply: { type: 'string', minLength: 1, maxLength: 1_800 } },
              required: ['reply'],
              additionalProperties: false,
            },
          },
        },
      }),
    });
    if (!response.ok) throw new Error(`OpenAI respondeu ${response.status} ao refinar a mensagem.`);
    const body = (await response.json()) as OpenAiResponse;
    const parsed = JSON.parse(body.output_text ?? '') as { reply?: unknown };
    if (typeof parsed.reply !== 'string' || !parsed.reply.trim())
      throw new Error('A OpenAI não retornou uma resposta válida.');
    return parsed.reply.trim();
  }
}
