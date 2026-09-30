import { z } from 'zod';

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    WHATSAPP_VERIFY_TOKEN: z.string().min(8).default('local-development-token'),
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_API: z.string().min(1).optional(),
    META_ACCESS_TOKEN: z.string().min(1).optional(),
    WHATSAPP_PHONE_NUMBER_ID: z.string().regex(/^\d+$/).optional(),
    WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().regex(/^\d+$/).optional(),
    ADMIN_PHONE_E164: z.string().regex(/^\d+$/).optional(),
  })
  .superRefine((value, context) => {
    if (Boolean(value.SUPABASE_URL) !== Boolean(value.SUPABASE_API)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SUPABASE_URL e SUPABASE_API devem ser configuradas juntas.',
      });
    }
    const metaValues = [
      value.META_ACCESS_TOKEN,
      value.WHATSAPP_PHONE_NUMBER_ID,
      value.WHATSAPP_BUSINESS_ACCOUNT_ID,
    ];
    if (metaValues.some(Boolean) && !metaValues.every(Boolean)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'META_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID e WHATSAPP_BUSINESS_ACCOUNT_ID devem ser configuradas juntas.',
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  return environmentSchema.parse(source);
}
