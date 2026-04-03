import { useState } from 'react'
import {
  BookOpen,
  Zap,
  TrendingUp,
  CheckCircle,
  Clock,
  BarChart3,
  ExternalLink,
  Play,
  Flame,
  Award,
  Brain,
  Cpu,
} from 'lucide-react'
import clsx from 'clsx'

// ── TYPES ──────────────────────────────────────────────────────────────────
interface Course {
  id: string
  provider: string
  name: string
  category: 'Fundamentals' | 'Advanced' | 'Specialized'
  hours: number
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced'
  progress: number // 0-100
  url: string
  icon: string // first letter or emoji
}

interface LearningPath {
  id: string
  title: string
  description: string
  courses: string[] // course IDs
  hours: number
  color: string // tailwind class
}

interface Skill {
  name: string
  courses: number
  incomeMin: number
  incomeMax: number
  level: 'Beginner' | 'Intermediate' | 'Advanced'
}

// ── COURSE DATA ────────────────────────────────────────────────────────────
const COURSES: Course[] = [
  {
    id: 'anthropic-1',
    provider: 'Anthropic',
    name: 'Prompt Engineering Fundamentals',
    category: 'Fundamentals',
    hours: 8,
    difficulty: 'Beginner',
    progress: 45,
    url: 'https://anthropic.skilljar.com',
    icon: 'A',
  },
  {
    id: 'google-1',
    provider: 'Google',
    name: 'AI Essentials for Everyone',
    category: 'Fundamentals',
    hours: 6,
    difficulty: 'Beginner',
    progress: 0,
    url: 'https://grow.google/ai',
    icon: 'G',
  },
  {
    id: 'meta-1',
    provider: 'Meta',
    name: 'Building with AI',
    category: 'Advanced',
    hours: 12,
    difficulty: 'Intermediate',
    progress: 0,
    url: 'https://ai.meta.com/resources',
    icon: 'M',
  },
  {
    id: 'nvidia-1',
    provider: 'NVIDIA',
    name: 'Deep Learning Fundamentals',
    category: 'Fundamentals',
    hours: 16,
    difficulty: 'Intermediate',
    progress: 25,
    url: 'https://developer.nvidia.com/training',
    icon: 'N',
  },
  {
    id: 'microsoft-1',
    provider: 'Microsoft',
    name: 'Azure AI Services',
    category: 'Advanced',
    hours: 14,
    difficulty: 'Intermediate',
    progress: 0,
    url: 'https://learn.microsoft.com/training',
    icon: 'M',
  },
  {
    id: 'openai-1',
    provider: 'OpenAI',
    name: 'ChatGPT & API Mastery',
    category: 'Advanced',
    hours: 10,
    difficulty: 'Intermediate',
    progress: 60,
    url: 'https://academy.openai.com',
    icon: 'O',
  },
  {
    id: 'ibm-1',
    provider: 'IBM',
    name: 'AI for Enterprise',
    category: 'Advanced',
    hours: 18,
    difficulty: 'Advanced',
    progress: 0,
    url: 'https://skillsbuild.org',
    icon: 'I',
  },
  {
    id: 'aws-1',
    provider: 'AWS',
    name: 'Machine Learning Foundations',
    category: 'Fundamentals',
    hours: 20,
    difficulty: 'Intermediate',
    progress: 15,
    url: 'https://skillbuilder.aws',
    icon: 'A',
  },
  {
    id: 'deeplearning-1',
    provider: 'DeepLearning.AI',
    name: 'Short Courses for Everyone',
    category: 'Fundamentals',
    hours: 6,
    difficulty: 'Beginner',
    progress: 0,
    url: 'https://deeplearning.ai',
    icon: 'D',
  },
  {
    id: 'huggingface-1',
    provider: 'Hugging Face',
    name: 'NLP & Transformers',
    category: 'Advanced',
    hours: 15,
    difficulty: 'Advanced',
    progress: 0,
    url: 'https://huggingface.co/learn',
    icon: 'H',
  },
  {
    id: 'fastai-1',
    provider: 'FastAI',
    name: 'Practical Deep Learning',
    category: 'Advanced',
    hours: 24,
    difficulty: 'Intermediate',
    progress: 0,
    url: 'https://course.fast.ai',
    icon: 'F',
  },
  {
    id: 'kaggle-1',
    provider: 'Kaggle',
    name: 'Machine Learning Crash Course',
    category: 'Fundamentals',
    hours: 10,
    difficulty: 'Beginner',
    progress: 30,
    url: 'https://kaggle.com/learn',
    icon: 'K',
  },
  {
    id: 'stanford-1',
    provider: 'Stanford',
    name: 'CS231N - Convolutional Neural Networks',
    category: 'Specialized',
    hours: 40,
    difficulty: 'Advanced',
    progress: 0,
    url: 'https://cs231n.stanford.edu',
    icon: 'S',
  },
  {
    id: 'mit-1',
    provider: 'MIT',
    name: 'OpenCourseWare - AI Courses',
    category: 'Advanced',
    hours: 36,
    difficulty: 'Advanced',
    progress: 0,
    url: 'https://ocw.mit.edu',
    icon: 'M',
  },
  {
    id: 'fullstack-1',
    provider: 'Full Stack DL',
    name: 'Full Stack Deep Learning Course',
    category: 'Specialized',
    hours: 32,
    difficulty: 'Advanced',
    progress: 0,
    url: 'https://fullstackdeeplearning.com',
    icon: 'F',
  },
  {
    id: 'deepmind-1',
    provider: 'DeepMind',
    name: 'DeepMind Learning Resources',
    category: 'Advanced',
    hours: 25,
    difficulty: 'Advanced',
    progress: 0,
    url: 'https://deepmind.com/learning-resources',
    icon: 'D',
  },
  {
    id: 'openai-cookbook',
    provider: 'OpenAI',
    name: 'OpenAI Cookbook - Code Examples',
    category: 'Specialized',
    hours: 8,
    difficulty: 'Intermediate',
    progress: 70,
    url: 'https://github.com/openai/openai-cookbook',
    icon: 'O',
  },
  {
    id: 'papers-1',
    provider: 'Papers with Code',
    name: 'ML Papers & Implementations',
    category: 'Specialized',
    hours: 28,
    difficulty: 'Advanced',
    progress: 0,
    url: 'https://paperswithcode.com',
    icon: 'P',
  },
  {
    id: 'assemblyai-1',
    provider: 'AssemblyAI',
    name: 'Audio AI & Speech Recognition',
    category: 'Specialized',
    hours: 12,
    difficulty: 'Intermediate',
    progress: 0,
    url: 'https://assemblyai.com/blog',
    icon: 'A',
  },
  {
    id: 'pinecone-1',
    provider: 'Pinecone',
    name: 'Vector Databases & RAG',
    category: 'Specialized',
    hours: 10,
    difficulty: 'Intermediate',
    progress: 35,
    url: 'https://learn.pinecone.io',
    icon: 'P',
  },
]

