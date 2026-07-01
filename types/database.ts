// Hand-written to match supabase/migrations/000*.sql. Once a live project
// exists, regenerate with:
//   npx supabase gen types typescript --project-id <id> > types/database.ts

export type ClubRole = "admin" | "member";
export type CalendarEventType = "race" | "practice" | "team_bonding" | "volunteer" | "other";
export type MessageType = "text" | "photo" | "announcement";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          avatar_url: string | null;
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
          pinned: boolean;
          created_at: string;
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
    };
    Views: {};
    Functions: {
      join_club_by_code: {
        Args: { code: string };
        Returns: Database["public"]["Tables"]["clubs"]["Row"];
      };
    };
  };
}
