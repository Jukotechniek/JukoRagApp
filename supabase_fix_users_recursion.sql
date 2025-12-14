-- Fix voor infinite recursion in users table policies
-- Voer dit uit in je Supabase SQL Editor

-- ============================================
-- FIX: Verwijder recursieve policies
-- ============================================

-- Deze policy veroorzaakt recursie omdat het user_organizations queryt
-- wat weer users nodig heeft
DROP POLICY IF EXISTS "Users can view users in their organization" ON users;

-- Als je wilt dat users andere users in hun org kunnen zien,
-- gebruik dan een eenvoudigere benadering zonder recursie:
-- (Maar dit is optioneel - de belangrijkste is dat users zichzelf kunnen lezen)

-- ============================================
-- Zorg dat de basis policies correct zijn
-- ============================================

-- Users kunnen zichzelf lezen (geen recursie)
DROP POLICY IF EXISTS "Users can view own profile" ON users;
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  USING (id = auth.uid());

-- Users kunnen zichzelf aanmaken (geen recursie)
DROP POLICY IF EXISTS "Users can create their own profile" ON users;
CREATE POLICY "Users can create their own profile"
  ON users FOR INSERT
  WITH CHECK (id = auth.uid());

-- ============================================
-- Optioneel: Als managers andere users in hun org moeten zien
-- ============================================
-- Deze policy gebruikt een functie om recursie te voorkomen
-- Maar voor nu houden we het simpel - alleen eigen profiel

-- Als je later managers nodig hebt die andere users zien:
-- Je kunt een database functie maken die de organization_id retourneert
-- zonder recursie, of je gebruikt de admin policy

-- ============================================
-- Test (optioneel)
-- ============================================
-- SELECT * FROM users WHERE id = auth.uid();

