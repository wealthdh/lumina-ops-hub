/**
 * cashout.ts — Lumina Ops Hub withdrawal layer
 *
 * Uses dual-auth fetch pattern:
 *   Authorization: Bearer <anon_key>    → Supabase gateway
 *   x-user-jwt:    <user_access_token>  → edge function identity
 */

import { supabase } from './supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export type WithdrawMethod = 'bank' | 'card' | 'crypto'
export type TxStatus       = 'pending' | 'processing' | 'completed' | 'failed' | 'needs_approval'
export type CryptoNetwork  = 'bsc' | 'ethereum' | 'polygon'

export interface WithdrawResult {
  success:           boolean
  txId?:             string
  estimatedArrival?: string
  requiresApproval?: boolean
  approvalId?:       string
  configRequired?:   boolean
  explorerUrl?:      string
  devCode?:          string    // returned when RESEND_API_KEY not configured
  devNote?:          string
  error?:            string
}

export interface DailyLimitInfo {
  dailyLimit:   number
  usedToday:    number
  remaining:    number
  cryptoToday?: number
  cryptoCap?:   number
}

export interface CashoutTransaction {
  id:         string
  method:     WithdrawMethod
  amount:     number
  status:     TxStatus
  txId?:      string
  jobId?:     string
  network?:   CryptoNetwork
  toAddress?: string
  createdAt:  string
}

export interface ApprovalRecord {
  id:            string
  transactionId: string
  amount:        number
  method:        WithdrawMethod
  status:        'pending' | 'approved' | 'rejected' | 'expired'
  reason:        string
  requestedAt:   string
  expiresAt:     string
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const DAILY_LIMIT        = 500
export const CRYPTO_DAILY_CAP   = 1_000

export const NETWORK_LABELS: Record<CryptoNetwork, string> = {
  bsc:      'BNB Smart Chain',
  ethereum: 'Ethereum',
  polygon:  'Polygon',
}

export const NETWORK_EXPLORERS: Record<CryptoNetwork, string> = {
  bsc:      'https://bscscan.com/tx/',
  ethereum: 'https://etherscan.io/tx/',
  polygon:  'https://polygonscan.com/tx/',
}

export function generateIdempotencyKey(): string {
  return crypto.randomUUID()
}

// ─── Internal: edge function caller ──────────────────────────────────────────
// Uses supabase.functions.invoke() which sends Authorization: Bearer <user_jwt>
// automatically. Edge functions have verify_jwt=false so the gateway passes the
// token straight through. No custom headers → no CORS preflight issues.

async function callEdgeFn<T>(fnName: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fnName, {
    body,
  })

  if (error) {
    // FunctionsHttpError has status and body
    const msg = error.message || `Edge function "${fnName}" failed`
    if (msg.includes('non-2xx') || msg.includes('500') || msg.includes('503')) {
      throw new Error(`Edge function "${fnName}" error: ${msg}. Check Supabase Dashboard → Edge Functions → Logs.`)
    }
    throw new Error(msg)
  }

  // supabase.functions.invoke returns parsed JSON data directly
  if (data && typeof data === 'object' && 'error' in data) {
    throw new Error((data as { error: string }).error)
  }

  return data as T
}

// ─── Balance helpers ──────────────────────────────────────────────────────────

export async function getDailyLimitInfo(): Promise<DailyLimitInfo> {
  const today = new Date().toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('cashout_transactions')
    .select('amount, method')
    .in('status', ['completed'])
    .gte('created_at', `${today}T00:00:00.000Z`)

  if (error) throw error

  type Row = { amount: number; method: string }
  const rows      = (data ?? []) as Row[]
  const usedToday = rows.reduce((s, r) => s + Number(r.amount), 0)
  const cryptoToday = rows.filter(r => r.method === 'crypto').reduce((s, r) => s + Number(r.amount), 0)

  return {
    dailyLimit:  DAILY_LIMIT,
    usedToday,
    remaining:   Math.max(0, DAILY_LIMIT - usedToday),
    cryptoToday,
    cryptoCap:   CRYPTO_DAILY_CAP,
  }
}

export async function getAvailableBalance(): Promise<number> {
  const { data, error } = await supabase.rpc('get_available_balance', {
    p_user_id: (await supabase.auth.getUser()).data.user?.id ?? '',
  })
  if (error) throw error
  return Number(data ?? 0)
}

