-- Complete fix voor alle RLS policy problemen
-- Voer dit uit in je Supabase SQL Editor

-- ============================================
-- FIX 1: User_Organizations Recursion Fix
-- ============================================

-- Verwijder de recursieve policy
DROP POLICY IF EXISTS "Users can view their own organization memberships" ON user_organizations;

-- Maak een nieuwe, niet-recursieve policy
CREATE POLICY "Users can view their own organization memberships"
  ON user_organizations FOR SELECT
  USING (user_id = auth.uid());

-- ============================================
-- FIX 2: Users table policies
-- ============================================

-- Zorg dat users zichzelf kunnen lezen (deze zou al moeten bestaan)
DROP POLICY IF EXISTS "Users can view own profile" ON users;
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  USING (id = auth.uid());

-- Zorg dat users zichzelf kunnen aanmaken
DROP POLICY IF EXISTS "Users can create their own profile" ON users;
CREATE POLICY "Users can create their own profile"
  ON users FOR INSERT
  WITH CHECK (id = auth.uid());

-- ============================================
-- FIX 3: Vereenvoudig "Users can view users in their organization"
-- ============================================

-- Deze policy kan ook recursie veroorzaken, maar is minder kritiek
-- Laat deze staan, maar als je problemen hebt, kun je deze verwijderen:
-- DROP POLICY IF EXISTS "Users can view users in their organization" ON users;

-- ============================================
-- Test queries (optioneel - verwijder na testen)
-- ============================================

-- Test of je je eigen user record kunt lezen:
-- SELECT * FROM users WHERE id = auth.uid();

-- Test of je je eigen organization memberships kunt lezen:
-- SELECT * FROM user_organizations WHERE user_id = auth.uid();

