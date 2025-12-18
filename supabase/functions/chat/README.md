# Chat Edge Function

Deze Edge Function handelt chat berichten af met RAG (Retrieval-Augmented Generation) functionaliteit. Alle AI processing gebeurt server-side voor veiligheid en organisatie-specifieke document filtering.

## Functionaliteit

1. **Authenticatie**: Verifieert dat de gebruiker is ingelogd
2. **Organisatie verificatie**: Controleert dat de gebruiker toegang heeft tot de opgegeven organisatie
3. **Embedding generatie**: Genereert een embedding voor de vraag (OpenAI)
4. **Document zoeken**: Zoekt relevante document secties voor de organisatie
5. **AI response**: Genereert een antwoord met RAG context
6. **Token tracking**: Houdt token gebruik bij in de database

## Beveiliging

- ✅ **API keys blijven server-side**: OpenAI API key wordt nooit naar de client gestuurd
- ✅ **Organisatie filtering**: Alleen documenten van de opgegeven organisatie worden gebruikt
- ✅ **Toegangscontrole**: Verifieert dat de gebruiker bij de organisatie hoort (of admin is)
- ✅ **RLS enforcement**: Gebruikt service role key maar verifieert toegang expliciet

## Setup

### 1. Environment Variables

Zorg dat de volgende secrets zijn ingesteld in Supabase:

```bash
# In Supabase Dashboard: Settings > Edge Functions > Secrets
OPENAI_API_KEY=your-openai-api-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 2. Deploy

```bash
# Via Supabase CLI
supabase functions deploy chat

# Of via Supabase Dashboard: Edge Functions > Deploy
```

## Request Format

```json
{
  "question": "Wat is de prijs van product X?",
  "organizationId": "uuid-van-organisatie",
  "userId": "uuid-van-gebruiker" // optioneel
}
```

## Response Format

```json
{
  "success": true,
  "response": "Het antwoord van de AI...",
  "hasContext": true,
  "contextLength": 1234
}
```

## Error Handling

De function retourneert errors in dit formaat:

```json
{
  "error": "Error message",
  "details": "Additional error details"
}
```

Mogelijke error codes:
- `401`: Unauthorized (geen auth header of ongeldige token)
- `403`: Forbidden (geen toegang tot organisatie)
- `400`: Bad Request (ontbrekende velden)
- `500`: Internal Server Error (OpenAI API error, database error, etc.)

## Gebruik in Frontend

```typescript
const { data, error } = await supabase.functions.invoke('chat', {
  body: {
    question: userQuestion,
    organizationId: currentOrgId,
    userId: currentUserId,
  },
});

if (error || !data?.success) {
  // Handle error
  console.error('Chat error:', error || data?.error);
} else {
  const aiResponse = data.response;
  // Display response
}
```

## Kosten

De function trackt automatisch token usage:
- **Embeddings**: `text-embedding-3-small` (~€0.02 per 1M tokens)
- **Chat**: `gpt-4o-mini` (~€0.15 per 1M input tokens, €0.60 per 1M output tokens)

Alle kosten worden opgeslagen in de `token_usage` tabel in EUR.

## Troubleshooting

### "Missing OPENAI_API_KEY"
- Controleer of de secret is ingesteld in Supabase Dashboard
- Herstart de Edge Function na het toevoegen van secrets

### "Access denied: User does not belong to this organization"
- De gebruiker hoort niet bij de opgegeven organisatie
- Admins hebben automatisch toegang tot alle organisaties

### "Failed to generate embedding"
- Controleer of de OpenAI API key geldig is
- Controleer of je OpenAI credits hebt

### "Failed to generate AI response"
- Controleer OpenAI API status
- Controleer of de API key de juiste permissions heeft









