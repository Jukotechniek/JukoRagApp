# Supabase Setup Instructies

Deze applicatie is volledig gekoppeld aan Supabase. Volg deze stappen om de applicatie op te zetten.

## 1. Supabase Project Aanmaken

1. Ga naar [supabase.com](https://supabase.com) en maak een account aan
2. Maak een nieuw project aan
3. Noteer je **Project URL** en **anon/public key** (Settings > API)

## 2. Database Schema Installeren

1. Ga naar je Supabase project dashboard
2. Ga naar **SQL Editor**
3. Open het bestand `supabase_schema.sql` uit deze repository
4. Kopieer de volledige inhoud en plak deze in de SQL Editor
5. Klik op **Run** om het schema te installeren

## 3. Storage Bucket Aanmaken

1. Ga naar **Storage** in je Supabase dashboard
2. Klik op **New bucket**
3. Naam: `documents`
4. Zet **Public bucket** aan
5. Klik op **Create bucket**

### Storage Policies

Voeg deze policies toe aan de `documents` bucket:

```sql
-- Allow authenticated users to upload files
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'documents');

-- Allow users to view files in their organization
CREATE POLICY "Allow users to view their organization files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] IN (
    SELECT organization_id::text FROM user_organizations WHERE user_id = auth.uid()
  )
);

-- Allow users to delete files in their organization
CREATE POLICY "Allow users to delete their organization files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] IN (
    SELECT organization_id::text FROM user_organizations WHERE user_id = auth.uid()
  )
);
```

## 4. Environment Variables

Maak een `.env` bestand in de root van je project:

```env
VITE_SUPABASE_URL=your-project-url-here
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Vervang `your-project-url-here` en `your-anon-key-here` met je eigen Supabase credentials.

## 5. Eerste Admin Gebruiker Aanmaken

Na het installeren van het schema, maak je een admin gebruiker aan:

1. Ga naar **Authentication** > **Users** in Supabase
2. Klik op **Add user** > **Create new user**
3. Vul email en wachtwoord in
4. Noteer de **User ID** die wordt gegenereerd

5. Voer dan deze SQL query uit in de SQL Editor (vervang de UUID en email):

```sql
-- Vervang de UUID en email met je eigen waarden
INSERT INTO users (id, email, name, role)
VALUES ('4112518d-ead6-4a71-a3cf-e617143c02ca', 'info@jukotechniek.nl', 'Admin Gebruiker', 'admin');

-- Link admin aan de default organisatie
INSERT INTO user_organizations (user_id, organization_id)
VALUES ('4112518d-ead6-4a71-a3cf-e617143c02ca', '00000000-0000-0000-0000-000000000001');
```

## 6. Applicatie Starten

```bash
npm install
npm run dev
```

## 7. Test Accounts

Na het aanmaken van de admin gebruiker, kun je:

1. Inloggen met de admin account
2. Via de dashboard nieuwe organisaties aanmaken
3. Via de dashboard nieuwe gebruikers toevoegen

## Belangrijke Notities

- **Row Level Security (RLS)** is ingeschakeld op alle tabellen
- Elke organisatie heeft geïsoleerde data
- Admins kunnen alle organisaties zien
- Managers en Technicians zien alleen hun eigen organisatie
- Documenten worden opgeslagen in Supabase Storage
- Chat messages worden opgeslagen in de database
- Analytics worden automatisch getrackt

## Troubleshooting

### "Missing Supabase environment variables"
- Controleer of je `.env` bestand bestaat en de juiste variabelen bevat

### "Error loading user data"
- Controleer of de gebruiker bestaat in de `users` tabel
- Controleer of de gebruiker gekoppeld is aan een organisatie in `user_organizations`

### "Permission denied" errors
- Controleer of RLS policies correct zijn ingesteld
- Controleer of de gebruiker de juiste rol heeft

### Documenten uploaden werkt niet
- Controleer of de `documents` storage bucket bestaat
- Controleer of de storage policies correct zijn ingesteld

