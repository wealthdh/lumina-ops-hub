import {
  LayoutDashboard, Zap, Users, Shield, GitBranch,
  Video, TrendingUp, DollarSign, ChevronLeft, ChevronRight,
  Activity, Cpu, History, Sun, Moon, Bell,
  Megaphone, Bot, BrainCircuit, GraduationCap, Landmark,
} from 'lucide-react'
import clsx from 'clsx'
import { useNotificationPermission } from '../hooks/useNotifications'
import { useMT5Account } from '../hooks/useMT5'
import { useJobs } from '../hooks/useJobs'

interface SidebarProps {
  activeTab: string
  onTabChange: (tab: string) => void
  collapsed: boolean
  onToggle: () => void
  isDark?: boolean
  onThemeToggle?: () => void
}

function LuminaAlphaPanel({ collapsed }: { collapsed: boolean }) {
  const { data: account } = useMT5Account()
  const { data: jobs = [] } = useJobs()

  const isConnected = !!account
  const openTrades = account?.openTrades?.length ?? 0
  const dailyPnl = account?.dayPnl ?? 0
  const activeJobs = jobs.filter(j => j.status === 'active' || j.status === 'scaling').length

  return (
    <div className="border-t border-lumina-border px-2 py-3">
      {collapsed ? (
        <div className="flex justify-center">
          <div className={clsx(
            'w-2.5 h-2.5 rounded-full',
            isConnected ? 'bg-lumina-success animate-pulse' : 'bg-lumina-dim'
          )} />
        </div>
      ) : (
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <div className={clsx(
              'w-2 h-2 rounded-full flex-shrink-0',
              isConnected ? 'bg-lumina-success animate-pulse' : 'bg-lumina-dim'
            )} />
            <span className="text-lumina-text font-semibold">Lumina Alpha</span>
          </div>
          {isConnected && (
            <>
              <div className="text-lumina-dim">Monitoring {openTrades} EA{openTrades !== 1 ? 's' : ''}</div>
              <div className={dailyPnl >= 0 ? 'text-lumina-success' : 'text-lumina-warning'}>
                {dailyPnl >= 0 ? '+' : ''}${Math.abs(dailyPnl).toFixed(0)} today
              </div>
              <div className="text-lumina-dim">{activeJobs} jobs active</div>
              <div className="text-lumina-pulse font-semibold">Auto-pilot: ON</div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

const NAV_ITEMS = [
  { id: 'dashboard',      label: 'Ops Hub',            icon: LayoutDashboard },
  { id: 'twin-engine',    label: 'Twin-Engine',         icon: Activity },
  { id: 'edge-harmonizer',label: 'Edge Harmonizer',     icon: Zap },
  { id: 'funnel',         label: 'Lead-to-Cash Funnel', icon: Users },
  { id: 'digital-assets',  label: 'Digital Asset Store', icon: Shield },
  { id: 'synergy',        label: 'Synergy Brain',       icon: GitBranch },
  { id: 'content',        label: 'UGC Swarm',           icon: Video },
  { id: 'montecarlo',     label: 'Scenario Runner',     icon: TrendingUp },
  { id: 'money-flow',     label: 'Money Flow',          icon: DollarSign },
  { id: 'transactions',   label: 'Cash Out History',    icon: History },
  { id: 'customer-acquisition', label: 'Client Acquisition', icon: Megaphone },
  { id: 'poly-script',    label: 'Poly Script Trader',  icon: Bot },
  { id: 'agent-orchestrator', label: 'Agent Fleet',      icon: BrainCircuit },
  { id: 'education',      label: 'AI Education Hub',    icon: GraduationCap },
  { id: 'tax-optimizer',  label: 'Tax Shield Vault',    icon: Landmark },
]

export default function Sidebar({ activeTab, onTabChange, collapsed, onToggle, isDark = true, onThemeToggle }: SidebarProps) {
  const { permission, request } = useNotificationPermission()

  return (
    <aside
      className={clsx(
        'fixed left-0 top-0 h-full z-40 flex flex-col',
        'bg-lumina-surface border-r border-lumina-border',
        'transition-all duration-300',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-lumina-border min-h-[72px]">
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-lumina-pulse/20 flex items-center justify-center animate-pulse-slow">
          <Cpu size={18} className="text-lumina-pulse" />
        </div>
        {!collapsed && (
          <div>
            <div className="text-lumina-text font-bold text-sm leading-tight">Lumina</div>
            <div className="text-lumina-pulse font-mono text-xs">OPS HUB</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className={clsx(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg',
              'transition-all duration-150 text-left group',
              activeTab === id
                ? 'bg-lumina-pulse/15 text-lumina-pulse border border-lumina-pulse/30'
                : 'text-lumina-dim hover:text-lumina-text hover:bg-lumina-card',
            )}
            title={collapsed ? label : undefined}
          >
            <Icon size={18} className="flex-shrink-0" />
            {!collapsed && (
              <span className="text-sm font-medium truncate">{label}</span>
            )}
            {!collapsed && activeTab === id && (
              <div className="ml-auto w-1.5 h-1.5 rounded-full bg-lumina-pulse animate-pulse-fast" />
            )}
          </button>
        ))}
      </nav>

      {/* Lumina Alpha Status Panel */}
      <LuminaAlphaPanel collapsed={collapsed} />

      {/* Bottom controls */}
      <div className="px-2 py-3 border-t border-lumina-border space-y-1">
        {/* Notification enable button */}
        {permission !== 'granted' && (
          <button
            onClick={() => void request()}
            className={clsx(
              'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-left',
              'text-lumina-gold hover:bg-lumina-card text-xs',
            )}
            title="Enable push notifications"
          >
            <Bell size={16} className="flex-shrink-0" />
            {!collapsed && <span>Enable Alerts</span>}
          </button>
        )}

        {/* Theme toggle */}
        <button
          onClick={onThemeToggle}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-left text-lumina-dim hover:text-lumina-text hover:bg-lumina-card"
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark
            ? <Sun  size={16} className="flex-shrink-0 text-lumina-gold" />
            : <Moon size={16} className="flex-shrink-0 text-lumina-pulse" />
          }
          {!collapsed && <span className="text-xs">{isDark ? 'Light Mode' : 'Dark Mode'}</span>}
        </button>
      </div>

      {/* Version tag */}
      {!collapsed && (
        <div className="px-4 py-3 border-t border-lumina-border">
          <div className="text-lumina-dim text-xs font-mono">v2.0 - LuminaPulse MT5</div>
          <div className="flex items-center gap-1.5 mt-1">
            <div className="pulse-dot" />
            <span className="text-lumina-success text-xs">Bridge Connected</span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <div className="w-1.5 h-1.5 rounded-full bg-lumina-pulse animate-pulse" />
            <span className="text-lumina-pulse text-[10px] font-semibold">24/7 AUTO - ALL JOBS LIVE</span>
          </div>
        </div>
      )}

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-lumina-border border border-lumina-border
                   flex items-center justify-center text-lumina-dim hover:text-lumina-pulse
                   hover:border-lumina-pulse transition-colors z-50"
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </aside>
  )
}
