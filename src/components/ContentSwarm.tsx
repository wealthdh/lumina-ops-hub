/**
 * AI UGC + Content Swarm Panel — HARDENED PIPELINE
 *
 * UGC → Kling → Supabase → Twitter
 *
 * Features:
 * - Visible pipeline status: Generating → Saving → Posting → Complete
 * - Retry logic (2x) on Kling + Twitter failures
 * - Supabase realtime auto-refresh after insert
 * - [UGC] logging at every step
 * - "Test Pipeline" button for full-flow verification
 */
import { useState, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import {
  Video, Zap, Globe, TrendingUp, Play, Plus, Search,
  ExternalLink, Trash2, Loader2, CheckCircle, AlertCircle,
  Film, TestTube2, ArrowRight, RefreshCw, XCircle,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  generateAndSaveCreative, checkKlingApiHealth,
  type PipelineStatus,
} from '../lib/ugcApi'
import {
  distributeToAll, postToTwitter,
  type DistributeResponse,
} from '../lib/distributeApi'
import clsx from 'clsx'ries({ queryKey: ['ugc_creatives'] })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [qc])

  return useQuery<UgcCreative[]>({
    queryKey: ['ugc_creatives'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ugc_creatives')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) {
        console.warn('[UGC] ugc_creatives query:', error.message)
        return []
      }
      return data ?? []
    },
    staleTime: 30_000,
  })
}

function useSeoKeywords() {
  return useQuery<SeoKeyword[]>({
    queryKey: ['seo_keywords'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('seo_keywords')
        .select('*')
        .order('position', { ascending: true, nullsFirst: false })
      if (error) {
        console.warn('[UGC] seo_keywords:', error.message)
        return []
      }
      return data ?? []
    },
    staleTime: 120_000,
  })
}

// ─── Generate Creative mutation ──────────────────────────────────────────────
function useGenerateCreative() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (opts: {
      title: string
      platform: string
      tool: string
      prompt?: string
      duration?: '5' | '10'
      mode?: 'std' | 'pro'
      aspect_ratio?: '16:9' | '9:16' | '1:1'
      onProgress?: (status: string) => void
      onPipelineStatus?: (status: PipelineStatus) => void
    }) => {
      ugcLog('start — inserting draft row')

      const { data: creative, error } = await supabase
        .from('ugc_creatives')
        .insert({
          title:             opts.title,
          platform:          opts.platform,
          status:            'draft',
          views:             0,
          ctr:               0,
          roas:              0,
          tool:              opts.tool,
          api_provider:      'kling',
          generation_prompt: opts.prompt || opts.title,
        })
        .select()
        .single()
      if (error) throw error

      ugcLog('draft row created', { id: creative.id, title: creative.title })

      if (opts.tool === 'Kling') {
        // Fire Kling generation — NOT detached, we await it for status tracking
        generateAndSaveCreative({
          creativeId: creative.id,
          prompt: opts.prompt || opts.title,
          duration: opts.duration || '5',
          mode: opts.mode || 'std',
          aspect_ratio: opts.aspect_ratio || '16:9',
          onProgress: opts.onProgress,
          onPipelineStatus: opts.onPipelineStatus,
        }).then(() => {
          qc.invalidateQueries({ queryKey: ['ugc_creatives'] })
        }).catch((err) => {
          ugcLog('pipeline error', { error: err.message, creativeId: creative.id })
          supabase
            .from('ugc_creatives')
            .update({ status: 'paused' })
            .eq('id', creative.id)
            .then(() => qc.invalidateQueries({ queryKey: ['ugc_creatives'] }))
        })
      }

      return creative
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ugc_creatives'] })
    },
  })
}

function useDeleteCreative() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ugc_creatives').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ugc_creatives'] }) },
  })
}

function useUpdateCreativeStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: UgcCreative['status'] }) => {
      const { error } = await supabase.from('ugc_creatives').update({ status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ugc_creatives'] }) },
  })
}

function useDistributeCreative() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (creativeId: string): Promise<DistributeResponse> => {
      const result = await distrib
