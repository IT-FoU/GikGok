export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      achievement_unlocks: {
        Row: {
          achievement_id: string
          id: string
          player_id: string
          reward_ledger_id: string | null
          unlocked_at: string
        }
        Insert: {
          achievement_id: string
          id?: string
          player_id: string
          reward_ledger_id?: string | null
          unlocked_at?: string
        }
        Update: {
          achievement_id?: string
          id?: string
          player_id?: string
          reward_ledger_id?: string | null
          unlocked_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "achievement_unlocks_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "achievement_unlocks_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "achievement_unlocks_reward_ledger_id_fkey"
            columns: ["reward_ledger_id"]
            isOneToOne: false
            referencedRelation: "gik_ledger"
            referencedColumns: ["id"]
          },
        ]
      }
      achievements: {
        Row: {
          created_at: string
          criteria: Json
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          key: string
          name: string
          reward_amount: number
        }
        Insert: {
          created_at?: string
          criteria?: Json
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          key: string
          name: string
          reward_amount?: number
        }
        Update: {
          created_at?: string
          criteria?: Json
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          key?: string
          name?: string
          reward_amount?: number
        }
        Relationships: []
      }
      admin_roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          key: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          key: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          key?: string
          name?: string
        }
        Relationships: []
      }
      admin_security: {
        Row: {
          admin_id: string
          pin_hash: string | null
          totp_enabled: boolean
          totp_secret: string | null
          updated_at: string
        }
        Insert: {
          admin_id: string
          pin_hash?: string | null
          totp_enabled?: boolean
          totp_secret?: string | null
          updated_at?: string
        }
        Update: {
          admin_id?: string
          pin_hash?: string | null
          totp_enabled?: boolean
          totp_secret?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_security_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: true
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_user_permissions: {
        Row: {
          admin_id: string
          granted: boolean
          permission: Database["public"]["Enums"]["app_permission"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          admin_id: string
          granted?: boolean
          permission: Database["public"]["Enums"]["app_permission"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          admin_id?: string
          granted?: boolean
          permission?: Database["public"]["Enums"]["app_permission"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_user_permissions_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_user_roles: {
        Row: {
          admin_id: string
          assigned_at: string
          assigned_by: string | null
          role_id: string
        }
        Insert: {
          admin_id: string
          assigned_at?: string
          assigned_by?: string | null
          role_id: string
        }
        Update: {
          admin_id?: string
          assigned_at?: string
          assigned_by?: string | null
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_user_roles_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "admin_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_users: {
        Row: {
          approval_limit: number | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          is_owner: boolean
          requires_2fa: boolean
          requires_pin: boolean
          updated_at: string
        }
        Insert: {
          approval_limit?: number | null
          created_at?: string
          created_by?: string | null
          id: string
          is_active?: boolean
          is_owner?: boolean
          requires_2fa?: boolean
          requires_pin?: boolean
          updated_at?: string
        }
        Update: {
          approval_limit?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_owner?: boolean
          requires_2fa?: boolean
          requires_pin?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      announcement_reads: {
        Row: {
          announcement_id: string
          dismissed_at: string | null
          player_id: string
          read_at: string
        }
        Insert: {
          announcement_id: string
          dismissed_at?: string | null
          player_id: string
          read_at?: string
        }
        Update: {
          announcement_id?: string
          dismissed_at?: string | null
          player_id?: string
          read_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reads_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_reads_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          audience: Database["public"]["Enums"]["announcement_audience"]
          body: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_published: boolean
          publish_at: string | null
          target: Json
          title: string
          updated_at: string
        }
        Insert: {
          audience?: Database["public"]["Enums"]["announcement_audience"]
          body: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_published?: boolean
          publish_at?: string | null
          target?: Json
          title: string
          updated_at?: string
        }
        Update: {
          audience?: Database["public"]["Enums"]["announcement_audience"]
          body?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_published?: boolean
          publish_at?: string | null
          target?: Json
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      asset_metadata: {
        Row: {
          bucket: string
          created_at: string
          created_by: string | null
          game_id: string | null
          id: string
          kind: string
          metadata: Json
          path: string
        }
        Insert: {
          bucket: string
          created_at?: string
          created_by?: string | null
          game_id?: string | null
          id?: string
          kind: string
          metadata?: Json
          path: string
        }
        Update: {
          bucket?: string
          created_at?: string
          created_by?: string | null
          game_id?: string | null
          id?: string
          kind?: string
          metadata?: Json
          path?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_metadata_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          after_value: Json | null
          approval_chain: Json | null
          before_value: Json | null
          created_at: string
          id: string
          metadata: Json
          reason: string | null
          result: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_value?: Json | null
          approval_chain?: Json | null
          before_value?: Json | null
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string | null
          result?: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_value?: Json | null
          approval_chain?: Json | null
          before_value?: Json | null
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string | null
          result?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      bet_outcomes: {
        Row: {
          bet_id: string
          created_at: string
          detail: Json
          id: string
          is_win: boolean
          multiplier: number
          round_id: string
          total_return: number
        }
        Insert: {
          bet_id: string
          created_at?: string
          detail?: Json
          id?: string
          is_win: boolean
          multiplier?: number
          round_id: string
          total_return?: number
        }
        Update: {
          bet_id?: string
          created_at?: string
          detail?: Json
          id?: string
          is_win?: boolean
          multiplier?: number
          round_id?: string
          total_return?: number
        }
        Relationships: [
          {
            foreignKeyName: "bet_outcomes_bet_id_fkey"
            columns: ["bet_id"]
            isOneToOne: true
            referencedRelation: "bets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bet_outcomes_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "game_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      bets: {
        Row: {
          created_at: string
          debit_ledger_id: string | null
          game_id: string
          game_version_id: string
          id: string
          idempotency_key: string
          is_win: boolean | null
          mode: Database["public"]["Enums"]["game_mode"]
          payout_ledger_id: string | null
          placed_at: string
          player_id: string
          round_id: string
          selection: Json
          settled_at: string | null
          stake: number
          status: Database["public"]["Enums"]["bet_status"]
          total_return: number
        }
        Insert: {
          created_at?: string
          debit_ledger_id?: string | null
          game_id: string
          game_version_id: string
          id?: string
          idempotency_key: string
          is_win?: boolean | null
          mode?: Database["public"]["Enums"]["game_mode"]
          payout_ledger_id?: string | null
          placed_at?: string
          player_id: string
          round_id: string
          selection: Json
          settled_at?: string | null
          stake: number
          status?: Database["public"]["Enums"]["bet_status"]
          total_return?: number
        }
        Update: {
          created_at?: string
          debit_ledger_id?: string | null
          game_id?: string
          game_version_id?: string
          id?: string
          idempotency_key?: string
          is_win?: boolean | null
          mode?: Database["public"]["Enums"]["game_mode"]
          payout_ledger_id?: string | null
          placed_at?: string
          player_id?: string
          round_id?: string
          selection?: Json
          settled_at?: string | null
          stake?: number
          status?: Database["public"]["Enums"]["bet_status"]
          total_return?: number
        }
        Relationships: [
          {
            foreignKeyName: "bets_debit_ledger_id_fkey"
            columns: ["debit_ledger_id"]
            isOneToOne: false
            referencedRelation: "gik_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bets_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bets_game_version_id_fkey"
            columns: ["game_version_id"]
            isOneToOne: false
            referencedRelation: "game_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bets_payout_ledger_id_fkey"
            columns: ["payout_ledger_id"]
            isOneToOne: false
            referencedRelation: "gik_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bets_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bets_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "game_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_request_reviews: {
        Row: {
          bonus_amount: number
          created_at: string
          decision: Database["public"]["Enums"]["credit_request_status"]
          fee_amount: number | null
          fee_percent: number | null
          gross_amount: number | null
          id: string
          is_second_approval: boolean
          net_amount: number | null
          reason: string
          request_id: string
          reviewer_id: string
        }
        Insert: {
          bonus_amount?: number
          created_at?: string
          decision: Database["public"]["Enums"]["credit_request_status"]
          fee_amount?: number | null
          fee_percent?: number | null
          gross_amount?: number | null
          id?: string
          is_second_approval?: boolean
          net_amount?: number | null
          reason: string
          request_id: string
          reviewer_id: string
        }
        Update: {
          bonus_amount?: number
          created_at?: string
          decision?: Database["public"]["Enums"]["credit_request_status"]
          fee_amount?: number | null
          fee_percent?: number | null
          gross_amount?: number | null
          id?: string
          is_second_approval?: boolean
          net_amount?: number | null
          reason?: string
          request_id?: string
          reviewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_request_reviews_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "credit_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_requests: {
        Row: {
          created_at: string
          id: string
          note: string | null
          player_id: string
          requested_amount: number
          status: Database["public"]["Enums"]["credit_request_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          player_id: string
          requested_amount: number
          status?: Database["public"]["Enums"]["credit_request_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          player_id?: string
          requested_amount?: number
          status?: Database["public"]["Enums"]["credit_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_requests_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_reward_claims: {
        Row: {
          base_amount: number
          claimed_on: string
          created_at: string
          id: string
          ledger_id: string | null
          player_id: string
          streak_bonus: number
          streak_day: number
          total_amount: number
        }
        Insert: {
          base_amount: number
          claimed_on: string
          created_at?: string
          id?: string
          ledger_id?: string | null
          player_id: string
          streak_bonus?: number
          streak_day: number
          total_amount: number
        }
        Update: {
          base_amount?: number
          claimed_on?: string
          created_at?: string
          id?: string
          ledger_id?: string | null
          player_id?: string
          streak_bonus?: number
          streak_day?: number
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_reward_claims_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "gik_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_reward_claims_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          audience: Json
          description: string | null
          is_enabled: boolean
          key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          audience?: Json
          description?: string | null
          is_enabled?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          audience?: Json
          description?: string | null
          is_enabled?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: Database["public"]["Enums"]["friendship_status"]
          updated_at: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          status?: Database["public"]["Enums"]["friendship_status"]
          updated_at?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          status?: Database["public"]["Enums"]["friendship_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_addressee_id_fkey"
            columns: ["addressee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      game_release_events: {
        Row: {
          actor_id: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["game_status"] | null
          game_id: string
          id: string
          note: string | null
          to_status: Database["public"]["Enums"]["game_status"]
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["game_status"] | null
          game_id: string
          id?: string
          note?: string | null
          to_status: Database["public"]["Enums"]["game_status"]
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["game_status"] | null
          game_id?: string
          id?: string
          note?: string | null
          to_status?: Database["public"]["Enums"]["game_status"]
        }
        Relationships: [
          {
            foreignKeyName: "game_release_events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_rounds: {
        Row: {
          controlled_by: string | null
          created_at: string
          game_id: string
          game_version_id: string
          id: string
          mode: Database["public"]["Enums"]["game_mode"]
          opened_at: string
          result: Json | null
          settled_at: string | null
          status: Database["public"]["Enums"]["round_status"]
        }
        Insert: {
          controlled_by?: string | null
          created_at?: string
          game_id: string
          game_version_id: string
          id?: string
          mode?: Database["public"]["Enums"]["game_mode"]
          opened_at?: string
          result?: Json | null
          settled_at?: string | null
          status?: Database["public"]["Enums"]["round_status"]
        }
        Update: {
          controlled_by?: string | null
          created_at?: string
          game_id?: string
          game_version_id?: string
          id?: string
          mode?: Database["public"]["Enums"]["game_mode"]
          opened_at?: string
          result?: Json | null
          settled_at?: string | null
          status?: Database["public"]["Enums"]["round_status"]
        }
        Relationships: [
          {
            foreignKeyName: "game_rounds_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_rounds_game_version_id_fkey"
            columns: ["game_version_id"]
            isOneToOne: false
            referencedRelation: "game_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      game_versions: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          game_id: string
          id: string
          is_published: boolean
          notes: string | null
          version: number
        }
        Insert: {
          config: Json
          created_at?: string
          created_by?: string | null
          game_id: string
          id?: string
          is_published?: boolean
          notes?: string | null
          version: number
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          game_id?: string
          id?: string
          is_published?: boolean
          notes?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_versions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_rate_limits: {
        Row: {
          bucket: string
          created_at: string
          id: string
          player_id: string
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: string
          player_id: string
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_rate_limits_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          active_version_id: string | null
          created_at: string
          description: string | null
          id: string
          is_enabled: boolean
          key: string
          maintenance_message: string | null
          max_stake: number | null
          min_stake: number
          name: string
          quick_stakes: number[]
          renderer: string
          scheduled_launch_at: string | null
          status: Database["public"]["Enums"]["game_status"]
          updated_at: string
        }
        Insert: {
          active_version_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          key: string
          maintenance_message?: string | null
          max_stake?: number | null
          min_stake?: number
          name: string
          quick_stakes?: number[]
          renderer?: string
          scheduled_launch_at?: string | null
          status?: Database["public"]["Enums"]["game_status"]
          updated_at?: string
        }
        Update: {
          active_version_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          key?: string
          maintenance_message?: string | null
          max_stake?: number | null
          min_stake?: number
          name?: string
          quick_stakes?: number[]
          renderer?: string
          scheduled_launch_at?: string | null
          status?: Database["public"]["Enums"]["game_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "games_active_version_id_fkey"
            columns: ["active_version_id"]
            isOneToOne: false
            referencedRelation: "game_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      gik_ledger: {
        Row: {
          actor_id: string | null
          amount: number
          balance_after: number
          created_at: string
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          id: string
          metadata: Json
          player_id: string
          reason: string | null
          reference_id: string | null
          seq: number
          source: string | null
        }
        Insert: {
          actor_id?: string | null
          amount: number
          balance_after: number
          created_at?: string
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          id?: string
          metadata?: Json
          player_id: string
          reason?: string | null
          reference_id?: string | null
          seq?: never
          source?: string | null
        }
        Update: {
          actor_id?: string | null
          amount?: number
          balance_after?: number
          created_at?: string
          entry_type?: Database["public"]["Enums"]["ledger_entry_type"]
          id?: string
          metadata?: Json
          player_id?: string
          reason?: string | null
          reference_id?: string | null
          seq?: never
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gik_ledger_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          code: string
          created_at: string
          id: string
          invitee_contact: string | null
          inviter_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          code: string
          created_at?: string
          id?: string
          invitee_contact?: string | null
          inviter_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          code?: string
          created_at?: string
          id?: string
          invitee_contact?: string | null
          inviter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_inviter_id_fkey"
            columns: ["inviter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_entries: {
        Row: {
          avatar_url: string | null
          board: Database["public"]["Enums"]["leaderboard_board"]
          id: string
          metric_value: number
          nickname: string
          player_id: string
          rank: number
          snapshot_at: string
        }
        Insert: {
          avatar_url?: string | null
          board: Database["public"]["Enums"]["leaderboard_board"]
          id?: string
          metric_value?: number
          nickname: string
          player_id: string
          rank: number
          snapshot_at?: string
        }
        Update: {
          avatar_url?: string | null
          board?: Database["public"]["Enums"]["leaderboard_board"]
          id?: string
          metric_value?: number
          nickname?: string
          player_id?: string
          rank?: number
          snapshot_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_entries_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_state: {
        Row: {
          ended_at: string | null
          id: boolean
          is_maintenance: boolean
          message: string | null
          started_at: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ended_at?: string | null
          id?: boolean
          is_maintenance?: boolean
          message?: string | null
          started_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ended_at?: string | null
          id?: boolean
          is_maintenance?: boolean
          message?: string | null
          started_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      mission_progress: {
        Row: {
          completed_at: string | null
          id: string
          is_completed: boolean
          mission_id: string
          player_id: string
          progress: number
          reward_ledger_id: string | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          id?: string
          is_completed?: boolean
          mission_id: string
          player_id: string
          progress?: number
          reward_ledger_id?: string | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          is_completed?: boolean
          mission_id?: string
          player_id?: string
          progress?: number
          reward_ledger_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_progress_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_progress_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_progress_reward_ledger_id_fkey"
            columns: ["reward_ledger_id"]
            isOneToOne: false
            referencedRelation: "gik_ledger"
            referencedColumns: ["id"]
          },
        ]
      }
      missions: {
        Row: {
          created_at: string
          description: string | null
          ends_at: string | null
          game_id: string | null
          goal_target: number
          goal_type: string
          id: string
          is_active: boolean
          key: string
          name: string
          reward_amount: number
          scope: Database["public"]["Enums"]["mission_scope"]
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          ends_at?: string | null
          game_id?: string | null
          goal_target: number
          goal_type: string
          id?: string
          is_active?: boolean
          key: string
          name: string
          reward_amount?: number
          scope?: Database["public"]["Enums"]["mission_scope"]
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          ends_at?: string | null
          game_id?: string | null
          goal_target?: number
          goal_type?: string
          id?: string
          is_active?: boolean
          key?: string
          name?: string
          reward_amount?: number
          scope?: Database["public"]["Enums"]["mission_scope"]
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "missions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json
          id: string
          is_read: boolean
          player_id: string
          read_at: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          is_read?: boolean
          player_id: string
          read_at?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          is_read?: boolean
          player_id?: string
          read_at?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Relationships: [
          {
            foreignKeyName: "notifications_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_health_events: {
        Row: {
          created_at: string
          data: Json
          id: string
          level: string
          message: string
          source: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          level: string
          message: string
          source: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          level?: string
          message?: string
          source?: string
        }
        Relationships: []
      }
      player_balances: {
        Row: {
          balance: number
          lifetime_credited: number
          lifetime_debited: number
          player_id: string
          total_wagered: number
          total_won: number
          updated_at: string
        }
        Insert: {
          balance?: number
          lifetime_credited?: number
          lifetime_debited?: number
          player_id: string
          total_wagered?: number
          total_won?: number
          updated_at?: string
        }
        Update: {
          balance?: number
          lifetime_credited?: number
          lifetime_debited?: number
          player_id?: string
          total_wagered?: number
          total_won?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_balances_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_contacts: {
        Row: {
          contact_type: Database["public"]["Enums"]["contact_type"]
          created_at: string
          id: string
          is_primary: boolean
          is_verified: boolean
          player_id: string
          updated_at: string
          value: string
          verified_at: string | null
        }
        Insert: {
          contact_type: Database["public"]["Enums"]["contact_type"]
          created_at?: string
          id?: string
          is_primary?: boolean
          is_verified?: boolean
          player_id: string
          updated_at?: string
          value: string
          verified_at?: string | null
        }
        Update: {
          contact_type?: Database["public"]["Enums"]["contact_type"]
          created_at?: string
          id?: string
          is_primary?: boolean
          is_verified?: boolean
          player_id?: string
          updated_at?: string
          value?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_contacts_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_settings: {
        Row: {
          effects_enabled: boolean
          fps_cap: number
          graphics_mode: Database["public"]["Enums"]["graphics_mode"]
          graphics_quality: Database["public"]["Enums"]["graphics_quality"]
          language: Database["public"]["Enums"]["app_language"]
          player_id: string
          reduce_motion: boolean
          shadows_enabled: boolean
          sound_pack: Database["public"]["Enums"]["sound_pack"]
          sound_volume: number
          updated_at: string
        }
        Insert: {
          effects_enabled?: boolean
          fps_cap?: number
          graphics_mode?: Database["public"]["Enums"]["graphics_mode"]
          graphics_quality?: Database["public"]["Enums"]["graphics_quality"]
          language?: Database["public"]["Enums"]["app_language"]
          player_id: string
          reduce_motion?: boolean
          shadows_enabled?: boolean
          sound_pack?: Database["public"]["Enums"]["sound_pack"]
          sound_volume?: number
          updated_at?: string
        }
        Update: {
          effects_enabled?: boolean
          fps_cap?: number
          graphics_mode?: Database["public"]["Enums"]["graphics_mode"]
          graphics_quality?: Database["public"]["Enums"]["graphics_quality"]
          language?: Database["public"]["Enums"]["app_language"]
          player_id?: string
          reduce_motion?: boolean
          shadows_enabled?: boolean
          sound_pack?: Database["public"]["Enums"]["sound_pack"]
          sound_volume?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_settings_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_streaks: {
        Row: {
          current_streak: number
          last_claimed_on: string | null
          longest_streak: number
          player_id: string
          updated_at: string
        }
        Insert: {
          current_streak?: number
          last_claimed_on?: string | null
          longest_streak?: number
          player_id: string
          updated_at?: string
        }
        Update: {
          current_streak?: number
          last_claimed_on?: string | null
          longest_streak?: number
          player_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_streaks_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_kind: Database["public"]["Enums"]["avatar_kind"]
          avatar_preset: string | null
          avatar_url: string | null
          created_at: string
          id: string
          is_qa_account: boolean
          last_active_at: string | null
          nickname: string
          play_paused_until: string | null
          session_started_at: string | null
          status: Database["public"]["Enums"]["player_status"]
          welcome_credit_granted_at: string | null
          suspended_at: string | null
          suspended_reason: string | null
          updated_at: string
        }
        Insert: {
          avatar_kind?: Database["public"]["Enums"]["avatar_kind"]
          avatar_preset?: string | null
          avatar_url?: string | null
          created_at?: string
          id: string
          is_qa_account?: boolean
          last_active_at?: string | null
          nickname: string
          play_paused_until?: string | null
          session_started_at?: string | null
          status?: Database["public"]["Enums"]["player_status"]
          welcome_credit_granted_at?: string | null
          suspended_at?: string | null
          suspended_reason?: string | null
          updated_at?: string
        }
        Update: {
          avatar_kind?: Database["public"]["Enums"]["avatar_kind"]
          avatar_preset?: string | null
          avatar_url?: string | null
          created_at?: string
          id?: string
          is_qa_account?: boolean
          last_active_at?: string | null
          nickname?: string
          play_paused_until?: string | null
          session_started_at?: string | null
          status?: Database["public"]["Enums"]["player_status"]
          welcome_credit_granted_at?: string | null
          suspended_at?: string | null
          suspended_reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      qa_demo_accounts: {
        Row: {
          created_at: string
          created_by: string | null
          label: string
          player_id: string
          purpose: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          label: string
          player_id: string
          purpose?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          label?: string
          player_id?: string
          purpose?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qa_demo_accounts_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          balance_after: number
          bet_id: string
          created_at: string
          game_id: string
          game_version_id: string
          id: string
          is_win: boolean
          mode: Database["public"]["Enums"]["game_mode"]
          player_id: string
          result: Json
          selection: Json
          stake: number
          total_return: number
        }
        Insert: {
          balance_after: number
          bet_id: string
          created_at?: string
          game_id: string
          game_version_id: string
          id?: string
          is_win: boolean
          mode: Database["public"]["Enums"]["game_mode"]
          player_id: string
          result: Json
          selection: Json
          stake: number
          total_return: number
        }
        Update: {
          balance_after?: number
          bet_id?: string
          created_at?: string
          game_id?: string
          game_version_id?: string
          id?: string
          is_win?: boolean
          mode?: Database["public"]["Enums"]["game_mode"]
          player_id?: string
          result?: Json
          selection?: Json
          stake?: number
          total_return?: number
        }
        Relationships: [
          {
            foreignKeyName: "receipts_bet_id_fkey"
            columns: ["bet_id"]
            isOneToOne: true
            referencedRelation: "bets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_game_version_id_fkey"
            columns: ["game_version_id"]
            isOneToOne: false
            referencedRelation: "game_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission: Database["public"]["Enums"]["app_permission"]
          role_id: string
        }
        Insert: {
          permission: Database["public"]["Enums"]["app_permission"]
          role_id: string
        }
        Update: {
          permission?: Database["public"]["Enums"]["app_permission"]
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "admin_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_admin: string | null
          category: Database["public"]["Enums"]["ticket_category"]
          closed_at: string | null
          created_at: string
          id: string
          player_id: string
          satisfaction_comment: string | null
          satisfaction_rating: number | null
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at: string
        }
        Insert: {
          assigned_admin?: string | null
          category?: Database["public"]["Enums"]["ticket_category"]
          closed_at?: string | null
          created_at?: string
          id?: string
          player_id: string
          satisfaction_comment?: string | null
          satisfaction_rating?: number | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at?: string
        }
        Update: {
          assigned_admin?: string | null
          category?: Database["public"]["Enums"]["ticket_category"]
          closed_at?: string | null
          created_at?: string
          id?: string
          player_id?: string
          satisfaction_comment?: string | null
          satisfaction_rating?: number | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      ticket_attachments: {
        Row: {
          created_at: string
          file_name: string
          id: string
          message_id: string | null
          mime_type: string
          size_bytes: number
          storage_path: string
          ticket_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          message_id?: string | null
          mime_type: string
          size_bytes: number
          storage_path: string
          ticket_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          message_id?: string | null
          mime_type?: string
          size_bytes?: number
          storage_path?: string
          ticket_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "ticket_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_attachments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_messages: {
        Row: {
          author_id: string
          author_role: string
          body: string
          created_at: string
          id: string
          ticket_id: string
        }
        Insert: {
          author_id: string
          author_role?: string
          body: string
          created_at?: string
          id?: string
          ticket_id: string
        }
        Update: {
          author_id?: string
          author_role?: string
          body?: string
          created_at?: string
          id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      leaderboard_ranked: {
        Row: {
          avatar_url: string | null
          board: Database["public"]["Enums"]["leaderboard_board"] | null
          metric_value: number | null
          nickname: string | null
          player_id: string | null
          rank: number | null
          snapshot_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          board?: Database["public"]["Enums"]["leaderboard_board"] | null
          metric_value?: number | null
          nickname?: string | null
          player_id?: string | null
          rank?: number | null
          snapshot_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          board?: Database["public"]["Enums"]["leaderboard_board"] | null
          metric_value?: number | null
          nickname?: string | null
          player_id?: string | null
          rank?: number | null
          snapshot_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_entries_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_set_player_status: {
        Args: {
          p_player_id: string
          p_reason?: string
          p_status: Database["public"]["Enums"]["player_status"]
        }
        Returns: {
          avatar_kind: Database["public"]["Enums"]["avatar_kind"]
          avatar_preset: string | null
          avatar_url: string | null
          created_at: string
          id: string
          is_qa_account: boolean
          last_active_at: string | null
          nickname: string
          status: Database["public"]["Enums"]["player_status"]
          suspended_at: string | null
          suspended_reason: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      append_ledger_entry: {
        Args: {
          p_actor_id?: string
          p_amount: number
          p_entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          p_metadata?: Json
          p_player_id: string
          p_reason?: string
          p_reference_id?: string
          p_source?: string
        }
        Returns: {
          actor_id: string | null
          amount: number
          balance_after: number
          created_at: string
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          id: string
          metadata: Json
          player_id: string
          reason: string | null
          reference_id: string | null
          seq: number
          source: string | null
        }
        SetofOptions: {
          from: "*"
          to: "gik_ledger"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      bootstrap_first_owner: {
        Args: { p_user_id: string }
        Returns: {
          approval_limit: number | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          is_owner: boolean
          requires_2fa: boolean
          requires_pin: boolean
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "admin_users"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_credit_request: {
        Args: { p_request_id: string }
        Returns: {
          created_at: string
          id: string
          note: string | null
          player_id: string
          requested_amount: number
          status: Database["public"]["Enums"]["credit_request_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "credit_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }

      assert_game_playable: {
        Args: { p_game_key: string }
        Returns: Database["public"]["Tables"]["games"]["Row"]
      }
      ensure_player_round: {
        Args: { p_game_key: string }
        Returns: Database["public"]["Tables"]["game_rounds"]["Row"]
      }
      enforce_game_rate_limit: {
        Args: {
          p_bucket: string
          p_limit?: number
          p_player_id: string
          p_window?: number
        }
        Returns: undefined
      }
      get_active_game_version: {
        Args: { p_game_key: string }
        Returns: Database["public"]["Tables"]["game_versions"]["Row"]
      }
      open_game_round: {
        Args: {
          p_controlled_result?: Json | null
          p_game_key: string
          p_mode?: Database["public"]["Enums"]["game_mode"]
        }
        Returns: Database["public"]["Tables"]["game_rounds"]["Row"]
      }
      place_and_settle_bet: {
        Args: {
          p_controlled_result?: Json | null
          p_game_key: string
          p_idempotency_key: string
          p_mode?: Database["public"]["Enums"]["game_mode"]
          p_selection: Json
          p_stake: number
        }
        Returns: Json
      }
      set_game_availability: {
        Args: {
          p_enabled: boolean
          p_game_key: string
          p_message?: string | null
        }
        Returns: Database["public"]["Tables"]["games"]["Row"]
      }
      settle_game_outcome: {
        Args: {
          p_controlled: Json
          p_game_key: string
          p_mode: Database["public"]["Enums"]["game_mode"]
          p_selection: Json
          p_stake: number
        }
        Returns: Json
      }
      start_smooth_maintenance_close: {
        Args: { p_game_key: string; p_message?: string }
        Returns: Database["public"]["Tables"]["games"]["Row"]
      }

      complete_player_onboarding: {
        Args: {
          p_avatar_preset?: string
          p_contact_type: Database["public"]["Enums"]["contact_type"]
          p_contact_value: string
          p_nickname: string
        }
        Returns: Database["public"]["Tables"]["profiles"]["Row"]
      }
      get_player_access_state: { Args: { p_user_id?: string }; Returns: Json }
      get_welcome_credit_amount: { Args: never; Returns: number }
      grant_welcome_credit: { Args: { p_user_id?: string }; Returns: Json }
      mark_contact_verified: {
        Args: { p_channel: string; p_user_id?: string }
        Returns: Database["public"]["Tables"]["profiles"]["Row"]
      }
      request_account_deletion: {
        Args: { p_reason?: string; p_user_id?: string }
        Returns: Database["public"]["Tables"]["profiles"]["Row"]
      }
      claim_daily_reward: { Args: never; Returns: Json }
      get_setting: { Args: { p_default?: Json; p_key: string }; Returns: Json }
      has_permission: {
        Args: {
          perm: Database["public"]["Enums"]["app_permission"]
          uid?: string
        }
        Returns: boolean
      }
      is_admin: { Args: { uid?: string }; Returns: boolean }
      is_owner: { Args: { uid?: string }; Returns: boolean }
      review_credit_request: {
        Args: {
          p_bonus?: number
          p_decision: Database["public"]["Enums"]["credit_request_status"]
          p_fee_percent?: number
          p_gross?: number
          p_reason?: string
          p_request_id: string
        }
        Returns: Json
      }

      assert_play_allowed: { Args: never; Returns: undefined }
      claim_mission_reward: {
        Args: { p_mission_id: string }
        Returns: Json
      }
      create_invite_code: {
        Args: never
        Returns: Database["public"]["Tables"]["invites"]["Row"]
      }
      create_support_ticket: {
        Args: {
          p_category: Database["public"]["Enums"]["ticket_category"]
          p_message: string
          p_subject: string
        }
        Returns: Database["public"]["Tables"]["support_tickets"]["Row"]
      }
      feature_flag_enabled: { Args: { p_key: string }; Returns: boolean }
      get_responsible_play_config: { Args: never; Returns: Json }
      mark_all_notifications_read: { Args: never; Returns: number }
      mark_announcement_read: {
        Args: { p_announcement_id: string; p_dismiss?: boolean }
        Returns: undefined
      }
      mark_notification_read: {
        Args: { p_notification_id: string }
        Returns: undefined
      }
      record_mission_progress: {
        Args: { p_game_key: string }
        Returns: undefined
      }
      refresh_leaderboard_entries: { Args: never; Returns: undefined }
      reply_support_ticket: {
        Args: { p_message: string; p_ticket_id: string }
        Returns: Database["public"]["Tables"]["ticket_messages"]["Row"]
      }
      request_friend: {
        Args: { p_nickname: string }
        Returns: Database["public"]["Tables"]["friendships"]["Row"]
      }
      respond_friendship: {
        Args: { p_action: string; p_friendship_id: string }
        Returns: Database["public"]["Tables"]["friendships"]["Row"]
      }
      set_play_pause: {
        Args: { p_days: number }
        Returns: Database["public"]["Tables"]["profiles"]["Row"]
      }
      submit_ticket_satisfaction: {
        Args: { p_comment?: string | null; p_score: number; p_ticket_id: string }
        Returns: Database["public"]["Tables"]["support_tickets"]["Row"]
      }
      touch_play_session: { Args: never; Returns: string }
      unlock_achievement: { Args: { p_key: string }; Returns: boolean }

      write_audit: {
        Args: {
          p_action: string
          p_after?: Json
          p_approval_chain?: Json
          p_before?: Json
          p_reason?: string
          p_result?: string
          p_target_id?: string
          p_target_type?: string
        }
        Returns: string
      }
    }
    Enums: {
      announcement_audience: "all" | "players" | "admins"
      app_language: "lo" | "en"
      app_permission:
        | "players.view"
        | "players.suspend"
        | "credits.view"
        | "credits.adjust"
        | "games.view"
        | "games.control"
        | "games.configure"
        | "announcements.manage"
        | "tickets.manage"
        | "reports.view"
        | "reports.export"
        | "admins.manage"
        | "audit.view"
        | "system.settings"
      avatar_kind: "preset" | "uploaded"
      bet_status: "placed" | "locked" | "settled" | "voided"
      contact_type: "email" | "phone"
      credit_request_status: "pending" | "approved" | "rejected" | "cancelled"
      friendship_status: "pending" | "accepted" | "blocked"
      game_mode: "random" | "controlled_demo"
      game_status:
        | "draft"
        | "qa"
        | "owner_approved"
        | "scheduled"
        | "live"
        | "disabled"
      graphics_mode: "auto" | "2d" | "3d"
      graphics_quality: "low" | "medium" | "high"
      leaderboard_board: "current_credit" | "cumulative_winnings" | "most_wins"
      ledger_entry_type:
        | "welcome_credit"
        | "daily_reward"
        | "mission_reward"
        | "achievement_reward"
        | "demo_credit_grant"
        | "simulation_fee"
        | "bet_debit"
        | "game_payout"
        | "admin_adjustment"
        | "reset_demo_data"
      mission_scope: "single_game" | "any_game"
      notification_type:
        | "verification"
        | "reward"
        | "credit_request"
        | "ticket"
        | "achievement"
        | "announcement"
        | "system"
      player_status:
        | "active"
        | "suspended"
        | "banned"
        | "deletion_requested"
        | "deleted"
      round_status: "open" | "locked" | "settled" | "voided"
      sound_pack: "classic_casino" | "arcade" | "silent"
      ticket_category:
        | "general"
        | "account"
        | "credits"
        | "games"
        | "technical"
        | "other"
      ticket_status:
        | "open"
        | "in_progress"
        | "waiting_for_player"
        | "resolved"
        | "closed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      announcement_audience: ["all", "players", "admins"],
      app_language: ["lo", "en"],
      app_permission: [
        "players.view",
        "players.suspend",
        "credits.view",
        "credits.adjust",
        "games.view",
        "games.control",
        "games.configure",
        "announcements.manage",
        "tickets.manage",
        "reports.view",
        "reports.export",
        "admins.manage",
        "audit.view",
        "system.settings",
      ],
      avatar_kind: ["preset", "uploaded"],
      bet_status: ["placed", "locked", "settled", "voided"],
      contact_type: ["email", "phone"],
      credit_request_status: ["pending", "approved", "rejected", "cancelled"],
      friendship_status: ["pending", "accepted", "blocked"],
      game_mode: ["random", "controlled_demo"],
      game_status: [
        "draft",
        "qa",
        "owner_approved",
        "scheduled",
        "live",
        "disabled",
      ],
      graphics_mode: ["auto", "2d", "3d"],
      graphics_quality: ["low", "medium", "high"],
      leaderboard_board: ["current_credit", "cumulative_winnings", "most_wins"],
      ledger_entry_type: [
        "welcome_credit",
        "daily_reward",
        "mission_reward",
        "achievement_reward",
        "demo_credit_grant",
        "simulation_fee",
        "bet_debit",
        "game_payout",
        "admin_adjustment",
        "reset_demo_data",
      ],
      mission_scope: ["single_game", "any_game"],
      notification_type: [
        "verification",
        "reward",
        "credit_request",
        "ticket",
        "achievement",
        "announcement",
        "system",
      ],
      player_status: [
        "active",
        "suspended",
        "banned",
        "deletion_requested",
        "deleted",
      ],
      round_status: ["open", "locked", "settled", "voided"],
      sound_pack: ["classic_casino", "arcade", "silent"],
      ticket_category: [
        "general",
        "account",
        "credits",
        "games",
        "technical",
        "other",
      ],
      ticket_status: [
        "open",
        "in_progress",
        "waiting_for_player",
        "resolved",
        "closed",
      ],
    },
  },
} as const

