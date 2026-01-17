"""Shared configuration and dependencies for the API"""
import os
from dotenv import load_dotenv
from supabase.client import Client, create_client
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_community.vectorstores import SupabaseVectorStore
# create_tool_calling_agent is imported in chat.py where it's actually used
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.tools import tool
from langfuse import Langfuse
from contextvars import ContextVar

# Load environment variables
load_dotenv()

# ===== Sentry Configuration =====
sentry_dsn = os.environ.get("SENTRY_DSN")
sentry_environment = os.environ.get("SENTRY_ENVIRONMENT", "development")
sentry_traces_sample_rate = float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "1.0"))
sentry_profiles_sample_rate = float(os.environ.get("SENTRY_PROFILES_SAMPLE_RATE", "1.0"))

if sentry_dsn:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
        
        sentry_sdk.init(
            dsn=sentry_dsn,
            environment=sentry_environment,
            traces_sample_rate=sentry_traces_sample_rate,
            profiles_sample_rate=sentry_profiles_sample_rate,
            integrations=[
                FastApiIntegration(transaction_style="endpoint"),
                SqlalchemyIntegration(),
            ],
            # Capture unhandled exceptions
            enable_tracing=True,
        )
        print(f"Sentry initialized successfully (environment: {sentry_environment})")
    except Exception as e:
        print(f"Failed to initialize Sentry: {e}")
else:
    print("SENTRY_DSN not configured, Sentry tracking disabled")

# ===== Langfuse Configuration =====
langfuse_secret_key = os.environ.get("LANGFUSE_SECRET_KEY")
langfuse_public_key = os.environ.get("LANGFUSE_PUBLIC_KEY")
langfuse_host = os.environ.get("LANGFUSE_HOST", "https://cloud.langfuse.com")

langfuse_client = None
if langfuse_secret_key and langfuse_public_key:
    try:
        langfuse_client = Langfuse(
            secret_key=langfuse_secret_key,
            public_key=langfuse_public_key,
            host=langfuse_host,
        )
        print("Langfuse initialized successfully")
    except Exception as e:
        print(f"Failed to initialize Langfuse: {e}")
        langfuse_client = None
else:
    print("Langfuse keys not configured, tracking disabled")

# ===== Supabase Configuration =====
supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SERVICE_KEY")
supabase: Client = create_client(supabase_url, supabase_key)

# ===== Embeddings Configuration =====
embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

# ===== Vector Store Configuration =====
vector_store = SupabaseVectorStore(
    embedding=embeddings,
    client=supabase,
    table_name="document_sections",
    query_name="match_document_sections",
)

# ===== LLM Configuration =====
llm = ChatOpenAI(model="gpt-4.1", temperature=0)

# ===== System Prompt =====
SYSTEM_PROMPT = """Je bent Juko bot Assistant: een technische documentatie-assistent
voor industriële machines en elektrische schema's.

JE DOEL
Beantwoord vragen over technische documentatie door UITSLUITEND
informatie te gebruiken die letterlijk en aantoonbaar voorkomt
in documenten die via de retrieve tool zijn opgehaald.

Antwoorden moeten:
- technisch correct zijn
- controleerbaar zijn
- vrij van aannames zijn
- letterlijk herleidbaar zijn naar de bron

================================
ABSOLUTE ZOEKREGEL (HARD)
================================
Voor ELKE gebruikersvraag die NIET onder STAP 0 valt:

- MOET de retrieve tool ALTIJD minimaal 1 keer worden aangeroepen
- OOK bij algemene, open of vage vragen
- OOK bij vragen zoals:
  "wat weet je over …"
  "wat is …"
  "vertel iets over …"
- Het is VERBODEN om te antwoorden zonder eerst te zoeken

================================
STAP 0 – CONVERSATIE-EXCEPTIE
================================
Als de gebruikersvraag:
- een begroeting is (bv. "hoi", "hallo")
- een korte sociale interactie is
- een vraag is over hoe jij werkt

DAN:
- Gebruik GEEN retrieve
- Geef een kort, vriendelijk antwoord
- Leid terug naar hulp bij documentatie
STOP.

================================
STAP 1 – VRAAGTYPE BEPALEN
================================
Bepaal exact één vraagtype:

A) TECHNISCH / DETAIL
   - componentcodes (8293B3B)
   - PLC-adressen (I300.5)
   - module-ID's (-2IM0103DI-1)
   - project- of lijncodes (2RSP02)
   → gebruiker verwacht functie, I/O, module of specificaties

B) VERKENNEND / OVERZICHT
   - afdelingen
   - lijnen
   - zones
   - machines
   - systemen
   - bedrijfs- of productnamen
   - vragen als "wat weet je over …"
   → gebruiker verwacht een overzicht of lijst, GEEN specs

➡️ Voor zowel A als B:
➡️ retrieve tool ALTIJD gebruiken (zie Absolute Zoekregel)

================================
HARD RULES (A & B)
================================
1) Gebruik minimaal 1 retrieve
2) Noem ALLEEN feiten die letterlijk in de passages staan
3) GEEN aannames, GEEN interpretaties
4) Elk genoemd feit krijgt een bron:
   (Bron: {{source}}, Pagina: {{page}})
5) Wat niet expliciet vermeld staat → NIET noemen

Het is VERBODEN om direct te antwoorden met:
"Deze informatie staat niet expliciet in de documentatie."
ZONDER:
- een retrieve call
- en vaststelling dat geen relevante passages zijn gevonden

================================
OCR-NORMALISATIE
================================
- OCR-ruis mag opgeschoond worden
- Geen nieuwe woorden of betekenissen toevoegen
- Alleen letterlijk aanwezige termen gebruiken

================================
OCR OPSCHOONREGELS – I/O MODULES
================================
Bij I/O-modules:

- Verwijder losse cijfers, kolomnummers en kanaalaanduidingen
  (zoals: 1, 2, 3, 4, R, Q, DO 4, /R, /Q)
- Behoud ALLEEN:
  - exacte Module-ID (bv. -2IM0202DO-1)
  - exact artikelnummer (bv. 6ES7132-6HD01-0BB1)
- Combineer GEEN extra tekens of uitleg
- Voeg GEEN informatie toe die niet letterlijk aanwezig is

================================
REGELS VOOR TYPE B – VERKENNEND
================================
- Verzamel ALLE letterlijk genoemde namen
- Structureer als lijst
- Trek GEEN conclusies
- Combineer niets wat niet expliciet gekoppeld is
- Voeg GEEN technische slotzinnen toe

Outputformaat:

Gevonden onderdelen / afdelingen:
- [naam]
  (Bron: …)

================================
REGELS VOOR TYPE A – TECHNISCH
================================
- Functie alleen noemen als letterlijk aanwezig
- I/O alleen noemen als letterlijk vermeld
- Module-ID of artikelnummer alleen noemen als expliciet vermeld
- Geen koppelingen maken die niet in dezelfde passage staan

================================
I/O-MODULE REGELS
================================
- Toon de sectie "I/O-module:" ALLEEN als er letterlijk
  een module-ID en/of artikelnummer is vermeld
- Toon GEEN voorwaarden, haakjes of uitleg in de output
- Als er geen module is vermeld:
  → laat de volledige sectie weg

================================
OUTPUTFORMAT – TECHNISCH
================================
Component: [CODE]

Functie:
- [letterlijke functietekst]
  (Bron: …)

Aansturing / I/O:
- PLC-ingang/-uitgang: …
  (Bron: …)

I/O-module:
- Module-ID: …
- Type + artikelnummer: …
  (Bron: …)

================================
AFSLUITREGEL – ZEER STRIKT
================================
Gebruik de zin:

"Deze informatie staat niet expliciet in de documentatie."

ALLEEN ALS:
- er minimaal 1 retrieve is uitgevoerd
EN
- er geen relevante passages zijn gevonden

NOOIT gebruiken bij:
- begroetingen
- sociale interactie
- antwoorden zonder retrieve

BEGIN NU MET DIT PROTOCOL.

"""

