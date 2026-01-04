"""Main FastAPI application with routes and CORS"""
import os
from typing import Optional
from fastapi import FastAPI, Request, Header
from fastapi.responses import Response
import uvicorn

from chat import chat_endpoint, ChatRequest, ChatResponse
from document_processing import process_document_endpoint, ProcessDocumentRequest, ProcessDocumentResponse

# Create FastAPI app
app = FastAPI(title="Juk Assistant API")

# CORS middleware - restrict to allowed origins
allowed_origins_env = os.environ.get("ALLOWED_ORIGINS", "")
allowed_origins = [origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()] if allowed_origins_env else []

# For development, allow common localhost origins
# Note: Cannot use ["*"] with allow_credentials=True
if allowed_origins:
    cors_origins = allowed_origins
    cors_credentials = True
else:
    # For development: explicitly allow localhost origins
    cors_origins = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]
    cors_credentials = False

# Add CORS headers manually via middleware
@app.middleware("http")
async def add_cors_header(request: Request, call_next):
    """Manually add CORS headers to all responses"""
    response = await call_next(request)
    
    # Get origin from request
    origin = request.headers.get("origin")
    
    # Allow localhost and local network origins for development
    # Check if origin matches localhost, 127.0.0.1, or local network IP (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
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
    
    # For development: allow localhost and local network IPs
    if origin:
        # Check if origin matches any allowed pattern
        origin_allowed = any(origin.startswith(pattern) for pattern in allowed_patterns)
        if origin_allowed:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
            response.headers["Access-Control-Allow-Headers"] = "authorization, content-type, Authorization, Content-Type, Accept"
            response.headers["Access-Control-Allow-Credentials"] = "false"
            response.headers["Access-Control-Max-Age"] = "3600"
    elif not origin:
        # For requests without origin (like direct API calls), allow all
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
        response.headers["Access-Control-Allow-Headers"] = "authorization, content-type, Authorization, Content-Type, Accept"
    
    return response


# ===== Routes =====

@app.get("/api/health")
async def health_check():
    """Health check endpoint to test CORS"""
    return {"status": "ok", "message": "API is running"}


@app.api_route("/api/process-document", methods=["OPTIONS"])
async def process_document_options(request: Request):
    """Handle CORS preflight requests explicitly - this should work even if CORS middleware fails"""
    # Get the origin from the request
    origin = request.headers.get("origin", "http://localhost:3000")
    
    # Allow localhost and local network origins for development
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
    
    # Check if origin matches any allowed pattern
    if origin and any(origin.startswith(pattern) for pattern in allowed_patterns):
        allow_origin = origin
    elif not origin or origin == "null":
        allow_origin = "http://localhost:3000"  # Default for development
    else:
        # For development, allow any origin (be more permissive)
        allow_origin = origin
    
    # Return response with CORS headers
    response = Response(
        status_code=200,
        content="",
        headers={
            "Access-Control-Allow-Origin": allow_origin,
            "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
            "Access-Control-Allow-Headers": "authorization, content-type, Authorization, Content-Type, Accept",
            "Access-Control-Allow-Credentials": "false",
            "Access-Control-Max-Age": "3600",
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


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

