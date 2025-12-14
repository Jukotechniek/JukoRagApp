-- Complete fix voor ALLE infinite recursion problemen
-- Voer dit uit in je Supabase SQL Editor

-- ============================================
-- FIX 1: Users table - verwijder recursieve policies
-- ============================================

-- Deze policy veroorzaakt recursie (queryt user_organizations wat users nodig heeft)
DROP POLICY IF EXISTS "Users can view users in their organization" ON users;

-- Deze policy veroorzaakt recursie (queryt users om te checken of user admin is)
DROP POLICY IF EXISTS "Admins can view all users" ON users;

-- Deze policy kan recursie veroorzaken
DROP POLICY IF EXISTS "Managers can create users in their organization" ON users;

-- Basis policies die GEEN recursie veroorzaken
DROP POLICY IF EXISTS "Users can view own profile" ON users;
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Users can create their own profile" ON users;
CREATE POLICY "Users can create their own profile"
  ON users FOR INSERT
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ============================================
-- FIX 2: User_Organizations table
-- ============================================

-- Verwijder recursieve policy
DROP POLICY IF EXISTS "Users can view their own organization memberships" ON user_organizations;

-- Eenvoudige, niet-recursieve policy
CREATE POLICY "Users can view their own organization memberships"
  ON user_organizations FOR SELECT
  USING (user_id = auth.uid());

-- Verwijder andere recursieve policies
DROP POLICY IF EXISTS "Admins can view all memberships" ON user_organizations;
DROP POLICY IF EXISTS "Managers can add users to their organization" ON user_organizations;

-- ============================================
-- FIX 3: Andere tabellen - verwijder policies die users tabel queryen
-- ============================================

-- Documents
DROP POLICY IF EXISTS "Managers can upload documents" ON documents;
DROP POLICY IF EXISTS "Managers can delete documents" ON documents;

-- Invoices
DROP POLICY IF EXISTS "Admins can view all invoices" ON invoices;
DROP POLICY IF EXISTS "Admins can create invoices" ON invoices;
DROP POLICY IF EXISTS "Admins can update invoices" ON invoices;

-- Analytics
DROP POLICY IF EXISTS "Admins can view all analytics" ON analytics;

-- ============================================
-- NIEUWE, EENVOUDIGE POLICIES (zonder recursie)
-- ============================================

-- Voor nu houden we het simpel:
-- - Users kunnen alleen hun eigen data zien
-- - Voor admin/manager functionaliteit kunnen we later functies gebruiken
--   of de policies aanpassen met SECURITY DEFINER functies

-- ============================================
-- Test (optioneel)
-- ============================================
-- SELECT * FROM users WHERE id = auth.uid();
-- SELECT * FROM user_organizations WHERE user_id = auth.uid();

