import { CaptainEmploymentType } from './captain.model';

/** Money fields from `/v1/ops/financials/*` are converted to EGP in the service. */

export type FinancialsLedgerType = 'COLLECTION' | 'PAYOUT';
export type CaptainSettlementRole = 'DELIVERY' | 'COLLECTOR' | 'BOTH';
export type CaptainSettlementEmploymentType = CaptainEmploymentType;

/** Optional period filter for summary KPIs and the ledger. Omit both for all-time. */
export interface FinancialsDateRange {
  startDate?: string;
  endDate?: string;
}

export type FinancialsTimePeriod = 'today' | 'week' | 'month' | 'all';

export interface FinancialsSummary {
  cashHeldByCaptains: number;
  captainDues: number;
  merchantDues: number;
  platformProfit: number;
}

export interface CaptainSettlementPending {
  id: string;
  amount: number;
  status: 'PENDING';
  createdAt: string;
}

export interface CaptainSettlement {
  id: string;
  name: string;
  role: CaptainSettlementRole;
  /** Salary (`FIXED`) remits company cash; freelancer keeps delivery fee per trip. */
  employmentType: CaptainSettlementEmploymentType;
  /**
   * When false, the captain is external and does not use the driver app.
   * App freelancers auto-settle; non-app freelancers need manual ops settlement.
   */
  hasApp: boolean;
  cashCollected: number;
  earningsDue: number;
  pendingSettlement: CaptainSettlementPending | null;
}

export interface VendorSettlement {
  id: string;
  name: string;
  hubName: string;
  salesDue: number;
}

export interface FinancialsLedgerEntry {
  id: string;
  date: string;
  type: FinancialsLedgerType;
  amount: number;
  description: string;
}
