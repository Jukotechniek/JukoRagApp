-- Complete fix voor RLS policies en user creation
-- Voer dit uit in je Supabase SQL Editor

-- 1. Verwijder bestaande policy als die bestaat
DROP POLICY IF EXISTS "Users can create their own profile" ON users;

-- 2. Voeg policy toe zodat authenticated users zichzelf kunnen aanmaken
CREATE POLICY "Users can create their own profile"
  ON users FOR INSERT
  WITH CHECK (id = auth.uid());

-- 3. Zorg dat de SELECT policy werkt voor users die zichzelf lezen
-- (Deze zou al moeten bestaan, maar we controleren het)
-- Als deze policy niet werkt, voeg dan deze toe:
DROP POLICY IF EXISTS "Users can view own profile" ON users;
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  USING (id = auth.uid());

-- 4. Test query (optioneel - verwijder na testen)
-- SELECT * FROM users WHERE id = auth.uid();

