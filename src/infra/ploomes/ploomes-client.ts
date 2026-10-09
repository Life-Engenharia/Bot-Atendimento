const PLOOMES_API_URL = 'https://public-api2.ploomes.com';

export type PloomesAccount = {
  Id: number;
  Name: string;
};

export type PloomesOption = { Id: number; Name: string };
type PloomesList<T> = { value: T[] };

export class PloomesClient {
  constructor(
    private readonly userKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async getAccount(): Promise<PloomesAccount> {
    return this.request<PloomesAccount>('Account');
  }

  async listPipelines(): Promise<PloomesOption[]> {
    return this.list('Deals@Pipelines');
  }

  async listUsers(): Promise<PloomesOption[]> {
    return this.list('Users');
  }

  /**
   * A homologação da Life possui um único funil comercial utilizável. Não
   * escolhemos o primeiro de uma lista ambígua: se o CRM expuser mais de um,
   * a seleção precisa ser aprovada no painel antes de criar oportunidades.
   */
  async getActiveCommercialPipeline(): Promise<PloomesOption> {
    const pipelines = await this.listPipelines();
    if (pipelines.length === 1) return pipelines[0];
    if (pipelines.length === 0) throw new Error('Nenhum funil comercial foi encontrado no Ploomes.');
    throw new Error('Há mais de um funil no Ploomes; configure explicitamente o funil comercial ativo.');
  }

  private async list(path: string): Promise<PloomesOption[]> {
    const query = new URLSearchParams({ $top: '100', $select: 'Id,Name' });
    const response = await this.request<PloomesList<PloomesOption>>(`${path}?${query}`);
    return response.value;
  }

  private async request<T>(path: string): Promise<T> {
    const response = await this.fetcher(`${PLOOMES_API_URL}/${path}`, {
      headers: {
        'Content-Type': 'application/json',
        'User-Key': this.userKey,
      },
    });
    if (!response.ok) throw new Error(`Ploomes respondeu ${response.status} ao consultar ${path}.`);
    return (await response.json()) as T;
  }
}
