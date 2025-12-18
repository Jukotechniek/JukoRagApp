# N8N AI Agent Setup voor Chat

Deze guide helpt je om de chat functionaliteit via N8N te configureren, zodat je volledige controle hebt over de AI agent logica.

**Belangrijk**: De chat gaat nu direct vanuit de frontend naar N8N (net zoals document processing). De Edge Function wordt **niet meer gebruikt** - de chat vereist dat N8N is geconfigureerd.

## 📋 Vereisten

1. **N8N geïnstalleerd** (lokaal of cloud)
2. **OpenAI API Key** (of andere LLM provider)
3. **Supabase Database Connection** (voor RAG context)
4. **Supabase Client** (voor document queries en RAG)

## 🚀 Stap 1: N8N Workflow Maken

### Node 1: Webhook Trigger
1. Sleep **Webhook** node naar canvas
2. Configureer:
   - **HTTP Method**: POST
   - **Path**: `chat-agent`
   - **Response Mode**: "Respond to Webhook"
3. **Test** → Kopieer de webhook URL (bijv. `https://your-n8n.com/webhook/chat-agent`)

### Node 2: Get Chat History (Postgres)
1. Sleep **Postgres** node naar canvas
2. Verbind met Webhook
3. Configureer:
   - **Operation**: Execute Query
   - **Query**: 
   ```sql
   SELECT role, content, created_at
   FROM chat_messages
   WHERE organization_id = $1
     AND conversation_id = $2
   ORDER BY created_at DESC
   LIMIT 6;
   ```
   - **Parameters**: 
     - `$1`: `={{ $json.organizationId }}`
     - `$2`: `={{ $json.conversationId }}`

### Node 3: Generate Question Embedding (OpenAI)
1. Sleep **OpenAI** node naar canvas
2. Verbind met Get Chat History
3. Configureer:
   - **Resource**: Embedding
   - **Operation**: Create
   - **Model**: `text-embedding-3-small`
   - **Text**: `={{ $('Webhook').first().json.question }}`
   - **Credentials**: Selecteer je OpenAI credentials

### Node 4: Perform RAG Search (Postgres RPC)
1. Sleep **Postgres** node naar canvas
2. Verbind met Generate Question Embedding
3. Configureer:
   - **Operation**: Execute Query
   - **Query**: 
   ```sql
   SELECT * FROM match_document_sections(
     $1::uuid,  -- organization_id
     $2::vector,  -- query_embedding
     20,  -- match_count
     0.30  -- threshold
   );
   ```
   - **Parameters**: 
     - `$1`: `={{ $('Webhook').first().json.organizationId }}`
     - `$2`: `={{ $json.data[0].embedding }}`

### Node 5: Build Context (Code Node)
1. Sleep **Code** node naar canvas
2. Verbind met Perform RAG Search
3. Plak deze code:

```javascript
const webhookData = $('Webhook').first().json;
const history = $('Get Chat History').all().map(item => ({
  role: item.json.role,
  content: item.json.content,
})).reverse(); // Reverse to chronological order

const ragSections = $input.all().map(item => item.json);

// Build RAG context
let ragContext = '';
if (ragSections.length > 0) {
  ragContext = ragSections.slice(0, 10).map((s, i) => {
    const citation = `[${i + 1}]`;
    const source = `${s.document_name || 'Document'}${s.page ? ` (p.${s.page})` : ''}`;
    return `${citation} ${source} (score: ${s.similarity?.toFixed(2) || 'N/A'})\n${s.content}`;
  }).join('\n\n---\n\n');
}

return [{
  json: {
    question: webhookData.question,
    history,
    ragContext,
    organizationId: webhookData.organizationId,
    userId: webhookData.userId,
    conversationId: webhookData.conversationId,
    ragSections: ragSections.slice(0, 10),
  }
}];
```

### Node 3: Build System Prompt (Code Node)
1. Sleep **Code** node naar canvas
2. Verbind met Parse Input
3. Plak deze code:

```javascript
const {
  question,
  history,
  ragContext,
  machineInfo,
  availableDocuments,
  intent,
  conversationContext,
} = $input.first().json;

// Build context parts
const contextParts = [];

if (conversationContext.mentionedDocuments?.length > 0) {
  contextParts.push(
    `GESPREK CONTEXT:
