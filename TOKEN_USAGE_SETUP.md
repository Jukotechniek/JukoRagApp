# Token Usage Tracking Setup

Token usage tracking is nu geïmplementeerd! Dit systeem trackt alle OpenAI API token gebruik en kosten per organisatie.

## Installatie

### Stap 1: Database Schema Installeren

Voer het SQL script uit in Supabase:

1. Ga naar **Supabase Dashboard > SQL Editor**
2. Open `supabase_token_usage_schema.sql`
3. Kopieer de volledige inhoud
4. Plak in SQL Editor
5. Klik **Run**

Dit script maakt:
- `token_usage` tabel voor het opslaan van token usage data
- Indexes voor snelle queries
- RLS policies voor veilige data access
- `calculate_token_cost` functie voor automatische kostenberekening

### Stap 2: Testen

Na installatie kun je:

1. **Als admin inloggen**
2. Ga naar **Token Gebruik** in het menu
3. Je ziet een overzicht van alle token usage

## Functionaliteit

### Wat wordt getrackt?

1. **Chat tokens** - AI gesprekken (gpt-4o-mini)
2. **Embedding tokens** - Document zoekopdrachten (text-embedding-3-small)
3. **Document processing tokens** - Document verwerking voor RAG (text-embedding-3-small)

### Token Usage View

De Token Usage view toont:

- **Totaal tokens** - Totaal aantal tokens gebruikt
- **Totaal kosten** - Totale kosten in USD
- **Breakdown per type** - Chat, Embeddings, Document Processing
- **Recente usage** - Tabel met laatste 20 events
- **Tijd filters** - Vandaag, Deze week, Deze maand, Alles

### Automatische Tracking

Token usage wordt automatisch getrackt bij:

- ✅ Chat berichten (via `generateAIResponse`)
- ✅ Embedding generatie (via `generateEmbedding`)
- ✅ Document processing (via Edge Function)

## Kostenberekening

De `calculate_token_cost` functie berekent automatisch kosten op basis van:

- **gpt-4o-mini**: $0.15/$0.60 per 1M tokens (input/output)
- **text-embedding-3-small**: $0.02 per 1M tokens
- **gpt-4o**: $2.50/$10.00 per 1M tokens (input/output)
- **gpt-3.5-turbo**: $0.50/$1.50 per 1M tokens (input/output)

Prijzen worden automatisch bijgewerkt in de database functie.

## RLS Policies

- **Users** kunnen alleen token usage zien van hun eigen organisatie
- **Admins** kunnen alle token usage zien
- **Edge Functions** kunnen token usage inserten (service role key)

## Troubleshooting

### "token_usage table does not exist"
- Zorg dat je `supabase_token_usage_schema.sql` hebt uitgevoerd

### "calculate_token_cost function not found"
- Check of de functie is aangemaakt in de database
- Voer het SQL script opnieuw uit

### Geen data zichtbaar
- Check of er daadwerkelijk OpenAI API calls zijn gemaakt
- Check of de organization_id correct is ingesteld
- Check RLS policies

## Voorbeeld Queries

### Totaal tokens per organisatie
```sql
SELECT 
  organization_id,
  SUM(total_tokens) as total_tokens,
  SUM(cost_usd) as total_cost
FROM token_usage
GROUP BY organization_id
ORDER BY total_cost DESC;
```

### Tokens per model
```sql
SELECT 
  model,
  operation_type,
  SUM(total_tokens) as total_tokens,
  SUM(cost_usd) as total_cost
FROM token_usage
GROUP BY model, operation_type
ORDER BY total_cost DESC;
```

### Dagelijkse kosten
```sql
SELECT 
  DATE(created_at) as date,
  SUM(cost_usd) as daily_cost
FROM token_usage
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

## Volgende Stappen

- [ ] Export functionaliteit voor rapporten
- [ ] Email alerts bij hoge kosten
- [ ] Kosten limieten per organisatie
- [ ] Grafieken en trends