const LEARNING_PATHS: LearningPath[] = [
  {
    id: 'trading-edge',
    title: 'AI Trading Edge',
    description: 'Master AI-powered trading automation and market analysis to build profitable trading systems',
    courses: ['nvidia-1', 'deeplearning-1', 'kaggle-1'],
    hours: 32,
    color: 'text-lumina-pulse',
  },
  {
    id: 'agency-builder',
    title: 'AI Agency Builder',
    description: 'Build and scale AI agent services, from prompt engineering to deployment and monetization',
    courses: ['anthropic-1', 'openai-1', 'fullstack-1'],
    hours: 30,
    color: 'text-lumina-gold',
  },
  {
    id: 'content-machine',
    title: 'AI Content Machine',
    description: 'Create, automate, and scale content generation across all platforms using AI models',
    courses: ['huggingface-1', 'openai-cookbook', 'assemblyai-1'],
    hours: 35,
    color: 'text-lumina-success',
  },
]

const SKILLS: Skill[] = [
  {
    name: 'Prompt Engineering',
    courses: 4,
    incomeMin: 5000,
    incomeMax: 15000,
    level: 'Intermediate',
  },
  {
    name: 'AI Agent Building',
    courses: 6,
    incomeMin: 10000,
    incomeMax: 25000,
    level: 'Advanced',
  },
  {
    name: 'Fine-tuning & Training',
    courses: 5,
    incomeMin: 8000,
    incomeMax: 20000,
    level: 'Advanced',
  },
  {
    name: 'Data Analysis & ML',
    courses: 7,
    incomeMin: 6000,
    incomeMax: 12000,
    level: 'Intermediate',
  },
  {
    name: 'AI Content Creation',
    courses: 4,
    incomeMin: 3000,
    incomeMax: 8000,
    level: 'Beginner',
  },
]

// ── COMPONENTS ─────────────────────────────────────────────────────────────

