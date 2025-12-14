-- ============================================
-- TechRAG Database Schema voor Supabase
-- ============================================
-- Dit schema bevat alle tabellen en RLS policies
-- voor een veilige multi-tenant applicatie
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- STEP 1: CREATE ALL TABLES (without policies)
-- ============================================

-- ORGANIZATIONS TABLE
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('starter', 'professional')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- USERS TABLE
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'technician')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- USER_ORGANIZATIONS TABLE (Many-to-Many)
CREATE TABLE user_organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, organization_id)
);

-- DOCUMENTS TABLE
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  file_url TEXT,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CHAT_MESSAGES TABLE
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INVOICES TABLE
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL UNIQUE,
  amount DECIMAL(10, 2) NOT NULL,
  plan TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('paid', 'pending', 'overdue')),
  due_date DATE,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ANALYTICS TABLE
CREATE TABLE analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- STEP 2: ENABLE ROW LEVEL SECURITY
-- ============================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 3: CREATE RLS POLICIES
-- ============================================

-- Organizations Policies
CREATE POLICY "Users can view their own organization"
  ON organizations FOR SELECT
  USING (
    id IN (
      SELECT organization_id FROM user_organizations 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all organizations"
  ON organizations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Users Policies
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can view users in their organization"
  ON users FOR SELECT
  USING (
    id IN (
      SELECT uo2.user_id FROM user_organizations uo1
      JOIN user_organizations uo2 ON uo1.organization_id = uo2.organization_id
      WHERE uo1.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all users"
  ON users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Managers can create users in their organization"
  ON users FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      JOIN user_organizations uo ON u.id = uo.user_id
      WHERE u.id = auth.uid() 
      AND u.role IN ('admin', 'manager')
      AND uo.organization_id IN (
        SELECT organization_id FROM user_organizations 
        WHERE user_id = auth.uid()
      )
    )
  );

-- User_Organizations Policies
CREATE POLICY "Users can view their own organization memberships"
  ON user_organizations FOR SELECT
  USING (
    user_id = auth.uid() 
    OR organization_id IN (
      SELECT organization_id FROM user_organizations 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all memberships"
  ON user_organizations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Managers can add users to their organization"
  ON user_organizations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      JOIN user_organizations uo ON u.id = uo.user_id
      WHERE u.id = auth.uid() 
      AND u.role IN ('admin', 'manager')
      AND uo.organization_id = organization_id
    )
  );

-- Documents Policies
CREATE POLICY "Users can view documents in their organization"
  ON documents FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM user_organizations 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Managers can upload documents"
  ON documents FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM user_organizations 
      WHERE user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Managers can delete documents"
  ON documents FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM user_organizations 
      WHERE user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'manager')
    )
  );

-- Chat Messages Policies
CREATE POLICY "Users can view messages in their organization"
  ON chat_messages FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM user_organizations 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create messages in their organization"
  ON chat_messages FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM user_organizations 
      WHERE user_id = auth.uid()
    )
  );

-- Invoices Policies
CREATE POLICY "Users can view invoices in their organization"
  ON invoices FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM user_organizations 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all invoices"
  ON invoices FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can create invoices"
  ON invoices FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update invoices"
  ON invoices FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Analytics Policies
CREATE POLICY "Users can view analytics in their organization"
  ON analytics FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM user_organizations 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all analytics"
  ON analytics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Service role can insert analytics"
  ON analytics FOR INSERT
  WITH CHECK (true);

-- ============================================
-- INDEXES for Performance
-- ============================================
CREATE INDEX idx_user_organizations_user_id ON user_organizations(user_id);
CREATE INDEX idx_user_organizations_org_id ON user_organizations(organization_id);
CREATE INDEX idx_documents_org_id ON documents(organization_id);
CREATE INDEX idx_chat_messages_org_id ON chat_messages(organization_id);
CREATE INDEX idx_chat_messages_created_at ON chat_messages(created_at DESC);
CREATE INDEX idx_invoices_org_id ON invoices(organization_id);
CREATE INDEX idx_analytics_org_id ON analytics(organization_id);
CREATE INDEX idx_analytics_created_at ON analytics(created_at DESC);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to get user's organization
CREATE OR REPLACE FUNCTION get_user_organization(user_uuid UUID)
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT organization_id 
    FROM user_organizations 
    WHERE user_id = user_uuid 
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- VIEWS for easier queries
-- ============================================

-- View for user with organization info
CREATE OR REPLACE VIEW user_with_organization AS
SELECT 
  u.id,
  u.email,
  u.name,
  u.role,
  u.created_at,
  o.id as organization_id,
  o.name as organization_name,
  o.plan as organization_plan
FROM users u
LEFT JOIN user_organizations uo ON u.id = uo.user_id
LEFT JOIN organizations o ON uo.organization_id = o.id;

-- Enable RLS on view
ALTER VIEW user_with_organization SET (security_invoker = true);

-- ============================================
-- INITIAL DATA (Optional - for testing)
-- ============================================

-- Insert default admin organization
INSERT INTO organizations (id, name, plan) 
VALUES 
  ('00000000-0000-0000-0000-000000000001', 'TechRAG B.V.', 'professional')
ON CONFLICT DO NOTHING;

-- Note: Users will be created via Supabase Auth
-- After a user is created in auth.users, you need to:
-- 1. Insert into users table
-- 2. Insert into user_organizations table

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE organizations IS 'Organisaties die gebruik maken van TechRAG';
COMMENT ON TABLE users IS 'Gebruikers van het systeem';
COMMENT ON TABLE user_organizations IS 'Relatie tussen gebruikers en organisaties';
COMMENT ON TABLE documents IS 'Documenten per organisatie';
COMMENT ON TABLE chat_messages IS 'Chat geschiedenis per organisatie';
COMMENT ON TABLE invoices IS 'Facturen per organisatie';
COMMENT ON TABLE analytics IS 'Analytics data per organisatie';

