# Process Document Edge Function

Deze Edge Function verwerkt geüploade documenten voor RAG:
1. Splitst tekst in chunks
2. Genereert embeddings met OpenAI
3. Slaat chunks + embeddings op in database

## Setup

### 1. Secrets Configureren

In Supabase Dashboard:
1. Ga naar **Edge Functions** > **Secrets**
2. Voeg toe:
   - `OPENAI_API_KEY` - Je OpenAI API key
   - `SUPABASE_SERVICE_ROLE_KEY` - Je Supabase service role key (voor database writes)

### 2. Deploy Function

**Via Supabase Dashboard:**
1. Ga naar **Edge Functions**
2. Klik **Deploy a new function**
3. Kies **Via Editor**
4. Maak nieuwe function: `process-document`
5. Kopieer de code uit `index.ts`
6. Klik **Deploy**

**Via CLI:**
```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link project
supabase link --project-ref your-project-ref

# Deploy
supabase functions deploy process-document
```

## Gebruik

```typescript
const { data, error } = await supabase.functions.invoke('process-document', {
  body: {
    documentId: 'uuid-here',
    content: 'document text content',
    organizationId: 'uuid-here',
  },
});
```

## Environment Variables

Deze function heeft nodig:
- `OPENAI_API_KEY` - OpenAI API key voor embeddings
- `SUPABASE_SERVICE_ROLE_KEY` - Voor database writes (niet anon key!)

## Kosten

- Edge Function invocations: Gratis tot 500K/month (Pro plan)
- OpenAI embeddings: $0.02 per 1M tokens
- Database writes: Inbegrepen in Supabase plan


