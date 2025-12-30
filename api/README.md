# Python Agent API

Deze Python API gebruikt exact dezelfde agent code als de originele Streamlit versie.

## Setup

1. Installeer dependencies:
```bash
pip install -r requirements.txt
```

2. Maak een `.env` bestand in de `api` folder:
```env
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_service_key
OPENAI_API_KEY=your_openai_key
LANGFUSE_SECRET_KEY=your_langfuse_secret_key
LANGFUSE_PUBLIC_KEY=your_langfuse_public_key
LANGFUSE_HOST=https://cloud.langfuse.com  # optioneel
```

3. Start de server:
```bash
python chat.py
```

De API draait op `http://localhost:8000`

## API Endpoint

### POST /api/chat

**Request:**
```json
{
  "question": "Wat weet je over factuur 2025-60",
  "organizationId": "uuid-van-organisatie",
  "userId": "uuid-van-gebruiker",
  "conversationId": "uuid-van-conversatie" // optioneel
}
```

**Response:**
```json
{
  "success": true,
  "response": "Het antwoord van de AI...",
  "requestId": "abc12345"
}
```

## Langfuse Tracking

De agent trackt alle stappen in Langfuse:

- **Trace**: Elke chat request krijgt een trace met metadata
- **Spans**: 
  - `load_history`: Chat history ophalen
  - `agent_execution`: Agent uitvoering
  - `retrieve`: Document retrieval (met sub-spans)
    - `semantic_search`: Vector similarity search
    - `keyword_search`: Keyword matching voor factuurnummers
    - `combine_results`: Resultaten combineren
  - `agent_step_N`: Individuele agent stappen
- **Generations**:
  - `llm_call`: Elke LLM call met usage tracking
  - `create_embedding`: Embedding generatie voor semantic search

Alle stappen worden getracked met:
- Input/output data
- Duration timings
- Error tracking
- Token usage (voor LLM calls)

## Integratie met Next.js

Je kunt deze Python API aanroepen vanuit je Next.js app door de API route aan te passen om naar deze Python service te proxy'en, of door de frontend direct naar deze API te laten bellen.

