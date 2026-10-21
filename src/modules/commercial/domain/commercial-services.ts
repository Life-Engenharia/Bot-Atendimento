export const commercialServices = [
  'Limpeza de dutos',
  'PMOC',
  'Assistência avulsa',
  'Projetos',
  'Engenharia clínica',
  'Locação de chillers',
  'Chiller novo',
  'Banco de sangue',
  'Calibração de equipamentos e instrumentos de medição',
  'Outro serviço',
] as const;

export function commercialServiceMenu(): string {
  const options = commercialServices.map((service, index) => `${index + 1}. ${service}`);
  return `Qual serviço você está procurando?\n\n${options.join('\n')}`;
}

export function commercialServiceByOption(value: string): string | undefined {
  const input = value.trim().replace(/^\s*(?:opção|opcao)\s*/i, '');
  const numeric = input.match(/^([0-9]{1,2})(?:\s*[.)-]|\s|$)/);
  const option = numeric ? Number(numeric[1]) : Number.NaN;
  if (Number.isInteger(option) && option >= 1 && option <= commercialServices.length)
    return commercialServices[option - 1];
  let normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('pt-BR');
  for (let index = 0; index < 3; index += 1) {
    normalized = normalized
      .replace(/^(?:eu quero|quero contratar|quero|preciso de|preciso|gostaria de|tenho interesse em|solicito|contratar|orcamento de|servico de)\s+/, '')
      .replace(/\s+(?:por favor|obrigado|obrigada)\.?$/, '')
      .trim();
  }
  if (/assistencia.*avulsa/.test(normalized)) return 'Assistência avulsa';
  if (normalized.length < 3) return undefined;
  return commercialServices.find((service) => {
    const name = service
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('pt-BR');
    return name === normalized || name.startsWith(normalized) || normalized.startsWith(name);
  });
}
