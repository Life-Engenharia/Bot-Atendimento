export type AuditEvent = {
  id: string;
  event: string;
  actor: string;
  protocolId?: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
};

export class InMemoryAuditLog {
  private readonly events: AuditEvent[] = [];

  append(input: Omit<AuditEvent, 'id' | 'occurredAt'>): AuditEvent {
    const event: AuditEvent = {
      ...input,
      id: crypto.randomUUID(),
      occurredAt: new Date(),
    };

    this.events.push(event);
    return event;
  }

  all(): readonly AuditEvent[] {
    return this.events;
  }
}
