import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  isValidMetaSignature,
  normalizeMetaWebhook,
} from '../../src/infra/meta/whatsapp-cloud-adapter.js';

describe('WhatsApp Cloud adapter', () => {
  it('validates a Meta signature without accepting a modified payload', () => {
    const body = Buffer.from('{"object":"whatsapp_business_account"}');
    const secret = 'meta-app-secret';
    const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

    expect(isValidMetaSignature(body, signature, secret)).toBe(true);
    expect(isValidMetaSignature(Buffer.from('modified'), signature, secret)).toBe(false);
  });

  it('normalizes text messages and ignores incomplete events', () => {
    expect(
      normalizeMetaWebhook({
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    { id: 'wamid.1', from: '5511999999999', text: { body: 'Olá' } },
                    { id: 'incomplete' },
                  ],
                },
              },
            ],
          },
        ],
      }),
    ).toEqual([{ id: 'wamid.1', from: '5511999999999', text: 'Olá' }]);
  });

  it('normalizes image, audio, video and document references without exposing binary data', () => {
    const messages = normalizeMetaWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid.media',
                    from: '5511999999999',
                    image: {
                      id: 'media-image',
                      mime_type: 'image/jpeg',
                      caption: 'Painel do chiller',
                    },
                    document: {
                      id: 'media-document',
                      mime_type: 'application/pdf',
                      filename: 'laudo.pdf',
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(messages).toEqual([
      {
        id: 'wamid.media',
        from: '5511999999999',
        text: 'Painel do chiller',
        media: [
          {
            id: 'media-image',
            type: 'image',
            mimeType: 'image/jpeg',
            caption: 'Painel do chiller',
            sha256: undefined,
            fileName: undefined,
          },
          {
            id: 'media-document',
            type: 'document',
            mimeType: 'application/pdf',
            fileName: 'laudo.pdf',
            caption: undefined,
            sha256: undefined,
          },
        ],
      },
    ]);
  });
});
