const PLOOMES_API_URL = 'https://public-api2.ploomes.com';

export type PloomesAccount = {
  Id: number;
  Name: string;
};

export type PloomesOption = { Id: number; Name: string };
type PloomesList<T> = { value: T[] };
export type PloomesDeal = Record<string, unknown> & {
  Id?: number;
  Amount?: number | string;
  StageId?: number;
  StatusId?: number;
  Stage?: { Name?: string };
  Status?: { Name?: string };
};
export type PloomesContact = Record<string, unknown> & { Id?: number; Name?: string };

export type PloomesMetrics = {
  totalDeals: number;
  totalAmount: number;
  byStage: Array<{ label: string; count: number }>;
  byStatus: Array<{ label: string; count: number }>;
  sampledAt: string;
};

export type PloomesOverview = {
  account?: PloomesAccount;
  pipelines: PloomesOption[];
  users: PloomesOption[];
  deals: PloomesDeal[];
  contacts: PloomesContact[];
  metrics: PloomesMetrics;
  sources: Record<'account' | 'pipelines' | 'users' | 'deals' | 'contacts', 'ok' | 'unavailable'>;
};

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

  async getCommercialMetrics(): Promise<PloomesMetrics> {
    return this.createMetrics(await this.listRecentDeals());
  }

  /**
   * Consulta segura para o painel: os recursos disponíveis na integração
   * comercial (conta, funis, usuários, clientes e oportunidades recentes) são
   * consultados isoladamente. Se um recurso não estiver autorizado no CRM,
   * os demais continuam visíveis no painel.
   */
  async getCommercialOverview(): Promise<PloomesOverview> {
    const [account, pipelines, users, deals, contacts] = await Promise.allSettled([
      this.getAccount(),
      this.listPipelines(),
      this.listUsers(),
      this.listRecentDeals(),
      this.listRecentContacts(),
    ]);
    const value = <T>(result: PromiseSettledResult<T>, fallback: T) =>
      result.status === 'fulfilled' ? result.value : fallback;
    const recentDeals = value(deals, [] as PloomesDeal[]);
    return {
      account: value(account, undefined),
      pipelines: value(pipelines, [] as PloomesOption[]),
      users: value(users, [] as PloomesOption[]),
      deals: recentDeals,
      contacts: value(contacts, [] as PloomesContact[]),
      metrics: this.createMetrics(recentDeals),
      sources: {
        account: account.status === 'fulfilled' ? 'ok' : 'unavailable',
        pipelines: pipelines.status === 'fulfilled' ? 'ok' : 'unavailable',
        users: users.status === 'fulfilled' ? 'ok' : 'unavailable',
        deals: deals.status === 'fulfilled' ? 'ok' : 'unavailable',
        contacts: contacts.status === 'fulfilled' ? 'ok' : 'unavailable',
      },
    };
  }

  private async listRecentDeals(): Promise<PloomesDeal[]> {
    // Leitura limitada e ordenada: preserva desempenho e a User-Key nunca sai do servidor.
    const query = new URLSearchParams({ $top: '100', $orderby: 'Id desc' });
    const response = await this.request<PloomesList<PloomesDeal>>(`Deals?${query}`);
    return response.value ?? [];
  }

  private async listRecentContacts(): Promise<PloomesContact[]> {
    const query = new URLSearchParams({ $top: '100', $orderby: 'Id desc' });
    const response = await this.request<PloomesList<PloomesContact>>(`Contacts?${query}`);
    return response.value ?? [];
  }

  private createMetrics(deals: PloomesDeal[]): PloomesMetrics {
    const group = (resolve: (deal: PloomesDeal) => string) =>
      [...deals.reduce((map, deal) => map.set(resolve(deal), (map.get(resolve(deal)) ?? 0) + 1), new Map<string, number>())]
        .map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
    return {
      totalDeals: deals.length,
      totalAmount: deals.reduce((sum, deal) => sum + (Number(deal.Amount) || 0), 0),
      byStage: group((deal) => deal.Stage?.Name ?? (deal.StageId ? `Etapa ${deal.StageId}` : 'Etapa não informada')),
      byStatus: group((deal) => deal.Status?.Name ?? (deal.StatusId ? `Status ${deal.StatusId}` : 'Status não informado')),
      sampledAt: new Date().toISOString(),
    };
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
