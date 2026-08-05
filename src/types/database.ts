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
      ad_orders: {
        Row: {
          amount: number
          cash_used: number
          buyer_id: string | null
          created_at: string
          days: number
          hospital_id: string | null
          id: string
          imp_uid: string | null
          job_id: string | null
          merchant_uid: string
          note: string | null
          paid_at: string | null
          status: string
          supply_amount: number
          tax_biz_name: string | null
          tax_biz_no: string | null
          tax_ceo: string | null
          tax_email: string | null
          tax_invoice_no: string | null
          tax_issued_at: string | null
          tier: string
          vat: number
        }
        Insert: {
          amount: number
          cash_used?: number
          buyer_id?: string | null
          created_at?: string
          days: number
          hospital_id?: string | null
          id?: string
          imp_uid?: string | null
          job_id?: string | null
          merchant_uid: string
          note?: string | null
          paid_at?: string | null
          status?: string
          supply_amount: number
          tax_biz_name?: string | null
          tax_biz_no?: string | null
          tax_ceo?: string | null
          tax_email?: string | null
          tax_invoice_no?: string | null
          tax_issued_at?: string | null
          tier: string
          vat: number
        }
        Update: {
          amount?: number
          cash_used?: number
          buyer_id?: string | null
          created_at?: string
          days?: number
          hospital_id?: string | null
          id?: string
          imp_uid?: string | null
          job_id?: string | null
          merchant_uid?: string
          note?: string | null
          paid_at?: string | null
          status?: string
          supply_amount?: number
          tax_biz_name?: string | null
          tax_biz_no?: string | null
          tax_ceo?: string | null
          tax_email?: string | null
          tax_invoice_no?: string | null
          tax_issued_at?: string | null
          tier?: string
          vat?: number
        }
        Relationships: [
          {
            foreignKeyName: "ad_orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_orders_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_orders_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_orders_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs_listed"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_actions: {
        Row: {
          action: string
          actor_email: string
          actor_id: string | null
          created_at: string
          id: string
          reason: string
          target_id: string
          target_table: string
        }
        Insert: {
          action: string
          actor_email?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          reason: string
          target_id: string
          target_table: string
        }
        Update: {
          action?: string
          actor_email?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          reason?: string
          target_id?: string
          target_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_actions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      application_notes: {
        Row: {
          application_id: string
          memo: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          application_id: string
          memo?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          application_id?: string
          memo?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "application_notes_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_notes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          applicant_id: string
          created_at: string
          id: string
          job_id: string
          message: string | null
          status: string
          updated_at: string
        }
        Insert: {
          applicant_id: string
          created_at?: string
          id?: string
          job_id: string
          message?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          applicant_id?: string
          created_at?: string
          id?: string
          job_id?: string
          message?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs_listed"
            referencedColumns: ["id"]
          },
        ]
      }
      board_comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          is_hidden: boolean
          legacy_nickname: string | null
          legacy_srl: number | null
          post_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          is_hidden?: boolean
          legacy_nickname?: string | null
          legacy_srl?: number | null
          post_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          is_hidden?: boolean
          legacy_nickname?: string | null
          legacy_srl?: number | null
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "board_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      board_posts: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          images: string[]
          is_hidden: boolean
          legacy_nickname: string | null
          legacy_srl: number | null
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          images?: string[]
          is_hidden?: boolean
          legacy_nickname?: string | null
          legacy_srl?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          images?: string[]
          is_hidden?: boolean
          legacy_nickname?: string | null
          legacy_srl?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hospitals: {
        Row: {
          address: string | null
          created_at: string
          id: string
          is_claimed: boolean
          is_test: boolean
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
          is_test?: boolean
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
          is_test?: boolean
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
      inquiries: {
        Row: {
          admin_memo: string | null
          answered_at: string | null
          author_id: string | null
          body: string
          created_at: string
          email: string
          id: string
          kind: string
          name: string
          phone: string | null
          status: string
          subject: string
        }
        Insert: {
          admin_memo?: string | null
          answered_at?: string | null
          author_id?: string | null
          body: string
          created_at?: string
          email: string
          id?: string
          kind: string
          name: string
          phone?: string | null
          status?: string
          subject: string
        }
        Update: {
          admin_memo?: string | null
          answered_at?: string | null
          author_id?: string | null
          body?: string
          created_at?: string
          email?: string
          id?: string
          kind?: string
          name?: string
          phone?: string | null
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiries_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          ad_tier: string | null
          apply_detail: string | null
          apply_email: string | null
          apply_method: string
          apply_methods: string[]
          benefits: string[]
          company_name: string | null
          created_at: string
          deadline: string | null
          description: string | null
          detail_fetched_at: string | null
          employment_type: string | null
          external_id: string | null
          external_url: string | null
          facility_type: string | null
          featured_until: string | null
          geocoded_at: string | null
          hospital_id: string | null
          id: string
          is_featured: boolean
          job_category: string | null
          lat: number | null
          lng: number | null
          location: string | null
          manager_name: string | null
          manager_phone: string | null
          posted_at: string
          recruit_count: number | null
          salary_text: string | null
          shift_type: string | null
          sido: string | null
          sigungu: string | null
          source: string
          specialty: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          ad_tier?: string | null
          apply_detail?: string | null
          apply_email?: string | null
          apply_method?: string
          apply_methods?: string[]
          benefits?: string[]
          company_name?: string | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          detail_fetched_at?: string | null
          employment_type?: string | null
          external_id?: string | null
          external_url?: string | null
          facility_type?: string | null
          featured_until?: string | null
          geocoded_at?: string | null
          hospital_id?: string | null
          id?: string
          is_featured?: boolean
          job_category?: string | null
          lat?: number | null
          lng?: number | null
          location?: string | null
          manager_name?: string | null
          manager_phone?: string | null
          posted_at?: string
          recruit_count?: number | null
          salary_text?: string | null
          shift_type?: string | null
          sido?: string | null
          sigungu?: string | null
          source?: string
          specialty?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          ad_tier?: string | null
          apply_detail?: string | null
          apply_email?: string | null
          apply_method?: string
          apply_methods?: string[]
          benefits?: string[]
          company_name?: string | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          detail_fetched_at?: string | null
          employment_type?: string | null
          external_id?: string | null
          external_url?: string | null
          facility_type?: string | null
          featured_until?: string | null
          geocoded_at?: string | null
          hospital_id?: string | null
          id?: string
          is_featured?: boolean
          job_category?: string | null
          lat?: number | null
          lng?: number | null
          location?: string | null
          manager_name?: string | null
          manager_phone?: string | null
          posted_at?: string
          recruit_count?: number | null
          salary_text?: string | null
          shift_type?: string | null
          sido?: string | null
          sigungu?: string | null
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
      messages: {
        Row: {
          body: string
          created_at: string
          id: string
          is_read: boolean
          recipient_id: string
          recipient_name: string | null
          sender_id: string
          sender_name: string | null
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_read?: boolean
          recipient_id: string
          recipient_name?: string | null
          sender_id: string
          sender_name?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_read?: boolean
          recipient_id?: string
          recipient_name?: string | null
          sender_id?: string
          sender_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      page_views: {
        Row: {
          day: string
          path: string
          views: number
        }
        Insert: {
          day: string
          path: string
          views?: number
        }
        Update: {
          day?: string
          path?: string
          views?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ad_cash: number
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
          signup_provider: string | null
          last_login_provider: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          ad_cash?: number
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
          signup_provider?: string | null
          last_login_provider?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          ad_cash?: number
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
          signup_provider?: string | null
          last_login_provider?: string | null
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
          apn_field: string | null
          available_from: string | null
          can_charge: boolean | null
          career_level: string | null
          certifications: string[]
          created_at: string
          desired_employment_type: string | null
          desired_hospital_types: string[]
          desired_location: string | null
          desired_salary: string | null
          education: string | null
          education_level: string | null
          email: string | null
          experience_years: number | null
          graduation_status: string | null
          has_integrated_care: boolean | null
          intro: string | null
          is_public: boolean
          job_categories: string[]
          last_edited_at: string | null
          license_reported: boolean | null
          license_type: string | null
          license_year: number | null
          name: string | null
          needs_dormitory: boolean | null
          night_available: boolean | null
          phone: string | null
          profile_id: string
          residence_region: string | null
          resume_title: string | null
          search_text: string | null
          shift_types: string[]
          specialties: string[]
          updated_at: string
        }
        Insert: {
          apn_field?: string | null
          available_from?: string | null
          can_charge?: boolean | null
          career_level?: string | null
          certifications?: string[]
          created_at?: string
          desired_employment_type?: string | null
          desired_hospital_types?: string[]
          desired_location?: string | null
          desired_salary?: string | null
          education?: string | null
          education_level?: string | null
          email?: string | null
          experience_years?: number | null
          graduation_status?: string | null
          has_integrated_care?: boolean | null
          intro?: string | null
          is_public?: boolean
          job_categories?: string[]
          last_edited_at?: string | null
          license_reported?: boolean | null
          license_type?: string | null
          license_year?: number | null
          name?: string | null
          needs_dormitory?: boolean | null
          night_available?: boolean | null
          phone?: string | null
          profile_id: string
          residence_region?: string | null
          resume_title?: string | null
          search_text?: string | null
          shift_types?: string[]
          specialties?: string[]
          updated_at?: string
        }
        Update: {
          apn_field?: string | null
          available_from?: string | null
          can_charge?: boolean | null
          career_level?: string | null
          certifications?: string[]
          created_at?: string
          desired_employment_type?: string | null
          desired_hospital_types?: string[]
          desired_location?: string | null
          desired_salary?: string | null
          education?: string | null
          education_level?: string | null
          email?: string | null
          experience_years?: number | null
          graduation_status?: string | null
          has_integrated_care?: boolean | null
          intro?: string | null
          is_public?: boolean
          job_categories?: string[]
          last_edited_at?: string | null
          license_reported?: boolean | null
          license_type?: string | null
          license_year?: number | null
          name?: string | null
          needs_dormitory?: boolean | null
          night_available?: boolean | null
          phone?: string | null
          profile_id?: string
          residence_region?: string | null
          resume_title?: string | null
          search_text?: string | null
          shift_types?: string[]
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
      saved_jobs: {
        Row: {
          created_at: string
          id: string
          job_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_jobs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_jobs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs_listed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_jobs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_searches: {
        Row: {
          created_at: string
          id: string
          keyword: string | null
          location: string | null
          profile_id: string
          sido: string | null
          sigungu: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          keyword?: string | null
          location?: string | null
          profile_id: string
          sido?: string | null
          sigungu?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          keyword?: string | null
          location?: string | null
          profile_id?: string
          sido?: string | null
          sigungu?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_searches_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      site_posts: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          published_at: string | null
          sort: number
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          kind: string
          published_at?: string | null
          sort?: number
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          published_at?: string | null
          sort?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      work_experiences: {
        Row: {
          bed_range: string | null
          created_at: string
          department: string | null
          duties: string | null
          end_ym: string | null
          hospital_name: string
          hospital_type: string | null
          id: string
          is_current: boolean
          position: string | null
          resume_id: string
          shift_type: string | null
          sort_order: number
          start_ym: string
        }
        Insert: {
          bed_range?: string | null
          created_at?: string
          department?: string | null
          duties?: string | null
          end_ym?: string | null
          hospital_name: string
          hospital_type?: string | null
          id?: string
          is_current?: boolean
          position?: string | null
          resume_id: string
          shift_type?: string | null
          sort_order?: number
          start_ym: string
        }
        Update: {
          bed_range?: string | null
          created_at?: string
          department?: string | null
          duties?: string | null
          end_ym?: string | null
          hospital_name?: string
          hospital_type?: string | null
          id?: string
          is_current?: boolean
          position?: string | null
          resume_id?: string
          shift_type?: string | null
          sort_order?: number
          start_ym?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_experiences_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["profile_id"]
          },
        ]
      }
    }
    Views: {
      jobs_listed: {
        Row: {
          ad_live: boolean | null
          is_live: boolean | null
          ad_tier: string | null
          apply_detail: string | null
          apply_email: string | null
          apply_method: string | null
          apply_methods: string[] | null
          benefits: string[] | null
          company_name: string | null
          created_at: string | null
          deadline: string | null
          description: string | null
          detail_fetched_at: string | null
          employment_type: string | null
          external_id: string | null
          external_url: string | null
          facility_type: string | null
          featured_until: string | null
          geocoded_at: string | null
          hospital_id: string | null
          id: string | null
          is_featured: boolean | null
          job_category: string | null
          lat: number | null
          lng: number | null
          location: string | null
          manager_name: string | null
          manager_phone: string | null
          posted_at: string | null
          recruit_count: number | null
          salary_text: string | null
          shift_type: string | null
          sido: string | null
          sigungu: string | null
          source: string | null
          specialty: string | null
          status: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          ad_live?: never
          is_live?: never
          ad_tier?: string | null
          apply_detail?: string | null
          apply_email?: string | null
          apply_method?: string | null
          apply_methods?: string[] | null
          benefits?: string[] | null
          company_name?: string | null
          created_at?: string | null
          deadline?: string | null
          description?: string | null
          detail_fetched_at?: string | null
          employment_type?: string | null
          external_id?: string | null
          external_url?: string | null
          facility_type?: string | null
          featured_until?: string | null
          geocoded_at?: string | null
          hospital_id?: string | null
          id?: string | null
          is_featured?: boolean | null
          job_category?: string | null
          lat?: number | null
          lng?: number | null
          location?: string | null
          manager_name?: string | null
          manager_phone?: string | null
          posted_at?: string | null
          recruit_count?: number | null
          salary_text?: string | null
          shift_type?: string | null
          sido?: string | null
          sigungu?: string | null
          source?: string | null
          specialty?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          ad_live?: never
          is_live?: never
          ad_tier?: string | null
          apply_detail?: string | null
          apply_email?: string | null
          apply_method?: string | null
          apply_methods?: string[] | null
          benefits?: string[] | null
          company_name?: string | null
          created_at?: string | null
          deadline?: string | null
          description?: string | null
          detail_fetched_at?: string | null
          employment_type?: string | null
          external_id?: string | null
          external_url?: string | null
          facility_type?: string | null
          featured_until?: string | null
          geocoded_at?: string | null
          hospital_id?: string | null
          id?: string | null
          is_featured?: boolean | null
          job_category?: string | null
          lat?: number | null
          lng?: number | null
          location?: string | null
          manager_name?: string | null
          manager_phone?: string | null
          posted_at?: string | null
          recruit_count?: number | null
          salary_text?: string | null
          shift_type?: string | null
          sido?: string | null
          sigungu?: string | null
          source?: string | null
          specialty?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
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
    }
    Functions: {
      admin_dashboard: { Args: never; Returns: Json }
      claim_ad_cash: { Args: { p_profile: string; p_want: number }; Returns: number }
      release_ad_cash: { Args: { p_profile: string; p_amount: number }; Returns: undefined }
      release_ad_order_cash: {
        Args: { p_order: string; p_allowed: string[]; p_next: string }
        Returns: number
      }
      admin_set_hidden: {
        Args: {
          hide: boolean
          reason: string
          target_id: string
          target_table: string
        }
        Returns: undefined
      }
      admin_traffic: { Args: { days?: number }; Returns: Json }
      clean_person_name: { Args: { v: string }; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      is_community_member: { Args: never; Returns: boolean }
      is_talent_advertiser: { Args: never; Returns: boolean }
      nurse_axis_match: { Args: { p: string; v: string }; Returns: boolean }
      nurse_job_facet_list: {
        Args: {
          p_category?: string
          p_employment?: string
          p_facility?: string
          p_keyword?: string
          p_location?: string
          p_sido?: string
          p_sigungu?: string
          p_specialty?: string
        }
        Returns: {
          cnt: number
          kind: string
          name: string
        }[]
      }
      nurse_job_sido_list: {
        Args: {
          p_category?: string
          p_employment?: string
          p_facility?: string
          p_keyword?: string
          p_location?: string
          p_specialty?: string
        }
        Returns: {
          cnt: number
          name: string
        }[]
      }
      nurse_job_sigungu_list: {
        Args: {
          p_category?: string
          p_employment?: string
          p_facility?: string
          p_keyword?: string
          p_location?: string
          p_sido: string
          p_specialty?: string
        }
        Returns: {
          cnt: number
          name: string
        }[]
      }
      nurse_talent_facet_list: {
        Args: never
        Returns: {
          cnt: number
          kind: string
          name: string
        }[]
      }
      nurse_talent_sido_list: {
        Args: never
        Returns: {
          cnt: number
          name: string
        }[]
      }
      nurse_talent_sigungu_list: {
        Args: { p_sido: string }
        Returns: {
          cnt: number
          name: string
        }[]
      }
      recompute_hospital_rating: { Args: { h: string }; Returns: undefined }
      resume_masked_text: {
        Args: { p_name: string; p_text: string }
        Returns: string
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      track_page_view: { Args: { p_path: string }; Returns: undefined }
      valid_person_name: { Args: { v: string }; Returns: string }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      user_role: ["nurse", "hospital", "admin"],
    },
  },
} as const
