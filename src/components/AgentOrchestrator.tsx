import React, { useState, useEffect } from 'react';
import {
  Brain,
  Cpu,
  Zap,
  CheckCircle2,
  Clock,
  TrendingUp,
  Loader,
  Play,
  Pause,
  Moon,
  BarChart3,
  AlertCircle,
} from 'lucide-react';
import clsx from 'clsx';

// Type definitions
interface Agent {
  id: string;
  name: string;
  role: string;
  status: 'active' | 'idle' | 'paused';
  tasksCompleted: number;
  currentTask: string;
  cpuUsage: number;
  memoryUsage: number;
}

interface Task {
  id: string;
  description: string;
  assignedAgent: string;
  priority: 'high' | 'medium' | 'low';
  estimatedTime: string;
}

interface PlanStage {
  name: string;
  completed: boolean;
}

// Mock data
const AGENTS: Agent[] = [
  {
    id: 'alpha',
    name: 'Agent Alpha',
    role: 'Market Research',
    status: 'active',
    tasksCompleted: 47,
    currentTask: 'Analyzing competitor Q1 reports',
    cpuUsage: 72,
    memoryUsage: 58,
  },
  {
    id: 'beta',
    name: 'Agent Beta',
    role: 'Content Writer',
    status: 'active',
    tasksCompleted: 31,
    currentTask: 'Drafting quarterly newsletter',
    cpuUsage: 45,
    memoryUsage: 42,
  },
  {
    id: 'gamma',
    name: 'Agent Gamma',
    role: 'Code Generator',
    status: 'idle',
    tasksCompleted: 22,
    currentTask: 'Waiting for task assignment',
    cpuUsage: 8,
    memoryUsage: 15,
  },
  {
    id: 'delta',
    name: 'Agent Delta',
    role: 'Data Analyst',
    status: 'active',
    tasksCompleted: 56,
    currentTask: 'Processing sales pipeline data',
    cpuUsage: 88,
    memoryUsage: 76,
  },
  {
    id: 'epsilon',
    name: 'Agent Epsilon',
    role: 'Lead Qualifier',
    status: 'paused',
    tasksCompleted: 18,
    currentTask: 'Task paused by administrator',
    cpuUsage: 0,
    memoryUsage: 12,
  },
  {
    id: 'zeta',
    name: 'Agent Zeta',
    role: 'Tax Optimizer',
    status: 'active',
    tasksCompleted: 12,
    currentTask: 'Optimizing Q1 tax deductions',
    cpuUsage: 52,
    memoryUsage: 38,
  },
];

const QUEUE_TASKS: Task[] = [
  {
    id: 'task-001',
    description: 'Generate weekly performance report',
    assignedAgent: 'Agent Delta',
    priority: 'high',
    estimatedTime: '12 min',
  },
  {
    id: 'task-002',
    description: 'Research industry trends for tech sector',
    assignedAgent: 'Agent Alpha',
    priority: 'high',
    estimatedTime: '18 min',
  },
  {
    id: 'task-003',
    description: 'Create product comparison spreadsheet',
    assignedAgent: 'Agent Gamma',
    priority: 'medium',
    estimatedTime: '25 min',
  },
  {
    id: 'task-004',
    description: 'Email outreach to 50 prospects',
    assignedAgent: 'Unassigned',
    priority: 'medium',
    estimatedTime: '8 min',
  },
  {
    id: 'task-005',
    description: 'Review and optimize cost structure',
    assignedAgent: 'Agent Zeta',
    priority: 'low',
    estimatedTime: '15 min',
  },
];

const PLAN_STAGES: PlanStage[] = [
  { name: 'Analyzing', completed: true },
  { name: 'Researching', completed: true },
  { name: 'Planning', completed: true },
  { name: 'Optimizing', completed: false },
  { name: 'Ready', completed: false },
];

const AGENT_REVENUE = [
  { name: 'Agent Alpha', tasks: 47, revenue: '$2,350', efficiency: 94 },
  { name: 'Agent Beta', tasks: 31, revenue: '$1,860', efficiency: 88 },
  { name: 'Agent Gamma', tasks: 22, revenue: '$1,540', efficiency: 92 },
  { name: 'Agent Delta', tasks: 56, revenue: '$3,920', efficiency: 96 },
  { name: 'Agent Epsilon', tasks: 18, revenue: '$980', efficiency: 85 },
  { name: 'Agent Zeta', tasks: 12, revenue: '$1,680', efficiency: 91 },
];

