import React, { useState, useMemo } from 'react';
import {
  Play,
  Pause,
  TrendingUp,
  Zap,
  Users,
  Settings,
  Activity,
  AlertCircle,
  Check,
  X,
  Copy,
  Target,
  DollarSign,
  Percent,
} from 'lucide-react';
import clsx from 'clsx';

// Mock data for demonstration
const MOCK_EDGE_MARKETS = [
  {
    id: 1,
    question: 'Will Bitcoin reach $100k by June 2026?',
    yesPrice: 0.12,
    aiConfidence: 78,
    expectedEdge: 0.66,
  },
  {
    id: 2,
    question: 'Will US unemployment stay below 4.5%?',
    yesPrice: 0.14,
    aiConfidence: 72,
    expectedEdge: 0.58,
  },
  {
    id: 3,
    question: 'Will Ethereum outperform BTC in 2026?',
    yesPrice: 0.09,
    aiConfidence: 65,
    expectedEdge: 0.56,
  },
  {
    id: 4,
    question: 'Will SpaceX launch Starship by May 2026?',
    yesPrice: 0.18,
    aiConfidence: 85,
    expectedEdge: 0.67,
  },
  {
    id: 5,
    question: 'Will AI regulation pass in 2026?',
    yesPrice: 0.11,
    aiConfidence: 68,
    expectedEdge: 0.57,
  },
];

const MOCK_TOP_TRADERS = [
  {
    handle: '@swisstony',
    totalPnL: 5495000,
    winRate: 64,
    activePositions: 12,
    isFollowing: false,
  },
  {
    handle: '@Theo4',
    totalPnL: 1240000,
    winRate: 58,
    activePositions: 8,
    isFollowing: false,
  },
  {
    handle: '@Fredi9999',
    totalPnL: 880000,
    winRate: 61,
    activePositions: 6,
    isFollowing: false,
  },
  {
    handle: '@PredictIt_Pro',
    totalPnL: 640000,
    winRate: 55,
    activePositions: 10,
    isFollowing: false,
  },
];

const MOCK_TRADE_LOG = [
  {
    id: 1,
    market: 'Bitcoin $100k by June',
    direction: 'YES',
    entryPrice: 0.12,
    currentPrice: 0.28,
    size: 500,
    pnl: 80,
    status: 'open',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
  },
  {
    id: 2,
    market: 'US unemployment < 4.5%',
    direction: 'YES',
    entryPrice: 0.14,
    currentPrice: 0.14,
    size: 300,
    pnl: 0,
    status: 'open',
    timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000),
  },
  {
    id: 3,
    market: 'Trump 2024 reelection',
    direction: 'YES',
    entryPrice: 0.45,
    currentPrice: 0.92,
    size: 200,
    pnl: 94,
    status: 'closed',
    timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000),
  },
  {
    id: 4,
    market: 'Fed rate hikes by May',
    direction: 'NO',
    entryPrice: 0.68,
    currentPrice: 0.32,
    size: 400,
    pnl: 144,
    status: 'closed',
    timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000),
  },
  {
    id: 5,
    market: 'SpaceX Starship launch',
    direction: 'YES',
    entryPrice: 0.18,
    currentPrice: 0.55,
    size: 600,
    pnl: 222,
    status: 'open',
    timestamp: new Date(Date.now() - 16 * 60 * 60 * 1000),
  },
  {
    id: 6,
    market: 'Crypto bull market 2026',
    direction: 'YES',
    entryPrice: 0.11,
    currentPrice: 0.08,
    size: 250,
    pnl: -7.5,
    status: 'open',
    timestamp: new Date(Date.now() - 20 * 60 * 60 * 1000),
  },
];

const EQUITY_CURVE_DATA = Array.from({ length: 30 }, (_, i) => {
  const baseValue = 500;
  const growthFactor = Math.pow(1.15, i / 5);
  const noise = Math.random() * 0.3 - 0.15;
  return Math.max(baseValue, baseValue * growthFactor * (1 + noise));
});

