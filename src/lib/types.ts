// ─── Global Types for Lumina Ops Hub ────────────────────────────────────────

export type JobStatus = 'active' | 'scaling' | 'paused' | 'killed' | 'pending'
export type JobCategory =
  | 'ai-ugc'
  | 'trading'
  | 'agency'
  | 'dev'
  | 'content'
  | 'crypto'
  | 'arbitrage'
  | 'consulting'

export interface Job {
  id: string
  name: string
  category: JobCategory
  status: JobStatus
  dailyProfit: number
  monthlyProfit: number
  projectedMonthly: number
  tasks: AutoTask[]
  synergyScore: number
  riskScore: number          // 0–100
  roi: number                // %
  cashOutUrl?:  string
  cloneUrl?:    string
  description?: string         // optional strategy / notes
  createdAt:    string
  lastActivity: string
}

export interface AutoTask {
  id: string
  jobId: string
  title: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  status: 'pending' | 'in_progress' | 'done' | 'delegated'
  assignedTo?: string        // 'ai' | user email
  dueAt?: string
  estimatedMinutes?: number
}

export interface MT5Trade {
  ticket: number
  symbol: string
  type: 'buy' | 'sell'
  volume: number
  openPrice: number
  currentPrice: number
  profit: number
  openTime: string
  sl: number
  tp: number
}

export interface MT5Account {
  accountId: string | number
  balance: number
  equity: number
  margin?: number
  freeMargin?: number
  marginLevel: number
  profit?: number
  openTrades: MT5Trade[]
  dayPnl: number
  weekPnl?: number
  monthPnl: number
}

export interface PolymarketMarket {
  id: string
  question: string
  slug: string
  endDate: string
  volume: number
  liquidity: number
  outcomes: PolymarketOutcome[]
  category: string
  active: boolean
}

export interface PolymarketOutcome {
  name: string
  price: number             // 0–1
  clobTokenId: string
}

export interface PolymarketPosition {
  marketId: string
  question: string
  outcome: string
  shares: number
  avgPrice: number
  currentPrice: number
  unrealizedPnl: number
}

export interface ArbitrageSignal {
  id: string
  type: 'polymarket-mt5' | 'cross-market' | 'synthetic'
  description: string
  expectedEdge: number       // %
  confidence: number         // 0–100
  requiredCapital: number
  timeToExpiry: number       // seconds
  status: 'live' | 'executed' | 'expired'
  mt5Symbol?: string
  polymarketId?: string
}

export interface MonteCarloResult {
  scenario: string
  p10: number
  p25: number
  p50: number
  p75: number
  p90: number
  maxDrawdown: number
  sharpe: number
  runs: number
}

export interface TaxEntry {
  id: string
  date: string
  amount: number
  description: string
  category: TaxCategory
  source: string             // job id or 'plaid'
  deductible: boolean
  taxPotContribution: number
}

export type TaxCategory =
  | 'income'
  | 'software'
  | 'marketing'
  | 'contractor'
  | 'travel'
  | 'equipment'
  | 'fees'
  | 'other'

export interface TaxPot {
  balance: number
  targetRate: number         // % of income to set aside
  quarterlyEstimate: number
  nextDueDate: string
  ytdIncome: number
  ytdSetAside: number
  projectedTaxBill: number
}

export interface Lead {
  id: string
  name: string
  email: string
  company?: string
  source: string
  score: number              // 0–100 AI qualification score
  stage: 'new' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost'
  estimatedValue: number
  proposalUrl?: string
  contractUrl?: string
  invoiceUrl?: string
  loomUrl?: string
  createdAt: string
  lastContact: string
}

export interface DailyBriefing {
  id: string
  date: string
  summary: string
  audioUrl?: string
  topPriorities: string[]
  alerts: BriefingAlert[]
  pnlSummary: {
    mt5: number
    polymarket: number
    total: number
  }
}

export interface BriefingAlert {
  type: 'risk' | 'opportunity' | 'action' | 'info'
  message: string
  urgency: 'critical' | 'high' | 'low'
}

export interface AllocationRule {
  jobId: string
  jobName: string
  currentAllocation: number  // %
  recommendedAllocation: number  // %
  expectedReturn: number
  constraint: string
}

export interface SynergyLink {
  id: string
  jobA: string
  jobB: string
  synergyType: string
  value: number              // $ monthly synergy
  description: string
  active: boolean
}

export interface RealtimeTick {
  symbol: string
  bid: number
  ask: number
  spread: number
  timestamp: number
}
