# Migratie naar Next.js met LangChain JS en Langfuse

Dit project is gemigreerd van Supabase Edge Functions naar Next.js API routes met LangChain JS en Langfuse tracking.

## Wat is er veranderd?

1. **Next.js API Routes**: De chat functionaliteit draait nu via `/app/api/chat/route.ts` in plaats van Supabase Edge Functions
2. **OpenAI Direct**: We gebruiken OpenAI SDK direct voor chat en tool calling (geen LangChain nodig)
3. **Langfuse Tracking**: Alle stappen worden getracked:
   - Trace voor elke chat request
   - Spans voor retrieval, embeddings, vector search, keyword search
   - Generations voor chat responses en embeddings
   - Metadata op elke stap

## Setup

### 1. Installeer dependencies

```bash
npm install
```

### 2. Environment variables

Maak een `.env.local` bestand met:

```env
# Supabase
# NEXT_PUBLIC_* = beschikbaar in browser (client-side)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Server-only (NIET in browser, veiligheidsrisico!)
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# OpenAI (server-only)
OPENAI_API_KEY=your_openai_api_key

# Langfuse (server-only)
LANGFUSE_SECRET_KEY=your_langfuse_secret_key
LANGFUSE_PUBLIC_KEY=your_langfuse_public_key
LANGFUSE_HOST=https://cloud.langfuse.com
```

### 3. Run development server

```bash
npm run dev
```

## Langfuse Tracking

Elke chat request wordt getracked in Langfuse met:

- **Trace**: Hoofd trace voor de hele request
- **Spans**: 
  - `load_history`: Laden van chat geschiedenis
  - `build_context`: Context building
  - `find_documents`: Document zoeken
  - `retrieve_documents`: Document retrieval
    - `create_embedding`: Embedding generatie
    - `vector_search`: Vector search
    - `keyword_search`: Keyword search
  - `agent_execution`: Agent uitvoering
    - `chat_iteration_N`: Elke chat iteratie
- **Generations**: Voor embeddings en chat responses

## API Route

De API route is beschikbaar op `/api/chat` en accepteert POST requests met:

```json
{
  "question": "Wat is de locatie van machine AB123?",
  "organizationId": "org-id",
  "userId": "user-id",
  "conversationId": "conv-id"
}
```

Response:

```json
{
  "success": true,
  "requestId": "abc123",
  "response": "Machine AB123 staat in...",
  "metadata": {
    "has_machine_info": true,
    "documents_found": 2,
    "documents_attached": 1,
    "search_terms": ["AB123"],
    "intent": {...},
    "conversation_context": {...},
    "duration_ms": 1234
  }
}
```

## Frontend

De frontend gebruikt nog steeds React Router, maar belt nu naar de Next.js API route in plaats van Supabase Edge Functions. De `sendChatMessage` functie in `src/lib/chat.ts` is aangepast om naar `/api/chat` te bellen.

## Volgende stappen

Als je volledig naar Next.js App Router wilt migreren:

1. Migreer `src/pages/*` naar `app/*` directory
2. Gebruik Next.js routing in plaats van React Router
3. Gebruik Next.js server components waar mogelijk

Voor nu werkt het project met Next.js API routes terwijl de frontend React Router blijft gebruiken.

