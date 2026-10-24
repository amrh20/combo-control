/** Cash remittance requested by a captain and confirmed or rejected by ops. */
export type CaptainSettlementStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED';

/** One remittance row. Amounts are piastres. */
export interface CaptainCashSettlement {
  id: string;
  captainId: string;
  amountPiastres: number;
  status: CaptainSettlementStatus;
  requestedAt: string;
  resolvedAt: string | null;
  note: string;
}

export const SETTLEMENT_STATUS_LABELS: Readonly<Record<CaptainSettlementStatus, string>> = {
  PENDING: 'معلّق',
  CONFIRMED: 'تم الاستلام',
  REJECTED: 'مرفوض',
};
