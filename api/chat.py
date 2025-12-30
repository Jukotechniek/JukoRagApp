# import basics
import os
import re
from contextvars import ContextVar
from urllib.parse import urlparse, unquote
from dotenv import load_dotenv

# import langchain
from langchain.agents import AgentExecutor
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.chat_models import init_chat_model
from langchain_core.messages import SystemMessage, AIMessage, HumanMessage
from langchain.agents import create_tool_calling_agent
from langchain import hub
from langchain_core.prompts import PromptTemplate
from langchain_community.vectorstores import SupabaseVectorStore
from langchain_openai import OpenAIEmbeddings
from langchain_core.tools import tool
from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.outputs import LLMResult
from langchain_community.document_loaders import PyPDFLoader, TextLoader
from langchain_community.document_loaders import CSVLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document

# For DOCX files
try:
    from docx import Document as DocxDocument
    DOCX_AVAILABLE = True
except ImportError:
    DOCX_AVAILABLE = False
    print("Warning: python-docx not available. DOCX files will not be supported.")

# For PDF coordinate-based extraction (footer info)
try:
    import fitz  # PyMuPDF
    PYMUPDF_AVAILABLE = True
except ImportError:
    PYMUPDF_AVAILABLE = False
    print("Warning: PyMuPDF (fitz) not available. Footer extraction will be limited.")

# import supabase db
from supabase.client import Client, create_client

# import FastAPI for API endpoint
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import uvicorn
import time
import uuid

# import Langfuse for tracking
from langfuse import Langfuse
from langfuse.types import TraceContext

# load environment variables from .env file in api folder
load_dotenv()  

# initiating Langfuse
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

# initiating supabase
supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SERVICE_KEY")
supabase: Client = create_client(supabase_url, supabase_key)

# initiating embeddings model
embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

# initiating vector store
vector_store = SupabaseVectorStore(
    embedding=embeddings,
    client=supabase,
    table_name="document_sections",
    query_name="match_document_sections",
)
 
# initiating llm
llm = ChatOpenAI(model="gpt-4o", temperature=0)

# Advanced prompt with prompt hacking techniques
# Using custom prompt instead of hub prompt for better control
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

# Create advanced prompt with multiple prompt hacking techniques:
# 1. Role-based prompting (expert persona)
# 2. Chain of Thought reasoning
# 3. Few-shot examples
# 4. Constraints and guardrails
# 5. Output formatting
# 6. Context management
# 7. Error handling
# 8. Step-by-step instructions
# 9. Negative prompting
# 10. Meta-instructions
# 11. Self-verification
# 12. Structured thinking

SYSTEM_PROMPT = """Je bent een expert technische documentatie assistent voor industriële machines en bedrijfsprocessen. Je naam is TechRAG Assistant.

## 🎯 JOUW KERNFUNCTIE
Je helpt gebruikers met vragen over technische documentatie, facturen, schema's, handleidingen, en bedrijfsprocessen door:
1. Intelligente document retrieval via de retrieve tool
2. Accurate informatie extractie uit documenten
3. Duidelijke, gestructureerde antwoorden in het Nederlands

## 🧠 DENKPROCES (Chain of Thought)
Voor ELKE vraag volg je dit denkproces:

**STAP 1: ANALYSE**
- Wat vraagt de gebruiker precies?
- Welke type informatie is nodig? (factuur, schema, handleiding, technische specificatie)
- Zijn er specifieke nummers/identifiers? (factuurnummers zoals F2025-60, machinenummers zoals VM04)

**STAP 2: RETRIEVAL STRATEGIE**
- Moet ik de retrieve tool gebruiken? (JA voor alle vragen over documenten)
- Welke zoektermen zijn het meest relevant?
- Zijn er meerdere searches nodig voor complexe vragen?

**STAP 3: INFORMATIE SYNTHESE**
- Combineer informatie uit meerdere bronnen indien nodig
- Identificeer conflicterende informatie
- Prioriteer de meest relevante informatie

**STAP 4: ANTWOORD CONSTRUCTIE**
- Begin met een direct antwoord op de vraag
- Gebruik gestructureerde formatting (bullet points, tabellen waar relevant)
- Verwijs naar bronnen impliciet (niet met [1], [2] etc, maar natuurlijk)
- Sluit af met actie-items indien relevant

## 📋 OUTPUT REGELS (Strict Constraints)

### ✅ WEL DOEN:
- Antwoord ALTIJD in het Nederlands
- Gebruik de retrieve tool voor vragen over documenten
- Wees specifiek en accuraat
- Citeer exacte cijfers, datums, bedragen uit documenten
- Gebruik gestructureerde formatting voor complexe informatie
- Beantwoord de vraag volledig voordat je extra context geeft
- Wees professioneel maar vriendelijk

### ❌ NIET DOEN:
- Verzin geen informatie die niet in de documenten staat
- Geef geen algemene adviezen zonder document context
- Gebruik geen markdown links [text](url) - gewoon tekst
- Maak geen aannames over technische specificaties
- Herhaal niet de hele vraag in je antwoord
- Gebruik geen emoji's behalve waar functioneel nuttig

## 🔍 RETRIEVE TOOL GEBRUIK

**WANNEER te gebruiken:**
- ✅ Vragen over facturen, schema's, handleidingen
- ✅ Zoeken naar specifieke informatie in documenten
- ✅ Technische specificaties opvragen
- ✅ Machine informatie opzoeken

**HOE te gebruiken:**
- Gebruik specifieke zoektermen (bijv. "F2025-60" voor factuur, "VM04" voor machine)
- Voor complexe vragen: gebruik meerdere searches met verschillende termen
- Combineer resultaten intelligent

**VOORBEELD SEARCHES:**
- "factuur 2025-60" → vindt specifieke factuur
- "VM04 schema" → vindt schema voor machine VM04
- "hydraulische slang" → vindt technische info over onderdelen

## 📝 ANTWOORD FORMAT

**Voor facturen:**
```
Factuur [nummer] is een factuur van [van] gericht aan [aan].

Details:
- Factuurnummer: [nummer]
- Factuurdatum: [datum]
- Vervaldatum: [datum]

Bedrag:
- [item 1]: €[bedrag]
- [item 2]: €[bedrag]
- Subtotaal: €[bedrag]
- BTW (21%): €[bedrag]
- Totaal: €[bedrag]
```

**Voor technische vragen:**
```
[Direct antwoord op de vraag]

Technische details:
- [specificatie 1]: [waarde]
- [specificatie 2]: [waarde]

[Extra context indien relevant]
```

**Voor "niet gevonden" situaties:**
```
Ik heb geen specifieke informatie kunnen vinden over [onderwerp]. 

Mogelijke redenen:
- [reden 1]
- [reden 2]

Suggesties:
- Probeer een andere zoekterm
- Controleer of het document is geüpload
- Geef meer context over wat je zoekt
```

## 🎓 FEW-SHOT EXAMPLES

**Voorbeeld 1: Factuur vraag**
User: "Wat weet je over factuur 2025-60?"
Assistant denkproces:
1. ANALYSE: Gebruiker vraagt om specifieke factuur informatie
2. RETRIEVAL: Gebruik retrieve tool met "F2025-60" of "factuur 2025-60"
3. SYNTHESE: Extract factuur details uit retrieved content
4. CONSTRUCTIE: Format als factuur overzicht

**Voorbeeld 2: Technische vraag**
User: "Welke hydraulische slangen zijn er voor VM04?"
Assistant denkproces:
1. ANALYSE: Technische vraag over machine onderdelen
2. RETRIEVAL: Zoek eerst "VM04", dan "hydraulische slang VM04"
3. SYNTHESE: Combineer machine info met onderdelen lijst
4. CONSTRUCTIE: Lijst met onderdelen en specificaties

**Voorbeeld 3: Vage vraag**
User: "Wat staat er in dat document?"
Assistant denkproces:
1. ANALYSE: Vage verwijzing - check chat history voor context
2. RETRIEVAL: Gebruik meest recent genoemde document naam
3. SYNTHESE: Geef samenvatting van document inhoud
4. CONSTRUCTIE: Gestructureerde samenvatting

## ⚠️ ERROR HANDLING

Als retrieve tool geen resultaten geeft:
- Probeer alternatieve zoektermen
- Vraag gebruiker om meer context
- Geef suggesties voor betere zoektermen

Als informatie onduidelijk is:
- Geef aan wat je WEL gevonden hebt
- Specificeer wat er ONTBREEKT
- Vraag om verduidelijking

## 🔄 SELF-VERIFICATION

Voor elk antwoord, check:
- [ ] Is het antwoord compleet?
- [ ] Zijn alle cijfers/datums accuraat?
- [ ] Is de formatting duidelijk?
- [ ] Verwijs ik naar de juiste bronnen?
- [ ] Is het antwoord in het Nederlands?

## 🎯 META-INSTRUCTIONS

- Je werkt in een professionele bedrijfsomgeving
- Gebruikers verwachten accurate, actuele informatie
- Documenten kunnen facturen, schema's, handleidingen, offertes bevatten
- Altijd prioriteit geven aan exacte informatie uit documenten boven algemene kennis
- Bij twijfel: gebruik retrieve tool opnieuw met andere termen

Begin nu met het beantwoorden van vragen volgens dit protocol."""

