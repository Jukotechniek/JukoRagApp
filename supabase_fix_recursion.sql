-- Fix voor infinite recursion in user_organizations policy
-- Voer dit uit in je Supabase SQL Editor

-- Verwijder de problematische policy
DROP POLICY IF EXISTS "Users can view their own organization memberships" ON user_organizations;

-- Maak een nieuwe, niet-recursieve policy
-- Users kunnen alleen hun eigen memberships zien (geen recursie)
CREATE POLICY "Users can view their own organization memberships"
  ON user_organizations FOR SELECT
  USING (user_id = auth.uid());

-- Voor managers/admins die andere users in hun org willen zien:
-- Deze policy is al aanwezig en gebruikt users tabel (geen recursie)
-- "Admins can view all memberships" - deze is OK

-- Optioneel: Als managers ook andere users in hun org moeten zien
-- (niet alleen admins), voeg dan deze toe:
CREATE POLICY "Managers can view memberships in their organization"
  ON user_organizations FOR SELECT
  USING (
    organization_id IN (
      SELECT uo.organization_id 
      FROM user_organizations uo
      WHERE uo.user_id = auth.uid()
    )
  );

