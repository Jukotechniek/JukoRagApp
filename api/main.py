"""Main FastAPI application with routes and CORS"""
import os
from typing import Optional
from fastapi import FastAPI, Request, Header
from fastapi.responses import Response, FileResponse
import uvicorn

# Import config early to initialize Sentry before FastAPI app is created
import config

from chat import chat_endpoint, chat_endpoint_stream, ChatRequest, ChatResponse
from document_processing import process_document_endpoint, ProcessDocumentRequest, ProcessDocumentResponse

# Create FastAPI app
app = FastAPI(title="Juko Assistant API")

# CORS middleware - restrict to allowed origins
allowed_origins_env = os.environ.get("ALLOWED_ORIGINS", "")
allowed_origins = [origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()] if allowed_origins_env else []

# Development origins (only used if ALLOWED_ORIGINS not set)
allowed_patterns = [
    "http://localhost:",
    "http://127.0.0.1:",
    "http://192.168.",
    "http://10.",
    "http://172.16.",
    "http://172.17.",
    "http://172.18.",
    "http://172.19.",
    "http://172.20.",
    "http://172.21.",
    "http://172.22.",
    "http://172.23.",
    "http://172.24.",
    "http://172.25.",
    "http://172.26.",
    "http://172.27.",
    "http://172.28.",
    "http://172.29.",
    "http://172.30.",
    "http://172.31.",
]

def _is_origin_allowed(origin: Optional[str]) -> bool:
    """Check if origin is allowed based on configuration"""
    if not origin:
        return False
    # If explicit allowed_origins is set, use exact match
    if allowed_origins:
        return origin in allowed_origins
    # Otherwise, check against development patterns
    return any(origin.startswith(pattern) for pattern in allowed_patterns)

# Add CORS headers manually via middleware
@app.middleware("http")
async def add_cors_header(request: Request, call_next):
    """Manually add CORS headers to all responses"""
    response = await call_next(request)
    
    # Get origin from request
    origin = request.headers.get("origin")
    
    # Only add CORS headers if origin is explicitly allowed
    if _is_origin_allowed(origin):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
        response.headers["Access-Control-Allow-Headers"] = "authorization, content-type, Authorization, Content-Type, Accept"
        response.headers["Access-Control-Allow-Credentials"] = "false"
        response.headers["Access-Control-Max-Age"] = "3600"
        response.headers["Vary"] = "Origin"
    
    return response


# ===== Routes =====

@app.get("/api/health")
async def health_check():
    """Health check endpoint to test CORS"""
    return {"status": "ok", "message": "API is running"}


@app.get("/favicon.ico")
async def favicon():
    """Serve favicon from the frontend icon.svg to avoid 404s."""
    icon_path = os.path.normpath(
        os.path.join(os.path.dirname(__file__), "..", "public", "icon.svg")
    )
    if os.path.isfile(icon_path):
        return FileResponse(icon_path, media_type="image/svg+xml")
    return Response(status_code=204)


@app.api_route("/api/process-document", methods=["OPTIONS"])
async def process_document_options(request: Request):
    """Handle CORS preflight requests explicitly"""
    origin = request.headers.get("origin")
    
    # Only allow explicitly allowed origins
    if not _is_origin_allowed(origin):
        return Response(status_code=403, content="")
    
    # Return response with CORS headers
    response = Response(
        status_code=200,
        content="",
        headers={
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
            "Access-Control-Allow-Headers": "authorization, content-type, Authorization, Content-Type, Accept",
            "Access-Control-Allow-Credentials": "false",
            "Access-Control-Max-Age": "3600",
            "Vary": "Origin",
        }
    )
    return response


@app.post("/api/process-document", response_model=ProcessDocumentResponse)
async def process_document_route(
    request: ProcessDocumentRequest,
    authorization: Optional[str] = Header(None)
):
    """Process document endpoint"""
    return await process_document_endpoint(request, authorization)


@app.post("/api/chat", response_model=ChatResponse)
async def chat_route(
    request: ChatRequest,
    authorization: Optional[str] = Header(None)
):
    """Chat endpoint"""
    return await chat_endpoint(request, authorization)


@app.post("/api/chat/stream")
async def chat_stream_route(
    request: ChatRequest,
    authorization: Optional[str] = Header(None)
):
    """Streaming chat endpoint with step-by-step updates"""
    from fastapi.responses import StreamingResponse
    return StreamingResponse(
        chat_endpoint_stream(request, authorization),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

