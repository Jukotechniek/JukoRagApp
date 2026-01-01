"""Chat endpoint and logic with RAG retrieval"""
import re
import time
import uuid
from typing import Optional, List
from fastapi import HTTPException, Header
from pydantic import BaseModel
from langchain.agents import AgentExecutor
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.documents import Document
from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.outputs import LLMResult
from langchain_core.tools import tool
from langfuse.types import TraceContext

from config import (
    supabase, embeddings, llm, prompt, langfuse_client,
    set_current_trace, get_current_trace, get_current_trace_context, get_current_organization_id
)


class ChatRequest(BaseModel):
    question: str
    organizationId: str
    userId: Optional[str] = None
    conversationId: Optional[str] = None


class ChatResponse(BaseModel):
    success: bool
    response: str
    requestId: Optional[str] = None


# Internal retrieve function with Langfuse tracking
def _retrieve_internal(query: str, organization_id: str = None, trace=None, trace_context=None):
    """Internal retrieve function with Langfuse tracking and organization_id filtering"""
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
        
        # Semantic search using RPC function
        semantic_matches = supabase.rpc(
            "match_document_sections",
            {
                "p_organization_id": organization_id,
                "p_query_embedding": query_embedding,
                "p_match_count": 6,
                "p_threshold": 0.35
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
        
        # Keyword search span - full-text search for exact matches
        keyword_span = None
        if retrieve_span and langfuse_client and trace_context:
            keyword_span = langfuse_client.start_span(
                name="keyword_search",
                trace_context=trace_context,
                metadata={"query": query, "organization_id": organization_id}
            )
        
        keyword_start = time.time()
        keyword_docs = []
        
        try:
            # Filter by organization_id: first get document IDs for this organization
            org_docs_result = supabase.table("documents").select("id").eq("organization_id", organization_id).execute()
            org_doc_ids = [doc["id"] for doc in org_docs_result.data] if org_docs_result.data else []
            
            if org_doc_ids:
                # Extract meaningful keywords from query (remove common words)
                # First, extract component codes and technical identifiers (these are important even if short)
                # Patterns: "8293Q2", "Q302.0", "2RSP02", "-8293U2", etc.
                component_codes = re.findall(r'\b-?\d+[A-Za-z]+\d*[A-Za-z]*\b|\b[A-Za-z]+\d+[A-Za-z]?\d*\.?\d*\b|\b\d+[A-Za-z]\d+\b', query, re.IGNORECASE)
                
                # Split query into words and search for each significant term (3+ characters)
                query_words = re.findall(r'\b\w{3,}\b', query.lower())
                # Remove common stopwords
                stopwords = {'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'she', 'use', 'her', 'many', 'than', 'them', 'these', 'so', 'some', 'would', 'make', 'like', 'into', 'time', 'has', 'look', 'two', 'more', 'write', 'go', 'see', 'number', 'no', 'way', 'could', 'people', 'my', 'than', 'first', 'water', 'been', 'call', 'who', 'oil', 'sit', 'now', 'find', 'down', 'day', 'did', 'get', 'come', 'made', 'may', 'part'}
                keywords = [w for w in query_words if w not in stopwords]
                
                # Combine component codes and regular keywords
                # Component codes should be searched with original case/punctuation
                all_keywords = []
                seen_codes = set()  # Avoid duplicates
                for code in component_codes:
                    # Add the code as-is (preserving case and punctuation)
                    code_lower = code.lower()
                    if code not in seen_codes:
                        all_keywords.append(code)
                        seen_codes.add(code)
                    # Also add without leading dash for better matching (if code has dash)
                    if code.startswith('-') and code[1:] not in seen_codes:
                        all_keywords.append(code[1:])
                        seen_codes.add(code[1:])
                    # Also add WITH leading dash if code doesn't have dash (to find "-8293Q2" when searching "8293Q2")
                    elif not code.startswith('-') and f"-{code}" not in seen_codes:
                        all_keywords.append(f"-{code}")
                        seen_codes.add(f"-{code}")
                    # Also add lowercase version for case-insensitive matching
                    if code_lower not in seen_codes and code_lower != code:
                        all_keywords.append(code_lower)
                        seen_codes.add(code_lower)
                # Add regular keywords (lowercase)
                all_keywords.extend([kw for kw in keywords if kw not in seen_codes])
                
                # If we have keywords, search for them
                if all_keywords:
                    # Get document metadata for keyword results
                    doc_metadata_map = {}
                    
                    # Search for each keyword (prioritize component codes, then regular keywords)
                    # Limit to top 5 keywords total to avoid too many queries
                    search_keywords = all_keywords[:5]
                    for keyword in search_keywords:
                        result = supabase.table("document_sections").select(
                            "content, metadata, document_id"
                        ).ilike("content", f"%{keyword}%").in_("document_id", org_doc_ids).limit(5).execute()
                        
                        if result.data:
                            # Get document names for these sections
                            doc_ids = list(set([r.get("document_id") for r in result.data if r.get("document_id")]))
                            if doc_ids:
                                doc_result = supabase.table("documents").select("id, name").in_("id", doc_ids).eq("organization_id", organization_id).execute()
                                if doc_result.data:
                                    for doc in doc_result.data:
                                        if doc["id"] not in doc_metadata_map:
                                            doc_metadata_map[doc["id"]] = {"name": doc.get("name", "Unknown")}
                            
                            for row in result.data:
                                doc_meta = doc_metadata_map.get(row.get("document_id"), {})
                                keyword_docs.append(Document(
                                    page_content=row.get("content", ""),
                                    metadata={
                                        "document_id": row.get("document_id"),
                                        "source": doc_meta.get("name", "Unknown"),
                                        **({} if not row.get("metadata") else row["metadata"] if isinstance(row.get("metadata"), dict) else {})
                                    }
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
        
        # Combine and deduplicate (using simple approach from old version)
        combine_span = None
        if retrieve_span and langfuse_client and trace_context:
            combine_span = langfuse_client.start_span(
                name="combine_results",
                trace_context=trace_context
            )
        
        all_docs = []
        seen_content = set()
        
        # Simple deduplication: use first 200 chars as key (like old version)
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
        
        # Take first 5 (like old version, no sorting by similarity)
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
        
        # Format serialized output with clear source citations (filename and page from footer)
        serialized = "\n\n".join(
            (
                f"Source: {doc.metadata.get('source', 'Unknown')}, "
                f"Pagina: {doc.metadata.get('page', doc.metadata.get('page_number_footer', 'N/A'))}\n"
                f"Content: {doc.page_content}"
            )
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


# Combining all tools
tools = [retrieve]

# Initiating the agent
from langchain.agents import create_tool_calling_agent
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

# Create the agent executor
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)


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
        # Always filter by user_id to ensure history is unique per user
        # Also filter by conversation_id if provided, or just by user_id for user-specific history
        query = supabase.table("chat_messages").select("role, content, created_at").eq("organization_id", organization_id).eq("user_id", user_id).order("created_at", desc=True).limit(limit)
        
        if conversation_id:
            query = query.eq("conversation_id", conversation_id)
        
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


async def chat_endpoint(
    request: ChatRequest,
    authorization: Optional[str] = Header(None)
):
    """Chat endpoint that uses the agent executor with full Langfuse tracking"""
    from config import verify_auth_token
    
    request_id = str(uuid.uuid4())[:8]
    start_time = time.time()
    trace = None
    
    try:
        # Verify authentication
        verified_user_id = await verify_auth_token(authorization, request.organizationId)
        
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
        
        # Log response time to analytics
        try:
            supabase.table("analytics").insert({
                "organization_id": request.organizationId,
                "event_type": "response_time",
                "event_data": {
                    "response_time_ms": total_duration,
                    "question_length": len(request.question),
                    "response_length": len(ai_message),
                    "request_id": request_id
                }
            }).execute()
        except Exception as analytics_error:
            print(f"Warning: Failed to log response time to analytics: {analytics_error}")
        
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
        
        # Log response time to analytics even on error
        try:
            supabase.table("analytics").insert({
                "organization_id": request.organizationId,
                "event_type": "response_time",
                "event_data": {
                    "response_time_ms": total_duration,
                    "question_length": len(request.question),
                    "error": error_msg,
                    "request_id": request_id
                }
            }).execute()
        except Exception as analytics_error:
            print(f"Warning: Failed to log response time to analytics: {analytics_error}")
        
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
