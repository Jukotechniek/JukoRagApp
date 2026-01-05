import { supabase } from './supabase';
import type { Database } from '@/types/database';

type DocumentRow = Database['public']['Tables']['documents']['Row'];

export interface DocumentInfo {
  id: string;
  name: string;
  file_url: string | null;
}

/**
 * Find a document by filename (case-insensitive partial match)
 * @param filename - The filename to search for (e.g., "WESIJS32_2RSP02 V2.3.pdf")
 * @param organizationId - Optional organization ID to filter by
 * @returns Document info or null if not found
 */
export async function findDocumentByFilename(
  filename: string,
  organizationId?: string | null
): Promise<DocumentInfo | null> {
  try {
    // Clean the filename - remove path if present, normalize
    const cleanFilename = filename.trim();
    
    // Build query - search for documents where name contains the filename (case-insensitive)
    let query = supabase
      .from('documents')
      .select('id, name, file_url')
      .ilike('name', `%${cleanFilename}%`)
      .order('created_at', { ascending: false })
      .limit(1);

    // If organizationId is provided, filter by it
    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error('Error finding document:', error);
      return null;
    }

    if (!data) {
      return null;
    }

    return {
      id: data.id,
      name: data.name,
      file_url: data.file_url,
    };
  } catch (error) {
    console.error('Error in findDocumentByFilename:', error);
    return null;
  }
}

/**
 * Get a signed URL for a PDF document
 * @param fileUrl - The file_url from the document record
 * @param expiresIn - Expiration time in seconds (default: 600 = 10 minutes)
 * @returns Signed URL or null if error
 */
export async function getSignedPdfUrl(
  fileUrl: string | null,
  expiresIn: number = 600
): Promise<string | null> {
  if (!fileUrl) {
    return null;
  }

  try {
    // Extract storage path from file_url
    // Format is typically: https://...supabase.co/storage/v1/object/public/documents/...
    // Or: /documents/filename.pdf
    const match = fileUrl.match(/\/documents\/(.+)$/);
    
    if (!match || !match[1]) {
      // If it's already a full URL, try to use it directly
      if (fileUrl.startsWith('http')) {
        return fileUrl;
      }
      console.error('Could not extract storage path from file_url:', fileUrl);
      return null;
    }

    const storagePath = decodeURIComponent(match[1]);
    
    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(storagePath, expiresIn);

    if (error) {
      console.error('Error creating signed URL:', error);
      return null;
    }

    return data?.signedUrl || null;
  } catch (error) {
    console.error('Error in getSignedPdfUrl:', error);
    return null;
  }
}

/**
 * Get actual_page from document_sections based on page_number_footer
 * @param documentId - The document ID
 * @param pageNumberFooter - The page number from footer (e.g., 101)
 * @returns actual_page number or null if not found
 */
export async function getActualPageFromFooter(
  documentId: string,
  pageNumberFooter: number
): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from('document_sections')
      .select('metadata')
      .eq('document_id', documentId)
      .limit(1000); // Get all sections for this document

    if (error) {
      console.error('Error fetching document sections:', error);
      return null;
    }

    if (!data || data.length === 0) {
      return null;
    }

    // Find the section with matching page_number_footer
    for (const section of data) {
      const metadata = section.metadata as any;
      const footerPage = metadata?.page_number_footer || metadata?.page;
      
      if (footerPage === pageNumberFooter && metadata?.actual_page) {
        return metadata.actual_page as number;
      }
    }

    // If not found, try to find by page field
    for (const section of data) {
      const metadata = section.metadata as any;
      const page = metadata?.page;
      
      if (page === pageNumberFooter && metadata?.actual_page) {
        return metadata.actual_page as number;
      }
    }

    return null;
  } catch (error) {
    console.error('Error in getActualPageFromFooter:', error);
    return null;
  }
}

/**
 * Find document and get signed URL with actual_page conversion
 * @param filename - The filename to search for
 * @param pageNumberFooter - The page number from footer (as shown in citation)
 * @param organizationId - Optional organization ID
 * @returns Object with document info, signed URL, and actual_page, or null if not found
 */
export async function getDocumentWithSignedUrl(
  filename: string,
  pageNumberFooter: number,
  organizationId?: string | null
): Promise<{ document: DocumentInfo; signedUrl: string; actualPage: number } | null> {
  console.log('Looking for document:', filename, 'page:', pageNumberFooter, 'in organization:', organizationId);
  const document = await findDocumentByFilename(filename, organizationId);
  
  if (!document || !document.file_url) {
    console.log('Document not found or no file_url');
    return null;
  }

  console.log('Found document:', document.name, 'file_url:', document.file_url);
  
  // Get actual_page from document_sections
  const actualPage = await getActualPageFromFooter(document.id, pageNumberFooter);
  
  if (actualPage === null) {
    console.log('Could not find actual_page for page_number_footer:', pageNumberFooter, '- using page_number_footer as fallback');
    // Fallback: use page_number_footer if actual_page not found
    // This might not be accurate but better than nothing
  } else {
    console.log('Found actual_page:', actualPage, 'for page_number_footer:', pageNumberFooter);
  }

  const signedUrl = await getSignedPdfUrl(document.file_url);
  
  if (!signedUrl) {
    console.log('Failed to create signed URL');
    return null;
  }

  console.log('Created signed URL (first 100 chars):', signedUrl.substring(0, 100));
  return { 
    document, 
    signedUrl, 
    actualPage: actualPage ?? pageNumberFooter // Fallback to page_number_footer if actual_page not found
  };
}

