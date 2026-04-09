import React, { useState } from 'react'
import {
  Settings as SettingsIcon,
  User,
  Zap,
  Wallet,
  CreditCard,
  Bell,
  Palette,
  Key,
  Download,
  Trash2,
  RotateCcw,
  Github,
  Copy,
  Check,
  Eye,
  EyeOff,
} from 'lucide-react'
import clsx from 'clsx'

interface ApiKey {
  name: string
  status: 'connected' | 'not-set'
  value?: string
  masked?: string
}

interface NotificationSetting {
  id: string
  label: string
  description: string
  enabled: boolean
}

export default function Settings() {
  const [activeSection, setActiveSection] = useState<'profile' | 'mt5' | 'wallet' | 'stripe' | 'notifications' | 'appearance' | 'api-keys' | 'data' | 'about'>('profile')
  const [showApiKey, setShowApiKey] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [darkMode, setDarkMode] = useState(true)
  const [accentColor, setAccentColor] = useState('#06b6d4')

  const [notifications, setNotifications] = useState<NotificationSetting[]>([
    { id: 'email-alerts', label: 'Email Alerts', description: 'Receive email notifications for important events', enabled: true },
    { id: 'push-notifications', label: 'Push Notifications', description: 'Browser push notifications for real-time updates', enabled: true },
    { id: 'trade-alerts', label: 'Trade Alerts', description: 'Alerts when trades open or close', enabled: true },
    { id: 'daily-briefing', label: 'Daily Briefing', description: 'Receive daily summary at 8 AM', enabled: true },
    { id: 'weekly-report', label: 'Weekly Report', description: 'Comprehensive weekly performance report', enabled: false },
  ])

  const apiKeys: Record<string, ApiKey> = {
    supabase: { name: 'Supabase', status: 'connected', masked: 'eyJhbGc...' },
    stripe: { name: 'Stripe', status: 'connected', masked: 'sk_live_51...' },
    mt5: { name: 'MT5 Bridge', status: 'connected', masked: '****937685' },
    plaid: { name: 'Plaid', status: 'not-set' },
    gumroad: { name: 'Gumroad', status: 'not-set' },
    polymarket: { name: 'Polymarket', status: 'connected', masked: '0x7f...9557A7' },
  }

  const copyToClipboard = (key: string) => {
    navigator.clipboard.writeText(key)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const toggleNotification = (id: string) => {
    setNotifications(notifications.map(n =>
      n.id === id ? { ...n, enabled: !n.enabled } : n
    ))
  }

  const handleExportData = () => {
    const data = {
      exported: new Date().toISOString(),
      user: {
        name: 'Darrell',
        email: 'wealthdh@gmail.com',
      },
      settings: {
        darkMode,
        accentColor,
        notifications,
      },
    }
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lumina-data-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleClearCache = () => {
    localStorage.clear()
    sessionStorage.clear()
    alert('Cache cleared successfully')
  }

  const handleResetDashboard = () => {
    if (confirm('Are you sure? This will reset all dashboard settings to defaults.')) {
      setDarkMode(true)
      setAccentColor('#06b6d4')
      alert('Dashboard reset to defaults')
    }
  }

  return (
    <div className="min-h-screen bg-lumina-bg p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-lumina-text mb-2 flex items-center gap-3">
            <SettingsIcon className="w-8 h-8 text-lumina-pulse" />
            Settings
          </h1>
          <p className="text-lumina-muted">Configure your Lumina Ops Hub account and preferences</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar Navigation */}
          <div className="lg:col-span-1">
            <div className="bg-lumina-card border border-lumina-border rounded-lg overflow-hidden sticky top-6">
              <nav className="space-y-1 p-2">
                {[
                  { id: 'profile', label: 'Profile', icon: User },
                  { id: 'mt5', label: 'MT5 Connection', icon: Zap },
                  { id: 'wallet', label: 'Wallet', icon: Wallet },
                  { id: 'stripe', label: 'Stripe', icon: CreditCard },
                  { id: 'notifications', label: 'Notifications', icon: Bell },
                  { id: 'appearance', label: 'Appearance', icon: Palette },
                  { id: 'api-keys', label: 'API Keys', icon: Key },
                  { id: 'data', label: 'Data Management', icon: Download },
                  { id: 'about', label: 'About', icon: SettingsIcon },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveSection(id as any)}
                    className={clsx(
                      'w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all text-left',
                      activeSection === id
                        ? 'bg-lumina-pulse/15 text-lumina-pulse border border-lumina-pulse/30'
                        : 'text-lumina-dim hover:text-lumina-text hover:bg-lumina-surface'
                    )}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{label}</span>
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {/* Profile Section */}
            {activeSection === 'profile' && (
              <div className="bg-lumina-card border border-lumina-border rounded-lg p-6 space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-lumina-text mb-4 flex items-center gap-2">
                    <User className="w-5 h-5 text-lumina-pulse" />
                    Profile Information
                  </h2>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-lumina-text mb-2">Name</label>
                    <input
                      type="text"
                      value="Darrell"
                      className="w-full px-4 py-2 bg-lumina-bg border border-lumina-border rounded-lg text-lumina-text focus:outline-none focus:border-lumina-pulse"
                      disabled
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-lumina-text mb-2">Email</label>
                    <input
                      type="email"
                      value="wealthdh@gmail.com"
                      className="w-full px-4 py-2 bg-lumina-bg border border-lumina-border rounded-lg text-lumina-text focus:outline-none focus:border-lumina-pulse"
                      disabled
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-lumina-text mb-2">Avatar</label>
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-lumina-pulse to-lumina-gold flex items-center justify-center text-2xl font-bold text-lumina-text">
                        D
                      </div>
                      <button className="btn-ghost px-4 py-2 text-sm">Upload Avatar</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* MT5 Connection Section */}
            {activeSection === 'mt5' && (
              <div className="bg-lumina-card border border-lumina-border rounded-lg p-6 space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-lumina-text mb-4 flex items-center gap-2">
                    <Zap className="w-5 h-5 text-lumina-pulse" />
                    MT5 Connection
                  </h2>
                </div>
                <div className="space-y-4">
                  <div className="p-4 bg-lumina-bg border border-lumina-success/20 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full bg-lumina-success" />
                      <span className="text-sm font-medium text-lumina-success">Connected</span>
                    </div>
                    <p className="text-xs text-lumina-muted">MT5 Bridge is connected and live</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-lumina-text mb-2">Account Number</label>
                    <input
                      type="text"
                      value="#937685"
                      className="w-full px-4 py-2 bg-lumina-bg border border-lumina-border rounded-lg text-lumina-text font-mono focus:outline-none focus:border-lumina-pulse"
                      disabled
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-lumina-text mb-2">API Key (masked)</label>
                    <div className="flex gap-2">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        value="sk_live_••••••••••••••••••••••••••••••••"
                        className="flex-1 px-4 py-2 bg-lumina-bg border border-lumina-border rounded-lg text-lumina-text font-mono focus:outline-none focus:border-lumina-pulse"
                        disabled
                      />
                      <button
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="p-2 text-lumina-dim hover:text-lumina-text rounded-lg border border-lumina-border hover:bg-lumina-surface"
                      >
                        {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <button className="btn-pulse w-full py-2 text-sm">Test Connection</button>
                </div>
              </div>
            )}

            {/* Wallet Section */}
            {activeSection === 'wallet' && (
              <div className="bg-lumina-card border border-lumina-border rounded-lg p-6 space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-lumina-text mb-4 flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-lumina-gold" />
                    Wallet
                  </h2>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-lumina-text mb-2">Cold Wallet Address</label>
                    <input
                      type="text"
                      value="0xc77a0B88d9f19BFbd5e5557A7"
                      className="w-full px-4 py-2 bg-lumina-bg border border-lumina-border rounded-lg text-lumina-text font-mono text-xs focus:outline-none focus:border-lumina-pulse"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-lumina-text mb-2">Network</label>
                    <div className="grid grid-cols-3 gap-2">
                      {['BSC', 'ETH', 'Polygon'].map(network => (
                        <button
                          key={network}
                          className={clsx(
                            'px-3 py-2 rounded-lg text-sm font-medium transition-all border',
                            network === 'BSC'
                              ? 'bg-lumina-pulse/15 border-lumina-pulse text-lumina-pulse'
                              : 'bg-lumina-bg border-lumina-border text-lumina-dim hover:border-lumina-pulse'
                          )}
                        >
                          {network}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Stripe Section */}
            {activeSection === 'stripe' && (
              <div className="bg-lumina-card border border-lumina-border rounded-lg p-6 space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-lumina-text mb-4 flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-lumina-pulse" />
                    Stripe Integration
                  </h2>
                </div>
                <div className="space-y-4">
                  <div className="p-4 bg-lumina-bg border border-lumina-success/20 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full bg-lumina-success" />
                      <span className="text-sm font-medium text-lumina-success">Connected</span>
                    </div>
                    <p className="text-xs text-lumina-muted">Stripe account is fully configured</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-lumina-text mb-2">Webhook URL (read-only)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value="https://api.luminapulse.co/webhooks/stripe"
                        className="flex-1 px-4 py-2 bg-lumina-bg border border-lumina-border rounded-lg text-lumina-text font-mono text-xs focus:outline-none"
                        disabled
                      />
                      <button
                        onClick={() => copyToClipboard('https://api.luminapulse.co/webhooks/stripe')}
                        className="p-2 text-lumina-dim hover:text-lumina-text rounded-lg border border-lumina-border hover:bg-lumina-surface"
                      >
                        {copiedKey === 'https://api.luminapulse.co/webhooks/stripe' ? (
                          <Check className="w-4 h-4 text-lumina-success" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-lumina-text mb-2">Last Webhook Received</label>
                    <input
                      type="text"
                      value="2 hours ago"
                      className="w-full px-4 py-2 bg-lumina-bg border border-lumina-border rounded-lg text-lumina-muted focus:outline-none"
                      disabled
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Notifications Section */}
            {activeSection === 'notifications' && (
              <div className="bg-lumina-card border border-lumina-border rounded-lg p-6 space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-lumina-text mb-4 flex items-center gap-2">
                    <Bell className="w-5 h-5 text-lumina-gold" />
                    Notifications
                  </h2>
                </div>
                <div className="space-y-3">
                  {notifications.map(notif => (
                    <div key={notif.id} className="flex items-start justify-between p-4 bg-lumina-bg border border-lumina-border rounded-lg">
                      <div className="flex-1">
                        <h3 className="text-sm font-medium text-lumina-text">{notif.label}</h3>
                        <p className="text-xs text-lumina-muted mt-1">{notif.description}</p>
                      </div>
                      <button
                        onClick={() => toggleNotification(notif.id)}
                        className={clsx(
                          'ml-4 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                          notif.enabled
                            ? 'bg-lumina-pulse/15 text-lumina-pulse'
                            : 'bg-lumina-surface text-lumina-muted'
                        )}
                      >
                        {notif.enabled ? 'On' : 'Off'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Appearance Section */}
            {activeSection === 'appearance' && (
              <div className="bg-lumina-card border border-lumina-border rounded-lg p-6 space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-lumina-text mb-4 flex items-center gap-2">
                    <Palette className="w-5 h-5 text-lumina-pulse" />
                    Appearance
                  </h2>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-lumina-text mb-3">Theme</label>
                    <div className="grid grid-cols-2 gap-2">
                      {['Dark', 'Light'].map(theme => (
                        <button
                          key={theme}
                          onClick={() => setDarkMode(theme === 'Dark')}
                          className={clsx(
                            'px-4 py-3 rounded-lg text-sm font-medium transition-all border',
                            (theme === 'Dark' && darkMode) || (theme === 'Light' && !darkMode)
                              ? 'bg-lumina-pulse/15 border-lumina-pulse text-lumina-pulse'
                              : 'bg-lumina-bg border-lumina-border text-lumina-dim hover:border-lumina-pulse'
                          )}
                        >
                          {theme === 'Dark' ? '🌙' : '☀️'} {theme} Mode
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-lumina-text mb-3">Accent Color</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className="w-16 h-10 rounded-lg cursor-pointer"
                      />
                      <input
                        type="text"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className="flex-1 px-4 py-2 bg-lumina-bg border border-lumina-border rounded-lg text-lumina-text font-mono focus:outline-none focus:border-lumina-pulse"
                      />
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      {['#06b6d4', '#ec4899', '#f59e0b', '#10b981'].map(color => (
                        <button
                          key={color}
                          onClick={() => setAccentColor(color)}
                          className="w-10 h-10 rounded-lg border-2"
                          style={{
                            backgroundColor: color,
                            borderColor: accentColor === color ? color : 'transparent',
                            borderWidth: accentColor === color ? '2px' : '1px',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* API Keys Section */}
            {activeSection === 'api-keys' && (
              <div className="bg-lumina-card border border-lumina-border rounded-lg p-6 space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-lumina-text mb-4 flex items-center gap-2">
                    <Key className="w-5 h-5 text-lumina-pulse" />
                    API Keys
                  </h2>
                </div>
                <div className="space-y-3">
                  {Object.entries(apiKeys).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between p-4 bg-lumina-bg border border-lumina-border rounded-lg">
                      <div>
                        <h3 className="text-sm font-medium text-lumina-text">{value.name}</h3>
                        <p className="text-xs text-lumina-muted mt-1 font-mono">{value.masked || 'Not configured'}</p>
                      </div>
                      <span
                        className={clsx(
                          'px-3 py-1.5 rounded-full text-xs font-medium',
                          value.status === 'connected'
                            ? 'bg-lumina-success/10 text-lumina-success'
                            : 'bg-lumina-warning/10 text-lumina-warning'
                        )}
                      >
                        {value.status === 'connected' ? '✓ Connected' : '○ Not Set'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Data Management Section */}
            {activeSection === 'data' && (
              <div className="bg-lumina-card border border-lumina-border rounded-lg p-6 space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-lumina-text mb-4 flex items-center gap-2">
                    <Download className="w-5 h-5 text-lumina-gold" />
                    Data Management
                  </h2>
                </div>
                <div className="space-y-3">
                  <button
                    onClick={handleExportData}
                    className="w-full flex items-center justify-between p-4 bg-lumina-bg border border-lumina-border rounded-lg hover:border-lumina-pulse transition-colors group"
                  >
                    <div className="text-left">
                      <h3 className="text-sm font-medium text-lumina-text">Export All Data</h3>
                      <p className="text-xs text-lumina-muted mt-1">Download your data as JSON</p>
                    </div>
                    <Download className="w-5 h-5 text-lumina-dim group-hover:text-lumina-pulse" />
                  </button>
                  <button
                    onClick={handleClearCache}
                    className="w-full flex items-center justify-between p-4 bg-lumina-bg border border-lumina-border rounded-lg hover:border-lumina-pulse transition-colors group"
                  >
                    <div className="text-left">
                      <h3 className="text-sm font-medium text-lumina-text">Clear Cache</h3>
                      <p className="text-xs text-lumina-muted mt-1">Clear browser cache and session data</p>
                    </div>
                    <Trash2 className="w-5 h-5 text-lumina-dim group-hover:text-lumina-pulse" />
                  </button>
                  <button
                    onClick={handleResetDashboard}
                    className="w-full flex items-center justify-between p-4 bg-lumina-bg border border-lumina-border rounded-lg hover:border-lumina-pulse transition-colors group"
                  >
                    <div className="text-left">
                      <h3 className="text-sm font-medium text-lumina-text">Reset Dashboard</h3>
                      <p className="text-xs text-lumina-muted mt-1">Reset all settings to defaults</p>
                    </div>
                    <RotateCcw className="w-5 h-5 text-lumina-dim group-hover:text-lumina-pulse" />
                  </button>
                </div>
              </div>
            )}

            {/* About Section */}
            {activeSection === 'about' && (
              <div className="bg-lumina-card border border-lumina-border rounded-lg p-6 space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-lumina-text mb-4 flex items-center gap-2">
                    <SettingsIcon className="w-5 h-5 text-lumina-pulse" />
                    About
                  </h2>
                </div>
                <div className="space-y-4">
                  <div className="p-4 bg-lumina-bg border border-lumina-border rounded-lg">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-sm text-lumina-muted">Version</span>
                      <span className="text-sm font-semibold text-lumina-text font-mono">v2.0</span>
                    </div>
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-sm text-lumina-muted">Build Date</span>
                      <span className="text-sm font-semibold text-lumina-text font-mono">{new Date().toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-lumina-muted">Codename</span>
                      <span className="text-sm font-semibold text-lumina-text font-mono">Gallant Cannon</span>
                    </div>
                  </div>
                  <div className="p-4 bg-lumina-bg border border-lumina-border rounded-lg">
                    <h3 className="text-sm font-semibold text-lumina-text mb-3">Quick Links</h3>
                    <div className="space-y-2">
                      <a
                        href="https://github.com/luminapulse/ops-hub"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-xs text-lumina-pulse hover:text-lumina-gold transition-colors"
                      >
                        <Github className="w-4 h-4" />
                        GitHub Repository
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
