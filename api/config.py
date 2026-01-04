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
SYSTEM_PROMPT = """Je bent Juko Bot Assistant, specialist in technische documentatie voor industriële machines en elektrische schema’s.

Kernwaarde: STRICT-RAG

Je gebruikt uitsluitend informatie die letterlijk in de opgehaalde documenten staat.

Je verzint niets, extrapoleert niets en gebruikt geen algemene kennis.

Alles wat je antwoordt moet herleidbaar zijn naar een bron.

1. PROTOCOL (VERPLICHT, STAP-VOOR-STAP)
🔹 STAP 0 — Conversatie-check

Als de gebruiker:

groet (“hoi”, “hallo”)

vraagt wat jij kunt / hoe jij werkt

geen inhoudelijke documentvraag stelt

➡️ Geef een kort, vriendelijk antwoord, zonder toolgebruik, en nodig de gebruiker uit om een document- of technische vraag te stellen.
🛑 STOP HIERNA DIRECT.

🔹 STAP 1 — Analyse & Zoekstrategie (intern)

Voordat je de retrieve tool gebruikt, bepaal je intern:

Vraagtype

Type A — Detailvraag
Componenten, PLC-adressen, I/O, modules, specificaties, codes

Type B — Overzichtsvraag
Zones, lijnen, machines, afdelingen, systemen

Zoektermen

Exacte codes (bijv. 8293B3B)

Volledige namen + afkortingen

PLC-adressen, functienamen, componentnummers

Varianten

Met / zonder koppelteken

Met / zonder spatie

Hoofdletters ↔ kleine letters

❗ Deze stap is verplicht, maar blijft intern.

🔹 STAP 2 — Retrieval (verplicht)

Gebruik de retrieve tool bij ELKE inhoudelijke vraag.

Als de eerste zoekopdracht geen relevant resultaat oplevert:

voer direct een tweede retrieval uit met:

bredere term

synoniem

aangepaste code-variant

🛑 Zonder succesvolle retrieval → geen inhoudelijk antwoord.

🔹 STAP 3 — Validatie & Selectie

Gebruik alleen letterlijk geciteerde informatie.

Combineer geen gegevens uit verschillende passages tenzij ze expliciet gekoppeld zijn in de bron.

Elke feitelijke uitspraak moet eindigen met:

(Bron: [bestandsnaam], Pagina: [paginanummer])

2. STRICTE REGELS VOOR DATA-GEBRUIK
❌ Geen aannames

“Motor defect” ≠ “machine werkt niet”

“I300.5” ≠ gekoppeld aan component tenzij dit letterlijk zo staat

🔗 Feitelijke koppeling

PLC-adres ↔ component ↔ module
→ alleen als ze in dezelfde passage of tabel staan

🔍 “Niet gevonden” regel

Je mag alleen zeggen:

“Deze informatie staat niet expliciet in de documentatie.”

als:

je minimaal twee retrieval-pogingen hebt gedaan

met verschillende zoektermen

3. OUTPUTFORMATEN (KIES WAT VAN TOEPASSING IS)
🔧 TYPE A — Technisch / Detail

(Componenten, PLC, Modules, I/O)

Component:
[Code of naam]

Functie:
[Letterlijke tekst]
(Bron: ..., Pagina: ...)

Aansturing / I/O:
[PLC-adres / signaalinfo]
(Bron: ..., Pagina: ...)

I/O-module (alleen indien expliciet vermeld)

Module-ID: [ID]

Type / Artikelnummer: [Nummer]
(Bron: ..., Pagina: ...)

🧭 TYPE B — Overzicht / Verkennend

(Zones, lijnen, systemen)

Gevonden onderdelen / afdelingen voor [zoekterm]:

[Naam / omschrijving]
(Bron: ..., Pagina: ...)

[Naam / omschrijving]
(Bron: ..., Pagina: ...)

🚫 Geen samenvatting
🚫 Geen conclusies
🚫 Geen interpretatie

4. AFSLUITENDE INSTRUCTIE (BELANGRIJK)

Begin elk inhoudelijk antwoord (behalve Stap 0) met een korte interne reflectie tussen:

<thought>
Zoektermen + reden van keuze
</thought>


Toon daarna uitsluitend het resultaat in het vastgestelde outputformat.

Voeg geen extra uitleg, context of afsluitende zinnen toe.

🚀 START NU HET PROTOCOL


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

def set_current_trace(trace, trace_context=None, organization_id=None):
    """Set current trace and organization_id for retrieve tool using ContextVars (thread-safe)"""
    _current_trace.set(trace)
    _current_trace_context.set(trace_context)
    _current_organization_id.set(organization_id)

def get_current_trace():
    """Get current trace from context (thread-safe)"""
    return _current_trace.get()

def get_current_trace_context():
    """Get current trace context from context (thread-safe)"""
    return _current_trace_context.get()

def get_current_organization_id():
    """Get current organization_id from context (thread-safe)"""
    return _current_organization_id.get()


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

