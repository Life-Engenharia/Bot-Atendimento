import { BusinessRuleError } from '../../../shared/domain/errors.js';

export const commercialFields = [
  'service',
  'name',
  'company',
  'location',
  'phone',
  'timeline',
  'need',
] as const;

export type CommercialField = (typeof commercialFields)[number];
export type CommercialState = 'CONSENT' | 'ROUTE' | 'COLLECTING' | 'REVIEW' | 'QUEUED';

export type CommercialRequest = Record<CommercialField, string> & {
  email?: string;
};

export type CommercialConversation = {
  id: string;
  customerPhone: string;
  state: CommercialState;
  values: Partial<CommercialRequest>;
  protocolId?: string;
};

const questions: Record<CommercialField, string> = {
  service: 'Qual serviço você está procurando?',
  name: 'Para eu te atender melhor, qual é o seu nome?',
  company: 'Qual é o nome da empresa ou instituição?',
  location: 'Em qual cidade e unidade será o atendimento?',
  phone: 'Qual telefone você prefere para retorno?',
  timeline: 'Para quando você precisa desse serviço?',
  need: 'Me conte, por favor, um pouco mais sobre o que você precisa.',
};

export function nextCommercialField(
  values: Partial<CommercialRequest>,
): CommercialField | undefined {
  return commercialFields.find((field) => !values[field]);
}

export function questionFor(values: Partial<CommercialRequest>): string | undefined {
  const field = nextCommercialField(values);
  return field ? questions[field] : undefined;
}

export function assertCommercialValue(field: CommercialField, value: string): void {
  if (!value.trim()) {
    throw new BusinessRuleError('O campo comercial obrigatório não pode ficar vazio.');
  }

  if (field === 'need' && value.length > 1000) {
    throw new BusinessRuleError('A necessidade deve ter no máximo 1000 caracteres.');
  }
}
