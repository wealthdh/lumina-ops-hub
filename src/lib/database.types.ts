// Auto-generated Supabase database types
// Run: npx supabase gen types typescript --linked > src/lib/database.types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      ops_jobs: {
        Row: {
          id: string
          name: string
          category: string
          status: string
          daily_profit: number
          monthly_profit: number
          projected_monthly: number
          synergy_score: number
          risk_score: number
          roi: number
          cash_out_url: string | null
          clone_url: string | null
          created_at: string
          last_activity: string
          user_id: string
        }
        Insert: Omit<Database['public']['Tables']['ops_jobs']['Row'], 'created_at'>
        Update: Partial<Database['public']['Tables']['ops_jobs']['Insert']>
      }
      mt5_accounts: {
        Row: {
          account_id: string
          balance: number
          equity: number
          margin: number
          free_margin: number
          margin_level: number
          profit: number
          day_pnl: number
          week_pnl: number
          month_pnl: number
          updated_at: string
          user_id: string
        }
        Insert: Omit<Database['public']['Tables']['mt5_accounts']['Row'], 'updated_at'>
        Update: Partial<Database['public']['Tables']['mt5_accounts']['Insert']>
      }
      mt5_trades: {
        Row: {
          ticket: number
          symbol: string
          type: string
          volume: number
          open_price: number
          current_price: number
          profit: number
          open_time: string
          sl: number
          tp: number
          account_id: string
          user_id: string
        }
        Insert: Database['public']['Tables']['mt5_trades']['Row']
        Update: Partial<Database['public']['Tables']['mt5_trades']['Insert']>
      }
      auto_tasks: {
        Row: {
          id: string
          job_id: string
          title: string
          priority: string
          status: string
          assigned_to: string | null
          due_at: string | null
          estimated_minutes: number | null
          created_at: string
          user_id: string
        }
        Insert: Omit<Database['public']['Tables']['auto_tasks']['Row'], 'created_at'>
        Update: Partial<Database['public']['Tables']['auto_tasks']['Insert']>
      }
      poly_markets: {
        Row: {
          id: string
          question: string
          slug: string
          end_date: string
          volume: number
          liquidity: number
          outcomes: Json
          category: string
          active: boolean
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['poly_markets']['Row'], 'updated_at'>
        Update: Partial<Database['public']['Tables']['poly_markets']['Insert']>
      }
      poly_positions: {
        Row: {
          id: string
          market_id: string
          question: string
          outcome: string
          shares: number
          avg_price: number
          current_price: number
          unrealized_pnl: number
          user_id: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['poly_positions']['Row'], 'updated_at'>
        Update: Partial<Database['public']['Tables']['poly_positions']['Insert']>
      }
      arbitrage_signals: {
        Row: {
          id: string
          type: string
          description: string
          expected_edge: number
          confidence: number
          required_capital: number
          time_to_expiry: number
          status: string
          mt5_symbol: string | null
          polymarket_id: string | null
          created_at: string
          user_id: string
        }
        Insert: Omit<Database['public']['Tables']['arbitrage_signals']['Row'], 'created_at'>
        Update: Partial<Database['public']['Tables']['arbitrage_signals']['Insert']>
      }
      tax_entries: {
        Row: {
          id: string
          date: string
          amount: number
          description: string
          category: string
          source: string
          deductible: boolean
          tax_pot_contribution: number
          user_id: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['tax_entries']['Row'], 'created_at'>
        Update: Partial<Database['public']['Tables']['tax_entries']['Insert']>
      }
      tax_pot: {
        Row: {
          id: string
          balance: number
          target_rate: number
          quarterly_estimate: number
          next_due_date: string
          ytd_income: number
          ytd_set_aside: number
          projected_tax_bill: number
          user_id: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['tax_pot']['Row'], 'updated_at'>
        Update: Partial<Database['public']['Tables']['tax_pot']['Insert']>
      }
      leads: {
        Row: {
          id: string
          name: string
          email: string
          company: string | null
          source: string
          score: number
          stage: string
          estimated_value: number
          proposal_url: string | null
          contract_url: string | null
          invoice_url: string | null
          loom_url: string | null
          created_at: string
          last_contact: string
          user_id: string
        }
        Insert: Omit<Database['public']['Tables']['leads']['Row'], 'created_at'>
        Update: Partial<Database['public']['Tables']['leads']['Insert']>
      }
      daily_briefings: {
        Row: {
          id: string
          date: string
          summary: string
          audio_url: string | null
          top_priorities: string[]
          alerts: Json
          pnl_mt5: number
          pnl_poly: number
          pnl_total: number
          user_id: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['daily_briefings']['Row'], 'created_at'>
        Update: Partial<Database['public']['Tables']['daily_briefings']['Insert']>
      }
      allocation_rules: {
        Row: {
          id: string
          job_id: string
          job_name: string
          current_allocation: number
          recommended_allocation: number
          expected_return: number
          constraint: string
          user_id: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['allocation_rules']['Row'], 'updated_at'>
        Update: Partial<Database['public']['Tables']['allocation_rules']['Insert']>
      }
      synergy_links: {
        Row: {
          id: string
          job_a: string
          job_b: string
          synergy_type: string
          value: number
          description: string
          active: boolean
          user_id: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['synergy_links']['Row'], 'created_at'>
        Update: Partial<Database['public']['Tables']['synergy_links']['Insert']>
      }
      montecarlo_results: {
        Row: {
          id: string
          scenario: string
          p10: number
          p25: number
          p50: number
          p75: number
          p90: number
          max_drawdown: number
          sharpe: number
          runs: number
          user_id: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['montecarlo_results']['Row'], 'created_at'>
        Update: Partial<Database['public']['Tables']['montecarlo_results']['Insert']>
      }
      cashout_transactions: {
        Row: {
          id: string
          user_id: string
          method: string
          amount: number
          status: string
          tx_id: string | null
          job_id: string | null
          network: string | null
          to_address: string | null
          metadata: Json | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['cashout_transactions']['Row'], 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['cashout_transactions']['Insert']>
      }
      cashout_approvals: {
        Row: {
          id: string
          transaction_id: string
          user_id: string
          amount: number
          method: string
          status: string
          reason: string
          requested_at: string
          expires_at: string
        }
        Insert: Omit<Database['public']['Tables']['cashout_approvals']['Row'], 'requested_at'>
        Update: Partial<Database['public']['Tables']['cashout_approvals']['Insert']>
      }
      cashout_2fa_codes: {
        Row: {
          id: string
          user_id: string
          code_hash: string
          idempotency_key: string
          used: boolean
          expires_at: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['cashout_2fa_codes']['Row'], 'created_at'>
        Update: Partial<Database['public']['Tables']['cashout_2fa_codes']['Insert']>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
