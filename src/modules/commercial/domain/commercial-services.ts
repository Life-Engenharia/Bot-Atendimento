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
  return commercialServices[Number(value) - 1];
}
