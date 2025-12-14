# RAG Setup met sentence-transformers/all-mpnet-base-v2

Deze guide legt uit hoe je RAG implementeert met het **gratis** `all-mpnet-base-v2` model (768 dimensions).

## Voordelen van all-mpnet-base-v2

✅ **Gratis** - Geen API kosten  
✅ **Lokaal** - Werkt offline, geen externe API calls  
✅ **Goede kwaliteit** - Beter dan MiniLM, bijna zo goed als OpenAI  
✅ **Privacy** - Data blijft lokaal  
⚠️ **768 dimensions** - Kleinere vectors dan OpenAI (1536), maar nog steeds uitstekend

## Database Setup

### 1. Installeer pgvector Extension

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 2. Voeg RAG Schema Toe (768 dimensions)

Voer het bestand `supabase_rag_schema_mpnet.sql` uit in de Supabase SQL Editor.

**Let op:** Als je al een `document_sections` tabel hebt met 1536 dimensions, moet je deze eerst droppen:

```sql
DROP TABLE IF EXISTS document_sections CASCADE;
```

Dan voer je `supabase_rag_schema_mpnet.sql` uit.

## Embedding Generatie Opties

### Optie 1: Node.js Backend (Aanbevolen)

Installeer de benodigde packages:

```bash
npm install @xenova/transformers
```

```typescript
// server/embedding-service.ts
import { pipeline } from '@xenova/transformers';

let embeddingModel: any = null;

async function getEmbeddingModel() {
  if (!embeddingModel) {
    // Load model (downloads automatically on first use)
    embeddingModel = await pipeline(
      'feature-extraction',
      'Xenova/all-mpnet-base-v2'
    );
  }
  return embeddingModel;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const model = await getEmbeddingModel();
  const output = await model(text, { 
    pooling: 'mean', 
    normalize: true 
  });
  return Array.from(output.data); // Returns array of 768 numbers
}

// Batch processing voor meerdere chunks
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const model = await getEmbeddingModel();
  const embeddings: number[][] = [];
  
  for (const text of texts) {
    const output = await model(text, { pooling: 'mean', normalize: true });
    embeddings.push(Array.from(output.data));
  }
  
  return embeddings;
}
```

**Eerste keer:** Het model wordt automatisch gedownload (~420MB). Dit gebeurt alleen de eerste keer.

### Optie 2: Python Backend

```python
# server/embedding_service.py
from sentence_transformers import SentenceTransformer
import numpy as np

# Load model (downloads on first use)
model = SentenceTransformer('all-mpnet-base-v2')

def generate_embedding(text: str) -> list[float]:
    """Generate embedding for a single text"""
    embedding = model.encode(text, normalize_embeddings=True)
    return embedding.tolist()  # Returns list of 768 floats

def generate_embeddings_batch(texts: list[str]) -> list[list[float]]:
    """Generate embeddings for multiple texts (faster)"""
    embeddings = model.encode(texts, normalize_embeddings=True)
    return embeddings.tolist()
```

**Installatie:**
```bash
pip install sentence-transformers
```

### Optie 3: Supabase Edge Function (Deno)

```typescript
// supabase/functions/generate-embedding/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1';

let embeddingModel: any = null;

async function getEmbeddingModel() {
  if (!embeddingModel) {
    embeddingModel = await pipeline(
      'feature-extraction',
      'Xenova/all-mpnet-base-v2'
    );
  }
  return embeddingModel;
}

serve(async (req) => {
  try {
    const { text } = await req.json();
    
    const model = await getEmbeddingModel();
    const output = await model(text, { pooling: 'mean', normalize: true });
    const embedding = Array.from(output.data);
    
    return new Response(JSON.stringify({ embedding }), {
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

## Document Processing Workflow

### 1. Document Upload & Processing

```typescript
// Pseudo-code voor document processing
import { generateEmbedding } from './embedding-service';

async function processDocument(documentId: string, fileContent: string) {
  // 1. Split document into chunks (500-1000 characters per chunk)
  const chunks = splitIntoChunks(fileContent, { 
    maxLength: 1000, 
    overlap: 200 
  });
  
  // 2. Generate embeddings for each chunk
  const embeddings = await Promise.all(
    chunks.map(chunk => generateEmbedding(chunk.text))
  );
  
  // 3. Save to database
  for (let i = 0; i < chunks.length; i++) {
    await supabase.from('document_sections').insert({
      document_id: documentId,
      content: chunks[i].text,
      embedding: embeddings[i], // Array of 768 numbers
      metadata: {
        page: chunks[i].page,
        section: chunks[i].section,
        chunk_index: i
      }
    });
  }
}
```

### 2. RAG Query Workflow

```typescript
import { generateEmbedding } from './embedding-service';

