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

export type CommercialLeadForPloomes = {
  protocolReference: string;
  service: string;
  contactName: string;
  company?: string;
  cnpj?: string;
  phone?: string;
  email?: string;
  location: string;
  timeline: string;
  need: string;
};

export type PloomesSyncResult = {
  contactId: number;
  dealId: number;
  pipelineId: number;
};

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
    if (pipelines.length === 0)
      throw new Error('Nenhum funil comercial foi encontrado no Ploomes.');
    throw new Error(
      'Há mais de um funil no Ploomes; configure explicitamente o funil comercial ativo.',
    );
  }

  async getCommercialMetrics(): Promise<PloomesMetrics> {
    return this.createMetrics(await this.listRecentDeals());
  }

  /**
   * Cria o contato e a oportunidade somente depois de encontrar um funil
   * inequívoco. Não tentamos adivinhar o funil: isso evita lançar uma proposta
   * no processo comercial errado durante a homologação.
   */
  async syncCommercialLead(lead: CommercialLeadForPloomes): Promise<PloomesSyncResult> {
    const pipeline = await this.getActiveCommercialPipeline();
    const contact = await this.findExistingContact(lead);
    const contactId = contact?.Id ?? (await this.createContact(lead)).Id;
    if (!contactId) throw new Error('O Ploomes não retornou o identificador do contato criado.');

    const deal = await this.createDeal(lead, contactId, pipeline.Id);
    if (!deal.Id) throw new Error('O Ploomes não retornou o identificador da oportunidade criada.');
    return { contactId, dealId: deal.Id, pipelineId: pipeline.Id };
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

  async searchContacts(search: string): Promise<PloomesContact[]> {
    const value = search.trim();
    if (value.length < 2) return [];
    const document = normalizeDocument(value);
    if (document && document.length >= 11) {
      const found = new Map<number, PloomesContact>();
      for (const field of ['CNPJ', 'Register', 'CPF']) {
        const query = new URLSearchParams({
          $top: '25',
          $filter: `${field} eq '${document}'`,
        });
        const response = await this.request<PloomesList<PloomesContact>>(`Contacts?${query}`);
        for (const contact of response.value ?? []) if (contact.Id) found.set(contact.Id, contact);
      }
      if (found.size) return [...found.values()];
    }
    const escaped = value.replace(/'/g, "''");
    const filter = `contains(Name,'${escaped}') or contains(LegalName,'${escaped}') or contains(Email,'${escaped}') or contains(Phone,'${escaped}')`;
    try {
      const query = new URLSearchParams({ $top: '100', $orderby: 'Id desc', $filter: filter });
      const response = await this.request<PloomesList<PloomesContact>>(`Contacts?${query}`);
      if (response.value?.length) return response.value;
    } catch {
      // Contas sem suporte à busca textual continuam consultáveis pelos registros recentes.
    }
    const recent = await this.listRecentContacts();
    const normalized = normalizeIdentity(value) ?? '';
    return recent.filter((contact) => {
      const fields = [contact.Name, contact.LegalName, contact.Register, contact.CNPJ, contact.CPF, contact.Email];
      return fields.some((field) => (normalizeIdentity(String(field ?? '')) ?? '').includes(normalized));
    });
  }

  async listContacts(): Promise<PloomesContact[]> {
    return this.listRecentContacts();
  }

  async createCustomer(input: {
    name: string;
    company?: string;
    document?: string;
    phone?: string;
    email?: string;
  }): Promise<PloomesContact> {
    const document = normalizeDocument(input.document);
    if (document) {
      const existing = await this.findContactByDocument(document);
      if (existing) throw new Error('Já existe um cadastro no Ploomes com esse CPF/CNPJ.');
    }
    return this.request<PloomesContact>('Contacts', {
      method: 'POST',
      body: JSON.stringify({
        Name: input.name.trim(),
        LegalName: input.company?.trim() || undefined,
        CompanyName: input.company?.trim() || undefined,
        Register: document,
        CNPJ: document,
        Phone: input.phone?.trim() || undefined,
        Email: input.email?.trim() || undefined,
      }),
    });
  }

  async findContactByDocument(documentValue: string): Promise<PloomesContact | undefined> {
    const document = normalizeDocument(documentValue);
    if (!document) return undefined;
    for (const field of ['CNPJ', 'Register', 'CPF']) {
      const query = new URLSearchParams({ $top: '2', $filter: `${field} eq '${document}'` });
      const response = await this.request<PloomesList<PloomesContact>>(`Contacts?${query}`);
      const match = response.value?.find((contact) =>
        [contact.CNPJ, contact.Register, contact.CPF].map((value) => normalizeDocument(value)).includes(document),
      );
      if (match) return match;
    }
    return undefined;
  }

  async listContactFields(): Promise<Array<Record<string, unknown>>> {
    const query = new URLSearchParams({ $top: '500' });
    const response = await this.request<PloomesList<Record<string, unknown>>>(`Fields?${query}`);
    return (response.value ?? []).filter((field) => field.EntityId === 15);
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

  private async findExistingContact(
    lead: CommercialLeadForPloomes,
  ): Promise<PloomesContact | undefined> {
    // O Ploomes permite filtrar o cadastro inteiro por documento. Isso evita
    // depender apenas dos 100 contatos mais recentes e, principalmente,
    // impede duplicar uma empresa já cadastrada há mais tempo.
    const document = normalizeDocument(lead.cnpj);
    if (document) {
      for (const field of ['CNPJ', 'Register', 'CPF']) {
        const query = new URLSearchParams({
          $top: '2',
          $filter: `${field} eq '${document}'`,
        });
        const response = await this.request<PloomesList<PloomesContact>>(
          `Contacts?${query}`,
        );
        const match = response.value?.find((contact) =>
          [contact.CNPJ, contact.Register, contact.CPF]
            .map((value) => normalizeDocument(value))
            .includes(document),
        );
        if (match) return match;
      }
    }
    const contacts = await this.listRecentContacts();
    const normalizedPhone = normalizeIdentity(lead.phone);
    const normalizedEmail = lead.email?.trim().toLocaleLowerCase('pt-BR');
    const normalizedName = normalizeIdentity(lead.contactName);
    return contacts.find((contact) => {
      const values = Object.values(contact).filter(
        (value): value is string => typeof value === 'string',
      );
      return values.some(
        (value) =>
          (normalizedPhone && normalizeIdentity(value) === normalizedPhone) ||
          (normalizedEmail && value.trim().toLocaleLowerCase('pt-BR') === normalizedEmail) ||
          (normalizedName && normalizeIdentity(contact.Name) === normalizedName),
      );
    });
  }

  private async createContact(lead: CommercialLeadForPloomes): Promise<PloomesContact> {
    return this.request<PloomesContact>('Contacts', {
      method: 'POST',
      body: JSON.stringify({
        Name: lead.contactName,
        LegalName: lead.company || undefined,
        CompanyName: lead.company || undefined,
        Register: lead.cnpj ? normalizeDocument(lead.cnpj) : undefined,
        CNPJ: lead.cnpj ? normalizeDocument(lead.cnpj) : undefined,
        Phone: lead.phone || undefined,
        Email: lead.email || undefined,
      }),
    });
  }

  private async createDeal(
    lead: CommercialLeadForPloomes,
    contactId: number,
    pipelineId: number,
  ): Promise<PloomesDeal> {
    const title = `[${lead.protocolReference}] ${lead.service} — ${lead.contactName}`.slice(0, 250);
    return this.request<PloomesDeal>('Deals', {
      method: 'POST',
      body: JSON.stringify({
        Title: title,
        ContactId: contactId,
        PipelineId: pipelineId,
        Description: [
          `Protocolo Life: ${lead.protocolReference}`,
          `Serviço: ${lead.service}`,
          `Local: ${lead.location}`,
          `Prazo: ${lead.timeline}`,
          `Necessidade: ${lead.need}`,
          lead.company ? `Empresa: ${lead.company}` : undefined,
          lead.cnpj ? `CNPJ: ${lead.cnpj}` : undefined,
        ]
          .filter(Boolean)
          .join('\n'),
      }),
    });
  }

  private createMetrics(deals: PloomesDeal[]): PloomesMetrics {
    const group = (resolve: (deal: PloomesDeal) => string) =>
      [
        ...deals.reduce(
          (map, deal) => map.set(resolve(deal), (map.get(resolve(deal)) ?? 0) + 1),
          new Map<string, number>(),
        ),
      ]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);
    return {
      totalDeals: deals.length,
      totalAmount: deals.reduce((sum, deal) => sum + (Number(deal.Amount) || 0), 0),
      byStage: group(
        (deal) =>
          deal.Stage?.Name ?? (deal.StageId ? `Etapa ${deal.StageId}` : 'Etapa não informada'),
      ),
      byStatus: group(
        (deal) =>
          deal.Status?.Name ?? (deal.StatusId ? `Status ${deal.StatusId}` : 'Status não informado'),
      ),
      sampledAt: new Date().toISOString(),
    };
  }

  private async list(path: string): Promise<PloomesOption[]> {
    const query = new URLSearchParams({ $top: '100', $select: 'Id,Name' });
    const response = await this.request<PloomesList<PloomesOption>>(`${path}?${query}`);
    return response.value;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(`${PLOOMES_API_URL}/${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'User-Key': this.userKey,
        ...init.headers,
      },
    });
    if (!response.ok) throw new Error(`Ploomes respondeu ${response.status} ao acessar ${path}.`);
    return (await response.json()) as T;
  }
}

function normalizeIdentity(value?: string): string | undefined {
  const normalized = value?.replace(/[^a-zA-Z0-9]/g, '').toLocaleLowerCase('pt-BR');
  return normalized || undefined;
}

function normalizeDocument(value?: unknown): string | undefined {
  const normalized = String(value ?? '').replace(/\D/g, '');
  return normalized || undefined;
}
