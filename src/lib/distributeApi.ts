/**
 * Distribution API Client
 *
 * Frontend module that calls our /api/distribute Vercel serverless function.
 * Handles auto-distribution to 8 connected platforms when a creative goes live.
 */

const API_BASE = import.meta.env.VITE_APP_URL || ''

// --- Types ---

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

// --- Distribute to ALL platforms ---
export async function distributeToAll(creativeId: string): Promise<DistributeResponse> {
  const res = await fetch(`${API_BASE}/api/distribute?action=distribute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creative_id: creativeId }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `Distribution error: ${res.status}`)
  }

  return res.json()
}

// --- Distribute to a SINGLE platform ---
export async function distributeToSingle(
  creativeId: string,
  platform: string
): Promise<DistributionResult> {
  const res = await fetch(`${API_BASE}/api/distribute?action=single`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creative_id: creativeId, platform }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `Distribution error: ${res.status}`)
  }

  return res.json()
}

// --- Get distribution status for a creative ---
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

// --- Get platform connection status ---
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
