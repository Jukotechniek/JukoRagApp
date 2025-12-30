# import basics
import os
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
def _retrieve_internal(query: str, trace=None, trace_context=None):
    """Internal retrieve function with Langfuse tracking"""
    import re
    from langchain_core.documents import Document
    
    retrieve_span = None
    if trace and langfuse_client and trace_context:
        retrieve_span = langfuse_client.start_span(
            name="retrieve",
            trace_context=trace_context,
            metadata={
                "input": {"query": query},
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
                metadata={"query": query, "k": 4}
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
        semantic_docs = vector_store.similarity_search(query, k=5)
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
                    metadata={"invoice_pattern": invoice_pattern.group(0)}
                )
            
            keyword_start = time.time()
            invoice_num = invoice_pattern.group(0)
            try:
                result = supabase.table("document_sections").select("content, metadata").ilike("content", f"%{invoice_num}%").limit(5).execute()
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

# Global variables to pass trace to retrieve tool
_current_trace = None
_current_trace_context = None

def set_current_trace(trace, trace_context=None):
    """Set current trace for retrieve tool"""
    global _current_trace, _current_trace_context
    _current_trace = trace
    _current_trace_context = trace_context

# Creating the retriever tool (wrapper for Langfuse tracking)
@tool(response_format="content_and_artifact")
def retrieve(query: str):
    """Retrieve information related to a query. Uses hybrid search combining semantic similarity and keyword matching for better results."""
    global _current_trace, _current_trace_context
    return _retrieve_internal(query, _current_trace, _current_trace_context)

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
        
        # Set trace for retrieve tool
        if trace:
            set_current_trace(trace, trace_context)
        
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
        
        # Reset trace for next request
        set_current_trace(None, None)
        
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
        
        # Reset trace for next request
        set_current_trace(None, None)
        
        raise HTTPException(status_code=500, detail=error_msg)


def extract_text_from_file(file_path: str, file_type: str, file_name: str) -> str:
    """Extract text from various file types"""
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
        
        # Extract storage path from URL
        url_match = re.search(r'/documents/(.+)$', file_url)
        if not url_match:
            raise HTTPException(status_code=400, detail="Could not extract file path from URL")
        
        storage_path = url_match.group(1)
        
        # Download file from Supabase Storage to temporary location
        temp_dir = tempfile.mkdtemp()
        file_name = doc.get("name", "document")
        temp_file_path = os.path.join(temp_dir, file_name)
        
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
            
            # Extract text from file
            file_type = doc.get("file_type", "")
            text_content = extract_text_from_file(temp_file_path, file_type, file_name)
            
            if not text_content or len(text_content.strip()) == 0:
                raise HTTPException(status_code=400, detail="No text content extracted from document")
            
            # Split into chunks
            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=1500,
                chunk_overlap=200
            )
            
            # Create LangChain documents with metadata
            langchain_docs = [Document(
                page_content=text_content,
                metadata={
                    "document_id": request.documentId,
                    "source": file_name,
                    "file_type": file_type
                }
            )]
            
            chunks = text_splitter.split_documents(langchain_docs)
            
            # Add document_id to each chunk's metadata
            for chunk in chunks:
                chunk.metadata["document_id"] = request.documentId
            
            print(f"Created {len(chunks)} chunks from document {file_name}")
            
            # Generate embeddings for all chunks
            print(f"Generating embeddings for {len(chunks)} chunks...")
            texts = [chunk.page_content for chunk in chunks]
            embeddings_list = embeddings.embed_documents(texts)
            
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

