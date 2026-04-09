/**
 * useNotifications — Browser push notifications for Lumina Ops Hub
 *
 * Uses the Notification API (no server push needed — fires locally).
 * Triggers on:
 *   - Trade close with >$50 PnL (from MT5)
 *   - Income entry logged (Stripe webhook or manual)
 *   - Daily goal met for any job
 *   - New Polymarket position resolved
 */
import { useEffect, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type NotificationEvent =
  | { type: 'trade_close'; jobName: string; pnl: number; ticker: string }
  | { type: 'income_logged'; jobName: string; amount: number; source: string }
  | { type: 'goal_met'; jobName: string; earned: number; goal: number }
  | { type: 'withdrawal_sent'; amount: number; txHash: string }
  | { type: 'mt5_margin_alert'; level: number }

const ICONS: Record<string, string> = {
  trade_close:       '📈',
  income_logged:     '💵',
  goal_met:          '🎯',
  withdrawal_sent:   '🚀',
  mt5_margin_alert:  '⚠️',
}

/**
 * Request notification permission (call on user gesture)
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied')  return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

/**
 * Fire a browser notification
 */
export function fireNotification(event: NotificationEvent): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return

  let title = 'Lumina Ops Hub'
  let body  = ''
  const icon = ICONS[event.type] ?? '💡'

  switch (event.type) {
    case 'trade_close':
      title = `${icon} Trade Closed — ${event.ticker}`
      body  = `${event.jobName}: ${event.pnl >= 0 ? '+' : ''}$${event.pnl.toFixed(2)} PnL`
      break
    case 'income_logged':
      title = `${icon} Income Received`
      body  = `$${event.amount.toLocaleString()} logged to ${event.jobName} via ${event.source}`
      break
    case 'goal_met':
      title = `${icon} Daily Goal Crushed!`
      body  = `${event.jobName}: $${event.earned.toFixed(0)} / $${event.goal.toFixed(0)} — 100%`
      break
    case 'withdrawal_sent':
      title = `${icon} Withdrawal Sent`
      body  = `$${event.amount.toLocaleString()} sent on-chain · ${event.txHash.slice(0, 12)}…`
      break
    case 'mt5_margin_alert':
      title = `${icon} MT5 Margin Alert`
      body  = `Margin level at ${event.level.toFixed(0)}% — check LuminaPulse`
      break
  }

  try {
    const n = new Notification(title, {
      body,
      icon: '/lumina-icon.png',
      badge: '/lumina-icon.png',
      tag:   event.type,
      silent: false,
    })
    // Auto-close after 8 seconds
    setTimeout(() => n.close(), 8000)
    // Click opens the app
    n.onclick = () => { window.focus(); n.close() }
  } catch {
    // Notification API blocked by browser settings
  }
}

/**
 * useNotificationsSetup — Wire up Supabase realtime to fire notifications
 * Call once at the top of the app
 */
export function useNotificationsSetup() {
  const qc         = useQueryClient()
  const seenIds    = useRef(new Set<string>())

  const checkGoals = useCallback(() => {
    // Goal checking is done in GoalTracker component — no action needed here
  }, [])

  useEffect(() => {
    // Subscribe to new income_entries
    const incomeChannel = supabase
      .channel(`notifications_income_${Date.now()}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'income_entries',
      }, (payload) => {
        const row = payload.new as Record<string, unknown>
        const id  = String(row.id ?? '')
        if (seenIds.current.has(id)) return
        seenIds.current.add(id)

        fireNotification({
          type:    'income_logged',
          jobName: String(row.job_id ?? 'Unknown job'),
          amount:  Number(row.amount ?? 0),   // live DB column is 'amount' (not 'amount_usd')
          source:  String(row.source ?? 'manual'),
        })
        void qc.invalidateQueries({ queryKey: ['job_earnings_summary'] })
      })
      .subscribe()

    // Subscribe to cashout_transactions completions
    const cashoutChannel = supabase
      .channel(`notifications_cashout_${Date.now()}`)
      .on('postgres_changes', {
        event:  'UPDATE',
        schema: 'public',
        table:  'cashout_transactions',
        filter: 'status=eq.completed',
      }, (payload) => {
        const row = payload.new as Record<string, unknown>
        fireNotification({
          type:    'withdrawal_sent',
          amount:  Number(row.amount ?? 0),
          txHash:  String(row.tx_id ?? 'unknown'),
        })
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(incomeChannel)
      void supabase.removeChannel(cashoutChannel)
    }
  }, [qc, checkGoals])
}

/**
 * useNotificationPermission — Shows an enable button
 */
export function useNotificationPermission() {
  const permission = 'Notification' in window ? Notification.permission : 'denied' as const

  const request = useCallback(async () => {
    return requestNotificationPermission()
  }, [])

  return { permission, request }
}
