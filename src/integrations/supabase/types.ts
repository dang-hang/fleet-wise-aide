export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      cases: {
        Row: {
          case_number: string
          category: string | null
          created_at: string
          diagnostic_result: string | null
          id: string
          notes: string | null
          problem_description: string
          status: string
          title: string
          updated_at: string
          user_id: string
          vehicle_make: string
          vehicle_model: string
          vehicle_year: string
        }
        Insert: {
          case_number: string
          category?: string | null
          created_at?: string
          diagnostic_result?: string | null
          id?: string
          notes?: string | null
          problem_description: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
          vehicle_make: string
          vehicle_model: string
          vehicle_year: string
        }
        Update: {
          case_number?: string
          category?: string | null
          created_at?: string
          diagnostic_result?: string | null
          id?: string
          notes?: string | null
          problem_description?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
          vehicle_make?: string
          vehicle_model?: string
          vehicle_year?: string
        }
        Relationships: []
      }
      manual_chunks: {
        Row: {
          content: string
          created_at: string | null
          embedding: string | null
          id: string
          manual_id: string
          metadata: Json | null
          span_ids: string[] | null
        }
        Insert: {
          content: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          manual_id: string
          metadata?: Json | null
          span_ids?: string[] | null
        }
        Update: {
          content?: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          manual_id?: string
          metadata?: Json | null
          span_ids?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "manual_chunks_manual_id_fkey"
            columns: ["manual_id"]
            isOneToOne: false
            referencedRelation: "manuals"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_figures: {
        Row: {
          bbox: Json
          caption: string | null
          created_at: string | null
          figure_index: number
          id: string
          manual_id: string
          page_number: number
          storage_path: string
        }
        Insert: {
          bbox: Json
          caption?: string | null
          created_at?: string | null
          figure_index: number
          id?: string
          manual_id: string
          page_number: number
          storage_path: string
        }
        Update: {
          bbox?: Json
          caption?: string | null
          created_at?: string | null
          figure_index?: number
          id?: string
          manual_id?: string
          page_number?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_figures_manual_id_fkey"
            columns: ["manual_id"]
            isOneToOne: false
            referencedRelation: "manuals"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_pages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          manual_id: string
          page_number: number
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          manual_id: string
          page_number: number
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          manual_id?: string
          page_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "manual_pages_manual_id_fkey"
            columns: ["manual_id"]
            isOneToOne: false
            referencedRelation: "manuals"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_sections: {
        Row: {
          created_at: string | null
          first_page: number
          heading_level: number
          id: string
          manual_id: string
          page_count: number
          parent_section_id: string | null
          section_name: string
        }
        Insert: {
          created_at?: string | null
          first_page: number
          heading_level?: number
          id?: string
          manual_id: string
          page_count: number
          parent_section_id?: string | null
          section_name: string
        }
        Update: {
          created_at?: string | null
          first_page?: number
          heading_level?: number
          id?: string
          manual_id?: string
          page_count?: number
          parent_section_id?: string | null
          section_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_sections_manual_id_fkey"
            columns: ["manual_id"]
            isOneToOne: false
            referencedRelation: "manuals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_sections_parent_section_id_fkey"
            columns: ["parent_section_id"]
            isOneToOne: false
            referencedRelation: "manual_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_spans: {
        Row: {
          bbox: Json
          created_at: string | null
          font_name: string | null
          font_size: number | null
          id: string
          manual_id: string
          page_number: number
          text: string
        }
        Insert: {
          bbox: Json
          created_at?: string | null
          font_name?: string | null
          font_size?: number | null
          id?: string
          manual_id: string
          page_number: number
          text: string
        }
        Update: {
          bbox?: Json
          created_at?: string | null
          font_name?: string | null
          font_size?: number | null
          id?: string
          manual_id?: string
          page_number?: number
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_spans_manual_id_fkey"
            columns: ["manual_id"]
            isOneToOne: false
            referencedRelation: "manuals"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_tables: {
        Row: {
          bbox: Json
          caption: string | null
          created_at: string | null
          data: Json
          id: string
          manual_id: string
          page_number: number
          table_index: number
        }
        Insert: {
          bbox: Json
          caption?: string | null
          created_at?: string | null
          data: Json
          id?: string
          manual_id: string
          page_number: number
          table_index: number
        }
        Update: {
          bbox?: Json
          caption?: string | null
          created_at?: string | null
          data?: Json
          id?: string
          manual_id?: string
          page_number?: number
          table_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "manual_tables_manual_id_fkey"
            columns: ["manual_id"]
            isOneToOne: false
            referencedRelation: "manuals"
            referencedColumns: ["id"]
          },
        ]
      }
      manuals: {
        Row: {
          created_at: string
          file_path: string
          file_size: number | null
          file_type: string
          id: string
          parsed_content: string | null
          sha256: string | null
          title: string
          total_pages: number | null
          updated_at: string
          user_id: string
          vehicle_make: string | null
          vehicle_model: string | null
          vehicle_type: string
          vehicle_year: string | null
          year_range: string | null
        }
        Insert: {
          created_at?: string
          file_path: string
          file_size?: number | null
          file_type: string
          id?: string
          parsed_content?: string | null
          sha256?: string | null
          title: string
          total_pages?: number | null
          updated_at?: string
          user_id: string
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_type: string
          vehicle_year?: string | null
          year_range?: string | null
        }
        Update: {
          created_at?: string
          file_path?: string
          file_size?: number | null
          file_type?: string
          id?: string
          parsed_content?: string | null
          sha256?: string | null
          title?: string
          total_pages?: number | null
          updated_at?: string
          user_id?: string
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_type?: string
          vehicle_year?: string | null
          year_range?: string | null
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          created_at: string
          id: string
          license_plate: string | null
          make: string
          model: string
          notes: string | null
          updated_at: string
          user_id: string
          vin: string | null
          year: string
        }
        Insert: {
          created_at?: string
          id?: string
          license_plate?: string | null
          make: string
          model: string
          notes?: string | null
          updated_at?: string
          user_id: string
          vin?: string | null
          year: string
        }
        Update: {
          created_at?: string
          id?: string
          license_plate?: string | null
          make?: string
          model?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
          vin?: string | null
          year?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_case_number: { Args: never; Returns: string }
      match_chunks: {
        Args: {
          manual_filter?: string
          match_count?: number
          query_embedding: string
        }
        Returns: {
          content: string
          id: string
          manual_id: string
          metadata: Json
          similarity: number
          span_ids: string[]
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const
