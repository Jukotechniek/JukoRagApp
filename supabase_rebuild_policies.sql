-- Complete rebuild van RLS policies ZONDER recursie
-- Voer dit uit in je Supabase SQL Editor

-- ============================================
-- STAP 1: Helper functies (voorkomen recursie)
-- ============================================

-- Functie om te checken of user admin is (zonder recursie)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Functie om te checken of user manager is (zonder recursie)
CREATE OR REPLACE FUNCTION is_manager()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() AND role IN ('admin', 'manager')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Functie om organization_id van user te krijgen (zonder recursie)
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT organization_id 
    FROM user_organizations 
    WHERE user_id = auth.uid() 
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================
-- STAP 2: USERS table policies
-- ============================================

-- Users kunnen zichzelf lezen
DROP POLICY IF EXISTS "Users can view own profile" ON users;
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  USING (id = auth.uid());

-- Users kunnen zichzelf aanmaken
DROP POLICY IF EXISTS "Users can create their own profile" ON users;
CREATE POLICY "Users can create their own profile"
  ON users FOR INSERT
  WITH CHECK (id = auth.uid());

-- Users kunnen zichzelf updaten
DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Admins kunnen alle users zien (gebruikt functie, geen recursie)
DROP POLICY IF EXISTS "Admins can view all users" ON users;
CREATE POLICY "Admins can view all users"
  ON users FOR SELECT
  USING (is_admin());

-- Managers kunnen users in hun organisatie zien (gebruikt functie)
DROP POLICY IF EXISTS "Managers can view users in their organization" ON users;
CREATE POLICY "Managers can view users in their organization"
  ON users FOR SELECT
  USING (
    is_manager() AND
    id IN (
      SELECT user_id 
      FROM user_organizations 
      WHERE organization_id = get_user_org_id()
    )
  );

