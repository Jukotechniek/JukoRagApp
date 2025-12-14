# Supabase Setup Guide voor TechRAG

## Stap 1: Supabase Project Aanmaken

1. Ga naar [supabase.com](https://supabase.com)
2. Maak een nieuw project aan
3. Noteer je project URL en anon key

## Stap 2: Database Schema Installeren

1. Ga naar je Supabase dashboard
2. Navigeer naar **SQL Editor**
3. Kopieer en plak de volledige inhoud van `supabase_schema.sql`
4. Klik op **Run** om het schema te installeren

## Stap 3: Authentication Setup

### Email Auth Configureren

1. Ga naar **Authentication** > **Settings**
2. Zorg dat **Email** auth provider is ingeschakeld
3. Configureer email templates indien nodig

### User Management

Gebruikers worden automatisch aangemaakt via Supabase Auth. Na registratie moet je:

1. Een record in de `users` tabel aanmaken
2. Een record in de `user_organizations` tabel aanmaken

### Trigger voor Automatische User Creation

Voeg deze trigger toe om automatisch een user record aan te maken:

```sql
-- Function to handle new user creation
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', 'User'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'technician')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call function on new user
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
```

## Stap 4: Storage Setup (voor documenten)

1. Ga naar **Storage** in je Supabase dashboard
2. Maak een nieuwe bucket aan genaamd `documents`
3. Zet de bucket op **Private**
4. Voeg deze RLS policy toe:

```sql
-- Storage policy voor documents
CREATE POLICY "Users can upload documents to their organization"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] IN (
    SELECT organization_id::text 
    FROM user_organizations 
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can view documents in their organization"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] IN (
    SELECT organization_id::text 
    FROM user_organizations 
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Managers can delete documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'documents' AND
  EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'manager')
  )
);
```

## Stap 5: Environment Variables

Voeg deze variabelen toe aan je `.env` bestand:

```env
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Stap 6: Frontend Integration

### Install Supabase Client

```bash
npm install @supabase/supabase-js
```

### Create Supabase Client

Maak een bestand `src/lib/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

## Stap 7: Test Data (Optioneel)

Voeg test data toe voor development:

```sql
-- Test organization
INSERT INTO organizations (id, name, plan) 
VALUES ('11111111-1111-1111-1111-111111111111', 'Test Organisatie', 'professional');

-- Test user (na auth user creation)
-- INSERT INTO users (id, email, name, role)
-- VALUES ('user-uuid-from-auth', 'test@example.com', 'Test User', 'manager');

-- INSERT INTO user_organizations (user_id, organization_id)
-- VALUES ('user-uuid-from-auth', '11111111-1111-1111-1111-111111111111');
```

## Security Checklist

- ✅ Row Level Security (RLS) is ingeschakeld op alle tabellen
- ✅ Policies zorgen dat gebruikers alleen hun eigen organisatie data zien
- ✅ Admins hebben toegang tot alle data
- ✅ Storage policies beschermen documenten
- ✅ Foreign keys zorgen voor data integriteit
- ✅ Indexes optimaliseren query performance

## Belangrijke Notities

1. **Multi-Tenant Security**: Elke query wordt automatisch gefilterd op basis van de gebruiker's organisatie
2. **Admin Access**: Admins kunnen alle organisaties zien via speciale policies
3. **Data Isolation**: Organisaties kunnen nooit elkaars data zien door RLS
4. **Cascading Deletes**: Als een organisatie wordt verwijderd, worden alle gerelateerde data ook verwijderd

## Troubleshooting

### RLS Policies werken niet
- Controleer of RLS is ingeschakeld: `ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;`
- Controleer of de gebruiker is ingelogd: `SELECT auth.uid();`

### Users kunnen geen data zien
- Controleer of de gebruiker een record heeft in `user_organizations`
- Controleer of de `organization_id` correct is

### Storage uploads falen
- Controleer of de bucket bestaat en correct is geconfigureerd
- Controleer of de storage policies correct zijn ingesteld

