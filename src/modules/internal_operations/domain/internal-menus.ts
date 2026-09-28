export type InternalRole = "commercial" | "technical" | "on_call" | "backup" | "coordination" | "administration";

const optionsByRole: Record<InternalRole, readonly string[]> = {
  commercial: ["Meus leads", "Novas oportunidades", "Responder cliente", "Atualizar oportunidade", "Transferir"],
  technical: ["Meus chamados", "Fila técnica autorizada", "Ver anexos", "Responder cliente", "Registrar ação", "Transferir"],
  on_call: ["Alertas críticos", "Confirmar P1/P2", "Meus chamados", "Acionar backup", "Registrar ação"],
  backup: ["Casos escalados", "Assumir", "Indisponibilidade", "Ver resumo", "Responder cliente"],
  coordination: ["Fila técnica", "P1/P2 pendentes", "Designar responsável", "Transferir", "Histórico", "Encerrar"],
  administration: ["Equipes", "Números autorizados", "Escalas", "Backups", "Auditoria", "Incidentes"]
};

export function internalMenuFor(role: InternalRole): string {
  const title: Record<InternalRole, string> = {
    commercial: "Menu Comercial",
    technical: "Menu Assistência Técnica",
    on_call: "Menu Plantão",
    backup: "Menu Backup",
    coordination: "Menu Coordenação",
    administration: "Menu Administração"
  };

  return `${title[role]}\n\n${optionsByRole[role].map((option, index) => `${index + 1}. ${option}`).join("\n")}`;
}
