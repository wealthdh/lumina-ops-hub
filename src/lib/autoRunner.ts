/**
 * AUTONOMOUS PIPELINE ENGINE
 * Runs continuously in the browser, automatically generating and distributing UGC content
 *
 * Features:
 * - 3 creatives per cycle (selected randomly from 20 templates)
 * - Automatic caption generation with viral hooks
 * - Video generation with DEV MODE fallback
 * - Twitter/X posting with graceful failure handling
 * - Daily goal tracking and cycle management
 * - Comprehensive logging for debugging
 */

import { supabase } from './supabase'
import { generateAndSaveCreative } from './ugcApi'
import { postToTwitter } from './distributeApi'
import { buildCaption } from './viralEngine'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AutoRunnerState {
  running: boolean
  cycleCount: number
  todayGenerated: number
  todayReady: number
  todayPosted: number
  todayErrors: number
  lastCycleAt: string | null
  nextCycleAt: string | null
  log: Array<{ ts: string; msg: string; level: 'info' | 'error' | 'success' }>
  dailyGoal: number
}

interface Template {
  id: string
  title: string
  platform: string
  prompt: string
}

interface RunnerOptions {
  intervalMs: number
  dailyGoal: number
  onUpdate: (state: AutoRunnerState) => void
}

// ─── Template Library (20 high-performing templates) ────────────────────────

const CREATIVE_TEMPLATES: Template[] = [
  {
    id: 't1',
    title: 'AI Trading Bot Earnings',
    platform: 'Twitter/X',
    prompt:
      'An AI trading bot dashboard showing real-time profit generation, $500+ daily earnings displayed prominently, multiple timeframe charts, green indicators everywhere, ultra-modern UI with neon accents, cinematic lighting',
  },
  {
    id: 't2',
    title: 'Content Pipeline Automation',
    platform: 'TikTok',
    prompt:
      'Animated workflow showing content creation pipeline: idea → script → video → posting, with AI assistance at each step, showing time saved from hours to minutes, dynamic transitions, futuristic aesthetic',
  },
  {
    id: 't3',
    title: 'Marketing Team Replacement',
    platform: 'Instagram',
    prompt:
      'Split screen: left side shows traditional $5000/month marketing team chaos, right side shows sleek AI system doing same work alone, visual comparison showing cost reduction, clean modern design',
  },
  {
    id: 't4',
    title: 'Passive Income System',
    platform: 'YouTube',
    prompt:
      'Person relaxing while income notifications pop up constantly, showing different revenue streams (affiliate, digital products, ads), money flowing in visualization, peaceful environment, beach or cafe setting',
  },
  {
    id: 't5',
    title: 'AI Copywriting Magic',
    platform: 'Twitter/X',
    prompt:
      'Before/after comparison: before = blank page, procrastination, writer\'s block. After = AI generates perfect copy instantly, showing actual high-converting headlines being generated in real-time',
  },
  {
    id: 't6',
    title: 'Social Media Domination',
    platform: 'TikTok',
    prompt:
      'Timelapse of Instagram feed growing: posts getting scheduled, comments flowing in, engagement metrics climbing exponentially, all automated through AI management system, dynamic pacing',
  },
  {
    id: 't7',
    title: 'Email Automation Success',
    platform: 'LinkedIn',
    prompt:
      'Professional dashboard showing email sequences running on autopilot, open rates climbing, conversion metrics increasing, showing how AI personalizes each email, business growth visualization',
  },
  {
    id: 't8',
    title: 'Video Editing Speed Run',
    platform: 'Instagram',
    prompt:
      '60-second transformation: raw footage → fully edited, captioned, color-graded professional video using AI editing tools, B-roll being auto-selected and added, transitions applied automatically',
  },
  {
    id: 't9',
    title: 'Personal Brand Building',
    platform: 'Twitter/X',
    prompt:
      'Content creator establishing authority: posting daily insights, audience growing, verification badge appearing, brand sponsorships rolling in, all powered by AI content system',
  },
  {
    id: 't10',
    title: 'E-Commerce Automation',
    platform: 'YouTube',
    prompt:
      'Shopify store running 24/7 with AI managing product descriptions, customer service chatbot handling inquiries, inventory auto-updating, orders being fulfilled automatically, revenue dashboard',
  },
  {
    id: 't11',
    title: 'Influencer Dashboard',
    platform: 'TikTok',
    prompt:
      'Creator looking at analytics: follower growth spike, viral video trending, brand deal notifications incoming, all because of AI optimization, celebrating success moment',
  },
  {
    id: 't12',
    title: 'SEO Automation Blueprint',
    platform: 'LinkedIn',
    prompt:
      'Website ranking progression: week 1 on page 5 → week 4 on page 1 for high-value keywords using AI-powered SEO tool, traffic graph shooting up, organic leads multiplying',
  },
  {
    id: 't13',
    title: 'Lead Generation Machine',
    platform: 'Twitter/X',
    prompt:
      'Sales funnel visualization: cold prospects → qualified leads → customers, AI handling each stage, showing conversion rate improvement, closing deals on autopilot',
  },
  {
    id: 't14',
    title: 'Content Batching Mastery',
    platform: 'Instagram',
    prompt:
      'Creator batching 30 days of content in one afternoon: filming, scripting, scheduling all at once using AI assistance, showing calendar filled with scheduled posts, time freedom achieved',
  },
  {
    id: 't15',
    title: 'Podcast Monetization',
    platform: 'YouTube',
    prompt:
      'Podcast production workflow: recording → AI transcription → show notes → YouTube video → social clips all auto-generated, multiple revenue streams flowing in (sponsorships, Patreon, ads)',
  },
  {
    id: 't16',
    title: 'Affiliate Marketing Scale',
    platform: 'TikTok',
    prompt:
      'Promoting product through 10 different angles simultaneously, each video optimized by AI for platform, commission notifications stacking up, showing passive commission structure',
  },
  {
    id: 't17',
    title: 'Community Building Engine',
    platform: 'Twitter/X',
    prompt:
      'Discord/community server showing 1000+ members, engagement happening constantly, AI moderating discussions, valuable resources shared daily, monetization through premium tier',
  },
  {
    id: 't18',
    title: 'Course Creation Pipeline',
    platform: 'LinkedIn',
    prompt:
      'Professional creating online course: AI generates lesson outlines, writes scripts, creates video transcripts, builds marketing copy, all pieces connecting into $997 course ready to launch',
  },
  {
    id: 't19',
    title: 'Client Acquisition System',
    platform: 'Instagram',
    prompt:
      'Service provider\'s DM getting flooded with client inquiries, qualifying them through AI chatbot, closing high-ticket clients ($5k+), showing pipeline of deals coming in consistently',
  },
  {
    id: 't20',
    title: 'Arbitrage Trading Bot',
    platform: 'YouTube',
    prompt:
      'Trading bot dashboard detecting arbitrage opportunities across markets, executing trades in microseconds, profit notifications popping up, account balance growing in real-time graph',
  },
]

