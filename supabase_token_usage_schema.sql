-- ============================================
-- Token Usage Tracking Schema
-- ============================================
-- Tracks OpenAI API token usage per organization
-- ============================================

-- TOKEN_USAGE TABLE
CREATE TABLE IF NOT EXISTS token_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  model TEXT NOT NULL, -- e.g., 'gpt-4o-mini', 'text-embedding-3-small'
  operation_type TEXT NOT NULL CHECK (operation_type IN ('chat', 'embedding', 'document_processing')),
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd DECIMAL(10, 6) DEFAULT 0, -- Cost in USD
  metadata JSONB, -- Additional metadata (e.g., document_id, question_text)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_token_usage_organization_id ON token_usage(organization_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_created_at ON token_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_token_usage_model ON token_usage(model);
CREATE INDEX IF NOT EXISTS idx_token_usage_operation_type ON token_usage(operation_type);

-- Enable RLS
ALTER TABLE token_usage ENABLE ROW LEVEL SECURITY;

-- RLS Policies for token_usage
-- Users can view token usage for their organization
CREATE POLICY "Users can view token usage for their organization"
  ON token_usage FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM user_organizations 
      WHERE user_id = auth.uid()
    )
  );

-- Admins can view all token usage
CREATE POLICY "Admins can view all token usage"
  ON token_usage FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Service role can insert token usage (for Edge Functions)
CREATE POLICY "Service role can insert token usage"
  ON token_usage FOR INSERT
  WITH CHECK (true); -- Edge Functions use service role key which bypasses RLS

-- Function to calculate token costs based on model
-- Pricing as of 2024 (update as needed):
-- - gpt-4o-mini: $0.15/$0.60 per 1M tokens (input/output)
-- - text-embedding-3-small: $0.02 per 1M tokens
CREATE OR REPLACE FUNCTION calculate_token_cost(
  p_model TEXT,
  p_prompt_tokens INTEGER,
  p_completion_tokens INTEGER
) RETURNS DECIMAL(10, 6) AS $$
DECLARE
  input_cost_per_1m DECIMAL(10, 6);
  output_cost_per_1m DECIMAL(10, 6);
  total_cost DECIMAL(10, 6);
BEGIN
  -- Set pricing per model (per 1M tokens)
  CASE p_model
    WHEN 'gpt-4o-mini' THEN
      input_cost_per_1m := 0.15;
      output_cost_per_1m := 0.60;
    WHEN 'gpt-4o' THEN
      input_cost_per_1m := 2.50;
      output_cost_per_1m := 10.00;
    WHEN 'gpt-3.5-turbo' THEN
      input_cost_per_1m := 0.50;
      output_cost_per_1m := 1.50;
    WHEN 'text-embedding-3-small' THEN
      input_cost_per_1m := 0.02;
      output_cost_per_1m := 0.00; -- Embeddings only have input
    WHEN 'text-embedding-ada-002' THEN
      input_cost_per_1m := 0.10;
      output_cost_per_1m := 0.00;
    ELSE
      -- Default pricing (conservative estimate)
      input_cost_per_1m := 1.00;
      output_cost_per_1m := 3.00;
  END CASE;

  -- Calculate cost: (tokens / 1,000,000) * cost_per_1m
  total_cost := (p_prompt_tokens::DECIMAL / 1000000.0 * input_cost_per_1m) +
                (p_completion_tokens::DECIMAL / 1000000.0 * output_cost_per_1m);

  RETURN total_cost;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

