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
      bell_alerts: {
        Row: {
          acknowledged: boolean
          created_at: string
          id: string
          ticket_id: string
        }
        Insert: {
          acknowledged?: boolean
          created_at?: string
          id?: string
          ticket_id: string
        }
        Update: {
          acknowledged?: boolean
          created_at?: string
          id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bell_alerts_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      dishes: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_available: boolean
          name: string
          price: number
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_available?: boolean
          name: string
          price: number
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_available?: boolean
          name?: string
          price?: number
          sort_order?: number
        }
        Relationships: []
      }
      ticket_items: {
        Row: {
          completed_at: string | null
          dish_id: string
          id: string
          quantity: number
          status: Database["public"]["Enums"]["item_status"]
          ticket_id: string
        }
        Insert: {
          completed_at?: string | null
          dish_id: string
          id?: string
          quantity: number
          status?: Database["public"]["Enums"]["item_status"]
          ticket_id: string
        }
        Update: {
          completed_at?: string | null
          dish_id?: string
          id?: string
          quantity?: number
          status?: Database["public"]["Enums"]["item_status"]
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_items_dish_id_fkey"
            columns: ["dish_id"]
            isOneToOne: false
            referencedRelation: "dishes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_items_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          cancelled_at: string | null
          closed_at: string | null
          created_at: string
          id: string
          paid_at: string | null
          payment_requested_at: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          queue_number: number
          status: Database["public"]["Enums"]["ticket_status"]
          table_number: number
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          paid_at?: string | null
          payment_requested_at?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          queue_number?: number
          status?: Database["public"]["Enums"]["ticket_status"]
          table_number: number
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          paid_at?: string | null
          payment_requested_at?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          queue_number?: number
          status?: Database["public"]["Enums"]["ticket_status"]
          table_number?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acknowledge_bell: { Args: { p_alert_id: string }; Returns: undefined }
      cancel_ticket: {
        Args: { p_ticket_id: string }
        Returns: {
          cancelled_at: string | null
          closed_at: string | null
          created_at: string
          id: string
          paid_at: string | null
          payment_requested_at: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          queue_number: number
          status: Database["public"]["Enums"]["ticket_status"]
          table_number: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_dish_batch: { Args: { p_dish_id: string }; Returns: number }
      confirm_payment: {
        Args: { p_ticket_id: string }
        Returns: {
          cancelled_at: string | null
          closed_at: string | null
          created_at: string
          id: string
          paid_at: string | null
          payment_requested_at: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          queue_number: number
          status: Database["public"]["Enums"]["ticket_status"]
          table_number: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_ticket_item: { Args: { p_item_id: string }; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_kitchen_staff: { Args: { _user_id: string }; Returns: boolean }
      place_order: {
        Args: { p_items: Json; p_table_number: number }
        Returns: {
          cancelled_at: string | null
          closed_at: string | null
          created_at: string
          id: string
          paid_at: string | null
          payment_requested_at: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          queue_number: number
          status: Database["public"]["Enums"]["ticket_status"]
          table_number: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reopen_ticket: {
        Args: { p_ticket_id: string }
        Returns: {
          cancelled_at: string | null
          closed_at: string | null
          created_at: string
          id: string
          paid_at: string | null
          payment_requested_at: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          queue_number: number
          status: Database["public"]["Enums"]["ticket_status"]
          table_number: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_payment: {
        Args: { p_ticket_id: string }
        Returns: {
          cancelled_at: string | null
          closed_at: string | null
          created_at: string
          id: string
          paid_at: string | null
          payment_requested_at: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          queue_number: number
          status: Database["public"]["Enums"]["ticket_status"]
          table_number: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ring_bell: {
        Args: { p_ticket_id: string }
        Returns: {
          acknowledged: boolean
          created_at: string
          id: string
          ticket_id: string
        }
        SetofOptions: {
          from: "*"
          to: "bell_alerts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      toggle_dish_availability: {
        Args: { p_dish_id: string }
        Returns: {
          created_at: string
          description: string | null
          id: string
          is_available: boolean
          name: string
          price: number
          sort_order: number
        }
        SetofOptions: {
          from: "*"
          to: "dishes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_ticket_item_quantity: {
        Args: { p_item_id: string; p_quantity: number }
        Returns: {
          completed_at: string | null
          dish_id: string
          id: string
          quantity: number
          status: Database["public"]["Enums"]["item_status"]
          ticket_id: string
        }
        SetofOptions: {
          from: "*"
          to: "ticket_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "admin" | "kitchen"
      item_status: "pending" | "done"
      payment_status: "none" | "requested" | "paid"
      ticket_status: "waiting" | "in_progress" | "served"
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
      app_role: ["admin", "kitchen"],
      item_status: ["pending", "done"],
      payment_status: ["none", "requested", "paid"],
      ticket_status: ["waiting", "in_progress", "served"],
    },
  },
} as const