# Create prompt template compatible with tool calling agent
# The agent will inject tool information automatically
prompt = ChatPromptTemplate.from_messages([
    ("system", SYSTEM_PROMPT),
    MessagesPlaceholder(variable_name="chat_history"),
    ("human", "{input}"),
    MessagesPlaceholder(variable_name="agent_scratchpad"),
])


# Internal retrieve function with Langfuse tracking
def _retrieve_internal(query: str, organization_id: str = None, trace=None, trace_context=None):
    """Internal retrieve function with Langfuse tracking and organization_id filtering"""
    import re
    from langchain_core.documents import Document
    
    if not organization_id:
        raise ValueError("organization_id is required for document retrieval")
    
    retrieve_span = None
    if trace and langfuse_client and trace_context:
        retrieve_span = langfuse_client.start_span(
            name="retrieve",
            trace_context=trace_context,
            metadata={
                "input": {"query": query, "organization_id": organization_id},
            }
        )
    
    start_time = time.time()
    
    try:
        # Semantic search span
        semantic_span = None
        if retrieve_span and langfuse_client and trace_context:
            semantic_span = langfuse_client.start_span(
                name="semantic_search",
                trace_context=trace_context,
                metadata={"query": query, "k": 5, "organization_id": organization_id}
            )
        
        # Track embedding generation
        embedding_gen = None
        if semantic_span and langfuse_client and trace_context:
            embedding_gen = langfuse_client.start_observation(
                name="create_embedding",
                as_type="generation",
                model="text-embedding-3-small",
                input=query,
                trace_context=trace_context,
                metadata={"model": "text-embedding-3-small"}
            )
        
        embedding_start = time.time()
        semantic_start = time.time()
        
        # Generate embedding for the query
        query_embedding = embeddings.embed_query(query)
        
        # Try to use RRF (Reciprocal Rank Fusion) RPC function if available
        # This combines semantic search (pgvector) with full-text search (tsvector) at database level
        # Falls back to regular semantic search if RRF function doesn't exist
        try:
            # Attempt RRF hybrid search (more efficient, combines semantic + keyword at DB level)
            rrf_matches = supabase.rpc(
                "match_document_sections_rrf",
                {
                    "p_organization_id": organization_id,
                    "p_query_embedding": query_embedding,
                    "p_query_text": query,  # For full-text search
                    "p_match_count": 10,
                    "p_semantic_threshold": 0.30,
                    "p_rrf_k": 60  # RRF constant (typical value)
                }
            ).execute()
            
            if rrf_matches.data:
                semantic_matches = rrf_matches
                print("Using RRF hybrid search (semantic + full-text at DB level)")
            else:
                raise Exception("RRF function returned no data, falling back to semantic search")
        except Exception as rrf_error:
            # Fallback to regular semantic search if RRF is not available
            print(f"RRF search not available ({rrf_error}), using semantic search only")
            semantic_matches = supabase.rpc(
                "match_document_sections",
                {
                    "p_organization_id": organization_id,
                    "p_query_embedding": query_embedding,
                    "p_match_count": 10,
                    "p_threshold": 0.30
                }
            ).execute()
        
        semantic_docs = []
        if semantic_matches.data:
            # Get document metadata for the matched sections
            doc_ids = list(set([m.get("document_id") for m in semantic_matches.data if m.get("document_id")]))
            doc_metadata_map = {}
            
            if doc_ids:
                # Documents table doesn't have a metadata column, only get id and name
                # Extra security: also filter by organization_id to ensure we only get documents from the correct organization
                doc_result = supabase.table("documents").select("id, name").in_("id", doc_ids).eq("organization_id", organization_id).execute()
                if doc_result.data:
                    for doc in doc_result.data:
                        doc_metadata_map[doc["id"]] = {
                            "name": doc.get("name", "Unknown")
                        }
            
            # Convert RPC results to Document objects
            for match in semantic_matches.data:
                doc_meta = doc_metadata_map.get(match.get("document_id"), {})
                semantic_docs.append(Document(
                    page_content=match.get("content", ""),
                    metadata={
                        "document_id": match.get("document_id"),
                        "source": doc_meta.get("name", "Unknown"),
                        **({} if not match.get("metadata") else match["metadata"] if isinstance(match.get("metadata"), dict) else {}),
                        "similarity": match.get("similarity", 0.0)
                    }
                ))
        
        # Sort by similarity and limit to top 5
        semantic_docs = sorted(semantic_docs, key=lambda x: x.metadata.get("similarity", 0.0), reverse=True)[:5]
        
        semantic_duration = (time.time() - semantic_start) * 1000
        embedding_duration = (time.time() - embedding_start) * 1000
        
        if embedding_gen:
            # Estimate token usage (rough: ~1 token per 4 chars)
            estimated_tokens = len(query) // 4
            embedding_gen.update(
                output={"embedding_created": True},
                usage={
                    "prompt_tokens": estimated_tokens,
                    "total_tokens": estimated_tokens
                },
                metadata={"duration_ms": embedding_duration}
            )
            embedding_gen.end()
        
        if semantic_span:
            semantic_span.update(
                output={"results_count": len(semantic_docs)},
                metadata={"duration_ms": semantic_duration}
            )
            semantic_span.end()
        
        # Keyword search span
        invoice_pattern = re.search(r'[Ff]\d{4}-\d+', query)
        keyword_docs = []
        
        if invoice_pattern:
            keyword_span = None
            if retrieve_span and langfuse_client and trace_context:
                keyword_span = langfuse_client.start_span(
                    name="keyword_search",
                    trace_context=trace_context,
                    metadata={"invoice_pattern": invoice_pattern.group(0), "organization_id": organization_id}
                )
            
            keyword_start = time.time()
            invoice_num = invoice_pattern.group(0)
            try:
                # Filter by organization_id: first get document IDs for this organization
                org_docs_result = supabase.table("documents").select("id").eq("organization_id", organization_id).execute()
                org_doc_ids = [doc["id"] for doc in org_docs_result.data] if org_docs_result.data else []
                
                if org_doc_ids:
                    # Then search document_sections for those document IDs
                    result = supabase.table("document_sections").select(
                        "content, metadata"
                    ).ilike("content", f"%{invoice_num}%").in_("document_id", org_doc_ids).limit(5).execute()
                    
                    if result.data:
                        for row in result.data:
                            keyword_docs.append(Document(
                                page_content=row.get("content", ""),
                                metadata=row.get("metadata", {}) if isinstance(row.get("metadata"), dict) else {}
                            ))
            except Exception as e:
                if keyword_span:
                    keyword_span.update(
                        output={"error": str(e)},
                        level="ERROR"
                    )
                    keyword_span.end()
                pass
            
            keyword_duration = (time.time() - keyword_start) * 1000
            if keyword_span:
                keyword_span.update(
                    output={"results_count": len(keyword_docs)},
                    metadata={"duration_ms": keyword_duration}
                )
                keyword_span.end()
        
        # Combine and deduplicate
        combine_span = None
        if retrieve_span and langfuse_client and trace_context:
            combine_span = langfuse_client.start_span(
                name="combine_results",
                trace_context=trace_context
            )
        
        all_docs = []
        seen_content = set()
        
        for doc in keyword_docs:
            content_key = doc.page_content[:200]
            if content_key not in seen_content:
                all_docs.append(doc)
                seen_content.add(content_key)
        
        for doc in semantic_docs:
            content_key = doc.page_content[:200]
            if content_key not in seen_content:
                all_docs.append(doc)
                seen_content.add(content_key)
        
        retrieved_docs = all_docs[:5]
        
        if combine_span:
            combine_span.update(
                output={
                    "total_results": len(retrieved_docs),
                    "semantic_results": len(semantic_docs),
                    "keyword_results": len(keyword_docs)
                }
            )
            combine_span.end()
        
        serialized = "\n\n".join(
            (f"Source: {doc.metadata}\n" f"Content: {doc.page_content}")
            for doc in retrieved_docs
        )
        
        duration = (time.time() - start_time) * 1000
        
        if retrieve_span:
            retrieve_span.update(
                output={
                    "retrieved_text_length": len(serialized),
                    "documents_count": len(retrieved_docs)
                },
                metadata={"duration_ms": duration}
            )
            retrieve_span.end()
        
        return serialized, retrieved_docs
        
    except Exception as e:
        duration = (time.time() - start_time) * 1000
        if retrieve_span:
            retrieve_span.update(
                output={"error": str(e)},
                level="ERROR",
                metadata={"duration_ms": duration}
            )
            retrieve_span.end()
        raise

