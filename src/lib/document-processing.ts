// Document processing utilities for RAG
// Wrapper for Python API document processing

import { supabase } from '@/lib/supabase';

/**
 * Process a document: split into chunks and generate embeddings
 * Uses Python API for document processing (better PDF/DOCX support)
 * @param documentId - ID of the document in database
 * @param organizationId - Organization ID for RLS
 */
export async function processDocumentForRAG(
  documentId: string,
  organizationId: string
): Promise<void> {
  try {
    // Get Supabase session for authorization
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      throw new Error("Missing authorization header");
    }
    
    // Use Python API for document processing (better PDF/DOCX support)
    const pythonApiUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:8000';
    
    console.log(`Calling Python API for document processing: ${documentId}`);
    
    // Create AbortController for timeout (5 minutes max - processing can take time for large files)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000); // 5 minutes
    
    try {
      const response = await fetch(`${pythonApiUrl}/api/process-document`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          documentId,
          organizationId,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText };
        }
        
        console.error(`Python API returned error status ${response.status}:`, errorData);
        throw new Error(
          errorData.detail || 
          errorData.error || 
          `Python API returned status ${response.status}`
        );
      }

      const data = await response.json();
      console.log(`Python API response for ${documentId}:`, data);
      
      if (!data.success) {
        console.error(`Processing failed for ${documentId}:`, data.error || data.message);
        throw new Error(data.error || data.message || 'Processing failed');
      }

      console.log(`Python processing completed successfully for document: ${documentId}, chunks: ${data.chunksProcessed || 'unknown'}`);
      
      // Verify that document_sections were actually created
      // This helps catch cases where the API returns success but sections weren't created
      const { data: sections, error: verifyError } = await supabase
        .from('document_sections')
        .select('id')
        .eq('document_id', documentId)
        .limit(1);
      
      if (verifyError) {
        console.warn(`Could not verify document sections for ${documentId}:`, verifyError);
        // Don't throw - processing might have succeeded, just verification failed
      } else if (!sections || sections.length === 0) {
        console.warn(`No document sections found for ${documentId} after processing - this might indicate a problem`);
        // Don't throw - might be a timing issue, sections might be created async
      } else {
        console.log(`Verified ${sections.length} document section(s) exist for ${documentId}`);
      }
      
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        console.error(`Request timeout for document processing: ${documentId}`);
        throw new Error('Document processing timeout. Het bestand is mogelijk te groot. Probeer het later opnieuw of deel het bestand op in kleinere delen.');
      }
      
      throw fetchError;
    }

  } catch (error: any) {
    console.error('Error processing document for RAG:', error);
    
    // Provide more helpful error messages
    const errorMessage = error.message || error.toString();
    
    if (errorMessage.includes('PDF') || errorMessage.includes('DOCX')) {
      throw new Error(
        `PDF/DOCX verwerking vereist een N8N webhook. ` +
        `Configureer VITE_N8N_WEBHOOK_URL in je .env bestand, ` +
        `of converteer het bestand eerst naar TXT formaat. ` +
        `Originele error: ${errorMessage}`
      );
    }
    
    if (errorMessage.includes('N8N webhook')) {
      throw new Error(
        `N8N webhook error: ${errorMessage}. ` +
        `Controleer of VITE_N8N_WEBHOOK_URL correct is geconfigureerd.`
      );
    }
    
    throw new Error(`Failed to process document: ${errorMessage}`);
  }
}
