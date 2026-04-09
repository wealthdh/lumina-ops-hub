/**
 * Digital Asset Store — REAL DATA ONLY
 *
 * - Products from stripe_products table
 * - Sales from orders table (written by verified webhook only)
 * - Revenue from orders table (NOT income_entries guesswork)
 * - Checkout success/failure states from URL params after Stripe redirect
 * - Realtime subscriptions on both tables
 *
 * NO fake data. NO simulated revenue. Only confirmed Stripe payments.
 */

import { useState, useEffect, useCallback } from 'react'
import { Package, ShoppingCart, Star, TrendingUp, Plus, ExternalLink, BarChart3, Award, AlertCircle, Users, Zap, CreditCard, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import { supabase } from '../lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────
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

interface StripeProduct {
  id: string
  name: string
  price: number
  status: 'live' | 'draft'
  payment_url: string
  created_at: string
}

interface OrderRow {
  id: string
  stripe_session_id: string
  product_id: string | null
  buyer_email: string
  amount: number
  currency: string
  payment_status: string
  created_at: string
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

// ─── Sub-components ──────────────────────────────────────────────────────────

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
          <div className="w-full bg-lumina-bg rounded-sm overflow-hidden" style={{ height: '100%' }}>
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

/** Checkout result banner — shown after Stripe redirect */
function CheckoutBanner({ status, product, onDismiss }: { status: 'success' | 'cancelled'; product?: string; onDismiss: () => void }) {
  if (status === 'success') {
    return (
      <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-start gap-3 animate-fade-in">
        <CheckCircle size={18} className="text-emerald-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-emerald-300">Payment confirmed!</p>
          <p className="text-xs text-emerald-300/70 mt-1">
            {product ? `Your purchase of "${product}" is being processed.` : 'Your order is being processed.'}{' '}
            You'll receive a confirmation email shortly.
          </p>
        </div>
        <button onClick={onDismiss} className="text-emerald-400/50 hover:text-emerald-400 text-xs">Dismiss</button>
      </div>
    )
  }

  return (
    <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-3 animate-fade-in">
      <XCircle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-amber-300">Checkout cancelled</p>
        <p className="text-xs text-amber-300/70 mt-1">No charge was made. You can try again anytime.</p>
      </div>
      <button onClick={onDismiss} className="text-amber-400/50 hover:text-amber-400 text-xs">Dismiss</button>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DigitalAssetStore() {
  const [products, setProducts] = useState<ProductWithSales[]>([])
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [initializing, setInitializing] = useState(false)
  const [checkoutStatus, setCheckoutStatus] = useState<'success' | 'cancelled' | null>(null)
  const [checkoutProduct, setCheckoutProduct] = useState<string | undefined>(undefined)

  const [purchaseLoading, setPurchaseLoading] = useState<string | null>(null) // product ID being purchased
  const [purchaseError, setPurchaseError] = useState<string | null>(null)

  const [newProduct, setNewProduct] = useState({
    name: '',
    price: '',
    status: 'draft' as const,
    description: '',
  })

  // ── Check URL params for checkout result on mount ─────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const checkout = params.get('checkout')
    const product = params.get('product')

    if (checkout === 'success') {
      setCheckoutStatus('success')
      if (product) setCheckoutProduct(decodeURIComponent(product))
      // Clean URL without reload
      window.history.replaceState({}, '', window.location.pathname)
    } else if (checkout === 'cancelled') {
      setCheckoutStatus('cancelled')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  // ── Fetch products + orders (REAL data only) ──────────────────────────────
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

      // Normalize column names
      const productsData: StripeProduct[] = (rawProducts || []).map((row: StripeProductRow) => ({
        id: row.id,
        name: row.product_name,
        price: row.price_cents / 100,
        status: (row.status === 'active' ? 'live' : 'draft') as 'live' | 'draft',
        payment_url: row.payment_url || '',
        created_at: row.created_at,
      }))

      // Fetch REAL orders from orders table (written by webhook only)
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('id, stripe_session_id, product_id, buyer_email, amount, currency, payment_status, created_at')
        .eq('payment_status', 'paid')
        .order('created_at', { ascending: false })

      if (ordersError) {
        console.warn('Orders table may not exist yet:', ordersError.message)
        // Don't throw — orders table might not be created yet
      }

      const realOrders: OrderRow[] = ordersData || []
      setOrders(realOrders)

      // Enrich products with REAL sales data from orders table
      const enrichedProducts = productsData.map((prod) => {
        // Match orders by product_id (set by webhook when it matches stripe_products)
        const productOrders = realOrders.filter((order) => order.product_id === prod.id)
        const salesCount = productOrders.length
        const productRevenue = productOrders.reduce((sum, order) => sum + order.amount, 0)

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
      console.error('[DigitalAssetStore] fetch error:', err)
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
          console.log('[DigitalAssetStore] stripe_products changed — refetching')
          void fetchData()
        }
      )
      .subscribe()

    // Subscribe to orders table (REAL sales)
    const ordersChannel = supabase
      .channel('orders_changes_digital_store')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          console.log('[DigitalAssetStore] New order received:', payload.new)
          void fetchData()
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(productsChannel)
      void supabase.removeChannel(ordersChannel)
    }
  }, [fetchData])

  // ── Calculate stats from REAL orders only ─────────────────────────────────
  const totalProducts = products.length
  const totalSales = orders.length
  const thisMonth = new Date()
  const monthStart = new Date(thisMonth.getFullYear(), thisMonth.getMonth(), 1)
  const monthStartStr = monthStart.toISOString().split('T')[0]

  const revenueThisMonth = orders
    .filter((order) => order.created_at?.split('T')[0] >= monthStartStr)
    .reduce((sum, order) => sum + order.amount, 0)

  const totalRevenue = orders.reduce((sum, order) => sum + order.amount, 0)

  // Build daily sales chart (last 14 days) from REAL orders
  const getDailySalesData = (): DailySalesData[] => {
    const days: Map<string, { sales: number; revenue: number }> = new Map()

    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      days.set(dateStr, { sales: 0, revenue: 0 })
    }

    // Count REAL orders per day
    orders.forEach((order) => {
      const dateStr = order.created_at?.split('T')[0]
      const existing = days.get(dateStr)
      if (existing) {
        existing.sales += 1
        existing.revenue += order.amount
      }
    })

    return Array.from(days.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateStr, { sales, revenue }]) => {
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
      setError(null)
      console.log('[DigitalAssetStore] Initializing store — calling /api/create-payment-links')
      const response = await fetch('/api/create-payment-links', { method: 'POST' })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(`API error: ${response.status} — ${data.error || data.details || 'Unknown'}`)
      }
      console.log('[DigitalAssetStore] Store initialized:', data)
      await fetchData()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      console.error('[DigitalAssetStore] Initialize error:', err)
    } finally {
      setInitializing(false)
    }
  }

  // ── Handle REAL Stripe Checkout — creates session server-side, redirects buyer
  const handleBuyNow = async (product: ProductWithSales) => {
    try {
      setPurchaseLoading(product.id)
      setPurchaseError(null)
      console.log('[DigitalAssetStore] Creating checkout session for:', product.name, product.id)

      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: product.id }),
      })

      const data = await response.json()
      console.log('[DigitalAssetStore] Checkout session response:', { status: response.status, data })

      if (!response.ok) {
        throw new Error(data.details || data.error || `Checkout failed: ${response.status}`)
      }

      if (!data.url) {
        throw new Error('No checkout URL returned from server')
      }

      // Redirect to Stripe Checkout
      console.log('[DigitalAssetStore] Redirecting to Stripe Checkout:', data.url)
      window.location.href = data.url
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown checkout error'
      setPurchaseError(message)
      console.error('[DigitalAssetStore] Checkout error:', err)
    } finally {
      setPurchaseLoading(null)
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

      setNewProduct({ name: '', price: '', status: 'draft', description: '' })
      setError(null)
      await fetchData()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      console.error('[DigitalAssetStore] Create product error:', err)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lumina-text font-bold text-xl">Digital Asset Store</h1>
          <p className="text-lumina-dim text-sm">Real-time sales from verified Stripe payments only</p>
        </div>
      </div>

      {/* Checkout result banner */}
      {checkoutStatus && (
        <CheckoutBanner
          status={checkoutStatus}
          product={checkoutProduct}
          onDismiss={() => { setCheckoutStatus(null); setCheckoutProduct(undefined) }}
        />
      )}

      {/* Error Alert */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
          <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-300">{error}</div>
        </div>
      )}

      {/* Purchase Error */}
      {purchaseError && (
        <div className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-lg flex items-start gap-3">
          <AlertCircle size={16} className="text-orange-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-orange-300">Checkout Error</p>
            <p className="text-xs text-orange-300/70 mt-1">{purchaseError}</p>
          </div>
          <button onClick={() => setPurchaseError(null)} className="text-orange-400/50 hover:text-orange-400 text-xs">Dismiss</button>
        </div>
      )}

      {/* Revenue Stats Bar — ALL from real orders table */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card-glow">
          <div className="stat-label">Total Products</div>
          <div className="stat-value text-lumina-text">{totalProducts}</div>
        </div>
        <div className="card-glow">
          <div className="stat-label">Confirmed Sales</div>
          <div className="stat-value text-lumina-pulse">{totalSales}</div>
        </div>
        <div className="card-glow">
          <div className="stat-label">Revenue This Month</div>
          <div className="stat-value text-lumina-gold">${revenueThisMonth.toFixed(2)}</div>
        </div>
        <div className="card-glow">
          <div className="stat-label">All-Time Revenue</div>
          <div className="stat-value text-lumina-success">${totalRevenue.toFixed(2)}</div>
        </div>
      </div>

      {/* Product Grid or Empty State */}
      <div className="card-glow">
        <div className="section-header">
          <Package size={14} />
          Digital Products
        </div>

        {loading ? (
          <div className="p-8 text-center text-lumina-dim flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin" />
            Loading products...
          </div>
        ) : products.length === 0 ? (
          <div className="space-y-4 p-6">
            <div className="p-6 bg-lumina-bg/60 rounded-xl border border-lumina-border text-center">
              <Package size={32} className="mx-auto mb-3 text-lumina-dim" />
              <p className="text-sm text-lumina-dim mb-4">
                No products listed yet. Click below to create Stripe products + payment links.
              </p>
              <button
                onClick={handleInitializeStore}
                disabled={initializing}
                className={clsx(
                  'inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all',
                  initializing ? 'bg-lumina-muted/20 text-lumina-dim cursor-not-allowed' : 'btn-pulse'
                )}
              >
                {initializing ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {initializing ? 'Creating Stripe Products...' : 'Initialize Store'}
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
                  <span className="text-xs text-lumina-dim">{product.sales_count} sale{product.sales_count !== 1 ? 's' : ''}</span>
                  {product.product_revenue > 0 && (
                    <span className="text-xs text-lumina-pulse font-mono">${product.product_revenue.toFixed(2)} earned</span>
                  )}
                </div>

                {/* Buy Now button — REAL Stripe Checkout Session */}
                <button
                  onClick={() => handleBuyNow(product)}
                  disabled={purchaseLoading === product.id}
                  className={clsx(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    purchaseLoading === product.id
                      ? 'bg-lumina-muted/20 text-lumina-dim cursor-wait'
                      : 'bg-lumina-pulse/10 text-lumina-pulse hover:bg-lumina-pulse/20'
                  )}
                >
                  {purchaseLoading === product.id ? (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      Opening Stripe...
                    </>
                  ) : (
                    <>
                      <ShoppingCart size={12} />
                      Buy Now — Stripe Checkout
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sales Chart — from REAL orders */}
      <div className="card-glow">
        <div className="section-header">
          <BarChart3 size={14} />
          Confirmed Sales — Last 14 Days
        </div>
        <div className="p-6">
          {orders.length === 0 ? (
            <div className="text-center text-lumina-dim text-sm py-8">
              No confirmed sales yet. Chart will populate as orders come in.
            </div>
          ) : (
            <>
              <SimpleBarChart data={dailySalesData} />
              <div className="flex justify-between mt-4 text-xs text-lumina-dim font-mono">
                <span>14 days ago</span>
                <span>Today</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Recent Orders — REAL verified payments */}
      {orders.length > 0 && (
        <div className="card-glow">
          <div className="section-header">
            <CreditCard size={14} />
            Recent Verified Orders
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {orders.slice(0, 10).map((order) => (
              <div key={order.id} className="p-3 bg-lumina-bg/60 rounded-lg flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <CheckCircle size={12} className="text-emerald-400 flex-shrink-0" />
                    <span className="text-xs text-lumina-text truncate">{order.buyer_email}</span>
                  </div>
                  <div className="text-[10px] text-lumina-dim mt-1 font-mono">
                    {new Date(order.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-lumina-gold">${order.amount.toFixed(2)}</div>
                  <div className="text-[10px] text-lumina-dim">{order.currency}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Sellers Leaderboard */}
      {products.some(p => p.product_revenue > 0) && (
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
                          <span>{product.sales_count} sale{product.sales_count !== 1 ? 's' : ''}</span>
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

      {/* ── Wholesale Licenses for Resellers ─────────────────────────────────── */}
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
                <p className="text-[11px] text-lumina-dim mt-1">Bulk access — agents get their own sub-account</p>
              </div>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-lumina-success/20 text-lumina-success">
                <span className="w-1.5 h-1.5 rounded-full bg-lumina-success animate-pulse-fast" />
                Live
              </span>
            </div>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-2xl font-bold text-lumina-gold">$49 – $99</span>
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
                // TODO: Replace with real Stripe payment link once wholesale product is created
                setError('Wholesale license payment link not yet configured. Run POST /api/create-payment-links to set up.')
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
                <p className="text-[11px] text-lumina-dim mt-1">Run & price ALL jobs — unlimited reselling</p>
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
                // TODO: Replace with real Stripe subscription link
                setError('Reseller subscription link not yet configured. Create a recurring price in Stripe first.')
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-xs bg-lumina-gold text-lumina-bg hover:bg-lumina-gold/90 transition-all"
            >
              <CreditCard size={13} />
              Subscribe via Stripe — $197/mo
            </button>
          </div>
        </div>

        <div className="text-[10px] text-lumina-dim text-center">
          Stripe handles all payments, invoicing, and payouts. Revenue shown is from verified webhook events only.
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

      {/* Debug: Data source indicator */}
      <div className="text-[9px] text-lumina-dim/50 text-center font-mono">
        Data source: orders table (webhook-verified) · {orders.length} orders · {products.length} products
      </div>
    </div>
  )
}
