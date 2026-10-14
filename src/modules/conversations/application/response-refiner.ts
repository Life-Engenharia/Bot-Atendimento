/** Texto opcionalmente refinado por IA, sem autoridade sobre decisões do fluxo. */
export interface ResponseRefiner {
  refine(reply: string, latestCustomerMessage: string): Promise<string>;
}
