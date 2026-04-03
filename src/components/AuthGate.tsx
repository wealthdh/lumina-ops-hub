/**
 * AuthGate — Supabase email/password login screen.
 * NOTHING in the app renders (and NO Supabase queries fire) until this gate
 * passes and auth.uid() is populated.  That is what makes RLS work.
 */
import { useState, useEffect, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { Session } from '@supabase/supabase-js'
import { Zap, Lock, Mail, Eye, EyeOff, Loader } from 'lucide-react'

interface AuthGateProps {
  children: ReactNode
}

// ── Fast localStorage session reader (avoids Web Locks on double-mount) ──────
function readStoredSession(): Session | null {
  try {
    const projectRef = import.meta.env.VITE_SUPABASE_URL
      .split('//')[1].split('.')[0]
    const raw = localStorage.getItem(`sb-${projectRef}-auth-token`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Session & { expires_at?: number }
    // Accept if token is still valid or within 30s of expiry (will be refreshed)
    if (parsed?.access_token) return parsed
  } catch { /* ignore */ }
  return null
}

export default function AuthGate({ children }: AuthGateProps) {
  const [session, setSession] = useState<Session | null>(() => readStoredSession())
  const [checking, setChecking] = useState(true)

  // ── Restore / refresh session on mount ───────────────────────────────────
  useEffect(() => {
    // 1. Fast-path: session already loaded from localStorage above
    const stored = readStoredSession()
    if (stored) {
      const expiresAt = (stored as Session & { expires_at?: number }).expires_at ?? 0
      const nowSec = Math.floor(Date.now() / 1000)

      if (expiresAt > nowSec + 30) {
        // Token still valid — no need for async getSession()
        setSession(stored)
        setChecking(false)
      } else {
        // Token expired — silently refresh
        supabase.auth.refreshSession().then(({ data }) => {
          setSession(data.session)
          setChecking(false)
        })
      }
    } else {
      // No stored session — check with Supabase (shows login if truly none)
      supabase.auth.getSession().then(({ data: { session } }) => {
        setSession(session)
        setChecking(false)
      })
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center bg-lumina-bg">
        <Loader size={24} className="animate-spin text-lumina-pulse" />
      </div>
    )
  }

  if (!session) {
    return <LoginScreen />
  }

  return <>{children}</>
}

// ── Login form ────────────────────────────────────────────────────────────────

function LoginScreen() {
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [showPw, setShowPw]       = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [mode, setMode]           = useState<'login' | 'signup'>('login')
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccessMsg(null)
    setLoading(true)

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        // onAuthStateChange in AuthGate will update session → re-render children
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setSuccessMsg('Account created! Check your email to confirm, then log in.')
        setMode('login')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-lumina-bg px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-lumina-pulse/20 border border-lumina-pulse/30 flex items-center justify-center">
            <Zap size={20} className="text-lumina-pulse" />
          </div>
          <div>
            <div className="text-lumina-text font-bold text-lg leading-tight">Lumina Ops Hub</div>
            <div className="text-lumina-dim text-xs">LuminaPulse Extension</div>
          </div>
        </div>

        {/* Card */}
        <div className="card-glow border-lumina-pulse/20 p-6">
          <div className="flex items-center gap-2 mb-6">
            <Lock size={14} className="text-lumina-pulse" />
            <h2 className="text-lumina-text font-semibold text-sm">
              {mode === 'login' ? 'Sign in to your account' : 'Create account'}
            </h2>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-lumina-danger/10 border border-lumina-danger/30 text-lumina-danger text-xs">
              {error}
            </div>
          )}
          {successMsg && (
            <div className="mb-4 p-3 rounded-lg bg-lumina-success/10 border border-lumina-success/30 text-lumina-success text-xs">
              {successMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="text-xs text-lumina-dim block mb-1">Email</label>
              <div className="relative">
                <Mail size={13} className="absolute left-3 top-2.5 text-lumina-dim pointer-events-none" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-lumina-bg border border-lumina-border rounded-lg pl-8 pr-3 py-2 text-sm text-lumina-text placeholder-lumina-muted focus:border-lumina-pulse outline-none"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="text-xs text-lumina-dim block mb-1">Password</label>
              <div className="relative">
                <Lock size={13} className="absolute left-3 top-2.5 text-lumina-dim pointer-events-none" />
                <input
                  type={showPw ? 'text' : 'password'}
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-lumina-bg border border-lumina-border rounded-lg pl-8 pr-9 py-2 text-sm text-lumina-text placeholder-lumina-muted focus:border-lumina-pulse outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-2.5 text-lumina-dim hover:text-lumina-text"
                >
                  {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-pulse w-full flex items-center justify-center gap-2"
            >
              {loading && <Loader size={13} className="animate-spin" />}
              {mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); setSuccessMsg(null) }}
              className="text-xs text-lumina-dim hover:text-lumina-pulse transition-colors"
            >
              {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </button>
          </div>
        </div>

        {/* Footer hint */}
        <p className="text-center text-lumina-muted text-xs mt-4">
          Connects to your Supabase project · RLS-protected
        </p>
      </div>
    </div>
  )
}