# Context variables for thread-safe passing of trace and organization_id
# Using ContextVar instead of globals to prevent race conditions in async FastAPI
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

# Creating the retriever tool (wrapper for Langfuse tracking)
@tool(response_format="content_and_artifact")
def retrieve(query: str):
    """Retrieve information related to a query. Uses hybrid search combining semantic similarity and keyword matching for better results."""
    # Get from context (thread-safe)
    organization_id = get_current_organization_id()
    trace = get_current_trace()
    trace_context = get_current_trace_context()
    
    if not organization_id:
        raise ValueError("organization_id is required but not set. This should be set by the chat endpoint.")
    return _retrieve_internal(query, organization_id, trace, trace_context)

# combining all tools
tools = [retrieve]

# initiating the agent
agent = create_tool_calling_agent(llm, tools, prompt)

# LangChain callback handler for Langfuse tracking
class LangfuseCallbackHandler(BaseCallbackHandler):
    def __init__(self, trace=None, trace_context=None):
        self.trace = trace
        self.trace_context = trace_context
        self.current_generation = None
        self.start_time = None
    
    def on_llm_start(self, serialized, prompts, **kwargs):
        if self.trace and langfuse_client and self.trace_context:
            self.start_time = time.time()
            self.current_generation = langfuse_client.start_observation(
                name="llm_call",
                as_type="generation",
                model=serialized.get("name", "gpt-4o"),
                input=prompts[0] if prompts else "",
                trace_context=self.trace_context,
                metadata={
                    "model": serialized.get("name", "gpt-4o"),
                    "temperature": kwargs.get("temperature", 0),
                }
            )
    
    def on_llm_end(self, response: LLMResult, **kwargs):
        if self.current_generation and self.trace:
            duration = (time.time() - self.start_time) * 1000 if self.start_time else 0
            output_text = response.generations[0][0].text if response.generations else ""
            
            usage = None
            if hasattr(response, 'llm_output') and response.llm_output:
                usage = response.llm_output.get('token_usage')
            
            self.current_generation.update(
                output=output_text,
                usage=usage,
                metadata={"duration_ms": duration}
            )
            self.current_generation.end()
            self.current_generation = None
    
    def on_llm_error(self, error, **kwargs):
        if self.current_generation and self.trace:
            self.current_generation.update(
                output={"error": str(error)},
                level="ERROR"
            )
            self.current_generation.end()
            self.current_generation = None

