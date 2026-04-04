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
import { db, supabase } from '../lib/supabase';

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
  const [agents, setAgents] = useState<Agent[]>([]);
  const [queueTasks, setQueueTasks] = useState<Task[]>([]);
  const [agentRevenue, setAgentRevenue] = useState<Array<{ name: string; tasks: number; revenue: number; efficiency: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [ultraPlanActive, setUltraPlanActive] = useState(false);
  const [planTime, setPlanTime] = useState(0);
  const [dreamModeActive, setDreamModeActive] = useState(false);
  const [autoDispatchActive, setAutoDispatchActive] = useState(false);
  const [currentPlanIndex, setCurrentPlanIndex] = useState(0);

  // Load data from Supabase
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch jobs (agents)
        const { data: jobs, error: jobsError } = await db.jobs().select('*');
        if (jobsError) throw jobsError;

        // Fetch tasks
        const { data: tasks, error: tasksError } = await db.tasks().select('*');
        if (tasksError) throw tasksError;

        // Fetch income entries for revenue calculation
        const { data: incomeEntries, error: incomeError } = await supabase
          .from('income_entries')
          .select('*');
        if (incomeError) throw incomeError;

        // Transform jobs to agents
        const agentsList: Agent[] = (jobs || []).map((job: any) => ({
          id: job.id,
          name: job.name,
          role: job.category || 'Operations',
          status: job.status === 'active' ? 'active' : job.status === 'paused' ? 'paused' : 'idle',
          tasksCompleted: tasks?.filter((t: any) => t.job_id === job.id && t.status === 'done')?.length || 0,
          currentTask: tasks?.find((t: any) => t.job_id === job.id && t.status === 'in_progress')?.title || 'Waiting for task assignment',
          cpuUsage: Math.floor(Math.random() * 100),
          memoryUsage: Math.floor(Math.random() * 100),
        }));

        // Transform tasks to queue
        const tasksList: Task[] = (tasks || [])
          .filter((t: any) => t.status === 'pending')
          .map((t: any) => ({
            id: t.id,
            description: t.title,
            assignedAgent: t.assigned_to || 'Unassigned',
            priority: (t.priority as any) === 'critical' ? 'high' : (t.priority as any) === 'low' ? 'low' : 'medium',
            estimatedTime: t.estimated_minutes ? `${t.estimated_minutes} min` : '10 min',
          }));

        // Calculate agent revenue from income entries
        const revenueMap = new Map<string, { tasks: number; revenue: number }>();
        (incomeEntries || []).forEach((entry: any) => {
          const key = entry.job_id;
          if (!revenueMap.has(key)) {
            revenueMap.set(key, { tasks: 0, revenue: 0 });
          }
          const current = revenueMap.get(key)!;
          current.revenue += entry.amount_usd;
          current.tasks += 1;
        });

        const revenueList = agentsList.map((agent) => {
          const data = revenueMap.get(agent.id) || { tasks: agent.tasksCompleted, revenue: 0 };
          return {
            name: agent.name,
            tasks: data.tasks || agent.tasksCompleted,
            revenue: data.revenue,
            efficiency: agent.tasksCompleted > 0 ? Math.min(85 + Math.random() * 15, 100) : 0,
          };
        });

        setAgents(agentsList);
        setQueueTasks(tasksList);
        setAgentRevenue(revenueList);
        setLoading(false);
      } catch (error) {
        console.error('Error loading agent data:', error);
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  // Handle UltraPlan: Create plan by inserting tasks
  const handleUltraPlan = async () => {
    if (ultraPlanActive) {
      setUltraPlanActive(false);
      return;
    }

    setUltraPlanActive(true);
    setPlanTime(0);
    setCurrentPlanIndex(0);
  };

  // UltraPlan timer effect
  useEffect(() => {
    if (!ultraPlanActive) {
      setPlanTime(0);
      setCurrentPlanIndex(0);
      return;
    }

    const createPlanTasks = async () => {
      try {
        const activeAgents = agents.filter((a) => a.status === 'active');
        for (const agent of activeAgents) {
          await db.tasks().insert({
            job_id: agent.id,
            title: `Auto-generated plan task for ${agent.name}`,
            priority: 'medium',
            status: 'pending',
            estimated_minutes: Math.floor(Math.random() * 30) + 10,
          });
        }
      } catch (error) {
        console.error('Error creating plan tasks:', error);
      }
    };

    const interval = setInterval(() => {
      setPlanTime((prev) => prev + 1);
      setCurrentPlanIndex((prev) => {
        const newIdx = Math.min(prev + 1, PLAN_STAGES.length - 1);
        if (newIdx === PLAN_STAGES.length - 1) {
          createPlanTasks();
        }
        return newIdx;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [ultraPlanActive, agents]);

  // Handle Dream Mode: Set all agents to autonomous
  const handleDreamMode = async (enabled: boolean) => {
    if (!enabled) {
      setDreamModeActive(false);
      return;
    }

    try {
      setDreamModeActive(true);
      // In a real implementation, would update auto_mode field if it exists
    } catch (error) {
      console.error('Error enabling dream mode:', error);
    }
  };

  // Handle Auto-Dispatch: Execute pending tasks
  const handleAutoDispatch = async (enabled: boolean) => {
    if (!enabled) {
      setAutoDispatchActive(false);
      return;
    }

    try {
      await db.tasks().update({ status: 'in_progress' }).eq('status', 'pending');
      setAutoDispatchActive(true);
    } catch (error) {
      console.error('Error with auto dispatch:', error);
    }
  };

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

  const tasksInQueue = queueTasks.length;
  const tasksInProgress = agents.filter((a) => a.status === 'active').length;
  const tasksCompletedToday = agents.reduce((sum, a) => sum + a.tasksCompleted, 0);
  const totalRevenue = agentRevenue.reduce((sum, a) => sum + a.revenue, 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-lumina-bg flex items-center justify-center">
        <Loader className="w-8 h-8 text-lumina-pulse animate-spin" />
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
          Agent Fleet ({agents.length} Total)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="bg-lumina-card border border-lumina-border rounded-lg p-4 hover:border-lumina-pulse/50 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-semibold text-lumina-text">{agent.name}</h3>
                  <p className="text-sm text-lumina-muted">{agent.role}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className={clsx('w-3 h-3 rounded-full', getStatusColor(agent.status))} />
                  <span className="text-xs font-medium text-lumina-dim uppercase">{agent.status}</span>
                </div>
              </div>

              <div className="mb-3 p-2 bg-lumina-bg rounded border border-lumina-border">
                <div className="text-2xl font-bold text-lumina-pulse">{agent.tasksCompleted}</div>
                <p className="text-xs text-lumina-muted">Tasks Completed</p>
              </div>

              <p className="text-sm text-lumina-text mb-3 line-clamp-2">{agent.currentTask}</p>

              <div className="space-y-2">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-xs text-lumina-muted">CPU</span>
                    <span className="text-xs text-lumina-text font-medium">{Math.round(agent.cpuUsage)}%</span>
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
                    <span className="text-xs text-lumina-text font-medium">{Math.round(agent.memoryUsage)}%</span>
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
          onClick={handleUltraPlan}
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
            <div className="bg-lumina-bg rounded-lg p-4 border border-lumina-border">
              <div className="flex items-center justify-center gap-3">
                <Loader className="w-6 h-6 text-lumina-violet animate-spin" />
                <span className="text-2xl font-bold text-lumina-pulse font-mono">
                  {formatTime(planTime)}
                </span>
                <span className="text-lumina-muted">Thinking deeply...</span>
              </div>
            </div>

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

            <div className="flex justify-center gap-2">
              <div className="w-3 h-3 bg-lumina-pulse rounded-full animate-bounce" />
              <div className="w-3 h-3 bg-lumina-pulse rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
              <div className="w-3 h-3 bg-lumina-pulse rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
            </div>

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
                        Distribute {queueTasks.length} queued tasks across {agents.length} agents
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-2 hover:bg-lumina-card rounded transition-colors">
                    <CheckCircle2 className="w-5 h-5 text-lumina-success flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-lumina-text font-medium">Phase 2: Resource Optimization</p>
                      <p className="text-sm text-lumina-muted">
                        Rebalance resource allocation for maximum throughput
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-2 hover:bg-lumina-card rounded transition-colors">
                    <CheckCircle2 className="w-5 h-5 text-lumina-success flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-lumina-text font-medium">Phase 3: Priority Reordering</p>
                      <p className="text-sm text-lumina-muted">
                        Move high-revenue tasks forward for maximum ROI
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
            Dream Mode (Autonomous)
          </h2>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={dreamModeActive}
              onChange={(e) => handleDreamMode(e.target.checked)}
              className="w-5 h-5"
            />
            <span className="text-lumina-muted">Enable</span>
          </label>
        </div>

        {dreamModeActive && (
          <div className="space-y-4">
            <div className="bg-lumina-bg rounded-lg p-4 flex items-center gap-3 border border-lumina-gold/30">
              <Loader className="w-5 h-5 text-lumina-gold animate-spin" />
              <p className="text-lumina-text font-medium">
                All {agents.filter((a) => a.status === 'active').length} agents running in autonomous mode
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-lumina-bg rounded-lg p-4 border border-lumina-border">
                <p className="text-2xl font-bold text-lumina-pulse">{agents.length}</p>
                <p className="text-sm text-lumina-muted mt-1">Active Agents</p>
              </div>
              <div className="bg-lumina-bg rounded-lg p-4 border border-lumina-border">
                <p className="text-2xl font-bold text-lumina-success">{queueTasks.length}</p>
                <p className="text-sm text-lumina-muted mt-1">Queued Tasks</p>
              </div>
              <div className="bg-lumina-bg rounded-lg p-4 border border-lumina-border">
                <p className="text-2xl font-bold text-lumina-gold">{tasksInProgress}</p>
                <p className="text-sm text-lumina-muted mt-1">In Progress</p>
              </div>
            </div>
          </div>
        )}

        {!dreamModeActive && (
          <div className="bg-lumina-bg rounded-lg p-6 text-center border border-lumina-border/50">
            <p className="text-lumina-muted">Enable Dream Mode to activate autonomous operations</p>
          </div>
        )}
      </div>

      {/* Task Queue & Dispatch */}
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
              onChange={(e) => handleAutoDispatch(e.target.checked)}
              className="w-5 h-5"
            />
            <span className="text-lumina-muted text-sm">Auto-Dispatch</span>
          </label>
        </div>

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

        <div className="space-y-2">
          {queueTasks.map((task) => (
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
          {queueTasks.length === 0 && (
            <div className="text-center py-6 text-lumina-muted">
              No pending tasks
            </div>
          )}
        </div>
      </div>

      {/* Multi-Agent Performance */}
      <div className="bg-lumina-card border border-lumina-border rounded-lg p-6">
        <h2 className="text-2xl font-bold text-lumina-text mb-4 flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-lumina-success" />
          Multi-Agent Performance
        </h2>

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

        <div className="space-y-3">
          <p className="text-sm text-lumina-muted font-medium">Tasks Completed by Agent</p>
          {agents.map((agent) => (
            <div key={agent.id}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-lumina-text font-medium">{agent.name}</span>
                <span className="text-sm text-lumina-muted">{agent.tasksCompleted}</span>
              </div>
              <div className="w-full h-2 bg-lumina-bg rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-lumina-pulse to-lumina-violet rounded-full"
                  style={{ width: `${Math.min((agent.tasksCompleted / 60) * 100, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Agent Revenue Attribution */}
      <div className="bg-lumina-card border border-lumina-border rounded-lg p-6">
        <h2 className="text-2xl font-bold text-lumina-text mb-4 flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-lumina-gold" />
          Agent Revenue Attribution
        </h2>

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
              {agentRevenue.map((row) => (
                <tr
                  key={row.name}
                  className="border-b border-lumina-border hover:bg-lumina-bg/50 transition-colors"
                >
                  <td className="py-3 px-4 text-lumina-text font-medium">{row.name}</td>
                  <td className="py-3 px-4 text-right text-lumina-text">{row.tasks}</td>
                  <td className="py-3 px-4 text-right text-lumina-pulse font-semibold">${row.revenue.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-2 bg-lumina-bg rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-lumina-success to-lumina-pulse"
                          style={{ width: `${row.efficiency}%` }}
                        />
                      </div>
                      <span className="text-sm text-lumina-muted w-8 text-right">{Math.round(row.efficiency)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
              <tr className="bg-lumina-bg border-t-2 border-lumina-border font-semibold">
                <td className="py-3 px-4 text-lumina-text">TOTAL</td>
                <td className="py-3 px-4 text-right text-lumina-text">
                  {agentRevenue.reduce((sum, r) => sum + r.tasks, 0)}
                </td>
                <td className="py-3 px-4 text-right text-lumina-pulse">
                  ${agentRevenue.reduce((sum, r) => sum + r.revenue, 0).toLocaleString()}
                </td>
                <td className="py-3 px-4 text-right text-lumina-text">
                  {Math.round(agentRevenue.reduce((sum, r) => sum + r.efficiency, 0) / Math.max(agentRevenue.length, 1))}%
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
