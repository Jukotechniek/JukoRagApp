# N8N Document Processing Setup

Deze guide helpt je om document processing via N8N te configureren, wat veel betrouwbaarder is dan Supabase Edge Functions voor grote bestanden.

## 📋 Vereisten

1. **N8N geïnstalleerd** (lokaal of cloud)
   - Lokaal: `npm install -g n8n` of Docker
   - Cloud: [n8n.cloud](https://n8n.cloud) (€20/maand)
   - Self-hosted: Railway, Render, etc.

2. **Credentials nodig:**
   - OpenAI API Key
   - Supabase Database Connection (Postgres)

## 🚀 Stap 1: N8N Installeren

### Optie A: Lokaal (Development)
```bash
npm install -g n8n
n8n start
```

### Optie B: Docker
```bash
docker run -it --rm \
  --name n8n \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  n8nio/n8n
```

### Optie C: n8n.cloud (Aanbevolen voor productie)
1. Ga naar [n8n.cloud](https://n8n.cloud)
2. Maak account aan
3. Start gratis trial

## 🔧 Stap 2: Credentials Configureren

### OpenAI API Key
1. In N8N: **Credentials** → **Add Credential**
2. Selecteer **OpenAI**
3. Voer je API key in
4. Sla op als "OpenAI API"

### Supabase Postgres Connection
1. In Supabase Dashboard: **Settings** → **Database**
2. Kopieer **Connection String** (URI format)
3. In N8N: **Credentials** → **Add Credential**
4. Selecteer **Postgres**
5. Plak connection string
6. Sla op als "Supabase Postgres"

## 📝 Stap 3: Workflow Maken

### Node 1: Webhook Trigger
1. Sleep **Webhook** node naar canvas
2. Configureer:
   - **HTTP Method**: POST
   - **Path**: `process-document`
   - **Response Mode**: "Respond to Webhook"
3. **Test** → Kopieer de webhook URL (bijv. `https://your-n8n.com/webhook/process-document`)

### Node 2: Chunk Text (Code Node)
1. Sleep **Code** node naar canvas
2. Verbind met Webhook
3. Plak deze code:

```javascript
// Split text into chunks with overlap
function splitIntoChunks(text, maxLength = 1000, overlap = 200) {
  const chunks = [];
  let startIndex = 0;
  let chunkIndex = 0;

  while (startIndex < text.length) {
    let endIndex = Math.min(startIndex + maxLength, text.length);

    // Try to break at sentence boundary
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

if (!content || content.trim().length === 0) {
  return [{
    json: {
      error: 'Empty content',
      documentId,
      organizationId
    }
  }];
}

const chunks = splitIntoChunks(content);

return [{
  json: {
    documentId,
    organizationId,
    chunks,
    totalChunks: chunks.length
  }
}];
```

### Node 3: Split Into Items
1. Sleep **Split Into Items** node naar canvas
2. Verbind met Chunk Text
3. Configureer:
   - **Field to Split Out**: `chunks`

### Node 4: Generate Embeddings (OpenAI)
1. Sleep **OpenAI** node naar canvas
2. Verbind met Split Into Items
3. Configureer:
   - **Resource**: Embedding
   - **Operation**: Create
   - **Model**: `text-embedding-3-small`
   - **Dimensions**: `1536`
   - **Text**: `={{ $json.text }}`
   - **Credentials**: Selecteer "OpenAI API"

### Node 5: Prepare for Database (Code Node)
1. Sleep **Code** node naar canvas
2. Verbind met Generate Embeddings
3. Plak deze code:

```javascript
const embedding = $input.first().json.data[0].embedding;
const chunkData = $('Split Into Items').first().json;

return [{
  json: {
    document_id: chunkData.documentId,
    content: chunkData.text,
    embedding: embedding,
    metadata: chunkData.metadata
  }
}];
```

### Node 6: Insert to Supabase (Postgres)
1. Sleep **Postgres** node naar canvas
2. Verbind met Prepare for Database
3. Configureer:
   - **Operation**: Insert
   - **Schema**: `public`
   - **Table**: `document_sections`
   - **Columns**:
     - `document_id`: `={{ $json.document_id }}`
     - `content`: `={{ $json.content }}`
     - `embedding`: `={{ $json.embedding }}`
     - `metadata`: `={{ $json.metadata }}`
   - **Credentials**: Selecteer "Supabase Postgres"

### Node 7: Aggregate Results (Code Node)
1. Sleep **Code** node naar canvas
2. Verbind met Insert to Supabase
3. Plak deze code:

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

### Node 8: Respond to Webhook
1. Sleep **Respond to Webhook** node naar canvas
2. Verbind met Aggregate Results
3. Configureer:
   - **Respond With**: JSON
   - **Response Body**: `={{ $json }}`

### Error Handling
1. Sleep **IF** node na elke belangrijke stap
2. Check op errors
3. Verbind met **Respond to Webhook** (error response)

## 🔗 Stap 4: Frontend Configureren

1. Voeg N8N webhook URL toe aan `.env`:
```env
VITE_N8N_WEBHOOK_URL=https://your-n8n.com/webhook/process-document
```

2. Deploy je frontend opnieuw

## ✅ Stap 5: Testen

1. Upload een document via de frontend
2. Check N8N workflow execution logs
3. Check Supabase `document_sections` tabel
4. Test in chat of document werkt

## 🐛 Troubleshooting

### "Webhook not found"
- Check of workflow is **active** in N8N
- Check webhook URL in frontend `.env`

### "Postgres connection failed"
- Check Supabase connection string
- Check database credentials
- Check IP whitelist in Supabase

### "OpenAI API error"
- Check API key
- Check API quota/limits
- Check billing status

### "Empty content"
- Check of bestand niet leeg is
- Check text extraction in frontend

## 📊 Monitoring

N8N heeft ingebouwde monitoring:
- **Executions**: Zie alle workflow runs
- **Error Logs**: Zie waar het misgaat
- **Performance**: Zie timing per node

## 💰 Kosten

- **N8N Cloud**: €20/maand (unlimited executions)
- **Self-hosted**: Gratis (eigen server)
- **OpenAI**: ~$0.02 per 1M tokens (embedding)
- **Supabase**: Gratis tier is meestal genoeg

## 🎯 Voordelen vs Edge Functions

✅ **Geen memory limits** (kan grote bestanden aan)
✅ **Betere error handling** (retry logic)
✅ **Visual debugging** (zie elke stap)
✅ **Background processing** (niet blocking)
✅ **Monitoring dashboard** (ingebouwd)
✅ **Scalable** (kan parallel processen)





