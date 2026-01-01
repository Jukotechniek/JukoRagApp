"""Document processing endpoint and logic"""
import os
import re
import tempfile
import time
from typing import Optional
from urllib.parse import urlparse, unquote
from fastapi import HTTPException, Header
from pydantic import BaseModel
from langchain_text_splitters import RecursiveCharacterTextSplitter

from config import supabase, embeddings, verify_auth_token
from utils.extraction import extract_documents_from_file


class ProcessDocumentRequest(BaseModel):
    documentId: str
    organizationId: str


class ProcessDocumentResponse(BaseModel):
    success: bool
    message: str
    chunksProcessed: Optional[int] = None
    error: Optional[str] = None


async def process_document_endpoint(
    request: ProcessDocumentRequest,
    authorization: Optional[str] = Header(None)
):
    """Process a document for RAG: extract text, chunk, and generate embeddings"""
    start_time = time.time()
    
    try:
        # Verify authentication
        verified_user_id = await verify_auth_token(authorization, request.organizationId)
        
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
            # For Excel files, we now combine rows into larger documents (50 rows each)
            # so we can use normal chunk sizes. For CSV, still use smaller chunks.
            is_excel = file_type in ['application/vnd.ms-excel', 
                                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'] or \
                      file_name.lower().endswith(('.xls', '.xlsx'))
            is_csv = file_type == 'text/csv' or file_name.lower().endswith('.csv')
            
            # For Excel: use normal chunk size since we combine rows into larger documents
            # For CSV: use smaller chunks since CSVLoader still creates per-row documents
            chunk_size = 800 if is_csv else 1500
            chunk_overlap = 100 if is_csv else 200
            
            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=chunk_size,
                chunk_overlap=chunk_overlap
            )
            
            # Check if this is a PDF extraction (Mistral OCR or PyMuPDF) - both should use 1 chunk per page
            # (so we can detect it correctly)
            is_mistral_ocr = any(
                doc_obj.metadata.get("extraction_method") == "mistral_ocr" 
                for doc_obj in langchain_docs
            )
            is_pymupdf_pdf = any(
                doc_obj.metadata.get("extraction_method") == "pymupdf" 
                for doc_obj in langchain_docs
            )
            is_pdf_extraction = is_mistral_ocr or is_pymupdf_pdf
            
            if is_mistral_ocr:
                print(f"[MISTRAL OCR] Detected Mistral OCR extraction: {len(langchain_docs)} pages, will use 1 chunk per page (no splitting)")
            elif is_pymupdf_pdf:
                print(f"[PYMUPDF] Detected PyMuPDF extraction: {len(langchain_docs)} pages, will use 1 chunk per page (no splitting)")
            
            # Add document metadata to each document before splitting
            for doc_obj in langchain_docs:
                doc_obj.metadata["document_id"] = request.documentId
                doc_obj.metadata["file_type"] = file_type
                # Preserve extraction_method if it exists
                if "extraction_method" not in doc_obj.metadata:
                    # This shouldn't happen for Mistral OCR, but just in case
                    pass
            
            # IMPORTANT: For PDFs (both Mistral OCR and PyMuPDF), use 1 chunk per page (no splitting)
            # This preserves the context of each page, which is critical for technical schemas
            chunks = []
            
            # For PDF extractions (Mistral OCR or PyMuPDF): use ALL pages as 1 chunk each (no splitting at all)
            if is_pdf_extraction:
                extraction_type = "Mistral OCR" if is_mistral_ocr else "PyMuPDF"
                print(f"[{extraction_type}] Processing {len(langchain_docs)} pages: using 1 chunk per page (NO SPLITTING)")
                for doc_obj in langchain_docs:
                    # Ensure all metadata is preserved (already added above, but double-check)
                    if "document_id" not in doc_obj.metadata:
                        doc_obj.metadata["document_id"] = request.documentId
                    if "file_type" not in doc_obj.metadata:
                        doc_obj.metadata["file_type"] = file_type
                    # Use the page directly as 1 chunk - NO SPLITTING
                    chunks.append(doc_obj)
                print(f"[{extraction_type}] Created {len(chunks)} chunks (should equal {len(langchain_docs)} pages)")
            else:
                # For other extraction methods: normal chunking logic
                mistral_pages = 0
                other_pages = 0
                for doc_obj in langchain_docs:
                    # For CSV: ensure content is split even if single row is large
                    if is_csv:
                        content_length = len(doc_obj.page_content)
                        if content_length > chunk_size * 2:
                            # Content is very large, split it multiple times if needed
                            # First split normally
                            page_chunks = text_splitter.split_documents([doc_obj])
                            # Then check each chunk and split further if still too large
                            final_chunks = []
                            for chunk in page_chunks:
                                if len(chunk.page_content) > chunk_size * 1.5:
                                    # Split this chunk again with smaller size
                                    smaller_splitter = RecursiveCharacterTextSplitter(
                                        chunk_size=chunk_size,
                                        chunk_overlap=chunk_overlap
                                    )
                                    sub_chunks = smaller_splitter.split_documents([chunk])
                                    final_chunks.extend(sub_chunks)
                                else:
                                    final_chunks.append(chunk)
                            page_chunks = final_chunks
                        else:
                            page_chunks = text_splitter.split_documents([doc_obj])
                    else:
                        # Normal splitting for PDFs (PyMuPDF) and other files
                        page_chunks = text_splitter.split_documents([doc_obj])
                
                # Add footer info to each chunk's metadata (enrich metadata per page)
                for chunk in page_chunks:
                    # Ensure all metadata is preserved
                    if "document_id" not in chunk.metadata:
                        chunk.metadata["document_id"] = request.documentId
                    
                    # For Excel files: ensure filename is in content even after splitting
                    # This helps the AI identify which file the data comes from
                    if is_excel and "source" in doc_obj.metadata:
                        source_file = doc_obj.metadata["source"]
                        # Check if filename is already at the start of the chunk
                        if not chunk.page_content.startswith(f"Bestand: {source_file}"):
                            chunk.page_content = f"Bestand: {source_file}\n\n{chunk.page_content}"
                    
                    # Add footer info to metadata if available (for PDFs)
                    # This enriches each chunk with page-specific footer information
                    if "page" in doc_obj.metadata:
                        chunk.metadata["page"] = doc_obj.metadata["page"]
                    if "actual_page" in doc_obj.metadata:
                        chunk.metadata["actual_page"] = doc_obj.metadata["actual_page"]
                    if "page_number_footer" in doc_obj.metadata:
                        chunk.metadata["page_number_footer"] = doc_obj.metadata["page_number_footer"]
                    if "project_description" in doc_obj.metadata:
                        chunk.metadata["project_description"] = doc_obj.metadata["project_description"]
                
                    chunks.extend(page_chunks)
                
                print(f"Created {len(chunks)} chunks from document {file_name}")
            
            # Generate embeddings in batches to avoid token limit
            print(f"Generating embeddings for {len(chunks)} chunks...")
            texts = [chunk.page_content for chunk in chunks]
            
            # Calculate batch size: OpenAI has 300k token limit per request
            # Estimate tokens: ~4 characters per token (conservative estimate)
            # Use smaller batches to be safe, especially for large chunks
            # Start with 100 chunks per batch, but dynamically adjust if needed
            max_tokens_per_request = 300000
            estimated_chars_per_token = 4
            safe_margin = 0.7  # Use 70% of limit to be safe
            max_chars_per_batch = int(max_tokens_per_request * estimated_chars_per_token * safe_margin)
            
            embeddings_list = []
            current_batch = []
            current_batch_chars = 0
            batch_num = 1
            total_chars = sum(len(text) for text in texts)
            total_batches_estimate = max(1, total_chars // max_chars_per_batch)
            
            for idx, text in enumerate(texts):
                text_length = len(text)
                
                # If adding this text would exceed the limit, process current batch first
                if current_batch and (current_batch_chars + text_length) > max_chars_per_batch:
                    print(f"Generating embeddings for batch {batch_num}/{total_batches_estimate} ({len(current_batch)} chunks, ~{current_batch_chars:,} chars)...")
                    
                    try:
                        batch_embeddings = embeddings.embed_documents(current_batch)
                        embeddings_list.extend(batch_embeddings)
                    except Exception as e:
                        error_msg = str(e)
                        print(f"Error generating embeddings for batch {batch_num}: {error_msg}")
                        # If batch is too large, try with smaller chunks
                        if "max_tokens" in error_msg.lower() or "300000" in error_msg:
                            print(f"Batch too large, splitting into smaller batches...")
                            # Process in even smaller batches (50 chunks max)
                            smaller_batch_size = 50
                            for j in range(0, len(current_batch), smaller_batch_size):
                                smaller_batch = current_batch[j:j + smaller_batch_size]
                                try:
                                    smaller_embeddings = embeddings.embed_documents(smaller_batch)
                                    embeddings_list.extend(smaller_embeddings)
                                except Exception as e2:
                                    raise HTTPException(
                                        status_code=500,
                                        detail=f"Failed to generate embeddings for batch {batch_num} (smaller batch): {str(e2)}"
                                    )
                        else:
                            raise HTTPException(
                                status_code=500,
                                detail=f"Failed to generate embeddings for batch {batch_num}: {error_msg}"
                            )
                    
                    # Reset for next batch
                    current_batch = []
                    current_batch_chars = 0
                    batch_num += 1
                
                # Add text to current batch
                current_batch.append(text)
                current_batch_chars += text_length
            
            # Process remaining batch
            if current_batch:
                print(f"Generating embeddings for batch {batch_num}/{total_batches_estimate} ({len(current_batch)} chunks, ~{current_batch_chars:,} chars)...")
                try:
                    batch_embeddings = embeddings.embed_documents(current_batch)
                    embeddings_list.extend(batch_embeddings)
                except Exception as e:
                    error_msg = str(e)
                    print(f"Error generating embeddings for batch {batch_num}: {error_msg}")
                    # If batch is too large, try with smaller chunks
                    if "max_tokens" in error_msg.lower() or "300000" in error_msg:
                        print(f"Batch too large, splitting into smaller batches...")
                        smaller_batch_size = 50
                        for j in range(0, len(current_batch), smaller_batch_size):
                            smaller_batch = current_batch[j:j + smaller_batch_size]
                            try:
                                smaller_embeddings = embeddings.embed_documents(smaller_batch)
                                embeddings_list.extend(smaller_embeddings)
                            except Exception as e2:
                                raise HTTPException(
                                    status_code=500,
                                    detail=f"Failed to generate embeddings for batch {batch_num} (smaller batch): {str(e2)}"
                                )
                    else:
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