// 1. User asks a question
const userQuestion = "Hoe werkt de API?";

// 2. Generate query embedding
const queryEmbedding = await generateEmbedding(userQuestion); // 768 dimensions

// 3. Search similar sections
const { data, error } = await supabase.rpc('match_document_sections', {
  p_organization_id: organizationId,
  query_embedding: queryEmbedding, // Array of 768 numbers
  match_count: 5,
  match_threshold: 0.7
});

if (error) {
  if (error.message === 'not authorized') {
    console.error('Access denied');
  } else {
    console.error('Search error:', error);
  }
  return;
}

// 4. Use results as context for AI
const context = data.map(section => section.content).join('\n\n');

const aiResponse = await generateAIResponse({
  question: userQuestion,
  context: context,
  // ... other AI parameters
});
```

## Performance Tips

### 1. Model Caching

Het model wordt automatisch gecached na de eerste load. In productie:

```typescript
// Singleton pattern voor model caching
class EmbeddingService {
  private static model: any = null;
  
  static async getModel() {
    if (!this.model) {
      this.model = await pipeline('feature-extraction', 'Xenova/all-mpnet-base-v2');
    }
    return this.model;
  }
}
```

### 2. Batch Processing

Voor meerdere chunks, gebruik batch processing:

```typescript
// Process multiple chunks at once (faster)
const texts = chunks.map(c => c.text);
const embeddings = await generateEmbeddingsBatch(texts);
```

### 3. Model Size

- **Model size:** ~420MB (downloads automatically)
- **Memory usage:** ~500MB RAM when loaded
- **Speed:** ~50-100 embeddings/second (CPU), ~500+/second (GPU)

## Vergelijking: MPNet vs OpenAI

| Feature | all-mpnet-base-v2 | OpenAI (text-embedding-3-small) |
|---------|-------------------|--------------------------------|
| **Dimensions** | 768 | 1536 |
| **Kosten** | Gratis | $0.02 per 1M tokens |
| **Snelheid** | Lokaal (sneller) | API call (langzamer) |
| **Kwaliteit** | Zeer goed | Uitstekend |
| **Privacy** | Volledig lokaal | Data naar OpenAI |
| **Offline** | ✅ Ja | ❌ Nee |
| **Setup** | Model download | API key |

## TypeScript Types

Update je `src/types/database.ts`:

```typescript
document_sections: {
  Row: {
    id: number;
    document_id: string;
    content: string;
    embedding: number[] | null; // vector(768) as array - all-mpnet-base-v2
    metadata: Record<string, any> | null;
    created_at: string;
    updated_at: string;
  };
  // ...
};

match_document_sections: {
  Args: {
    p_organization_id: string;
    query_embedding: number[]; // Array of 768 numbers
    match_count?: number;
    match_threshold?: number;
  };
  // ...
};
```

## Best Practices

1. **Chunk Size**: 500-1000 characters voor beste resultaten
2. **Overlap**: 100-200 characters overlap tussen chunks
3. **Similarity Threshold**: Experimenteer met 0.6-0.8
4. **Model Caching**: Cache het model in memory voor snellere verwerking
5. **Batch Processing**: Verwerk meerdere chunks tegelijk waar mogelijk

## Troubleshooting

### Model download problemen

Als het model niet downloadt:
```bash
# Check internet verbinding
# Model wordt opgeslagen in: ~/.cache/huggingface/transformers/
```

### Memory issues

Als je out of memory errors krijgt:
- Gebruik kleinere batch sizes
- Overweeg een GPU voor snellere verwerking
- Of gebruik een cloud service voor embeddings

### Performance

Voor betere performance:
- Gebruik GPU als beschikbaar
- Cache embeddings voor veelgebruikte queries
- Gebruik batch processing voor meerdere chunks

## Migratie van OpenAI naar MPNet

Als je al OpenAI gebruikt en wilt switchen:

1. **Backup je data:**
```sql
-- Export existing embeddings (optioneel)
```

2. **Drop en recreate tabel:**
```sql
DROP TABLE IF EXISTS document_sections CASCADE;
-- Run supabase_rag_schema_mpnet.sql
```

3. **Re-process alle documenten:**
```typescript
// Re-generate embeddings met MPNet model
const documents = await getAllDocuments();
for (const doc of documents) {
  await reprocessDocument(doc.id, doc.content);
}
```

