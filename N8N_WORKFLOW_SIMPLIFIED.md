# N8N Workflow - Vereenvoudigde Versie

Deze workflow is makkelijker te implementeren en werkt betrouwbaar.

## 🔄 Workflow Structuur

```
Webhook → Validate Input → Chunk Text → Loop Over Chunks → 
Generate Embedding → Insert to DB → Aggregate → Respond
```

## 📋 Stap-voor-Stap Setup

### 1. Webhook Node
- **Type**: Webhook
- **Method**: POST
- **Path**: `process-document`
- **Response**: Respond to Webhook

### 2. Validate Input (Code)
```javascript
const { documentId, content, organizationId } = $input.first().json;

if (!documentId || !content || !organizationId) {
  throw new Error('Missing required fields: documentId, content, organizationId');
}

if (!content.trim()) {
  throw new Error('Content is empty');
}

return [{ json: { documentId, content, organizationId } }];
```

### 3. Chunk Text (Code)
```javascript
function splitIntoChunks(text, maxLength = 1000, overlap = 200) {
  const chunks = [];
  let startIndex = 0;
  let chunkIndex = 0;

  while (startIndex < text.length) {
    let endIndex = Math.min(startIndex + maxLength, text.length);
    
    // Break at sentence
    if (endIndex < text.length) {
      const lastPeriod = text.lastIndexOf('.', endIndex);
      const lastNewline = text.lastIndexOf('\n', endIndex);
      const breakPoint = Math.max(lastPeriod, lastNewline);
      if (breakPoint > startIndex + maxLength * 0.5) {
        endIndex = breakPoint + 1;
      }
    }

    const chunkText = text.slice(startIndex, endIndex).trim();
    if (chunkText.length > 0) {
      chunks.push({
        text: chunkText,
        index: chunkIndex,
        metadata: {
          chunk_index: chunkIndex,
          startChar: startIndex,
          endChar: endIndex
        }
      });
      chunkIndex++;
    }

    startIndex = endIndex - overlap;
    if (startIndex <= 0) startIndex = endIndex;
  }

  return chunks;
}

const { documentId, content, organizationId } = $input.first().json;
const chunks = splitIntoChunks(content);

return chunks.map(chunk => ({
  json: {
    documentId,
    organizationId,
    text: chunk.text,
    index: chunk.index,
    metadata: chunk.metadata
  }
}));
```

### 4. Loop Over Chunks (Split Into Items)
- **Field**: `text` (of laat leeg als je chunks al split hebt)

### 5. Generate Embedding (OpenAI)
- **Resource**: Embedding
- **Model**: `text-embedding-3-small`
- **Dimensions**: `1536`
- **Text**: `={{ $json.text }}`

### 6. Prepare Database Record (Code)
```javascript
const embedding = $input.first().json.data[0].embedding;
const chunkData = $('Chunk Text').item.json;

return [{
  json: {
    document_id: chunkData.documentId,
    content: chunkData.text,
    embedding: embedding,
    metadata: chunkData.metadata
  }
}];
```

### 7. Insert to Database (Postgres)
- **Operation**: Insert
- **Table**: `document_sections`
- **Columns**:
  - `document_id`: `={{ $json.document_id }}`
  - `content`: `={{ $json.content }}`
  - `embedding`: `={{ $json.embedding }}`
  - `metadata`: `={{ $json.metadata }}`

### 8. Aggregate Results (Code)
```javascript
const items = $input.all();
const firstItem = items[0].json;

return [{
  json: {
    success: true,
    documentId: firstItem.document_id,
    chunksProcessed: items.length,
    message: `Successfully processed ${items.length} chunks`
  }
}];
```

### 9. Respond to Webhook
- **Response Body**: `={{ $json }}`

## ⚠️ Error Handling

Voeg na elke belangrijke node een **IF** node toe:
- **Condition**: Check op `error` field
- **True**: Ga naar error response
- **False**: Ga naar volgende stap

Error Response node:
```javascript
return [{
  json: {
    success: false,
    error: $json.error || 'Unknown error'
  }
}];
```

## 🚀 Activeren

1. **Save** workflow
2. **Activate** workflow (toggle rechtsboven)
3. **Copy webhook URL**
4. Voeg toe aan `.env`: `VITE_N8N_WEBHOOK_URL=<webhook-url>`

## ✅ Test

Test met curl:
```bash
curl -X POST https://your-n8n.com/webhook/process-document \
  -H "Content-Type: application/json" \
  -d '{
    "documentId": "test-123",
    "content": "Dit is een test document met wat tekst om te verwerken.",
    "organizationId": "org-123"
  }'
```


