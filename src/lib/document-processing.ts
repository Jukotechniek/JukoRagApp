// Document processing utilities for RAG
// Splits documents into chunks and generates embeddings

import { supabase } from '@/lib/supabase';

interface Chunk {
  text: string;
  index: number;
  metadata?: {
    page?: number;
    section?: string;
    startChar?: number;
    endChar?: number;
  };
}

/**
 * Split text into chunks with overlap for better context
 * @param text - Text to split
 * @param options - Chunking options
 * @returns Array of chunks
 */
export function splitIntoChunks(
  text: string,
  options: {
    maxLength?: number;
    overlap?: number;
  } = {}
): Chunk[] {
  const { maxLength = 1000, overlap = 200 } = options;
  const chunks: Chunk[] = [];
  let startIndex = 0;
  let chunkIndex = 0;

  while (startIndex < text.length) {
    let endIndex = Math.min(startIndex + maxLength, text.length);

    // Try to break at sentence boundary if possible
    if (endIndex < text.length) {
      const lastPeriod = text.lastIndexOf('.', endIndex);
      const lastNewline = text.lastIndexOf('\n', endIndex);
      const breakPoint = Math.max(lastPeriod, lastNewline);

      if (breakPoint > startIndex + maxLength * 0.5) {
        endIndex = breakPoint + 1;
      }
    }

    const chunkText = text.slice(startIndex, endIndex).trim();

    if (chunkText.length > 0) {
      chunks.push({
        text: chunkText,
        index: chunkIndex,
        metadata: {
          startChar: startIndex,
          endChar: endIndex,
        },
      });
      chunkIndex++;
    }

    // Move start index with overlap
    startIndex = endIndex - overlap;
    if (startIndex <= 0) startIndex = endIndex;
  }

  return chunks;
}

/**
 * Process a document: split into chunks and generate embeddings
 * Uses N8N webhook for processing (more reliable than Edge Functions)
 * N8N will fetch the file from Supabase Storage and extract text itself
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

/**
 * Extract text from different file types
 * Supported: TXT, JSON, XLSX, CSV
 * TODO: PDF, DOCX support
 */
export async function extractTextFromFile(file: File): Promise<string> {
  console.log(`Extracting text from file: ${file.name}, type: ${file.type}`);
  
  // Handle text files
  if (file.type === 'text/plain' || file.type.startsWith('text/')) {
    const text = await file.text();
    console.log(`Text file extracted: ${text.length} characters`);
    return text;
  }

  // Handle JSON files
  if (file.type === 'application/json') {
    const text = await file.text();
    try {
      const json = JSON.parse(text);
      const formatted = JSON.stringify(json, null, 2);
      console.log(`JSON file extracted: ${formatted.length} characters`);
      return formatted;
    } catch {
      console.log(`JSON parsing failed, returning raw text: ${text.length} characters`);
      return text;
    }
  }

  // Handle XLSX files
  if (
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.type === 'application/vnd.ms-excel' ||
    file.name.endsWith('.xlsx') ||
    file.name.endsWith('.xls')
  ) {
    try {
      // Dynamically import xlsx to avoid bundling if not needed
      const XLSX = await import('xlsx');
      
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      
      let extractedText = '';
      
      // Process each sheet
      workbook.SheetNames.forEach((sheetName) => {
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert sheet to CSV format (preserves structure better than JSON)
        const csv = XLSX.utils.sheet_to_csv(worksheet);
        
        if (csv.trim().length > 0) {
          extractedText += `\n=== Sheet: ${sheetName} ===\n`;
          extractedText += csv;
          extractedText += '\n';
        }
      });
      
      console.log(`XLSX file extracted: ${extractedText.length} characters from ${workbook.SheetNames.length} sheets`);
      return extractedText.trim();
    } catch (error: any) {
      console.error('XLSX extraction error:', error);
      throw new Error(`Failed to extract text from Excel file: ${error.message}`);
    }
  }

  // Handle CSV files
  if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
    const text = await file.text();
    console.log(`CSV file extracted: ${text.length} characters`);
    return text;
  }

  // For PDF, DOCX - not yet supported
  if (file.type === 'application/pdf') {
    throw new Error('PDF files are not yet supported. Please convert to TXT or upload the text content separately.');
  }
  
  if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    throw new Error('DOCX files are not yet supported. Please convert to TXT or copy-paste the text content.');
  }

  // For images, return empty (you might want OCR later)
  if (file.type.startsWith('image/')) {
    throw new Error('Image files are not supported for text extraction. Consider using OCR tools first.');
  }

  // Unknown file type
  throw new Error(`File type '${file.type}' is not supported. Supported formats: TXT, JSON, XLSX, XLS, CSV`);
}

