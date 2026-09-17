import type { BudgetStore } from "../budgets/store.js";
import type { CardStore } from "../cards/store.js";
import type { GoalStore } from "../goals/store.js";
import type { PayableStore } from "../payables/store.js";
import type { SubscriptionStore } from "../subscriptions/store.js";
import { domainErrors } from "../writes/errors.js";
import { updateTransactionInputSchema } from "../writes/types.js";
import type { WriteStore } from "../writes/store.js";
import type { PendingOperation, PendingOperationExecutor } from "./pending.js";

type Payload = Record<string, unknown>;

const payloadOf = (operation: PendingOperation): Payload => {
	if (
		!operation.payload ||
		typeof operation.payload !== "object" ||
		Array.isArray(operation.payload)
	) {
		throw domainErrors.invalid("payload", "operação pendente inválida");
	}
	return operation.payload as Payload;
};

const idOf = (payload: Payload): string => {
	if (typeof payload.id !== "string")
		throw domainErrors.invalid("id", "operação pendente inválida");
	return payload.id;
};

const withoutId = (payload: Payload): Payload => {
	const { id: _id, ...input } = payload;
	return input;
};

const goalIdOf = (payload: Payload): string => {
	if (typeof payload.goalId !== "string")
		throw domainErrors.invalid("goalId", "operação pendente inválida");
	return payload.goalId;
};

export type PendingOperationExecutorDeps = {
	writes: WriteStore;
	cardStore?: CardStore;
	payableStore?: PayableStore;
	budgetStore?: BudgetStore;
	goalStore?: GoalStore;
	subscriptionStore?: SubscriptionStore;
};

