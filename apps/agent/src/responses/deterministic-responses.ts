import { formatCents } from '../evidence/financial-formatters.js';

export const renderBalance = (value: { accountName: string; balanceCents: number }): string => `${value.accountName}: ${formatCents(value.balanceCents)}.`;
export const renderEmpty = (subject: string): string => `Não há dados disponíveis para ${subject}.`;
export const renderUnavailable = (subject: string): string => `Não foi possível consultar ${subject} agora. Tente novamente mais tarde.`;
export const renderSuccess = (subject: string): string => `${subject} concluído com sucesso.`;
export const renderFailure = (subject: string): string => `Não foi possível concluir ${subject}.`;
