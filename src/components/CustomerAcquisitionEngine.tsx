import React from 'react';
import {
  TrendingUp,
  Users,
  DollarSign,
  Zap,
  CheckCircle,
  ChevronRight,
  Search,
  Target,
  BarChart3,
  Calendar,
  Brain,
  Clock,
  Briefcase,
  Filter,
  ArrowUpRight,
  Lightbulb,
  Loader,
} from 'lucide-react';
import clsx from 'clsx';

// Mock data types
interface Client {
  id: string;
  name: string;
  niche: string;
  monthlyFee: number;
  adSpend: number;
  cac: number;
  customersAcquiredWeek: number;
  status: 'prospect' | 'research' | 'content' | 'ads' | 'billing';
}

interface CompetitorData {
  name: string;
  strength: string;
}

interface ContentMetric {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}

// Mock data
const mockClients: Client[] = [
  {
    id: '1',
    name: 'Bright Smile Dental',
    niche: 'Dentistry',
    monthlyFee: 4500,
    adSpend: 2500,
    cac: 85,
    customersAcquiredWeek: 8,
    status: 'ads',
  },
  {
    id: '2',
    name: 'PowerFit Gym',
    niche: 'Fitness',
    monthlyFee: 3500,
    adSpend: 1800,
    cac: 72,
    customersAcquiredWeek: 6,
    status: 'content',
  },
  {
    id: '3',
    name: 'Radiance Med Spa',
    niche: 'Med Spa',
    monthlyFee: 5000,
    adSpend: 3000,
    cac: 95,
    customersAcquiredWeek: 10,
    status: 'ads',
  },
  {
    id: '4',
    name: 'Elite Roofing',
    niche: 'Roofing',
    monthlyFee: 3000,
    adSpend: 1500,
    cac: 65,
    customersAcquiredWeek: 4,
    status: 'research',
  },
  {
    id: '5',
    name: 'OrthoSmile Dental',
    niche: 'Orthodontics',
    monthlyFee: 4000,
    adSpend: 2200,
    cac: 78,
    customersAcquiredWeek: 7,
    status: 'prospect',
  },
];

const mockNiches = ['Dentistry', 'Fitness', 'Med Spa', 'Roofing', 'HVAC', 'Plumbing'];

const mockCompetitors: CompetitorData[] = [
  { name: 'SmileBoost Dental Marketing', strength: 'Email campaigns, high conversion' },
  { name: 'LocalFit Gym Ads', strength: 'Video content, TikTok native' },
  { name: 'BeautyAI Agency', strength: 'Instagram Reels, influencer partnerships' },
];

const mockAudience = {
  ageRange: '25-54',
  interests: ['Cosmetic procedures', 'Wellness', 'Self-care', 'Health trends'],
  income: '$75K-$200K',
  platform: 'Instagram, TikTok, YouTube Shorts',
};

const mockContentThemes = [
  'Before & After Transformations',
  'Expert Tips & Education',
  'Client Testimonials',
  'Limited-Time Offers',
  'Behind-the-Scenes',
];

const mockAutomationPipeline = [
  { step: 'Research', type: 'AI', completed: true },
  { step: 'Script', type: 'AI', completed: true },
  { step: 'Edit', type: 'Manual', completed: true },
  { step: 'Schedule', type: 'AI', completed: false },
  { step: 'Run', type: 'AI', completed: false },
  { step: 'Report', type: 'AI', completed: false },
];