// ─── Global State ────────────────────────────────────────────────────────────

let globalState: AutoRunnerState = {
  running: false,
  cycleCount: 0,
  todayGenerated: 0,
  todayReady: 0,
  todayPosted: 0,
  todayErrors: 0,
  lastCycleAt: null,
  nextCycleAt: null,
  log: [],
  dailyGoal: 50,
}

let intervalId: NodeJS.Timeout | null = null
let lastResetDate = new Date().toDateString()

// ─── Logger ──────────────────────────────────────────────────────────────────

function log(msg: string, level: 'info' | 'error' | 'success' = 'info'): void {
  const ts = new Date().toISOString().slice(11, 19)
  const entry = { ts, msg, level }

  globalState.log.push(entry)

  // Keep only last 100 log entries
  if (globalState.log.length > 100) {
    globalState.log = globalState.log.slice(-100)
  }

  const prefix = level === 'error' ? '[ERROR]' : level === 'success' ? '[SUCCESS]' : '[INFO]'
  console.log(`[AutoRunner][${ts}] ${prefix} ${msg}`)
}

// ─── Daily Reset ─────────────────────────────────────────────────────────────

function checkAndResetDaily(): void {
  const today = new Date().toDateString()
  if (today !== lastResetDate) {
    globalState.todayGenerated = 0
    globalState.todayReady = 0
    globalState.todayPosted = 0
    globalState.todayErrors = 0
    lastResetDate = today
    log(`Daily reset for ${today}`, 'success')
  }
}

// ─── Get Today's Stats from Supabase ──────────────────────────────────────────

export async function getTodayStats(): Promise<{
  generated: number
  ready: number
  posted: number
  errors: number
}> {
  try {
    const today = new Date().toISOString().split('T')[0]
    const { data, error } = await supabase
      .from('ugc_creatives')
      .select('status')
      .gte('created_at', `${today}T00:00:00`)
      .lt('created_at', `${today}T23:59:59`)

    if (error) {
      log(`getTodayStats error: ${error.message}`, 'error')
      return { generated: 0, ready: 0, posted: 0, errors: 0 }
    }

    const stats = {
      generated: data?.length || 0,
      ready: data?.filter((d) => d.status === 'ready').length || 0,
      posted: data?.filter((d) => d.status === 'posted').length || 0,
      errors: data?.filter((d) => d.status === 'error').length || 0,
    }

    globalState.todayGenerated = stats.generated
    globalState.todayReady = stats.ready
    globalState.todayPosted = stats.posted
    globalState.todayErrors = stats.errors

    return stats
  } catch (err) {
    log(`getTodayStats exception: ${err instanceof Error ? err.message : String(err)}`, 'error')
    return { generated: 0, ready: 0, posted: 0, errors: 0 }
  }
}