interface ScriptStatus {
  isRunning: boolean;
  model: 'opus' | 'sonnet' | 'haiku';
  uptimeHours: number;
  tradesExecutedToday: number;
  winRate: number;
  totalPnL: number;
}

interface ConfigState {
  maxPositionSize: number;
  riskPerTrade: number;
  edgeThreshold: number;
  selectedCategories: {
    politics: boolean;
    crypto: boolean;
    sports: boolean;
    finance: boolean;
    entertainment: boolean;
  };
  autoCompound: boolean;
}

interface TraderFollow {
  [key: string]: boolean;
}

const PolymarketScriptTrader: React.FC = () => {
  const [scriptStatus, setScriptStatus] = useState<ScriptStatus>({
    isRunning: false,
    model: 'opus',
    uptimeHours: 48,
    tradesExecutedToday: 7,
    winRate: 64,
    totalPnL: 12400,
  });

  const [config, setConfig] = useState<ConfigState>({
    maxPositionSize: 500,
    riskPerTrade: 3,
    edgeThreshold: 50,
    selectedCategories: {
      politics: true,
      crypto: true,
      sports: false,
      finance: true,
      entertainment: false,
    },
    autoCompound: true,
  });

  const [traderFollows, setTraderFollows] = useState<TraderFollow>(
    MOCK_TOP_TRADERS.reduce((acc, trader) => {
      acc[trader.handle] = false;
      return acc;
    }, {} as TraderFollow)
  );

  const toggleScript = () => {
    setScriptStatus((prev) => ({
      ...prev,
      isRunning: !prev.isRunning,
    }));
  };

  const toggleTraderFollow = (handle: string) => {
    setTraderFollows((prev) => ({
      ...prev,
      [handle]: !prev[handle],
    }));
  };

  const toggleCategory = (category: keyof ConfigState['selectedCategories']) => {
    setConfig((prev) => ({
      ...prev,
      selectedCategories: {
        ...prev.selectedCategories,
        [category]: !prev.selectedCategories[category],
      },
    }));
  };

  const filteredEdgeMarkets = useMemo(() => {
    return MOCK_EDGE_MARKETS.filter((market) => market.expectedEdge * 100 >= config.edgeThreshold);
  }, [config.edgeThreshold]);

  const totalTradePnL = useMemo(() => {
    return MOCK_TRADE_LOG.reduce((sum, trade) => sum + trade.pnl, 0);
  }, []);

  const winCount = useMemo(() => {
    return MOCK_TRADE_LOG.filter((trade) => trade.pnl > 0).length;
  }, []);

  const currentEquity = EQUITY_CURVE_DATA[EQUITY_CURVE_DATA.length - 1];
  const maxEquity = Math.max(...EQUITY_CURVE_DATA);

  return (
    <div className="w-full space-y-6 p-6 bg-lumina-bg">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-lumina-text flex items-center gap-3">
            <Zap className="w-8 h-8 text-lumina-pulse" />
            Polymarket Script Trader
          </h1>
          <p className="text-lumina-dim text-sm mt-1">AI-powered edge detection and execution</p>
        </div>
      </div>

      {/* Script Status Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Status Card */}
        <div className="bg-lumina-surface border border-lumina-border rounded-lg p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-lumina-dim text-xs uppercase tracking-wider mb-2">Script Status</p>
              <div className="flex items-center gap-2">
                <div
                  className={clsx(
                    'w-3 h-3 rounded-full',
                    scriptStatus.isRunning
                      ? 'bg-lumina-success animate-pulse'
                      : 'bg-lumina-muted'
                  )}
                />
                <p className={clsx(
                  'text-sm font-semibold',
                  scriptStatus.isRunning ? 'text-lumina-success' : 'text-lumina-dim'
                )}>
                  {scriptStatus.isRunning ? 'Running' : 'Paused'}
                </p>
              </div>
            </div>
            <Activity className={clsx(
              'w-5 h-5',
              scriptStatus.isRunning ? 'text-lumina-success' : 'text-lumina-muted'
            )} />
          </div>
          <button
            onClick={toggleScript}
            className={clsx(
              'w-full mt-4 py-2 px-3 rounded-md font-semibold text-sm flex items-center justify-center gap-2 transition-colors',
              scriptStatus.isRunning
                ? 'bg-lumina-danger text-white hover:bg-red-600'
                : 'bg-lumina-success text-white hover:bg-green-600'
            )}
          >
            {scriptStatus.isRunning ? (
              <>
                <Pause className="w-4 h-4" />
                Pause Script
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Start Script
              </>
            )}
          </button>
        </div>

        {/* Uptime Card */}
        <div className="bg-lumina-surface border border-lumina-border rounded-lg p-4">
          <p className="text-lumina-dim text-xs uppercase tracking-wider mb-3">Uptime</p>
          <p className="text-2xl font-bold text-lumina-text">{scriptStatus.uptimeHours}h</p>
          <p className="text-lumina-dim text-xs mt-2">Continuous operation</p>
        </div>

        {/* Trades Executed Card */}
        <div className="bg-lumina-surface border border-lumina-border rounded-lg p-4">
          <p className="text-lumina-dim text-xs uppercase tracking-wider mb-3">Trades Today</p>
          <p className="text-2xl font-bold text-lumina-text">{scriptStatus.tradesExecutedToday}</p>
          <p className="text-lumina-success text-xs mt-2">Win rate: {scriptStatus.winRate}%</p>
        </div>

        {/* Total P&L Card */}
        <div className="bg-lumina-surface border border-lumina-border rounded-lg p-4">
          <p className="text-lumina-dim text-xs uppercase tracking-wider mb-3">Total P&L</p>
          <p className={clsx(
            'text-2xl font-bold',
            scriptStatus.totalPnL >= 0 ? 'text-lumina-success' : 'text-lumina-danger'
          )}>
            ${scriptStatus.totalPnL.toLocaleString()}
          </p>
          <p className="text-lumina-dim text-xs mt-2">All time</p>
        </div>

        {/* Model Selector Card */}
        <div className="bg-lumina-surface border border-lumina-border rounded-lg p-4">
          <p className="text-lumina-dim text-xs uppercase tracking-wider mb-3">AI Model</p>
          <select
            value={scriptStatus.model}
            onChange={(e) => setScriptStatus((prev) => ({
              ...prev,
              model: e.target.value as 'opus' | 'sonnet' | 'haiku',
            }))}
            className="w-full bg-lumina-card border border-lumina-border rounded-md px-3 py-2 text-sm text-lumina-text focus:outline-none focus:ring-2 focus:ring-lumina-pulse"
          >
            <option value="opus">Claude Opus</option>
            <option value="sonnet">Claude Sonnet</option>
            <option value="haiku">Claude Haiku</option>
          </select>
          <p className="text-lumina-dim text-xs mt-2">Selected model</p>
        </div>
      </div>

      {/* Edge Entry Scanner */}
      <div className="bg-lumina-surface border border-lumina-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-lumina-text flex items-center gap-2">
            <Target className="w-5 h-5 text-lumina-pulse" />
            Edge Entry Scanner
          </h2>
          <p className="text-lumina-dim text-xs">
            {filteredEdgeMarkets.length} profitable markets found
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-lumina-border">
                <th className="text-left py-3 px-3 text-lumina-dim font-semibold">Market</th>
                <th className="text-center py-3 px-3 text-lumina-dim font-semibold">YES Price</th>
                <th className="text-center py-3 px-3 text-lumina-dim font-semibold">AI Confidence</th>
                <th className="text-center py-3 px-3 text-lumina-dim font-semibold">Expected Edge</th>
                <th className="text-center py-3 px-3 text-lumina-dim font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredEdgeMarkets.map((market) => (
                <tr
                  key={market.id}
                  className={clsx(
                    'border-b border-lumina-border hover:bg-lumina-card/50 transition-colors',
                    market.expectedEdge > 0.5 && 'bg-lumina-success/5'
                  )}
                >
                  <td className="py-3 px-3 text-lumina-text">{market.question}</td>
                  <td className="py-3 px-3 text-center text-lumina-text font-semibold">
                    ${market.yesPrice.toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className="inline-flex items-center px-2 py-1 rounded-md bg-lumina-pulse/10 text-lumina-pulse font-semibold">
                      {market.aiConfidence}%
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span
                      className={clsx(
                        'inline-flex items-center px-2 py-1 rounded-md font-semibold',
                        market.expectedEdge > 0.5
                          ? 'bg-lumina-success/10 text-lumina-success'
                          : 'bg-lumina-gold/10 text-lumina-gold'
                      )}
                    >
                      {(market.expectedEdge * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <button className="px-3 py-1 bg-lumina-pulse text-white rounded-md text-xs font-semibold hover:bg-cyan-600 transition-colors">
                      Execute
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Copy-Trading Panel */}
      <div className="bg-lumina-surface border border-lumina-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-lumina-text flex items-center gap-2">
            <Users className="w-5 h-5 text-lumina-gold" />
            Top Traders Leaderboard
          </h2>
          <p className="text-lumina-dim text-xs">Copy profitable traders</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {MOCK_TOP_TRADERS.map((trader) => (
            <div
              key={trader.handle}
              className={clsx(
                'bg-lumina-card border border-lumina-border rounded-lg p-4 transition-colors',
                traderFollows[trader.handle] && 'ring-2 ring-lumina-pulse'
              )}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-lumina-text font-bold text-sm">{trader.handle}</p>
                  <p className="text-lumina-dim text-xs">Trader</p>
                </div>
                <button
                  onClick={() => toggleTraderFollow(trader.handle)}
                  className={clsx(
                    'p-2 rounded-md transition-colors',
                    traderFollows[trader.handle]
                      ? 'bg-lumina-pulse text-white'
                      : 'bg-lumina-border text-lumina-dim hover:bg-lumina-pulse/20'
                  )}
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex justify-between items-center">
                  <span className="text-lumina-dim text-xs">Total P&L</span>
                  <span className="text-lumina-success font-bold text-sm">
                    ${(trader.totalPnL / 1000).toFixed(0)}K
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-lumina-dim text-xs">Win Rate</span>
                  <span className="text-lumina-text font-bold text-sm">{trader.winRate}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-lumina-dim text-xs">Active Positions</span>
                  <span className="text-lumina-pulse font-bold text-sm">{trader.activePositions}</span>
                </div>
              </div>

              {traderFollows[trader.handle] && (
                <div className="pt-4 border-t border-lumina-border">
                  <p className="text-lumina-dim text-xs mb-2">Stake multiplier</p>
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.5"
                    defaultValue="1"
                    className="w-full"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Script Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Sliders */}
        <div className="bg-lumina-surface border border-lumina-border rounded-lg p-5">
          <h2 className="text-lg font-bold text-lumina-text flex items-center gap-2 mb-5">
            <Settings className="w-5 h-5 text-lumina-gold" />
            Position & Risk
          </h2>

          <div className="space-y-6">
            {/* Max Position Size */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-lumina-text text-sm font-semibold">Max Position Size</label>
                <span className="text-lumina-pulse font-bold">
                  ${config.maxPositionSize}
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="10000"
                step="50"
                value={config.maxPositionSize}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    maxPositionSize: parseInt(e.target.value),
                  }))
                }
                className="w-full accent-lumina-pulse"
              />
              <p className="text-lumina-dim text-xs mt-2">Per trade maximum exposure</p>
            </div>

            {/* Risk Per Trade */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-lumina-text text-sm font-semibold">Risk Per Trade</label>
                <span className="text-lumina-pulse font-bold">{config.riskPerTrade}%</span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                step="1"
                value={config.riskPerTrade}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    riskPerTrade: parseInt(e.target.value),
                  }))
                }
                className="w-full accent-lumina-pulse"
              />
              <p className="text-lumina-dim text-xs mt-2">Portfolio allocation per trade</p>
            </div>

            {/* Edge Threshold */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-lumina-text text-sm font-semibold">Edge Threshold</label>
                <span className="text-lumina-pulse font-bold">{config.edgeThreshold}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="80"
                step="5"
                value={config.edgeThreshold}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    edgeThreshold: parseInt(e.target.value),
                  }))
                }
                className="w-full accent-lumina-pulse"
              />
              <p className="text-lumina-dim text-xs mt-2">Minimum edge to execute trade</p>
            </div>
          </div>
        </div>

        {/* Right Column - Categories & Settings */}
        <div className="bg-lumina-surface border border-lumina-border rounded-lg p-5">
          <h2 className="text-lg font-bold text-lumina-text mb-5">Market Categories</h2>

          <div className="space-y-3 mb-6">
            {[
              { key: 'politics', label: 'Politics' },
              { key: 'crypto', label: 'Cryptocurrency' },
              { key: 'sports', label: 'Sports' },
              { key: 'finance', label: 'Finance' },
              { key: 'entertainment', label: 'Entertainment' },
            ].map((category) => (
              <label
                key={category.key}
                className="flex items-center gap-3 cursor-pointer hover:bg-lumina-card/50 p-2 rounded-md transition-colors"
              >
                <input
                  type="checkbox"
                  checked={config.selectedCategories[category.key as keyof ConfigState['selectedCategories']]}
                  onChange={() => toggleCategory(category.key as keyof ConfigState['selectedCategories'])}
                  className="w-4 h-4 rounded accent-lumina-pulse"
                />
                <span className="text-lumina-text text-sm">{category.label}</span>
              </label>
            ))}
          </div>

          {/* Auto-Compound Toggle */}
          <div className="border-t border-lumina-border pt-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config.autoCompound}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    autoCompound: e.target.checked,
                  }))
                }
                className="w-4 h-4 rounded accent-lumina-pulse"
              />
              <div>
                <p className="text-lumina-text text-sm font-semibold">Auto-Compound</p>
                <p className="text-lumina-dim text-xs">Reinvest profits automatically</p>
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* Trade Log */}
      <div className="bg-lumina-surface border border-lumina-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-lumina-text flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-lumina-pulse" />
            Recent Trades (Last 20)
          </h2>
          <p className="text-lumina-dim text-xs">
            Total P&L: <span className={clsx(
              'font-bold ml-1',
              totalTradePnL >= 0 ? 'text-lumina-success' : 'text-lumina-danger'
            )}>${totalTradePnL.toFixed(2)}</span>
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-lumina-border">
                <th className="text-left py-3 px-3 text-lumina-dim font-semibold">Market</th>
                <th className="text-center py-3 px-3 text-lumina-dim font-semibold">Direction</th>
                <th className="text-center py-3 px-3 text-lumina-dim font-semibold">Entry Price</th>
                <th className="text-center py-3 px-3 text-lumina-dim font-semibold">Current Price</th>
                <th className="text-center py-3 px-3 text-lumina-dim font-semibold">Size</th>
                <th className="text-center py-3 px-3 text-lumina-dim font-semibold">P&L</th>
                <th className="text-center py-3 px-3 text-lumina-dim font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_TRADE_LOG.map((trade) => (
                <tr
                  key={trade.id}
                  className="border-b border-lumina-border hover:bg-lumina-card/50 transition-colors"
                >
                  <td className="py-3 px-3 text-lumina-text font-medium truncate">{trade.market}</td>
                  <td className="py-3 px-3 text-center">
                    <span className={clsx(
                      'inline-flex items-center px-2 py-1 rounded-md font-semibold text-xs',
                      trade.direction === 'YES'
                        ? 'bg-lumina-success/10 text-lumina-success'
                        : 'bg-lumina-danger/10 text-lumina-danger'
                    )}>
                      {trade.direction}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center text-lumina-text">${trade.entryPrice.toFixed(2)}</td>
                  <td className="py-3 px-3 text-center text-lumina-text">${trade.currentPrice.toFixed(2)}</td>
                  <td className="py-3 px-3 text-center text-lumina-dim">${trade.size}</td>
                  <td className={clsx(
                    'py-3 px-3 text-center font-bold',
                    trade.pnl >= 0 ? 'text-lumina-success' : 'text-lumina-danger'
                  )}>
                    {trade.pnl >= 0 ? '+' : ''}{trade.pnl.toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className={clsx(
                      'inline-flex items-center px-2 py-1 rounded-md font-semibold text-xs',
                      trade.status === 'open'
                        ? 'bg-lumina-pulse/10 text-lumina-pulse'
                        : 'bg-lumina-muted/20 text-lumina-muted'
                    )}>
                      {trade.status === 'open' ? (
                        <>
                          <span className="w-1.5 h-1.5 bg-lumina-pulse rounded-full mr-1.5 animate-pulse" />
                          Open
                        </>
                      ) : (
                        <>
                          <Check className="w-3 h-3 mr-1" />
                          Closed
                        </>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary Footer */}
        <div className="flex gap-6 mt-4 pt-4 border-t border-lumina-border">
          <div>
            <p className="text-lumina-dim text-xs mb-1">Winning Trades</p>
            <p className="text-lumina-success font-bold">{winCount}/{MOCK_TRADE_LOG.length}</p>
          </div>
          <div>
            <p className="text-lumina-dim text-xs mb-1">Win Rate</p>
            <p className="text-lumina-pulse font-bold">
              {((winCount / MOCK_TRADE_LOG.length) * 100).toFixed(0)}%
            </p>
          </div>
          <div>
            <p className="text-lumina-dim text-xs mb-1">Avg P&L per Trade</p>
            <p className="text-lumina-text font-bold">
              ${(totalTradePnL / MOCK_TRADE_LOG.length).toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* Performance Chart Area */}
      <div className="bg-lumina-surface border border-lumina-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-lumina-text flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-lumina-success" />
            Equity Curve
          </h2>
          <div className="flex gap-6">
            <div>
              <p className="text-lumina-dim text-xs">Starting Capital</p>
              <p className="text-lumina-text font-bold">${EQUITY_CURVE_DATA[0].toFixed(0)}</p>
            </div>
            <div>
              <p className="text-lumina-dim text-xs">Current Equity</p>
              <p className={clsx(
                'font-bold',
                currentEquity >= EQUITY_CURVE_DATA[0]
                  ? 'text-lumina-success'
                  : 'text-lumina-danger'
              )}>
                ${currentEquity.toFixed(0)}
              </p>
            </div>
            <div>
              <p className="text-lumina-dim text-xs">Return</p>
              <p className={clsx(
                'font-bold',
                ((currentEquity / EQUITY_CURVE_DATA[0]) - 1) >= 0
                  ? 'text-lumina-success'
                  : 'text-lumina-danger'
              )}>
                {(((currentEquity / EQUITY_CURVE_DATA[0]) - 1) * 100).toFixed(0)}%
              </p>
            </div>
          </div>
        </div>

        {/* Simple Bar Chart */}
        <div className="flex items-end justify-between gap-1 h-64 bg-lumina-card/30 rounded-lg p-4">
          {EQUITY_CURVE_DATA.map((value, idx) => {
            const normalizedHeight = (value / maxEquity) * 100;
            const isGrowing = idx === 0 || value >= EQUITY_CURVE_DATA[idx - 1];

            return (
              <div
                key={idx}
                className="flex-1 flex flex-col items-center gap-1 group cursor-pointer"
                title={`Day ${idx + 1}: $${value.toFixed(0)}`}
              >
                <div
                  className={clsx(
                    'w-full transition-all rounded-t-sm',
                    isGrowing ? 'bg-lumina-success/80 hover:bg-lumina-success' : 'bg-lumina-danger/80 hover:bg-lumina-danger'
                  )}
                  style={{ height: `${normalizedHeight}%` }}
                />
                <div className="text-lumina-dim text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                  ${(value / 1000).toFixed(1)}K
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-lumina-dim text-xs mt-4">30-day equity curve showing growth from $500 initial capital</p>
      </div>

      {/* Footer Info */}
      <div className="bg-lumina-card border border-lumina-border rounded-lg p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-lumina-gold flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-lumina-text text-sm font-semibold">Educational Demo</p>
          <p className="text-lumina-dim text-xs mt-1">
            This is a demonstration of AI-powered Polymarket trading concepts. All data is simulated. Always conduct your own research and never invest more than you can afford to lose. Past performance does not guarantee future results.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PolymarketScriptTrader;