// Component
const AgentOrchestrator: React.FC = () => {
  const [ultraPlanActive, setUltraPlanActive] = useState(false);
  const [planTime, setPlanTime] = useState(0);
  const [dreamModeActive, setDreamModeActive] = useState(false);
  const [autoDispatchActive, setAutoDispatchActive] = useState(false);
  const [currentPlanIndex, setCurrentPlanIndex] = useState(0);

  // UltraPlan timer effect
  useEffect(() => {
    if (!ultraPlanActive) {
      setPlanTime(0);
      setCurrentPlanIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setPlanTime((prev) => prev + 1);
      // Advance plan stages every 3 seconds
      setCurrentPlanIndex((prev) => Math.min(prev + 1, PLAN_STAGES.length - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [ultraPlanActive]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-lumina-success';
      case 'idle':
        return 'bg-lumina-gold';
      case 'paused':
        return 'bg-lumina-danger';
      default:
        return 'bg-lumina-muted';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-lumina-danger/20 text-lumina-danger border border-lumina-danger/30';
      case 'medium':
        return 'bg-lumina-gold/20 text-lumina-gold border border-lumina-gold/30';
      case 'low':
        return 'bg-lumina-success/20 text-lumina-success border border-lumina-success/30';
      default:
        return 'bg-lumina-muted/20 text-lumina-muted border border-lumina-muted/30';
    }
  };

  const tasksInQueue = QUEUE_TASKS.length;
  const tasksInProgress = AGENTS.filter((a) => a.status === 'active').length;
  const tasksCompletedToday = AGENTS.reduce((sum, a) => sum + a.tasksCompleted, 0);
  const totalRevenue = AGENT_REVENUE.reduce(
    (sum, a) => sum + parseInt(a.revenue.replace('$', '').replace(',', '')),
    0
  );

  return (
    <div className="min-h-screen bg-lumina-bg p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-lumina-text flex items-center gap-3">
            <Brain className="w-10 h-10 text-lumina-pulse" />
            Agent Orchestrator
          </h1>
          <p className="text-lumina-muted mt-2">Multi-agent parallel task automation</p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-lumina-pulse">{tasksCompletedToday}</div>
          <p className="text-lumina-muted">Tasks Completed Today</p>
        </div>
      </div>

      {/* Agent Fleet Overview */}
      <div>
        <h2 className="text-2xl font-bold text-lumina-text mb-4 flex items-center gap-2">
          <Cpu className="w-6 h-6 text-lumina-pulse" />
          Agent Fleet (6 Active)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {AGENTS.map((agent) => (
            <div
              key={agent.id}
              className="bg-lumina-card border border-lumina-border rounded-lg p-4 hover:border-lumina-pulse/50 transition-colors"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-semibold text-lumina-text">{agent.name}</h3>
                  <p className="text-sm text-lumina-muted">{agent.role}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className={clsx('w-3 h-3 rounded-full', getStatusColor(agent.status))}
                  />
                  <span className="text-xs font-medium text-lumina-dim uppercase">
                    {agent.status}
                  </span>
                </div>
              </div>

              {/* Tasks Count */}
              <div className="mb-3 p-2 bg-lumina-bg rounded border border-lumina-border">
                <div className="text-2xl font-bold text-lumina-pulse">{agent.tasksCompleted}</div>
                <p className="text-xs text-lumina-muted">Tasks Completed</p>
              </div>

              {/* Current Task */}
              <p className="text-sm text-lumina-text mb-3 line-clamp-2">{agent.currentTask}</p>

              {/* Resource Usage */}
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-xs text-lumina-muted">CPU</span>
                    <span className="text-xs text-lumina-text font-medium">{agent.cpuUsage}%</span>
                  </div>
                  <div className="w-full h-2 bg-lumina-bg rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-lumina-pulse to-lumina-success rounded-full"
                      style={{ width: `${agent.cpuUsage}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-xs text-lumina-muted">Memory</span>
                    <span className="text-xs text-lumina-text font-medium">{agent.memoryUsage}%</span>
                  </div>
                  <div className="w-full h-2 bg-lumina-bg rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-lumina-gold to-lumina-pulse rounded-full"
                      style={{ width: `${agent.memoryUsage}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* UltraPlan Mode */}
      <div className="bg-lumina-card border border-lumina-border rounded-lg p-6">
        <h2 className="text-2xl font-bold text-lumina-text mb-4 flex items-center gap-2">
          <Brain className="w-6 h-6 text-lumina-violet" />
          UltraPlan Deep Thinking Mode
        </h2>

        <button
          onClick={() => setUltraPlanActive(!ultraPlanActive)}
          className={clsx(
            'flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all mb-6',
            ultraPlanActive
              ? 'bg-lumina-violet text-white hover:bg-lumina-violet/90'
              : 'bg-lumina-pulse text-lumina-bg hover:bg-lumina-pulse/90'
          )}
        >
          {ultraPlanActive ? (
            <Pause className="w-5 h-5" />
          ) : (
            <Play className="w-5 h-5" />
          )}
          {ultraPlanActive ? 'Stop UltraPlan' : 'Launch UltraPlan'}
        </button>

        {ultraPlanActive && (
          <div className="space-y-6">
            {/* Thinking Timer */}
            <div className="bg-lumina-bg rounded-lg p-4 border border-lumina-border">
              <div className="flex items-center justify-center gap-3">
                <Loader className="w-6 h-6 text-lumina-violet animate-spin" />
                <span className="text-2xl font-bold text-lumina-pulse font-mono">
                  {formatTime(planTime)}
                </span>
                <span className="text-lumina-muted">Thinking deeply...</span>
              </div>
            </div>

            {/* Progress Stages */}
            <div className="space-y-2">
              <p className="text-sm text-lumina-muted font-medium">Planning Progress</p>
              <div className="grid grid-cols-5 gap-2">
                {PLAN_STAGES.map((stage, idx) => (
                  <div key={stage.name} className="relative">
                    <div
                      className={clsx(
                        'w-full py-2 px-3 rounded-lg text-center text-sm font-medium transition-all',
                        idx <= currentPlanIndex
                          ? 'bg-lumina-pulse text-lumina-bg'
                          : 'bg-lumina-bg border border-lumina-border text-lumina-muted'
                      )}
                    >
                      {idx < currentPlanIndex && <CheckCircle2 className="w-4 h-4 inline mr-1" />}
                      {stage.name}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Animated Thinking Dots */}
            <div className="flex justify-center gap-2">
              <div className="w-3 h-3 bg-lumina-pulse rounded-full animate-bounce" />
              <div className="w-3 h-3 bg-lumina-pulse rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
              <div className="w-3 h-3 bg-lumina-pulse rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
            </div>

            {/* Plan Output */}
            {currentPlanIndex >= 4 && (
              <div className="bg-lumina-bg rounded-lg p-4 border border-lumina-pulse/30">
                <h3 className="text-lg font-bold text-lumina-text mb-4 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-lumina-success" />
                  Optimized Execution Plan
                </h3>
                <div className="space-y-2">
                  <div className="flex items-start gap-3 p-2 hover:bg-lumina-card rounded transition-colors">
                    <CheckCircle2 className="w-5 h-5 text-lumina-success flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-lumina-text font-medium">Phase 1: Parallel Task Dispatch</p>
                      <p className="text-sm text-lumina-muted">
                        Distribute 12 queued tasks across 4 idle agents for maximum throughput
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-2 hover:bg-lumina-card rounded transition-colors">
                    <CheckCircle2 className="w-5 h-5 text-lumina-success flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-lumina-text font-medium">Phase 2: Resource Optimization</p>
                      <p className="text-sm text-lumina-muted">
                        Rebalance CPU allocation to reduce Agent Delta load from 88% to 65%
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-2 hover:bg-lumina-card rounded transition-colors">
                    <CheckCircle2 className="w-5 h-5 text-lumina-success flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-lumina-text font-medium">Phase 3: Priority Reordering</p>
                      <p className="text-sm text-lumina-muted">
                        Move high-revenue tasks forward; 8% efficiency gain projected
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dream Mode Dashboard */}
      <div className="bg-lumina-card border border-lumina-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-lumina-text flex items-center gap-2">
            <Moon className="w-6 h-6 text-lumina-gold" />
            Dream Mode (Overnight Knowledge Compression)
          </h2>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={dreamModeActive}
              onChange={(e) => setDreamModeActive(e.target.checked)}
              className="w-5 h-5"
            />
            <span className="text-lumina-muted">Enable</span>
          </label>
        </div>

        {dreamModeActive && (
          <div className="space-y-4">
            {/* Status */}
            <div className="bg-lumina-bg rounded-lg p-4 flex items-center gap-3 border border-lumina-gold/30">
              <Loader className="w-5 h-5 text-lumina-gold animate-spin" />
              <p className="text-lumina-text font-medium">
                Processing overnight knowledge compression...
              </p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-lumina-bg rounded-lg p-4 border border-lumina-border">
                <p className="text-2xl font-bold text-lumina-pulse">2,847</p>
                <p className="text-sm text-lumina-muted mt-1">Knowledge Nodes Processed</p>
              </div>
              <div className="bg-lumina-bg rounded-lg p-4 border border-lumina-border">
                <p className="text-2xl font-bold text-lumina-success">143</p>
                <p className="text-sm text-lumina-muted mt-1">Patterns Identified</p>
              </div>
              <div className="bg-lumina-bg rounded-lg p-4 border border-lumina-border">
                <p className="text-2xl font-bold text-lumina-gold">28</p>
                <p className="text-sm text-lumina-muted mt-1">Optimizations Found</p>
              </div>
            </div>

            {/* Last Dream Cycle Results */}
            <div className="bg-lumina-bg rounded-lg p-4 border border-lumina-border space-y-2">
              <p className="text-sm font-semibold text-lumina-muted uppercase">Last Dream Cycle</p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2 text-lumina-text">
                  <CheckCircle2 className="w-4 h-4 text-lumina-success flex-shrink-0 mt-0.5" />
                  <span>Identified 3 new synergies between agent workflows</span>
                </li>
                <li className="flex items-start gap-2 text-lumina-text">
                  <CheckCircle2 className="w-4 h-4 text-lumina-success flex-shrink-0 mt-0.5" />
                  <span>Compressed 2.4GB of market research data with 98% fidelity</span>
                </li>
                <li className="flex items-start gap-2 text-lumina-text">
                  <CheckCircle2 className="w-4 h-4 text-lumina-success flex-shrink-0 mt-0.5" />
                  <span>Generated 12 new high-confidence trading signals</span>
                </li>
              </ul>
            </div>
          </div>
        )}

        {!dreamModeActive && (
          <div className="bg-lumina-bg rounded-lg p-6 text-center border border-lumina-border/50">
            <p className="text-lumina-muted">Enable Dream Mode to activate overnight knowledge compression</p>
          </div>
        )}
      </div>

      {/* Task Queue / Dispatch */}
      <div className="bg-lumina-card border border-lumina-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-lumina-text flex items-center gap-2">
            <Clock className="w-6 h-6 text-lumina-pulse" />
            Task Queue & Dispatch
          </h2>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={autoDispatchActive}
              onChange={(e) => setAutoDispatchActive(e.target.checked)}
              className="w-5 h-5"
            />
            <span className="text-lumina-muted text-sm">Auto-Dispatch</span>
          </label>
        </div>

        {/* Queue Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-lumina-bg rounded-lg p-4 border border-lumina-border">
            <p className="text-2xl font-bold text-lumina-pulse">{tasksInQueue}</p>
            <p className="text-sm text-lumina-muted mt-1">In Queue</p>
          </div>
          <div className="bg-lumina-bg rounded-lg p-4 border border-lumina-border">
            <p className="text-2xl font-bold text-lumina-gold">{tasksInProgress}</p>
            <p className="text-sm text-lumina-muted mt-1">In Progress</p>
          </div>
          <div className="bg-lumina-bg rounded-lg p-4 border border-lumina-border">
            <p className="text-2xl font-bold text-lumina-success">{tasksCompletedToday}</p>
            <p className="text-sm text-lumina-muted mt-1">Completed Today</p>
          </div>
        </div>

        {/* Queue Table */}
        <div className="space-y-2">
          {QUEUE_TASKS.map((task) => (
            <div
              key={task.id}
              className="flex items-center justify-between bg-lumina-bg border border-lumina-border rounded-lg p-4 hover:border-lumina-pulse/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-lumina-text font-medium mb-1">{task.description}</p>
                <p className="text-sm text-lumina-muted">
                  Assigned to: {task.assignedAgent}
                </p>
              </div>
              <div className="flex items-center gap-4 ml-4">
                <span className={clsx('text-xs font-semibold px-3 py-1 rounded-full', getPriorityColor(task.priority))}>
                  {task.priority.toUpperCase()}
                </span>
                <span className="text-sm text-lumina-muted whitespace-nowrap flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {task.estimatedTime}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Multi-Agent Performance */}
      <div className="bg-lumina-card border border-lumina-border rounded-lg p-6">
        <h2 className="text-2xl font-bold text-lumina-text mb-4 flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-lumina-success" />
          Multi-Agent Performance
        </h2>

        {/* Stats Bar */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-lumina-bg rounded-lg p-4 border border-lumina-border">
            <p className="text-2xl font-bold text-lumina-text">{tasksCompletedToday}</p>
            <p className="text-sm text-lumina-muted mt-1">Total Tasks</p>
          </div>
          <div className="bg-lumina-bg rounded-lg p-4 border border-lumina-border">
            <p className="text-2xl font-bold text-lumina-pulse">8.3</p>
            <p className="text-sm text-lumina-muted mt-1">Avg Completion (min)</p>
          </div>
          <div className="bg-lumina-bg rounded-lg p-4 border border-lumina-border">
            <p className="text-2xl font-bold text-lumina-gold">${totalRevenue.toLocaleString()}</p>
            <p className="text-sm text-lumina-muted mt-1">Revenue Generated</p>
          </div>
          <div className="bg-lumina-bg rounded-lg p-4 border border-lumina-border">
            <p className="text-2xl font-bold text-lumina-violet">142</p>
            <p className="text-sm text-lumina-muted mt-1">Hours Saved</p>
          </div>
        </div>

        {/* Agent Task Completion Chart */}
        <div className="space-y-3">
          <p className="text-sm text-lumina-muted font-medium">Tasks Completed by Agent</p>
          {AGENTS.map((agent) => (
            <div key={agent.id}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-lumina-text font-medium">{agent.name}</span>
                <span className="text-sm text-lumina-muted">{agent.tasksCompleted}</span>
              </div>
              <div className="w-full h-2 bg-lumina-bg rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-lumina-pulse to-lumina-violet rounded-full"
                  style={{ width: `${(agent.tasksCompleted / 56) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Weekly Agent Revenue Attribution */}
      <div className="bg-lumina-card border border-lumina-border rounded-lg p-6">
        <h2 className="text-2xl font-bold text-lumina-text mb-4 flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-lumina-gold" />
          Weekly Agent Revenue Attribution
        </h2>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-lumina-border">
                <th className="text-left py-3 px-4 text-sm font-semibold text-lumina-text">Agent</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-lumina-text">Tasks</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-lumina-text">Revenue</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-lumina-text">Efficiency</th>
              </tr>
            </thead>
            <tbody>
              {AGENT_REVENUE.map((row, idx) => (
                <tr
                  key={row.name}
                  className="border-b border-lumina-border hover:bg-lumina-bg/50 transition-colors"
                >
                  <td className="py-3 px-4 text-lumina-text font-medium">{row.name}</td>
                  <td className="py-3 px-4 text-right text-lumina-text">{row.tasks}</td>
                  <td className="py-3 px-4 text-right text-lumina-pulse font-semibold">{row.revenue}</td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-2 bg-lumina-bg rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-lumina-success to-lumina-pulse"
                          style={{ width: `${row.efficiency}%` }}
                        />
                      </div>
                      <span className="text-sm text-lumina-muted w-8 text-right">{row.efficiency}%</span>
                    </div>
                  </td>
                </tr>
              ))}
              {/* Total Row */}
              <tr className="bg-lumina-bg border-t-2 border-lumina-border font-semibold">
                <td className="py-3 px-4 text-lumina-text">TOTAL</td>
                <td className="py-3 px-4 text-right text-lumina-text">
                  {AGENT_REVENUE.reduce((sum, r) => sum + r.tasks, 0)}
                </td>
                <td className="py-3 px-4 text-right text-lumina-pulse">
                  ${AGENT_REVENUE.reduce((sum, r) => sum + parseInt(r.revenue.replace('$', '').replace(',', '')), 0).toLocaleString()}
                </td>
                <td className="py-3 px-4 text-right text-lumina-text">
                  {Math.round(AGENT_REVENUE.reduce((sum, r) => sum + r.efficiency, 0) / AGENT_REVENUE.length)}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AgentOrchestrator;
