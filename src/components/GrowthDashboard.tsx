/**
 * GrowthDashboard — Revenue Growth Analytics
 *
 * Surfaces real DB data:
 *   - Top hooks by CTR / conversions
 *   - Revenue per creative / per product
 *   - Platform performance breakdown
 *   - Daily posting cadence & peak-hour scheduler
 *   - Click funnel: impressions → clicks → conversions → revenue
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ConversionEvent {
  id:                 string
  stripe_event_id:    string
  creative_id:        string | null
  attribution_method: string
  amount_usd:         number
  product_name:       string | null
  product_key:        string | null
  buyer_email:        string | null
  utm_source:         string | null
  utm_medium:         string | null
  processed_at:       string
}

interface CreativeAnalytic {
  id: string
  title: string
  platform: string
  hook_score: number
  caption: string
  monetization_url: string | null
  status: string
  views: number
  clicks: number
  conversions: number
  ctr: number          // clicks / views
  cvr: number          // conversions / clicks
  revenue_usd: number
  roas: number
  posted_at: string | null
  created_at: string
}

interface PlatformStat {
  platform: string
  count: number
  views: number
  clicks: number
  conversions: number
  revenue: number
  avg_ctr: number
  avg_hook: number
}

interface DailyRevenue {
  date: string
  revenue: number
  posts: number
  clicks: number
}

interface ProductRevenue {
  product: string
  url_fragment: string
  revenue: number
  conversions: number
  creatives: number
}

// ─── Hooks ─────────────────────────────────────────────────────────────────────

function useTopCreatives(limit = 20) {
  return useQuery<CreativeAnalytic[]>({
    queryKey: ['growth_top_creatives', limit],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []
      const { data } = await supabase
        .from('ugc_creatives')
        .select('id, title, platform, hook_score, caption, monetization_url, status, views, clicks, conversions, ctr, cvr, revenue_usd, roas, posted_at, created_at')
        .eq('user_id', user.id)
        .order('revenue_usd', { ascending: false })
        .limit(limit)
      if (!data) return []
      return data.map((r: Record<string, unknown>) => ({
        id:              String(r.id ?? ''),
        title:           String(r.title ?? ''),
        platform:        String(r.platform ?? 'twitter'),
        hook_score:      Number(r.hook_score ?? 0),
        caption:         String(r.caption ?? ''),
        monetization_url: r.monetization_url ? String(r.monetization_url) : null,
        status:          String(r.status ?? ''),
        views:           Number(r.views ?? 0),
        clicks:          Number(r.clicks ?? 0),
        conversions:     Number(r.conversions ?? 0),
        ctr:             Number(r.ctr ?? 0),
        cvr:             Number(r.cvr ?? 0),
        revenue_usd:     Number(r.revenue_usd ?? 0),
        roas:            Number(r.roas ?? 0),
        posted_at:       r.posted_at ? String(r.posted_at) : null,
        created_at:      String(r.created_at ?? ''),
      }))
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

function usePlatformStats() {
  return useQuery<PlatformStat[]>({
    queryKey: ['growth_platform_stats'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []
      const { data } = await supabase
        .from('ugc_creatives')
        .select('platform, views, clicks, conversions, revenue_usd, hook_score')
        .eq('user_id', user.id)
      if (!data) return []

      const map = new Map<string, PlatformStat>()
      for (const r of data as Array<{ platform: string; views: number; clicks: number; conversions: number; revenue_usd: number; hook_score: number }>) {
        const p = r.platform || 'twitter'
        const s = map.get(p) ?? { platform: p, count: 0, views: 0, clicks: 0, conversions: 0, revenue: 0, avg_ctr: 0, avg_hook: 0 }
        s.count++
        s.views       += Number(r.views ?? 0)
        s.clicks      += Number(r.clicks ?? 0)
        s.conversions += Number(r.conversions ?? 0)
        s.revenue     += Number(r.revenue_usd ?? 0)
        s.avg_hook    += Number(r.hook_score ?? 0)
        map.set(p, s)
      }

      return Array.from(map.values()).map(s => ({
        ...s,
        avg_ctr:  s.views > 0 ? (s.clicks / s.views) * 100 : 0,
        avg_hook: s.count > 0 ? s.avg_hook / s.count : 0,
      })).sort((a, b) => b.revenue - a.revenue)
    },
    staleTime: 60_000,
  })
}

function useDailyRevenue(days = 14) {
  return useQuery<DailyRevenue[]>({
    queryKey: ['growth_daily_revenue', days],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []

      // Income entries attributed to Stripe conversions
      const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
      const { data: income } = await supabase
        .from('income_entries')
        .select('amount, entry_date')
        .eq('user_id', user.id)
        .eq('source', 'stripe')
        .gte('entry_date', cutoff)

      // Posts per day from ugc_creatives
      const { data: posts } = await supabase
        .from('ugc_creatives')
        .select('posted_at, clicks')
        .eq('user_id', user.id)
        .eq('status', 'posted')
        .gte('posted_at', cutoff + 'T00:00:00Z')

      const map = new Map<string, DailyRevenue>()

      // Seed with last N days
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10)
        map.set(d, { date: d, revenue: 0, posts: 0, clicks: 0 })
      }

      for (const e of (income ?? []) as Array<{ amount: number; entry_date: string }>) {
        const d = String(e.entry_date).slice(0, 10)
        const s = map.get(d)
        if (s) s.revenue += Number(e.amount)
      }

      for (const p of (posts ?? []) as Array<{ posted_at: string; clicks: number }>) {
        const d = String(p.posted_at ?? '').slice(0, 10)
        const s = map.get(d)
        if (s) { s.posts++; s.clicks += Number(p.clicks ?? 0) }
      }

      return Array.from(map.values())
    },
    staleTime: 60_000,
  })
}

function useProductRevenue() {
  return useQuery<ProductRevenue[]>({
    queryKey: ['growth_product_revenue'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []
      const { data } = await supabase
        .from('ugc_creatives')
        .select('monetization_url, revenue_usd, conversions')
        .eq('user_id', user.id)
        .not('monetization_url', 'is', null)

      const PRODUCTS: Record<string, string> = {
        'mt5-gold':     'MT5 Gold Scalper EA ($97)',
        'polymarket':   'Polymarket Edge Scanner ($47)',
        'ai-prompt':    'AI Prompt Toolkit ($29)',
        'ugc-swarm':    'UGC Swarm Templates ($19)',
        'kelly-pro':    'Kelly Pro Calculator ($14.99)',
      }

      const map = new Map<string, ProductRevenue>()
      for (const [key, label] of Object.entries(PRODUCTS)) {
        map.set(key, { product: label, url_fragment: key, revenue: 0, conversions: 0, creatives: 0 })
      }

      for (const r of (data ?? []) as Array<{ monetization_url: string; revenue_usd: number; conversions: number }>) {
        const url = String(r.monetization_url ?? '')
        for (const key of Object.keys(PRODUCTS)) {
          if (url.includes(key)) {
            const s = map.get(key)!
            s.revenue     += Number(r.revenue_usd ?? 0)
            s.conversions += Number(r.conversions ?? 0)
            s.creatives++
            break
          }
        }
      }

      return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue)
    },
    staleTime: 60_000,
  })
}

// ─── Real Stripe conversion data ──────────────────────────────────────────────

function useConversionEvents(limit = 50) {
  return useQuery<ConversionEvent[]>({
    queryKey: ['conversion_events', limit],
    queryFn: async () => {
      // conversion_events are cross-user (service role writes) — filter by
      // creatives owned by this user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []

      // Get this user's creative IDs first
      const { data: myCreatives } = await supabase
        .from('ugc_creatives')
        .select('id')
        .eq('user_id', user.id)

      const myIds = (myCreatives ?? []).map((c: { id: string }) => c.id)

      // Fetch conversion_events for this user's creatives + unattributed events
      const { data, error } = await supabase
        .from('conversion_events')
        .select('id, stripe_event_id, creative_id, attribution_method, amount_usd, product_name, product_key, buyer_email, utm_source, utm_medium, processed_at')
        .order('processed_at', { ascending: false })
        .limit(limit)

      if (error) { console.warn('conversion_events fetch error:', error.message); return [] }

      // Filter client-side to only events for our creatives (or unattributed)
      return ((data ?? []) as ConversionEvent[]).filter(e =>
        e.creative_id === null || myIds.includes(e.creative_id)
      )
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

// Aggregate real conversion revenue by product key
function useRealProductRevenue(convEvents: ConversionEvent[]): ProductRevenue[] {
  const PRODUCTS: Record<string, string> = {
    'mt5-gold':   'MT5 Gold Scalper EA ($97)',
    'polymarket': 'Polymarket Edge Scanner ($47)',
    'ai-prompt':  'AI Prompt Toolkit ($29)',
    'ugc-swarm':  'UGC Swarm Templates ($19)',
    'kelly-pro':  'Kelly Pro Calculator ($14.99)',
  }

  const map = new Map<string, ProductRevenue>()
  for (const [key, label] of Object.entries(PRODUCTS)) {
    map.set(key, { product: label, url_fragment: key, revenue: 0, conversions: 0, creatives: 0 })
  }

  for (const e of convEvents) {
    const key = e.product_key
    if (key && map.has(key)) {
      const s = map.get(key)!
      s.revenue     += Number(e.amount_usd ?? 0)
      s.conversions += 1
    }
  }

  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue)
}

// ─── Decision Engine types ────────────────────────────────────────────────────

interface HookFamilyRow {
  id: string
  display_name: string
  total_creatives: number
  posted_count: number
  total_views: number
  total_clicks: number
  total_conversions: number
  real_conversions: number
  total_revenue: number
  avg_ctr: number
  cvr: number
  avg_roas: number
  avg_hook_score: number
  revenue_per_click: number
  posting_weight: number
  generation_weight: number
  business_score: number
  status: string
  rank: number
  exploration_eligible: boolean
  // Phase 5: EMA smoothed signals
  ema_cvr: number | null
  ema_ctr: number | null
  ema_revenue_per_click: number | null
}

interface RunnerConfigRow {
  use_real_metrics: boolean
  exploration_floor: number
  clone_threshold_conversions: number
  max_family_weight: number
  daily_generation_goal: number
  reality_mode_enabled: boolean
  // optimizer fields
  auto_optimize_enabled: boolean
  optimize_interval_hours: number
  max_weight_delta_per_cycle: number
  ucb1_exploration_constant: number
  min_views_before_adjust: number
  optimizer_cycle_count: number
  last_optimized_at: string | null
  // Phase 4: stability
  kill_switch_active: boolean
  kill_switch_reason: string | null
  kill_switch_triggered_at: string | null
  stable_snapshot_at: string | null
  revenue_drop_threshold: number
  entropy_collapse_threshold: number
  dynamic_exploration: boolean
  entropy_boost_factor: number
  variance_discount_factor: number
  current_entropy: number | null
  current_exploration_floor: number | null
  total_cumulative_regret: number
  // Phase 5: validation mode
  system_mode: string         // 'test' | 'live'
  ema_alpha: number
  ema_entropy: number | null
  ema_entropy_n: number
  entropy_ema_alpha: number
  floor_smoothing_alpha: number
  max_weight_shift_per_cycle: number
}

interface OptimizerLogEntry {
  id: string
  run_at: string
  triggered_by: string
  cycle_number: number
  actions_taken: number
  skipped_reason: string | null
  total_reward: number
  exploration_pct: number
  payload: Record<string, unknown>
  duration_ms: number | null
}

export interface DecisionAction {
  type: 'INCREASE_WEIGHT' | 'PAUSE_FAMILY' | 'CLONE_WINNERS' | 'ENFORCE_EXPLORATION' | 'REDUCE_WEIGHT'
  target: string
  display_name?: string
  value?: number
  multiplier?: number
  reason: string
  safe: boolean   // false = requires real conversions guard
}

interface DriftAlert {
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  issue: string
  fix: string
}

// ─── New hooks ─────────────────────────────────────────────────────────────────

function useHookFamilies() {
  return useQuery<HookFamilyRow[]>({
    queryKey: ['hook_families_full'],
    queryFn: async () => {
      const { data } = await supabase
        .from('hook_families')
        .select('id, display_name, total_creatives, posted_count, total_views, total_clicks, total_conversions, real_conversions, total_revenue, avg_ctr, cvr, avg_roas, avg_hook_score, revenue_per_click, posting_weight, generation_weight, business_score, status, rank, exploration_eligible, ema_cvr, ema_ctr, ema_revenue_per_click')
        .order('rank', { ascending: true })
      return (data || []).map(r => ({
        ...r,
        real_conversions:     Number(r.real_conversions  ?? 0),
        business_score:       Number(r.business_score    ?? 0),
        revenue_per_click:    Number(r.revenue_per_click ?? 0),
        avg_roas:             Number(r.avg_roas           ?? 0),
        avg_ctr:              Number(r.avg_ctr            ?? 0),
        cvr:                  Number(r.cvr                ?? 0),
        posting_weight:       Number(r.posting_weight     ?? 0),
        generation_weight:    Number(r.generation_weight  ?? 0),
        exploration_eligible: r.exploration_eligible ?? true,
        ema_cvr:              r.ema_cvr              != null ? Number(r.ema_cvr)              : null,
        ema_ctr:              r.ema_ctr              != null ? Number(r.ema_ctr)              : null,
        ema_revenue_per_click: r.ema_revenue_per_click != null ? Number(r.ema_revenue_per_click) : null,
      })) as HookFamilyRow[]
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

function useRunnerConfig() {
  return useQuery<RunnerConfigRow>({
    queryKey: ['auto_runner_config'],
    queryFn: async () => {
      const { data } = await supabase
        .from('auto_runner_config')
        .select('*')
        .eq('id', 'singleton')
        .single()
      return {
        use_real_metrics:            data?.use_real_metrics            ?? true,
        exploration_floor:           Number(data?.exploration_floor)   ?? 0.25,
        clone_threshold_conversions: data?.clone_threshold_conversions ?? 20,
        max_family_weight:           Number(data?.max_family_weight)   ?? 0.60,
        daily_generation_goal:       data?.daily_generation_goal       ?? 50,
        reality_mode_enabled:        data?.reality_mode_enabled        ?? true,
        auto_optimize_enabled:       data?.auto_optimize_enabled       ?? false,
        optimize_interval_hours:     data?.optimize_interval_hours     ?? 4,
        max_weight_delta_per_cycle:  Number(data?.max_weight_delta_per_cycle) ?? 0.05,
        ucb1_exploration_constant:   Number(data?.ucb1_exploration_constant)  ?? 0.50,
        min_views_before_adjust:     data?.min_views_before_adjust     ?? 500,
        optimizer_cycle_count:       data?.optimizer_cycle_count       ?? 0,
        last_optimized_at:           data?.last_optimized_at           ?? null,
        // Phase 4: stability
        kill_switch_active:          data?.kill_switch_active          ?? false,
        kill_switch_reason:          data?.kill_switch_reason          ?? null,
        kill_switch_triggered_at:    data?.kill_switch_triggered_at    ?? null,
        stable_snapshot_at:          data?.stable_snapshot_at          ?? null,
        revenue_drop_threshold:      Number(data?.revenue_drop_threshold)      ?? 0.20,
        entropy_collapse_threshold:  Number(data?.entropy_collapse_threshold)  ?? 0.25,
        dynamic_exploration:         data?.dynamic_exploration         ?? true,
        entropy_boost_factor:        Number(data?.entropy_boost_factor)        ?? 0.50,
        variance_discount_factor:    Number(data?.variance_discount_factor)    ?? 0.20,
        current_entropy:             data?.current_entropy             != null ? Number(data.current_entropy) : null,
        current_exploration_floor:   data?.current_exploration_floor   != null ? Number(data.current_exploration_floor) : null,
        total_cumulative_regret:     Number(data?.total_cumulative_regret)     ?? 0,
        // Phase 5: validation mode
        system_mode:                 data?.system_mode                ?? 'live',
        ema_alpha:                   Number(data?.ema_alpha)          ?? 0.20,
        ema_entropy:                 data?.ema_entropy                != null ? Number(data.ema_entropy) : null,
        ema_entropy_n:               data?.ema_entropy_n              ?? 0,
        entropy_ema_alpha:           Number(data?.entropy_ema_alpha)  ?? 0.30,
        floor_smoothing_alpha:       Number(data?.floor_smoothing_alpha) ?? 0.15,
        max_weight_shift_per_cycle:  Number(data?.max_weight_shift_per_cycle) ?? 0.10,
      } as RunnerConfigRow
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  })
}

function useOptimizerLog(limit = 20) {
  return useQuery<OptimizerLogEntry[]>({
    queryKey: ['optimizer_log', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('optimizer_log')
        .select('id, run_at, triggered_by, cycle_number, actions_taken, skipped_reason, total_reward, exploration_pct, payload, duration_ms')
        .order('run_at', { ascending: false })
        .limit(limit)
      if (error) return []
      return (data ?? []) as OptimizerLogEntry[]
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  })
}

// ─── Regret Log hook ─────────────────────────────────────────────────────────

interface RegretLogEntry {
  id: string
  created_at: string
  cycle_number: number
  family_id: string
  display_name: string | null
  old_weight: number
  new_weight: number
  weight_delta: number
  expected_reward: number
  snapshot_revenue: number
  actual_revenue_delta: number | null
  regret_score: number | null
  policy_version: number
  evaluation_window_hours: number
  evaluated_at: string | null
}

function useRegretLog(limit = 30) {
  return useQuery<RegretLogEntry[]>({
    queryKey: ['optimizer_regret_log', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('optimizer_regret_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) return []
      return (data ?? []) as RegretLogEntry[]
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  })
}

// ─── Pending Actions (test mode) ─────────────────────────────────────────────

interface PendingAction {
  id: string
  created_at: string
  cycle_number: number
  action_type: string
  family_id: string | null
  display_name: string | null
  proposed_value: number | null
  current_value: number | null
  reason: string | null
  status: string    // 'pending' | 'approved' | 'rejected' | 'auto_approved'
  reviewed_at: string | null
  payload: Record<string, unknown>
}

function usePendingActions() {
  return useQuery<PendingAction[]>({
    queryKey: ['pending_actions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pending_actions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) return []
      return (data ?? []) as PendingAction[]
    },
    staleTime: 15_000,
    refetchInterval: 15_000,
  })
}

// ─── Pure decision + drift functions ─────────────────────────────────────────

function computeDecisionActions(
  families: HookFamilyRow[],
  cfg: RunnerConfigRow
): DecisionAction[] {
  const actions: DecisionAction[] = []
  const threshold = cfg.clone_threshold_conversions

  for (const f of families) {
    const realConv  = f.real_conversions
    const hasData   = realConv >= threshold
    const cvr       = f.cvr
    const roas      = f.avg_roas
    const weight    = f.posting_weight
    const views     = f.total_views
    const revClick  = f.revenue_per_click

    // INCREASE_WEIGHT — high CVR + enough real conversions + room to grow
    if (hasData && cvr > 2.5 && weight < cfg.max_family_weight - 0.04) {
      actions.push({
        type: 'INCREASE_WEIGHT', target: f.id, display_name: f.display_name,
        value: 0.05,
        reason: `CVR ${cvr.toFixed(2)}% · ${realConv} real convs · $${revClick.toFixed(2)}/click`,
        safe: true,
      })
    }

    // PAUSE_FAMILY — poor CVR after significant exposure
    if (views > 1500 && cvr < 1.5 && weight > 0 && f.id !== 'money-while-i-slept') {
      actions.push({
        type: 'PAUSE_FAMILY', target: f.id, display_name: f.display_name,
        reason: `CVR ${cvr.toFixed(2)}% < 1.5% threshold after ${fmtN(views)} views`,
        safe: true,
      })
    }

    // CLONE_WINNERS — high ROAS but underweighted AND has ≥ threshold real conversions
    if (hasData && roas > 2.0 && weight < 0.20) {
      actions.push({
        type: 'CLONE_WINNERS', target: f.id, display_name: f.display_name,
        multiplier: 2,
        reason: `ROAS ${roas.toFixed(2)}x · ${realConv} real convs — needs more creative volume`,
        safe: true,
      })
    }

    // REDUCE_WEIGHT — dominates too much
    if (weight > cfg.max_family_weight) {
      actions.push({
        type: 'REDUCE_WEIGHT', target: f.id, display_name: f.display_name,
        value: weight - cfg.max_family_weight,
        reason: `Weight ${(weight * 100).toFixed(0)}% exceeds max ${(cfg.max_family_weight * 100).toFixed(0)}% — exploration risk`,
        safe: true,
      })
    }
  }

  // ENFORCE_EXPLORATION — if top family dominates
  const topFamily = families[0]
  if (topFamily && topFamily.posting_weight > cfg.max_family_weight) {
    actions.push({
      type: 'ENFORCE_EXPLORATION', target: 'all',
      value: cfg.exploration_floor,
      reason: `${topFamily.display_name} at ${(topFamily.posting_weight * 100).toFixed(0)}% — exploration floor ${(cfg.exploration_floor * 100).toFixed(0)}% enforced`,
      safe: true,
    })
  }

  // Safe-guard: warn about families that have NO real conversions but high weight
  for (const f of families) {
    if (f.real_conversions === 0 && f.posting_weight >= 0.20 && cfg.use_real_metrics) {
      actions.push({
        type: 'REDUCE_WEIGHT', target: f.id, display_name: f.display_name,
        value: 0.05,
        reason: `0 real conversions yet weight=${(f.posting_weight*100).toFixed(0)}% — simulated ROAS not trusted`,
        safe: false,
      })
    }
  }

  return actions
}

function computeDriftAlerts(
  families: HookFamilyRow[],
  cfg: RunnerConfigRow
): DriftAlert[] {
  const alerts: DriftAlert[] = []

  // Exploration collapse
  const topWeight = Math.max(...families.map(f => f.posting_weight), 0)
  if (topWeight > 0.65) {
    alerts.push({
      severity: 'HIGH',
      issue: `Exploration collapse detected — top family at ${(topWeight * 100).toFixed(0)}%`,
      fix: `Set exploration_floor ≥ 0.25 so ${(0.25 * 100).toFixed(0)}% of posts go to under-tested families`,
    })
  }

  // ROAS vs hook score divergence
  for (const f of families) {
    if (f.avg_hook_score > 88 && f.avg_roas < 0.5 && f.total_conversions > 5) {
      alerts.push({
        severity: 'MEDIUM',
        issue: `Hook/ROAS divergence in "${f.display_name}" — hook ${f.avg_hook_score.toFixed(0)} but ROAS ${f.avg_roas.toFixed(2)}x`,
        fix: 'Audit product-hook alignment and check landing page CVR',
      })
    }
  }

  // CTR drop — views rising but clicks flat (check top family)
  const topFamily = families[0]
  if (topFamily && topFamily.total_views > 5000 && topFamily.avg_ctr < 1.0) {
    alerts.push({
      severity: 'MEDIUM',
      issue: `Low CTR (${topFamily.avg_ctr.toFixed(2)}%) in "${topFamily.display_name}" despite high view volume`,
      fix: 'Rotate hook angles — audience may be fatiguing on current format',
    })
  }

  // Simulated metrics being used for decisions
  if (!cfg.use_real_metrics) {
    alerts.push({
      severity: 'HIGH',
      issue: 'REALITY MODE OFF — family weights may be based on simulated revenue',
      fix: 'Enable use_real_metrics so only Stripe-confirmed conversions affect system decisions',
    })
  }

  // No real conversions anywhere — still in warm-up
  const totalRealConv = families.reduce((s, f) => s + f.real_conversions, 0)
  if (totalRealConv === 0) {
    alerts.push({
      severity: 'LOW',
      issue: 'Zero real Stripe conversions yet — all scoring is pre-market estimate',
      fix: 'System is in warm-up mode. Wait for first real sales before applying family weight changes.',
    })
  }

  return alerts
}

// Projection: if we increase a family's weight by +10%, estimated revenue change
function projectImpact(family: HookFamilyRow, deltaWeight: number, allRevenue: number) {
  const currentShare  = family.posting_weight
  const newShare      = Math.min(currentShare + deltaWeight, 0.80)
  const revPerWeight  = currentShare > 0 ? family.total_revenue / currentShare : 0
  const projRevenue   = revPerWeight * newShare
  const deltaRevenue  = projRevenue - family.total_revenue
  const projCTR       = family.avg_ctr * (newShare / (currentShare || 0.01)) * 0.7 // saturation discount
  const projCVR       = family.cvr   // CVR is property of hook, not volume
  const revenueShare  = allRevenue > 0 ? (projRevenue / allRevenue) * 100 : 0

  return { deltaRevenue, projRevenue, projCTR: Math.min(projCTR, family.avg_ctr * 1.3), projCVR, revenueShare }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const PLATFORM_ICONS: Record<string, string> = {
  twitter: '𝕏',
  tiktok: '♪',
  instagram: '◈',
  youtube: '▶',
  linkedin: 'in',
}

const PLATFORM_COLORS: Record<string, string> = {
  twitter:   '#1d9bf0',
  tiktok:    '#ff0050',
  instagram: '#e1306c',
  youtube:   '#ff0000',
  linkedin:  '#0077b5',
}

const PEAK_HOURS: Record<string, string[]> = {
  twitter:   ['8 AM', '12 PM', '5 PM', '9 PM'],
  tiktok:    ['6 AM', '2 PM', '9 PM'],
  instagram: ['7 AM', '11 AM', '6 PM'],
  youtube:   ['12 PM', '4 PM', '8 PM'],
  linkedin:  ['9 AM', '12 PM', '5 PM'],
}

function fmt$(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${n.toFixed(2)}`
}

function fmtN(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`
  return String(Math.round(n))
}

function scoreColor(s: number) {
  if (s >= 90) return '#22c55e'
  if (s >= 75) return '#f59e0b'
  return '#ef4444'
}

function miniBar(value: number, max: number, color: string) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div style={{ width: '100%', background: 'rgba(255,255,255,0.08)', borderRadius: 3, height: 6 }}>
      <div style={{ width: `${pct}%`, background: color, borderRadius: 3, height: 6, transition: 'width 0.4s ease' }} />
    </div>
  )
}

// Simple sparkline using inline SVG
function Sparkline({ data, color = '#22c55e', height = 40 }: { data: number[]; color?: string; height?: number }) {
  if (data.length < 2) return <div style={{ height }} />
  const max = Math.max(...data, 0.01)
  const min = Math.min(...data)
  const range = max - min || 1
  const w = 120
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = height - ((v - min) / range) * (height - 4) - 2
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={w} height={height} style={{ overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={pts.split(' ').pop()?.split(',')[0]} cy={pts.split(' ').pop()?.split(',')[1]} r={3} fill={color} />
    </svg>
  )
}

// ─── Component ─────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'hooks' | 'platforms' | 'products' | 'sales' | 'cadence' | 'engine'

export default function GrowthDashboard() {
  const [tab, setTab] = useState<Tab>('overview')
  const [hookFilter, setHookFilter] = useState<'all' | 'viral' | 'good'>('viral')
  const [applyingOpts, setApplyingOpts]   = useState(false)
  const [applyStatus,  setApplyStatus]    = useState<string | null>(null)
  const [impactFamily, setImpactFamily]   = useState<string | null>(null)

  const { data: creatives = [], isLoading: loadingC } = useTopCreatives(50)
  const { data: platforms = [] } = usePlatformStats()
  const { data: daily = [] } = useDailyRevenue(14)
  const { data: products = [] } = useProductRevenue()

  // ── Real Stripe conversion data ──────────────────────────────────────────
  const { data: convEvents = [], isLoading: loadingConv } = useConversionEvents(100)
  const realProductRevenue = useRealProductRevenue(convEvents)

  // ── Decision Engine data ─────────────────────────────────────────────────
  const { data: families = [], refetch: refetchFamilies } = useHookFamilies()
  const { data: runnerCfg, refetch: refetchConfig }       = useRunnerConfig()
  const { data: optimizerLog = [], refetch: refetchLog }  = useOptimizerLog(20)
  const { data: regretLog    = [], refetch: refetchRegret }   = useRegretLog(30)
  const { data: pendingActions = [], refetch: refetchPending } = usePendingActions()
  const [runningOptimizer, setRunningOptimizer]           = useState(false)
  const [optimizerStatus,  setOptimizerStatus]            = useState<string | null>(null)
  const [resettingKS,      setResettingKS]                = useState(false)
  const [savingSnapshot,   setSavingSnapshot]             = useState(false)
  const [togglingMode,     setTogglingMode]               = useState(false)

  // Prefer real conversion_events data; fall back to ugc_creatives aggregates
  // Real revenue = sum of confirmed Stripe payments
  const realRevenue     = convEvents.reduce((s, e) => s + Number(e.amount_usd ?? 0), 0)
  const realConversions = convEvents.length

  // Portfolio-level KPIs — clicks/views from creatives, revenue/conversions from real events
  const allViews       = creatives.reduce((s, c) => s + c.views,       0)
  const allClicks      = creatives.reduce((s, c) => s + c.clicks,      0)
  const allConversions = realConversions > 0 ? realConversions : creatives.reduce((s, c) => s + c.conversions,  0)
  const allRevenue     = realRevenue     > 0 ? realRevenue     : creatives.reduce((s, c) => s + c.revenue_usd,  0)
  const avgHook        = creatives.length > 0 ? creatives.reduce((s, c) => s + c.hook_score, 0) / creatives.length : 0
  const overallCTR     = allViews  > 0 ? (allClicks / allViews) * 100 : 0
  const overallCVR     = allClicks > 0 ? (allConversions / allClicks) * 100 : 0

  // Revenue trend for sparkline
  const revTrend = daily.map(d => d.revenue)

  // Filter creatives for hook analysis
  const filteredHooks = creatives.filter(c => {
    if (hookFilter === 'viral') return c.hook_score >= 90
    if (hookFilter === 'good')  return c.hook_score >= 75 && c.hook_score < 90
    return true
  }).slice(0, 15)

  const maxRev = Math.max(...creatives.map(c => c.revenue_usd), 0.01)

  // ── Decision Engine ───────────────────────────────────────────────────────
  const cfg: RunnerConfigRow = runnerCfg ?? { use_real_metrics: true, exploration_floor: 0.25, clone_threshold_conversions: 20, max_family_weight: 0.60, daily_generation_goal: 50, reality_mode_enabled: true, auto_optimize_enabled: false, optimize_interval_hours: 4, max_weight_delta_per_cycle: 0.05, ucb1_exploration_constant: 1.41, min_views_before_adjust: 100, optimizer_cycle_count: 0, last_optimized_at: null, kill_switch_active: false, kill_switch_reason: null, kill_switch_triggered_at: null, stable_snapshot_at: null, revenue_drop_threshold: 0.20, entropy_collapse_threshold: 0.25, dynamic_exploration: true, entropy_boost_factor: 0.50, variance_discount_factor: 0.20, current_entropy: null, current_exploration_floor: null, total_cumulative_regret: 0, system_mode: 'live', ema_alpha: 0.20, ema_entropy: null, ema_entropy_n: 0, entropy_ema_alpha: 0.30, floor_smoothing_alpha: 0.15, max_weight_shift_per_cycle: 0.10 }
  const isTestMode = cfg.system_mode === 'test'
  const decisionActions = computeDecisionActions(families, cfg)
  const driftAlerts     = computeDriftAlerts(families, cfg)
  const impactFam       = families.find(f => f.id === impactFamily) ?? families[0] ?? null
  const impactData      = impactFam ? projectImpact(impactFam, 0.10, allRevenue) : null
  const safeActions     = decisionActions.filter(a => a.safe)
  const riskActions     = decisionActions.filter(a => !a.safe)

  // ── Apply optimizations handler ───────────────────────────────────────────
  async function applyOptimizations() {
    setApplyingOpts(true)
    setApplyStatus(null)
    try {
      for (const action of safeActions) {
        if (action.type === 'INCREASE_WEIGHT' && action.value !== undefined) {
          // Normalise weights to ensure total ≤ 1
          await supabase.from('hook_families')
            .update({ posting_weight: Math.min((families.find(f => f.id === action.target)?.posting_weight ?? 0) + action.value, cfg.max_family_weight) })
            .eq('id', action.target)
        }
        if (action.type === 'REDUCE_WEIGHT' && action.value !== undefined) {
          const cur = families.find(f => f.id === action.target)?.posting_weight ?? 0
          await supabase.from('hook_families')
            .update({ posting_weight: Math.max(cur - action.value, 0.02) })
            .eq('id', action.target)
        }
        if (action.type === 'PAUSE_FAMILY') {
          await supabase.from('hook_families')
            .update({ status: 'paused', posting_weight: 0, generation_weight: 0 })
            .eq('id', action.target)
        }
        if (action.type === 'ENFORCE_EXPLORATION' && action.value !== undefined) {
          await supabase.from('auto_runner_config')
            .update({ exploration_floor: action.value, updated_at: new Date().toISOString() })
            .eq('id', 'singleton')
        }
      }
      // Renormalise posting weights so they sum ≤ 1
      await supabase.rpc('update_hook_family_stats')
      setApplyStatus(`✅ Applied ${safeActions.length} optimisation${safeActions.length !== 1 ? 's' : ''}. AutoRunner will pick up changes within 2 min.`)
      await Promise.all([refetchFamilies(), refetchConfig()])
    } catch (err) {
      setApplyStatus(`❌ Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setApplyingOpts(false)
    }
  }

  // ── Trigger a manual optimizer run ───────────────────────────────────────
  async function runOptimizerNow() {
    setRunningOptimizer(true)
    setOptimizerStatus(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auto-optimizer`
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'x-triggered-by': 'manual',
        },
        body: '{}',
      })
      const result = await resp.json() as Record<string, unknown>
      if (result.success) {
        setOptimizerStatus(`✅ Cycle ${result.cycle}: ${result.actions_taken} updates · ${typeof result.exploration_pct === 'number' ? result.exploration_pct.toFixed(1) : '0'}% exploration · ${result.duration_ms}ms`)
      } else if (result.skipped) {
        setOptimizerStatus(`⏭ Skipped: ${result.reason}`)
      } else {
        setOptimizerStatus(`❌ Error: ${JSON.stringify(result).slice(0, 100)}`)
      }
      await Promise.all([refetchFamilies(), refetchConfig(), refetchLog()])
    } catch (err) {
      setOptimizerStatus(`❌ ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setRunningOptimizer(false)
    }
  }

  async function toggleAutoOptimize(enabled: boolean) {
    await supabase.from('auto_runner_config')
      .update({ auto_optimize_enabled: enabled, updated_at: new Date().toISOString() })
      .eq('id', 'singleton')
    await refetchConfig()
  }

  // ── Kill switch reset ──────────────────────────────────────────────────────
  async function resetKillSwitch() {
    setResettingKS(true)
    try {
      await supabase.from('auto_runner_config')
        .update({ kill_switch_active: false, kill_switch_reason: null, kill_switch_triggered_at: null })
        .eq('id', 'singleton')
      await refetchConfig()
    } finally {
      setResettingKS(false)
    }
  }

  // ── Save stable snapshot manually ─────────────────────────────────────────
  async function saveSnapshot() {
    setSavingSnapshot(true)
    try {
      await supabase.rpc('save_stable_snapshot')
      await refetchConfig()
    } finally {
      setSavingSnapshot(false)
    }
  }

  // ── Toggle system mode (test ↔ live) ──────────────────────────────────────
  async function toggleSystemMode() {
    setTogglingMode(true)
    const next = cfg.system_mode === 'test' ? 'live' : 'test'
    try {
      await supabase.from('auto_runner_config')
        .update({ system_mode: next })
        .eq('id', 'singleton')
      await refetchConfig()
    } finally {
      setTogglingMode(false)
    }
  }

  // ── Approve / reject pending action ──────────────────────────────────────
  async function reviewPendingAction(id: string, approve: boolean) {
    await supabase.from('pending_actions').update({
      status: approve ? 'approved' : 'rejected',
      reviewed_at: new Date().toISOString(),
    }).eq('id', id)
    await refetchPending()
  }

  const styles = {
    container: {
      background: '#0a0a0f',
      color: '#e2e8f0',
      minHeight: '100vh',
      padding: '24px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: 24,
    },
    pulse: {
      width: 10,
      height: 10,
      borderRadius: '50%',
      background: '#22c55e',
      boxShadow: '0 0 8px #22c55e',
      animation: 'pulse 2s infinite',
    },
    title: {
      fontSize: 22,
      fontWeight: 700,
      background: 'linear-gradient(135deg, #22c55e, #06b6d4)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
    },
    kpiGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
      gap: 12,
      marginBottom: 24,
    },
    kpiCard: {
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12,
      padding: '16px',
    },
    kpiLabel: { fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: 1 },
    kpiValue: { fontSize: 26, fontWeight: 700, margin: '4px 0 2px' },
    kpiSub:   { fontSize: 12, color: '#64748b' },
    tabs: {
      display: 'flex',
      gap: 4,
      marginBottom: 20,
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      paddingBottom: 0,
    },
    tab: (active: boolean): React.CSSProperties => ({
      padding: '8px 16px',
      borderRadius: '8px 8px 0 0',
      fontSize: 13,
      fontWeight: active ? 600 : 400,
      color: active ? '#22c55e' : '#64748b',
      background: active ? 'rgba(34,197,94,0.08)' : 'transparent',
      border: 'none',
      borderBottom: active ? '2px solid #22c55e' : '2px solid transparent',
      cursor: 'pointer',
      transition: 'all 0.2s',
    }),
    card: {
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12,
      padding: '20px',
      marginBottom: 16,
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse' as const,
      fontSize: 13,
    },
    th: {
      textAlign: 'left' as const,
      color: '#64748b',
      fontSize: 11,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.5,
      padding: '8px 10px',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    },
    td: {
      padding: '10px 10px',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
      verticalAlign: 'middle' as const,
    },
    badge: (color: string): React.CSSProperties => ({
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 600,
      background: color + '22',
      color,
      border: `1px solid ${color}44`,
    }),
  }

  return (
    <div style={styles.container}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.4)} }`}</style>

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.pulse} />
        <span style={styles.title}>Growth Dashboard</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#475569' }}>
          Live · {new Date().toLocaleTimeString()}
        </span>
      </div>

      {/* KPI Row */}
      <div style={styles.kpiGrid}>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Total Revenue</div>
          <div style={{ ...styles.kpiValue, color: '#22c55e' }}>{fmt$(allRevenue)}</div>
          <div style={styles.kpiSub}>
            <Sparkline data={revTrend} color="#22c55e" height={24} />
          </div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Total Views</div>
          <div style={{ ...styles.kpiValue, color: '#06b6d4' }}>{fmtN(allViews)}</div>
          <div style={styles.kpiSub}>{fmtN(allClicks)} clicks</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Overall CTR</div>
          <div style={{ ...styles.kpiValue, color: '#f59e0b' }}>{overallCTR.toFixed(2)}%</div>
          <div style={styles.kpiSub}>CVR {overallCVR.toFixed(2)}%</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Conversions</div>
          <div style={{ ...styles.kpiValue, color: '#a78bfa' }}>{fmtN(allConversions)}</div>
          <div style={styles.kpiSub}>{fmt$(allRevenue / Math.max(allConversions, 1))} / sale</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Avg Hook Score</div>
          <div style={{ ...styles.kpiValue, color: scoreColor(avgHook) }}>{avgHook.toFixed(1)}</div>
          <div style={styles.kpiSub}>{creatives.filter(c => c.hook_score >= 90).length} viral hooks</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Creatives</div>
          <div style={{ ...styles.kpiValue, color: '#e2e8f0' }}>{creatives.length}</div>
          <div style={styles.kpiSub}>{creatives.filter(c => c.status === 'posted').length} posted</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        {(['overview', 'hooks', 'platforms', 'products', 'sales', 'cadence'] as Tab[]).map(t => (
          <button key={t} style={styles.tab(tab === t)} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        {/* Engine tab — highlighted */}
        <button
          style={{ ...styles.tab(tab === 'engine') as React.CSSProperties, color: tab === 'engine' ? '#a78bfa' : '#7c3aed', borderBottom: tab === 'engine' ? '2px solid #a78bfa' : '2px solid transparent' }}
          onClick={() => setTab('engine')}
        >
          ⚡ Engine
        </button>
      </div>

      {/* ── OVERVIEW TAB ── */}
      {tab === 'overview' && (
        <>
          {/* Daily revenue + posts chart */}
          <div style={styles.card}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>📈 14-Day Revenue & Posts</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 80 }}>
              {daily.map((d, i) => {
                const maxRev14 = Math.max(...daily.map(x => x.revenue), 0.01)
                const h = Math.max(4, (d.revenue / maxRev14) * 70)
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <div
                      style={{ width: '100%', height: h, background: d.revenue > 0 ? 'linear-gradient(#22c55e, #059669)' : 'rgba(255,255,255,0.06)', borderRadius: '3px 3px 0 0', transition: 'height 0.4s' }}
                      title={`${d.date}: ${fmt$(d.revenue)} | ${d.posts} posts`}
                    />
                    <div style={{ fontSize: 9, color: '#475569', writingMode: 'vertical-rl' as const, textOrientation: 'mixed' as const, transform: 'rotate(180deg)', height: 28 }}>
                      {d.date.slice(5)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Top 5 revenue creatives */}
          <div style={styles.card}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>🏆 Top Revenue Creatives</div>
            {loadingC ? (
              <div style={{ color: '#64748b', fontSize: 13 }}>Loading…</div>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Creative</th>
                    <th style={styles.th}>Platform</th>
                    <th style={styles.th}>Hook</th>
                    <th style={styles.th}>Views</th>
                    <th style={styles.th}>CTR</th>
                    <th style={styles.th}>Revenue</th>
                    <th style={styles.th}>Bar</th>
                  </tr>
                </thead>
                <tbody>
                  {creatives.slice(0, 8).map(c => (
                    <tr key={c.id}>
                      <td style={styles.td}>
                        <div style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
                          {c.title}
                        </div>
                      </td>
                      <td style={styles.td}>
                        <span style={styles.badge(PLATFORM_COLORS[c.platform] ?? '#64748b')}>
                          {PLATFORM_ICONS[c.platform] ?? '?'} {c.platform}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <span style={{ color: scoreColor(c.hook_score), fontWeight: 700 }}>{c.hook_score}</span>
                      </td>
                      <td style={styles.td}>{fmtN(c.views)}</td>
                      <td style={styles.td}>{(c.ctr * 100).toFixed(2)}%</td>
                      <td style={{ ...styles.td, color: '#22c55e', fontWeight: 700 }}>{fmt$(c.revenue_usd)}</td>
                      <td style={{ ...styles.td, minWidth: 80 }}>{miniBar(c.revenue_usd, maxRev, '#22c55e')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Funnel visualization */}
          <div style={styles.card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>🔽 Conversion Funnel</span>
              <span style={{ fontSize: 11, color: realRevenue > 0 ? '#22c55e' : '#f59e0b', marginLeft: 'auto' }}>
                {realRevenue > 0 ? `✓ Live Stripe · ${convEvents.length} sales` : '⚠ Simulated · awaiting Stripe'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
              {[
                { label: 'Impressions', value: allViews,       color: '#06b6d4', pct: 100 },
                { label: 'Clicks',      value: allClicks,      color: '#3b82f6', pct: allViews > 0 ? (allClicks / allViews) * 100 : 0 },
                { label: 'Conversions', value: allConversions, color: '#a78bfa', pct: allViews > 0 ? (allConversions / allViews) * 100 : 0 },
                { label: 'Revenue',     value: allRevenue,     color: '#22c55e', pct: null },
              ].map((f, i) => (
                <div key={i} style={{ flex: 1, background: `${f.color}11`, border: `1px solid ${f.color}33`, borderRadius: 10, padding: '14px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>{f.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: f.color }}>
                    {i === 3 ? fmt$(f.value) : fmtN(f.value)}
                  </div>
                  {f.pct !== null && (
                    <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>{f.pct.toFixed(2)}% of top</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── HOOKS TAB ── */}
      {tab === 'hooks' && (
        <div style={styles.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>🎣 Hook Performance</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              {(['all', 'viral', 'good'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setHookFilter(f)}
                  style={{
                    padding: '4px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                    border: 'none',
                    background: hookFilter === f ? '#22c55e' : 'rgba(255,255,255,0.08)',
                    color:      hookFilter === f ? '#000' : '#94a3b8',
                    fontWeight: hookFilter === f ? 700 : 400,
                  }}
                >
                  {f === 'viral' ? '🔥 Viral (90+)' : f === 'good' ? '✅ Good (75-89)' : 'All'}
                </button>
              ))}
            </div>
          </div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>#</th>
                <th style={styles.th}>Hook (first 100 chars)</th>
                <th style={styles.th}>Score</th>
                <th style={styles.th}>Platform</th>
                <th style={styles.th}>Views</th>
                <th style={styles.th}>CTR</th>
                <th style={styles.th}>Revenue</th>
                <th style={styles.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredHooks.map((c, i) => {
                const hook = c.caption.slice(0, 100) + (c.caption.length > 100 ? '…' : '')
                return (
                  <tr key={c.id} style={{ opacity: c.status === 'posted' ? 1 : 0.75 }}>
                    <td style={{ ...styles.td, color: '#475569', width: 30 }}>{i + 1}</td>
                    <td style={styles.td}>
                      <div style={{ fontSize: 12, maxWidth: 320 }}>{hook}</div>
                    </td>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: scoreColor(c.hook_score), fontWeight: 700, fontSize: 14 }}>{c.hook_score}</span>
                        {c.hook_score >= 90 && <span>🔥</span>}
                      </div>
                    </td>
                    <td style={styles.td}>
                      <span style={styles.badge(PLATFORM_COLORS[c.platform] ?? '#64748b')}>
                        {PLATFORM_ICONS[c.platform] ?? '?'} {c.platform}
                      </span>
                    </td>
                    <td style={styles.td}>{fmtN(c.views)}</td>
                    <td style={styles.td}>{(c.ctr * 100).toFixed(2)}%</td>
                    <td style={{ ...styles.td, color: '#22c55e', fontWeight: 600 }}>{fmt$(c.revenue_usd)}</td>
                    <td style={styles.td}>
                      <span style={styles.badge(
                        c.status === 'posted'   ? '#22c55e' :
                        c.status === 'queued'   ? '#f59e0b' :
                        c.status === 'ready'    ? '#06b6d4' : '#64748b'
                      )}>{c.status}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filteredHooks.length === 0 && (
            <div style={{ color: '#475569', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
              No hooks found for this filter
            </div>
          )}
        </div>
      )}

      {/* ── PLATFORMS TAB ── */}
      {tab === 'platforms' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          {platforms.map(p => (
            <div key={p.platform} style={{ ...styles.card, borderColor: (PLATFORM_COLORS[p.platform] ?? '#64748b') + '44' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 24 }}>{PLATFORM_ICONS[p.platform] ?? '?'}</span>
                <span style={{ fontSize: 16, fontWeight: 700, textTransform: 'capitalize' }}>{p.platform}</span>
                <span style={{ marginLeft: 'auto', ...styles.badge(PLATFORM_COLORS[p.platform] ?? '#64748b') }}>
                  {p.count} creatives
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                {[
                  { l: 'Views',       v: fmtN(p.views),              c: '#06b6d4' },
                  { l: 'Clicks',      v: fmtN(p.clicks),             c: '#3b82f6' },
                  { l: 'Avg CTR',     v: p.avg_ctr.toFixed(2) + '%', c: '#f59e0b' },
                  { l: 'Revenue',     v: fmt$(p.revenue),            c: '#22c55e' },
                  { l: 'Conversions', v: fmtN(p.conversions),        c: '#a78bfa' },
                  { l: 'Avg Hook',    v: p.avg_hook.toFixed(1),      c: scoreColor(p.avg_hook) },
                ].map(({ l, v, c }) => (
                  <div key={l}>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{l}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: c }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: '#475569', marginTop: 8 }}>
                ⏰ Peak hours: {(PEAK_HOURS[p.platform] ?? ['N/A']).join(' · ')}
              </div>
              {miniBar(p.revenue, Math.max(...platforms.map(x => x.revenue), 0.01), PLATFORM_COLORS[p.platform] ?? '#64748b')}
            </div>
          ))}
          {platforms.length === 0 && (
            <div style={{ color: '#475569', fontSize: 13, padding: 20 }}>No platform data yet</div>
          )}
        </div>
      )}

      {/* ── PRODUCTS TAB ── */}
      {tab === 'products' && (
        <>
          {/* Source indicator */}
          <div style={{ marginBottom: 10, fontSize: 12, color: '#475569', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: realRevenue > 0 ? '#22c55e' : '#f59e0b', display: 'inline-block' }} />
            {realRevenue > 0
              ? `Live Stripe data · ${convEvents.length} confirmed payments`
              : 'Simulated data — awaiting first Stripe conversion'}
          </div>
          <div style={styles.card}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>💰 Revenue by Product</div>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Product</th>
                  <th style={styles.th}>Creatives</th>
                  <th style={styles.th}>Sales</th>
                  <th style={styles.th}>Revenue</th>
                  <th style={styles.th}>Rev / Sale</th>
                  <th style={styles.th}>Share</th>
                </tr>
              </thead>
              <tbody>
                {(realRevenue > 0 ? realProductRevenue : products).map(p => {
                  const displaySet  = realRevenue > 0 ? realProductRevenue : products
                  const maxProd = Math.max(...displaySet.map(x => x.revenue), 0.01)
                  return (
                    <tr key={p.url_fragment}>
                      <td style={{ ...styles.td, fontWeight: 500 }}>{p.product}</td>
                      <td style={styles.td}>{p.creatives}</td>
                      <td style={{ ...styles.td, color: '#a78bfa' }}>{p.conversions}</td>
                      <td style={{ ...styles.td, color: '#22c55e', fontWeight: 700 }}>{fmt$(p.revenue)}</td>
                      <td style={{ ...styles.td, color: '#f59e0b' }}>{fmt$(p.conversions > 0 ? p.revenue / p.conversions : 0)}</td>
                      <td style={{ ...styles.td, minWidth: 100 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {miniBar(p.revenue, maxProd, '#22c55e')}
                          <span style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>
                            {allRevenue > 0 ? ((p.revenue / allRevenue) * 100).toFixed(0) : 0}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── SALES TAB — Real Stripe conversion feed ── */}
      {tab === 'sales' && (
        <>
          <div style={{ marginBottom: 10, fontSize: 12, color: '#475569', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: convEvents.length > 0 ? '#22c55e' : '#475569', display: 'inline-block', animation: convEvents.length > 0 ? 'pulse 2s infinite' : 'none' }} />
            {loadingConv ? 'Loading…' : convEvents.length > 0
              ? `${convEvents.length} confirmed Stripe payments · ${fmt$(realRevenue)} total`
              : 'No conversions yet — Stripe webhook will populate this on first sale'}
          </div>

          {/* KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Total Revenue',      value: fmt$(realRevenue),                              color: '#22c55e' },
              { label: 'Sales',              value: String(realConversions),                         color: '#a78bfa' },
              { label: 'Avg Order Value',    value: fmt$(realConversions > 0 ? realRevenue / realConversions : 0), color: '#f59e0b' },
              { label: 'Attributed Sales',   value: `${convEvents.filter(e => e.creative_id).length} / ${convEvents.length}`, color: '#06b6d4' },
            ].map(k => (
              <div key={k.label} style={{ ...styles.card, padding: '12px 14px', marginBottom: 0 }}>
                <div style={{ fontSize: 11, color: '#64748b' }}>{k.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: k.color, marginTop: 4 }}>{k.value}</div>
              </div>
            ))}
          </div>

          <div style={styles.card}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>💳 Recent Stripe Sales</div>
            {convEvents.length === 0 ? (
              <div style={{ color: '#475569', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
                No sales yet — your first Stripe payment will appear here instantly via webhook.
              </div>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Time</th>
                    <th style={styles.th}>Product</th>
                    <th style={styles.th}>Amount</th>
                    <th style={styles.th}>Attribution</th>
                    <th style={styles.th}>UTM Source</th>
                    <th style={styles.th}>Buyer</th>
                  </tr>
                </thead>
                <tbody>
                  {convEvents.map(e => (
                    <tr key={e.id}>
                      <td style={{ ...styles.td, color: '#64748b', fontSize: 11, whiteSpace: 'nowrap' }}>
                        {new Date(e.processed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={styles.td}>{e.product_name ?? '—'}</td>
                      <td style={{ ...styles.td, color: '#22c55e', fontWeight: 700 }}>{fmt$(Number(e.amount_usd ?? 0))}</td>
                      <td style={styles.td}>
                        <span style={styles.badge(
                          e.attribution_method === 'metadata'          ? '#22c55e' :
                          e.attribution_method === 'utm_content'        ? '#06b6d4' :
                          e.attribution_method?.startsWith('product_map') ? '#f59e0b' : '#64748b'
                        )}>
                          {e.attribution_method ?? 'unknown'}
                        </span>
                      </td>
                      <td style={{ ...styles.td, color: '#94a3b8', fontSize: 12 }}>{e.utm_source ?? '—'}</td>
                      <td style={{ ...styles.td, color: '#64748b', fontSize: 12 }}>
                        {e.buyer_email ? e.buyer_email.replace(/(.{2}).*(@.*)/, '$1…$2') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ── CADENCE TAB ── */}
      {tab === 'cadence' && (
        <>
          <div style={styles.card}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>📅 Optimal Posting Schedule</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              {Object.entries(PEAK_HOURS).map(([platform, hours]) => (
                <div key={platform} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${(PLATFORM_COLORS[platform] ?? '#64748b')}33`, borderRadius: 10, padding: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 18 }}>{PLATFORM_ICONS[platform] ?? '?'}</span>
                    <span style={{ fontWeight: 600, textTransform: 'capitalize', color: PLATFORM_COLORS[platform] ?? '#e2e8f0' }}>{platform}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
                    {hours.map(h => (
                      <span key={h} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 12, background: `${PLATFORM_COLORS[platform] ?? '#64748b'}22`, color: PLATFORM_COLORS[platform] ?? '#e2e8f0', border: `1px solid ${PLATFORM_COLORS[platform] ?? '#64748b'}44` }}>
                        {h} EST
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Daily posting stats */}
          <div style={styles.card}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>📊 Posting Activity (14 days)</div>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Date</th>
                  <th style={styles.th}>Posts</th>
                  <th style={styles.th}>Clicks</th>
                  <th style={styles.th}>Revenue</th>
                  <th style={styles.th}>Rev/Post</th>
                </tr>
              </thead>
              <tbody>
                {[...daily].reverse().map(d => (
                  <tr key={d.date}>
                    <td style={{ ...styles.td, color: '#94a3b8' }}>{d.date}</td>
                    <td style={styles.td}>{d.posts}</td>
                    <td style={{ ...styles.td, color: '#06b6d4' }}>{fmtN(d.clicks)}</td>
                    <td style={{ ...styles.td, color: '#22c55e', fontWeight: d.revenue > 0 ? 700 : 400 }}>{fmt$(d.revenue)}</td>
                    <td style={{ ...styles.td, color: '#f59e0b' }}>{d.posts > 0 ? fmt$(d.revenue / d.posts) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── ENGINE TAB ── */}
      {tab === 'engine' && (
        <>
          {/* ══ TEST MODE BANNER ════════════════════════════════════════ */}
          <div style={{ ...styles.card, background: isTestMode ? 'rgba(245,158,11,0.10)' : 'rgba(34,197,94,0.06)', border: `2px solid ${isTestMode ? 'rgba(245,158,11,0.7)' : 'rgba(34,197,94,0.4)'}`, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' as const }}>
              <div style={{ fontSize: 22 }}>{isTestMode ? '🧪' : '🟢'}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: isTestMode ? '#f59e0b' : '#22c55e', letterSpacing: 0.5 }}>
                  {isTestMode ? 'TEST MODE — Validation Active' : 'LIVE MODE — Full Execution Active'}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>
                  {isTestMode
                    ? 'AutoRunner paused. Optimizer logs decisions as pending_actions. No destructive operations execute. Safe to observe.'
                    : 'AutoRunner executing. Optimizer promotes weights, applies policy, executes postings and cloning.'}
                </div>
                {isTestMode && (
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    EMA signals: α={cfg.ema_alpha} · Entropy EMA α={cfg.entropy_ema_alpha} · Floor smoothing ±{(cfg.floor_smoothing_alpha*100).toFixed(0)}%/cycle · Weight clamp ±{(cfg.max_weight_shift_per_cycle*100).toFixed(0)}%
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6, alignItems: 'flex-end' }}>
                {isTestMode && (
                  <span style={{ fontSize: 11, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                    {pendingActions.filter(a => a.status === 'pending').length} pending actions awaiting review
                  </span>
                )}
                <button
                  onClick={toggleSystemMode}
                  disabled={togglingMode}
                  style={{ padding: '8px 18px', borderRadius: 8, border: 'none', fontWeight: 700, fontSize: 13, cursor: togglingMode ? 'not-allowed' : 'pointer', opacity: togglingMode ? 0.7 : 1, background: isTestMode ? '#22c55e' : '#f59e0b', color: '#000' }}
                >
                  {togglingMode ? '⏳' : isTestMode ? '▶ Switch to LIVE' : '🧪 Switch to TEST'}
                </button>
              </div>
            </div>
          </div>

          {/* ── Kill Switch Banner ──────────────────────────────────────── */}
          {cfg.kill_switch_active && (
            <div style={{ ...styles.card, background: 'rgba(239,68,68,0.12)', border: '2px solid rgba(239,68,68,0.70)', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const }}>
                <div style={{ fontSize: 24 }}>⛔</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: '#ef4444', letterSpacing: 1 }}>
                    KILL SWITCH ACTIVE — All Optimization Frozen
                  </div>
                  <div style={{ fontSize: 12, color: '#fca5a5', marginTop: 4 }}>
                    {cfg.kill_switch_reason ?? 'Optimizer triggered safety freeze.'} AutoRunner posting is paused.
                  </div>
                  {cfg.kill_switch_triggered_at && (
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      Triggered: {new Date(cfg.kill_switch_triggered_at).toLocaleString()}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={saveSnapshot}
                    disabled={savingSnapshot}
                    style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.4)', background: 'transparent', color: '#fca5a5', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
                  >
                    {savingSnapshot ? '💾 Saving…' : '💾 Save Snapshot'}
                  </button>
                  <button
                    onClick={resetKillSwitch}
                    disabled={resettingKS}
                    style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 700, cursor: resettingKS ? 'not-allowed' : 'pointer', opacity: resettingKS ? 0.7 : 1 }}
                  >
                    {resettingKS ? '⏳ Resetting…' : '✅ Clear Kill Switch'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Entropy + Dynamic Floor Gauge ───────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            {/* Entropy card */}
            <div style={{ ...styles.card, border: `1px solid ${(cfg.current_entropy ?? 1) < cfg.entropy_collapse_threshold ? 'rgba(239,68,68,0.5)' : 'rgba(99,102,241,0.3)'}` }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>WEIGHT ENTROPY</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: (cfg.current_entropy ?? 1) < cfg.entropy_collapse_threshold ? '#ef4444' : '#a78bfa' }}>
                {cfg.current_entropy != null ? (cfg.current_entropy * 100).toFixed(0) + '%' : '—'}
              </div>
              <div style={{ marginTop: 6, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(cfg.current_entropy ?? 0) * 100}%`, background: (cfg.current_entropy ?? 1) < cfg.entropy_collapse_threshold ? '#ef4444' : '#7c3aed', transition: 'width 0.4s' }} />
              </div>
              <div style={{ fontSize: 10, color: '#475569', marginTop: 4 }}>
                0% = fully collapsed · 100% = uniform · kill at {(cfg.entropy_collapse_threshold * 100).toFixed(0)}%
              </div>
            </div>
            {/* Dynamic floor card */}
            <div style={{ ...styles.card, border: '1px solid rgba(6,182,212,0.3)' }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>EFFECTIVE EXPLORE FLOOR</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#06b6d4' }}>
                {cfg.current_exploration_floor != null
                  ? (cfg.current_exploration_floor * 100).toFixed(0) + '%'
                  : (cfg.exploration_floor * 100).toFixed(0) + '%'}
              </div>
              <div style={{ marginTop: 6, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(cfg.current_exploration_floor ?? cfg.exploration_floor) * 100}%`, background: '#0891b2', transition: 'width 0.4s' }} />
              </div>
              <div style={{ fontSize: 10, color: '#475569', marginTop: 4 }}>
                Base: {(cfg.exploration_floor * 100).toFixed(0)}% {cfg.dynamic_exploration ? '· dynamic on (entropy-tuned)' : '· static'}
              </div>
            </div>
            {/* Cumulative regret card */}
            <div style={{ ...styles.card, border: '1px solid rgba(245,158,11,0.3)' }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>CUMULATIVE REGRET</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: cfg.total_cumulative_regret > 0 ? '#f59e0b' : '#22c55e' }}>
                {cfg.total_cumulative_regret > 0 ? '+' : ''}{cfg.total_cumulative_regret.toFixed(2)}
              </div>
              <div style={{ fontSize: 10, color: '#475569', marginTop: 10 }}>
                Negative = over-estimated rewards · Positive = under-estimated (rare)
              </div>
              <button
                onClick={saveSnapshot}
                disabled={savingSnapshot}
                style={{ marginTop: 8, width: '100%', padding: '5px 0', borderRadius: 6, border: '1px solid rgba(245,158,11,0.3)', background: 'transparent', color: '#f59e0b', fontSize: 11, cursor: 'pointer' }}
              >
                {savingSnapshot ? 'Saving…' : '💾 Save Stable Snapshot'}
              </button>
            </div>
          </div>

          {/* ── Reality Mode Banner ─────────────────────────────────────── */}
          <div style={{ ...styles.card, border: cfg.reality_mode_enabled ? '1px solid rgba(34,197,94,0.35)' : '1px solid rgba(239,68,68,0.35)', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const }}>
              <div style={{ fontSize: 18 }}>{cfg.reality_mode_enabled ? '✅' : '⚠️'}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: cfg.reality_mode_enabled ? '#22c55e' : '#ef4444' }}>
                  Reality Mode: {cfg.reality_mode_enabled ? 'ON' : 'OFF'}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                  {cfg.reality_mode_enabled
                    ? 'Only Stripe-confirmed conversions affect family weights & clone decisions.'
                    : 'WARNING: Simulated metrics may influence decisions. Enable reality mode.'}
                </div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, fontSize: 12, color: '#64748b' }}>
                <span>Explore floor: <strong style={{ color: '#a78bfa' }}>{(cfg.exploration_floor * 100).toFixed(0)}%</strong></span>
                <span>Clone after: <strong style={{ color: '#f59e0b' }}>{cfg.clone_threshold_conversions} real convs</strong></span>
                <span>Max weight: <strong style={{ color: '#06b6d4' }}>{(cfg.max_family_weight * 100).toFixed(0)}%</strong></span>
              </div>
            </div>
          </div>

          {/* ── Two-column layout: Decision Engine + Drift Alerts ─────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

            {/* DECISION ENGINE PANEL */}
            <div style={{ ...styles.card, display: 'flex', flexDirection: 'column' as const, gap: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <span style={{ fontSize: 16 }}>🧠</span>
                <span style={{ fontWeight: 700, fontSize: 14 }}>Decision Engine</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#475569' }}>
                  {decisionActions.length} action{decisionActions.length !== 1 ? 's' : ''} computed
                </span>
              </div>

              {decisionActions.length === 0 ? (
                <div style={{ color: '#64748b', fontSize: 13, padding: '12px 0' }}>
                  ✓ System balanced — no actions needed right now.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
                  {decisionActions.map((action, i) => {
                    const typeColors: Record<string, string> = {
                      INCREASE_WEIGHT: '#22c55e', PAUSE_FAMILY: '#ef4444',
                      CLONE_WINNERS: '#a78bfa',   ENFORCE_EXPLORATION: '#f59e0b',
                      REDUCE_WEIGHT: '#f59e0b',
                    }
                    const typeIcons: Record<string, string> = {
                      INCREASE_WEIGHT: '↑', PAUSE_FAMILY: '⏸',
                      CLONE_WINNERS: '⎘',  ENFORCE_EXPLORATION: '🔀',
                      REDUCE_WEIGHT: '↓',
                    }
                    const col = typeColors[action.type] ?? '#94a3b8'
                    return (
                      <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${col}33`, borderRadius: 8, padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ background: col + '22', color: col, borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 700 }}>
                            {typeIcons[action.type]} {action.type.replace(/_/g, ' ')}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>
                            {action.display_name ?? action.target}
                          </span>
                          {!action.safe && (
                            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '1px 6px', borderRadius: 4 }}>
                              ⚠ NEEDS REAL DATA
                            </span>
                          )}
                          {action.value !== undefined && (
                            <span style={{ marginLeft: action.safe ? 'auto' : 4, fontSize: 11, color: col }}>
                              {action.type.includes('WEIGHT') ? `${action.value > 0 ? '+' : ''}${(action.value * 100).toFixed(0)}%` : ''}
                              {action.multiplier !== undefined ? `×${action.multiplier}` : ''}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>{action.reason}</div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Apply button */}
              <div style={{ marginTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 14 }}>
                <button
                  onClick={applyOptimizations}
                  disabled={applyingOpts || safeActions.length === 0}
                  style={{
                    width: '100%', padding: '10px 0', borderRadius: 8, border: 'none', cursor: safeActions.length > 0 ? 'pointer' : 'not-allowed',
                    background: safeActions.length > 0 ? 'linear-gradient(135deg, #22c55e, #059669)' : 'rgba(255,255,255,0.06)',
                    color: safeActions.length > 0 ? '#fff' : '#475569', fontWeight: 700, fontSize: 13,
                    opacity: applyingOpts ? 0.7 : 1,
                  }}
                >
                  {applyingOpts ? '⏳ Applying…' : `🟢 Apply ${safeActions.length} Safe Optimisation${safeActions.length !== 1 ? 's' : ''}`}
                </button>
                {riskActions.length > 0 && (
                  <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 8, textAlign: 'center' as const }}>
                    ⚠ {riskActions.length} action{riskActions.length !== 1 ? 's' : ''} blocked — waiting for {cfg.clone_threshold_conversions} real conversions
                  </div>
                )}
                {applyStatus && (
                  <div style={{ fontSize: 12, marginTop: 8, color: applyStatus.startsWith('✅') ? '#22c55e' : '#ef4444', textAlign: 'center' as const }}>
                    {applyStatus}
                  </div>
                )}
              </div>
            </div>

            {/* DRIFT DETECTION PANEL */}
            <div style={{ ...styles.card, display: 'flex', flexDirection: 'column' as const, gap: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <span style={{ fontSize: 16 }}>🚨</span>
                <span style={{ fontWeight: 700, fontSize: 14 }}>Drift Alerts</span>
                <span style={{ marginLeft: 'auto', fontSize: 11,
                  color: driftAlerts.some(a => a.severity === 'HIGH') ? '#ef4444' : driftAlerts.some(a => a.severity === 'MEDIUM') ? '#f59e0b' : '#22c55e' }}>
                  {driftAlerts.length === 0 ? '✓ No drift' : `${driftAlerts.filter(a => a.severity === 'HIGH').length} HIGH · ${driftAlerts.filter(a => a.severity === 'MEDIUM').length} MED`}
                </span>
              </div>
              {driftAlerts.length === 0 ? (
                <div style={{ color: '#22c55e', fontSize: 13 }}>✓ System stable — no drift detected.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
                  {driftAlerts.map((alert, i) => {
                    const sevColor = alert.severity === 'HIGH' ? '#ef4444' : alert.severity === 'MEDIUM' ? '#f59e0b' : '#06b6d4'
                    return (
                      <div key={i} style={{ background: sevColor + '11', border: `1px solid ${sevColor}33`, borderRadius: 8, padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <span style={{ background: sevColor + '22', color: sevColor, borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>
                            {alert.severity}
                          </span>
                          <span style={{ fontSize: 12, color: '#e2e8f0' }}>{alert.issue}</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>
                          <span style={{ color: '#06b6d4' }}>Fix: </span>{alert.fix}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Scoring split legend */}
              <div style={{ marginTop: 'auto', paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)', borderRadius: 6, padding: '8px 10px' }}>
                  <div style={{ fontSize: 10, color: '#06b6d4', fontWeight: 700, marginBottom: 4 }}>CREATIVE SCORE (pre-market)</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>hook_score · engagement pred · CTR est</div>
                  <div style={{ fontSize: 10, color: '#475569', marginTop: 4 }}>→ posting priority only</div>
                </div>
                <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 6, padding: '8px 10px' }}>
                  <div style={{ fontSize: 10, color: '#22c55e', fontWeight: 700, marginBottom: 4 }}>BUSINESS SCORE (post-Stripe)</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>real convs · revenue · ROAS</div>
                  <div style={{ fontSize: 10, color: '#475569', marginTop: 4 }}>→ weights · cloning · allocation</div>
                </div>
              </div>
            </div>
          </div>

          {/* ── IMPACT CHART ────────────────────────────────────────────────── */}
          <div style={styles.card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' as const }}>
              <span style={{ fontSize: 16 }}>🔥</span>
              <span style={{ fontWeight: 700, fontSize: 14 }}>Impact Chart — +10% Weight Projection</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                {families.filter(f => f.posting_weight > 0).map(f => (
                  <button
                    key={f.id}
                    onClick={() => setImpactFamily(f.id)}
                    style={{
                      padding: '3px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', border: 'none',
                      background: impactFamily === f.id ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.06)',
                      color: impactFamily === f.id ? '#a78bfa' : '#94a3b8',
                      outline: impactFamily === f.id ? '1px solid #a78bfa' : 'none',
                    }}
                  >
                    {f.display_name.split(' ').slice(0, 2).join(' ')}
                  </button>
                ))}
              </div>
            </div>

            {impactFam && impactData ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
                {[
                  { label: 'Current Weight', cur: `${(impactFam.posting_weight * 100).toFixed(0)}%`, proj: `${((impactFam.posting_weight + 0.10) * 100).toFixed(0)}%`, color: '#a78bfa' },
                  { label: 'Projected Revenue', cur: fmt$(impactFam.total_revenue), proj: fmt$(impactData.projRevenue), color: '#22c55e' },
                  { label: 'Revenue Delta', cur: '—', proj: `${impactData.deltaRevenue >= 0 ? '+' : ''}${fmt$(impactData.deltaRevenue)}`, color: impactData.deltaRevenue >= 0 ? '#22c55e' : '#ef4444' },
                  { label: 'Proj CTR', cur: `${impactFam.avg_ctr.toFixed(2)}%`, proj: `${impactData.projCTR.toFixed(2)}%`, color: '#06b6d4' },
                  { label: 'CVR (unchanged)', cur: `${impactFam.cvr.toFixed(2)}%`, proj: `${impactData.projCVR.toFixed(2)}%`, color: '#f59e0b' },
                  { label: 'Rev Share of Total', cur: allRevenue > 0 ? `${((impactFam.total_revenue / allRevenue) * 100).toFixed(1)}%` : '—', proj: `${impactData.revenueShare.toFixed(1)}%`, color: '#a78bfa' },
                ].map(({ label, cur, proj, color }) => (
                  <div key={label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '12px 14px' }}>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>{label}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, color: '#475569' }}>{cur}</span>
                      <span style={{ fontSize: 12, color: '#475569' }}>→</span>
                      <span style={{ fontSize: 16, fontWeight: 700, color }}>{proj}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: '#64748b', fontSize: 13 }}>Select a family above to see the +10% weight projection.</div>
            )}

            {/* Family weight bar chart */}
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>Current weight distribution</div>
              {families.map(f => {
                const isSelected = f.id === impactFamily
                return (
                  <div key={f.id} style={{ marginBottom: 8, cursor: 'pointer' }} onClick={() => setImpactFamily(f.id)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: 12, color: isSelected ? '#a78bfa' : '#e2e8f0' }}>{f.display_name}</span>
                      <span style={{ fontSize: 12, color: '#64748b' }}>
                        {(f.posting_weight * 100).toFixed(0)}% weight · {f.real_conversions} real conv
                        {f.real_conversions < cfg.clone_threshold_conversions && (
                          <span style={{ color: '#f59e0b', marginLeft: 6, fontSize: 10 }}>⚠ warm-up</span>
                        )}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                      <div style={{ flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 3, height: 8, overflow: 'hidden' }}>
                        <div style={{ width: `${f.posting_weight * 100}%`, height: '100%', background: isSelected ? '#a78bfa' : f.status === 'paused' ? '#374151' : '#22c55e', borderRadius: 3, transition: 'width 0.5s' }} />
                      </div>
                      {isSelected && (
                        <div style={{ flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 3, height: 8, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min((f.posting_weight + 0.10) * 100, 100)}%`, height: '100%', background: 'rgba(167,139,250,0.4)', borderRadius: 3 }} />
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              {impactFam && (
                <div style={{ fontSize: 11, color: '#475569', marginTop: 6, textAlign: 'right' as const }}>
                  Light bar = projected after +10% · Note: saturation discount applied to CTR projection
                </div>
              )}
            </div>
          </div>

          {/* ── CLOSED-LOOP OPTIMIZER CONTROLLER ───────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

            {/* Left: controls */}
            <div style={styles.card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <span style={{ fontSize: 16 }}>⚙️</span>
                <span style={{ fontWeight: 700, fontSize: 14 }}>Closed-Loop Controller</span>
                <span style={{ marginLeft: 'auto', fontSize: 11,
                  color: cfg.auto_optimize_enabled ? '#22c55e' : '#64748b' }}>
                  {cfg.auto_optimize_enabled ? '● AUTONOMOUS' : '○ MANUAL'}
                </span>
              </div>

              {/* Enable / Disable toggle */}
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Auto-Optimize</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                      UCB1 rebalancing every {cfg.optimize_interval_hours}h via Edge Function
                    </div>
                  </div>
                  <button
                    onClick={() => toggleAutoOptimize(!cfg.auto_optimize_enabled)}
                    style={{
                      width: 52, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer',
                      background: cfg.auto_optimize_enabled ? '#22c55e' : 'rgba(255,255,255,0.12)',
                      position: 'relative' as const, transition: 'background 0.2s',
                    }}
                  >
                    <span style={{
                      position: 'absolute' as const, top: 4,
                      left: cfg.auto_optimize_enabled ? 28 : 4,
                      width: 20, height: 20, borderRadius: '50%',
                      background: '#fff', transition: 'left 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                    }} />
                  </button>
                </div>
              </div>

              {/* Stat pills */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                {[
                  { label: 'Cycles Run',    value: String(cfg.optimizer_cycle_count), color: '#a78bfa' },
                  { label: 'Max Δ/Cycle',   value: `${(cfg.max_weight_delta_per_cycle * 100).toFixed(0)}%`, color: '#06b6d4' },
                  { label: 'UCB1 C',        value: String(cfg.ucb1_exploration_constant), color: '#f59e0b' },
                  { label: 'Min Views',     value: fmtN(cfg.min_views_before_adjust), color: '#94a3b8' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '8px 10px' }}>
                    <div style={{ fontSize: 10, color: '#64748b' }}>{label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Last run */}
              <div style={{ fontSize: 12, color: '#475569', marginBottom: 12 }}>
                Last run: {cfg.last_optimized_at
                  ? new Date(cfg.last_optimized_at).toLocaleString()
                  : 'Never'}
                {cfg.last_optimized_at && cfg.optimize_interval_hours && (
                  <span style={{ marginLeft: 8, color: '#22c55e' }}>
                    · Next: {new Date(new Date(cfg.last_optimized_at).getTime() + cfg.optimize_interval_hours * 3_600_000).toLocaleString()}
                  </span>
                )}
              </div>

              {/* Run Now */}
              <button
                onClick={runOptimizerNow}
                disabled={runningOptimizer}
                style={{
                  width: '100%', padding: '9px 0', borderRadius: 8, border: 'none',
                  cursor: runningOptimizer ? 'not-allowed' : 'pointer',
                  background: runningOptimizer ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #7c3aed, #a78bfa)',
                  color: '#fff', fontWeight: 700, fontSize: 13, opacity: runningOptimizer ? 0.7 : 1,
                }}
              >
                {runningOptimizer ? '⏳ Running UCB1 cycle…' : '⚡ Run Optimizer Now'}
              </button>
              {optimizerStatus && (
                <div style={{ fontSize: 12, marginTop: 8, color: optimizerStatus.startsWith('✅') ? '#22c55e' : optimizerStatus.startsWith('⏭') ? '#f59e0b' : '#ef4444', textAlign: 'center' as const }}>
                  {optimizerStatus}
                </div>
              )}

              {/* Algorithm explanation */}
              <div style={{ marginTop: 14, padding: '10px 12px', background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.15)', borderRadius: 8, fontSize: 11, color: '#94a3b8', lineHeight: 1.6 }}>
                <span style={{ color: '#a78bfa', fontWeight: 700 }}>UCB1 algorithm: </span>
                score = <span style={{ color: '#22c55e' }}>reward</span> + C × √(ln(N)/nᵢ)<br />
                reward = revenue/real_conv · C={cfg.ucb1_exploration_constant} · Δ≤{(cfg.max_weight_delta_per_cycle*100).toFixed(0)}%/cycle<br />
                <span style={{ color: '#f59e0b' }}>Reality gate:</span> blocked until {cfg.clone_threshold_conversions} real conversions
              </div>
            </div>

            {/* Right: UCB1 score visualization per family */}
            <div style={styles.card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <span style={{ fontSize: 16 }}>📡</span>
                <span style={{ fontWeight: 700, fontSize: 14 }}>UCB1 Scores — Live Signal</span>
              </div>
              {families.length === 0 ? (
                <div style={{ color: '#64748b', fontSize: 13 }}>Loading families…</div>
              ) : (() => {
                const maxScore = Math.max(...families.map(f => f.business_score ?? 0), 0.01)
                return families.map(f => {
                  const score    = f.business_score ?? 0
                  const pct      = maxScore > 0 ? (score / maxScore) * 100 : 0
                  const warmUp   = (f.real_conversions ?? 0) < cfg.clone_threshold_conversions
                  return (
                    <div key={f.id} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: '#e2e8f0' }}>{f.display_name}</span>
                        <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                          {warmUp && <span style={{ color: '#f59e0b' }}>warm-up</span>}
                          <span style={{ color: '#a78bfa' }}>score {score.toFixed(3)}</span>
                          <span style={{ color: '#64748b' }}>{(f.posting_weight * 100).toFixed(0)}% wt</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        {/* Reward component */}
                        <div style={{ height: 10, background: 'rgba(34,197,94,0.5)', borderRadius: '3px 0 0 3px', width: `${pct * 0.7}%`, minWidth: 2, transition: 'width 0.5s' }} title="Reward (revenue)" />
                        {/* Explore component */}
                        <div style={{ height: 10, background: 'rgba(167,139,250,0.4)', borderRadius: '0 3px 3px 0', width: `${pct * 0.3}%`, minWidth: 2, transition: 'width 0.5s' }} title="Exploration bonus" />
                        {/* Spacer */}
                        <div style={{ flex: 1 }} />
                        <span style={{ fontSize: 10, color: '#475569' }}>{f.real_conversions ?? 0} real</span>
                      </div>
                    </div>
                  )
                })
              })()}
              <div style={{ marginTop: 8, display: 'flex', gap: 12, fontSize: 10, color: '#475569' }}>
                <span><span style={{ color: 'rgba(34,197,94,0.8)' }}>■</span> Reward (exploit)</span>
                <span><span style={{ color: 'rgba(167,139,250,0.8)' }}>■</span> Explore bonus (UCB1)</span>
              </div>
            </div>
          </div>

          {/* ── OPTIMIZER LOG ─────────────────────────────────────────────────── */}
          <div style={styles.card}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>📋 Optimizer Log — Autonomous Decisions</div>
            {optimizerLog.length === 0 ? (
              <div style={{ color: '#64748b', fontSize: 13 }}>
                No optimizer runs yet. Click "Run Optimizer Now" or enable Auto-Optimize to start.
              </div>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    {['Time', 'By', 'Cycle', 'Updates', 'Reward', 'Explore %', 'Duration', 'Status'].map(h => (
                      <th key={h} style={styles.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {optimizerLog.map(entry => {
                    const skipped = !!entry.skipped_reason
                    return (
                      <tr key={entry.id}>
                        <td style={{ ...styles.td, color: '#94a3b8', fontSize: 11 }}>
                          {new Date(entry.run_at).toLocaleString()}
                        </td>
                        <td style={{ ...styles.td, color: entry.triggered_by === 'cron' ? '#a78bfa' : '#06b6d4' }}>
                          {entry.triggered_by}
                        </td>
                        <td style={{ ...styles.td, color: '#e2e8f0' }}>#{entry.cycle_number}</td>
                        <td style={{ ...styles.td, color: entry.actions_taken > 0 ? '#22c55e' : '#475569', fontWeight: entry.actions_taken > 0 ? 700 : 400 }}>
                          {entry.actions_taken}
                        </td>
                        <td style={{ ...styles.td, color: '#f59e0b' }}>
                          {entry.total_reward > 0 ? `$${entry.total_reward.toFixed(2)}` : '—'}
                        </td>
                        <td style={{ ...styles.td, color: '#a78bfa' }}>
                          {entry.exploration_pct > 0 ? `${entry.exploration_pct.toFixed(1)}%` : '—'}
                        </td>
                        <td style={{ ...styles.td, color: '#64748b' }}>
                          {entry.duration_ms != null ? `${entry.duration_ms}ms` : '—'}
                        </td>
                        <td style={styles.td}>
                          {skipped
                            ? <span style={{ ...styles.badge('#f59e0b') as React.CSSProperties, fontSize: 10 }}>skipped</span>
                            : <span style={{ ...styles.badge('#22c55e') as React.CSSProperties, fontSize: 10 }}>ok</span>
                          }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}

            {/* Show last run's action detail if available */}
            {!!optimizerLog[0]?.payload?.actions && Array.isArray(optimizerLog[0].payload.actions) && (optimizerLog[0].payload.actions as unknown[]).length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>Last cycle actions (cycle #{optimizerLog[0].cycle_number})</div>
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
                  {(optimizerLog[0].payload.actions as Array<Record<string, unknown>>).map((a, i) => {
                    const delta = Number(a.delta ?? 0)
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, background: 'rgba(255,255,255,0.02)', padding: '6px 10px', borderRadius: 6 }}>
                        <span style={{ color: '#e2e8f0', width: 150, flexShrink: 0 }}>{String(a.name)}</span>
                        <span style={{ color: '#475569' }}>{String(a.old)}% →</span>
                        <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{String(a.new)}%</span>
                        <span style={{ color: delta >= 0 ? '#22c55e' : '#ef4444', width: 40 }}>
                          {delta >= 0 ? '+' : ''}{String(a.delta)}%
                        </span>
                        <span style={{ color: '#a78bfa', marginLeft: 4 }}>UCB1 {String(Number(a.ucb1).toFixed(3))}</span>
                        {!!a.skipped && <span style={{ color: '#f59e0b' }}>⏭ {String(a.skip_reason)}</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ── REGRET LOG ───────────────────────────────────────────────────── */}
          <div style={{ ...styles.card, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>📉 Regret Log — Decision Quality Tracking</span>
              <span style={{ fontSize: 11, color: '#64748b', marginLeft: 4 }}>Negative regret = over-estimated reward (bad signal). Positive = under-estimated (lucky).</span>
              <button onClick={() => refetchRegret()} style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: '#94a3b8', fontSize: 11, cursor: 'pointer' }}>↻ Refresh</button>
            </div>
            {regretLog.length === 0 ? (
              <div style={{ textAlign: 'center' as const, color: '#475569', fontSize: 13, padding: '24px 0' }}>
                No regret entries yet — they appear after the first optimizer cycle.
              </div>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    {['Cycle', 'Family', 'Old W', 'New W', 'Δ Weight', 'Expected Reward', 'Actual Δ Rev', 'Regret', 'Status'].map(h => (
                      <th key={h} style={styles.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {regretLog.map((r) => {
                    const regretColor = r.regret_score == null ? '#64748b'
                      : r.regret_score < -0.5 ? '#ef4444'
                      : r.regret_score < 0    ? '#f59e0b'
                      : '#22c55e'
                    const deltaColor = r.weight_delta > 0 ? '#22c55e' : r.weight_delta < 0 ? '#ef4444' : '#64748b'
                    return (
                      <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={styles.td}><span style={{ fontWeight: 600, color: '#a78bfa' }}>#{r.cycle_number}</span></td>
                        <td style={styles.td}>{r.display_name ?? r.family_id.slice(0, 12)}</td>
                        <td style={styles.td}>{(r.old_weight * 100).toFixed(1)}%</td>
                        <td style={styles.td}>{(r.new_weight * 100).toFixed(1)}%</td>
                        <td style={styles.td}>
                          <span style={{ color: deltaColor, fontWeight: 600 }}>
                            {r.weight_delta > 0 ? '+' : ''}{(r.weight_delta * 100).toFixed(1)}%
                          </span>
                        </td>
                        <td style={styles.td}>{r.expected_reward.toFixed(3)}</td>
                        <td style={styles.td}>
                          {r.actual_revenue_delta != null
                            ? <span style={{ color: r.actual_revenue_delta >= 0 ? '#22c55e' : '#ef4444' }}>
                                {r.actual_revenue_delta >= 0 ? '+' : ''}${r.actual_revenue_delta.toFixed(2)}
                              </span>
                            : <span style={{ color: '#475569' }}>⏳ pending</span>}
                        </td>
                        <td style={styles.td}>
                          {r.regret_score != null
                            ? <span style={{ color: regretColor, fontWeight: 700 }}>
                                {r.regret_score > 0 ? '+' : ''}{r.regret_score.toFixed(3)}
                              </span>
                            : <span style={{ color: '#475569' }}>—</span>}
                        </td>
                        <td style={styles.td}>
                          {r.evaluated_at
                            ? <span style={{ color: '#22c55e', fontSize: 11 }}>✅ evaluated</span>
                            : <span style={{ color: '#64748b', fontSize: 11 }}>⏳ {r.evaluation_window_hours}h window</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* ══ PENDING ACTIONS PANEL (test mode) ════════════════════════════ */}
          {(isTestMode || pendingActions.length > 0) && (
            <div style={{ ...styles.card, border: '1px solid rgba(245,158,11,0.25)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>🔬 Pending Actions — Test Mode Review Queue</span>
                {pendingActions.filter(a => a.status === 'pending').length > 0 && (
                  <span style={{ ...styles.badge('#f59e0b') as React.CSSProperties, fontSize: 11 }}>
                    {pendingActions.filter(a => a.status === 'pending').length} awaiting
                  </span>
                )}
                <button
                  onClick={() => refetchPending()}
                  style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: '#94a3b8', fontSize: 11, cursor: 'pointer' }}
                >↻ Refresh</button>
              </div>
              {pendingActions.length === 0 ? (
                <div style={{ textAlign: 'center' as const, color: '#475569', fontSize: 13, padding: '24px 0' }}>
                  No pending actions — they appear here when the optimizer runs in TEST MODE.
                </div>
              ) : (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      {['Cycle', 'Type', 'Family', 'Current', 'Proposed', 'Reason', 'Status', 'Action'].map(h => (
                        <th key={h} style={styles.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pendingActions.map((pa) => {
                      const isPending  = pa.status === 'pending'
                      const isApproved = pa.status === 'approved'
                      const isRejected = pa.status === 'rejected'
                      const statusColor = isPending ? '#f59e0b' : isApproved ? '#22c55e' : isRejected ? '#ef4444' : '#64748b'
                      const typeColor   = pa.action_type === 'KILL_SWITCH' ? '#ef4444'
                        : pa.action_type.includes('INCREASE') ? '#22c55e'
                        : pa.action_type.includes('REDUCE') || pa.action_type.includes('PAUSE') ? '#f59e0b'
                        : '#a78bfa'
                      return (
                        <tr key={pa.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', opacity: isPending ? 1 : 0.65 }}>
                          <td style={styles.td}><span style={{ color: '#a78bfa', fontWeight: 600 }}>#{pa.cycle_number}</span></td>
                          <td style={styles.td}>
                            <span style={{ ...styles.badge(typeColor) as React.CSSProperties, fontSize: 10, whiteSpace: 'nowrap' as const }}>
                              {pa.action_type}
                            </span>
                          </td>
                          <td style={{ ...styles.td, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                            {pa.display_name ?? pa.family_id ?? '—'}
                          </td>
                          <td style={styles.td}>
                            {pa.current_value != null ? (
                              <span style={{ color: '#94a3b8' }}>{(pa.current_value * 100).toFixed(1)}%</span>
                            ) : '—'}
                          </td>
                          <td style={styles.td}>
                            {pa.proposed_value != null ? (
                              <span style={{ color: '#06b6d4', fontWeight: 600 }}>{(pa.proposed_value * 100).toFixed(1)}%</span>
                            ) : '—'}
                          </td>
                          <td style={{ ...styles.td, color: '#94a3b8', fontSize: 11, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                            {pa.reason ?? '—'}
                          </td>
                          <td style={styles.td}>
                            <span style={{ ...styles.badge(statusColor) as React.CSSProperties, fontSize: 10 }}>
                              {pa.status}
                            </span>
                          </td>
                          <td style={styles.td}>
                            {isPending ? (
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  onClick={() => reviewPendingAction(pa.id, true)}
                                  style={{ padding: '3px 10px', borderRadius: 5, border: '1px solid #22c55e44', background: 'rgba(34,197,94,0.10)', color: '#22c55e', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                                >✓ Apply</button>
                                <button
                                  onClick={() => reviewPendingAction(pa.id, false)}
                                  style={{ padding: '3px 10px', borderRadius: 5, border: '1px solid #ef444444', background: 'rgba(239,68,68,0.10)', color: '#ef4444', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                                >✕ Reject</button>
                              </div>
                            ) : (
                              <span style={{ color: '#475569', fontSize: 11 }}>
                                {pa.reviewed_at ? new Date(pa.reviewed_at).toLocaleTimeString() : '—'}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── HOOK FAMILIES TABLE ──────────────────────────────────────────── */}
          <div style={styles.card}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>📊 Hook Family Performance (Live DB)</div>
            <div style={{ overflowX: 'auto' as const }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {['Family', 'Rank', 'Creatives', 'Weight', 'CVR', 'EMA CVR', 'EMA CTR', 'EMA $/Click', 'ROAS', 'Real Conv', 'Revenue', 'Status'].map(h => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {families.map(f => {
                  const statusCol = f.status === 'active' ? '#22c55e' : f.status === 'paused' ? '#ef4444' : '#f59e0b'
                  const hasEnough = f.real_conversions >= cfg.clone_threshold_conversions
                  // EMA drift indicator: compare ema vs raw (>5% delta = flagged)
                  const emaCvrDrift = f.ema_cvr != null && Math.abs(f.ema_cvr - f.cvr) > 0.5
                  return (
                    <tr key={f.id}>
                      <td style={{ ...styles.td, fontWeight: 600, color: '#e2e8f0', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                        {f.display_name}
                      </td>
                      <td style={{ ...styles.td, color: '#a78bfa' }}>#{f.rank}</td>
                      <td style={styles.td}>{f.total_creatives}</td>
                      <td style={{ ...styles.td, color: '#06b6d4' }}>{(f.posting_weight * 100).toFixed(0)}%</td>
                      <td style={{ ...styles.td, color: f.cvr > 2.5 ? '#22c55e' : f.cvr > 1.5 ? '#f59e0b' : '#ef4444' }}>{f.cvr.toFixed(2)}%</td>
                      {/* EMA CVR — optimizer's smoothed view */}
                      <td style={styles.td}>
                        {f.ema_cvr != null ? (
                          <span style={{ color: emaCvrDrift ? '#f59e0b' : '#94a3b8', fontSize: 12 }}>
                            {f.ema_cvr.toFixed(2)}%
                            {emaCvrDrift && <span title="EMA drifting from raw CVR" style={{ marginLeft: 3, fontSize: 10 }}>⚡</span>}
                          </span>
                        ) : <span style={{ color: '#475569', fontSize: 11 }}>—</span>}
                      </td>
                      {/* EMA CTR */}
                      <td style={styles.td}>
                        {f.ema_ctr != null ? (
                          <span style={{ color: '#94a3b8', fontSize: 12 }}>{f.ema_ctr.toFixed(2)}%</span>
                        ) : <span style={{ color: '#475569', fontSize: 11 }}>—</span>}
                      </td>
                      {/* EMA revenue per click */}
                      <td style={styles.td}>
                        {f.ema_revenue_per_click != null ? (
                          <span style={{ color: f.ema_revenue_per_click > 0.5 ? '#22c55e' : '#94a3b8', fontSize: 12 }}>
                            ${f.ema_revenue_per_click.toFixed(3)}
                          </span>
                        ) : <span style={{ color: '#475569', fontSize: 11 }}>—</span>}
                      </td>
                      <td style={{ ...styles.td, color: f.avg_roas > 2 ? '#22c55e' : '#94a3b8' }}>{f.avg_roas.toFixed(2)}x</td>
                      <td style={{ ...styles.td, color: hasEnough ? '#22c55e' : '#f59e0b' }}>
                        {f.real_conversions}
                        {!hasEnough && <span style={{ fontSize: 9, color: '#f59e0b', marginLeft: 4 }}>/{cfg.clone_threshold_conversions}</span>}
                      </td>
                      <td style={{ ...styles.td, color: '#22c55e' }}>{fmt$(f.total_revenue)}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.badge(statusCol) as React.CSSProperties, fontSize: 10 }}>
                          {f.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
