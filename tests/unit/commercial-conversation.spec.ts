import { describe, expect, it } from "vitest";
import { InMemoryAuditLog } from "../../src/modules/audit/audit-log.js";
import { CommercialConversationService } from "../../src/modules/commercial/application/commercial-conversation-service.js";

describe("commercial conversation", () => {
  it("collects required fields, creates a summary and queues a local protocol", () => {
    const auditLog = new InMemoryAuditLog();
    const service = new CommercialConversationService(auditLog);
    const conversation = service.start("+5511999999999");

    service.acceptConsent(conversation.id);
    expect(service.selectCommercialRoute(conversation.id).question).toBe("Qual serviço você está procurando?");

    ["PMOC", "Ana Silva", "Clínica Alfa", "São Paulo - Unidade Norte", "+5511999999999", "até 7 dias", "Preciso revisar o plano mensal."].forEach((answer) => {
      service.answer(conversation.id, answer);
    });

    expect(service.summary(conversation.id)).toMatchObject({ service: "PMOC", company: "Clínica Alfa" });
    const queued = service.confirm(conversation.id);

    expect(queued).toMatchObject({ state: "QUEUED", protocolId: "LFE-000001" });
    expect(auditLog.all().at(-1)).toMatchObject({ event: "commercial.protocol_queued", protocolId: "LFE-000001" });
  });
});
