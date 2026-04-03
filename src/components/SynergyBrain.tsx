/**
 * Cross-Job Synergy Brain (merged with AI Risk Radar)
 * Data: live from synergy_links + ops_jobs Supabase tables
 */
import { useState } from 'react'
import { GitBranch, AlertTriangle, TrendingUp, X, CheckCircle, Loader } from 'lucide-react'
import { useSynergies, useToggleSynergy, useJobs } from '../hooks/useSupabaseData'
import { useUpdateJobStatus } from '../hooks/useJobs'
import { supabase } from '../lib/supabase'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts'
import clsx from 'clsx'

const KILL_RECOMMENDATIONS = [
  {
    jobId: 'j10', jobName: 'Auto-Distribution + SEO',
    reason: 'Lowest ROI (150%). Synergy Brain detects 80% overlap with SEO Swarm job. Recommend consolidation.',
    monthlyLoss: 5_400, redirectTo: 'SEO Content Swarm',
  },
]

export default function SynergyBrain() {
  // ── LIVE from Supabase ────────────────────────────────────────────────────
  const { data: synergies = [], isLoading: synLoading } = useSynergies()
  const { data: jobs = [],      isLoading: jobsLoading } = useJobs()
  const toggleSynergy = useToggleSynergy()
  const updateStatus = useUpdateJobStatus()
  const [ignoredRecommendations, setIgnoredRecommendations] = useState<string[]>([])

  const loading = synLoading || jobsLoading

  const totalSynergyValue = synergies.filter((s) => s.active).reduce((acc, s) => acc + s.value, 0)

  // Build radar data from live jobs
  const radarData = jobs.slice(0, 6).map((j) => ({
    subject: j.name.split(' ')[0],
    value:   j.synergyScore,
  }))

  function handleToggle(id: string, current: boolean) {
    void toggleSynergy.mutateAsync({ id, active: !current })
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-lumina-dim py-10">
        <Loader size={16} className="animate-spin" />
        <span className="text-sm">Loading synergy data…</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lumina-text font-bold text-xl">Cross-Job Synergy Brain</h1>
          <p className="text-lumina-dim text-sm">Synergy detection · auto-kill · risk radar</p>
        </div>
        <div className="card flex items-center gap-3">
          <div>
            <div className="stat-label">Monthly Synergy Value</div>
            <div className="stat-value text-lumina-pulse text-xl">${totalSynergyValue.toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Active synergies */}
        <div className="card-glow">
          <div className="section-header">
            <GitBranch size={14} />
            Synergy Links ({synergies.length})
          </div>
          {synergies.length === 0 ? (
            <div className="text-lumina-dim text-sm py-6 text-center">
              No synergy links yet. Add rows to <code className="font-mono text-lumina-pulse">synergy_links</code>.
            </div>
          ) : (
            <div className="space-y-3">
              {synergies.map((s) => {
                const jobA = jobs.find((j) => j.id === s.jobA)
                const jobB = jobs.find((j) => j.id === s.jobB)
                return (
                  <div key={s.id} className={clsx(
                    'p-3 rounded-xl border transition-all',
                    s.active ? 'bg-lumina-pulse/5 border-lumina-pulse/20' : 'bg-lumina-bg/40 border-lumina-border opacity-50',
                  )}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs text-lumina-text font-semibold truncate">
                        {jobA?.name ?? s.jobA.slice(0, 8)}
                      </span>
                      <span className="text-lumina-pulse text-xs">↔</span>
                      <span className="text-xs text-lumina-text font-semibold truncate">
                        {jobB?.name ?? s.jobB.slice(0, 8)}
                      </span>
                      <button
                        onClick={() => handleToggle(s.id, s.active)}
                        disabled={toggleSynergy.isPending}
                        className={clsx(
                          'ml-auto flex-shrink-0 text-xs px-2 py-0.5 rounded-full transition-colors',
                          s.active ? 'bg-lumina-success/20 text-lumina-success' : 'bg-lumina-muted/20 text-lumina-dim',
                        )}
                      >
                        {s.active ? 'ON' : 'OFF'}
                      </button>
                    </div>
                    <p className="text-xs text-lumina-dim mb-2">{s.description}</p>
                    <div className="flex items-center gap-2">
                      <span className="badge-pulse badge">{s.synergyType}</span>
                      <span className="text-lumina-success font-mono text-xs ml-auto">+${s.value.toLocaleString()}/mo</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Risk radar — from live job risk scores */}
        <div className="card-glow">
          <div className="section-header">AI Risk Radar (Live)</div>
          {radarData.length > 0 ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#1e2640" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#8892a4', fontSize: 11 }} />
                  <Radar name="Synergy" dataKey="value" stroke="#00f5d4" fill="#00f5d4" fillOpacity={0.15} strokeWidth={2} />
                  <Tooltip
                    contentStyle={{ background: '#141927', border: '1px solid #1e2640', borderRadius: 8, fontSize: 11 }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-56 flex items-center justify-center text-lumina-dim text-sm">
              No job data to plot
            </div>
          )}
          <div className="space-y-1.5 mt-2">
            {jobs.map((j) => (
              <div key={j.id} className="flex items-center gap-2">
                <div className="text-xs text-lumina-dim w-32 truncate">{j.name}</div>
                <div className="flex-1 bg-lumina-bg rounded-full h-1.5 overflow-hidden">
                  <div
                    className={clsx('h-full rounded-full transition-all', j.riskScore < 25 ? 'bg-lumina-success' : j.riskScore < 50 ? 'bg-lumina-warning' : 'bg-lumina-danger')}
                    style={{ width: `${j.riskScore}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-lumina-dim w-6 text-right">{j.riskScore}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Auto-Kill recommendations */}
      {KILL_RECOMMENDATIONS.filter((r) => !ignoredRecommendations.includes(r.jobId)).length > 0 && (
        <div className="card-glow border-lumina-danger/30">
          <div className="section-header text-lumina-danger">
            <AlertTriangle size={14} />
            Auto-Kill Recommendations
          </div>
          {KILL_RECOMMENDATIONS.filter((r) => !ignoredRecommendations.includes(r.jobId)).map((rec) => (
            <div key={rec.jobId} className="p-4 bg-lumina-danger/5 border border-lumina-danger/20 rounded-xl">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <div className="text-lumina-text font-semibold text-sm">{rec.jobName}</div>
                  <p className="text-lumina-dim text-xs mt-1">{rec.reason}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    className="btn-ghost text-xs py-1.5 px-3 flex items-center gap-1"
                    onClick={() => setIgnoredRecommendations([...ignoredRecommendations, rec.jobId])}
                  >
                    <CheckCircle size={11} /> Ignore
                  </button>
                  <button
                    className="text-xs py-1.5 px-3 rounded-lg bg-lumina-danger/20 text-lumina-danger border border-lumina-danger/30 hover:bg-lumina-danger/30 transition-colors flex items-center gap-1 disabled:opacity-50"
                    onClick={() => {
                      if (window.confirm(`Kill "${rec.jobName}"?`)) {
                        void updateStatus.mutate({ id: rec.jobId, status: 'killed' })
                        alert(`Job killed and marked for redirect to ${rec.redirectTo}`)
                      }
                    }}
                    disabled={updateStatus.isPending}
                  >
                    <X size={11} /> Kill & Redirect
                  </button>
                </div>
              </div>
              <div className="flex gap-4 text-xs text-lumina-dim">
                <span>Monthly revenue: <span className="text-lumina-text">${rec.monthlyLoss.toLocaleString()}</span></span>
                <span>→ Redirect to: <span className="text-lumina-pulse">{rec.redirectTo}</span></span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* AI-discovered opportunities */}
      <div className="card-glow">
        <div className="section-header">AI-Discovered Synergy Opportunities</div>
        <div className="space-y-2">
          {jobs.slice(0, 3).flatMap((jobA, i) => {
            const jobB = jobs[i + 1]
            if (!jobB) return []
            const value = Math.round((jobA.synergyScore + jobB.synergyScore) * 15)
            const conf  = Math.round((jobA.synergyScore + jobB.synergyScore) / 2)
            return [(
              <div key={`${jobA.id}-${jobB.id}`} className="p-3 bg-lumina-bg/60 rounded-lg hover:bg-lumina-bg transition-colors">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-lumina-text">{jobA.name.split(' ')[0]}</span>
                  <TrendingUp size={11} className="text-lumina-pulse" />
                  <span className="text-xs font-semibold text-lumina-text">{jobB.name.split(' ')[0]}</span>
                  <span className="badge-pulse badge ml-auto">synergy</span>
                  <span className="text-lumina-success font-mono text-xs">+${value.toLocaleString()}/mo</span>
                  <button
                    className="text-xs bg-lumina-pulse/20 text-lumina-pulse px-2 py-0.5 rounded-full hover:bg-lumina-pulse/30 transition-colors disabled:opacity-50"
                    onClick={async () => {
                      try {
                        const { error } = await supabase.from('synergy_links').insert({
                          job_a: jobA.id,
                          job_b: jobB.id,
                          synergy_type: 'cross-promotion',
                          value,
                          description: `Synergy between ${jobA.name} and ${jobB.name}`,
                          active: true,
                        })
                        if (error) throw error
                        alert('Synergy activated!')
                      } catch (err) {
                        console.error('Failed to activate synergy:', err)
                      }
                    }}
                  >
                    Activate
                  </button>
                </div>
                <p className="text-xs text-lumina-dim">
                  Synergy score: <span className="text-lumina-text">{conf}% confidence</span>
                </p>
              </div>
            )]
          })}
        </div>
      </div>
    </div>
  )
}