function ProviderBadge({ provider, icon }: { provider: string; icon: string }) {
  const bgColorMap: Record<string, string> = {
    A: 'bg-purple-500/20',
    G: 'bg-blue-500/20',
    M: 'bg-blue-600/20',
    N: 'bg-green-500/20',
    O: 'bg-red-500/20',
    I: 'bg-indigo-500/20',
    D: 'bg-pink-500/20',
    H: 'bg-yellow-500/20',
    F: 'bg-orange-500/20',
    K: 'bg-cyan-500/20',
    P: 'bg-violet-500/20',
    S: 'bg-red-600/20',
  }

  const textColorMap: Record<string, string> = {
    A: 'text-purple-400',
    G: 'text-blue-400',
    M: 'text-blue-300',
    N: 'text-green-400',
    O: 'text-red-400',
    I: 'text-indigo-400',
    D: 'text-pink-400',
    H: 'text-yellow-400',
    F: 'text-orange-400',
    K: 'text-cyan-400',
    P: 'text-violet-400',
    S: 'text-red-300',
  }

  return (
    <div
      className={clsx(
        'w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm',
        bgColorMap[icon] || 'bg-lumina-border',
        textColorMap[icon] || 'text-lumina-text'
      )}
    >
      {icon}
    </div>
  )
}

function CategoryBadge({ category }: { category: Course['category'] }) {
  const styles = {
    Fundamentals: 'bg-lumina-success/20 text-lumina-success',
    Advanced: 'bg-lumina-pulse/20 text-lumina-pulse',
    Specialized: 'bg-lumina-gold/20 text-lumina-gold',
  }
  return (
    <span className={clsx('px-2 py-1 rounded text-xs font-medium', styles[category])}>
      {category}
    </span>
  )
}

function DifficultyBadge({ difficulty }: { difficulty: Course['difficulty'] }) {
  const styles = {
    Beginner: 'bg-lumina-success/20 text-lumina-success',
    Intermediate: 'bg-lumina-pulse/20 text-lumina-pulse',
    Advanced: 'bg-lumina-danger/20 text-lumina-danger',
  }
  return (
    <span className={clsx('px-2 py-1 rounded text-xs font-medium', styles[difficulty])}>
      {difficulty}
    </span>
  )
}

function HeroStatBar() {
  const totalHours = COURSES.reduce((sum, c) => sum + c.hours, 0)
  const completedCourses = COURSES.filter(c => c.progress === 100).length
  const inProgressCourses = COURSES.filter(c => c.progress > 0 && c.progress < 100).length

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      <div className="bg-lumina-card border border-lumina-border rounded-lg p-4">
        <p className="text-lumina-muted text-xs font-semibold uppercase mb-1">Total Courses</p>
        <p className="text-2xl font-bold text-lumina-text">{COURSES.length}</p>
        <p className="text-lumina-dim text-xs mt-1">All Free</p>
      </div>

      <div className="bg-lumina-card border border-lumina-border rounded-lg p-4">
        <p className="text-lumina-muted text-xs font-semibold uppercase mb-1">Estimated Value</p>
        <p className="text-2xl font-bold text-lumina-gold">$50k+</p>
        <p className="text-lumina-dim text-xs mt-1">In content</p>
      </div>

      <div className="bg-lumina-card border border-lumina-border rounded-lg p-4">
        <p className="text-lumina-muted text-xs font-semibold uppercase mb-1">Total Hours</p>
        <p className="text-2xl font-bold text-lumina-pulse">{totalHours}</p>
        <p className="text-lumina-dim text-xs mt-1">to complete all</p>
      </div>

      <div className="bg-lumina-card border border-lumina-border rounded-lg p-4">
        <p className="text-lumina-muted text-xs font-semibold uppercase mb-1">Your Progress</p>
        <p className="text-2xl font-bold text-lumina-text">{inProgressCourses}/20</p>
        <p className="text-lumina-dim text-xs mt-1">in progress</p>
      </div>
    </div>
  )
}