Recent genoemde documenten: ${conversationContext.mentionedDocuments.join(", ")}
${conversationContext.hasVagueReference ? `⚠️ User gebruikt vage verwijzing - verwijst naar: ${conversationContext.mentionedDocuments[conversationContext.mentionedDocuments.length - 1]}` : ""}
Machines in gesprek: ${conversationContext.mentionedMachines?.join(", ") || "geen"}`
  );
}

if (machineInfo) {
  contextParts.push(
    `MACHINE DATABASE:
- Naam: ${machineInfo.machinenaam || machineInfo.machine_naam || "onbekend"}
- Nummer: ${machineInfo.machinenummer || machineInfo.machine_nummer || "onbekend"}
- Locatie: ${machineInfo.locatie || "onbekend"}`
  );
}

if (ragContext) {
  contextParts.push(
    `DOCUMENT BRONNEN:
${ragContext}

BELANGRIJK: Verwijs naar bronnen met [1], [2], etc.`
  );
}

const fullContext = contextParts.join("\n\n" + "=".repeat(60) + "\n\n");

const systemPrompt = `Je bent een intelligente technische assistent voor industriële machines.

JOUW CAPABILITIES:
✅ Beantwoord technische vragen (storingen, parameters, werking)
✅ Geef locatie-informatie (waar machines/kasten staan)
✅ Stuur documenten door op verzoek (E-schema's, handleidingen, facturen)
✅ Gebruik conversatiegeschiedenis voor context

PRIORITEIT VAN BRONNEN:
1. GESPREK CONTEXT → gebruik dit om vage verwijzingen te begrijpen
2. MACHINE DATABASE → meest betrouwbaar voor machine info
3. DOCUMENT BRONNEN [1], [2] → voor technische details
4. Algemene kennis → alleen als backup

${fullContext ? `\nBESCHIKBARE CONTEXT:\n${fullContext}` : "\nGeen context beschikbaar."}

ANTWOORD RICHTLIJNEN:
- Gebruik RAG CONTEXT als beschikbaar
- Verwijs naar bronnen: "Volgens [1]..." of "In document X staat..."
- Max 5-6 zinnen
- Antwoord in het Nederlands`;

return [{
  json: {
    systemPrompt,
    question,
    history,
    availableDocuments,
    intent,
  }
}];
```

### Node 4: Build Messages (Code Node)
1. Sleep **Code** node naar canvas
2. Verbind met Build System Prompt
3. Plak deze code:

```javascript
const {
  systemPrompt,
  question,
  history,
} = $input.first().json;

// Build messages array
const messages = [
  { role: "system", content: systemPrompt },
];

// Add recent history (last 6 messages)
history.slice(-6).forEach((msg) => {
  messages.push({ 
    role: msg.role, 
    content: msg.content 
  });
});

// Add current question
messages.push({ role: "user", content: question });

return [{
  json: {
    messages,
    availableDocuments: $('Build System Prompt').first().json.availableDocuments,
    intent: $('Build System Prompt').first().json.intent,
  }
}];
```

### Node 5: Call OpenAI (OpenAI Node)
1. Sleep **OpenAI** node naar canvas
2. Verbind met Build Messages
3. Configureer:
   - **Resource**: Chat
   - **Operation**: Create Message
   - **Model**: `gpt-4o-mini` (of ander model)
   - **Messages**: `={{ $json.messages }}`
   - **Max Tokens**: `600`
   - **Temperature**: `0.35`
   - **Credentials**: Selecteer je OpenAI credentials

### Node 6: Process Response (Code Node)
1. Sleep **Code** node naar canvas
2. Verbind met Call OpenAI
3. Plak deze code:

```javascript
const openaiResponse = $input.first().json;
const availableDocuments = $('Build Messages').first().json.availableDocuments || [];
const intent = $('Build Messages').first().json.intent || {};

let text = openaiResponse.choices?.[0]?.message?.content || "Sorry, ik kon geen antwoord genereren.";
const usage = openaiResponse.usage || null;

// Remove markdown links (we add our own)
text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");

// Attach documents if requested
const attachedDocs = [];
if ((intent.wantsDocument || intent.wantsAllDocs) && availableDocuments.length > 0) {
  // Select relevant documents (simplified - you can add more logic)
  const selectedDocs = availableDocuments.slice(0, 3);
  
  // Add document links to text
  const docLinks = selectedDocs
    .map(d => `📄 [${d.name}](${d.file_url})`)
    .join("\n");
  text += `\n\n${docLinks}`;
  
  attachedDocs.push(...selectedDocs);
}

return [{
  json: {
    success: true,
    text,
    usage,
    attachedDocs,
  }
}];
```

### Node 7: Respond to Webhook
1. Sleep **Respond to Webhook** node naar canvas
2. Verbind met Process Response
3. Configureer:
   - **Respond With**: JSON
   - **Response Body**: `={{ $json }}`

### Error Handling
1. Voeg **IF** nodes toe na belangrijke stappen
2. Check op errors
3. Verbind met **Respond to Webhook** (error response):

```javascript
return [{
  json: {
    success: false,
    error: $input.first().json.error?.message || "Unknown error",
    text: "Sorry, er is een fout opgetreden bij het verwerken van je vraag.",
    usage: null,
    attachedDocs: [],
  }
}];
```

## 🔧 Stap 2: Environment Variable Configureren

Voeg de N8N chat webhook URL toe aan je frontend `.env` bestand:

1. Maak of open `.env` in de root van je project
2. Voeg toe:
```env
VITE_N8N_CHAT_WEBHOOK_URL=https://your-n8n.com/webhook/chat-agent
```

**Let op**: 
- Gebruik `VITE_` prefix (vereist voor Vite)
- Herstart je development server na het toevoegen
- Voor productie: voeg toe aan je deployment environment variables

**Fallback**: Als `VITE_N8N_CHAT_WEBHOOK_URL` niet is ingesteld, valt de chat automatisch terug op de Supabase Edge Function.

## ✅ Stap 3: Testen

1. Stel een vraag in de chat interface
2. Check N8N workflow execution logs
3. Check of het antwoord correct is
4. Check of documenten correct worden meegestuurd

## 📤 Frontend Payload

De frontend stuurt deze data naar N8N:

```json
{
  "question": "Vraag van gebruiker",
  "organizationId": "uuid",
  "userId": "uuid",
  "conversationId": "uuid",
  "timestamp": "2025-01-XX..."
}
```

**Let op**: N8N moet zelf:
- Chat history ophalen uit Supabase
- RAG context genereren (embeddings + document search)
- Machine info ophalen (als nodig)
- Documenten vinden

## 📥 N8N Response Format

N8N moet dit formaat terugsturen:

```json
{
  "success": true,
  "response": "Antwoord tekst",
  "metadata": {
    "sections_found": 5,
    "documents_found": 2,
    ...
  }
}
```

Of bij fout:
```json
{
  "success": false,
  "error": "Foutmelding"
}
```

## 🎯 Voordelen van N8N voor Chat

✅ **Volledige controle** over AI agent logica
✅ **Visual workflow** - zie elke stap
✅ **Eenvoudig aanpassen** zonder code te deployen
✅ **Betere debugging** - zie exact wat er gebeurt
✅ **Flexibel** - gebruik verschillende LLM providers
✅ **Custom logic** - voeg extra stappen toe (bijv. sentiment analysis, logging)
✅ **Consistent** - zelfde patroon als document processing

## ⚠️ Vereiste Configuratie

**De chat vereist dat `VITE_N8N_CHAT_WEBHOOK_URL` is geconfigureerd.** Als deze niet is ingesteld, krijg je een duidelijke foutmelding. Er is geen fallback naar de Edge Function meer.

Zorg ervoor dat je N8N workflow actief is voordat je de chat gebruikt.

## 📊 Monitoring

N8N heeft ingebouwde monitoring:
- **Executions**: Zie alle chat requests
- **Error Logs**: Zie waar het misgaat
- **Performance**: Zie timing per node
- **Token Usage**: Track kosten per request

## 💡 Tips

1. **Test eerst lokaal** voordat je naar productie gaat
2. **Monitor token usage** - N8N kan dit automatisch loggen
3. **Gebruik error handling** - zorg dat fouten netjes worden afgehandeld
4. **Cache responses** - voor veelgestelde vragen
5. **Rate limiting** - voeg rate limiting toe in N8N

## 🐛 Troubleshooting

### "N8N webhook not found"
- Check of workflow is **active** in N8N
- Check webhook URL in Supabase environment variables
- Check of webhook path correct is

### "Timeout error"
- Verhoog timeout in N8N workflow settings
- Check of OpenAI API snel genoeg reageert
- Overweeg async processing voor lange requests

### "Invalid response format"
- Zorg dat N8N exact dit formaat terugstuurt:
```json
{
  "success": true,
  "text": "Antwoord tekst",
  "usage": { "prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150 },
  "attachedDocs": []
}
```

## 📝 Voorbeeld N8N Workflow JSON

Je kunt de workflow exporteren en delen. Zie `n8n-workflow-chat-agent.json` voor een volledig voorbeeld.