# create the agent executor
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

# FastAPI app
app = FastAPI(title="DocuBot Assistant API")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request/Response models
class ChatRequest(BaseModel):
    question: str
    organizationId: str
    userId: Optional[str] = None
    conversationId: Optional[str] = None

class ChatResponse(BaseModel):
    success: bool
    response: str
    requestId: Optional[str] = None

class ProcessDocumentRequest(BaseModel):
    documentId: str
    organizationId: str

class ProcessDocumentResponse(BaseModel):
    success: bool
    message: str
    chunksProcessed: Optional[int] = None
    error: Optional[str] = None

# Chat history storage (in-memory, you might want to use database)
chat_histories = {}

def load_history(organization_id: str, user_id: str, conversation_id: Optional[str] = None, limit: int = 8, trace=None, trace_context=None) -> List:
    """Load chat history from database with Langfuse tracking"""
    history_span = None
    if trace and langfuse_client and trace_context:
        history_span = langfuse_client.start_span(
            name="load_history",
            trace_context=trace_context,
            metadata={
                "input": {
                    "organization_id": organization_id,
                    "user_id": user_id,
                    "conversation_id": conversation_id,
                    "limit": limit
                }
            }
        )
    
    start_time = time.time()
    
    try:
        query = supabase.table("chat_messages").select("role, content, created_at").eq("organization_id", organization_id).order("created_at", desc=True).limit(limit)
        
        if conversation_id:
            query = query.eq("conversation_id", conversation_id)
        else:
            query = query.eq("user_id", user_id)
        
        result = query.execute()
        
        messages = []
        if result.data:
            for msg in reversed(result.data):
                if msg.get("role") in ["user", "assistant"]:
                    messages.append(
                        HumanMessage(content=msg["content"]) if msg["role"] == "user"
                        else AIMessage(content=msg["content"])
                    )
        
        duration = (time.time() - start_time) * 1000
        
        if history_span:
            history_span.update(
                output={
                    "history_length": len(messages),
                    "messages": [{"role": "user" if isinstance(m, HumanMessage) else "assistant", "content_length": len(m.content)} for m in messages]
                },
                metadata={"duration_ms": duration}
            )
            history_span.end()
        
        return messages
    except Exception as e:
        duration = (time.time() - start_time) * 1000
        if history_span:
            history_span.update(
                output={"error": str(e)},
                level="ERROR",
                metadata={"duration_ms": duration}
            )
            history_span.end()
        print(f"Error loading history: {e}")
        return []

