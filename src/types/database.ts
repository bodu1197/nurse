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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      hospitals: {
        Row: {
          address: string | null
          created_at: string
          id: string
          is_claimed: boolean
          legacy_member_srl: number | null
          name: string
          owner_profile_id: string | null
          rating_avg: number
          rating_count: number
          region: string | null
          source: string
          updated_at: string
          ykiho: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          is_claimed?: boolean
          legacy_member_srl?: number | null
          name: string
          owner_profile_id?: string | null
          rating_avg?: number
          rating_count?: number
          region?: string | null
          source?: string
          updated_at?: string
          ykiho?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          is_claimed?: boolean
          legacy_member_srl?: number | null
          name?: string
          owner_profile_id?: string | null
          rating_avg?: number
          rating_count?: number
          region?: string | null
          source?: string
          updated_at?: string
          ykiho?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hospitals_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          benefits: string[]
          created_at: string
          description: string | null
          employment_type: string | null
          external_id: string | null
          external_url: string | null
          hospital_id: string
          id: string
          is_featured: boolean
          location: string | null
          posted_at: string
          salary_text: string | null
          source: string
          specialty: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          benefits?: string[]
          created_at?: string
          description?: string | null
          employment_type?: string | null
          external_id?: string | null
          external_url?: string | null
          hospital_id: string
          id?: string
          is_featured?: boolean
          location?: string | null
          posted_at?: string
          salary_text?: string | null
          source?: string
          specialty?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          benefits?: string[]
          created_at?: string
          description?: string | null
          employment_type?: string | null
          external_id?: string | null
          external_url?: string | null
          hospital_id?: string
          id?: string
          is_featured?: boolean
          location?: string | null
          posted_at?: string
          salary_text?: string | null
          source?: string
          specialty?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          birthday: string | null
          business_no: string | null
          business_verified: boolean
          business_verified_at: string | null
          claimed_hospital_id: string | null
          created_at: string
          display_name: string | null
          email: string | null
          full_name: string | null
          gender: string | null
          id: string
          is_open_to_work: boolean
          legacy_member_srl: number | null
          phone_number: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          birthday?: string | null
          business_no?: string | null
          business_verified?: boolean
          business_verified_at?: string | null
          claimed_hospital_id?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          gender?: string | null
          id: string
          is_open_to_work?: boolean
          legacy_member_srl?: number | null
          phone_number?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          birthday?: string | null
          business_no?: string | null
          business_verified?: boolean
          business_verified_at?: string | null
          claimed_hospital_id?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          gender?: string | null
          id?: string
          is_open_to_work?: boolean
          legacy_member_srl?: number | null
          phone_number?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_claimed_hospital_id_fkey"
            columns: ["claimed_hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      resumes: {
        Row: {
          created_at: string
          desired_employment_type: string | null
          desired_location: string | null
          desired_salary: string | null
          education: string | null
          experience_years: number | null
          intro: string | null
          is_public: boolean
          license_no: string | null
          license_type: string | null
          name: string | null
          phone: string | null
          profile_id: string
          specialties: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          desired_employment_type?: string | null
          desired_location?: string | null
          desired_salary?: string | null
          education?: string | null
          experience_years?: number | null
          intro?: string | null
          is_public?: boolean
          license_no?: string | null
          license_type?: string | null
          name?: string | null
          phone?: string | null
          profile_id: string
          specialties?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          desired_employment_type?: string | null
          desired_location?: string | null
          desired_salary?: string | null
          education?: string | null
          experience_years?: number | null
          intro?: string | null
          is_public?: boolean
          license_no?: string | null
          license_type?: string | null
          name?: string | null
          phone?: string | null
          profile_id?: string
          specialties?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resumes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          author_id: string
          content: string
          created_at: string
          hospital_id: string
          id: string
          is_hidden: boolean
          rating: number
          report_count: number
          updated_at: string
          work_period: string | null
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          hospital_id: string
          id?: string
          is_hidden?: boolean
          rating: number
          report_count?: number
          updated_at?: string
          work_period?: string | null
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          hospital_id?: string
          id?: string
          is_hidden?: boolean
          rating?: number
          report_count?: number
          updated_at?: string
          work_period?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      recompute_hospital_rating: { Args: { h: string }; Returns: undefined }
    }
    Enums: {
      user_role: "nurse" | "hospital" | "admin"
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
    Enums: {
      user_role: ["nurse", "hospital", "admin"],
    },
  },
} as const