-- Managers kunnen users aanmaken in hun organisatie
DROP POLICY IF EXISTS "Managers can create users in their organization" ON users;
CREATE POLICY "Managers can create users in their organization"
  ON users FOR INSERT
  WITH CHECK (
    is_manager() AND
    EXISTS (
      SELECT 1 FROM user_organizations
      WHERE user_id = auth.uid()
      AND organization_id IN (
        SELECT organization_id FROM user_organizations
        WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================
-- STAP 3: USER_ORGANIZATIONS table policies
-- ============================================

-- Users kunnen hun eigen memberships zien
DROP POLICY IF EXISTS "Users can view their own organization memberships" ON user_organizations;
CREATE POLICY "Users can view their own organization memberships"
  ON user_organizations FOR SELECT
  USING (user_id = auth.uid());

-- Admins kunnen alle memberships zien
DROP POLICY IF EXISTS "Admins can view all memberships" ON user_organizations;
CREATE POLICY "Admins can view all memberships"
  ON user_organizations FOR SELECT
  USING (is_admin());

-- Managers kunnen memberships in hun organisatie zien
DROP POLICY IF EXISTS "Managers can view memberships in their organization" ON user_organizations;
CREATE POLICY "Managers can view memberships in their organization"
  ON user_organizations FOR SELECT
  USING (
    is_manager() AND
    organization_id = get_user_org_id()
  );

-- Managers kunnen users toevoegen aan hun organisatie
DROP POLICY IF EXISTS "Managers can add users to their organization" ON user_organizations;
CREATE POLICY "Managers can add users to their organization"
  ON user_organizations FOR INSERT
  WITH CHECK (
    is_manager() AND
    organization_id = get_user_org_id()
  );

-- ============================================
-- STAP 4: ORGANIZATIONS table policies
-- ============================================

-- Users kunnen hun eigen organisatie zien
DROP POLICY IF EXISTS "Users can view their own organization" ON organizations;
CREATE POLICY "Users can view their own organization"
  ON organizations FOR SELECT
  USING (
    id = get_user_org_id()
  );

-- Admins kunnen alle organisaties zien
DROP POLICY IF EXISTS "Admins can view all organizations" ON organizations;
CREATE POLICY "Admins can view all organizations"
  ON organizations FOR SELECT
  USING (is_admin());

-- Admins kunnen organisaties aanmaken
DROP POLICY IF EXISTS "Admins can create organizations" ON organizations;
CREATE POLICY "Admins can create organizations"
  ON organizations FOR INSERT
  WITH CHECK (is_admin());

-- Admins kunnen organisaties updaten
DROP POLICY IF EXISTS "Admins can update organizations" ON organizations;
CREATE POLICY "Admins can update organizations"
  ON organizations FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

-- ============================================
-- STAP 5: DOCUMENTS table policies
-- ============================================

-- Users kunnen documenten in hun organisatie zien
DROP POLICY IF EXISTS "Users can view documents in their organization" ON documents;
CREATE POLICY "Users can view documents in their organization"
  ON documents FOR SELECT
  USING (
    organization_id = get_user_org_id()
  );

-- Managers kunnen documenten uploaden
DROP POLICY IF EXISTS "Managers can upload documents" ON documents;
CREATE POLICY "Managers can upload documents"
  ON documents FOR INSERT
  WITH CHECK (
    is_manager() AND
    organization_id = get_user_org_id()
  );

-- Managers kunnen documenten verwijderen
DROP POLICY IF EXISTS "Managers can delete documents" ON documents;
CREATE POLICY "Managers can delete documents"
  ON documents FOR DELETE
  USING (
    is_manager() AND
    organization_id = get_user_org_id()
  );

-- ============================================
-- STAP 6: CHAT_MESSAGES table policies
-- ============================================

-- Users kunnen messages in hun organisatie zien
DROP POLICY IF EXISTS "Users can view messages in their organization" ON chat_messages;
CREATE POLICY "Users can view messages in their organization"
  ON chat_messages FOR SELECT
  USING (
    organization_id = get_user_org_id()
  );

-- Users kunnen messages aanmaken in hun organisatie
DROP POLICY IF EXISTS "Users can create messages in their organization" ON chat_messages;
CREATE POLICY "Users can create messages in their organization"
  ON chat_messages FOR INSERT
  WITH CHECK (
    organization_id = get_user_org_id()
  );

-- ============================================
-- STAP 7: INVOICES table policies
-- ============================================

-- Users kunnen facturen in hun organisatie zien
DROP POLICY IF EXISTS "Users can view invoices in their organization" ON invoices;
CREATE POLICY "Users can view invoices in their organization"
  ON invoices FOR SELECT
  USING (
    organization_id = get_user_org_id()
  );

-- Admins kunnen alle facturen zien
DROP POLICY IF EXISTS "Admins can view all invoices" ON invoices;
CREATE POLICY "Admins can view all invoices"
  ON invoices FOR SELECT
  USING (is_admin());

-- Admins kunnen facturen aanmaken
DROP POLICY IF EXISTS "Admins can create invoices" ON invoices;
CREATE POLICY "Admins can create invoices"
  ON invoices FOR INSERT
  WITH CHECK (is_admin());

-- Admins kunnen facturen updaten
DROP POLICY IF EXISTS "Admins can update invoices" ON invoices;
CREATE POLICY "Admins can update invoices"
  ON invoices FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

-- ============================================
-- STAP 8: ANALYTICS table policies
-- ============================================

-- Users kunnen analytics in hun organisatie zien
DROP POLICY IF EXISTS "Users can view analytics in their organization" ON analytics;
CREATE POLICY "Users can view analytics in their organization"
  ON analytics FOR SELECT
  USING (
    organization_id = get_user_org_id()
  );

-- Admins kunnen alle analytics zien
DROP POLICY IF EXISTS "Admins can view all analytics" ON analytics;
CREATE POLICY "Admins can view all analytics"
  ON analytics FOR SELECT
  USING (is_admin());

-- Iedereen kan analytics events aanmaken (voor tracking)
DROP POLICY IF EXISTS "Users can insert analytics" ON analytics;
CREATE POLICY "Users can insert analytics"
  ON analytics FOR INSERT
  WITH CHECK (
    organization_id = get_user_org_id()
  );

-- ============================================
-- Test queries (optioneel)
-- ============================================
-- SELECT * FROM users WHERE id = auth.uid();
-- SELECT * FROM user_organizations WHERE user_id = auth.uid();
-- SELECT * FROM organizations WHERE id = get_user_org_id();

