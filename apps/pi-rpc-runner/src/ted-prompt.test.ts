// ─────────────────────────────────────────────────────────────────────────────
// Pi RPC Runner - TED Prompt Builder tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, test } from 'vitest';
import { buildTedPrompt, formatCurrency, parseCurrency } from './ted-prompt.js';

describe('Pi RPC Runner - TED Prompt Builder', () => {
  test('includes TED persona in prompt', () => {
    const result = buildTedPrompt({
      userMessage: 'gastei 50 mercado',
      householdId: 'test-household',
      source: 'whatsapp',
    });
    
    expect(result).toContain('TED');
    expect(result).toContain('agente financeiro');
  });

  test('includes anti-lie rule', () => {
    const result = buildTedPrompt({
      userMessage: 'transferir 100 inter para nubank',
      householdId: 'test-household',
    });
    
    // Check for anti-lie rule text (NUNCA + confirmation)
    expect(result).toMatch(/NUNCA.*fez/);
    expect(result).toContain('confirmação da tool');
  });

  test('includes idempotencyKey when available', () => {
    const result = buildTedPrompt({
      userMessage: 'paguei academia',
      householdId: 'test-household',
      idempotencyKey: 'msg-123-abc',
    });
    
    expect(result).toContain('msg-123-abc');
  });

  test('includes WhatsApp context when source is whatsapp', () => {
    const result = buildTedPrompt({
      userMessage: 'recebi 500 pix',
      householdId: 'test-household',
      source: 'whatsapp',
      senderPhone: '5511999999999',
    });
    
    expect(result).toContain('WhatsApp');
    expect(result).toContain('5511999999999');
  });

  test('includes WhatsApp context for whatsapp source', () => {
    const result = buildTedPrompt({
      userMessage: 'comprei tennis no cartao',
      householdId: 'test-household',
      source: 'whatsapp',
      groupId: '5511999999999@g.us',
    });
    
    expect(result).toContain('WhatsApp');
    expect(result).toContain('5511999999999@g.us');
  });

  test('includes cron context for cron source', () => {
    const result = buildTedPrompt({
      userMessage: 'Processar recorrências',
      householdId: 'test-household',
      source: 'cron',
    });
    
    expect(result).toContain('cron');
    expect(result).toContain('manutenção de recorrências');
  });

  test('includes financial context summary', () => {
    const accounts = [
      { id: '1', name: 'Inter', type: 'checking', balanceCents: 100000 },
      { id: '2', name: 'Nubank', type: 'credit_card', balanceCents: -50000 },
    ];
    
    const result = buildTedPrompt({
      userMessage: 'resumo do mes',
      householdId: 'test-household',
      accounts,
    });
    
    expect(result).toContain('Inter');
    expect(result).toContain('1000.00');
  });

  test('formatCurrency formats correctly', () => {
    expect(formatCurrency(8740)).toBe('87,40');
    expect(formatCurrency(100000)).toBe('1.000,00');
    expect(formatCurrency(-5000)).toBe('-50,00');
  });

  test('parseCurrency parses correctly', () => {
    expect(parseCurrency('87,40')).toBe(8740);
    expect(parseCurrency('R$ 100,00')).toBe(10000);
    expect(parseCurrency('1.000,50')).toBe(100050);
    expect(parseCurrency('invalid')).toBeNull();
  });
});