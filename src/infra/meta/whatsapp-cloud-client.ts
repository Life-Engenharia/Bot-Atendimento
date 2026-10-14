export type WhatsAppPhoneProfile = {
  id: string;
  display_phone_number: string;
  verified_name?: string;
  quality_rating?: string;
};

export type DownloadedWhatsAppMedia = {
  content: Uint8Array;
  mimeType?: string;
  fileName?: string;
};

export class WhatsAppCloudClient {
  constructor(
    private readonly accessToken: string,
    private readonly phoneNumberId: string,
    private readonly graphVersion = 'v26.0',
  ) { }

  async getPhoneProfile(): Promise<WhatsAppPhoneProfile> {
    const url = new URL(`https://graph.facebook.com/${this.graphVersion}/${this.phoneNumberId}`);
    url.searchParams.set('fields', 'id,display_phone_number,verified_name,quality_rating');
    const response = await this.fetch(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Meta WhatsApp API request failed (${response.status}).`);
    return (await response.json()) as WhatsAppPhoneProfile;
  }

  async sendText(to: string, body: string): Promise<{ messageId: string }> {
    if (!/^\d{8,15}$/.test(to))
      throw new Error('O destinatário deve estar em formato E.164, apenas dígitos e sem +.');
    const response = await this.fetch(
      `https://graph.facebook.com/${this.graphVersion}/${this.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) throw new Error(`Meta WhatsApp API request failed (${response.status}).`);
    const result = (await response.json()) as { messages?: Array<{ id?: string }> };
    const messageId = result.messages?.[0]?.id;
    if (!messageId) throw new Error('A Meta não retornou o ID da mensagem enviada.');
    return { messageId };
  }

  async sendTemplate(
    to: string,
    name: string,
    languageCode = 'en_US',
  ): Promise<{ messageId: string }> {
    if (!/^\d{8,15}$/.test(to))
      throw new Error('O destinatário deve estar em formato E.164, apenas dígitos e sem +.');
    const response = await this.fetch(
      `https://graph.facebook.com/${this.graphVersion}/${this.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: { name, language: { code: languageCode } },
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) throw new Error(`Meta WhatsApp API request failed (${response.status}).`);
    const result = (await response.json()) as { messages?: Array<{ id?: string }> };
    const messageId = result.messages?.[0]?.id;
    if (!messageId) throw new Error('A Meta não retornou o ID do template enviado.');
    return { messageId };
  }

  async downloadMedia(mediaId: string): Promise<DownloadedWhatsAppMedia> {
    const metadataResponse = await this.fetch(`https://graph.facebook.com/${this.graphVersion}/${mediaId}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` }, signal: AbortSignal.timeout(15_000),
    });
    if (!metadataResponse.ok) throw new Error(`Meta não retornou a mídia (${metadataResponse.status}).`);
    const metadata = await metadataResponse.json() as { url?: string; mime_type?: string; file_size?: number };
    if (!metadata.url) throw new Error('A Meta não retornou a URL da mídia.');
    if (metadata.file_size && metadata.file_size > 10 * 1024 * 1024)
      throw new Error('A mídia excede o limite privado de 10 MB do piloto.');
    const contentResponse = await this.fetch(metadata.url, {
      headers: { Authorization: `Bearer ${this.accessToken}` }, signal: AbortSignal.timeout(30_000),
    });
    if (!contentResponse.ok) throw new Error(`Não foi possível baixar a mídia da Meta (${contentResponse.status}).`);
    const content = new Uint8Array(await contentResponse.arrayBuffer());
    if (content.byteLength > 10 * 1024 * 1024) throw new Error('A mídia excede o limite privado de 10 MB do piloto.');
    return { content, mimeType: metadata.mime_type ?? contentResponse.headers.get('content-type') ?? undefined };
  }

  private async fetch(url: string | URL, init: RequestInit): Promise<Response> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await fetch(url, init);
      } catch (error) {
        const code =
          error instanceof TypeError &&
            error.cause &&
            typeof error.cause === 'object' &&
            'code' in error.cause
            ? String(error.cause.code)
            : undefined;
        const transient = code === 'EAI_AGAIN' || code === 'UND_ERR_CONNECT_TIMEOUT';
        if (!transient || attempt === 2) {
          if (transient) {
            throw new Error(
              'A conexão com graph.facebook.com falhou após três tentativas. Verifique DNS, firewall ou proxy e tente novamente.',
              { cause: error },
            );
          }
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 500));
      }
    }
    throw new Error('Falha inesperada ao conectar à Meta.');
  }
}