// ─── Pick Random Templates ───────────────────────────────────────────────────

function pickRandomTemplates(count: number): Template[] {
  const picked: Template[] = []
  const indices = new Set<number>()

  while (picked.length < count && picked.length < CREATIVE_TEMPLATES.length) {
    const idx = Math.floor(Math.random() * CREATIVE_TEMPLATES.length)
    if (!indices.has(idx)) {
      indices.add(idx)
      picked.push(CREATIVE_TEMPLATES[idx])
    }
  }

  return picked
}

// ─── Create Creative Row ──────────────────────────────────────────────────────

async function createCreativeRow(
  template: Template
): Promise<string | null> {
  try {
    // Build caption with viral engine
    const captionResult = buildCaption({
      title: template.title,
      platform: template.platform,
      prompt: template.prompt,
    })

    // Insert draft row
    const { data, error } = await supabase
      .from('ugc_creatives')
      .insert({
        title: template.title,
        platform: template.platform,
        tool: 'Kling',
        status: 'draft',
        views: 0,
        ctr: 0,
        roas: 0,
        caption: captionResult.caption,
        hooks: captionResult.hooks,
        hook_used: captionResult.hookUsed,
        cta_used: captionResult.ctaUsed,
        hook_score: captionResult.hookScore,
        api_provider: 'kling',
        generation_prompt: template.prompt,
      })
      .select('id')
      .single()

    if (error) {
      log(`Failed to create creative row: ${error.message}`, 'error')
      return null
    }

    log(`Created creative row: ${data?.id}`, 'info')
    return data?.id || null
  } catch (err) {
    log(`createCreativeRow exception: ${err instanceof Error ? err.message : String(err)}`, 'error')
    return null
  }
}

// ─── Run Single Cycle ─────────────────────────────────────────────────────────

