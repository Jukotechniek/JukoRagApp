# Edge Function Setup voor RAG Processing

Deze guide legt uit hoe je de Edge Function setup voor RAG document processing.

## Waarom Edge Functions?

✅ **Veiligheid**: OpenAI API key blijft op de server  
✅ **Performance**: Sneller dan client-side processing  
✅ **Privacy**: Document content gaat niet naar de browser  
✅ **Schaalbaarheid**: Automatisch schaalbaar  
✅ **Geen server load**: Draait op Supabase's servers

## Setup Stappen

### 1. Secrets Configureren

In Supabase Dashboard:

1. Ga naar je project dashboard
2. Ga naar **Edge Functions** > **Secrets** (in de sidebar)
3. Voeg de volgende secrets toe:

   **OPENAI_API_KEY**
   - Value: Je OpenAI API key
   - Description: "OpenAI API key voor embeddings"

   **SUPABASE_SERVICE_ROLE_KEY**
   - Value: Je Supabase Service Role Key (niet anon key!)
   - Waar te vinden: Settings > API > service_role key (secret)
   - ⚠️ **Belangrijk**: Dit is een secret key, deel deze nooit publiekelijk!

### 2. Edge Function Deployen

#### Optie A: Via Supabase Dashboard (Aanbevolen voor beginners)

1. Ga naar **Edge Functions** in de sidebar
2. Klik op **"Deploy a new function"**
3. Kies **"Via Editor"**
4. Function naam: `process-document`
5. Kopieer de code uit `supabase/functions/process-document/index.ts`
6. Plak in de editor
7. Klik **Deploy**

#### Optie B: Via Supabase CLI (Voor developers)

```bash
# 1. Install Supabase CLI
npm install -g supabase

# 2. Login
supabase login

# 3. Link je project
supabase link --project-ref your-project-ref
# Je project ref vind je in: Project Settings > General > Reference ID

# 4. Deploy function
supabase functions deploy process-document

# 5. Set secrets
supabase secrets set OPENAI_API_KEY=your-key-here
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

### 3. Test de Function

Na deployment kun je de function testen:

```typescript
// In je browser console of code
const { data, error } = await supabase.functions.invoke('process-document', {
  body: {
    documentId: 'test-doc-id',
    content: 'This is a test document for RAG processing.',
    organizationId: 'your-org-id',
  },
});

console.log(data, error);
```

## Code Aanpassingen

De client-side code is al aangepast om de Edge Function te gebruiken:

**Voor:**
```typescript
// Oude code (client-side, onveilig)
const embeddings = await generateEmbeddingsBatch(texts);
await supabase.from('document_sections').insert(...);
```

**Na:**
```typescript
// Nieuwe code (Edge Function, veilig)
await supabase.functions.invoke('process-document', {
  body: { documentId, content, organizationId },
});
```

## Troubleshooting

### "Function not found"
- Controleer of de function is gedeployed
- Controleer de function naam (moet exact `process-document` zijn)

### "OPENAI_API_KEY not configured"
- Ga naar Edge Functions > Secrets
- Controleer of `OPENAI_API_KEY` is ingesteld
- Herstart de function na het toevoegen van secrets

### "Missing authorization header"
- De function gebruikt automatisch de Supabase auth header
- Zorg dat je ingelogd bent in de app

### "SUPABASE_SERVICE_ROLE_KEY not configured"
- Voeg de Service Role Key toe aan Secrets
- ⚠️ Gebruik de **service_role** key, niet de anon key!

### Function werkt niet
- Check de function logs in Supabase Dashboard
- Ga naar Edge Functions > process-document > Logs
- Kijk voor error messages

## Kosten

### Edge Functions
- **Free tier**: 500K invocations/month
- **Pro tier**: 2M invocations/month
- **Team tier**: 5M invocations/month

### OpenAI Embeddings
- $0.02 per 1M tokens
- Een document van 10.000 woorden ≈ 13.000 tokens ≈ $0.00026

**Voorbeeld maandelijkse kosten:**
- 100 documenten verwerken: ~$0.03
- Edge Function invocations: Gratis (binnen limits)

## Security Best Practices

1. ✅ **Service Role Key**: Gebruik alleen in Edge Functions, nooit in client code
2. ✅ **Secrets**: Bewaar alle API keys in Supabase Secrets
3. ✅ **RLS**: Database policies zorgen voor data isolatie
4. ✅ **Auth**: Edge Functions respecteren user authentication

## Monitoring

Monitor je Edge Functions:
1. Ga naar **Edge Functions** > **process-document**
2. Bekijk **Metrics** voor:
   - Invocation count
   - Error rate
   - Average duration
3. Bekijk **Logs** voor debugging

## Volgende Stappen

1. ✅ Deploy Edge Function
2. ✅ Configureer Secrets
3. ✅ Test met een document upload
4. 🔄 Monitor performance
5. 🔄 Voeg error handling toe (optioneel)
6. 🔄 Implementeer retry logic (optioneel)