// ─── Plaid ────────────────────────────────────────────────────────────────────

export interface PlaidLinkTokenResult {
  linkToken:  string
  expiration: string
}

export async function getPlaidLinkToken(): Promise<PlaidLinkTokenResult> {
  return callEdgeFn<PlaidLinkTokenResult>('plaid-link-token', {})
}

export async function withdrawBank(
  amount:           number,
  plaidPublicToken: string,
  plaidAccountId:   string,
  idempotencyKey:   string,
  jobId?:           string,
): Promise<WithdrawResult> {
  return callEdgeFn<WithdrawResult>('cashout-bank', {
    amount, plaidPublicToken, plaidAccountId, idempotencyKey, jobId,
  })
}

// ─── Stripe card ──────────────────────────────────────────────────────────────

export async function withdrawCard(
  amount:                number,
  stripePaymentMethodId: string,
  idempotencyKey:        string,
  jobId?:                string,
): Promise<WithdrawResult> {
  return callEdgeFn<WithdrawResult>('cashout-card', {
    amount, stripePaymentMethodId, idempotencyKey, jobId,
  })
}

// ─── Crypto 2FA ───────────────────────────────────────────────────────────────

export async function sendCrypto2FA(
  idempotencyKey: string,
): Promise<{ sent: boolean; maskedEmail: string; devCode?: string; devNote?: string }> {
  // Uses Postgres RPC function (replaces deleted cashout-send-2fa edge function)
  const { data, error } = await supabase.rpc('generate_cashout_2fa', {
    p_idempotency_key: idempotencyKey,
  })
  if (error) throw new Error(error.message)
  // RPC returns jsonb — Supabase client parses it automatically
  const result = data as { sent?: boolean; maskedEmail?: string; devCode?: string; devNote?: string; error?: string }
  if (result.error) throw new Error(result.error)
  return {
    sent:        result.sent ?? true,
    maskedEmail: result.maskedEmail ?? '',
    devCode:     result.devCode,
    devNote:     result.devNote,
  }
}

export async function withdrawCrypto(
  amount:         number,
  toAddress:      string,
  network:        CryptoNetwork,
  twoFactorCode:  string,
  idempotencyKey: string,
  jobId?:         string,
): Promise<WithdrawResult> {
  return callEdgeFn<WithdrawResult>('cashout-crypto', {
    amount, toAddress, network, twoFactorCode, idempotencyKey, jobId,
  })
}

// ─── Approval queue ───────────────────────────────────────────────────────────

export async function getPendingApprovals(): Promise<ApprovalRecord[]> {
  const { data, error } = await supabase
    .from('cashout_approvals')
    .select('*')
    .eq('status', 'pending')
    .order('requested_at', { ascending: false })
  if (error) throw error

  type Row = { id: string; transaction_id: string; amount: number; method: string; status: string; reason: string; requested_at: string; expires_at: string }
  return ((data ?? []) as Row[]).map(r => ({
    id:            r.id,
    transactionId: r.transaction_id,
    amount:        Number(r.amount),
    method:        r.method as WithdrawMethod,
    status:        r.status as ApprovalRecord['status'],
    reason:        r.reason,
    requestedAt:   r.requested_at,
    expiresAt:     r.expires_at,
  }))
}

// ─── Transaction history ──────────────────────────────────────────────────────

export async function getTransactionHistory(limit = 50): Promise<CashoutTransaction[]> {
  const { data, error } = await supabase
    .from('cashout_transactions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error

  type Row = { id: string; method: string; amount: number; status: string; tx_id: string | null; job_id: string | null; network: string | null; to_address: string | null; created_at: string }
  return ((data ?? []) as Row[]).map(r => ({
    id:        r.id,
    method:    r.method as WithdrawMethod,
    amount:    Number(r.amount),
    status:    r.status as TxStatus,
    txId:      r.tx_id ?? undefined,
    jobId:     r.job_id ?? undefined,
    network:   r.network as CryptoNetwork | undefined,
    toAddress: r.to_address ?? undefined,
    createdAt: r.created_at,
  }))
}

export function subscribeCashoutTransactions(onUpdate: () => void) {
  const ch = `cashout_tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  return supabase.channel(ch)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cashout_transactions' }, onUpdate)
    .subscribe()
}
