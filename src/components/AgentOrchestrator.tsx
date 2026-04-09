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
  CreditCard,
  Users,
  Shield,
} from 'lucide-react';
import clsx from 'clsx';
import { useJobs } from '../hooks/useJobs';

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

const PLAN_STAGES: PlanStage[] = [
  { name: 'Analyzing', completed: true },
  { name: 'Researching', completed: true },
  { name: 'Planning', completed: true },
  { name: 'Optimizing', completed: false },
  { name: 'Ready', completed: false },
];

// Component
const AgentOrchestrator: React.FC = () => {
  const [ultraPlanActive, setUltraPlanActive] = useState(false);
  const [planTime, setPlanTime] = useState(0);
  const [dreamModeActive, setDreamModeActive] = useState(true);
  const [autoDispatchActive, setAutoDispatchActive] = useState(true);
  const [currentPlanIndex, setCurrentPlanIndex] = useState(0);

  // Fetch real job/task data from Supabase
  const { data: jobs = [], isLoading } = useJobs();

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

  // Calculate stats from real job data
  const allTasks = jobs.flatMap((j) => j.tasks);
  const tasksInProgress = allTasks.filter((t) => t.status === 'in_progress').length;
  const tasksCompletedToday = allTasks.filter((t) => t.status === 'done').length;
  const tasksInQueue = allTasks.filter((t) => (t.status as string) === 'todo' || t.status === 'pending').length;
  const totalRevenue = jobs.reduce((sum, j) => sum + j.monthlyProfit, 0);

  // Build agents list from job data
  const agents: Agent[] = jobs.slice(0, 6).map((job, idx) => {
    const jobTasks = job.tasks;
    const completedCount = jobTasks.filter((t) => t.status === 'done').length;
    const activeTask = jobTasks.find((t) => t.status === 'in_progress');
    const status = job.status === 'active' ? 'active' : job.status === 'paused' ? 'paused' : 'idle';

    return {
      id: job.id,
      name: `Agent ${job.name.split(' ')[0] || 'Worker'}`,
      role: job.category,
      status,
      tasksCompleted: completedCount,
      currentTask: activeTask?.title || 'Waiting for task assignment',
      cpuUsage: Math.min(30 + Math.random() * 60, 95),
      memoryUsage: Math.min(20 + Math.random() * 50, 85),
    };
  });

  // Build task queue from real tasks
  const queueTasks: Task[] = allTasks
    .filter((t) => (t.status as string) === 'todo' || t.status === 'pending')
    .slice(0, 5)
    .map((t) => ({
      id: t.id,
      description: t.title,
      assignedAgent: t.assignedTo || 'Unassigned',
      priority: (t.priority as 'high' | 'medium' | 'low') || 'medium',
      estimatedTime: t.estimatedMinutes ? `${t.estimatedMinutes} min` : '15 min',
    }));

  if (isLoading) {
    return (
      <div className="min-h-screen bg-lumina-bg p-6 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 text-lumina-pulse animate-spin mx-auto mb-4" />
          <p className="text-lumina-muted">Loading agent fleet data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-lumina-bg p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-lumina-text flex items-center gap-3">
            <Brain className="w-10 h-10 text-lumina-pulse" />
            Agent Orchestrator
          </h1>
          <p className="text-lumina-muted mt-2">
            {jobs.length === 0
              ? 'No agents deployed yet — tasks will appear here as jobs generate them.'
              : 'Multi-agent parallel task automation'}
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-lumina-pulse">{tasksCompletedToday}</div>
          <p className="text-lumina-muted">Tasks Completed Today</p>
        </div>
      </div>

      {/* Agent Fleet Overview */}
      {jobs.length === 0 ? (
        <div className="bg-lumina-card border border-lumina-border rounded-lg p-12 text-center">
          <Cpu className="w-12 h-12 text-lumina-muted mx-auto mb-4" />
          <h2 className="text-xl font-bold text-lumina-text mb-2">No Agents Deployed</h2>
          <p className="text-lumina-muted mb-4">
            The agent fleet appears empty. Run jobs in your dashboard to activate agents.
          </p>
          <p className="text-sm text-lumina-dim">Agents will be populated from active jobs in the ops_jobs table.</p>
        </div>
      ) : (
        <div>
          <h2 className="text-2xl font-bold text-lumina-text mb-4 flex items-center gap-2">
            <Cpu className="w-6 h-6 text-lumina-pulse" />
            Agent Fleet ({agents.length} Active)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="bg-lumina-card border border-lumina-border rounded-lg p-5 hover:border-lumina-pulse/50 transition-all"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-lumina-text">{agent.name}</h3>
                    <p className="text-sm text-lumina-muted">{agent.role}</p>
                  </div>
                  <span
                    className={clsx(
                      'inline-block w-3 h-3 rounded-full',
                      getStatusColor(agent.status)
                    )}
                  />
                </div>

                {/* Status Badge */}
                <div className="mb-3">
                  <span
                    className={clsx(
                      'inline-block text-xs font-semibold px-3 py-1 rounded-full',
                      agent.status === 'active'
                        ? 'bg-lumina-success/20 text-lumina-success'
                        : agent.status === 'idle'
                          ? 'bg-lumina-gold/20 text-lumina-gold'
                          : 'bg-lumina-danger/20 text-lumina-danger'
                    )}
                  >
                    {agent.status}
                  </span>
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
                      <span className="text-xs text-lumina-text font-medium">
                        {Math.round(agent.cpuUsage)}%
                      </span>
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
                      <span className="text-xs text-lumina-text font-medium">
                        {Math.round(agent.memoryUsage)}%
                      </span>
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
      )}

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
              <div
                className="w-3 h-3 bg-lumina-pulse rounded-full animate-bounce"
                style={{ animationDelay: '0.1s' }}
              />
              <div
                className="w-3 h-3 bg-lumina-pulse rounded-full animate-bounce"
                style={{ animationDelay: '0.2s' }}
              />
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
                        Distribute {tasksInQueue} queued tasks across {agents.length} agents for
                        maximum throughput
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-2 hover:bg-lumina-card rounded transition-colors">
                    <CheckCircle2 className="w-5 h-5 text-lumina-success flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-lumina-text font-medium">Phase 2: Resource Optimization</p>
                      <p className="text-sm text-lumina-muted">
                        Rebalance CPU allocation to reduce highest-load agent from 88% to 65%
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
        {queueTasks.length === 0 ? (
          <div className="text-center py-8 text-lumina-muted">
            <Clock className="w-8 h-8 mx-auto mb-2 text-lumina-muted/50" />
            <p>No pending tasks in queue</p>
          </div>
        ) : (
          <div className="space-y-2">
            {queueTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between bg-lumina-bg border border-lumina-border rounded-lg p-4 hover:border-lumina-pulse/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-lumina-text font-medium mb-1">{task.description}</p>
                  <p className="text-sm text-lumina-muted">Assigned to: {task.assignedAgent}</p>
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
        )}
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
            <p className="text-sm text-lumina-muted mt-1">Total Tasks Completed</p>
          </div>
          <div className="bg-lumina-bg rounded-lg p-4 border border-lumina-border">
            <p className="text-2xl font-bold text-lumina-success">
              {agents.length > 0
                ? Math.round((tasksCompletedToday / (tasksCompletedToday + tasksInQueue || 1)) * 100)
                : 0}
              %
            </p>
            <p className="text-sm text-lumina-muted mt-1">Throughput Rate</p>
          </div>
          <div className="bg-lumina-bg rounded-lg p-4 border border-lumina-border">
            <p className="text-2xl font-bold text-lumina-pulse">
              ${(totalRevenue / 1000).toFixed(1)}K
            </p>
            <p className="text-sm text-lumina-muted mt-1">Monthly Value</p>
          </div>
          <div className="bg-lumina-bg rounded-lg p-4 border border-lumina-border">
            <p className="text-2xl font-bold text-lumina-gold">{agents.length}</p>
            <p className="text-sm text-lumina-muted mt-1">Active Agents</p>
          </div>
        </div>

        {/* Performance Details */}
        <div className="bg-lumina-bg rounded-lg p-4 border border-lumina-border">
          <p className="text-sm font-semibold text-lumina-muted uppercase mb-4">Agent Summary</p>
          <div className="space-y-2 text-sm text-lumina-text">
            <p>
              Active agents: <span className="font-bold text-lumina-success">{agents.filter((a) => a.status === 'active').length}</span>
            </p>
            <p>
              Idle agents: <span className="font-bold text-lumina-gold">{agents.filter((a) => a.status === 'idle').length}</span>
            </p>
            <p>
              Avg CPU usage:{' '}
              <span className="font-bold text-lumina-pulse">
                {agents.length > 0
                  ? Math.round(agents.reduce((s, a) => s + a.cpuUsage, 0) / agents.length)
                  : 0}
                %
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentOrchestrator;
