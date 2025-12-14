# Edge Function Troubleshooting Guide

Als je een 500 error krijgt van de Edge Function, volg deze stappen:

## Stap 1: Check Secrets

Ga naar **Edge Functions > Secrets** en controleer:

### Vereiste Secrets:

1. **SUPABASE_URL**
   - Waarde: Je project URL (bijv. `https://xxxxx.supabase.co`)
   - Waar te vinden: Settings > API > Project URL
   - ⚠️ **Let op**: Dit is NIET de database URL, maar de project URL!

2. **SUPABASE_SERVICE_ROLE_KEY**
   - Waarde: Je service_role key (secret!)
   - Waar te vinden: Settings > API > service_role key (secret)
   - ⚠️ **Belangrijk**: Gebruik de **service_role** key, NIET de anon key!

3. **OPENAI_API_KEY**
   - Waarde: Je OpenAI API key
   - Waar te vinden: https://platform.openai.com/api-keys

## Stap 2: Check Edge Function Logs

1. Ga naar **Edge Functions > process-document > Logs**
2. Klik op de meest recente invocation
3. Bekijk de error message

**Veelvoorkomende errors:**

### "SUPABASE_URL not configured"
- **Oplossing**: Voeg `SUPABASE_URL` toe aan Secrets
- **Waarde**: Je project URL (Settings > API > Project URL)

### "SUPABASE_SERVICE_ROLE_KEY not configured"
- **Oplossing**: Voeg `SUPABASE_SERVICE_ROLE_KEY` toe aan Secrets
- **Waarde**: Settings > API > service_role key (secret)

### "OPENAI_API_KEY not configured"
- **Oplossing**: Voeg `OPENAI_API_KEY` toe aan Secrets
- **Waarde**: Je OpenAI API key

### "Failed to insert document sections"
- **Mogelijke oorzaken**:
  - RLS policies blokkeren de insert
  - `document_sections` tabel bestaat niet
  - Verkeerde embedding dimensions (moet 1536 zijn voor OpenAI)

## Stap 3: Test de Function Direct

In Supabase Dashboard:
1. Ga naar **Edge Functions > process-document**
2. Klik op **Test** tab
3. Voer test data in:
```json
{
  "documentId": "test-doc-id",
  "content": "This is a test document for RAG processing.",
  "organizationId": "your-org-id"
}
```
4. Klik **Run**
5. Bekijk de response en logs

## Stap 4: Check Database Schema

Zorg dat je de RAG schema hebt geïnstalleerd:

1. Ga naar **SQL Editor**
2. Voer `supabase_rag_schema.sql` uit
3. Controleer of `document_sections` tabel bestaat:
```sql
SELECT * FROM document_sections LIMIT 1;
```

## Stap 5: Check RLS Policies

Zorg dat de service role key RLS policies kan omzeilen (dit gebeurt automatisch met service_role key).

Test of je handmatig kunt inserten:
```sql
-- Test insert (als admin)
INSERT INTO document_sections (document_id, content, embedding, metadata)
VALUES (
  'test-doc-id',
  'test content',
  ARRAY[0.1, 0.2, 0.3]::vector(1536), -- Dummy embedding
  '{"test": true}'::jsonb
);
```

## Veelvoorkomende Problemen

### Probleem: "Function not found"
**Oplossing**: 
- Controleer of de function is gedeployed
- Controleer de function naam (moet exact `process-document` zijn)

### Probleem: "Missing authorization header"
**Oplossing**:
- Zorg dat je ingelogd bent in de app
- De Supabase client voegt automatisch de auth header toe

### Probleem: Secrets worden niet herkend
**Oplossing**:
- Herstart de Edge Function na het toevoegen van secrets
- Controleer of de secret namen exact kloppen (hoofdlettergevoelig!)

### Probleem: Database insert faalt
**Oplossing**:
- Check of `document_sections` tabel bestaat
- Check of embedding dimensions kloppen (1536 voor OpenAI)
- Check RLS policies (service_role key zou deze moeten omzeilen)

## Debug Tips

1. **Console logs**: Check browser console (F12) voor client-side errors
2. **Edge Function logs**: Check Supabase Dashboard > Edge Functions > Logs
3. **Network tab**: Check Network tab in browser voor de exacte request/response
4. **Test function**: Gebruik de Test tab in Supabase Dashboard

## Snelle Checklist

- [ ] `SUPABASE_URL` secret is geconfigureerd (project URL, niet database URL)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` secret is geconfigureerd (service_role key, niet anon key)
- [ ] `OPENAI_API_KEY` secret is geconfigureerd
- [ ] Edge Function is gedeployed
- [ ] `document_sections` tabel bestaat
- [ ] RAG schema is geïnstalleerd
- [ ] Edge Function logs zijn gecheckt

## Hulp Nodig?

Als het nog steeds niet werkt:
1. Kopieer de error message uit Edge Function logs
2. Check welke secrets je hebt geconfigureerd (namen en of ze bestaan)
3. Deel de error message en ik help je verder!

