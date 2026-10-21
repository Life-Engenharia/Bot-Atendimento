import {
  TriageAnalysis,
  TriageAnalyzer,
} from '../../modules/conversations/application/triage-analyzer.js';
import { buildTriageInstructions } from '../../modules/conversations/application/prompts/triage-prompt.js';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

type OpenAiResponse = {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
};

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
        instructions: buildTriageInstructions(),
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
    const outputText =
      body.output_text ??
      body.output
        ?.flatMap((item) => item.content ?? [])
        .filter((item) => item.type === 'output_text')
        .map((item) => item.text ?? '')
        .join('');
    if (!outputText?.trim())
      throw new Error(
        'A OpenAI não retornou texto para a classificação. Verifique o modelo configurado.',
      );
    const analysis = JSON.parse(outputText) as TriageAnalysis;
    if (!['commercial', 'technical', 'human'].includes(analysis.route))
      throw new Error('A OpenAI retornou uma rota inválida.');
    if (!Number.isFinite(analysis.confidence) || analysis.confidence < 0 || analysis.confidence > 1)
      throw new Error('A OpenAI retornou uma confiança inválida.');
    return analysis;
  }
}
