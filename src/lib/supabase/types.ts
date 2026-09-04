/**
 * Generated-style Database types for GIKGOK.
 * Source of truth: supabase/migrations/*.sql
 * Regenerate with `npm run db:types` when a linked Supabase project / Docker is available.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type PlayerStatus = "active" | "suspended" | "banned";
export type AppLocale = "lo" | "en";
export type GraphicsMode = "auto" | "2d" | "3d";
export type GraphicsQuality = "low" | "medium" | "high";
export type SoundPack = "classic_casino" | "arcade" | "silent";
export type ColorMode = "system" | "light" | "dark";
export type AdminAccountStatus = "active" | "disabled";
export type LedgerEntryType =
  | "welcome_credit"
  | "daily_reward"
  | "mission_reward"
  | "achievement_reward"
  | "demo_credit_grant"
  | "simulation_fee"
  | "bet_debit"
  | "game_payout"
  | "admin_adjustment"
  | "reset_demo_data";
export type CreditRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";
export type FeeMode = "percent" | "amount";
export type GameLifecycleStatus =
  | "draft"
  | "qa"
  | "owner_approved"
  | "scheduled"
  | "live"
  | "disabled";
export type SettlementMode = "random" | "controlled_demo";
export type RoundStatus =
  | "open"
  | "locked"
  | "settling"
  | "settled"
  | "cancelled";
export type BetStatus = "pending" | "locked" | "settled" | "cancelled";
export type AnnouncementStatus =
  | "draft"
  | "scheduled"
  | "published"
  | "archived";
export type NotificationKind =
  | "verification"
  | "reward"
  | "credit_request"
  | "ticket"
  | "achievement"
  | "announcement"
  | "system";
export type TicketStatus =
  | "open"
  | "in_progress"
  | "waiting_for_player"
  | "resolved"
  | "closed";
export type TicketCategory =
  | "account"
  | "credits"
  | "gameplay"
  | "technical"
  | "other";
export type FriendshipStatus = "pending" | "accepted" | "blocked" | "removed";
export type LeaderboardMetric =
  | "highest_credit"
  | "cumulative_winnings"
  | "most_wins";
export type AuditResult = "success" | "failure" | "denied";
export type AccentTheme = "green" | "red_white" | "blue_white" | "yellow_gray";
export type HealthSeverity = "info" | "warning" | "error" | "critical";
export type AssetKind =
  | "avatar_preset"
  | "game_icon"
  | "game_model"
  | "texture"
  | "sound"
  | "other";

type Timestamps = {
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          nickname: string;
          avatar_preset_id: string | null;
          avatar_path: string | null;
          avatar_mime_type: string | null;
          avatar_byte_size: number | null;
          email: string | null;
          phone: string | null;
          email_verified_at: string | null;
          phone_verified_at: string | null;
          status: PlayerStatus;
          last_activity_at: string | null;
          last_seen_page: string | null;
          welcome_credit_granted_at: string | null;
          deletion_requested_at: string | null;
          deleted_at: string | null;
        } & Timestamps;
        Insert: {
          id: string;
          nickname: string;
          avatar_preset_id?: string | null;
          avatar_path?: string | null;
          avatar_mime_type?: string | null;
          avatar_byte_size?: number | null;
          email?: string | null;
          phone?: string | null;
          email_verified_at?: string | null;
          phone_verified_at?: string | null;
          status?: PlayerStatus;
          last_activity_at?: string | null;
          last_seen_page?: string | null;
          welcome_credit_granted_at?: string | null;
          deletion_requested_at?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      user_settings: {
        Row: {
          user_id: string;
          locale: AppLocale;
          color_mode: ColorMode;
          graphics_mode: GraphicsMode;
          graphics_quality: GraphicsQuality;
          fps_cap: number;
          shadows_enabled: boolean;
          effects_enabled: boolean;
          reduce_motion: boolean;
          sound_pack: SoundPack;
          sound_volume: number;
          muted: boolean;
        } & Timestamps;
        Insert: {
          user_id: string;
          locale?: AppLocale;
          color_mode?: ColorMode;
          graphics_mode?: GraphicsMode;
          graphics_quality?: GraphicsQuality;
          fps_cap?: number;
          shadows_enabled?: boolean;
          effects_enabled?: boolean;
          reduce_motion?: boolean;
          sound_pack?: SoundPack;
          sound_volume?: number;
          muted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["user_settings"]["Insert"]>;
        Relationships: [];
      };
      admin_permissions: {
        Row: {
          code: string;
          description: string;
          created_at: string;
        };
        Insert: {
          code: string;
          description: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["admin_permissions"]["Insert"]>;
        Relationships: [];
      };
      admin_roles: {
        Row: {
          id: string;
          code: string;
          name: string;
          description: string | null;
          is_system: boolean;
          deleted_at: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          code: string;
          name: string;
          description?: string | null;
          is_system?: boolean;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["admin_roles"]["Insert"]>;
        Relationships: [];
      };
      admin_profiles: {
        Row: {
          user_id: string;
          display_name: string;
          status: AdminAccountStatus;
          is_owner: boolean;
          pin_hash: string | null;
          pin_updated_at: string | null;
          totp_secret_encrypted: string | null;
          totp_enabled_at: string | null;
          require_2fa: boolean;
          large_adjustment_limit: number;
          requires_second_approver_above: number;
          last_admin_login_at: string | null;
          deleted_at: string | null;
        } & Timestamps;
        Insert: {
          user_id: string;
          display_name: string;
          status?: AdminAccountStatus;
          is_owner?: boolean;
          pin_hash?: string | null;
          pin_updated_at?: string | null;
          totp_secret_encrypted?: string | null;
          totp_enabled_at?: string | null;
          require_2fa?: boolean;
          large_adjustment_limit?: number;
          requires_second_approver_above?: number;
          last_admin_login_at?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["admin_profiles"]["Insert"]>;
        Relationships: [];
      };
      ledger_entries: {
        Row: {
          id: string;
          player_id: string;
          entry_type: LedgerEntryType;
          amount: number;
          balance_after: number;
          source_type: string | null;
          source_id: string | null;
          actor_id: string | null;
          reason: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          player_id: string;
          entry_type: LedgerEntryType;
          amount: number;
          balance_after?: number;
          source_type?: string | null;
          source_id?: string | null;
          actor_id?: string | null;
          reason?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ledger_entries"]["Insert"]>;
        Relationships: [];
      };
      player_balances: {
        Row: {
          player_id: string;
          balance: number;
          updated_at: string;
        };
        Insert: {
          player_id: string;
          balance?: number;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["player_balances"]["Insert"]>;
        Relationships: [];
      };
      credit_requests: {
        Row: {
          id: string;
          player_id: string;
          status: CreditRequestStatus;
          requested_amount: number;
          player_note: string | null;
          cancelled_at: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          player_id: string;
          status?: CreditRequestStatus;
          requested_amount: number;
          player_note?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["credit_requests"]["Insert"]>;
        Relationships: [];
      };
      credit_request_reviews: {
        Row: {
          id: string;
          credit_request_id: string;
          reviewer_id: string;
          decision: CreditRequestStatus;
          gross_amount: number | null;
          fee_mode: "percent" | "amount" | null;
          fee_value: number | null;
          bonus_amount: number;
          net_amount: number | null;
          reason: string;
          requires_second_approver: boolean;
          second_approver_id: string | null;
          second_approved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          credit_request_id: string;
          reviewer_id: string;
          decision: CreditRequestStatus;
          gross_amount?: number | null;
          fee_mode?: "percent" | "amount" | null;
          fee_value?: number | null;
          bonus_amount?: number;
          net_amount?: number | null;
          reason: string;
          requires_second_approver?: boolean;
          second_approver_id?: string | null;
          second_approved_at?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["credit_request_reviews"]["Insert"]
        >;
        Relationships: [];
      };
      daily_reward_state: {
        Row: {
          player_id: string;
          streak_day: number;
          last_claim_date: string | null;
          updated_at: string;
        };
        Insert: {
          player_id: string;
          streak_day?: number;
          last_claim_date?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["daily_reward_state"]["Insert"]>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          player_id: string;
          kind: string;
          title_key: string;
          body_key: string | null;
          payload: Json;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          player_id: string;
          kind: string;
          title_key: string;
          body_key?: string | null;
          payload?: Json;
          read_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["notifications"]["Insert"]>;
        Relationships: [];
      };
      games: {
        Row: {
          id: string;
          display_name_key: string;
          description_key: string | null;
          lifecycle_status: GameLifecycleStatus;
          is_enabled: boolean;
          scheduled_launch_at: string | null;
          maintenance_close_started_at: string | null;
          maintenance_announcement_key: string | null;
          min_stake: number;
          max_stake: number;
          quick_stakes: number[];
          sound_pack: SoundPack;
          deleted_at: string | null;
        } & Timestamps;
        Insert: {
          id: string;
          display_name_key: string;
          description_key?: string | null;
          lifecycle_status?: GameLifecycleStatus;
          is_enabled?: boolean;
          scheduled_launch_at?: string | null;
          maintenance_close_started_at?: string | null;
          maintenance_announcement_key?: string | null;
          min_stake?: number;
          max_stake?: number;
          quick_stakes?: number[];
          sound_pack?: SoundPack;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["games"]["Insert"]>;
        Relationships: [];
      };
      game_versions: {
        Row: {
          id: string;
          game_id: string;
          version: number;
          config: Json;
          guide_i18n: Json;
          created_by: string | null;
          approved_by: string | null;
          approved_at: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          version: number;
          config?: Json;
          guide_i18n?: Json;
          created_by?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["game_versions"]["Insert"]>;
        Relationships: [];
      };
      game_rounds: {
        Row: {
          id: string;
          game_id: string;
          game_version_id: string;
          status: RoundStatus;
          settlement_mode: SettlementMode;
          controlled_demo_payload: Json | null;
          opened_at: string;
          locked_at: string | null;
          settled_at: string | null;
          created_by: string | null;
          metadata: Json;
        };
        Insert: {
          id?: string;
          game_id: string;
          game_version_id: string;
          status?: RoundStatus;
          settlement_mode?: SettlementMode;
          controlled_demo_payload?: Json | null;
          opened_at?: string;
          locked_at?: string | null;
          settled_at?: string | null;
          created_by?: string | null;
          metadata?: Json;
        };
        Update: Partial<Database["public"]["Tables"]["game_rounds"]["Insert"]>;
        Relationships: [];
      };
      feature_flags: {
        Row: {
          key: string;
          description: string;
          enabled: boolean;
          payload: Json;
          updated_by: string | null;
        } & Timestamps;
        Insert: {
          key: string;
          description: string;
          enabled?: boolean;
          payload?: Json;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["feature_flags"]["Insert"]>;
        Relationships: [];
      };
      bets: {
        Row: {
          id: string;
          round_id: string;
          player_id: string;
          game_id: string;
          game_version_id: string;
          status: BetStatus;
          stake: number;
          selection: Json;
          idempotency_key: string;
          debit_ledger_entry_id: string | null;
          payout_ledger_entry_id: string | null;
          locked_at: string | null;
          settled_at: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          round_id: string;
          player_id: string;
          game_id: string;
          game_version_id: string;
          status?: BetStatus;
          stake: number;
          selection: Json;
          idempotency_key: string;
          debit_ledger_entry_id?: string | null;
          payout_ledger_entry_id?: string | null;
          locked_at?: string | null;
          settled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["bets"]["Insert"]>;
        Relationships: [];
      };
      bet_receipts: {
        Row: {
          id: string;
          bet_id: string;
          player_id: string;
          game_id: string;
          game_version_id: string;
          settlement_mode: SettlementMode;
          stake: number;
          selection: Json;
          result_payload: Json;
          total_return_multiplier: number;
          payout_amount: number;
          balance_after: number;
          is_win: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          bet_id: string;
          player_id: string;
          game_id: string;
          game_version_id: string;
          settlement_mode: SettlementMode;
          stake: number;
          selection: Json;
          result_payload: Json;
          total_return_multiplier: number;
          payout_amount: number;
          balance_after: number;
          is_win: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["bet_receipts"]["Insert"]>;
        Relationships: [];
      };
      system_settings: {
        Row: {
          key: string;
          value: Json;
          description: string | null;
          updated_by: string | null;
        } & Timestamps;
        Insert: {
          key: string;
          value: Json;
          description?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["system_settings"]["Insert"]>;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string;
          actor_id: string | null;
          actor_role: string | null;
          action_type: string;
          target_type: string | null;
          target_id: string | null;
          before_values: Json | null;
          after_values: Json | null;
          reason: string | null;
          approval_chain: Json;
          request_metadata: Json;
          result: AuditResult;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          actor_role?: string | null;
          action_type: string;
          target_type?: string | null;
          target_id?: string | null;
          before_values?: Json | null;
          after_values?: Json | null;
          reason?: string | null;
          approval_chain?: Json;
          request_metadata?: Json;
          result?: AuditResult;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_log"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_player_verified: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
      is_active_admin: {
        Args: { p_user_id?: string };
        Returns: boolean;
      };
      admin_has_permission: {
        Args: { p_permission: string; p_user_id?: string };
        Returns: boolean;
      };
      ensure_player_profile: {
        Args: {
          p_user_id: string;
          p_nickname: string;
          p_email?: string | null;
          p_phone?: string | null;
          p_avatar_preset_id?: string | null;
        };
        Returns: Database["public"]["Tables"]["profiles"]["Row"];
      };
      mark_contact_verified: {
        Args: { p_channel: string; p_user_id?: string };
        Returns: Database["public"]["Tables"]["profiles"]["Row"];
      };
      grant_welcome_credit: {
        Args: { p_user_id?: string };
        Returns: Json;
      };
      get_credit_config: {
        Args: Record<string, never>;
        Returns: Json;
      };
      claim_daily_reward: {
        Args: { p_user_id?: string; p_today?: string };
        Returns: Json;
      };
      create_credit_request: {
        Args: {
          p_amount: number;
          p_note?: string | null;
          p_user_id?: string;
        };
        Returns: Database["public"]["Tables"]["credit_requests"]["Row"];
      };
      cancel_credit_request: {
        Args: { p_request_id: string; p_user_id?: string };
        Returns: Database["public"]["Tables"]["credit_requests"]["Row"];
      };
      review_credit_request: {
        Args: {
          p_request_id: string;
          p_decision: string;
          p_reason: string;
          p_gross_amount?: number | null;
          p_fee_mode?: string | null;
          p_fee_value?: number | null;
          p_bonus_amount?: number | null;
          p_reviewer_id?: string;
        };
        Returns: Json;
      };
      second_approve_credit_request: {
        Args: { p_review_id: string; p_approver_id?: string };
        Returns: Json;
      };
      reconcile_player_balance: {
        Args: { p_player_id: string };
        Returns: Json;
      };
      place_and_settle_bet: {
        Args: {
          p_game_id: string;
          p_stake: number;
          p_selection: Json;
          p_idempotency_key: string;
          p_player_id?: string;
        };
        Returns: Json;
      };
      open_game_round: {
        Args: {
          p_game_id: string;
          p_settlement_mode?: SettlementMode;
          p_controlled_demo_payload?: Json | null;
          p_admin_id?: string;
        };
        Returns: Json;
      };
      ensure_player_round: {
        Args: { p_game_id: string };
        Returns: Json;
      };
      start_smooth_maintenance_close: {
        Args: {
          p_game_id: string;
          p_announcement_key?: string;
          p_admin_id?: string;
        };
        Returns: Json;
      };
      set_game_availability: {
        Args: {
          p_game_id: string;
          p_enabled: boolean;
          p_lifecycle?: GameLifecycleStatus | string | null;
          p_admin_id?: string;
        };
        Returns: Json;
      };
      request_account_deletion: {
        Args: { p_reason?: string | null; p_user_id?: string };
        Returns: Database["public"]["Tables"]["profiles"]["Row"];
      };
      get_player_access_state: {
        Args: { p_user_id?: string };
        Returns: Json;
      };
    };
    Enums: {
      player_status: PlayerStatus;
      app_locale: AppLocale;
      ledger_entry_type: LedgerEntryType;
      credit_request_status: CreditRequestStatus;
      game_lifecycle_status: GameLifecycleStatus;
      settlement_mode: SettlementMode;
      ticket_status: TicketStatus;
      audit_result: AuditResult;
    };
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