@app.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(
    request: ChatRequest,
    authorization: Optional[str] = Header(None)
):
    """Chat endpoint that uses the agent executor with full Langfuse tracking"""
    import uuid
    
    request_id = str(uuid.uuid4())[:8]
    start_time = time.time()
    trace = None
    
    try:
        # Create Langfuse trace
        trace = None
        trace_context = None
        if langfuse_client:
            # Create trace ID
            trace_id = langfuse_client.create_trace_id()
            # Create trace context
            trace_context = TraceContext(trace_id=trace_id)
            # Start trace using span (trace is a top-level span)
            trace = langfuse_client.start_span(
                name="chat_request",
                trace_context=trace_context,
                metadata={
                    "request_id": request_id,
                    "organization_id": request.organizationId,
                    "conversation_id": request.conversationId,
                    "question": request.question,
                    "question_length": len(request.question),
                    "user_id": request.userId,
                }
            )
        
        # Load chat history with tracking
        history_span = None
        if trace and langfuse_client and trace_context:
            history_span = langfuse_client.start_span(
                name="load_history",
                trace_context=trace_context
            )
        
        history = load_history(
            request.organizationId,
            request.userId or "default",
            request.conversationId,
            limit=8,
            trace=trace,
            trace_context=trace_context
        )
        
        if history_span:
            history_span.end()
        
        # Agent execution span
        agent_span = None
        if trace and langfuse_client and trace_context:
            agent_span = langfuse_client.start_span(
                name="agent_execution",
                trace_context=trace_context,
                metadata={
                    "input": {
                        "question": request.question,
                        "history_length": len(history)
                    }
                }
            )
        
        agent_start = time.time()
        
        # Set trace and organization_id for retrieve tool
        if trace:
            set_current_trace(trace, trace_context, request.organizationId)
        else:
            # Even without trace, we need to set organization_id
            set_current_trace(None, None, request.organizationId)
        
        # Create callback handler for LLM tracking
        callbacks = []
        if trace:
            callbacks.append(LangfuseCallbackHandler(trace=trace, trace_context=trace_context))
        
        # Invoke the agent executor with callbacks
        result = agent_executor.invoke({
            "input": request.question,
            "chat_history": history
        }, config={"callbacks": callbacks} if callbacks else {})
        
        agent_duration = (time.time() - agent_start) * 1000
        ai_message = result["output"]
        
        # Track agent execution
        if agent_span:
            agent_span.update(
                output={
                    "output": ai_message,
                    "output_length": len(ai_message),
                },
                metadata={"duration_ms": agent_duration}
            )
            agent_span.end()
        
        # Track LLM generations via LangChain callbacks
        # Note: We'll add a callback handler for this
        if trace and langfuse_client and trace_context and "intermediate_steps" in result:
            for i, (action, observation) in enumerate(result.get("intermediate_steps", [])):
                step_span = langfuse_client.start_span(
                    name=f"agent_step_{i+1}",
                    trace_context=trace_context,
                    metadata={
                        "action": str(action),
                        "tool": action.tool if hasattr(action, 'tool') else None
                    }
                )
                step_span.update(
                    output={"observation": str(observation)[:500]}  # Limit length
                )
                step_span.end()
        
        total_duration = (time.time() - start_time) * 1000
        
        # End trace
        if trace:
            trace.update(
                output={
                    "success": True,
                    "response": ai_message,
                    "response_length": len(ai_message),
                },
                metadata={"total_duration_ms": total_duration}
            )
            trace.end()
            # Flush to ensure all data is sent
            if langfuse_client:
                langfuse_client.flush()
        
        # Reset trace and organization_id for next request
        set_current_trace(None, None, None)
        
        return ChatResponse(
            success=True,
            response=ai_message,
            requestId=request_id
        )
    
    except Exception as e:
        total_duration = (time.time() - start_time) * 1000
        error_msg = str(e)
        print(f"Error in chat endpoint: {e}")
        
        if trace:
            trace.update(
                output={
                    "success": False,
                    "error": error_msg
                },
                level="ERROR",
                metadata={"total_duration_ms": total_duration}
            )
            trace.end()
            # Flush to ensure error is tracked
            if langfuse_client:
                langfuse_client.flush()
        
        # Reset trace and organization_id for next request
        set_current_trace(None, None, None)
        
        raise HTTPException(status_code=500, detail=error_msg)


def extract_text_from_file(file_path: str, file_type: str, file_name: str) -> str:
    """Extract text from various file types (legacy function, use extract_documents_from_file for PDFs with page numbers)"""
    try:
        if file_type == 'application/pdf' or file_name.lower().endswith('.pdf'):
            loader = PyPDFLoader(file_path)
            documents = loader.load()
            return "\n\n".join([doc.page_content for doc in documents])
        
        elif file_type == 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' or file_name.lower().endswith('.docx'):
            if not DOCX_AVAILABLE:
                raise Exception("python-docx library not installed. Install it with: pip install python-docx")
            
            doc = DocxDocument(file_path)
            paragraphs = []
            for para in doc.paragraphs:
                if para.text.strip():
                    paragraphs.append(para.text)
            return "\n\n".join(paragraphs)
        
        elif file_type == 'text/plain' or file_name.lower().endswith('.txt'):
            loader = TextLoader(file_path, encoding='utf-8')
            documents = loader.load()
            return "\n\n".join([doc.page_content for doc in documents])
        
        elif file_type == 'text/csv' or file_name.lower().endswith('.csv'):
            loader = CSVLoader(file_path, encoding='utf-8')
            documents = loader.load()
            return "\n\n".join([doc.page_content for doc in documents])
        
        else:
            # Try to read as text
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                return f.read()
    
    except Exception as e:
        raise Exception(f"Failed to extract text from {file_name}: {str(e)}")

def _normalize_spaced_text(text: str) -> str:
    """Normalize text by removing spaces between letters/digits and reducing whitespace.
    
    Handles cases where every character is separated by spaces (e.g., "W e s t f o r t").
    Uses iterative approach to remove all spaces between alphanumeric characters.
    
    Examples:
        "W e s t f o r t" -> "Westfort"
        "2 R S P 0 2" -> "2RSP02"
        "P a g e : 6 7" -> "Page:67"
        "We st fo rt Vl ee sp ro du ct en" -> "Westfort Vleesproducten"
    """
    if not text:
        return ""
    
    # Replace newlines with spaces
    text = text.replace('\n', ' ').replace('\r', ' ')
    
    # Strategy: Remove all spaces between alphanumeric characters iteratively
    # This handles cases like "W e s t f o r t" where every char is spaced
    prev_text = ""
    iterations = 0
    max_iterations = 20  # Increased for very spaced text
    
    while text != prev_text and iterations < max_iterations:
        prev_text = text
        
        # Remove spaces between any alphanumeric characters (letters or digits)
        # This is more aggressive and handles all cases in one pass per iteration
        # Pattern: alphanumeric, then one or more spaces, then alphanumeric
        text = re.sub(r'([A-Za-z0-9])\s+([A-Za-z0-9])', r'\1\2', text)
        
        iterations += 1
    
    # Now handle special cases where we want to preserve spaces:
    # 1. After punctuation (.,:;!?) - add space back if needed
    # 2. Between words that should be separate (e.g., "2 RSP" -> "2 RSP")
    # But we need to be careful: "2RSP02" should stay as one word
    
    # Add space after punctuation if followed by alphanumeric (if not already present)
    text = re.sub(r'([.,:;!?])([A-Za-z0-9])', r'\1 \2', text)
    
    # Normalize all remaining whitespace (multiple spaces -> single space)
    text = re.sub(r'\s+', ' ', text)
    
    return text.strip()

