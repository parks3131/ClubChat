// Hand-written to match supabase/migrations/000*.sql. Once a live project
// exists, regenerate with:
//   npx supabase gen types typescript --project-id <id> > types/database.ts

export type ClubRole = "owner" | "admin" | "member";
export type CalendarEventType = "race" | "practice" | "team_bonding" | "volunteer" | "other";
export type MessageType = "text" | "photo" | "announcement" | "system" | "document" | "poll" | "event" | "meeting";
export type ClubJoinPolicy = "open" | "request";
export type JoinRequestStatus = "pending" | "approved" | "denied";
export type RoutineActivityType =
  | "run"
  | "trail_run"
  | "bike"
  | "swim"
  | "strength"
  | "hybrid_fitness"
  | "indoor_climb"
  | "bouldering"
  | "xc_ski"
  | "other";
export type NotificationType =
  | "club_join_request"
  | "race_join_request"
  | "eboard_join_request"
  | "request_approved"
  | "request_denied"
  | "member_added"
  | "member_removed"
  | "role_changed"
  | "poll_created"
  | "event_created"
  | "race_created"
  | "meeting_created"
  | "announcement"
  | "poll_closing_soon"
  | "chat_caught_up"
  | "mentioned"
  | "news_post_created"
  | "car_group_incharge_left";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          avatar_url: string | null;
          bio: string;
          city: string;
          date_of_birth: string | null;
          school: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & { id: string };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      clubs: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          sport: string | null;
          invite_code: string;
          join_policy: ClubJoinPolicy;
          avatar_url: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["clubs"]["Row"]> & {
          name: string;
          created_by: string;
        };
        Update: Partial<Database["public"]["Tables"]["clubs"]["Row"]>;
        Relationships: [];
      };
      club_members: {
        Row: {
          club_id: string;
          user_id: string;
          role: ClubRole;
          joined_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["club_members"]["Row"]> & {
          club_id: string;
          user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["club_members"]["Row"]>;
        Relationships: [];
      };
      calendar_events: {
        Row: {
          id: string;
          club_id: string;
          event_type: CalendarEventType;
          title: string;
          description: string | null;
          location: string | null;
          start_at: string;
          end_at: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["calendar_events"]["Row"]> & {
          club_id: string;
          title: string;
          start_at: string;
          created_by: string;
        };
        Update: Partial<Database["public"]["Tables"]["calendar_events"]["Row"]>;
        Relationships: [];
      };
      channels: {
        Row: {
          id: string;
          club_id: string;
          race_id: string | null;
          eboard_channel_id: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["channels"]["Row"]> & { club_id: string };
        Update: Partial<Database["public"]["Tables"]["channels"]["Row"]>;
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          channel_id: string;
          sender_id: string;
          message_type: MessageType;
          body: string | null;
          media_url: string | null;
          document_name: string | null;
          document_size_bytes: number | null;
          poll_id: string | null;
          event_id: string | null;
          meeting_id: string | null;
          pinned: boolean;
          created_at: string;
          deleted_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["messages"]["Row"]> & {
          channel_id: string;
          sender_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["messages"]["Row"]>;
        Relationships: [];
      };
      message_reactions: {
        Row: {
          message_id: string;
          user_id: string;
          emoji: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["message_reactions"]["Row"]> & {
          message_id: string;
          user_id: string;
          emoji: string;
        };
        Update: Partial<Database["public"]["Tables"]["message_reactions"]["Row"]>;
        Relationships: [];
      };
      message_mentions: {
        Row: {
          message_id: string;
          mentioned_user_id: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["message_mentions"]["Row"]> & {
          message_id: string;
          mentioned_user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["message_mentions"]["Row"]>;
        Relationships: [];
      };
      club_posts: {
        Row: {
          id: string;
          club_id: string;
          created_by: string;
          body: string | null;
          media_url: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["club_posts"]["Row"]> & {
          club_id: string;
          created_by: string;
        };
        Update: Partial<Database["public"]["Tables"]["club_posts"]["Row"]>;
        Relationships: [];
      };
      club_post_reactions: {
        Row: {
          post_id: string;
          user_id: string;
          emoji: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["club_post_reactions"]["Row"]> & {
          post_id: string;
          user_id: string;
          emoji: string;
        };
        Update: Partial<Database["public"]["Tables"]["club_post_reactions"]["Row"]>;
        Relationships: [];
      };
      message_reports: {
        Row: {
          id: string;
          message_id: string;
          channel_id: string;
          reporter_id: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["message_reports"]["Row"]> & {
          message_id: string;
          channel_id: string;
          reporter_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["message_reports"]["Row"]>;
        Relationships: [];
      };
      club_join_requests: {
        Row: {
          id: string;
          club_id: string;
          user_id: string;
          status: JoinRequestStatus;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["club_join_requests"]["Row"]> & {
          club_id: string;
          user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["club_join_requests"]["Row"]>;
        Relationships: [];
      };
      races: {
        Row: {
          id: string;
          club_id: string;
          name: string;
          event_date: string;
          photos_link: string | null;
          results_link: string | null;
          info_description: string | null;
          location_link: string | null;
          hotel_link: string | null;
          avatar_url: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["races"]["Row"]> & {
          club_id: string;
          name: string;
          event_date: string;
          created_by: string;
        };
        Update: Partial<Database["public"]["Tables"]["races"]["Row"]>;
        Relationships: [];
      };
      race_members: {
        Row: {
          race_id: string;
          user_id: string;
          joined_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["race_members"]["Row"]> & {
          race_id: string;
          user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["race_members"]["Row"]>;
        Relationships: [];
      };
      race_join_requests: {
        Row: {
          id: string;
          race_id: string;
          user_id: string;
          status: JoinRequestStatus;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["race_join_requests"]["Row"]> & {
          race_id: string;
          user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["race_join_requests"]["Row"]>;
        Relationships: [];
      };
      race_pins: {
        Row: {
          race_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["race_pins"]["Row"]> & {
          race_id: string;
          user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["race_pins"]["Row"]>;
        Relationships: [];
      };
      eboard_channels: {
        Row: {
          id: string;
          club_id: string;
          name: string;
          description: string | null;
          avatar_url: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["eboard_channels"]["Row"]> & {
          club_id: string;
          name: string;
          created_by: string;
        };
        Update: Partial<Database["public"]["Tables"]["eboard_channels"]["Row"]>;
        Relationships: [];
      };
      eboard_channel_members: {
        Row: {
          eboard_channel_id: string;
          user_id: string;
          joined_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["eboard_channel_members"]["Row"]> & {
          eboard_channel_id: string;
          user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["eboard_channel_members"]["Row"]>;
        Relationships: [];
      };
      eboard_channel_join_requests: {
        Row: {
          id: string;
          eboard_channel_id: string;
          user_id: string;
          status: JoinRequestStatus;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["eboard_channel_join_requests"]["Row"]> & {
          eboard_channel_id: string;
          user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["eboard_channel_join_requests"]["Row"]>;
        Relationships: [];
      };
      eboard_meetings: {
        Row: {
          id: string;
          eboard_channel_id: string;
          title: string;
          description: string | null;
          meeting_link: string | null;
          meeting_at: string;
          created_by: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["eboard_meetings"]["Row"]> & {
          eboard_channel_id: string;
          title: string;
          meeting_at: string;
          created_by: string;
        };
        Update: Partial<Database["public"]["Tables"]["eboard_meetings"]["Row"]>;
        Relationships: [];
      };
      race_car_groups: {
        Row: {
          id: string;
          race_id: string;
          name: string;
          incharge_user_id: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["race_car_groups"]["Row"]> & {
          race_id: string;
          name: string;
          created_by: string;
        };
        Update: Partial<Database["public"]["Tables"]["race_car_groups"]["Row"]>;
        Relationships: [];
      };
      race_car_group_members: {
        Row: {
          car_group_id: string;
          race_id: string;
          user_id: string;
          added_by: string;
          added_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["race_car_group_members"]["Row"]> & {
          car_group_id: string;
          race_id: string;
          user_id: string;
          added_by: string;
        };
        Update: Partial<Database["public"]["Tables"]["race_car_group_members"]["Row"]>;
        Relationships: [];
      };
      routine_workouts: {
        Row: {
          id: string;
          club_id: string;
          workout_date: string;
          activity_type: RoutineActivityType;
          title: string;
          description: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["routine_workouts"]["Row"]> & {
          club_id: string;
          workout_date: string;
          activity_type: RoutineActivityType;
          title: string;
          created_by: string;
        };
        Update: Partial<Database["public"]["Tables"]["routine_workouts"]["Row"]>;
        Relationships: [];
      };
      polls: {
        Row: {
          id: string;
          club_id: string;
          race_id: string | null;
          eboard_channel_id: string | null;
          created_by: string;
          question: string;
          allow_multiple: boolean;
          is_private: boolean;
          is_closed: boolean;
          closes_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["polls"]["Row"]> & {
          club_id: string;
          created_by: string;
          question: string;
        };
        Update: Partial<Database["public"]["Tables"]["polls"]["Row"]>;
        Relationships: [];
      };
      poll_options: {
        Row: {
          id: string;
          poll_id: string;
          text: string;
          position: number;
          vote_count: number;
        };
        Insert: Partial<Database["public"]["Tables"]["poll_options"]["Row"]> & {
          poll_id: string;
          text: string;
          position: number;
        };
        Update: Partial<Database["public"]["Tables"]["poll_options"]["Row"]>;
        Relationships: [];
      };
      poll_votes: {
        Row: {
          id: string;
          poll_id: string;
          option_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["poll_votes"]["Row"]> & {
          poll_id: string;
          option_id: string;
          user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["poll_votes"]["Row"]>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          recipient_id: string;
          actor_id: string | null;
          club_id: string;
          type: NotificationType;
          body: string;
          target_path: string;
          resolved_outcome: "approved" | "denied" | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["notifications"]["Row"]> & {
          recipient_id: string;
          club_id: string;
          type: NotificationType;
          body: string;
          target_path: string;
        };
        Update: Partial<Database["public"]["Tables"]["notifications"]["Row"]>;
        Relationships: [];
      };
      channel_reads: {
        Row: {
          channel_id: string;
          user_id: string;
          last_read_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["channel_reads"]["Row"]> & {
          channel_id: string;
          user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["channel_reads"]["Row"]>;
        Relationships: [];
      };
    };
    Views: {};
    Functions: {
      fetch_unread_channel_summaries: {
        Args: Record<string, never>;
        Returns: {
          channel_id: string;
          club_id: string;
          race_id: string | null;
          eboard_channel_id: string | null;
          channel_name: string | null;
          unread_count: number;
          last_message_at: string | null;
        }[];
      };
      join_club_by_code: {
        Args: { code: string };
        Returns: Database["public"]["Tables"]["clubs"]["Row"];
      };
      search_clubs: {
        Args: { query: string };
        Returns: {
          id: string;
          name: string;
          description: string | null;
          sport: string | null;
          join_policy: ClubJoinPolicy;
          member_count: number;
          request_status: JoinRequestStatus | null;
        }[];
      };
      join_or_request_club: {
        Args: { target_club_id: string };
        Returns: "joined" | "requested";
      };
      decide_join_request: {
        Args: { request_id: string; approve: boolean };
        Returns: undefined;
      };
      request_join_race: {
        Args: { target_race_id: string };
        Returns: "joined" | "requested";
      };
      decide_race_join_request: {
        Args: { request_id: string; approve: boolean };
        Returns: undefined;
      };
      request_join_eboard_channel: {
        Args: { target_eboard_channel_id: string };
        Returns: "joined" | "requested";
      };
      decide_eboard_join_request: {
        Args: { request_id: string; approve: boolean };
        Returns: undefined;
      };
      set_car_group_incharge: {
        Args: { p_group_id: string; p_user_id: string | null };
        Returns: undefined;
      };
      cast_vote: {
        Args: { p_option_id: string };
        Returns: undefined;
      };
      delete_account: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      transfer_ownership: {
        Args: { target_club_id: string; new_owner_user_id: string };
        Returns: undefined;
      };
      mark_channel_read_and_log: {
        Args: { p_channel_id: string };
        Returns: undefined;
      };
    };
  };
}
