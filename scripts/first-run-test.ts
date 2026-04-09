#!/usr/bin/env tsx
/**
 * Lumina Ops Hub — First-Run Verification Script
 * Run: npm run test:first-run
 *
 * Checks: Supabase connection, MT5 bridge, schema, RLS, demo mode
 */

import { createClient } from '@supabase/supabase-js'

// Load .env manually since we're outside Vite
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

function loadEnv() {
  const envPath = resolve(process.cwd(), '.env')
  if (!existsSync(envPath)) {
    console.warn('⚠️  No .env file found. Copy .env.example → .env and fill in your keys.')
    return {}
  }
  const vars: Record<string, string> = {}
  readFileSync(envPath, 'utf-8').split('\n').forEach((line) => {
    const [k, ...rest] = line.split('=')
    if (k && !k.startsWith('#')) vars[k.trim()] = rest.join('=').trim()
  })
  return vars
}

const env = loadEnv()

const SUPABASE_URL = env['VITE_SUPABASE_URL'] ?? ''
const SUPABASE_KEY = env['VITE_SUPABASE_ANON_KEY'] ?? ''
const MT5_URL      = env['VITE_MT5_BRIDGE_URL'] ?? 'http://localhost:8080'
const MT5_KEY      = env['VITE_MT5_API_KEY'] ?? ''

const DEMO = !SUPABASE_URL || SUPABASE_URL.includes('YOUR_PROJECT')

