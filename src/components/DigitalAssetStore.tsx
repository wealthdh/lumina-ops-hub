/**
 * Digital Asset Store
 * Create once, sell infinite times: Trading indicators, templates, AI prompt packs, datasets
 * NOW: Fetches real products from stripe_products table and sales from income_entries table
 */

import { useState, useEffect, useCallback } from 'react'
import { Package, ShoppingCart, Star, TrendingUp, Plus, ExternalLink, BarChart3, Award, AlertCircle, Users, Zap, CreditCard } from 'lucide-react'
import clsx from 'clsx'
import { supabase } from '../lib/supabase'

// âââ Types ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// Raw shape from stripe_products table
interface StripeProductRow {
  id: string
  product_name: string
  stripe_product_id: string | null
  stripe_price_id: string | null
  stripe_payment_link_id: string | null
  payment_url: string | null
  price_cents: number
  status: string
  created_at: string
  updated_at: string
}

// Normalized shape used by the component
interface StripeProduct {
  id: string
  name: string
  price: number
  status: 'live' | 'draft'
  payment_url: string
  created_at: string
}

interface IncomeEntry {
  id: string
  amount: number
  source: string
  created_at: string
  description?: string
  reference_id?: string | null
  [key: string]: unknown
}

interface DailySalesData {
  day: string
  sales: number
  revenue: number
}

interface ProductWithSales extends StripeProduct {
  sales_count: number
  product_revenue: number
}

// âââ Sub-components ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function StatusBadge({ status }: { status: 'live' | 'draft' }) {
  if (status === 'live') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-lumina-success/20 text-lumina-success">
        <span className="w-1.5 h-1.5 rounded-full bg-lumina-success animate-pulse-fast" />
        Live
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-lumina-muted/20 text-lumina-dim">
      Draft
    </span>
  )
}

function SimpleBarChart({ data }: { data: DailySalesData[] }) {
  const maxRevenue = Math.max(...data.map(d => d.revenue), 1)

  return (
    <div className="h-32 flex items-end justify-between gap-2">
      {data.map((d) => (
        <div key={d.day} className="flex-1 flex flex-col items-center gap-2">
          <div className="w-full bg-lumina-bg rounded-sm overflow-hidden">
            <div
              className="bg-gradient-to-t from-lumina-pulse to-lumina-pulse/60 rounded-sm transition-all duration-300"
              style={{ height: `${(d.revenue / maxRevenue) * 100}%`, minHeight: d.revenue > 0 ? '4px' : '0' }}
            />
          </div>
          <span className="text-[10px] text-lumina-dim font-mono">{d.day}</span>
        </div>
      ))}
    </div>
  )
}

// âââ Main Component âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

