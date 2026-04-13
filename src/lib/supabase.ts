import { createClient } from '@supabase/supabase-js'
// Database type kept for documentation; not passed to createClient to avoid
// GenericSchema constraint failures when Relationships arrays are absent.
// Type safety is enforced by explicit casts in hooks.
// import type { Database } from './database.types'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase env vars. Copy .env.example â .env and fill in your keys.')
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: {
    params: { eventsPerSecond: 20 },
  },
})

// âââ Typed helpers ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

export const db = {
  jobs:           () => supabase.from('ops_jobs'),
  trades:         () => supabase.from('mt5_trades'),
  account:        () => supabase.from('mt5_accounts'),
  tasks:          () => supabase.from('auto_tasks'),
  polyPositions:  () => supabase.from('poly_positions'),
  polyMarkets:    () => supabase.from('poly_markets'),
  arbitrageSignals: () => supabase.from('arbitrage_signals'),
  taxEntries:     () => supabase.from('tax_entries'),
  taxPot:         () => supabase.from('tax_pot'),
  leads:          () => supabase.from('leads'),
  briefings:      () => supabase.from('daily_briefings'),
  allocations:    () => supabase.from('allocation_rules'),
  synergies:      () => supabase.from('synergy_links'),
  mcResults:      () => supabase.from('montecarlo_results'),
  ticks:          () => supabase.from('realtime_ticks'),
  edgeScans:      () => supabase.from('edge_harmonizer_scans'),
}

// âââ Realtime subscriptions âââââââââââââââââââââââââââââââââââââââââââââââââââ

const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

export function subscribeMT5Account(
  accountId: string,
  onUpdate: (payload: unknown) => void,
) {
  return supabase
    .channel(`mt5_account_${accountId}_${uid()}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'mt5_accounts',
      filter: `account_id=eq.${accountId}`,
    }, onUpdate)
    .subscribe()
}

export function subscribeJobs(onUpdate: (payload: unknown) => void) {
  return supabase
    .channel(`ops_jobs_realtime_${uid()}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'ops_jobs',
    }, onUpdate)
    .subscribe()
}

export function subscribeArbitrageSignals(onUpdate: (payload: unknown) => void) {
  return supabase
    .channel(`arbitrage_signals_live_${uid()}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'arbitrage_signals',
    }, onUpdate)
    .subscribe()
}

export function subscribeTaxPot(onUpdate: (payload: unknown) => void) {
  return supabase
    .channel(`tax_pot_live_${uid()}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'tax_pot',
    }, onUpdate)
    .subscribe()
}

export function subscribeLeads(onUpdate: (payload: unknown) => void) {
  return supabase
    .channel(`leads_live_${uid()}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'leads',
    }, onUpdate)
    .subscribe()
}
import { createClient } from '@supabase/supabase-js'
// Database type kept for documentation; not passed to createClient to avoid
// GenericSchema constraint failures when Relationships arrays are absent.
// Type safety is enforced by explicit casts in hooks.
// import type { Database } from './database.types'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase env vars. Copy .env.example → .env and fill in your keys.')
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: {
    params: { eventsPerSecond: 20 },
  },
})

// ─── Typed helpers ────────────────────────────────────────────────────────────

export const db = {
  jobs:           () => supabase.from('ops_jobs'),
  trades:         () => supabase.from('mt5_trades'),
  account:        () => supabase.from('mt5_accounts'),
  tasks:          () => supabase.from('auto_tasks'),
  polyPositions:  () => supabase.from('poly_positions'),
  polyMarkets:    () => supabase.from('poly_markets'),
  arbitrageSignals: () => supabase.from('arbitrage_signals'),
  taxEntries:     () => supabase.from('tax_entries'),
  taxPot:         () => supabase.from('tax_pot'),
  leads:          () => supabase.from('leads'),
  briefings:      () => supabase.from('daily_briefings'),
  allocations:    () => supabase.from('allocation_rules'),
  synergies:      () => supabase.from('synergy_links'),
  mcResults:      () => supabase.from('montecarlo_results'),
  ticks:          () => supabase.from('realtime_ticks'),
}

// ─── Realtime subscriptions ───────────────────────────────────────────────────

const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

export function subscribeMT5Account(
  accountId: string,
  onUpdate: (payload: unknown) => void,
) {
  return supabase
    .channel(`mt5_account_${accountId}_${uid()}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'mt5_accounts',
      filter: `account_id=eq.${accountId}`,
    }, onUpdate)
    .subscribe()
}

export function subscribeJobs(onUpdate: (payload: unknown) => void) {
  return supabase
    .channel(`ops_jobs_realtime_${uid()}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'ops_jobs',
    }, onUpdate)
    .subscribe()
}

export function subscribeArbitrageSignals(onUpdate: (payload: unknown) => void) {
  return supabase
    .channel(`arbitrage_signals_live_${uid()}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'arbitrage_signals',
    }, onUpdate)
    .subscribe()
}

export function subscribeTaxPot(onUpdate: (payload: unknown) => void) {
  return supabase
    .channel(`tax_pot_live_${uid()}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'tax_pot',
    }, onUpdate)
    .subscribe()
}

export function subscribeLeads(onUpdate: (payload: unknown) => void) {
  return supabase
    .channel(`leads_live_${uid()}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'leads',
    }, onUpdate)
    .subscribe()
}
