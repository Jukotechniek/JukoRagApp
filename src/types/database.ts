// Database types voor Supabase
// Deze types komen overeen met je database schema

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          plan: 'starter' | 'professional';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          plan: 'starter' | 'professional';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          plan?: 'starter' | 'professional';
          created_at?: string;
          updated_at?: string;
        };
      };
      users: {
        Row: {
          id: string;
          email: string;
          name: string;
          role: 'admin' | 'manager' | 'technician';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          name: string;
          role: 'admin' | 'manager' | 'technician';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          name?: string;
          role?: 'admin' | 'manager' | 'technician';
          created_at?: string;
          updated_at?: string;
        };
      };
      user_organizations: {
        Row: {
          id: string;
          user_id: string;
          organization_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          organization_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          organization_id?: string;
          created_at?: string;
        };
      };
      documents: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          file_type: string;
          file_size: number;
          file_url: string | null;
          uploaded_by: string | null;
          use_for_rag: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          file_type: string;
          file_size: number;
          file_url?: string | null;
          uploaded_by?: string | null;
          use_for_rag?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          file_type?: string;
          file_size?: number;
          file_url?: string | null;
          uploaded_by?: string | null;
          use_for_rag?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      chat_messages: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string | null;
          role: 'user' | 'assistant';
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id?: string | null;
          role: 'user' | 'assistant';
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string | null;
          role?: 'user' | 'assistant';
          content?: string;
          created_at?: string;
        };
      };
      invoices: {
        Row: {
          id: string;
          organization_id: string;
          invoice_number: string;
          amount: number;
          plan: string;
          status: 'paid' | 'pending' | 'overdue';
          due_date: string | null;
          paid_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          invoice_number: string;
          amount: number;
          plan: string;
          status: 'paid' | 'pending' | 'overdue';
          due_date?: string | null;
          paid_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          invoice_number?: string;
          amount?: number;
          plan?: string;
          status?: 'paid' | 'pending' | 'overdue';
          due_date?: string | null;
          paid_at?: string | null;
          created_at?: string;
        };
      };
      analytics: {
        Row: {
          id: string;
          organization_id: string;
          event_type: string;
          event_data: Record<string, any> | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          event_type: string;
          event_data?: Record<string, any> | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          event_type?: string;
          event_data?: Record<string, any> | null;
          created_at?: string;
        };
      };
      document_sections: {
        Row: {
          id: number;
          document_id: string;
          content: string;
          embedding: number[] | null; // vector(1536) as array - OpenAI embeddings
          metadata: Record<string, any> | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          document_id: string;
          content: string;
          embedding?: number[] | null;
          metadata?: Record<string, any> | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          document_id?: string;
          content?: string;
          embedding?: number[] | null;
          metadata?: Record<string, any> | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      token_usage: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string | null;
          model: string;
          operation_type: 'chat' | 'embedding' | 'document_processing';
          prompt_tokens: number;
          completion_tokens: number;
          total_tokens: number;
          cost_usd: number;
          metadata: Record<string, any> | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id?: string | null;
          model: string;
          operation_type: 'chat' | 'embedding' | 'document_processing';
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
          cost_usd?: number;
          metadata?: Record<string, any> | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string | null;
          model?: string;
          operation_type?: 'chat' | 'embedding' | 'document_processing';
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
          cost_usd?: number;
          metadata?: Record<string, any> | null;
          created_at?: string;
        };
      };
    };
    Views: {
      user_with_organization: {
        Row: {
          id: string;
          email: string;
          name: string;
          role: 'admin' | 'manager' | 'technician';
          created_at: string;
          organization_id: string | null;
          organization_name: string | null;
          organization_plan: 'starter' | 'professional' | null;
        };
      };
    };
    Functions: {
      match_document_sections: {
        Args: {
          p_organization_id: string;
          query_embedding: number[]; // Array of 1536 numbers (OpenAI embedding)
          match_count?: number;
          match_threshold?: number;
        };
        Returns: {
          id: number;
          document_id: string;
          content: string;
          metadata: Record<string, any> | null;
          similarity: number;
          document_name: string;
          document_file_url: string | null;
        }[];
      };
      get_document_sections: {
        Args: {
          p_document_id: string;
        };
        Returns: {
          id: number;
          content: string;
          metadata: Record<string, any> | null;
          created_at: string;
        }[];
      };
      calculate_token_cost: {
        Args: {
          p_model: string;
          p_prompt_tokens: number;
          p_completion_tokens: number;
        };
        Returns: number;
      };
    };
  };
};

