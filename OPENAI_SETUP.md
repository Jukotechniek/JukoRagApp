# OpenAI RAG Setup

Deze applicatie gebruikt OpenAI voor RAG (Retrieval-Augmented Generation) functionaliteit.

## Wat is geïmplementeerd?

✅ **Document Processing**: Documenten worden automatisch verwerkt bij upload
- Documenten worden opgesplitst in chunks
- Embeddings worden gegenereerd met OpenAI (1536 dimensions)
- Opgeslagen in `document_sections` tabel voor similarity search

✅ **RAG Chat**: Chat gebruikt automatisch relevante document secties
- Vragen worden omgezet naar embeddings
- Meest relevante document secties worden gevonden
- AI antwoord wordt gegenereerd met context

## Setup

### 1. Environment Variables

Maak een `.env` bestand in de root van je project:

```env
# Supabase
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key

# OpenAI (voor RAG)
VITE_OPENAI_API_KEY=your-openai-api-key
```

### 2. OpenAI API Key

1. Ga naar [OpenAI Platform](https://platform.openai.com/)
2. Maak een account of log in
3. Ga naar **API Keys**
4. Maak een nieuwe API key
5. Kopieer de key naar je `.env` bestand

**Let op:** 
- API keys kosten geld (zie pricing hieronder)
- Bewaar je API key veilig, deel deze nooit publiekelijk
- Gebruik environment variables, nooit hardcode in code

### 3. Database Schema

Zorg dat je de RAG schema hebt geïnstalleerd:

1. Voer `supabase_rag_schema.sql` uit in Supabase SQL Editor
2. Dit maakt de `document_sections` tabel aan met 1536 dimensions

### 4. Test

1. Upload een tekst bestand via de Documenten pagina
2. Wacht tot het document is verwerkt (je krijgt een notificatie)
3. Stel een vraag in de Chat die gerelateerd is aan het document
4. De AI zou nu context uit het document moeten gebruiken!

## Kosten

### OpenAI Embeddings (text-embedding-3-small)
- **$0.02 per 1M tokens**
- Een gemiddeld document van 10.000 woorden = ~13.000 tokens
- Kosten: ~$0.00026 per document

### OpenAI Chat (gpt-4o-mini)
- **$0.15 per 1M input tokens, $0.60 per 1M output tokens**
- Een gemiddelde vraag + context = ~500-2000 tokens
- Kosten: ~$0.0003-0.0012 per vraag

**Voorbeeld maandelijkse kosten:**
- 100 documenten uploaden: ~$0.03
- 1000 vragen stellen: ~$0.30-1.20
- **Totaal: ~$0.33-1.23 per maand** (bij laag gebruik)

## Hoe het werkt

### Document Upload Flow

1. **Upload**: Gebruiker uploadt een document
2. **Storage**: Document wordt opgeslagen in Supabase Storage
3. **Metadata**: Document metadata wordt opgeslagen in `documents` tabel
4. **Text Extraction**: Tekst wordt geëxtraheerd uit het bestand
5. **Chunking**: Tekst wordt opgesplitst in chunks (1000 chars, 200 overlap)
6. **Embeddings**: Elke chunk krijgt een embedding via OpenAI API
7. **Storage**: Chunks + embeddings worden opgeslagen in `document_sections`

### Chat Flow (RAG)

1. **Vraag**: Gebruiker stelt een vraag
2. **Embedding**: Vraag wordt omgezet naar embedding via OpenAI
3. **Search**: Database zoekt naar meest relevante document secties (cosine similarity)
4. **Context**: Top 5 relevante secties worden gecombineerd als context
5. **AI Response**: OpenAI genereert antwoord met context
6. **Display**: Antwoord wordt getoond aan gebruiker

## Bestandstypen

### Ondersteund voor RAG:
- ✅ **Text files** (.txt) - Volledig ondersteund
- ✅ **JSON files** (.json) - Volledig ondersteund

### Upload maar niet verwerkt (nog):
- ⚠️ **PDF** (.pdf) - Vereist PDF parser
- ⚠️ **DOCX** (.docx) - Vereist DOCX parser
- ⚠️ **XLSX** (.xlsx) - Vereist XLSX parser
- ⚠️ **Images** - Vereist OCR

**Tip:** Voor PDF/DOCX parsing, overweeg:
- Backend service met `pdf-parse` of `mammoth`
- Of gebruik Supabase Edge Functions

## Troubleshooting

### "VITE_OPENAI_API_KEY is not set"
- Controleer of je `.env` bestand bestaat
- Controleer of de variabele naam correct is
- Herstart je dev server na het toevoegen van de variabele

### "Failed to generate embedding"
- Controleer of je OpenAI API key geldig is
- Controleer of je credits hebt op je OpenAI account
- Check de browser console voor meer details

### Document wordt niet verwerkt
- Controleer of het bestandstype ondersteund is
- Check de browser console voor errors
- Zorg dat je OpenAI API key is ingesteld

### Geen relevante resultaten in chat
- Zorg dat documenten zijn geüpload en verwerkt
- Controleer of embeddings zijn gegenereerd (check `document_sections` tabel)
- Probeer een vraag die direct gerelateerd is aan je documenten

## Code Locaties

- **OpenAI functions**: `src/lib/openai.ts`
- **Document processing**: `src/lib/document-processing.ts`
- **Document upload**: `src/components/dashboard/DocumentsView.tsx`
- **Chat RAG**: `src/pages/Dashboard.tsx` (handleSendMessage)

## Volgende Stappen

1. ✅ OpenAI API key toevoegen
2. ✅ Database schema installeren
3. ✅ Document uploaden en testen
4. 🔄 PDF/DOCX parsing toevoegen (optioneel)
5. 🔄 Error handling verbeteren (optioneel)
6. 🔄 Batch processing optimaliseren (optioneel)









