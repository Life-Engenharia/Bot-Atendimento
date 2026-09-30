import {
  TriageAnalysis,
  TriageAnalyzer,
} from '../../modules/conversations/application/triage-analyzer.js';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

type OpenAiResponse = { output_text?: string };

export class OpenAiTriageClient implements TriageAnalyzer {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async classify(message: string): Promise<TriageAnalysis> {
    const response = await this.fetcher(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        store: false,
        instructions:
          'Classifique somente a intenção da mensagem para o atendimento da Life Engenharia. ' +
          'Rotas possíveis: commercial para orçamento, contratação ou serviço avulso; ' +
          'technical para assistência de cliente existente; human para pedido de pessoa, risco, ' +
          'ambiguidade ou qualquer caso sem certeza. Não responda ao cliente.',
        input: message.slice(0, 1_000),
        text: {
          format: {
            type: 'json_schema',
            name: 'triage_route',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                route: { type: 'string', enum: ['commercial', 'technical', 'human'] },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
              },
              required: ['route', 'confidence'],
              additionalProperties: false,
            },
          },
        },
      }),
    });
    if (!response.ok) throw new Error(`OpenAI respondeu ${response.status} na classificação.`);
    const body = (await response.json()) as OpenAiResponse;
    const analysis = JSON.parse(body.output_text ?? '') as TriageAnalysis;
    if (!['commercial', 'technical', 'human'].includes(analysis.route))
      throw new Error('A OpenAI retornou uma rota inválida.');
    if (!Number.isFinite(analysis.confidence) || analysis.confidence < 0 || analysis.confidence > 1)
      throw new Error('A OpenAI retornou uma confiança inválida.');
    return analysis;
  }
}
