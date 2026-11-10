import { describe, expect, it } from 'vitest';
import { columnOf, isDue, priorityOf, type Conversation } from './domain';

const base: Conversation = { id: 'x', contactPhone: '55', state: 'open', updatedAt: new Date(0).toISOString() };
const now = Date.parse('2026-01-01T12:00:00Z');

describe('regras do quadro', () => {
  it('prioridade vem do suggestedPriority', () => {
    expect(priorityOf({ ...base, suggestedPriority: 'p1' })?.limit).toBe(15);
    expect(priorityOf(base)).toBeNull();
  });

  it('coluna segue estado, retorno, responsável e rota', () => {
    expect(columnOf({ ...base, state: 'closed' })).toBe('closed');
    expect(columnOf({ ...base, followUpAt: '2026-01-02T00:00:00Z' })).toBe('followup');
    expect(columnOf({ ...base, assignedOperator: 'A' })).toBe('active');
    expect(columnOf({ ...base, route: 'commercial' })).toBe('lead');
    expect(columnOf(base)).toBe('waiting');
  });

  it('atrasado quando passou do prazo da prioridade e sem responsável', () => {
    const old = new Date(now - 20 * 60_000).toISOString();
    expect(isDue({ ...base, suggestedPriority: 'P1', updatedAt: old }, now)).toBe(true);
    expect(isDue({ ...base, suggestedPriority: 'P3', updatedAt: old }, now)).toBe(false);
    expect(isDue({ ...base, suggestedPriority: 'P1', updatedAt: old, assignedOperator: 'A' }, now)).toBe(false);
  });
});
