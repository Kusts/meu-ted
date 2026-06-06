/**
 * installment-plan — Unified installment handling (card + out-of-card)
 *
 * Two types of installment plans:
 * - "credit_card": tied to a card purchase, installments go to card statements
 * - "out_of_card": direct installments from a debit account (boleto, carnê, financing)
 *
 * For out-of-card, can have interest:
 *   - Price table: PMT = PV * (i * (1+i)^n) / ((1+i)^n - 1)
 *   - With interest: totalAmount > sum of installments
 *   - Without interest: totalAmount = sum of installments (last absorbs rounding)
 *
 * Generates N transactions, all linked by installment_plan_id.
 */

import type { Pool } from "pg";

export type PlanType = "credit_card" | "out_of_card";

export interface InstallmentSchedule {
  number: number;          // 1..N
  amountCents: number;     // amount of this installment
  dueDate: string;         // YYYY-MM-DD
  date: string;            // YYYY-MM-DD (when transaction is recorded)
  interestCents: number;   // interest portion (0 if no interest)
  principalCents: number;  // principal portion
}

export interface InstallmentPlan {
  id: string;
  householdId: string;
  accountId: string;
  description: string;
  totalAmountCents: number;
  installmentsCount: number;
  interestRate: number;
  type: PlanType;
  firstDueDate: string;
  startDate: string;
}

export interface PlanSummary {
  plan: InstallmentPlan;
  totalWithInterestCents: number;
  totalInterestCents: number;
  monthlyPaymentCents: number;
  schedule: InstallmentSchedule[];
  months: string[];  // list of YYYY-MM covered
  crossesYear: boolean;
  years: number[];
}

/**
 * Calculate the monthly payment using the standard PMT formula.
 * PMT = PV * (i * (1+i)^n) / ((1+i)^n - 1)
 * If i = 0, PMT = PV / n
 */
export function calculatePayment(
  principal: number,
  monthlyRate: number,
  n: number
): number {
  if (n <= 0) throw new Error("n deve ser >= 1");
  if (monthlyRate === 0) return principal / n;
  const factor = Math.pow(1 + monthlyRate, n);
  return (principal * monthlyRate * factor) / (factor - 1);
}

/**
 * Build the full schedule of N installments.
 * - If no interest, total is split equally (last absorbs rounding)
 * - With interest, monthly payment is calculated via PMT, last absorbs rounding
 */
export function buildInstallmentSchedule(
  totalAmountCents: number,
  installmentsCount: number,
  firstDueDate: string,
  interestRate: number = 0
): InstallmentSchedule[] {
  if (installmentsCount < 1 || installmentsCount > 48) {
    throw new Error("installmentsCount deve estar entre 1 e 48");
  }
  if (totalAmountCents <= 0) {
    throw new Error("totalAmountCents deve ser positivo");
  }
  if (interestRate < 0 || interestRate > 1) {
    throw new Error("interestRate deve estar entre 0 e 1 (ex: 0.0299 = 2.99% a.m.)");
  }

  const schedule: InstallmentSchedule[] = [];
  const principal = totalAmountCents;

  if (interestRate === 0) {
    // No interest: split equally
    const baseAmount = Math.floor(principal / installmentsCount);
    const lastAmount = principal - baseAmount * (installmentsCount - 1);
    for (let i = 0; i < installmentsCount; i++) {
      const due = addMonths(firstDueDate, i);
      schedule.push({
        number: i + 1,
        amountCents: i === installmentsCount - 1 ? lastAmount : baseAmount,
        dueDate: due,
        date: due,
        interestCents: 0,
        principalCents: i === installmentsCount - 1 ? lastAmount : baseAmount,
      });
    }
  } else {
    // With interest: PMT formula
    const monthlyPayment = calculatePayment(principal, interestRate, installmentsCount);
    // Compute total with interest
    const totalWithInterest = Math.round(monthlyPayment * installmentsCount);
    const totalInterest = totalWithInterest - principal;
    const interestPerMonth = Math.round(totalInterest / installmentsCount);
    const lastInterest = totalInterest - interestPerMonth * (installmentsCount - 1);

    for (let i = 0; i < installmentsCount; i++) {
      const interest = i === installmentsCount - 1 ? lastInterest : interestPerMonth;
      const due = addMonths(firstDueDate, i);
      // First few installments: more interest, less principal
      // Last few: more principal, less interest
      // Simplified: each installment = monthlyPayment, principal = payment - interest
      const principalPortion = Math.round(monthlyPayment) - interest;
      schedule.push({
        number: i + 1,
        amountCents: i === installmentsCount - 1
          ? (Math.round(monthlyPayment * (installmentsCount - 1)) + Math.round(monthlyPayment) - Math.round(monthlyPayment * (installmentsCount - 1)))
          : Math.round(monthlyPayment),
        dueDate: due,
        date: due,
        interestCents: interest,
        principalCents: principalPortion,
      });
    }

    // Adjust last installment to absorb rounding
    const sum = schedule.slice(0, -1).reduce((s, x) => s + x.amountCents, 0);
    schedule[schedule.length - 1].amountCents = totalWithInterest - sum;
    const lastPrincipal = schedule[schedule.length - 1].amountCents - lastInterest;
    schedule[schedule.length - 1].principalCents = lastPrincipal;
  }

  return schedule;
}