// ─── Color helpers ────────────────────────────────────────────────────────────
const g = (s: string) => `\x1b[32m${s}\x1b[0m`
const r = (s: string) => `\x1b[31m${s}\x1b[0m`
const y = (s: string) => `\x1b[33m${s}\x1b[0m`
const b = (s: string) => `\x1b[36m${s}\x1b[0m`
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`

type Result = { name: string; status: 'pass' | 'fail' | 'warn'; detail: string }
const results: Result[] = []

function pass(name: string, detail = '') {
  results.push({ name, status: 'pass', detail })
  console.log(`  ${g('✓')} ${name}${detail ? ` — ${detail}` : ''}`)
}

function fail(name: string, detail = '') {
  results.push({ name, status: 'fail', detail })
  console.log(`  ${r('✗')} ${name}${detail ? ` — ${detail}` : ''}`)
}

function warn(name: string, detail = '') {
  results.push({ name, status: 'warn', detail })
  console.log(`  ${y('⚠')} ${name}${detail ? ` — ${detail}` : ''}`)
}

// ─── Test suites ──────────────────────────────────────────────────────────────

async function testEnvVars() {
  console.log(b('\n── Environment Variables ──'))
  SUPABASE_URL ? pass('.env VITE_SUPABASE_URL', SUPABASE_URL.substring(0, 40) + '...') : fail('.env VITE_SUPABASE_URL', 'not set')
  SUPABASE_KEY ? pass('.env VITE_SUPABASE_ANON_KEY', 'set ✓') : fail('.env VITE_SUPABASE_ANON_KEY', 'not set')
  MT5_KEY      ? pass('.env VITE_MT5_API_KEY', 'set ✓')       : warn('.env VITE_MT5_API_KEY', 'not set — MT5 bridge will use demo mode')
  env['VITE_STRIPE_PUBLISHABLE_KEY'] ? pass('Stripe key', 'set') : warn('Stripe key', 'not set — invoice features disabled')
  env['ANTHROPIC_API_KEY']           ? pass('Anthropic key', 'set') : warn('Anthropic key', 'not set — AI briefing uses static text')
}

async function testSupabase() {
  console.log(b('\n── Supabase Connection ──'))

  if (DEMO) {
    warn('Supabase', 'Running in DEMO MODE — mock data only')
    return
  }

  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

    // Test connection
    const { error: pingErr } = await sb.from('ops_jobs').select('count').limit(1)
    if (pingErr) {
      if (pingErr.message.includes('does not exist')) {
        fail('Schema', 'Table ops_jobs not found — run supabase/schema.sql first')
      } else if (pingErr.message.includes('permission')) {
        fail('RLS', 'Permission denied — run supabase/rls_policies.sql and make sure you are logged in')
      } else {
        fail('Connection', pingErr.message)
      }
      return
    }
    pass('Connection', 'Supabase reachable')

    // Test all tables exist
    const tables = [
      'ops_jobs', 'auto_tasks', 'mt5_accounts', 'mt5_trades',
      'poly_markets', 'poly_positions', 'arbitrage_signals',
      'tax_entries', 'tax_pot', 'leads', 'daily_briefings',
      'allocation_rules', 'synergy_links', 'montecarlo_results',
    ]

    let missingTables = 0
    for (const table of tables) {
      const { error } = await sb.from(table).select('count').limit(1)
      if (error?.message.includes('does not exist')) {
        fail(`Table: ${table}`, 'missing — re-run schema.sql')
        missingTables++
      }
    }
    if (missingTables === 0) pass('Schema', `All ${tables.length} tables found`)

    // Test auth
    const { data: { session } } = await sb.auth.getSession()
    if (!session) {
      warn('Auth session', 'No active session — app will show login screen in production')
    } else {
      pass('Auth session', `Logged in as ${session.user.email}`)
    }

  } catch (err) {
    fail('Supabase', String(err))
  }
}

async function testMT5Bridge() {
  console.log(b('\n── MT5 Bridge (LuminaPulse) ──'))

  if (!MT5_KEY || MT5_KEY === 'your_luminapulse_api_key') {
    warn('MT5 Bridge', 'API key not set — using mock data')
    return
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const res = await fetch(`${MT5_URL}/account`, {
      headers: { 'X-LP-Api-Key': MT5_KEY },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (res.ok) {
      const data = await res.json()
      pass('MT5 Bridge reachable', `Balance: $${data.balance?.toLocaleString() ?? 'N/A'}`)
      pass('MT5 /account endpoint', 'OK')
    } else {
      fail('MT5 Bridge', `HTTP ${res.status} — check API key and bridge URL`)
    }
  } catch (err) {
    if (String(err).includes('abort')) {
      fail('MT5 Bridge', `Timeout — is LuminaPulse running at ${MT5_URL}?`)
    } else if (String(err).includes('fetch failed') || String(err).includes('ECONNREFUSED')) {
      fail('MT5 Bridge', `Cannot connect to ${MT5_URL} — start the MT5 bridge first`)
    } else {
      fail('MT5 Bridge', String(err))
    }
  }
}

async function testPolymarket() {
  console.log(b('\n── Polymarket API ──'))
  try {
    const res = await fetch('https://gamma-api.polymarket.com/markets?limit=1&active=true')
    if (res.ok) {
      pass('Polymarket Gamma API', 'reachable')
    } else {
      warn('Polymarket Gamma API', `HTTP ${res.status}`)
    }
  } catch {
    warn('Polymarket Gamma API', 'unreachable — check network')
  }
}

async function testNodeVersion() {
  console.log(b('\n── Runtime ──'))
  const major = parseInt(process.version.replace('v', ''))
  major >= 18 ? pass('Node version', process.version) : fail('Node version', `${process.version} — requires Node 18+`)
}

async function showSummary() {
  const passed = results.filter((r) => r.status === 'pass').length
  const failed = results.filter((r) => r.status === 'fail').length
  const warned = results.filter((r) => r.status === 'warn').length

  console.log('\n' + '─'.repeat(50))
  console.log(bold(`Results: ${g(`${passed} passed`)}  ${r(`${failed} failed`)}  ${y(`${warned} warnings`)}`))

  if (failed === 0) {
    console.log(g('\n✅  All critical checks passed! Start the dev server:\n'))
    console.log('   npm run dev\n')
    console.log('   Then open: http://localhost:3000\n')

    if (DEMO) {
      console.log(y('   Running in DEMO MODE (mock data). To go live:'))
      console.log('   1. Fill in .env with your Supabase + MT5 keys')
      console.log('   2. Run supabase/schema.sql + rls_policies.sql')
      console.log('   3. Restart: npm run dev\n')
    }
  } else {
    console.log(r('\n❌  Fix the failures above, then re-run: npm run test:first-run\n'))
    console.log('   See DEPLOYMENT.md for step-by-step setup guide.\n')
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log(bold('\n🚀  Lumina Ops Hub — First-Run Verification'))
console.log('─'.repeat(50))

async function main() {
  await testNodeVersion()
  await testEnvVars()
  await testSupabase()
  await testMT5Bridge()
  await testPolymarket()
  await showSummary()
}

main().catch((err) => {
  console.error(r('\nUnexpected error:'), err)
  process.exit(1)
})