export async function runCycle(onUpdate: (state: AutoRunnerState) => void): Promise<void> {
  checkAndResetDaily()

  // FAILSAFE: Fix any stuck creatives before starting new cycle
  await fixStuckCreatives()

  globalState.cycleCount += 1
  globalState.lastCycleAt = new Date().toISOString()
  globalState.nextCycleAt = new Date(Date.now() + 180000).toISOString() // 3 min ahead

  log(`Cycle ${globalState.cycleCount} starting`, 'info')

  // Check if daily goal is reached
  if (globalState.todayPosted >= globalState.dailyGoal) {
    log(`Daily goal (${globalState.dailyGoal}) reached, pausing cycle`, 'success')
    globalState.running = false
    onUpdate(globalState)
    return
  }

  // Pick 3 random templates
  const templates = pickRandomTemplates(3)

  for (const template of templates) {
    try {
      // Step 1: Create creative row with caption
      const creativeId = await createCreativeRow(template)
      if (!creativeId) {
        globalState.todayErrors += 1
        continue
      }

      globalState.todayGenerated += 1
      onUpdate(globalState)

      // Step 2: Generate and save video
      try {
        log(`Generating video for ${creativeId} (${template.title})`, 'info')

        await generateAndSaveCreative({
          creativeId,
          prompt: template.prompt,
          duration: '5',
          mode: 'std',
          aspect_ratio: '16:9',
          onPipelineStatus: (status) => {
            log(`Pipeline: ${status.message}`, 'info')
          },
        })

        globalState.todayReady += 1
        log(`Video generated and saved for ${creativeId}`, 'success')
        onUpdate(globalState)

        // Step 3: Try to post to Twitter
        try {
          log(`Posting to Twitter for ${creativeId}`, 'info')

          const result = await postToTwitter(creativeId)

          if (result.success) {
            globalState.todayPosted += 1
            log(`Posted to Twitter: ${result.post_url}`, 'success')

            // Mark as posted in DB
            await supabase
              .from('ugc_creatives')
              .update({ status: 'posted' })
              .eq('id', creativeId)
          } else {
            log(`Twitter post failed: ${result.error}, marked as ready for manual posting`, 'error')
            // Keep as ready — manual post queue will handle it
          }
        } catch (twitterErr) {
          log(
            `Twitter posting exception: ${twitterErr instanceof Error ? twitterErr.message : String(twitterErr)}`,
            'error'
          )
          // Keep as ready — manual queue will handle
        }

        onUpdate(globalState)
      } catch (genErr) {
        // Generation failed, mark error and retry once
        const errMsg = genErr instanceof Error ? genErr.message : String(genErr)
        log(`Generation failed (${errMsg}), marking error status`, 'error')

        globalState.todayErrors += 1

        // Mark as error
        await supabase
          .from('ugc_creatives')
          .update({ status: 'error' })
          .eq('id', creativeId)

        onUpdate(globalState)
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      log(`Cycle template processing error: ${errMsg}`, 'error')
      globalState.todayErrors += 1
      onUpdate(globalState)
    }
  }

  log(
    `Cycle ${globalState.cycleCount} complete: ${globalState.todayGenerated} generated, ${globalState.todayPosted} posted`,
    'success'
  )
  onUpdate(globalState)
}

// ─── FAILSAFE: Fix stuck creatives (testing for >60s with video → ready) ────

async function fixStuckCreatives(): Promise<void> {
  try {
    // Any creative in 'testing' with a video_url → force to ready
    const { data: stuck } = await supabase
      .from('ugc_creatives')
      .select('id')
      .eq('status', 'testing')
      .not('video_url', 'is', null)

    if (stuck && stuck.length > 0) {
      for (const row of stuck) {
        await supabase.from('ugc_creatives')
          .update({ status: 'ready', updated_at: new Date().toISOString() })
          .eq('id', row.id)
        log(`FAILSAFE: Fixed stuck creative ${row.id} → ready`, 'success')
      }
    }

    // Any creative in 'testing' without video_url, older than 2 min → error
    const twoMinAgo = new Date(Date.now() - 120000).toISOString()
    const { data: staleTests } = await supabase
      .from('ugc_creatives')
      .select('id')
      .eq('status', 'testing')
      .is('video_url', null)
      .lt('created_at', twoMinAgo)

    if (staleTests && staleTests.length > 0) {
      for (const row of staleTests) {
        await supabase.from('ugc_creatives')
          .update({ status: 'error', updated_at: new Date().toISOString() })
          .eq('id', row.id)
        log(`FAILSAFE: Timed out creative ${row.id} → error`, 'error')
      }
    }
  } catch {
    // silently ignore failsafe errors
  }
}

// ─── Start Auto Runner ────────────────────────────────────────────────────────

export interface AutoRunnerController {
  stop: () => void
  getState: () => AutoRunnerState
  runCycleManually: () => Promise<void>
}

export function startAutoRunner(opts: RunnerOptions): AutoRunnerController {
  if (globalState.running) {
    log('Auto runner already running', 'error')
    return {
      stop: () => {},
      getState: () => globalState,
      runCycleManually: async () => {},
    }
  }

  globalState.running = true
  globalState.dailyGoal = opts.dailyGoal
  globalState.cycleCount = 0
  globalState.log = []

  // Load today's stats
  getTodayStats().then(() => opts.onUpdate(globalState))

  log(`Auto runner started (interval: ${opts.intervalMs}ms, goal: ${opts.dailyGoal}/day)`, 'success')

  // Run first cycle immediately
  runCycle(opts.onUpdate).catch((err) => {
    log(`First cycle error: ${err instanceof Error ? err.message : String(err)}`, 'error')
  })

  // Schedule recurring cycles
  intervalId = setInterval(() => {
    if (globalState.running && globalState.todayPosted < globalState.dailyGoal) {
      runCycle(opts.onUpdate).catch((err) => {
        log(`Cycle error: ${err instanceof Error ? err.message : String(err)}`, 'error')
      })
    }
  }, opts.intervalMs)

  return {
    stop: () => {
      globalState.running = false
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
      log('Auto runner stopped', 'success')
      opts.onUpdate(globalState)
    },

    getState: () => globalState,

    runCycleManually: async () => {
      log('Manual cycle triggered', 'info')
      await runCycle(opts.onUpdate)
    },
  }
}

// ─── Stop Auto Runner (for cleanup) ───────────────────────────────────────────

export function stopAutoRunner(): void {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
  globalState.running = false
  log('Auto runner stopped', 'success')
}

// ─── Get Current State ────────────────────────────────────────────────────────

export function getAutoRunnerState(): AutoRunnerState {
  return globalState
}

// ─── Reset State (for testing) ────────────────────────────────────────────────

export function resetAutoRunnerState(): void {
  globalState = {
    running: false,
    cycleCount: 0,
    todayGenerated: 0,
    todayReady: 0,
    todayPosted: 0,
    todayErrors: 0,
    lastCycleAt: null,
    nextCycleAt: null,
    log: [],
    dailyGoal: 50,
  }
  lastResetDate = new Date().toDateString()
  log('State reset for testing', 'info')
}
