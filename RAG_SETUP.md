# RAG (Retrieval-Augmented Generation) Setup

Dit document beschrijft hoe je RAG functionaliteit toevoegt aan je TechRAG applicatie.

## Wat is RAG?

RAG (Retrieval-Augmented Generation) combineert document retrieval met AI generatie. Wanneer een gebruiker een vraag stelt:
1. De vraag wordt omgezet naar een embedding (vector)
2. De database zoekt naar de meest relevante document secties op basis van similarity
3. Deze secties worden gebruikt als context voor de AI om een antwoord te genereren

## Database Setup

### 1. Installeer pgvector Extension

In Supabase SQL Editor, voer dit uit:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

**Let op:** Als je een gratis Supabase project gebruikt, moet je mogelijk de pgvector extensie aanvragen via je project settings.

### 2. Voeg RAG Schema Toe

Voer het bestand `supabase_rag_schema.sql` uit in de Supabase SQL Editor. Dit voegt toe:
- `document_sections` tabel voor document chunks met embeddings
- RLS policies voor veilige toegang per organisatie
- Vector similarity index voor snelle zoekopdrachten
- Helper functies voor similarity search

## Document Processing Workflow

### 1. Document Upload

Wanneer een document wordt geüpload:
1. Document wordt opgeslagen in `documents` tabel (al geïmplementeerd)
2. Document wordt verwerkt en opgesplitst in secties/chunks
3. Elke sectie wordt opgeslagen in `document_sections` met:
   - De tekst content
   - Een embedding vector (1536 dimensions voor OpenAI)
   - Optionele metadata (pagina nummer, sectie titel, etc.)

### 2. Embedding Generatie

Je hebt een embedding model nodig om tekst om te zetten naar vectors. 

**Aanbevolen: OpenAI Embeddings (1536 dimensions)**
- `text-embedding-3-small` - Nieuwste model, beste prijs/kwaliteit
- `text-embedding-ada-002` - Oudere maar stabiele optie
- Beide gebruiken 1536 dimensions

**Alternatieve opties:**
- `sentence-transformers/all-MiniLM-L6-v2` (384 dimensions) - Gratis, maar vereist schema aanpassing
- `sentence-transformers/all-mpnet-base-v2` (768 dimensions) - Gratis, betere kwaliteit

**Implementatie opties:**
1. **OpenAI API** (aanbevolen): Directe integratie met OpenAI embeddings API
2. **Backend API**: Maak een Node.js/Python API die OpenAI embeddings genereert
3. **Supabase Edge Functions**: Gebruik Supabase Functions met OpenAI API
4. **Client-side**: Gebruik OpenAI SDK direct (niet aanbevolen voor productie - API keys exposed)

### 3. Voorbeeld: Document Processing

```typescript
// Pseudo-code voor document processing
async function processDocument(documentId: string, fileContent: string) {
  // 1. Split document into chunks (bijv. 500-1000 characters per chunk)
  const chunks = splitIntoChunks(fileContent, { maxLength: 1000, overlap: 200 });
  
  // 2. Generate embeddings for each chunk
  for (const chunk of chunks) {
    const embedding = await generateEmbedding(chunk.text); // Call your embedding API
    
    // 3. Save to database
    await supabase.from('document_sections').insert({
      document_id: documentId,
      content: chunk.text,
      embedding: embedding, // Array of 384 numbers
      metadata: {
        page: chunk.page,
        section: chunk.section,
        chunk_index: chunk.index
      }
    });
  }
}
```

## RAG Query Workflow

### 1. User vraagt iets

```typescript
const userQuestion = "Hoe werkt de API?";
```

### 2. Generate query embedding

```typescript
const queryEmbedding = await generateEmbedding(userQuestion);
```

### 3. Search similar sections

```typescript
// Generate embedding for user question using OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const embeddingResponse = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: userQuestion,
  dimensions: 1536,
});
const queryEmbedding = embeddingResponse.data[0].embedding;

// Search similar sections (function includes security check)
const { data, error } = await supabase.rpc('match_document_sections', {
  p_organization_id: organizationId,
  query_embedding: queryEmbedding, // Array of 1536 numbers
  match_count: 5, // Top 5 most similar sections
  match_threshold: 0.7 // Minimum similarity score (0-1)
});

if (error) {
  if (error.message === 'not authorized') {
    // User doesn't belong to this organization
    console.error('Access denied');
  } else {
    console.error('Search error:', error);
  }
}
```

### 4. Use results as context for AI

```typescript
const context = data.map(section => section.content).join('\n\n');

const aiResponse = await generateAIResponse({
  question: userQuestion,
  context: context,
  // ... other AI parameters
});
```

## Embedding Service Setup

### Optie 2: Backend API (Node.js) - Met OpenAI

```typescript
// server/embedding-service.ts
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    dimensions: 1536,
  });
  return response.data[0].embedding;
}

// Batch processing voor meerdere chunks tegelijk
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts,
    dimensions: 1536,
  });
  return response.data.map(item => item.embedding);
}
```

### Optie 1: OpenAI Embeddings API (Aanbevolen)

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small', // or text-embedding-ada-002
    input: text,
    dimensions: 1536, // Explicitly set dimensions
  });
  return response.data[0].embedding; // Returns array of 1536 numbers
}
```

**Prijzen (per 1M tokens):**
- `text-embedding-3-small`: $0.02
- `text-embedding-ada-002`: $0.10

**Rate Limits:**
- Free tier: 3 RPM (requests per minute)
- Paid tier: 500 RPM (default)

### Optie 3: Supabase Edge Function - Met OpenAI

Maak een Supabase Edge Function die embeddings genereert:

```typescript
// supabase/functions/generate-embedding/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import OpenAI from 'https://deno.land/x/openai@v4.20.0/mod.ts';

const openai = new OpenAI({
  apiKey: Deno.env.get('OPENAI_API_KEY')!,
});

serve(async (req) => {
  const { text } = await req.json();
  
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
      dimensions: 1536,
    });
    
    return new Response(JSON.stringify({ 
      embedding: response.data[0].embedding 
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
```

## Best Practices

1. **Chunk Size**: Houd chunks tussen 200-1000 characters voor beste resultaten
2. **Overlap**: Gebruik 50-200 characters overlap tussen chunks voor context
3. **Metadata**: Sla nuttige metadata op (pagina nummer, sectie, etc.) voor betere resultaten
4. **Similarity Threshold**: Experimenteer met thresholds (0.6-0.8) voor beste balans
5. **Top K**: Gebruik 3-10 meest relevante secties als context
6. **Index Maintenance**: De HNSW index wordt automatisch bijgewerkt, maar kan tijd kosten bij grote datasets

## Performance Tips

1. **Batch Processing**: Verwerk meerdere chunks tegelijk bij document upload
2. **Caching**: Cache embeddings voor veelgebruikte queries
3. **Index Tuning**: Pas HNSW parameters aan voor grote datasets (m, ef_construction)
4. **Filtering**: Gebruik WHERE clauses om zoekruimte te verkleinen per organisatie

## Security

- RLS policies zorgen ervoor dat gebruikers alleen document secties van hun organisatie kunnen zien
- Embeddings worden automatisch gefilterd op organisatie niveau
- Managers kunnen alleen secties toevoegen/verwijderen voor hun organisatie

## Next Steps

1. Kies een embedding service (gratis of betaald)
2. Implementeer document processing pipeline
3. Integreer RAG in je chat functionaliteit
4. Test en optimaliseer similarity thresholds
5. Monitor performance en pas aan waar nodig

