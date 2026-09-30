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