export default function DigitalAssetStore() {
  const [products, setProducts] = useState<ProductWithSales[]>([])
  const [incomeEntries, setIncomeEntries] = useState<IncomeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [initializing, setInitializing] = useState(false)

  const [newProduct, setNewProduct] = useState({
    name: '',
    price: '',
    status: 'draft' as const,
    description: '',
  })

  // Fetch products and income data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Fetch products (raw rows from stripe_products)
      const { data: rawProducts, error: productsError } = await supabase
        .from('stripe_products')
        .select('*')
        .order('created_at', { ascending: false })

      if (productsError) {
        throw new Error(`Failed to fetch products: ${productsError.message}`)
      }

      // Normalize column names: product_name â name, price_cents â price (dollars)
      const productsData: StripeProduct[] = (rawProducts || []).map((row: StripeProductRow) => ({
        id: row.id,
        name: row.product_name,
        price: row.price_cents / 100,
        status: (row.status === 'active' ? 'live' : 'draft') as 'live' | 'draft',
        payment_url: row.payment_url || '',
        created_at: row.created_at,
      }))

      // Fetch income entries (stripe source only)
      const { data: incomeData, error: incomeError } = await supabase
        .from('income_entries')
        .select('*')
        .eq('source', 'stripe')
        .order('created_at', { ascending: false })

      if (incomeError) {
        throw new Error(`Failed to fetch income: ${incomeError.message}`)
      }

      setIncomeEntries(incomeData || [])

      // Enrich products with sales data
      // Match income entries to products by checking if description contains the product name
      const enrichedProducts = productsData.map((prod) => {
        const productSales = (incomeData || []).filter((entry: IncomeEntry) => {
          const desc = entry.description || ''
          return desc.toLowerCase().includes(prod.name.toLowerCase().slice(0, 20))
        })

        const salesCount = productSales.length
        const productRevenue = productSales.reduce((sum: number, entry: IncomeEntry) => sum + entry.amount, 0)

        return {
          ...prod,
          sales_count: salesCount,
          product_revenue: productRevenue,
        }
      })

      setProducts(enrichedProducts)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      console.error('DigitalAssetStore fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial fetch
  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Subscribe to realtime changes
  useEffect(() => {
    // Subscribe to stripe_products changes
    const productsChannel = supabase
      .channel('stripe_products_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stripe_products' },
        () => {
          void fetchData()
        }
      )
      .subscribe()

    // Subscribe to income_entries changes
    const incomeChannel = supabase
      .channel('income_entries_changes_digital_store')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'income_entries',
          filter: 'source=eq.stripe',
        },
        () => {
          void fetchData()
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(productsChannel)
      void supabase.removeChannel(incomeChannel)
    }
  }, [fetchData])

  // Calculate stats
  const totalProducts = products.length
  const totalSales = products.reduce((sum, p) => sum + p.sales_count, 0)
  const thisMonth = new Date()
  const monthStart = new Date(thisMonth.getFullYear(), thisMonth.getMonth(), 1)
  const monthStartStr = monthStart.toISOString().split('T')[0]

  const revenueThisMonth = incomeEntries
    .filter((entry) => entry.source === 'stripe' && entry.created_at?.split('T')[0] >= monthStartStr)
    .reduce((sum, entry) => sum + entry.amount, 0)

  // Build daily sales chart (last 14 days)
  const getDailySalesData = (): DailySalesData[] => {
    const days: Map<string, { sales: number; revenue: number }> = new Map()

    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      days.set(dateStr, { sales: 0, revenue: 0 })
    }

    // Count sales and revenue per day
    incomeEntries.forEach((entry) => {
      if (entry.source === 'stripe') {
        const existing = days.get(entry.created_at?.split('T')[0]) || { sales: 0, revenue: 0 }
        existing.sales += 1
        existing.revenue += entry.amount
        days.set(entry.created_at?.split('T')[0], existing)
      }
    })

    return Array.from(days.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateStr, { sales, revenue }]) => {
        // Format as short day number
        const d = new Date(dateStr)
        return {
          day: String(d.getDate()),
          sales,
          revenue,
        }
      })
  }

  const dailySalesData = getDailySalesData()

  const handleInitializeStore = async () => {
    try {
      setInitializing(true)
      const response = await fetch('/api/create-payment-links', { method: 'POST' })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(`API error: ${response.status} ${text}`)
      }
      // Refetch after initialization
      await fetchData()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      console.error('Initialize store error:', err)
    } finally {
      setInitializing(false)
    }
  }

  const handleCreateProduct = async () => {
    if (!newProduct.name || !newProduct.price) {
      setError('Product name and price are required')
      return
    }

    try {
      const { error: insertError } = await supabase.from('stripe_products').insert({
        product_name: newProduct.name,
        price_cents: Math.round(parseFloat(newProduct.price) * 100),
        status: newProduct.status === 'draft' ? 'draft' : 'active',
        payment_url: '',
      })

      if (insertError) {
        throw new Error(insertError.message)
      }

      // Reset form
      setNewProduct({ name: '', price: '', status: 'draft', description: '' })
      setError(null)
      await fetchData()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      console.error('Create product error:', err)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lumina-text font-bold text-xl">Digital Asset Store</h1>
          <p className="text-lumina-dim text-sm">Real-time product sales & revenue tracking</p>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
          <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-300">{error}</div>
        </div>
      )}

      {/* Revenue Stats Bar */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card-glow">
          <div className="stat-label">Total Products</div>
          <div className="stat-value text-lumina-text">{totalProducts}</div>
        </div>
        <div className="card-glow">
          <div className="stat-label">Total Sales</div>
          <div className="stat-value text-lumina-pulse">{totalSales}</div>
        </div>
        <div className="card-glow">
          <div className="stat-label">Revenue This Month</div>
          <div className="stat-value text-lumina-gold">${revenueThisMonth.toFixed(2)}</div>
        </div>
        <div className="card-glow">
          <div className="stat-label">Avg Rating</div>
          <div className="stat-value text-lumina-success">â</div>
        </div>
      </div>

      {/* Product Grid or Empty State */}
      <div className="card-glow">
        <div className="section-header">
          <Package size={14} />
          Digital Products
        </div>

        {loading ? (
          <div className="p-8 text-center text-lumina-dim">Loading products...</div>
        ) : products.length === 0 ? (
          <div className="space-y-4 p-6">
            <div className="p-6 bg-lumina-bg/60 rounded-xl border border-lumina-border text-center">
              <Package size={32} className="mx-auto mb-3 text-lumina-dim" />
              <p className="text-sm text-lumina-dim mb-4">
                No products listed yet. Deploy API and run POST /api/create-payment-links to initialize your store.
              </p>
              <button
                onClick={handleInitializeStore}
                disabled={initializing}
                className={clsx(
                  'inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all',
                  initializing ? 'bg-lumina-muted/20 text-lumina-dim cursor-not-allowed' : 'btn-pulse'
                )}
              >
                <Plus size={14} />
                {initializing ? 'Initializing...' : 'Initialize Store'}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {products.map((product) => (
              <div
                key={product.id}
                className="p-4 bg-lumina-bg/60 rounded-xl border border-lumina-border hover:border-lumina-pulse/30 transition-all"
              >
                {/* Product header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-lumina-text truncate">{product.name}</h3>
                  </div>
                  <StatusBadge status={product.status} />
                </div>

                {/* Price and stats */}
                <div className="flex items-baseline gap-3 mb-3">
                  <span className="text-lg font-bold text-lumina-gold">${product.price.toFixed(2)}</span>
                  <span className="text-xs text-lumina-dim">{product.sales_count} sales</span>
                  <span className="text-xs text-lumina-pulse font-mono">${product.product_revenue.toFixed(2)}</span>
                </div>

                {/* Buy Now button */}
                {product.payment_url ? (
                  <a
                    href={product.payment_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-lumina-pulse hover:text-lumina-pulse/80 transition-colors"
                  >
                    <ExternalLink size={12} />
                    Buy Now
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-lumina-dim">
                    <ExternalLink size={12} />
                    No Payment Link
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sales Chart */}
      <div className="card-glow">
        <div className="section-header">
          <BarChart3 size={14} />
          Sales Last 14 Days
        </div>
        <div className="p-6">
          <SimpleBarChart data={dailySalesData} />
          <div className="flex justify-between mt-4 text-xs text-lumina-dim font-mono">
            <span>14 days ago</span>
            <span>Today</span>
          </div>
        </div>
      </div>

      {/* Top Sellers Leaderboard */}
      {products.length > 0 && (
        <div className="card-glow">
          <div className="section-header">
            <Award size={14} />
            Top Sellers by Revenue
          </div>

          <div className="space-y-3">
            {products
              .filter((p) => p.product_revenue > 0)
              .sort((a, b) => b.product_revenue - a.product_revenue)
              .slice(0, 5)
              .map((product, idx) => {
                const totalRevenue = products.reduce((sum, p) => sum + p.product_revenue, 0)
                const percentage = totalRevenue > 0 ? (product.product_revenue / totalRevenue) * 100 : 0

                return (
                  <div key={product.id} className="p-3 bg-lumina-bg/60 rounded-lg">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-lumina-muted">#{idx + 1}</span>
                          <h4 className="text-sm font-medium text-lumina-text truncate">{product.name}</h4>
                        </div>
                        <div className="flex gap-3 text-xs text-lumina-dim">
                          <span>{product.sales_count} sales</span>
                          <span>${product.product_revenue.toFixed(2)}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-lumina-gold">{percentage.toFixed(1)}%</div>
                        <p className="text-xs text-lumina-dim">of total</p>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full bg-lumina-border/20 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-lumina-gold to-lumina-pulse rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* ââ Wholesale Licenses for Resellers âââââââââââââââââââââââââââââââââââ */}
      <div className="card-glow border-lumina-pulse/30">
        <div className="section-header">
          <Users size={14} />
          Wholesale Agent Licenses
          <span className="ml-auto badge-success text-[10px]">LIVE</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Agent Wholesale License */}
          <div className="p-5 bg-gradient-to-br from-lumina-bg to-lumina-pulse/5 rounded-xl border border-lumina-pulse/20 hover:border-lumina-pulse/40 transition-all">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-lumina-text">Agent Wholesale License</h3>
                <p className="text-[11px] text-lumina-dim mt-1">Bulk access â agents get their own sub-account</p>
              </div>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-lumina-success/20 text-lumina-success">
                <span className="w-1.5 h-1.5 rounded-full bg-lumina-success animate-pulse-fast" />
                Live
              </span>
            </div>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-2xl font-bold text-lumina-gold">$49 â $99</span>
              <span className="text-xs text-lumina-dim">one-time</span>
            </div>
            <ul className="space-y-1.5 mb-4 text-[11px] text-lumina-dim">
              <li className="flex items-center gap-1.5"><Zap size={10} className="text-lumina-pulse" /> Own sub-account dashboard</li>
              <li className="flex items-center gap-1.5"><Zap size={10} className="text-lumina-pulse" /> Run all agent jobs independently</li>
              <li className="flex items-center gap-1.5"><Zap size={10} className="text-lumina-pulse" /> White-label client reports</li>
              <li className="flex items-center gap-1.5"><Zap size={10} className="text-lumina-pulse" /> Stripe auto-payouts</li>
            </ul>
            <button
              onClick={() => {
                const stripeUrl = `https://buy.stripe.com/test_wholesale_agent`
                window.open(stripeUrl, '_blank')
              }}
              className="w-full btn-pulse text-xs py-2.5 flex items-center justify-center gap-2"
            >
              <CreditCard size={13} />
              Buy Agent License via Stripe
            </button>
          </div>

          {/* Monthly Reseller Pass */}
          <div className="p-5 bg-gradient-to-br from-lumina-bg to-lumina-gold/5 rounded-xl border border-lumina-gold/20 hover:border-lumina-gold/40 transition-all relative overflow-hidden">
            <div className="absolute top-2 right-2 px-2 py-0.5 bg-lumina-gold/20 rounded text-[9px] font-bold text-lumina-gold uppercase tracking-wider">Best Value</div>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-lumina-text">Monthly Reseller Pass</h3>
                <p className="text-[11px] text-lumina-dim mt-1">Run & price ALL jobs â unlimited reselling</p>
              </div>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-lumina-success/20 text-lumina-success">
                <span className="w-1.5 h-1.5 rounded-full bg-lumina-success animate-pulse-fast" />
                Live
              </span>
            </div>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-2xl font-bold text-lumina-gold">$197</span>
              <span className="text-xs text-lumina-dim">/month</span>
            </div>
            <ul className="space-y-1.5 mb-4 text-[11px] text-lumina-dim">
              <li className="flex items-center gap-1.5"><Zap size={10} className="text-lumina-gold" /> Full Agent Fleet access (all 6 agents)</li>
              <li className="flex items-center gap-1.5"><Zap size={10} className="text-lumina-gold" /> Set your own pricing on every job</li>
              <li className="flex items-center gap-1.5"><Zap size={10} className="text-lumina-gold" /> Unlimited client sub-accounts</li>
              <li className="flex items-center gap-1.5"><Zap size={10} className="text-lumina-gold" /> Priority agent queue + Dream Mode</li>
              <li className="flex items-center gap-1.5"><Zap size={10} className="text-lumina-gold" /> Revenue dashboard + auto cash-out</li>
            </ul>
            <button
              onClick={() => {
                const stripeUrl = `https://buy.stripe.com/test_reseller_pass`
                window.open(stripeUrl, '_blank')
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-xs bg-lumina-gold text-lumina-bg hover:bg-lumina-gold/90 transition-all"
            >
              <CreditCard size={13} />
              Subscribe via Stripe â $197/mo
            </button>
          </div>
        </div>

        <div className="text-[10px] text-lumina-dim text-center">
          Stripe handles all payments, invoicing, and payouts automatically. You only see Money Flow / Cash Out History.
        </div>
      </div>

      {/* Create New Product */}
      <div className="card-glow">
        <div className="section-header">
          <Plus size={14} />
          Create New Product
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="text-xs font-semibold text-lumina-text block mb-2">Product Name</label>
            <input
              type="text"
              placeholder="e.g., Advanced Trading Bot Template"
              value={newProduct.name}
              onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
              className="w-full px-3 py-2 bg-lumina-bg border border-lumina-border rounded-lg text-sm text-lumina-text placeholder-lumina-dim focus:border-lumina-pulse focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-lumina-text block mb-2">Price ($)</label>
            <input
              type="number"
              placeholder="99.99"
              min="0"
              step="0.01"
              value={newProduct.price}
              onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
              className="w-full px-3 py-2 bg-lumina-bg border border-lumina-border rounded-lg text-sm text-lumina-text placeholder-lumina-dim focus:border-lumina-pulse focus:outline-none transition-colors"
            />
          </div>

          <button
            onClick={handleCreateProduct}
            disabled={!newProduct.name || !newProduct.price}
            className={clsx(
              'w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all',
              newProduct.name && newProduct.price ? 'btn-pulse' : 'bg-lumina-muted/20 text-lumina-dim cursor-not-allowed'
            )}
          >
            <Plus size={14} />
            Create Listing
          </button>
        </div>
      </div>
    </div>
  )
}