def extract_footer_info_from_pdf(pdf_path: str, page_num: int) -> dict:
    """Extract footer information from PDF page using area-based extraction with get_text("dict").
    
    Uses structured text extraction with bounding boxes for better accuracy.
    Works for any PDF schema type without schema-specific patterns.
    """
    footer_info = {
        "page_number_footer": None,
        "project_description": None
    }
    
    if not PYMUPDF_AVAILABLE:
        return footer_info
    
    try:
        doc = fitz.open(pdf_path)
        if page_num < len(doc):
            page = doc[page_num]
            
            # Get page dimensions
            page_rect = page.rect
            page_width = page_rect.width
            page_height = page_rect.height
            
            # ROI = bottom-right area (rechtsonder) for page number
            # Use same fractions as working code: 85% width, 90% height
            X0_FRAC = 0.85  # vanaf 85% breedte
            Y0_FRAC = 0.90  # vanaf 90% hoogte (laatste regels)
            
            # Use get_text("dict") for better structure (like working code)
            text_dict = page.get_text("dict")
            
            # Extract page number from right bottom region
            page_number_candidates = []
            
            # Search for lines in the bottom-right area
            for block in text_dict["blocks"]:
                if "lines" in block:
                    for line in block["lines"]:
                        line_bbox = line["bbox"]  # [x0, y0, x1, y1]
                        # Check if line is in ROI (right bottom area)
                        if line_bbox[3] >= page_height * Y0_FRAC and line_bbox[0] >= page_width * X0_FRAC:
                            # Construct text from line (combine all spans)
                            line_text = ""
                            for span in line["spans"]:
                                line_text += span["text"]
                            
                            # Normalize text (remove spaces between characters)
                            normalized = _normalize_spaced_text(line_text)
                            # Also remove all spaces for number extraction
                            normalized_no_spaces = normalized.replace(' ', '')
                            
                            # Extract all numbers from the normalized text
                            current_number = ""
                            for char in normalized_no_spaces:
                                if char.isdigit():
                                    current_number += char
                                else:
                                    if current_number:
                                        try:
                                            num = int(current_number)
                                            if num >= 1:  # Valid page number
                                                # Store: (number, x_right, y_bottom) for sorting
                                                page_number_candidates.append((num, line_bbox[2], line_bbox[3]))
                                        except ValueError:
                                            pass
                                        current_number = ""
                            # Don't forget the last number if text ends with digits
                            if current_number:
                                try:
                                    num = int(current_number)
                                    if num >= 1:
                                        page_number_candidates.append((num, line_bbox[2], line_bbox[3]))
                                except ValueError:
                                    pass
            
            # Select the best page number candidate
            if page_number_candidates:
                # Sort by y-position (bottom first), then by x-position (right first)
                # This gives us the most bottom-right number
                page_number_candidates.sort(key=lambda x: (-x[2], -x[1]))
                
                # Take the most bottom-right number
                # Prefer larger numbers (>= 100) if available, otherwise use the most bottom-right
                large_candidates = [(n, x, y) for n, x, y in page_number_candidates if n >= 100]
                if large_candidates:
                    # Sort large candidates the same way
                    large_candidates.sort(key=lambda x: (-x[2], -x[1]))
                    footer_info["page_number_footer"] = large_candidates[0][0]
                else:
                    # Use the most bottom-right number even if small
                    footer_info["page_number_footer"] = page_number_candidates[0][0]
            
            # Extract project description and text above from bottom area (bottom 15%)
            # Use get_text("dict") for structured extraction like page number
            all_lines = []
            for block in text_dict["blocks"]:
                if "lines" in block:
                    for line in block["lines"]:
                        line_bbox = line["bbox"]
                        # Collect lines in bottom 15% of page
                        if line_bbox[3] >= page_height * 0.85:
                            line_text = ""
                            for span in line["spans"]:
                                line_text += span["text"]
                            if line_text.strip():
                                normalized_text = _normalize_spaced_text(line_text)
                                all_lines.append((normalized_text, line_bbox[0], line_bbox[1], line_bbox[2], line_bbox[3]))
            
            if all_lines:
                # Sort by y-position (top to bottom)
                all_lines.sort(key=lambda x: x[2])  # Sort on y0 (top)
                
                project_description = None
                text_above = None
                project_desc_y = None
                
                # Find project description: look for lines containing "project" and "description" (case insensitive, no spaces)
                for text, x0, y0, x1, y1 in all_lines:
                    # Normalize text for comparison (remove all spaces, lowercase)
                    normalized = text.lower().replace(' ', '').replace('_', '')
                    # Check if line contains both "project" and "description" (generic, no specific pattern)
                    if 'project' in normalized and 'description' in normalized:
                        project_desc_y = y0
                        # Find the value on approximately the same y-height (within 10 pixels)
                        for other_text, ox0, oy0, ox1, oy1 in all_lines:
                            if abs(oy0 - y0) < 10:
                                other_normalized = other_text.lower().replace(' ', '').replace('_', '')
                                # Skip the label itself and other metadata labels
                                if 'project' not in other_normalized or 'description' not in other_normalized:
                                    if 'production' not in other_normalized and 'number' not in other_normalized:
                                        # The value is usually longer text that isn't a label
                                        if len(other_text) > len("Project Description"):
                                            project_description = _normalize_spaced_text(other_text).strip()
                                            break
                        break
                
                # Find text above project description (usually descriptive text like "Main Power", "Front page")
                if project_desc_y:
                    candidates = []
                    for text, x0, y0, x1, y1 in all_lines:
                        # Text above is usually at least 15 pixels above project description
                        # and in a reasonable y-range (bottom 15% but above project description)
                        if y1 < project_desc_y - 15 and page_height * 0.85 <= y0 <= project_desc_y - 15:
                            normalized = _normalize_spaced_text(text).strip()
                            
                            # Skip if it's just numbers or very short
                            if len(normalized) < 3:
                                continue
                            
                            # Skip if it's only digits
                            if normalized.replace(' ', '').replace('-', '').replace('/', '').isdigit():
                                continue
                            
                            # Skip common metadata labels (generic approach, no regex)
                            skip_labels = ['engineer', 'change', 'revision', 'order', 'production', 'project', 'start', 'print', 'date']
                            text_lower = normalized.lower()
                            if any(label in text_lower for label in skip_labels):
                                continue
                            
                            # Skip if it looks like an ID (contains mix of letters and numbers in pattern like "WESIJS32_2RSP02")
                            # Simple heuristic: if it has underscores or many numbers mixed with letters, it's likely an ID
                            has_underscore = '_' in normalized
                            digit_count = sum(1 for c in normalized if c.isdigit())
                            letter_count = sum(1 for c in normalized if c.isalpha())
                            # If it has underscore or many digits relative to letters, likely an ID
                            if has_underscore or (digit_count > 2 and digit_count > letter_count / 2):
                                continue
                            
                            # Reasonable length (not too short, not too long)
                            if 5 < len(normalized) < 50:
                                candidates.append((normalized, y0))
                    
                    # Take the text closest to the middle of the range (most likely to be descriptive text)
                    if candidates:
                        # Sort by y-position (closest to where descriptive text usually appears)
                        candidates.sort(key=lambda x: x[1])  # Sort by y0, take the one closest to project description
                        text_above = candidates[0][0]
                
                # Set project description if found
                if project_description and len(project_description) > 3:
                    footer_info["project_description"] = project_description
                
                # Store text above in metadata if needed (optional, can be added to metadata later)
                if text_above:
                    footer_info["text_above"] = text_above
            
            doc.close()
    
    except Exception as e:
        print(f"Warning: Could not extract footer info from page {page_num}: {e}")
        if page_num < 3:  # Debug first few pages
            import traceback
            traceback.print_exc()
    
    return footer_info

