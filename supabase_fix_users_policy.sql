-- Fix voor RLS policy zodat users zichzelf kunnen aanmaken
-- Voer dit uit in je Supabase SQL Editor

-- Policy toevoegen zodat authenticated users zichzelf kunnen aanmaken
CREATE POLICY "Users can create their own profile"
  ON users FOR INSERT
  WITH CHECK (id = auth.uid());

-- Als de policy al bestaat, verwijder deze eerst:
-- DROP POLICY IF EXISTS "Users can create their own profile" ON users;

