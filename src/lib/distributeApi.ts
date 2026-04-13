/**
 * Distribution API Client — HARDENED
 *
 * - [UGC] logging at every step
 * - 2x retry on Twitter/platform failures
 * - Status callbacks for pipeline UI
 */

const API_BASE = import.meta.env.VITE_APP_URL || ''

// ─── Logger ─────────────────────────────────────────────────────────────────
function ugcLog(msg: string, data?: Record<string, unknown>) {
  const ts = new Date().toISOString().slice(11, 19)
  console.log(`[UGC][${ts}] ${msg}`, data ? JSON.stringify(data) : '')
}

// ─── Retry helper ────────────────────────────────────────────────────────────
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 2
): Promise<T> {
  let lastError: Error = new Error('unknown')
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      if (attempt > 1) ugcLog(`${label} — retry ${attempt - 1}/${maxRetries}`)
      return await fn()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      ugcLog(`${label} — attempt ${attempt} failed: ${lastError.message}`)
      if (attempt <= maxRetries) {
        await new Promise(r => setTimeout(r, 2000 * attempt))
      }
    }
  }
  throw lastError
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DistributionResult {
  platform: string
  success: boolean
  post_url?: string
  error?: string
}

export interface DistributeResponse {
  creative_id: string
  total: number
  successful: number
  results: DistributionResult[]
}

export interface DistributionLog {
  id: string
  creative_id: string
  platform: string
  success: boolean
  post_url: string | null
  error_message: string | null
  created_at: string
}

export interface PlatformStatus {
  platform: string
  connected: boolean
  last_post: string | null
}

// ─── Distribute to ALL platforms ─────────────────────────────────────────────
export async function distributeToAll(creativeId: string): Promise<DistributeResponse> {
  ugcLog('distributing to all platforms', { creative_id: creativeId })

  const result = await withRetry(async () => {
    const res = await fetch(`${API_BASE}/api/distribute?action=distribute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creative_id: creativeId }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error || `Distribution error: ${res.status}`)
    }

    return res.json() as Promise<DistributeResponse>
  }, 'distribute-all', 2)

  ugcLog('distribution complete', {
    creative_id: creativeId,
    total: result.total,
    successful: result.successful,
    platforms: result.results.filter(r => r.success).map(r => r.platform),
  })

  return result
}

// ─── Distribute to a SINGLE platform (with retry) ───────────────────────────
export async function distributeToSingle(
  creativeId: string,
  platform: string
): Promise<DistributionResult> {
  ugcLog(`posting to ${platform}`, { creative_id: creativeId })

  const result = await withRetry(async () => {
    const res = await fetch(`${API_BASE}/api/distribute?action=single`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creative_id: creativeId, platform }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error || `Distribution error: ${res.status}`)
    }

    return res.json() as Promise<DistributionResult>
  }, `distribute-${platform}`, 2)

  if (result.success) {
    ugcLog(`posted to ${platform}`, { post_url: result.post_url })
  } else {
    ugcLog(`post to ${platform} failed`, { error: result.error })
  }

  return result
}

// ─── Post to Twitter/X specifically (convenience + retry) ────────────────────
export async function postToTwitter(creativeId: string): Promise<DistributionResult> {
  ugcLog('posting to twitter', { creative_id: creativeId })
  return distributeToSingle(creativeId, 'Twitter/X')
}

// ─── Get distribution status for a creative ──────────────────────────────────
export async function getDistributionStatus(
  creativeId: string
): Promise<{ creative_id: string; logs: DistributionLog[] }> {
  const res = await fetch(
    `${API_BASE}/api/distribute?action=status&creative_id=${creativeId}`
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `Status error: ${res.status}`)
  }

  return res.json()
}

// ─── Get platform connection status ──────────────────────────────────────────
export async function getPlatformConnections(): Promise<{
  platforms: PlatformStatus[]
}> {
  const res = await fetch(`${API_BASE}/api/distribute?action=connections`)

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `Connections error: ${res.status}`)
  }

  return res.json()
}