def extract_documents_from_file(file_path: str, file_type: str, file_name: str) -> List[Document]:
    """Extract documents from various file types, preserving page numbers and footer info for PDFs.
    
    For PDFs, uses PyMuPDF (fitz) as primary extractor to avoid spaced letters issue.
    """
    try:
        if file_type == 'application/pdf' or file_name.lower().endswith('.pdf'):
            if not PYMUPDF_AVAILABLE:
                raise Exception("PyMuPDF (fitz) is required for PDF extraction but not available. Install it with: pip install pymupdf")
            
            # Use PyMuPDF as primary extractor (not PyPDFLoader) to avoid spaced letters
            pdf = fitz.open(file_path)
            documents = []
            
            for page_idx in range(len(pdf)):
                page = pdf[page_idx]
                
                # Extract text from page
                page_text = page.get_text("text")
                
                # Normalize spaced text (e.g., "W e s t f o r t" -> "Westfort")
                normalized_text = _normalize_spaced_text(page_text)
                
                # Check if text is sparse (less than 40 characters)
                is_sparse_text = len(normalized_text) < 40
                
                # Extract footer information using PyMuPDF
                footer_info = extract_footer_info_from_pdf(file_path, page_idx)
                
                # Build metadata
                metadata = {
                    "source": file_name,
                    "page": page_idx,  # 0-based
                    "page_number": page_idx + 1,  # 1-based
                    "is_sparse_text": is_sparse_text
                }
                
                # Add footer info: page_number_footer (fallback to page_number if not found)
                if footer_info.get("page_number_footer"):
                    metadata["page_number_footer"] = footer_info["page_number_footer"]
                else:
                    metadata["page_number_footer"] = page_idx + 1  # Fallback to 1-based page number
                
                # Add project description if found
                if footer_info.get("project_description"):
                    metadata["project_description"] = footer_info["project_description"]
                
                # Create Document object with normalized text
                doc = Document(
                    page_content=normalized_text,
                    metadata=metadata
                )
                documents.append(doc)
            
            pdf.close()
            return documents
        
        elif file_type == 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' or file_name.lower().endswith('.docx'):
            if not DOCX_AVAILABLE:
                raise Exception("python-docx library not installed. Install it with: pip install python-docx")
            
            doc = DocxDocument(file_path)
            paragraphs = []
            for para in doc.paragraphs:
                if para.text.strip():
                    paragraphs.append(para.text)
            # Return as single document for DOCX (no page numbers)
            return [Document(
                page_content="\n\n".join(paragraphs),
                metadata={"source": file_name}
            )]
        
        elif file_type == 'text/plain' or file_name.lower().endswith('.txt'):
            loader = TextLoader(file_path, encoding='utf-8')
            documents = loader.load()
            # Update source metadata
            for doc in documents:
                doc.metadata["source"] = file_name
            return documents
        
        elif file_type == 'text/csv' or file_name.lower().endswith('.csv'):
            loader = CSVLoader(file_path, encoding='utf-8')
            documents = loader.load()
            # Update source metadata
            for doc in documents:
                doc.metadata["source"] = file_name
            return documents
        
        else:
            # Try to read as text
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            return [Document(
                page_content=content,
                metadata={"source": file_name}
            )]
    
    except Exception as e:
        raise Exception(f"Failed to extract documents from {file_name}: {str(e)}")