function LearningPathCard({ path }: { path: LearningPath }) {
  const pathCourses = COURSES.filter(c => path.courses.includes(c.id))

  return (
    <div className="bg-lumina-card border border-lumina-border rounded-lg p-6 hover:border-lumina-pulse/50 transition">
      <div className="flex items-start gap-3 mb-3">
        <Brain className={clsx('w-5 h-5 flex-shrink-0', path.color)} />
        <div>
          <h3 className="text-lg font-bold text-lumina-text">{path.title}</h3>
          <p className="text-sm text-lumina-dim mt-1">{path.description}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 my-4">
        {pathCourses.map(course => (
          <span
            key={course.id}
            className="px-3 py-1 rounded-full bg-lumina-border text-lumina-text text-xs font-medium"
          >
            {course.provider}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-lumina-muted text-sm">
          <Clock size={14} />
          <span>{path.hours} hours</span>
        </div>
        <button className="px-4 py-2 bg-lumina-pulse text-lumina-bg rounded-lg font-semibold hover:bg-lumina-pulse/90 transition text-sm">
          Start Path
        </button>
      </div>
    </div>
  )
}

function CourseCard({ course }: { course: Course }) {
  return (
    <div className="bg-lumina-card border border-lumina-border rounded-lg p-4 hover:border-lumina-pulse/50 transition">
      <div className="flex items-start gap-3 mb-3">
        <ProviderBadge provider={course.provider} icon={course.icon} />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-lumina-muted font-semibold uppercase mb-1">{course.provider}</p>
          <h3 className="text-sm font-bold text-lumina-text line-clamp-2">{course.name}</h3>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <CategoryBadge category={course.category} />
        <DifficultyBadge difficulty={course.difficulty} />
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-lumina-muted flex items-center gap-1">
            <Clock size={12} />
            {course.hours}h
          </span>
          <span className="text-lumina-muted">{course.progress}% complete</span>
        </div>

        <div className="w-full bg-lumina-bg rounded-full h-2 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-lumina-pulse to-lumina-gold transition-all duration-300"
            style={{ width: `${course.progress}%` }}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 pt-3 border-t border-lumina-border">
        <a
          href={course.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 px-3 py-2 bg-lumina-pulse/10 text-lumina-pulse hover:bg-lumina-pulse/20 rounded font-semibold text-xs transition flex items-center justify-center gap-1"
        >
          {course.progress > 0 ? 'Continue' : 'Start'}
        </a>
        <a
          href={course.url}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-2 bg-lumina-border hover:bg-lumina-border/50 text-lumina-dim rounded transition"
        >
          <ExternalLink size={14} />
        </a>
      </div>
    </div>
  )
}

function SkillToIncomeRow({ skill }: { skill: Skill }) {
  const courseList = COURSES.slice(0, skill.courses)
    .map(c => c.provider)
    .join(', ')

  return (
    <tr className="border-b border-lumina-border hover:bg-lumina-surface/50 transition">
      <td className="px-4 py-3">
        <p className="font-semibold text-lumina-text text-sm">{skill.name}</p>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          <span className="px-2 py-1 bg-lumina-border text-lumina-text text-xs rounded">
            {skill.courses} courses
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        <p className="text-lumina-gold font-semibold text-sm">
          ${skill.incomeMin.toLocaleString()}-${skill.incomeMax.toLocaleString()}/mo
        </p>
      </td>
      <td className="px-4 py-3">
        <span
          className={clsx('px-2 py-1 rounded text-xs font-medium', {
            'bg-lumina-success/20 text-lumina-success': skill.level === 'Beginner',
            'bg-lumina-pulse/20 text-lumina-pulse': skill.level === 'Intermediate',
            'bg-lumina-danger/20 text-lumina-danger': skill.level === 'Advanced',
          })}
        >
          {skill.level}
        </span>
      </td>
    </tr>
  )
}

function WeeklyGoalTracker() {
  const weeklyProgress = 12 // hours this week
  const weeklyTarget = 5 // target hours
  const progressPercent = Math.min((weeklyProgress / weeklyTarget) * 100, 100)
  const streak = 4

  return (
    <div className="bg-lumina-card border border-lumina-border rounded-lg p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-lumina-text">Weekly Learning Goal</h3>
          <p className="text-sm text-lumina-dim mt-1">Stay consistent to build momentum</p>
        </div>
        <div className="flex items-center gap-2 bg-lumina-success/20 px-3 py-2 rounded-lg">
          <Flame size={16} className="text-lumina-success" />
          <span className="font-bold text-lumina-success">{streak} week streak</span>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-lumina-text font-semibold">This week: {weeklyProgress}h / {weeklyTarget}h target</p>
          <p className="text-lumina-pulse font-bold">{Math.round(progressPercent)}%</p>
        </div>
        <div className="w-full bg-lumina-bg rounded-full h-3 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-lumina-pulse to-lumina-gold transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="bg-lumina-bg rounded p-2">
          <p className="text-xs text-lumina-muted uppercase">Mon</p>
          <p className="text-lumina-success font-bold">2h</p>
        </div>
        <div className="bg-lumina-bg rounded p-2">
          <p className="text-xs text-lumina-muted uppercase">Wed</p>
          <p className="text-lumina-success font-bold">4h</p>
        </div>
        <div className="bg-lumina-bg rounded p-2">
          <p className="text-xs text-lumina-muted uppercase">Fri</p>
          <p className="text-lumina-success font-bold">6h</p>
        </div>
      </div>
    </div>
  )
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────

export default function AIEducationHub() {
  const [selectedCategory, setSelectedCategory] = useState<
    'All' | 'Fundamentals' | 'Advanced' | 'Specialized'
  >('All')

  const filteredCourses =
    selectedCategory === 'All' ? COURSES : COURSES.filter(c => c.category === selectedCategory)

  return (
    <div className="min-h-screen bg-lumina-bg p-6">
      <div className="max-w-7xl mx-auto">
        {/* ── HEADER ─────────────────────────────────────────────────────────*/}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <BookOpen size={32} className="text-lumina-pulse" />
            <h1 className="text-4xl font-black text-lumina-text">AI Education Hub</h1>
          </div>
          <p className="text-lumina-dim text-lg">
            Master 20 free AI courses from industry leaders. Upskill to earn more.
          </p>
        </div>

        {/* ── HERO STAT BAR ──────────────────────────────────────────────────*/}
        <HeroStatBar />

        {/* ── LEARNING PATHS ────────────────────────────────────────────────*/}
        <section className="mb-10">
          <h2 className="text-2xl font-bold text-lumina-text mb-4 flex items-center gap-2">
            <Zap size={24} className="text-lumina-gold" />
            Curated Learning Paths
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {LEARNING_PATHS.map(path => (
              <LearningPathCard key={path.id} path={path} />
            ))}
          </div>
        </section>

        {/* ── SKILL-TO-INCOME MAPPER ────────────────────────────────────────*/}
        <section className="mb-10">
          <h2 className="text-2xl font-bold text-lumina-text mb-4 flex items-center gap-2">
            <TrendingUp size={24} className="text-lumina-pulse" />
            Skill-to-Income Mapper
          </h2>
          <div className="bg-lumina-card border border-lumina-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-lumina-surface border-b border-lumina-border">
                  <th className="px-4 py-3 text-left text-xs font-bold text-lumina-muted uppercase">
                    Skill
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-lumina-muted uppercase">
                    Courses
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-lumina-muted uppercase">
                    Income Potential
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-lumina-muted uppercase">
                    Level
                  </th>
                </tr>
              </thead>
              <tbody>
                {SKILLS.map((skill, idx) => (
                  <SkillToIncomeRow key={idx} skill={skill} />
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── WEEKLY GOAL TRACKER ────────────────────────────────────────────*/}
        <section className="mb-10">
          <WeeklyGoalTracker />
        </section>

        {/* ── ALL COURSES GRID ───────────────────────────────────────────────*/}
        <section>
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-lumina-text mb-4 flex items-center gap-2">
              <Cpu size={24} className="text-lumina-success" />
              All Courses ({filteredCourses.length})
            </h2>

            {/* Category Filter */}
            <div className="flex flex-wrap gap-2">
              {['All', 'Fundamentals', 'Advanced', 'Specialized'].map(cat => (
                <button
                  key={cat}
                  onClick={() =>
                    setSelectedCategory(
                      cat as 'All' | 'Fundamentals' | 'Advanced' | 'Specialized'
                    )
                  }
                  className={clsx(
                    'px-4 py-2 rounded-lg font-semibold transition text-sm',
                    selectedCategory === cat
                      ? 'bg-lumina-pulse text-lumina-bg'
                      : 'bg-lumina-card border border-lumina-border text-lumina-text hover:border-lumina-pulse/50'
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCourses.map(course => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
        </section>

        {/* ── FOOTER CTA ─────────────────────────────────────────────────────*/}
        <div className="mt-12 p-8 bg-gradient-to-r from-lumina-pulse/10 to-lumina-gold/10 border border-lumina-border rounded-lg text-center">
          <Award size={32} className="mx-auto mb-3 text-lumina-gold" />
          <h3 className="text-2xl font-bold text-lumina-text mb-2">Ready to Upskill?</h3>
          <p className="text-lumina-dim max-w-2xl mx-auto mb-4">
            Start with any course today. Each skill you master opens new income opportunities. Track
            your progress, join our community, and accelerate your earnings potential.
          </p>
          <button className="px-6 py-3 bg-gradient-to-r from-lumina-pulse to-lumina-gold text-lumina-bg rounded-lg font-bold hover:shadow-lg hover:shadow-lumina-pulse/30 transition">
            Begin Your Journey
          </button>
        </div>
      </div>
    </div>
  )
}
