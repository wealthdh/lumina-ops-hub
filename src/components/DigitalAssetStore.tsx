/**
 * Digital Asset Store
 * Create once, sell infinite times: Trading indicators, templates, AI prompt packs, datasets
 * Blog Article 3 Stream 4: "Licensing Digital Assets"
 */

import { useState, useEffect } from 'react'
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

// ─── Default Products ─────────────────────────────────────────────────────────
const DEFAULT_PRODUCTS: Product[] = [
  {
    id: 'prod-1',
    title: 'MT5 Gold Scalper EA',
    category: 'Trading Indicators',
    price: 97,
    sales: 0,
    revenue: 0,
    rating: 0,
    status: 'live',
    gumroadUrl: 'https://gumroad.com/l/mt5-gold-scalper-ea',
  },
  {
    id: 'prod-2',
    title: 'Polymarket Edge Scanner',
    category: 'Templates',
    price: 47,
    sales: 0,
    revenue: 0,
    rating: 0,
    status: 'live',
    gumroadUrl: 'https://gumroad.com/l/polymarket-edge-scanner',
  },
  {
    id: 'prod-3',
    title: 'AI Prompt Engineering Toolkit',
    category: 'AI Prompt Packs',
    price: 29,
    sales: 0,
    revenue: 0,
    rating: 0,
    status: 'live',
    gumroadUrl: 'https://gumroad.com/l/ai-prompt-toolkit',
  },
  {
    id: 'prod-4',
    title: 'Content Swarm Templates',
    category: 'Templates',
    price: 19,
    sales: 0,
    revenue: 0,
    rating: 0,
    status: 'live',
    gumroadUrl: 'https://gumroad.com/l/content-swarm-templates',
  },
  {
    id: 'prod-5',
    title: 'Kelly Criterion Calculator',
    category: 'Datasets',
    price: 14.99,
    sales: 0,
    revenue: 0,
    rating: 0,
    status: 'live',
    gumroadUrl: 'https://gumroad.com/l/kelly-calculator',
  },
  {
    id: 'prod-6',
    title: 'Lumina Dashboard Theme',
    category: 'Templates',
    price: 9.99,
    sales: 0,
    revenue: 0,
    rating: 0,
    status: 'live',
    gumroadUrl: 'https://gumroad.com/l/lumina-dashboard-theme',
  },
]

const DAILY_SALES: DailySalesData[] = [
  { day: 1, sales: 0 },
  { day: 2, sales: 0 },
  { day: 3, sales: 0 },
  { day: 4, sales: 0 },
  { day: 5, sales: 0 },
  { day: 6, sales: 0 },
  { day: 7, sales: 0 },
  { day: 8, sales: 0 },
  { day: 9, sales: 0 },
  { day: 10, sales: 0 },
  { day: 11, sales: 0 },
  { day: 12, sales: 0 },
  { day: 13, sales: 0 },
  { day: 14, sales: 0 },
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
  const maxSales = Math.max(...data.map(d => d.sales), 1)

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
  const [products, setProducts] = useState<Product[]>(DEFAULT_PRODUCTS)
  const [newProduct, setNewProduct] = useState({
    name: '',
    price: '',
    category: 'Templates',
    description: '',
  })

  // Load products from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('lumina-products')
      if (saved) {
        setProducts(JSON.parse(saved))
      }
    } catch (error) {
      console.error('Error loading products from localStorage:', error)
    }
  }, [])

  // Save products to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('lumina-products', JSON.stringify(products))
    } catch (error) {
      console.error('Error saving products to localStorage:', error)
    }
  }, [products])

  const totalProducts = products.length
  const totalSales = products.reduce((sum, p) => sum + p.sales, 0)
  const totalRevenue = products.reduce((sum, p) => sum + p.revenue, 0)
  const avgRating = products.filter(p => p.rating > 0).length > 0
    ? (products.filter(p => p.rating > 0).reduce((sum, p) => sum + p.rating, 0) / products.filter(p => p.rating > 0).length).toFixed(1)
    : '0.0'

  const topSellers: TopSeller[] = products
    .filter(p => p.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
    .map(p => ({
      name: p.title,
      revenue: p.revenue,
      percentageOfTotal: totalRevenue > 0 ? (p.revenue / totalRevenue) * 100 : 0,
      sales: p.sales,
    }))

  const handleCreateProduct = () => {
    if (newProduct.name && newProduct.price) {
      const newProd: Product = {
        id: `prod-${Date.now()}`,
        title: newProduct.name,
        category: newProduct.category,
        price: parseFloat(newProduct.price),
        sales: 0,
        revenue: 0,
        rating: 0,
        status: 'draft',
        gumroadUrl: `https://gumroad.com/l/${newProduct.name.toLowerCase().replace(/\s+/g, '-')}`,
      }

      setProducts([...products, newProd])
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
          <p className="text-lumina-dim text-sm">Create once, sell infinite times · Gumroad Integration</p>
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
        <div className="p-3 mb-4 bg-lumina-gold/5 border border-lumina-gold/20 rounded-lg text-xs text-lumina-dim">
          <span className="text-lumina-gold">Ready to sell:</span> All products link to Gumroad. Add your product details and share the links.
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {products.map((product) => (
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
                <span className="text-xs text-lumina-pulse font-mono">${product.revenue.toLocaleString()}</span>
              </div>

              {/* Rating */}
              <div className="mb-4">
                {product.rating > 0 ? (
                  <StarRating rating={product.rating} />
                ) : (
                  <p className="text-xs text-lumina-dim">No ratings yet</p>
                )}
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

        {topSellers.length > 0 ? (
          <div className="space-y-3">
            {topSellers.map((seller, idx) => (
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
                    <div className="text-sm font-semibold text-lumina-gold">{seller.percentageOfTotal.toFixed(1)}%</div>
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
        ) : (
          <div className="p-6 text-center text-lumina-muted">
            No sales yet. Create products and share your Gumroad links!
          </div>
        )}
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