@app.post("/api/process-document", response_model=ProcessDocumentResponse)
async def process_document(
    request: ProcessDocumentRequest,
    authorization: Optional[str] = Header(None)
):
    """Process a document for RAG: extract text, chunk, and generate embeddings"""
    import tempfile
    import re
    
    start_time = time.time()
    
    try:
        # Get document info from database
        doc_result = supabase.table("documents").select("file_url, name, file_type").eq("id", request.documentId).single().execute()
        
        if not doc_result.data:
            raise HTTPException(status_code=404, detail="Document not found")
        
        doc = doc_result.data
        
        # Extract path from file_url
        file_url = doc.get("file_url")
        if not file_url:
            raise HTTPException(status_code=400, detail="Document has no file URL")
        
        # Extract storage path from URL using urllib.parse
        parsed_url = urlparse(file_url)
        # Use parsed.path and unquote to handle URL encoding properly
        # Extract path after /documents/ (query parameters are ignored)
        path_parts = parsed_url.path.split('/documents/')
        if len(path_parts) < 2:
            raise HTTPException(status_code=400, detail="Could not extract file path from URL")
        
        storage_path = unquote(path_parts[1])  # Unquote to handle %20, etc.
        
        # Download file from Supabase Storage to temporary location
        temp_dir = tempfile.mkdtemp()
        file_name = doc.get("name", "document")
        
        # Create safe filename (replace all non [A-Za-z0-9._-] with underscore)
        safe_name = re.sub(r'[^A-Za-z0-9._-]', '_', file_name)
        temp_file_path = os.path.join(temp_dir, safe_name)
        
        try:
            # Download file from Supabase Storage
            file_response = supabase.storage.from_("documents").download(storage_path)
            
            if not file_response:
                raise HTTPException(status_code=500, detail="Failed to download file: No response")
            
            # Supabase Python client returns bytes directly
            file_data = file_response
            
            # Save to temporary file
            with open(temp_file_path, 'wb') as f:
                f.write(file_data)
            
            # Extract documents from file (preserves page numbers for PDFs)
            file_type = doc.get("file_type", "")
            langchain_docs = extract_documents_from_file(temp_file_path, file_type, file_name)
            
            if not langchain_docs or all(not doc.page_content.strip() for doc in langchain_docs):
                raise HTTPException(status_code=400, detail="No text content extracted from document")
            
            # Page-based chunking: split each page separately to preserve page context
            # This is critical for technical schemas where mixing pages breaks connections
            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=1500,
                chunk_overlap=200
            )
            
            # Add document metadata to each document before splitting
            for doc_obj in langchain_docs:
                doc_obj.metadata["document_id"] = request.documentId
                doc_obj.metadata["file_type"] = file_type
            
            # IMPORTANT: Split each page separately to avoid cross-page chunks
            # This preserves the context of each page, which is critical for technical schemas
            chunks = []
            for doc_obj in langchain_docs:
                # Split this page's content into chunks
                page_chunks = text_splitter.split_documents([doc_obj])
                
                # Add footer info to each chunk's metadata (enrich metadata per page)
                for chunk in page_chunks:
                    # Ensure all metadata is preserved
                    if "document_id" not in chunk.metadata:
                        chunk.metadata["document_id"] = request.documentId
                    
                    # Add footer info to metadata if available (for PDFs)
                    # This enriches each chunk with page-specific footer information
                    if "page_number_footer" in doc_obj.metadata:
                        chunk.metadata["page_number_footer"] = doc_obj.metadata["page_number_footer"]
                    if "project_description" in doc_obj.metadata:
                        chunk.metadata["project_description"] = doc_obj.metadata["project_description"]
                    if "page_number" in doc_obj.metadata:
                        chunk.metadata["page_number"] = doc_obj.metadata["page_number"]
                
                chunks.extend(page_chunks)
            
            print(f"Created {len(chunks)} chunks from document {file_name}")
            
            # Generate embeddings in batches to avoid token limit
            print(f"Generating embeddings for {len(chunks)} chunks...")
            texts = [chunk.page_content for chunk in chunks]
            
            # Calculate batch size: OpenAI has 300k token limit per request
            # With ~1500 chars per chunk and ~4 chars per token, that's ~375 tokens per chunk
            # To be safe, use batches of 500 chunks (well under 300k tokens)
            batch_size = 500
            embeddings_list = []
            
            for i in range(0, len(texts), batch_size):
                batch_texts = texts[i:i + batch_size]
                batch_num = (i // batch_size) + 1
                total_batches = (len(texts) + batch_size - 1) // batch_size
                
                print(f"Generating embeddings for batch {batch_num}/{total_batches} ({len(batch_texts)} chunks)...")
                
                try:
                    batch_embeddings = embeddings.embed_documents(batch_texts)
                    embeddings_list.extend(batch_embeddings)
                except Exception as e:
                    error_msg = str(e)
                    print(f"Error generating embeddings for batch {batch_num}: {error_msg}")
                    raise HTTPException(
                        status_code=500,
                        detail=f"Failed to generate embeddings for batch {batch_num}: {error_msg}"
                    )
            
            print(f"Successfully generated {len(embeddings_list)} embeddings")
            
            # Delete existing document sections for this document
            delete_result = supabase.table("document_sections").delete().eq("document_id", request.documentId).execute()
            
            if hasattr(delete_result, 'error') and delete_result.error:
                print(f"Warning: Could not delete existing sections: {delete_result.error}")
            
            # Insert document sections with embeddings
            print(f"Inserting {len(chunks)} document sections into database...")
            sections_to_insert = []
            
            for i, (chunk, embedding) in enumerate(zip(chunks, embeddings_list)):
                sections_to_insert.append({
                    "document_id": request.documentId,
                    "content": chunk.page_content,
                    "metadata": chunk.metadata,
                    "embedding": embedding
                })
                
                # Insert in batches of 10 for better performance
                if len(sections_to_insert) >= 10 or i == len(chunks) - 1:
                    insert_result = supabase.table("document_sections").insert(sections_to_insert).execute()
                    
                    if hasattr(insert_result, 'error') and insert_result.error:
                        raise HTTPException(status_code=500, detail=f"Failed to insert document sections: {insert_result.error}")
                    
                    sections_to_insert = []
                    if (i + 1) % 10 == 0:
                        print(f"Inserted {i + 1}/{len(chunks)} chunks...")
            
            duration = time.time() - start_time
            
            print(f"Successfully processed document {file_name}: {len(chunks)} chunks in {duration:.2f}s")
            
            return ProcessDocumentResponse(
                success=True,
                message=f"Successfully processed document: {len(chunks)} chunks created",
                chunksProcessed=len(chunks)
            )
        
        finally:
            # Clean up temporary file
            try:
                if os.path.exists(temp_file_path):
                    os.remove(temp_file_path)
                os.rmdir(temp_dir)
            except Exception as cleanup_error:
                print(f"Warning: Could not clean up temporary files: {cleanup_error}")
    
    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        print(f"Error processing document: {error_msg}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process document: {error_msg}"
        )


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

