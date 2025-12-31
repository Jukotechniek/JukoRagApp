# Beveiligingssamenvatting - API Endpoints

## Huidige Beveiligingsmaatregelen

> **Let op**: De Supabase Edge Functions (`supabase/functions/chat` en `supabase/functions/process-document`) worden **NIET MEER GEBRUIKT**. 
> Alle functionaliteit loopt via de Python FastAPI en Next.js API routes.

### 1. **Next.js API Route** (`app/api/chat/route.ts`)

#### ✅ Proxy naar Python API
- Fungeert als proxy tussen frontend en Python API
- Forwarded `Authorization` header naar Python API
- Geen directe authenticatie (wordt door Python API afgehandeld)

### 2. **Python FastAPI** (`api/chat.py`)

#### ✅ Authenticatie (TOEGEVOEGD)
- Vereist `Authorization` header met JWT Bearer token
- Token wordt geverifieerd via Supabase Auth
- `verify_auth_token()` functie controleert:
  - Token geldigheid
  - Gebruiker bestaat in database
  - Gebruiker heeft toegang tot organisatie (of is admin)

#### ✅ CORS Beperkingen
- CORS kan worden beperkt via `ALLOWED_ORIGINS` environment variable
- Standaard: `*` voor development (moet worden aangepast voor productie)
- Alleen POST en OPTIONS methods toegestaan
- Alleen `authorization` en `content-type` headers toegestaan

#### ✅ Endpoints
- `/api/chat` - Vereist authenticatie (gebruikt door Next.js API route)
- `/api/process-document` - Vereist authenticatie (gebruikt direct vanuit frontend)

### 3. **Frontend Calls**

#### Chat
- Frontend roept `/api/chat` aan (Next.js API route)
- Next.js route proxied naar Python API met Authorization header
- Token wordt automatisch meegestuurd vanuit Supabase session

#### Document Processing
- Frontend roept direct Python API aan (`/api/process-document`)
- Token wordt automatisch meegestuurd vanuit Supabase session
- Geen token = request faalt

### 4. **Next.js API Routes (andere routes)**

#### ✅ Authenticatie
- Alle routes vereisen JWT token in Authorization header
- Token wordt geverifieerd via Supabase Auth

#### ✅ Autorisatie
- User role wordt uit database gehaald (niet uit request body)
- Service role key wordt alleen gebruikt na verificatie

## Beveiligingslagen

### Laag 1: CORS
- Origin checking voorkomt directe browser calls van andere websites
- Kan worden beperkt via `ALLOWED_ORIGINS` environment variable

### Laag 2: Authenticatie
- JWT token verificatie via Supabase Auth
- Token moet geldig zijn en niet verlopen

### Laag 3: Autorisatie
- Gebruiker moet in database staan
- Gebruiker moet toegang hebben tot de organisatie
- Admins hebben toegang tot alle organisaties

### Laag 4: Service Role Key
- Wordt alleen gebruikt na alle verificaties
- Bypasses RLS alleen voor geautoriseerde operaties

## Aanbevelingen voor Productie

1. **Stel ALLOWED_ORIGINS in voor Python API**:
   ```bash
   # In Python API environment (.env of deployment config)
   ALLOWED_ORIGINS=https://jouw-domein.com,https://www.jouw-domein.com
   ```
   
   **Let op**: De Supabase Edge Functions worden niet meer gebruikt, dus daar hoeft geen ALLOWED_ORIGINS ingesteld te worden.

2. **Rate Limiting**: Overweeg rate limiting toe te voegen om misbruik te voorkomen

3. **Monitoring**: Monitor voor verdachte activiteit (veel requests, verschillende origins, etc.)

4. **Token Expiry**: Zorg dat tokens een redelijke expiry tijd hebben

## Conclusie

**Alle actieve APIs zijn nu beveiligd met:**
- ✅ JWT token authenticatie (Python FastAPI)
- ✅ Database verificatie (gebruiker moet bestaan)
- ✅ Organization access checks (gebruiker moet bij organisatie horen of admin zijn)
- ✅ CORS beperkingen (configureerbaar via ALLOWED_ORIGINS)
- ✅ Service role key alleen na verificatie

**APIs kunnen NIET worden gebruikt zonder:**
- Een geldig JWT token van een ingelogde gebruiker
- De gebruiker moet in de database staan
- De gebruiker moet toegang hebben tot de organisatie (of admin zijn)

**Verwijderde code:**
- ✅ `supabase/functions/chat` - Verwijderd (vervangen door Python API)
- ✅ `supabase/functions/process-document` - Verwijderd (vervangen door Python API)