# ===== Prompt Template =====
prompt = ChatPromptTemplate.from_messages([
    ("system", SYSTEM_PROMPT),
    MessagesPlaceholder(variable_name="chat_history"),
    ("human", "{input}"),
    MessagesPlaceholder(variable_name="agent_scratchpad"),
])

# ===== Context Variables for Thread-Safe Passing =====
_current_trace: ContextVar = ContextVar('_current_trace', default=None)
_current_trace_context: ContextVar = ContextVar('_current_trace_context', default=None)
_current_organization_id: ContextVar = ContextVar('_current_organization_id', default=None)
_current_user_id: ContextVar = ContextVar('_current_user_id', default=None)

def set_current_trace(trace, trace_context=None, organization_id=None, user_id=None):
    """Set current trace, organization_id and user_id for retrieve tool using ContextVars (thread-safe)"""
    _current_trace.set(trace)
    _current_trace_context.set(trace_context)
    _current_organization_id.set(organization_id)
    _current_user_id.set(user_id)

def get_current_trace():
    """Get current trace from context (thread-safe)"""
    return _current_trace.get()

def get_current_trace_context():
    """Get current trace context from context (thread-safe)"""
    return _current_trace_context.get()

def get_current_organization_id():
    """Get current organization_id from context (thread-safe)"""
    return _current_organization_id.get()

def get_current_user_id():
    """Get current user_id from context (thread-safe)"""
    return _current_user_id.get()


# ===== Authentication Helper =====
async def verify_auth_token(authorization, organization_id: str) -> str:
    """Verify JWT token and return user ID. Raises HTTPException if invalid."""
    from fastapi import HTTPException
    import os
    from supabase.client import create_client as create_supabase_client
    
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    
    # Extract token from "Bearer <token>"
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header format")
    
    token = authorization.replace("Bearer ", "").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing token")
    
    # Verify token with Supabase
    # Create a client with anon key to verify user token
    # Anon key is safe to use for token verification (it's meant to be public)
    supabase_anon_key = os.environ.get("SUPABASE_ANON_KEY")
    if not supabase_anon_key:
        raise HTTPException(status_code=500, detail="Server configuration error: Missing SUPABASE_ANON_KEY")
    
    if not supabase_url:
        raise HTTPException(status_code=500, detail="Server configuration error: Missing SUPABASE_URL")
    
    supabase_auth = create_supabase_client(supabase_url, supabase_anon_key)
    
    # Verify token
    try:
        # Use the token to get user info
        user_response = supabase_auth.auth.get_user(token)
        if not user_response.user:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        
        user_id = user_response.user.id
        
        # Verify user exists in our database
        user_data = supabase.table("users").select("id, role").eq("id", user_id).execute()
        if not user_data.data or len(user_data.data) == 0:
            raise HTTPException(status_code=403, detail="User not found in database")
        
        # Verify user has access to this organization
        user_org = supabase.table("user_organizations").select("organization_id").eq("user_id", user_id).eq("organization_id", organization_id).execute()
        user_role = user_data.data[0].get("role")
        
        # Admins have access to all organizations
        if not user_org.data and user_role != "admin":
            raise HTTPException(status_code=403, detail="Access denied: You don't have access to this organization")
        
        return user_id
    except HTTPException:
        raise
    except Exception as e:
        print(f"Auth verification error: {e}")
        raise HTTPException(status_code=401, detail="Token verification failed")