// Helper component for Kanban column
const KanbanColumn: React.FC<{
  title: string;
  count: number;
  clients: Client[];
}> = ({ title, count, clients }) => (
  <div className="bg-lumina-surface border border-lumina-border rounded-lg p-4 min-w-[280px]">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-sm font-semibold text-lumina-text">{title}</h3>
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-lumina-bg text-lumina-pulse text-xs font-bold">
        {count}
      </span>
    </div>
    <div className="space-y-3">
      {clients.map((client) => (
        <div
          key={client.id}
          className="bg-lumina-card border border-lumina-border rounded-lg p-3 hover:border-lumina-pulse transition-colors cursor-move group"
        >
          <div className="flex items-start justify-between mb-2">
            <h4 className="text-sm font-semibold text-lumina-text group-hover:text-lumina-pulse transition-colors">
              {client.name}
            </h4>
            <ChevronRight className="w-4 h-4 text-lumina-muted opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <p className="text-xs text-lumina-muted mb-3">{client.niche}</p>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-lumina-dim">Monthly Fee:</span>
              <span className="text-lumina-pulse font-semibold">
                ${(client.monthlyFee / 1000).toFixed(1)}K
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-lumina-dim">CAC:</span>
              <span className="text-lumina-dim">${client.cac}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-lumina-dim">Acquired:</span>
              <span className="text-lumina-success font-semibold">
                +{client.customersAcquiredWeek}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// Niche Research Panel Component
const NicheResearchPanel: React.FC<{ niche: string; setNiche: (n: string) => void }> = ({
  niche,
  setNiche,
}) => {
  const [isResearching, setIsResearching] = React.useState(false);
  const [researchComplete, setResearchComplete] = React.useState(false);

  const handleResearch = () => {
    setIsResearching(true);
    setTimeout(() => {
      setIsResearching(false);
      setResearchComplete(true);
    }, 2500);
  };

  return (
    <div className="bg-lumina-card border border-lumina-border rounded-lg p-6">
      <h2 className="text-lg font-semibold text-lumina-text mb-6 flex items-center gap-2">
        <Brain className="w-5 h-5 text-lumina-pulse" />
        Niche Research & Intelligence
      </h2>

      <div className="space-y-6">
        {/* Niche Selection */}
        <div>
          <label className="block text-sm font-medium text-lumina-text mb-3">
            Select or Enter Niche
          </label>
          <div className="flex gap-2 mb-3 flex-wrap">
            {mockNiches.map((n) => (
              <button
                key={n}
                onClick={() => {
                  setNiche(n);
                  setResearchComplete(false);
                }}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                  niche === n
                    ? 'bg-lumina-pulse text-lumina-bg'
                    : 'bg-lumina-surface border border-lumina-border text-lumina-text hover:border-lumina-pulse'
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Or enter custom niche..."
            value={niche}
            onChange={(e) => {
              setNiche(e.target.value);
              setResearchComplete(false);
            }}
            className="w-full px-4 py-2 bg-lumina-bg border border-lumina-border rounded-lg text-lumina-text placeholder-lumina-muted focus:outline-none focus:border-lumina-pulse"
          />
        </div>

        {/* AI Research Button */}
        <button
          onClick={handleResearch}
          disabled={!niche || isResearching || researchComplete}
          className={clsx(
            'w-full py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all',
            isResearching || researchComplete
              ? 'bg-lumina-surface text-lumina-muted cursor-not-allowed'
              : 'btn-pulse hover:shadow-lg'
          )}
        >
          {isResearching && (
            <>
              <Loader className="w-5 h-5 animate-spin" />
              Researching...
            </>
          )}
          {!isResearching && !researchComplete && (
            <>
              <Search className="w-5 h-5" />
              Run AI Research
            </>
          )}
          {researchComplete && (
            <>
              <CheckCircle className="w-5 h-5" />
              Research Complete
            </>
          )}
        </button>

        {/* Research Progress */}
        {(isResearching || researchComplete) && (
          <div className="space-y-3 p-4 bg-lumina-bg border border-lumina-border rounded-lg">
            <div className="flex items-center gap-3">
              <CheckCircle
                className={clsx(
                  'w-5 h-5',
                  researchComplete ? 'text-lumina-success' : 'text-lumina-pulse'
                )}
              />
              <span className="text-sm text-lumina-text">Competitor analysis complete</span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle
                className={clsx(
                  'w-5 h-5',
                  researchComplete ? 'text-lumina-success' : 'text-lumina-pulse'
                )}
              />
              <span className="text-sm text-lumina-text">Audience targeting defined</span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle
                className={clsx(
                  'w-5 h-5',
                  researchComplete ? 'text-lumina-success' : 'text-lumina-pulse'
                )}
              />
              <span className="text-sm text-lumina-text">Top-performing content analyzed</span>
            </div>
            {isResearching && (
              <div className="flex items-center gap-3">
                <Loader className="w-5 h-5 animate-spin text-lumina-pulse" />
                <span className="text-sm text-lumina-text">
                  Generating 30-day content calendar...
                </span>
              </div>
            )}
          </div>
        )}

        {/* Research Results */}
        {researchComplete && (
          <div className="space-y-4">
            {/* Top Competitors */}
            <div>
              <h3 className="text-sm font-semibold text-lumina-text mb-3">Top Competitors</h3>
              <div className="space-y-2">
                {mockCompetitors.map((comp, idx) => (
                  <div key={idx} className="p-3 bg-lumina-bg border border-lumina-border rounded-lg">
                    <p className="text-sm font-medium text-lumina-text">{comp.name}</p>
                    <p className="text-xs text-lumina-muted mt-1">{comp.strength}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Target Audience */}
            <div>
              <h3 className="text-sm font-semibold text-lumina-text mb-3">
                Target Audience Demographics
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-lumina-bg border border-lumina-border rounded-lg">
                  <p className="text-xs text-lumina-muted mb-1">Age Range</p>
                  <p className="text-sm font-semibold text-lumina-text">{mockAudience.ageRange}</p>
                </div>
                <div className="p-3 bg-lumina-bg border border-lumina-border rounded-lg">
                  <p className="text-xs text-lumina-muted mb-1">Income</p>
                  <p className="text-sm font-semibold text-lumina-text">{mockAudience.income}</p>
                </div>
                <div className="p-3 bg-lumina-bg border border-lumina-border rounded-lg col-span-2">
                  <p className="text-xs text-lumina-muted mb-1">Top Platforms</p>
                  <p className="text-sm font-semibold text-lumina-text">{mockAudience.platform}</p>
                </div>
                <div className="p-3 bg-lumina-bg border border-lumina-border rounded-lg col-span-2">
                  <p className="text-xs text-lumina-muted mb-2">Interests</p>
                  <div className="flex flex-wrap gap-2">
                    {mockAudience.interests.map((interest, idx) => (
                      <span key={idx} className="text-xs px-2 py-1 bg-lumina-pulse/10 text-lumina-pulse rounded">
                        {interest}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Content Themes */}
            <div>
              <h3 className="text-sm font-semibold text-lumina-text mb-3">Content Themes</h3>
              <div className="space-y-2">
                {mockContentThemes.map((theme, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 text-sm text-lumina-text">
                    <div className="w-2 h-2 rounded-full bg-lumina-pulse" />
                    {theme}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Content Factory Component
const ContentFactory: React.FC = () => {
  const contentMetrics: ContentMetric[] = [
    {
      label: 'Total Ads Created',
      value: '342',
      icon: <BarChart3 className="w-5 h-5" />,
      color: 'text-lumina-pulse',
    },
    {
      label: 'Avg CTR',
      value: '4.2%',
      icon: <TrendingUp className="w-5 h-5" />,
      color: 'text-lumina-success',
    },
    {
      label: 'Avg ROAS',
      value: '3.8x',
      icon: <DollarSign className="w-5 h-5" />,
      color: 'text-lumina-gold',
    },
    {
      label: 'Revenue This Month',
      value: '$47.2K',
      icon: <TrendingUp className="w-5 h-5" />,
      color: 'text-lumina-success',
    },
  ];

  return (
    <div className="bg-lumina-card border border-lumina-border rounded-lg p-6">
      <h2 className="text-lg font-semibold text-lumina-text mb-6 flex items-center gap-2">
        <Lightbulb className="w-5 h-5 text-lumina-gold" />
        Content Factory
      </h2>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {contentMetrics.map((metric, idx) => (
          <div
            key={idx}
            className="bg-lumina-bg border border-lumina-border rounded-lg p-4 text-center"
          >
            <div className={clsx('mb-2 flex justify-center', metric.color)}>{metric.icon}</div>
            <p className="text-2xl font-bold text-lumina-text mb-1">{metric.value}</p>
            <p className="text-xs text-lumina-muted">{metric.label}</p>
          </div>
        ))}
      </div>

      {/* 30-Day Calendar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-lumina-text flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            30-Day Content Calendar
          </h3>
          <button className="btn-pulse px-4 py-2 text-sm">Generate 30-Day Pack</button>
        </div>

        {/* Calendar Grid */}
        <div className="bg-lumina-bg border border-lumina-border rounded-lg p-4">
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 30 }, (_, i) => {
              const day = i + 1;
              const hasContent = [3, 5, 7, 9, 11, 14, 16, 18, 21, 23, 25, 27, 29].includes(day);
              const isScheduled = [7, 14, 21, 28].includes(day);
              const isRunning = [7, 14, 21, 28].includes(day);

              return (
                <div
                  key={day}
                  className={clsx(
                    'aspect-square rounded-lg flex flex-col items-center justify-center text-xs font-semibold border transition-all',
                    isRunning
                      ? 'bg-lumina-pulse/20 border-lumina-pulse text-lumina-pulse'
                      : isScheduled
                        ? 'bg-lumina-gold/10 border-lumina-gold text-lumina-gold'
                        : hasContent
                          ? 'bg-lumina-success/10 border-lumina-success text-lumina-success'
                          : 'bg-lumina-surface border-lumina-border text-lumina-muted hover:border-lumina-pulse'
                  )}
                >
                  <span>{day}</span>
                  {hasContent && (
                    <div className="w-1.5 h-1.5 rounded-full bg-current mt-0.5" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-lumina-border">
            <div className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded bg-lumina-success/10 border border-lumina-success" />
              <span className="text-lumina-dim">Content Created</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded bg-lumina-gold/10 border border-lumina-gold" />
              <span className="text-lumina-dim">Scheduled</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded bg-lumina-pulse/20 border border-lumina-pulse" />
              <span className="text-lumina-dim">Running</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Revenue Dashboard Component
const RevenueDashboard: React.FC = () => {
  const totalClients = mockClients.length;
  const monthlyRecurringRevenue = mockClients.reduce((sum, c) => sum + c.monthlyFee, 0);
  const avgRevenuePerClient = Math.round(monthlyRecurringRevenue / totalClients);
  const totalCustomersAcquired = mockClients.reduce((sum, c) => sum + c.customersAcquiredWeek, 0);

  const revenueMetrics = [
    {
      label: 'Active Clients',
      value: totalClients.toString(),
      icon: <Briefcase className="w-5 h-5" />,
      color: 'text-lumina-pulse',
    },
    {
      label: 'Monthly Recurring Revenue',
      value: `$${(monthlyRecurringRevenue / 1000).toFixed(1)}K`,
      icon: <DollarSign className="w-5 h-5" />,
      color: 'text-lumina-success',
    },
    {
      label: 'Avg Revenue Per Client',
      value: `$${avgRevenuePerClient / 1000}K`,
      icon: <TrendingUp className="w-5 h-5" />,
      color: 'text-lumina-gold',
    },
    {
      label: 'Customers Acquired (Week)',
      value: totalCustomersAcquired.toString(),
      icon: <Users className="w-5 h-5" />,
      color: 'text-lumina-success',
    },
  ];

  return (
    <div className="bg-lumina-card border border-lumina-border rounded-lg p-6">
      <h2 className="text-lg font-semibold text-lumina-text mb-6 flex items-center gap-2">
        <DollarSign className="w-5 h-5 text-lumina-gold" />
        Revenue Dashboard
      </h2>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {revenueMetrics.map((metric, idx) => (
          <div
            key={idx}
            className="bg-lumina-bg border border-lumina-border rounded-lg p-4"
          >
            <div className={clsx('mb-2', metric.color)}>{metric.icon}</div>
            <p className="text-2xl font-bold text-lumina-text mb-1">{metric.value}</p>
            <p className="text-xs text-lumina-muted">{metric.label}</p>
          </div>
        ))}
      </div>

      {/* Client Table */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-lumina-text mb-4">Client Details</h3>
        <div className="border border-lumina-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-lumina-bg border-b border-lumina-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-lumina-text">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-lumina-text">
                  Niche
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-lumina-text">
                  Monthly Fee
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-lumina-text">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-lumina-text">
                  Acquired
                </th>
              </tr>
            </thead>
            <tbody>
              {mockClients.map((client, idx) => (
                <tr
                  key={client.id}
                  className={clsx(
                    'border-b border-lumina-border hover:bg-lumina-surface transition-colors',
                    idx === mockClients.length - 1 && 'border-b-0'
                  )}
                >
                  <td className="px-4 py-3 text-sm text-lumina-text font-medium">
                    {client.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-lumina-muted">{client.niche}</td>
                  <td className="px-4 py-3 text-sm text-right text-lumina-pulse font-semibold">
                    ${(client.monthlyFee / 1000).toFixed(1)}K
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={clsx(
                        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                        client.status === 'ads'
                          ? 'bg-lumina-pulse/10 text-lumina-pulse'
                          : client.status === 'content'
                            ? 'bg-lumina-gold/10 text-lumina-gold'
                            : client.status === 'research'
                              ? 'bg-lumina-success/10 text-lumina-success'
                              : 'bg-lumina-surface text-lumina-muted'
                      )}
                    >
                      {client.status.charAt(0).toUpperCase() + client.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-lumina-success font-semibold">
                    +{client.customersAcquiredWeek}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Capacity Indicator */}
      <div>
        <h3 className="text-sm font-semibold text-lumina-text mb-3">Client Capacity</h3>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="h-3 bg-lumina-bg border border-lumina-border rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-lumina-pulse to-lumina-gold transition-all"
                style={{ width: `${(totalClients / 10) * 100}%` }}
              />
            </div>
          </div>
          <span className="text-sm font-semibold text-lumina-text whitespace-nowrap">
            {totalClients}/10
          </span>
        </div>
        <p className="text-xs text-lumina-muted mt-2">
          {10 - totalClients} slots available. One person managing {totalClients} clients vs.
          2-3 traditionally.
        </p>
      </div>
    </div>
  );
};

// AI Automation Status Component
const AIAutomationStatus: React.FC = () => {
  const hoursPerWeekTraditional = 8;
  const hoursPerWeekWithAI = 1;
  const hoursSaved = (hoursPerWeekTraditional - hoursPerWeekWithAI) * 6; // 6 clients

  return (
    <div className="bg-lumina-card border border-lumina-border rounded-lg p-6">
      <h2 className="text-lg font-semibold text-lumina-text mb-6 flex items-center gap-2">
        <Zap className="w-5 h-5 text-lumina-pulse" />
        AI Automation Pipeline
      </h2>

      {/* Pipeline Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between gap-2 mb-6">
          {mockAutomationPipeline.map((stage, idx) => (
            <React.Fragment key={stage.step}>
              <div className="flex flex-col items-center">
                <div
                  className={clsx(
                    'w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm mb-2 border-2 transition-all',
                    stage.completed
                      ? 'bg-lumina-success/20 border-lumina-success text-lumina-success'
                      : 'bg-lumina-surface border-lumina-border text-lumina-muted'
                  )}
                >
                  {stage.completed ? <CheckCircle className="w-5 h-5" /> : idx + 1}
                </div>
                <span className="text-xs font-semibold text-lumina-text text-center">
                  {stage.step}
                </span>
                <span
                  className={clsx(
                    'text-xs mt-1 px-2 py-0.5 rounded',
                    stage.type === 'AI'
                      ? 'bg-lumina-pulse/10 text-lumina-pulse'
                      : 'bg-lumina-gold/10 text-lumina-gold'
                  )}
                >
                  {stage.type}
                </span>
              </div>
              {idx < mockAutomationPipeline.length - 1 && (
                <div
                  className={clsx(
                    'flex-1 h-1 rounded-full',
                    mockAutomationPipeline[idx + 1].completed
                      ? 'bg-lumina-success'
                      : 'bg-lumina-border'
                  )}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Time Savings */}
      <div className="bg-lumina-bg border border-lumina-border rounded-lg p-6">
        <div className="flex items-center gap-4">
          <Clock className="w-12 h-12 text-lumina-gold flex-shrink-0" />
          <div>
            <p className="text-sm text-lumina-muted mb-1">Time Saved This Week</p>
            <p className="text-3xl font-bold text-lumina-text">
              {hoursSaved}
              <span className="text-xl ml-2 text-lumina-gold">hours</span>
            </p>
            <p className="text-xs text-lumina-muted mt-2">
              With AI automation, you save {hoursPerWeekTraditional - hoursPerWeekWithAI} hours
              per client per week
            </p>
          </div>
        </div>
      </div>

      {/* Automation Stats */}
      <div className="grid grid-cols-3 gap-4 mt-6">
        <div className="bg-lumina-bg border border-lumina-border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-lumina-pulse mb-1">
            {mockAutomationPipeline.filter((s) => s.completed).length}/
            {mockAutomationPipeline.length}
          </p>
          <p className="text-xs text-lumina-muted">Steps Completed</p>
        </div>
        <div className="bg-lumina-bg border border-lumina-border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-lumina-success mb-1">83%</p>
          <p className="text-xs text-lumina-muted">Automation Rate</p>
        </div>
        <div className="bg-lumina-bg border border-lumina-border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-lumina-gold mb-1">6</p>
          <p className="text-xs text-lumina-muted">AI-Powered Clients</p>
        </div>
      </div>
    </div>
  );
};

// Main Component
export const CustomerAcquisitionEngine: React.FC = () => {
  const [selectedNiche, setSelectedNiche] = React.useState('Dentistry');

  const prospectClients = mockClients.filter((c) => c.status === 'prospect');
  const researchClients = mockClients.filter((c) => c.status === 'research');
  const contentClients = mockClients.filter((c) => c.status === 'content');
  const adsClients = mockClients.filter((c) => c.status === 'ads');
  const billingClients = mockClients.filter((c) => c.status === 'billing');

  return (
    <div className="min-h-screen bg-lumina-bg p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-lumina-text mb-2 flex items-center gap-3">
          <Target className="w-8 h-8 text-lumina-pulse" />
          Customer Acquisition Engine
        </h1>
        <p className="text-lumina-muted flex items-center gap-2">
          <ArrowUpRight className="w-4 h-4 text-lumina-success" />
          AI-powered social media agency - Manage 5-10 clients instead of 2-3
        </p>
      </div>

      {/* Main Content */}
      <div className="space-y-8">
        {/* Niche Research & Content Factory Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <NicheResearchPanel niche={selectedNiche} setNiche={setSelectedNiche} />
          <ContentFactory />
        </div>

        {/* Client Pipeline Board */}
        <div>
          <h2 className="text-lg font-semibold text-lumina-text mb-4 flex items-center gap-2">
            <Filter className="w-5 h-5 text-lumina-pulse" />
            Client Pipeline Board
          </h2>
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-4">
              <KanbanColumn title="Prospect" count={prospectClients.length} clients={prospectClients} />
              <KanbanColumn title="Research" count={researchClients.length} clients={researchClients} />
              <KanbanColumn title="Content Created" count={contentClients.length} clients={contentClients} />
              <KanbanColumn title="Ads Running" count={adsClients.length} clients={adsClients} />
              <KanbanColumn title="Billing" count={billingClients.length} clients={billingClients} />
            </div>
          </div>
        </div>

        {/* Revenue & Automation Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <RevenueDashboard />
          <AIAutomationStatus />
        </div>
      </div>
    </div>
  );
};

export default CustomerAcquisitionEngine;
