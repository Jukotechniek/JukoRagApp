// Document processing utilities for RAG
// Splits documents into chunks and generates embeddings

import { generateEmbeddingsBatch } from './openai';
import { supabase } from './supabase';
import { Database } from '@/types/database';

type DocumentSectionInsert = Database['public']['Tables']['document_sections']['Insert'];

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
 * Uses Supabase Edge Function for secure processing (API keys stay on server)
 * @param documentId - ID of the document in database
 * @param content - Text content of the document
 * @param organizationId - Organization ID for RLS
 */
export async function processDocumentForRAG(
  documentId: string,
  content: string,
  organizationId: string
): Promise<void> {
  try {
    console.log('Invoking Edge Function process-document with:', {
      documentId,
      contentLength: content.length,
      organizationId,
    });

    // Call Edge Function for processing (keeps API keys secure)
    const { data, error } = await supabase.functions.invoke('process-document', {
      body: {
        documentId,
        content,
        organizationId,
      },
    });

    console.log('Edge Function response:', { data, error });

    if (error) {
      console.error('Error calling process-document function:', error);
      
      // Try to extract error details from the error object
      let errorMessage = error.message || 'Unknown error';
      let errorDetails = '';
      
      // Check if error has a response we can parse
      if (error.context?.response) {
        try {
          const errorResponse = await error.context.response.json();
          errorMessage = errorResponse.error || errorMessage;
          errorDetails = errorResponse.details || '';
        } catch {
          // If we can't parse, use the original message
        }
      }
      
      const fullError = errorDetails 
        ? `${errorMessage}. Details: ${errorDetails}`
        : `${errorMessage}. Check Supabase Edge Function logs (Edge Functions > process-document > Logs) for more details.`;
      
      throw new Error(fullError);
    }

    if (!data?.success) {
      const errorMsg = data?.error || data?.details || 'Failed to process document';
      throw new Error(`Processing failed: ${errorMsg}`);
    }

    console.log(`Successfully processed document ${documentId}: ${data.chunksProcessed} chunks created`);
  } catch (error: any) {
    console.error('Error processing document for RAG:', error);
    throw new Error(`Failed to process document: ${error.message || error.toString()}`);
  }
}

/**
 * Extract text from different file types
 * Note: This is a basic implementation. For production, use proper parsers:
 * - PDF: pdf-parse, pdfjs-dist (client-side)
 * - DOCX: mammoth, docx
 * - XLSX: xlsx
 */
export async function extractTextFromFile(file: File): Promise<string> {
  // Handle text files
  if (file.type === 'text/plain' || file.type.startsWith('text/')) {
    return await file.text();
  }

  // Handle JSON files
  if (file.type === 'application/json') {
    const text = await file.text();
    try {
      const json = JSON.parse(text);
      return JSON.stringify(json, null, 2);
    } catch {
      return text;
    }
  }

  // For PDF, DOCX, XLSX - these require proper parsers
  // For now, return empty string and let the user know
  // In production, you would:
  // - For PDF: Use pdfjs-dist or send to backend for parsing
  // - For DOCX: Use mammoth library
  // - For XLSX: Use xlsx library
  
  if (
    file.type === 'application/pdf' ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    // Return empty string - these file types need proper parsing
    // The document will be uploaded but not processed for RAG
    // You can implement proper parsing later
    console.warn(`File type ${file.type} requires proper parsing. Document uploaded but not processed for RAG.`);
    return '';
  }

  // For images, return empty (you might want OCR later)
  if (file.type.startsWith('image/')) {
    console.warn('Image files cannot be processed for text extraction without OCR.');
    return '';
  }

  // Unknown file type
  throw new Error(`File type ${file.type} is not supported for text extraction. Supported: text files, JSON.`);
}