export const createPendingOperationExecutor =
	(deps: PendingOperationExecutorDeps): PendingOperationExecutor =>
	async (operation) => {
		const payload = payloadOf(operation);
		const householdId = operation.householdId;

		switch (operation.operation) {
			case "accounts.create":
				return deps.writes.createAccount(
					householdId,
					payload as Parameters<WriteStore["createAccount"]>[1],
				);
			case "accounts.deactivate":
				return deps.writes.deactivateAccount(householdId, idOf(payload));
			case "categories.deactivate":
				return deps.writes.deactivateCategory(householdId, idOf(payload));
			case "transactions.expense.create":
				return deps.writes.createExpense(
					householdId,
					payload as Parameters<WriteStore["createExpense"]>[1],
				);
			case "transactions.income.create":
				return deps.writes.createIncome(
					householdId,
					payload as Parameters<WriteStore["createIncome"]>[1],
				);
			case "transactions.transfer.create":
				return deps.writes.createTransfer(
					householdId,
					payload as Parameters<WriteStore["createTransfer"]>[1],
				);
		case "transactions.update": {
			// V4.1 REVIEWFIX F8 [major]: the persisted payload bypassed the
			// strict PATCH contract (unknown fields reached the store). The
			// route-level updateTransactionInputSchema (.strict()) is
			// re-validated here; invalid payloads fail the operation with a
			// sanitized validation error and the store stays untouched.
			const input = withoutId(payload);
			const checked = updateTransactionInputSchema.safeParse(input);
			if (!checked.success) {
				throw domainErrors.invalid("payload", "operação pendente inválida");
			}
			return deps.writes.updateTransaction(
				householdId,
				idOf(payload),
				checked.data,
			);
		}
			case "transactions.delete":
				return deps.writes.softDeleteTransaction(householdId, idOf(payload));

			case "cards.purchase":
				return requireStore(deps.cardStore, "cartão").createCardPurchase(
					householdId,
					payload as Parameters<CardStore["createCardPurchase"]>[1],
				);
			case "cards.installments":
				return requireStore(deps.cardStore, "cartão").createCardInstallments(
					householdId,
					payload as Parameters<CardStore["createCardInstallments"]>[1],
				);
			case "cards.recurring":
				return requireStore(deps.cardStore, "cartão").createRecurringPurchase(
					householdId,
					payload as Parameters<CardStore["createRecurringPurchase"]>[1],
				);
			case "cards.statement.pay":
				return requireStore(deps.cardStore, "cartão").payStatement(
					householdId,
					idOf(payload),
					withoutId(payload) as Parameters<CardStore["payStatement"]>[2],
				);
			case "cards.create":
				return requireStore(deps.cardStore, "cartão").createCard(
					householdId,
					payload as Parameters<CardStore["createCard"]>[1],
				);
			case "cards.update":
				return requireStore(deps.cardStore, "cartão").updateCard(
					householdId,
					idOf(payload),
					withoutId(payload) as Parameters<CardStore["updateCard"]>[2],
				);
			case "cards.purchase.update":
				return requireStore(deps.cardStore, "cartão").updatePurchase(
					householdId,
					idOf(payload),
					withoutId(payload) as Parameters<CardStore["updatePurchase"]>[2],
				);

			case "budgets.create":
				return requireStore(deps.budgetStore, "orçamento").createBudget(
					householdId,
					payload as Parameters<BudgetStore["createBudget"]>[1],
				);
			case "budgets.update":
				return requireStore(deps.budgetStore, "orçamento").updateBudget(
					householdId,
					idOf(payload),
					withoutId(payload) as Parameters<BudgetStore["updateBudget"]>[2],
				);

			case "goals.create":
				return requireStore(deps.goalStore, "meta").createGoal(
					householdId,
					payload as Parameters<GoalStore["createGoal"]>[1],
				);
			case "goals.contribute":
				return requireStore(deps.goalStore, "meta").contributeToGoal(
					householdId,
					idOf(payload),
					withoutId(payload) as Parameters<GoalStore["contributeToGoal"]>[2],
				);
			case "goals.cancel":
				return requireStore(deps.goalStore, "meta").cancelGoal(
					householdId,
					goalIdOf(payload),
				);
			case "goals.update":
				return requireStore(deps.goalStore, "meta").updateGoal(
					householdId,
					idOf(payload),
					withoutId(payload) as Parameters<GoalStore["updateGoal"]>[2],
				);

			case "payables.create": {
				const payableStore = requireStore(deps.payableStore, "conta a pagar");
				const templateName =
					typeof payload.templateName === "string"
						? payload.templateName
						: undefined;
				const { templateName: _templateName, ...payable } = payload;
				if (templateName) {
					await payableStore.createTemplate(householdId, {
						accountId: String(payload.accountId),
						name: templateName,
						description: String(payload.description),
						amountCents: Number(payload.amountCents),
						frequency:
							(payload.frequency as
								| "monthly"
								| "quarterly"
								| "yearly"
								| undefined) ?? "monthly",
						dayOfMonth: new Date(
							`${String(payload.dueDate)}T00:00:00`,
						).getUTCDate(),
						...(typeof payload.reminderDaysBefore === "number"
							? { reminderDaysBefore: payload.reminderDaysBefore }
							: {}),
						...(typeof payload.notes === "string"
							? { notes: payload.notes }
							: {}),
					});
				}
				return payableStore.createPayable(
					householdId,
					payable as Parameters<PayableStore["createPayable"]>[1],
				);
			}
			case "payables.pay":
				return requireStore(deps.payableStore, "conta a pagar").markPayablePaid(
					householdId,
					idOf(payload),
					withoutId(payload) as Parameters<PayableStore["markPayablePaid"]>[2],
				);
		case "payables.unpay": {
			// V4.1 REVIEWFIX F2 (D4): the persisted payload carries the
			// linked paidTransactionId — forward it as
			// expectedPaidTransactionId so the D4 contract survives the
			// approval round-trip instead of reversing an unverified effect.
			const unpayInput = withoutId(payload);
			const expectedPaidTransactionId =
				typeof unpayInput.paidTransactionId === "string"
					? unpayInput.paidTransactionId
					: undefined;
			return requireStore(
				deps.payableStore,
				"conta a pagar",
			).undoPayablePayment(
				householdId,
				idOf(payload),
				...(expectedPaidTransactionId !== undefined
					? [{ expectedPaidTransactionId } as const]
					: []),
			);
		}
			case "payables.update":
				return requireStore(deps.payableStore, "conta a pagar").updatePayable(
					householdId,
					idOf(payload),
					withoutId(payload) as Parameters<PayableStore["updatePayable"]>[2],
				);
			case "payables.cancel":
				return requireStore(deps.payableStore, "conta a pagar").cancelPayable(
					householdId,
					idOf(payload),
					typeof payload.reason === "string" ? payload.reason : undefined,
				);
			case "payables.templates.create":
				return requireStore(
					deps.payableStore,
					"template de conta",
				).createTemplate(
					householdId,
					payload as Parameters<PayableStore["createTemplate"]>[1],
				);
			case "payables.from-template":
				return requireStore(
					deps.payableStore,
					"conta a pagar",
				).createPayableFromTemplate(
					householdId,
					payload as Parameters<PayableStore["createPayableFromTemplate"]>[1],
				);

			case "subscriptions.create":
				return requireStore(
					deps.subscriptionStore,
					"assinatura",
				).createSubscription(
					householdId,
					payload as Parameters<SubscriptionStore["createSubscription"]>[1],
				);
			case "subscriptions.update":
				return requireStore(
					deps.subscriptionStore,
					"assinatura",
				).updateSubscription(
					householdId,
					idOf(payload),
					withoutId(payload) as Parameters<
						SubscriptionStore["updateSubscription"]
					>[2],
				);
			case "subscriptions.cancel":
				return requireStore(
					deps.subscriptionStore,
					"assinatura",
				).cancelSubscription(householdId, idOf(payload));
			default:
				throw domainErrors.unsupported(
					`operação pendente ${operation.operation}`,
				);
		}
	};

function requireStore<T>(store: T | undefined, name: string): T {
	if (!store) throw domainErrors.unsupported(`store de ${name}`);
	return store;
}