/**
 * Add N months to a YYYY-MM-DD date.
 */
export function addMonths(date: string, months: number): string {
  const d = new Date(date + "T00:00:00.000Z");
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();
  const newDate = new Date(Date.UTC(year, month + months, 1));
  const newYear = newDate.getUTCFullYear();
  const newMonth = newDate.getUTCMonth();
  const lastDay = new Date(Date.UTC(newYear, newMonth + 1, 0)).getUTCDate();
  const finalDay = Math.min(day, lastDay);
  return `${newYear}-${String(newMonth + 1).padStart(2, "0")}-${String(finalDay).padStart(2, "0")}`;
}

/**
 * Get the months (YYYY-MM) covered by a schedule.
 */
export function getScheduleMonths(schedule: InstallmentSchedule[]): string[] {
  const months = new Set<string>();
  for (const s of schedule) {
    months.add(s.dueDate.slice(0, 7));
  }
  return Array.from(months).sort();
}

/**
 * Get the years covered by a schedule.
 */
export function getScheduleYears(schedule: InstallmentSchedule[]): number[] {
  const years = new Set<number>();
  for (const s of schedule) {
    years.add(parseInt(s.dueDate.slice(0, 4), 10));
  }
  return Array.from(years).sort();
}

/**
 * Build a complete plan summary.
 */
export function buildPlanSummary(
  plan: Omit<InstallmentPlan, "id" | "createdAt">,
  schedule: InstallmentSchedule[]
): PlanSummary {
  const totalWithInterest = schedule.reduce((s, x) => s + x.amountCents, 0);
  const totalInterest = schedule.reduce((s, x) => s + x.interestCents, 0);
  const monthlyPayment = Math.round(totalWithInterest / schedule.length);
  const months = getScheduleMonths(schedule);
  const years = getScheduleYears(schedule);
  return {
    plan: { ...plan, id: "", createdAt: "" } as InstallmentPlan,
    totalWithInterestCents: totalWithInterest,
    totalInterestCents: totalInterest,
    monthlyPaymentCents: monthlyPayment,
    schedule,
    months,
    crossesYear: years.length > 1,
    years,
  };
}

/**
 * Format a plan summary for display.
 */
export function formatPlanSummary(summary: PlanSummary): string {
  const fmt = (cents: number) => `R$ ${(cents / 100).toFixed(2)}`;
  const lines: string[] = [];
  lines.push(`📋 ${summary.plan.description} — ${summary.plan.installmentsCount}x de ${fmt(summary.monthlyPaymentCents)}`);
  lines.push(`   Tipo: ${summary.plan.type === "credit_card" ? "Cartão de crédito" : "Fora do cartão (boleto/carnê)"}`);
  lines.push(`   Conta: ${summary.plan.accountId.slice(0, 8)}...`);
  lines.push(`   Valor: ${fmt(summary.plan.totalAmountCents)}${summary.totalInterestCents > 0 ? ` + ${fmt(summary.totalInterestCents)} juros = ${fmt(summary.totalWithInterestCents)}` : ""}`);
  if (summary.crossesYear) {
    lines.push(`   ⚠️ Cruza ano: ${summary.years.join(" → ")}`);
  }
  lines.push(`   Meses: ${summary.months.join(", ")}`);
  if (summary.schedule.length <= 12) {
    lines.push(`   Cronograma:`);
    for (const s of summary.schedule) {
      const interestStr = s.interestCents > 0 ? ` (juros: ${fmt(s.interestCents)})` : "";
      lines.push(`     ${String(s.number).padStart(2, "0")}/${summary.plan.installmentsCount} — ${s.dueDate} — ${fmt(s.amountCents)}${interestStr}`);
    }
  } else {
    lines.push(`   Primeira: ${summary.schedule[0].dueDate} (${fmt(summary.schedule[0].amountCents)})`);
    lines.push(`   Última: ${summary.schedule[summary.schedule.length - 1].dueDate} (${fmt(summary.schedule[summary.schedule.length - 1].amountCents)})`);
  }
  return lines.join("\n");
}
