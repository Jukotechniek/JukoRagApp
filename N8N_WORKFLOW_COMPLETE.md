# N8N Workflow - Complete Versie (Met File Download & Text Extraction)

Deze workflow haalt het bestand zelf uit Supabase Storage en extraheert de tekst.

## 🔄 Workflow Structuur

```
Webhook → Validate Input → Get Document Info → Download File → 
Extract Text → Chunk Text → Loop → Generate Embeddings → 
Insert to DB → Aggregate → Respond
```

## 📋 Stap-voor-Stap Setup

### 1. Webhook Node
- **Type**: Webhook
- **Method**: POST
- **Path**: `process-document`
- **Response**: Respond to Webhook
- **Expected Input**:
```json
{
  "documentId": "uuid",
  "organizationId": "uuid"
}
```

### 2. Validate Input (Code)
```javascript
const { documentId, organizationId } = $input.first().json;

if (!documentId || !organizationId) {
  throw new Error('Missing required fields: documentId, organizationId');
}

return [{ json: { documentId, organizationId } }];
```

### 3. Get Document Info (Supabase/Postgres)
- **Operation**: Execute Query
- **Query**:
```sql
SELECT id, name, file_url, file_type, organization_id 
FROM documents 
WHERE id = $1 AND organization_id = $2
```
- **Parameters**: 
  - `$1`: `={{ $json.documentId }}`
  - `$2`: `={{ $json.organizationId }}`

### 4. Extract File Path (Code)
```javascript
const { file_url } = $input.first().json;

if (!file_url) {
  throw new Error('Document file_url not found');
}

// Extract path from URL: https://...supabase.co/storage/v1/object/public/documents/{path}
const urlMatch = file_url.match(/\/documents\/(.+)$/);
if (!urlMatch) {
  throw new Error('Could not extract file path from URL');
}

const storagePath = decodeURIComponent(urlMatch[1]);

return [{
  json: {
    ...$input.first().json,
    storagePath
  }
}];
```

### 5. Download File from Supabase Storage (HTTP Request)
- **Method**: GET
- **URL**: `={{ $json.file_url }}`
- **Authentication**: None (public URL) of Basic Auth met service role key
- **Response Format**: File

**OF gebruik Supabase API met service role key:**
- **URL**: `https://{{ $json.supabaseUrl }}/storage/v1/object/public/documents/{{ $json.storagePath }}`
- **Headers**: 
  - `apikey`: `{{ $vars.SUPABASE_SERVICE_ROLE_KEY }}`
  - `Authorization`: `Bearer {{ $vars.SUPABASE_SERVICE_ROLE_KEY }}`

### 6. Extract Text (Code)
```javascript
// This node handles different file types
const fileData = $input.first().binary.data;
const fileName = $input.first().json.name || '';
const fileType = $input.first().json.file_type || '';

// Convert binary to text for text files
let textContent = '';

if (fileType.includes('text/plain') || fileName.endsWith('.txt')) {
  // Text file - decode from base64
  textContent = Buffer.from(fileData.data, 'base64').toString('utf-8');
} else if (fileType === 'application/json' || fileName.endsWith('.json')) {
  // JSON file
  const jsonText = Buffer.from(fileData.data, 'base64').toString('utf-8');
  try {
    const json = JSON.parse(jsonText);
    textContent = JSON.stringify(json, null, 2);
  } catch {
    textContent = jsonText;
  }
} else if (fileType.includes('spreadsheet') || fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
  // XLSX file - requires xlsx library
  // Note: N8N doesn't have xlsx built-in, you might need to use a custom node
  // Or convert to CSV first, or use a different approach
  throw new Error('XLSX extraction requires additional setup. Consider converting to CSV first.');
} else if (fileType === 'text/csv' || fileName.endsWith('.csv')) {
  // CSV file
  textContent = Buffer.from(fileData.data, 'base64').toString('utf-8');
} else {
  throw new Error(`Unsupported file type: ${fileType}. Supported: TXT, JSON, CSV`);
}

if (!textContent || textContent.trim().length === 0) {
  throw new Error('Extracted text is empty');
}

return [{
  json: {
    ...$input.first().json,
    content: textContent,
    contentLength: textContent.length
  }
}];
```

### 7. Chunk Text (Code)
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

const { documentId, organizationId, content } = $input.first().json;
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

### 8. Loop Over Chunks (Split Into Items)
- Laat leeg - chunks zijn al gesplit

### 9. Generate Embedding (OpenAI)
- **Resource**: Embedding
- **Model**: `text-embedding-3-small`
- **Dimensions**: `1536`
- **Text**: `={{ $json.text }}`
- **Credentials**: OpenAI API

### 10. Prepare Database Record (Code)
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

### 11. Insert to Database (Postgres)
- **Operation**: Insert
- **Table**: `document_sections`
- **Columns**:
  - `document_id`: `={{ $json.document_id }}`
  - `content`: `={{ $json.content }}`
  - `embedding`: `={{ $json.embedding }}`
  - `metadata`: `={{ $json.metadata }}`

### 12. Aggregate Results (Code)
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

### 13. Respond to Webhook
- **Response Body**: `={{ $json }}`

## 🔑 Environment Variables in N8N

Voeg toe in N8N **Settings** → **Variables**:

- `SUPABASE_URL`: Je Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key (voor Storage access)

## ⚠️ XLSX Support

Voor XLSX bestanden heb je twee opties:

### Optie A: Custom Node (Aanbevolen)
1. Installeer `n8n-nodes-xlsx` community node
2. Gebruik XLSX node om Excel te parsen

### Optie B: Convert in Frontend
Laat frontend XLSX converteren naar CSV voordat upload

### Optie C: Use Supabase Edge Function
Voor XLSX, gebruik nog steeds Edge Function (kleinere files)

## 🐛 Troubleshooting

### "File not found"
- Check of `file_url` correct is in database
- Check Storage bucket permissions
- Check service role key

### "Empty content"
- Check file type support
- Check of bestand niet leeg is
- Check text extraction logic

### "Memory limit"
- Verklein batch sizes
- Process in kleinere chunks
- Use streaming voor grote files

## ✅ Test

Test met curl:
```bash
curl -X POST https://your-n8n.com/webhook/process-document \
  -H "Content-Type: application/json" \
  -d '{
    "documentId": "your-document-id",
    "organizationId": "your-org-id"
  }'
```


