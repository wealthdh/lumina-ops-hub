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
  }, [fetchData])òò6Æ7VÆFR7FG0¢6öç7BF÷FÅ&öGV7G2Ò&öGV7G2æÆVæwF¢6öç7BF÷FÅ6ÆW2Ò&öGV7G2ç&VGV6R7VÒÂÓâ7VÒ²ç6ÆW5ö6÷VçBÂ¢6öç7BF4ÖöçFÒæWrFFR¢6öç7BÖöçF7F'BÒæWrFFRF4ÖöçFævWDgVÆÅV"ÂF4ÖöçFævWDÖöçFÂ¢6öç7BÖöçF7F'E7G"ÒÖöçF7F'BçFô4õ7G&ærç7ÆBuBr³Ð ¢6öç7B&WfVçVUF4ÖöçFÒæ6öÖTVçG&W0¢æfÇFW"VçG'ÓâVçG'ç6÷W&6RÓÓÒw7G&RrbbVçG'æ7&VFVEöCòç7ÆBuBr³ÒãÒÖöçF7F'E7G"¢ç&VGV6R7VÒÂVçG'Óâ7VÒ²VçG'æÖ÷VçBÂ ¢òò'VÆBFÇ6ÆW26'BÆ7BBF2¢6öç7BvWDFÇ6ÆW4FFÒ¢FÇ6ÆW4FFµÒÓâ°¢6öç7BF3¢ÖÇ7G&ærÂ²6ÆW3¢çVÖ&W#²&WfVçVS¢çVÖ&W"ÓâÒæWrÖ ¢f÷"ÆWBÒ3²ãÒ²ÒÒ°¢6öç7BBÒæWrFFR¢Bç6WDFFRBævWDFFRÒ¢6öç7BFFU7G"ÒBçFô4õ7G&ærç7ÆBuBr³Ð¢F2ç6WBFFU7G"Â²6ÆW3¢Â&WfVçVS¢Ò¢Ð ¢òò6÷VçB6ÆW2æB&WfVçVRW"F¢æ6öÖTVçG&W2æf÷$V6VçG'Óâ°¢bVçG'ç6÷W&6RÓÓÒw7G&Rr°¢6öç7BW7FærÒF2ævWBVçG'æ7&VFVEöCòç7ÆBuBr³ÒÇÂ²6ÆW3¢Â&WfVçVS¢Ð¢W7Færç6ÆW2³Ò¢W7Færç&WfVçVR³ÒVçG'æÖ÷Vç@¢F2ç6WBVçG'æ7&VFVEöCòç7ÆBuBr³ÒÂW7Fær¢Ð¢Ò ¢&WGW&â'&æg&öÒF2æVçG&W2¢ç6÷'B¶ÒÂ¶%ÒÓâæÆö6ÆT6ö×&R"¢æÖ¶FFU7G"Â²6ÆW2Â&WfVçVRÕÒÓâ°¢òòf÷&ÖB26÷'BFçVÖ&W ¢6öç7BBÒæWrFFRFFU7G"¢&WGW&â°¢F¢7G&ærBævWDFFRÀ¢6ÆW2À¢&WfVçVRÀ¢Ð¢Ò¢Ð ¢6öç7BFÇ6ÆW4FFÒvWDFÇ6ÆW4FF ¢6öç7BæFÆTæFÆ¦U7F÷&RÒ7æ2Óâ°¢G'°¢6WDæFÆ¦ærG'VR¢6öç7B&W7öç6RÒvBfWF6röö7&VFR×ÖVçBÖÆæ·2rÂ²ÖWFöC¢uõ5BrÒ¢b&W7öç6Ræö²°¢6öç7BFWBÒvB&W7öç6RçFWB¢F&÷ræWrW'&÷"W'&÷#¢G·&W7öç6Rç7FGW7ÒG·FWGÖ¢Ð¢òò&VfWF6gFW"æFÆ¦Föà¢vBfWF6FF¢Ò6F6W'"°¢6öç7BÖW76vRÒW'"ç7Fæ6VöbW'&÷"òW'"æÖW76vR¢uVæ¶æ÷vâW'&÷"p¢6WDW'&÷"ÖW76vR¢6öç6öÆRæW'&÷"tæFÆ¦R7F÷&RW'&÷#¢rÂW'"¢ÒfæÆÇ°¢6WDæFÆ¦ærfÇ6R¢Ð¢Ð ¢6öç7BæFÆT7&VFU&öGV7BÒ7æ2Óâ°¢bæWu&öGV7BææÖRÇÂæWu&öGV7Bç&6R°¢6WDW'&÷"u&öGV7BæÖRæB&6R&R&WV&VBr¢&WGW&à¢Ð ¢G'°¢6öç7B²W'&÷#¢ç6W'DW'&÷"ÒÒvB7W&6Ræg&öÒw7G&U÷&öGV7G2ræç6W'B°¢&öGV7EöæÖS¢æWu&öGV7BææÖRÀ¢&6Uö6VçG3¢ÖFç&÷VæB'6TfÆöBæWu&öGV7Bç&6R¢À¢7FGW3¢æWu&öGV7Bç7FGW2ÓÓÒvG&gBròvG&gBr¢v7FfRrÀ¢ÖVçE÷W&Ã¢rrÀ¢Ò ¢bç6W'DW'&÷"°¢F&÷ræWrW'&÷"ç6W'DW'&÷"æÖW76vR¢Ð ¢òò&W6WBf÷&Ð¢6WDæWu&öGV7B²æÖS¢rrÂ&6S¢rrÂ7FGW3¢vG&gBrÂFW67&Föã¢rrÒ¢6WDW'&÷"çVÆÂ¢vBfWF6FF¢Ò6F6W'"°¢6öç7BÖW76vRÒW'"ç7Fæ6VöbW'&÷"òW'"æÖW76vR¢uVæ¶æ÷vâW'&÷"p¢6WDW'&÷"ÖW76vR¢6öç6öÆRæW'&÷"t7&VFR&öGV7BW'&÷#¢rÂW'"¢Ð¢Ð ¢&WGW&â¢ÆFb6Æ74æÖSÒ'76R×Ób#à¢²ò¢VFW"¢÷Ð¢ÆFb6Æ74æÖSÒ&fÆWFV×2Ö6VçFW"§W7FgÖ&WGvVVâ#à¢ÆFcà¢Æ6Æ74æÖSÒ'FWBÖÇVÖæ×FWBföçBÖ&öÆBFWB×Â#äFvFÂ76WB7F÷&SÂöà¢Ç6Æ74æÖSÒ'FWBÖÇVÖæÖFÒFWB×6Ò#å&VÂ×FÖR&öGV7B6ÆW2b&WfVçVRG&6¶æsÂ÷à¢ÂöFcà¢ÂöFcà ¢²ò¢W'&÷"ÆW'B¢÷Ð¢¶W'&÷"bb¢ÆFb6Æ74æÖSÒ'ÓB&r×&VBÓSó&÷&FW"&÷&FW"×&VBÓSó3&÷VæFVBÖÆrfÆWFV×2×7F'BvÓ2#à¢ÄÆW'D6&6ÆR6¦S×³gÒ6Æ74æÖSÒ'FWB×&VBÓCfÆW×6&æ²Ó×BÓãR"óà¢ÆFb6Æ74æÖSÒ'FWB×6ÒFWB×&VBÓ3#ç¶W'&÷'ÓÂöFcà¢ÂöFcà¢Ð ¢²ò¢&WfVçVR7FG2&"¢÷Ð¢ÆFb6Æ74æÖSÒ&w&Bw&BÖ6öÇ2ÓBvÓB#à¢ÆFb6Æ74æÖSÒ&6&BÖvÆ÷r#à¢ÆFb6Æ74æÖSÒ'7FBÖÆ&VÂ#åF÷FÂ&öGV7G3ÂöFcà¢ÆFb6Æ74æÖSÒ'7FB×fÇVRFWBÖÇVÖæ×FWB#ç·F÷FÅ&öGV7G7ÓÂöFcà¢ÂöFcà¢ÆFb6Æ74æÖSÒ&6&BÖvÆ÷r#à¢ÆFb6Æ74æÖSÒ'7FBÖÆ&VÂ#åF÷FÂ6ÆW3ÂöFcà¢ÆFb6Æ74æÖSÒ'7FB×fÇVRFWBÖÇVÖæ×VÇ6R#ç·F÷FÅ6ÆW7ÓÂöFcà¢ÂöFcà¢ÆFb6Æ74æÖSÒ&6&BÖvÆ÷r#à¢ÆFb6Æ74æÖSÒ'7FBÖÆ&VÂ#å&WfVçVRF2ÖöçFÂöFcà¢ÆFb6Æ74æÖSÒ'7FB×fÇVRFWBÖÇVÖæÖvöÆB#âG·&WfVçVUF4ÖöçFçFôfVB"ÓÂöFcà¢ÂöFcà¢ÆFb6Æ74æÖSÒ&6&BÖvÆ÷r#à¢ÆFb6Æ74æÖSÒ'7FBÖÆ&VÂ#äfr&FæsÂöFcà¢ÆFb6Æ74æÖSÒ'7FB×fÇVRFWBÖÇVÖæ×7V66W72#î(	CÂöFcà¢ÂöFcà¢ÂöFcà ¢²ò¢&öGV7Bw&B÷"V×G7FFR¢÷Ð¢ÆFb6Æ74æÖSÒ&6&BÖvÆ÷r#à¢ÆFb6Æ74æÖSÒ'6V7FöâÖVFW"#à¢Å6¶vR6¦S×³GÒóà¢FvFÂ&öGV7G0¢ÂöFcà ¢¶ÆöFærò¢ÆFb6Æ74æÖSÒ'ÓFWBÖ6VçFW"FWBÖÇVÖæÖFÒ#äÆöFær&öGV7G2ââãÂöFcà¢¢&öGV7G2æÆVæwFÓÓÒò¢ÆFb6Æ74æÖSÒ'76R×ÓBÓb#à¢ÆFb6Æ74æÖSÒ'Ób&rÖÇVÖæÖ&róc&÷VæFVB×Â&÷&FW"&÷&FW"ÖÇVÖæÖ&÷&FW"FWBÖ6VçFW"#à¢Å6¶vR6¦S×³3'Ò6Æ74æÖSÒ&×ÖWFòÖ"Ó2FWBÖÇVÖæÖFÒ"óà¢Ç6Æ74æÖSÒ'FWB×6ÒFWBÖÇVÖæÖFÒÖ"ÓB#à¢æò&öGV7G2Æ7FVBWBâFWÆ÷æB'Vâõ5Böö7&VFR×ÖVçBÖÆæ·2FòæFÆ¦R÷W"7F÷&Rà¢Â÷à¢Æ'WGFöà¢öä6Æ6³×¶æFÆTæFÆ¦U7F÷&WÐ¢F6&ÆVC×¶æFÆ¦æwÐ¢6Æ74æÖS×¶6Ç7¢væÆæRÖfÆWFV×2Ö6VçFW"vÓ"ÓBÓ"&÷VæFVBÖÆrföçBÖÖVFVÒFWB×6ÒG&ç6FöâÖÆÂrÀ¢æFÆ¦æròv&rÖÇVÖæÖ×WFVBó#FWBÖÇVÖæÖFÒ7W'6÷"Öæ÷BÖÆÆ÷vVBr¢v'Fâ×VÇ6Rp¢Ð¢à¢ÅÇW26¦S×³GÒóà¢¶æFÆ¦æròtæFÆ¦ærâââr¢tæFÆ¦R7F÷&RwÐ¢Âö'WGFöãà¢ÂöFcà¢ÂöFcà¢¢¢ÆFb6Æ74æÖSÒ&w&Bw&BÖ6öÇ2ÓÖC¦w&BÖ6öÇ2Ó"vÓB#à¢·&öGV7G2æÖ&öGV7BÓâ¢ÆF`¢¶W×·&öGV7BæGÐ¢6Æ74æÖSÒ'ÓB&rÖÇVÖæÖ&róc&÷VæFVB×Â&÷&FW"&÷&FW"ÖÇVÖæÖ&÷&FW"÷fW#¦&÷&FW"ÖÇVÖæ×VÇ6Ró3G&ç6FöâÖÆÂ ¢à¢²ò¢&öGV7BVFW"¢÷Ð¢ÆFb6Æ74æÖSÒ&fÆWFV×2×7F'B§W7FgÖ&WGvVVâÖ"Ó2#à¢ÆFb6Æ74æÖSÒ&fÆWÓÖâ×rÓ#à¢Æ26Æ74æÖSÒ'FWB×6ÒföçB×6VÖ&öÆBFWBÖÇVÖæ×FWBG'Væ6FR#ç·&öGV7BææÖWÓÂö3à¢ÂöFcà¢Å7FGW4&FvR7FGW3×·&öGV7Bç7FGW7Òóà¢ÂöFcà ¢²ò¢&6RæB7FG2¢÷Ð¢ÆFb6Æ74æÖSÒ&fÆWFV×2Ö&6VÆæRvÓ2Ö"Ó2#à¢Ç7â6Æ74æÖSÒ'FWBÖÆrföçBÖ&öÆBFWBÖÇVÖæÖvöÆB#âG·&öGV7Bç&6RçFôfVB"ÓÂ÷7ãà¢Ç7â6Æ74æÖSÒ'FWB×2FWBÖÇVÖæÖFÒ#ç·&öGV7Bç6ÆW5ö6÷VçGÒ6ÆW3Â÷7ãà¢Ç7â6Æ74æÖSÒ'FWB×2FWBÖÇVÖæ×VÇ6RföçBÖÖöæò#âG·&öGV7Bç&öGV7E÷&WfVçVRçFôfVB"ÓÂ÷7ãà¢ÂöFcà ¢²ò¢'Wæ÷r'WGFöâ¢÷Ð¢·&öGV7BçÖVçE÷W&Âò¢Æ¢&Vc×·&öGV7BçÖVçE÷W&ÇÐ¢F&vWCÒ%ö&Ææ² ¢&VÃÒ&æ÷&VfW'&W" ¢6Æ74æÖSÒ&æÆæRÖfÆWFV×2Ö6VçFW"vÓãRFWB×2föçBÖÖVFVÒFWBÖÇVÖæ×VÇ6R÷fW#§FWBÖÇVÖæ×VÇ6RóG&ç6FöâÖ6öÆ÷'2 ¢à¢ÄWFW&æÄÆæ²6¦S×³'Òóà¢'Wæ÷p¢Âöà¢¢¢Ç7â6Æ74æÖSÒ&æÆæRÖfÆWFV×2Ö6VçFW"vÓãRFWB×2föçBÖÖVFVÒFWBÖÇVÖæÖFÒ#à¢ÄWFW&æÄÆæ²6¦S×³'Òóà¢æòÖVçBÆæ°¢Â÷7ãà¢Ð¢ÂöFcà¢Ð¢ÂöFcà¢Ð¢ÂöFcà ¢²ò¢6ÆW26'B¢÷Ð¢ÆFb6Æ74æÖSÒ&6&BÖvÆ÷r#à¢ÆFb6Æ74æÖSÒ'6V7FöâÖVFW"#à¢Ä&$6'C26¦S×³GÒóà¢6ÆW2Æ7BBF0¢ÂöFcà¢ÆFb6Æ74æÖSÒ'Ób#à¢Å6×ÆT&$6'BFF×¶FÇ6ÆW4FFÒóà¢ÆFb6Æ74æÖSÒ&fÆW§W7FgÖ&WGvVVâ×BÓBFWB×2FWBÖÇVÖæÖFÒföçBÖÖöæò#à¢Ç7ããBF2vóÂ÷7ãà¢Ç7ãåFöFÂ÷7ãà¢ÂöFcà¢ÂöFcà¢ÂöFcà ¢²ò¢F÷6VÆÆW'2ÆVFW&&ö&B¢÷Ð¢·&öGV7G2æÆVæwFâbb¢ÆFb6Æ74æÖSÒ&6&BÖvÆ÷r#à¢ÆFb6Æ74æÖSÒ'6V7FöâÖVFW"#à¢Äv&B6¦S×³GÒóà¢F÷6VÆÆW'2'&WfVçVP¢ÂöFcà ¢ÆFb6Æ74æÖSÒ'76R×Ó2#à¢·&öGV7G0¢æfÇFW"Óâç&öGV7E÷&WfVçVRâ¢ç6÷'BÂ"Óâ"ç&öGV7E÷&WfVçVRÒç&öGV7E÷&WfVçVR¢ç6Æ6RÂR¢æÖ&öGV7BÂGÓâ°¢6öç7BF÷FÅ&WfVçVRÒ&öGV7G2ç&VGV6R7VÒÂÓâ7VÒ²ç&öGV7E÷&WfVçVRÂ¢6öç7BW&6VçFvRÒF÷FÅ&WfVçVRâò&öGV7Bç&öGV7E÷&WfVçVRòF÷FÅ&WfVçVR¢¢  ¢&WGW&â¢ÆFb¶W×·&öGV7BæGÒ6Æ74æÖSÒ'Ó2&rÖÇVÖæÖ&róc&÷VæFVBÖÆr#à¢ÆFb6Æ74æÖSÒ&fÆWFV×2×7F'B§W7FgÖ&WGvVVâvÓ2Ö"Ó"#à¢ÆFb6Æ74æÖSÒ&fÆWÓÖâ×rÓ#à¢ÆFb6Æ74æÖSÒ&fÆWFV×2Ö6VçFW"vÓ"Ö"Ó#à¢Ç7â6Æ74æÖSÒ'FWB×2föçBÖ&öÆBFWBÖÇVÖæÖ×WFVB#â7¶G²ÓÂ÷7ãà¢ÆB6Æ74æÖSÒ'FWB×6ÒföçBÖÖVFVÒFWBÖÇVÖæ×FWBG'Væ6FR#ç·&öGV7BææÖWÓÂöCà¢ÂöFcà¢ÆFb6Æ74æÖSÒ&fÆWvÓ2FWB×2FWBÖÇVÖæÖFÒ#à¢Ç7ãç·&öGV7Bç6ÆW5ö6÷VçGÒ6ÆW3Â÷7ãà¢Ç7ãâG·&öGV7Bç&öGV7E÷&WfVçVRçFôfVB"ÓÂ÷7ãà¢ÂöFcà¢ÂöFcà¢ÆFb6Æ74æÖSÒ'FWB×&vB#à¢ÆFb6Æ74æÖSÒ'FWB×6ÒföçB×6VÖ&öÆBFWBÖÇVÖæÖvöÆB#ç·W&6VçFvRçFôfVBÒSÂöFcà¢Ç6Æ74æÖSÒ'FWB×2FWBÖÇVÖæÖFÒ#æöbF÷FÃÂ÷à¢ÂöFcà¢ÂöFcà ¢²ò¢&öw&W72&"¢÷Ð¢ÆFb6Æ74æÖSÒ'rÖgVÆÂ&rÖÇVÖæÖ&÷&FW"ó#&÷VæFVBÖgVÆÂÓ"÷fW&fÆ÷rÖFFVâ#à¢ÆF`¢6Æ74æÖSÒ&ÖgVÆÂ&rÖw&FVçB×Fò×"g&öÒÖÇVÖæÖvöÆBFòÖÇVÖæ×VÇ6R&÷VæFVBÖgVÆÂ ¢7GÆS×·²vGF¢G·W&6VçFvWÒV×Ð¢óà¢ÂöFcà¢ÂöFcà¢¢ÒÐ¢ÂöFcà¢ÂöFcà¢Ð ¢²ò¢)H)HvöÆW6ÆRÆ6Vç6W2f÷"&W6VÆÆW'2)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H¢÷Ð¢ÆFb6Æ74æÖSÒ&6&BÖvÆ÷r&÷&FW"ÖÇVÖæ×VÇ6Ró3#à¢ÆFb6Æ74æÖSÒ'6V7FöâÖVFW"#à¢ÅW6W'26¦S×³GÒóà¢vöÆW6ÆRvVçBÆ6Vç6W0¢Ç7â6Æ74æÖSÒ&ÖÂÖWFò&FvR×7V66W72FWBÕ³Ò#äÄdSÂ÷7ãà¢ÂöFcà ¢ÆFb6Æ74æÖSÒ&w&Bw&BÖ6öÇ2ÓÖC¦w&BÖ6öÇ2Ó"vÓBÖ"ÓB#à¢²ò¢vVçBvöÆW6ÆRÆ6Vç6R¢÷Ð¢ÆFb6Æ74æÖSÒ'ÓR&rÖw&FVçB×FòÖ'"g&öÒÖÇVÖæÖ&rFòÖÇVÖæ×VÇ6RóR&÷VæFVB×Â&÷&FW"&÷&FW"ÖÇVÖæ×VÇ6Ró#÷fW#¦&÷&FW"ÖÇVÖæ×VÇ6RóCG&ç6FöâÖÆÂ#à¢ÆFb6Æ74æÖSÒ&fÆWFV×2×7F'B§W7FgÖ&WGvVVâÖ"Ó2#à¢ÆFcà¢Æ26Æ74æÖSÒ'FWB×6ÒföçBÖ&öÆBFWBÖÇVÖæ×FWB#ävVçBvöÆW6ÆRÆ6Vç6SÂö3à¢Ç6Æ74æÖSÒ'FWBÕ³ÒFWBÖÇVÖæÖFÒ×BÓ#ä'VÆ²66W72(	BvVçG2vWBFV"÷vâ7V"Ö66÷VçCÂ÷à¢ÂöFcà¢Ç7â6Æ74æÖSÒ&æÆæRÖfÆWFV×2Ö6VçFW"vÓÓ"Ó&÷VæFVBÖgVÆÂFWB×2föçB×6VÖ&öÆB&rÖÇVÖæ×7V66W72ó#FWBÖÇVÖæ×7V66W72#à¢Ç7â6Æ74æÖSÒ'rÓãRÓãR&÷VæFVBÖgVÆÂ&rÖÇVÖæ×7V66W72æÖFR×VÇ6RÖf7B"óà¢ÆfP¢Â÷7ãà¢ÂöFcà¢ÆFb6Æ74æÖSÒ&fÆWFV×2Ö&6VÆæRvÓ"Ö"Ó2#à¢Ç7â6Æ74æÖSÒ'FWBÓ'ÂföçBÖ&öÆBFWBÖÇVÖæÖvöÆB#âCC(	2CÂ÷7ãà¢Ç7â6Æ74æÖSÒ'FWB×2FWBÖÇVÖæÖFÒ#æöæR×FÖSÂ÷7ãà¢ÂöFcà¢ÇVÂ6Æ74æÖSÒ'76R×ÓãRÖ"ÓBFWBÕ³ÒFWBÖÇVÖæÖFÒ#à¢ÆÆ6Æ74æÖSÒ&fÆWFV×2Ö6VçFW"vÓãR#ãÅ¦6¦S×³Ò6Æ74æÖSÒ'FWBÖÇVÖæ×VÇ6R"óâ÷vâ7V"Ö66÷VçBF6&ö&CÂöÆà¢ÆÆ6Æ74æÖSÒ&fÆWFV×2Ö6VçFW"vÓãR#ãÅ¦6¦S×³Ò6Æ74æÖSÒ'FWBÖÇVÖæ×VÇ6R"óâ'VâÆÂvVçB¦ö'2æFWVæFVçFÇÂöÆà¢ÆÆ6Æ74æÖSÒ&fÆWFV×2Ö6VçFW"vÓãR#ãÅ¦6¦S×³Ò6Æ74æÖSÒ'FWBÖÇVÖæ×VÇ6R"óâvFRÖÆ&VÂ6ÆVçB&W÷'G3ÂöÆà¢ÆÆ6Æ74æÖSÒ&fÆWFV×2Ö6VçFW"vÓãR#ãÅ¦6¦S×³Ò6Æ74æÖSÒ'FWBÖÇVÖæ×VÇ6R"óâ7G&RWFò×÷WG3ÂöÆà¢Â÷VÃà¢Æ'WGFöà¢öä6Æ6³×²Óâ°¢6öç7B7G&UW&ÂÒGG3¢òö'Wç7G&Ræ6öÒ÷FW7E÷vöÆW6ÆUövVçF ¢væF÷ræ÷Vâ7G&UW&ÂÂuö&Ææ²r¢×Ð¢6Æ74æÖSÒ'rÖgVÆÂ'Fâ×VÇ6RFWB×2Ó"ãRfÆWFV×2Ö6VçFW"§W7FgÖ6VçFW"vÓ" ¢à¢Ä7&VFD6&B6¦S×³7Òóà¢'WvVçBÆ6Vç6Rf7G&P¢Âö'WGFöãà¢ÂöFcà ¢²ò¢ÖöçFÇ&W6VÆÆW"72¢÷Ð¢ÆFb6Æ74æÖSÒ'ÓR&rÖw&FVçB×FòÖ'"g&öÒÖÇVÖæÖ&rFòÖÇVÖæÖvöÆBóR&÷VæFVB×Â&÷&FW"&÷&FW"ÖÇVÖæÖvöÆBó#÷fW#¦&÷&FW"ÖÇVÖæÖvöÆBóCG&ç6FöâÖÆÂ&VÆFfR÷fW&fÆ÷rÖFFVâ#à¢ÆFb6Æ74æÖSÒ&'6öÇWFRF÷Ó"&vBÓ"Ó"ÓãR&rÖÇVÖæÖvöÆBó#&÷VæFVBFWBÕ³ÒföçBÖ&öÆBFWBÖÇVÖæÖvöÆBWW&66RG&6¶ær×vFW"#ä&W7BfÇVSÂöFcà¢ÆFb6Æ74æÖSÒ&fÆWFV×2×7F'B§W7FgÖ&WGvVVâÖ"Ó2#à¢ÆFcà¢Æ26Æ74æÖSÒ'FWB×6ÒföçBÖ&öÆBFWBÖÇVÖæ×FWB#äÖöçFÇ&W6VÆÆW"73Âö3à¢Ç6Æ74æÖSÒ'FWBÕ³ÒFWBÖÇVÖæÖFÒ×BÓ#å'Vâb&6RÄÂ¦ö'2(	BVæÆÖFVB&W6VÆÆæsÂ÷à¢ÂöFcà¢Ç7â6Æ74æÖSÒ&æÆæRÖfÆWFV×2Ö6VçFW"vÓÓ"Ó&÷VæFVBÖgVÆÂFWB×2föçB×6VÖ&öÆB&rÖÇVÖæ×7V66W72ó#FWBÖÇVÖæ×7V66W72#à¢Ç7â6Æ74æÖSÒ'rÓãRÓãR&÷VæFVBÖgVÆÂ&rÖÇVÖæ×7V66W72æÖFR×VÇ6RÖf7B"óà¢ÆfP¢Â÷7ãà¢ÂöFcà¢ÆFb6Æ74æÖSÒ&fÆWFV×2Ö&6VÆæRvÓ"Ö"Ó2#à¢Ç7â6Æ74æÖSÒ'FWBÓ'ÂföçBÖ&öÆBFWBÖÇVÖæÖvöÆB#âCsÂ÷7ãà¢Ç7â6Æ74æÖSÒ'FWB×2FWBÖÇVÖæÖFÒ#âöÖöçFÂ÷7ãà¢ÂöFcà¢ÇVÂ6Æ74æÖSÒ'76R×ÓãRÖ"ÓBFWBÕ³ÒFWBÖÇVÖæÖFÒ#à¢ÆÆ6Æ74æÖSÒ&fÆWFV×2Ö6VçFW"vÓãR#ãÅ¦6¦S×³Ò6Æ74æÖSÒ'FWBÖÇVÖæÖvöÆB"óâgVÆÂvVçBfÆVWB66W72ÆÂbvVçG2ÂöÆà¢ÆÆ6Æ74æÖSÒ&fÆWFV×2Ö6VçFW"vÓãR#ãÅ¦6¦S×³Ò6Æ74æÖSÒ'FWBÖÇVÖæÖvöÆB"óâ6WB÷W"÷vâ&6æröâWfW'¦ö#ÂöÆà¢ÆÆ6Æ74æÖSÒ&fÆWFV×2Ö6VçFW"vÓãR#ãÅ¦6¦S×³Ò6Æ74æÖSÒ'FWBÖÇVÖæÖvöÆB"óâVæÆÖFVB6ÆVçB7V"Ö66÷VçG3ÂöÆà¢ÆÆ6Æ74æÖSÒ&fÆWFV×2Ö6VçFW"vÓãR#ãÅ¦6¦S×³Ò6Æ74æÖSÒ'FWBÖÇVÖæÖvöÆB"óâ&÷&GvVçBVWVR²G&VÒÖöFSÂöÆà¢ÆÆ6Æ74æÖSÒ&fÆWFV×2Ö6VçFW"vÓãR#ãÅ¦6¦S×³Ò6Æ74æÖSÒ'FWBÖÇVÖæÖvöÆB"óâ&WfVçVRF6&ö&B²WFò66Ö÷WCÂöÆà¢Â÷VÃà¢Æ'WGFöà¢öä6Æ6³×²Óâ°¢6öç7B7G&UW&ÂÒGG3¢òö'Wç7G&Ræ6öÒ÷FW7E÷&W6VÆÆW%÷76 ¢væF÷ræ÷Vâ7G&UW&ÂÂuö&Ææ²r¢×Ð¢6Æ74æÖSÒ'rÖgVÆÂfÆWFV×2Ö6VçFW"§W7FgÖ6VçFW"vÓ"ÓBÓ"ãR&÷VæFVBÖÆrföçB×6VÖ&öÆBFWB×2&rÖÇVÖæÖvöÆBFWBÖÇVÖæÖ&r÷fW#¦&rÖÇVÖæÖvöÆBóG&ç6FöâÖÆÂ ¢à¢Ä7&VFD6&B6¦S×³7Òóà¢7V'67&&Rf7G&R(	BCröÖð¢Âö'WGFöãà¢ÂöFcà¢ÂöFcà ¢ÆFb6Æ74æÖSÒ'FWBÕ³ÒFWBÖÇVÖæÖFÒFWBÖ6VçFW"#à¢7G&RæFÆW2ÆÂÖVçG2Âçfö6ærÂæB÷WG2WFöÖF6ÆÇâ÷RöæÇ6VRÖöæWfÆ÷rò66÷WB7F÷'à¢ÂöFcà¢ÂöFcà

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
