// ─────────────────────────────────────────────────────────────────────────────
// Formatter Tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, test } from 'vitest';
import {
  formatCentsToBRL,
  formatDate,
  formatAccountType,
  formatRecordType,
  formatInvoiceStatus,
  formatPeriod,
  formatRecurrencePeriod,
  formatSource,
} from './formatters';

describe('Formatters', () => {
  describe('formatCentsToBRL', () => {
    test('formats positive cents to BRL', () => {
      const result = formatCentsToBRL(5000);
      expect(result).toContain('50');
      expect(result).toContain(',');
      expect(result).toContain('R$');
      
      const result2 = formatCentsToBRL(123456);
      expect(result2).toContain('1.234');
      expect(result2).toContain('R$');
    });

    test('formats zero', () => {
      const result = formatCentsToBRL(0);
      expect(result).toContain('R$');
    });

    test('formats negative cents as expense', () => {
      const result = formatCentsToBRL(-5000);
      expect(result).toContain('-');
      expect(result).toContain('R$');
    });
  });

  describe('formatDate', () => {
    test('formats ISO date string to DD/MM/YYYY', () => {
      const result = formatDate('2026-05-29');
      // Should contain day, month, year
      expect(result).toMatch(/\/2026/);
      expect(result).toMatch(/\/05\//);
    });

    test('formats full ISO datetime', () => {
      const result = formatDate('2026-05-29T14:30:00.000Z');
      expect(result).toMatch(/\/2026/);
    });

    test('returns invalid date for bad input', () => {
      expect(formatDate('invalid')).toBe('Data inválida');
    });
  });

  describe('formatAccountType', () => {
    test('returns human readable account type', () => {
      expect(formatAccountType('checking')).toBe('Conta Corrente');
      expect(formatAccountType('savings')).toBe('Poupança');
      expect(formatAccountType('cash')).toBe('Dinheiro');
      expect(formatAccountType('credit_card')).toBe('Cartão de Crédito');
      expect(formatAccountType('investment')).toBe('Investimento');
    });

    test('returns unknown for invalid type', () => {
      expect(formatAccountType('invalid' as any)).toBe('Conta');
    });
  });

  describe('formatRecordType', () => {
    test('returns human readable record type', () => {
      expect(formatRecordType('expense')).toBe('Despesa');
      expect(formatRecordType('income')).toBe('Receita');
      expect(formatRecordType('transfer')).toBe('Transferência');
      expect(formatRecordType('interest')).toBe('Juros');
      expect(formatRecordType('adjustment')).toBe('Ajuste');
    });

    test('returns unknown for invalid type', () => {
      expect(formatRecordType('invalid' as any)).toBe('Registro');
    });
  });

  describe('formatInvoiceStatus', () => {
    test('returns human readable status with color hint', () => {
      expect(formatInvoiceStatus('open')).toBe('Aberta');
      expect(formatInvoiceStatus('closed')).toBe('Fechada');
      expect(formatInvoiceStatus('paid')).toBe('Paga');
    });

    test('returns unknown for invalid status', () => {
      expect(formatInvoiceStatus('invalid' as any)).toBe('Fatura');
    });
  });

  describe('formatPeriod', () => {
    test('formats month/year to Brazilian period', () => {
      expect(formatPeriod(5, 2026)).toBe('Mai/2026');
      expect(formatPeriod(12, 2026)).toBe('Dez/2026');
      expect(formatPeriod(1, 2026)).toBe('Jan/2026');
    });
  });

  describe('formatRecurrencePeriod', () => {
    test('returns human readable period', () => {
      expect(formatRecurrencePeriod('daily')).toBe('Diário');
      expect(formatRecurrencePeriod('weekly')).toBe('Semanal');
      expect(formatRecurrencePeriod('biweekly')).toBe('Quinzenal');
      expect(formatRecurrencePeriod('monthly')).toBe('Mensal');
      expect(formatRecurrencePeriod('yearly')).toBe('Anual');
    });

    test('returns unknown for invalid period', () => {
      expect(formatRecurrencePeriod('invalid' as any)).toBe('Recorrência');
    });
  });

  describe('formatSource', () => {
    test('returns human readable source', () => {
      expect(formatSource('dashboard')).toBe('Dashboard');
      expect(formatSource('whatsapp')).toBe('WhatsApp');
      expect(formatSource('cron')).toBe('Automático');
      expect(formatSource('agent')).toBe('TED');
    });

    test('returns unknown for invalid source', () => {
      expect(formatSource('invalid' as any)).toBe('Sistema');
    });
  });
});
