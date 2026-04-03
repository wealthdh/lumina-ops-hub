/**
 * Digital Asset Store
 * Create once, sell infinite times: Trading indicators, templates, AI prompt packs, datasets
 * Blog Article 3 Stream 4: "Licensing Digital Assets"
 */

import { useState } from 'react'
import { Package, ShoppingCart, Star, TrendingUp, Plus, ExternalLink, BarChart3, Award } from 'lucide-react'
import clsx from 'clsx'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Product {
  id: string
  title: string
  category: string
  price: number
  sales: number
  revenue: number
  rating: number
  status: 'live' | 'draft'
  gumroadUrl: string
  isSubscription?: boolean
}

interface DailySalesData {
  day: number
  sales: number
}

interface TopSeller {
  name: string
  revenue: number
  percentageOfTotal: number
  sales: number
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const PRODUCTS: Product[] = [
  {
    id: 'prod-1',
    title: 'LuminaPulse MT5 Indicator Pack',
    category: 'Trading Indicators',
    price: 79,
    sales: 89,
    revenue: 7031,
    rating: 4.9,
    status: 'live',
    gumroadUrl: 'https://gumroad.com/luminapulse',
  },
  {
    id: 'prod-2',
    title: 'Polymarket Edge-Entry Script Template',
    category: 'Templates',
    price: 49,
    sales: 62,
    revenue: 3038,
    rating: 4.7,
    status: 'live',
    gumroadUrl: 'https://gumroad.com/polymarket-edge',
  },
  {
    id: 'prod-3',
    title: 'AI Trading Prompt Pack',
    category: 'AI Prompt Packs',
    price: 19,
    sales: 156,
    revenue: 2964,
    rating: 4.8,
    status: 'live',
    gumroadUrl: 'https://gumroad.com/ai-trading-prompts',
  },
  {
    id: 'prod-4',
    title: 'Vibe-Code Website Template Bundle',
    category: 'Templates',
    price: 39,
    sales: 34,
    revenue: 1326,
    rating: 4.6,
    status: 'live',
    gumroadUrl: 'https://gumroad.com/vibe-code',
  },
  {
    id: 'prod-5',
    title: 'DeFi Yield Strategy Playbook',
    category: 'Datasets',
    price: 29,
    sales: 45,
    revenue: 1305,
    rating: 4.8,
    status: 'live',
    gumroadUrl: 'https://gumroad.com/defi-yield',
  },
  {
    id: 'prod-6',
    title: 'SEO Content Swarm Blueprint',
    category: 'Templates',
    price: 24,
    sales: 71,
    revenue: 1704,
    rating: 4.7,
    status: 'live',
    gumroadUrl: 'https://gumroad.com/seo-blueprint',
  },
  {
    id: 'prod-7',
    title: 'Client Acquisition Funnel Template',
    category: 'Templates',
    price: 59,
    sales: 28,
    revenue: 1652,
    rating: 4.9,
    status: 'live',
    gumroadUrl: 'https://gumroad.com/client-funnel',
  },
  {
    id: 'prod-8',
    title: 'Monthly Market Analysis Dataset',
    category: 'Datasets',
    price: 99,
    sales: 12,
    revenue: 1188,
    rating: 5.0,
    status: 'live',
    gumroadUrl: 'https://gumroad.com/market-analysis',
    isSubscription: true,
  },
]

const DAILY_SALES: DailySalesData[] = [
  { day: 1, sales: 8 },
  { day: 2, sales: 12 },
  { day: 3, sales: 15 },
  { day: 4, sales: 9 },
  { day: 5, sales: 18 },
  { day: 6, sales: 14 },
  { day: 7, sales: 22 },
  { day: 8, sales: 11 },
  { day: 9, sales: 19 },
  { day: 10, sales: 16 },
  { day: 11, sales: 13 },
  { day: 12, sales: 20 },
  { day: 13, sales: 17 },
  { day: 14, sales: 23 },
]

const TOP_SELLERS: TopSeller[] = [
  { name: 'LuminaPulse MT5 Indicator Pack', revenue: 7031, percentageOfTotal: 32.8, sales: 89 },
  { name: 'AI Trading Prompt Pack', revenue: 2964, percentageOfTotal: 13.8, sales: 156 },
  { name: 'Polymarket Edge-Entry Script', revenue: 3038, percentageOfTotal: 14.2, sales: 62 },
  { name: 'SEO Content Swarm Blueprint', revenue: 1704, percentageOfTotal: 7.9, sales: 71 },
  { name: 'Client Acquisition Funnel', revenue: 1652, percentageOfTotal: 7.7, sales: 28 },
]

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

function StarRating({ rating }: { rating: number }) {
  const fullStars = Math.floor(rating)
  const hasHalfStar = rating % 1 !== 0

  return (
    <div className="flex items-center gap-1">
      <div className="flex gap-0.5">
        {[...Array(5)].map((_, i) => (
          <Star
            key={i}
            size={12}
            className={clsx(
              i < fullStars ? 'fill-lumina-gold text-lumina-gold' :
              i === fullStars && hasHalfStar ? 'fill-lumina-gold text-lumina-gold' :
              'text-lumina-border'
            )}
          />
        ))}
      </div>
      <span className="text-xs text-lumina-dim ml-1">{rating.toFixed(1)}</span>
    </div>
  )
}

function SimpleBarChart({ data }: { data: DailySalesData[] }) {
  const maxSales = Math.max(...data.map(d => d.sales))

  return (
    <div className="h-32 flex items-end justify-between gap-2">
      {data.map((d) => (
        <div key={d.day} className="flex-1 flex flex-col items-center gap-2">
          <div className="w-full bg-lumina-bg rounded-sm overflow-hidden">
            <div
              className="bg-gradient-to-t from-lumina-pulse to-lumina-pulse/60 rounded-sm transition-all duration-300"
              style={{ height: `${(d.sales / maxSales) * 100}%`, minHeight: d.sales > 0 ? '4px' : '0' }}
            />
          </div>
          <span className="text-[10px] text-lumina-dim font-mono">{d.day}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DigitalAssetStore() {
  const [newProduct, setNewProduct] = useState({
    name: '',
    price: '',
    category: 'Templates',
    description: '',
  })

  const totalProducts = PRODUCTS.length
  const totalSales = PRODUCTS.reduce((sum, p) => sum + p.sales, 0)
  const totalRevenue = PRODUCTS.reduce((sum, p) => sum + p.revenue, 0)
  const avgRating = (PRODUCTS.reduce((sum, p) => sum + p.rating, 0) / PRODUCTS.length).toFixed(1)

  const handleCreateProduct = () => {
    if (newProduct.name && newProduct.price) {
      // Reset form
      setNewProduct({
        name: '',
        price: '',
        category: 'Templates',
        description: '',
      })
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lumina-text font-bold text-xl">Digital Asset Store</h1>
          <p className="text-lumina-dim text-sm">Create once, sell infinite times · Gumroad · Etsy integration</p>
        </div>
      </div>

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
          <div className="stat-value text-lumina-gold">${(totalRevenue / 1000).toFixed(1)}k</div>
        </div>
        <div className="card-glow">
          <div className="stat-label">Avg Rating</div>
          <div className="stat-value text-lumina-success">{avgRating}★</div>
        </div>
      </div>

      {/* Product Grid */}
      <div className="card-glow">
        <div className="section-header">
          <Package size={14} />
          Digital Products
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PRODUCTS.map((product) => (
            <div
              key={product.id}
              className="p-4 bg-lumina-bg/60 rounded-xl border border-lumina-border hover:border-lumina-pulse/30 transition-all"
            >
              {/* Product header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-lumina-text truncate">{product.title}</h3>
                  <p className="text-xs text-lumina-dim mt-0.5">{product.category}</p>
                </div>
                <StatusBadge status={product.status} />
              </div>

              {/* Price and stats */}
              <div className="flex items-baseline gap-3 mb-3">
                <span className="text-lg font-bold text-lumina-gold">
                  ${product.price}{product.isSubscription ? '/mo' : ''}
                </span>
                <span className="text-xs text-lumina-dim">{product.sales} sales</span>
                <span className="text-xs text-lumina-pulse font-mono">${product.revenue}</span>
              </div>

              {/* Rating */}
              <div className="mb-4">
                <StarRating rating={product.rating} />
              </div>

              {/* View link */}
              <a
                href={product.gumroadUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-lumina-pulse hover:text-lumina-pulse/80 transition-colors"
              >
                <ExternalLink size={12} />
                View on Gumroad
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* Sales Chart */}
      <div className="card-glow">
        <div className="section-header">
          <BarChart3 size={14} />
          Sales Last 14 Days
        </div>
        <div className="p-6">
          <SimpleBarChart data={DAILY_SALES} />
          <div className="flex justify-between mt-4 text-xs text-lumina-dim font-mono">
            <span>14 days ago</span>
            <span>Today</span>
          </div>
        </div>
      </div>

      {/* Top Sellers Leaderboard */}
      <div className="card-glow">
        <div className="section-header">
          <Award size={14} />
          Top Sellers by Revenue
        </div>

        <div className="space-y-3">
          {TOP_SELLERS.map((seller, idx) => (
            <div key={idx} className="p-3 bg-lumina-bg/60 rounded-lg">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-lumina-muted">#{idx + 1}</span>
                    <h4 className="text-sm font-medium text-lumina-text truncate">{seller.name}</h4>
                  </div>
                  <div className="flex gap-3 text-xs text-lumina-dim">
                    <span>{seller.sales} sales</span>
                    <span>${seller.revenue.toLocaleString()}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-lumina-gold">{seller.percentageOfTotal}%</div>
                  <p className="text-xs text-lumina-dim">of total</p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-lumina-border/20 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-lumina-gold to-lumina-pulse rounded-full"
                  style={{ width: `${seller.percentageOfTotal}%` }}
                />
              </div>
            </div>
          ))}
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-lumina-text block mb-2">Price ($)</label>
              <input
                type="number"
                placeholder="99"
                min="0"
                step="0.01"
                value={newProduct.price}
                onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                className="w-full px-3 py-2 bg-lumina-bg border border-lumina-border rounded-lg text-sm text-lumina-text placeholder-lumina-dim focus:border-lumina-pulse focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-lumina-text block mb-2">Category</label>
              <select
                value={newProduct.category}
                onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                className="w-full px-3 py-2 bg-lumina-bg border border-lumina-border rounded-lg text-sm text-lumina-text focus:border-lumina-pulse focus:outline-none transition-colors"
              >
                <option>Templates</option>
                <option>Trading Indicators</option>
                <option>AI Prompt Packs</option>
                <option>Datasets</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-lumina-text block mb-2">Description</label>
            <textarea
              placeholder="Describe your product..."
              value={newProduct.description}
              onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 bg-lumina-bg border border-lumina-border rounded-lg text-sm text-lumina-text placeholder-lumina-dim focus:border-lumina-pulse focus:outline-none transition-colors resize-none"
            />
          </div>

          <button
            onClick={handleCreateProduct}
            disabled={!newProduct.name || !newProduct.price}
            className={clsx(
              'w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all',
              newProduct.name && newProduct.price
                ? 'btn-pulse'
                : 'bg-lumina-muted/20 text-lumina-dim cursor-not-allowed'
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
