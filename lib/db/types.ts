export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      api_log: {
        Row: {
          attempts: number | null;
          cache_hit: boolean;
          created_at: string;
          endpoint: string;
          error: string | null;
          guide_id: string | null;
          id: number;
          latency_ms: number | null;
          mode: string | null;
          month_remaining: number | null;
          params: Json | null;
          provider: string;
          status: number | null;
        };
        ComputedFields: never;
        Insert: {
          attempts?: number | null;
          cache_hit?: boolean;
          created_at?: string;
          endpoint: string;
          error?: string | null;
          guide_id?: string | null;
          id?: number;
          latency_ms?: number | null;
          mode?: string | null;
          month_remaining?: number | null;
          params?: Json | null;
          provider: string;
          status?: number | null;
        };
        Update: {
          attempts?: number | null;
          cache_hit?: boolean;
          created_at?: string;
          endpoint?: string;
          error?: string | null;
          guide_id?: string | null;
          id?: number;
          latency_ms?: number | null;
          mode?: string | null;
          month_remaining?: number | null;
          params?: Json | null;
          provider?: string;
          status?: number | null;
        };
        Relationships: [];
      };
      chat_messages: {
        Row: {
          content: NonNullable<Json>;
          created_at: string;
          guide_id: string;
          id: number;
          role: string;
        };
        ComputedFields: never;
        Insert: {
          content: NonNullable<Json>;
          created_at?: string;
          guide_id: string;
          id?: number;
          role: string;
        };
        Update: {
          content?: NonNullable<Json>;
          created_at?: string;
          guide_id?: string;
          id?: number;
          role?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_messages_guide_id_fkey";
            columns: ["guide_id"];
            isOneToOne: false;
            referencedRelation: "guides";
            referencedColumns: ["id"];
          },
        ];
      };
      comparisons: {
        Row: {
          ai_alone: NonNullable<Json>;
          generated_at: string;
          guest_description: string;
          guide_id: string;
          model: string | null;
          summary: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          ai_alone: NonNullable<Json>;
          generated_at?: string;
          guest_description: string;
          guide_id: string;
          model?: string | null;
          summary: NonNullable<Json>;
        };
        Update: {
          ai_alone?: NonNullable<Json>;
          generated_at?: string;
          guest_description?: string;
          guide_id?: string;
          model?: string | null;
          summary?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "comparisons_guide_id_fkey";
            columns: ["guide_id"];
            isOneToOne: true;
            referencedRelation: "guides";
            referencedColumns: ["id"];
          },
        ];
      };
      guide_sections: {
        Row: {
          generated_at: string;
          guide_id: string;
          intro: string | null;
          items: NonNullable<Json>;
          qloo_request: Json | null;
          section: Database["public"]["Enums"]["section_kind"];
        };
        ComputedFields: never;
        Insert: {
          generated_at?: string;
          guide_id: string;
          intro?: string | null;
          items: NonNullable<Json>;
          qloo_request?: Json | null;
          section: Database["public"]["Enums"]["section_kind"];
        };
        Update: {
          generated_at?: string;
          guide_id?: string;
          intro?: string | null;
          items?: NonNullable<Json>;
          qloo_request?: Json | null;
          section?: Database["public"]["Enums"]["section_kind"];
        };
        Relationships: [
          {
            foreignKeyName: "guide_sections_guide_id_fkey";
            columns: ["guide_id"];
            isOneToOne: false;
            referencedRelation: "guides";
            referencedColumns: ["id"];
          },
        ];
      };
      guides: {
        Row: {
          age_band: string | null;
          audience_age_band: string | null;
          check_in: string | null;
          check_out: string | null;
          created_at: string;
          demo_key: string | null;
          generated_at: string | null;
          generation_error: string | null;
          generation_started_at: string | null;
          guest_first_name: string | null;
          hero_line: string | null;
          id: string;
          language: string;
          party_type: Database["public"]["Enums"]["party_type"];
          property_id: string;
          source: string;
          status: Database["public"]["Enums"]["guide_status"];
          token: string;
          viewed_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          age_band?: string | null;
          audience_age_band?: string | null;
          check_in?: string | null;
          check_out?: string | null;
          created_at?: string;
          demo_key?: string | null;
          generated_at?: string | null;
          generation_error?: string | null;
          generation_started_at?: string | null;
          guest_first_name?: string | null;
          hero_line?: string | null;
          id?: string;
          language?: string;
          party_type?: Database["public"]["Enums"]["party_type"];
          property_id: string;
          source?: string;
          status?: Database["public"]["Enums"]["guide_status"];
          token: string;
          viewed_at?: string | null;
        };
        Update: {
          age_band?: string | null;
          audience_age_band?: string | null;
          check_in?: string | null;
          check_out?: string | null;
          created_at?: string;
          demo_key?: string | null;
          generated_at?: string | null;
          generation_error?: string | null;
          generation_started_at?: string | null;
          guest_first_name?: string | null;
          hero_line?: string | null;
          id?: string;
          language?: string;
          party_type?: Database["public"]["Enums"]["party_type"];
          property_id?: string;
          source?: string;
          status?: Database["public"]["Enums"]["guide_status"];
          token?: string;
          viewed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "guides_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      heatmaps: {
        Row: {
          cells: NonNullable<Json>;
          generated_at: string;
          guide_id: string;
        };
        ComputedFields: never;
        Insert: {
          cells: NonNullable<Json>;
          generated_at?: string;
          guide_id: string;
        };
        Update: {
          cells?: NonNullable<Json>;
          generated_at?: string;
          guide_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "heatmaps_guide_id_fkey";
            columns: ["guide_id"];
            isOneToOne: true;
            referencedRelation: "guides";
            referencedColumns: ["id"];
          },
        ];
      };
      host_picks: {
        Row: {
          address: string | null;
          created_at: string;
          id: string;
          name: string;
          note: string | null;
          position: number;
          property_id: string;
          qloo_entity_id: string;
        };
        ComputedFields: never;
        Insert: {
          address?: string | null;
          created_at?: string;
          id?: string;
          name: string;
          note?: string | null;
          position?: number;
          property_id: string;
          qloo_entity_id: string;
        };
        Update: {
          address?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          note?: string | null;
          position?: number;
          property_id?: string;
          qloo_entity_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "host_picks_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      hosts: {
        Row: {
          business_name: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
        };
        ComputedFields: never;
        Insert: {
          business_name?: string | null;
          created_at?: string;
          display_name?: string | null;
          id: string;
        };
        Update: {
          business_name?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
        };
        Relationships: [];
      };
      properties: {
        Row: {
          address: string;
          city: string;
          country_code: string | null;
          created_at: string;
          demo_key: string | null;
          description: string | null;
          host_id: string;
          house_notes: string | null;
          id: string;
          lat: number;
          lng: number;
          name: string;
          photo_url: string | null;
          self_serve_enabled: boolean;
          self_serve_token: string | null;
          type: Database["public"]["Enums"]["property_type"];
        };
        ComputedFields: never;
        Insert: {
          address: string;
          city: string;
          country_code?: string | null;
          created_at?: string;
          demo_key?: string | null;
          description?: string | null;
          host_id: string;
          house_notes?: string | null;
          id?: string;
          lat: number;
          lng: number;
          name: string;
          photo_url?: string | null;
          self_serve_enabled?: boolean;
          self_serve_token?: string | null;
          type?: Database["public"]["Enums"]["property_type"];
        };
        Update: {
          address?: string;
          city?: string;
          country_code?: string | null;
          created_at?: string;
          demo_key?: string | null;
          description?: string | null;
          host_id?: string;
          house_notes?: string | null;
          id?: string;
          lat?: number;
          lng?: number;
          name?: string;
          photo_url?: string | null;
          self_serve_enabled?: boolean;
          self_serve_token?: string | null;
          type?: Database["public"]["Enums"]["property_type"];
        };
        Relationships: [
          {
            foreignKeyName: "properties_host_id_fkey";
            columns: ["host_id"];
            isOneToOne: false;
            referencedRelation: "hosts";
            referencedColumns: ["id"];
          },
        ];
      };
      qloo_cache: {
        Row: {
          created_at: string;
          endpoint: string;
          expires_at: string;
          key: string;
          response: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          endpoint: string;
          expires_at: string;
          key: string;
          response: NonNullable<Json>;
        };
        Update: {
          created_at?: string;
          endpoint?: string;
          expires_at?: string;
          key?: string;
          response?: NonNullable<Json>;
        };
        Relationships: [];
      };
      qloo_tag_map: {
        Row: {
          display: string;
          kind: string;
          label: string;
          position: number;
          urns: string[];
        };
        ComputedFields: never;
        Insert: {
          display: string;
          kind: string;
          label: string;
          position?: number;
          urns: string[];
        };
        Update: {
          display?: string;
          kind?: string;
          label?: string;
          position?: number;
          urns?: string[];
        };
        Relationships: [];
      };
      quiz_answers: {
        Row: {
          artist_ids: string[];
          artist_names: string[];
          dietary: string[];
          guide_id: string;
          media_ids: string[];
          media_names: string[];
          skipped: boolean;
          tag_labels: string[];
          tag_urns: string[];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          artist_ids?: string[];
          artist_names?: string[];
          dietary?: string[];
          guide_id: string;
          media_ids?: string[];
          media_names?: string[];
          skipped?: boolean;
          tag_labels?: string[];
          tag_urns?: string[];
          updated_at?: string;
        };
        Update: {
          artist_ids?: string[];
          artist_names?: string[];
          dietary?: string[];
          guide_id?: string;
          media_ids?: string[];
          media_names?: string[];
          skipped?: boolean;
          tag_labels?: string[];
          tag_urns?: string[];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "quiz_answers_guide_id_fkey";
            columns: ["guide_id"];
            isOneToOne: true;
            referencedRelation: "guides";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      demo_host_id: { Args: { target_email: string }; Returns: string };
      owns_guide: { Args: { target: string }; Returns: boolean };
    };
    Enums: {
      guide_status: "awaiting_quiz" | "generating" | "ready" | "failed";
      party_type: "solo" | "couple" | "family" | "friends" | "business";
      property_type: "apartment" | "house" | "villa" | "hotel";
      section_kind:
        "eat" | "drink" | "do" | "rainy" | "host_picks" | "playlist" | "films" | "shows";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      guide_status: ["awaiting_quiz", "generating", "ready", "failed"],
      party_type: ["solo", "couple", "family", "friends", "business"],
      property_type: ["apartment", "house", "villa", "hotel"],
      section_kind: ["eat", "drink", "do", "rainy", "host_picks", "playlist", "films", "shows"],
    },
  },
} as const;
