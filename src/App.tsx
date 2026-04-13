import { useState } from 'react'
import AuthGate from './components/AuthGate'
import OpsHub from './components/OpsHub'
import Sidebar from './components/Sidebar'
import { useNotificationsSetup } from './hooks/useNotifications'
import { useTheme } from './hooks/useTheme'

type Tab =
  | 'dashboard'
  | 'twin-engine'
  | 'funnel'
  | 'digital-assets'
  | 'edge-harmonizer'
  | 'synergy'
  | 'content'
  | 'montecarlo'
  | 'transactions'
  | 'poly-script'
  | 'tax-optimizer'

function AppInner() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const { isDark, toggle } = useTheme()

  // Wire up push notifications (fires on Supabase realtime events)
  useNotificationsSetup()

  return (
    <div className="flex h-screen overflow-hidden bg-lumina-bg">
      <Sidebar
        activeTab={activeTab}
        onTabChange={(t) => setActiveTab(t as Tab)}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((c) => !c)}
        isDark={isDark}
        onThemeToggle={toggle}
      />
      <main className={`flex-1 overflow-y-auto transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
        <OpsHub activeTab={activeTab} />
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AuthGate>
      <AppInner />
    </AuthGate>
  )
}
