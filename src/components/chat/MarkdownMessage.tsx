import { useState, useCallback, useEffect, useRef, useLayoutEffect } from 'react';
import dynamic from 'next/dynamic';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { visit } from 'unist-util-visit';
import type { Root, Text, Parent } from 'mdast';
import { getDocumentWithSignedUrl } from '@/lib/document-utils';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

// Dynamically import PdfViewerDialog to avoid SSR issues with react-pdf
const PdfViewerDialog = dynamic(
  () => import('./PdfViewerDialog').then((mod) => ({ default: mod.PdfViewerDialog })),
  { ssr: false }
);

interface MarkdownMessageProps {
  content: string;
  className?: string;
}

// Parse citation patterns like "(Bron: FILENAME.pdf, Pagina: NUMBER)" or variations
// Handles multiple citations separated by semicolons: (Bron: file1.pdf, Pagina: 1; Bron: file2.pdf, Pagina: 2)
// Returns array of all citation matches with their page numbers
function parseCitations(text: string): Array<{ filename: string; pageNumbers: number[]; fullMatch: string; matchIndex: number }> {
  const results: Array<{ filename: string; pageNumbers: number[]; fullMatch: string; matchIndex: number }> = [];
  
  // Pattern to match: Bron: FILENAME.pdf, Pagina: NUMBER1, NUMBER2, NUMBER3, etc.
  // Handles multiple citations separated by semicolons
  // Uses non-greedy matching and captures everything until the next semicolon or closing paren
  const pattern = /Bron:\s*([^,;)]+\.pdf)\s*[,;]?\s*Pagina:?\s*([^;)]+?)(?:\s*;|\s*\)|$)/gi;
  
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const filename = match[1].trim();
    let pageNumbersStr = match[2].trim();
    
    // Remove any trailing punctuation
    pageNumbersStr = pageNumbersStr.replace(/[;,) ]+$/, '').trim();
    
    // Extract all page numbers (can be comma, semicolon, or space separated)
    const pageNumbers = pageNumbersStr
      .split(/[,\s;]+/)
      .map(p => parseInt(p.trim(), 10))
      .filter(p => !isNaN(p) && p > 0);
    
    if (filename && pageNumbers.length > 0) {
      results.push({
        filename,
        pageNumbers,
        fullMatch: match[0],
        matchIndex: match.index,
      });
    }
  }
  
  return results;
}

// Sanitization schema that allows citation spans with data attributes
// Use propertyMatches to allow all data-* attributes on span elements
const citationSanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), 'span'],
  attributes: {
    ...defaultSchema.attributes,
    span: [
      ...(defaultSchema.attributes?.span || []),
      'className',
      'class',
      'data-citation-filename',
      'data-citation-page',
    ],
  },
};

// Custom remark plugin to transform citations
function remarkCitations() {
  return (tree: Root) => {
    visit(tree, 'text', (node: Text, index: number | undefined, parent: Parent | undefined) => {
      if (!parent || index === undefined || parent.type !== 'paragraph') return;

      const text = node.value;
      const citationResults = parseCitations(text);

      if (citationResults.length > 0) {
        // Process citations in reverse order to maintain correct string indices
        const sortedResults = [...citationResults].sort((a, b) => b.matchIndex - a.matchIndex);

        let processedText = text;

        // Process each citation match
        for (const { filename, pageNumbers, fullMatch } of sortedResults) {
          const matchIndex = processedText.lastIndexOf(fullMatch);
          if (matchIndex === -1) continue;

          // Find "Pagina:" in the match
          const paginaIndex = fullMatch.toLowerCase().indexOf('pagina');
          if (paginaIndex === -1) continue;

          // Get the part before "Pagina:"
          const beforePagina = fullMatch.substring(0, paginaIndex);
          
          // Get the part after "Pagina:"
          const afterPagina = fullMatch.substring(paginaIndex);
          const paginaMatch = afterPagina.match(/pagina:?\s*(.+)/i);
          if (!paginaMatch) continue;

          const pageNumbersPart = paginaMatch[1].trim();
          
          // Replace each page number with a clickable link
          // We need to replace them one by one, processing in reverse order to maintain indices
          let replacedPageNumbers = pageNumbersPart;
          const sortedPageNumbers = [...pageNumbers].sort((a, b) => b - a);
          
          for (const pageNum of sortedPageNumbers) {
            const pageNumStr = pageNum.toString();
            // Create a unique placeholder first to avoid replacing already replaced numbers
            const placeholder = `__PAGE_${pageNum}_PLACEHOLDER__`;
            
            // Replace the page number with placeholder (using word boundary to match whole numbers)
            replacedPageNumbers = replacedPageNumbers.replace(
              new RegExp(`\\b${pageNumStr}\\b(?=\\s*[;,\\)]|\\s*$)`, 'g'),
              placeholder
            );
          }
          
          // Now replace placeholders with actual HTML links
          // HTML escape the filename to prevent issues with special characters
          const escapedFilename = filename
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
          
          // Encode citation data in id attribute as base64 to avoid sanitizer issues
          // Format: citation-{base64(encodeURIComponent(filename)|pageNum)}
          for (const pageNum of pageNumbers) {
            const pageNumStr = pageNum.toString();
            const placeholder = `__PAGE_${pageNum}_PLACEHOLDER__`;
            // Encode filename with encodeURIComponent first to handle special chars, then base64
            // Format: encodeURIComponent(filename)|pageNum
            const encodedFilename = encodeURIComponent(filename);
            const citationData = `${encodedFilename}|${pageNum}`;
            // Use base64 encoding and make URL-safe
            const base64 = btoa(unescape(encodeURIComponent(citationData)));
            const citationId = base64.replace(/[+/=]/g, (m) => ({ '+': '-', '/': '_', '=': '' }[m] || ''));
            const linkHtml = `<span id="citation-${citationId}" class="citation-page-link text-red-600 dark:text-red-400 cursor-pointer hover:underline font-medium">${pageNumStr}</span>`;
            replacedPageNumbers = replacedPageNumbers.replace(placeholder, linkHtml);
          }

          // Rebuild the citation
          const newCitation = beforePagina + 'Pagina: ' + replacedPageNumbers;
          
          // Replace in processedText
          processedText = processedText.substring(0, matchIndex) + 
                          newCitation + 
                          processedText.substring(matchIndex + fullMatch.length);
        }

        // Now split processedText into text and HTML nodes
        const nodes: any[] = [];
        const htmlPattern = /<span[^>]*>.*?<\/span>/g;
        let lastIndex = 0;
        let match;
        
        while ((match = htmlPattern.exec(processedText)) !== null) {
          // Add text before the HTML
          if (match.index > lastIndex) {
            const textBefore = processedText.substring(lastIndex, match.index);
            if (textBefore) {
              nodes.push({ type: 'text', value: textBefore });
            }
          }
          
          // Add the HTML node
          nodes.push({
            type: 'html',
            value: match[0],
          });
          
          lastIndex = match.index + match[0].length;
        }
        
        // Add remaining text
        if (lastIndex < processedText.length) {
          const remainingText = processedText.substring(lastIndex);
          if (remainingText) {
            nodes.push({ type: 'text', value: remainingText });
          }
        }

        // If no HTML was found, just use the processed text
        if (nodes.length === 0) {
          nodes.push({ type: 'text', value: processedText });
        }

        // Replace the text node with the new nodes
        const parentChildren = parent.children as any[];
        parentChildren.splice(index, 1, ...nodes);
      }
    });
  };
}

export const MarkdownMessage = ({ content, className = '' }: MarkdownMessageProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfPage, setPdfPage] = useState<number>(1);
  const [pdfDocumentName, setPdfDocumentName] = useState<string>('Document');
  const containerRef = useRef<HTMLDivElement>(null);
  const handleCitationClickRef = useRef<((filename: string, pageNumber: number) => Promise<void>) | null>(null);

  const handleCitationClick = useCallback(async (filename: string, pageNumber: number) => {
    try {
      // pageNumber is the page_number_footer from the citation
      // We need to convert it to actual_page
      const result = await getDocumentWithSignedUrl(filename, pageNumber, user?.organization_id || null);
      
      if (!result) {
        toast({
          title: 'Document niet gevonden',
          description: `Kon document "${filename}" niet vinden.`,
          variant: 'destructive',
        });
        return;
      }

      setPdfUrl(result.signedUrl);
      // Use actualPage instead of pageNumber
      setPdfPage(result.actualPage);
      setPdfDocumentName(result.document.name);
      setPdfDialogOpen(true);
    } catch (error) {
      console.error('Error loading PDF:', error);
      toast({
        title: 'Fout',
        description: 'Kon PDF niet laden. Probeer het opnieuw.',
        variant: 'destructive',
      });
    }
  }, [user?.organization_id, toast]);

  // Attach click handlers to citation links after render
  // Initialize ref immediately when callback is created
  useEffect(() => {
    handleCitationClickRef.current = handleCitationClick;
  }, [handleCitationClick]);

  // Attach click handlers to citation links after render
  // Use useEffect instead of useLayoutEffect to ensure container is mounted
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Find the citation link - check if target itself is the link, or traverse up
      let citationLink: HTMLElement | null = null;
      
      if (target.classList.contains('citation-page-link')) {
        citationLink = target;
      } else {
        citationLink = target.closest('.citation-page-link') as HTMLElement;
      }
      
      if (citationLink) {
        e.preventDefault();
        e.stopPropagation();
        
        // Get citation data from id attribute (encoded as base64)
        // Note: ReactMarkdown/rehype may add "user-content-" prefix to IDs
        const citationId = citationLink.id;
        let filename: string | null = null;
        let pageNumber: number | null = null;
        
        // Handle both "citation-" and "user-content-citation-" prefixes
        if (citationId && (citationId.startsWith('citation-') || citationId.startsWith('user-content-citation-'))) {
          try {
            // Remove prefix(es) to get the actual encoded data
            const base64Encoded = citationId.replace(/^(user-content-)?citation-/, '');
            // Decode base64: convert URL-safe base64 back to regular base64
            const base64Data = base64Encoded.replace(/-/g, '+').replace(/_/g, '/');
            // Add padding if needed
            const padded = base64Data + '='.repeat((4 - (base64Data.length % 4)) % 4);
            const decoded = decodeURIComponent(escape(atob(padded)));
            const [encodedFilename, pageNumStr] = decoded.split('|');
            // Decode the filename from URI encoding
            filename = decodeURIComponent(encodedFilename);
            pageNumber = parseInt(pageNumStr, 10);
          } catch (error) {
            console.error('Failed to decode citation ID:', error, citationId);
          }
        }
        
        // Fallback: try data attributes if id method fails
        if (!filename || !pageNumber) {
          filename = citationLink.getAttribute('data-citation-filename');
          const pageNumAttr = citationLink.getAttribute('data-citation-page');
          if (pageNumAttr) {
            pageNumber = parseInt(pageNumAttr, 10);
          }
        }
        
        if (filename && pageNumber) {
          // Use the ref if available, otherwise call directly (fallback)
          const handler = handleCitationClickRef.current || handleCitationClick;
          handler(filename, pageNumber);
        } else {
          console.warn('Citation click failed:', { 
            filename, 
            pageNumber, 
            citationId,
            hasRef: !!handleCitationClickRef.current,
            elementClasses: citationLink.className,
            allAttributes: Array.from(citationLink.attributes).map(attr => ({ name: attr.name, value: attr.value }))
          });
        }
      }
    };

    // Use capture phase to ensure we catch clicks before other handlers
    // Event delegation means we don't need to re-attach when content changes
    container.addEventListener('click', handleClick, true);
    
    return () => {
      container.removeEventListener('click', handleClick, true);
    };
  }, [handleCitationClick]); // Include handleCitationClick for fallback, but use ref for actual calls

  return (
    <>
      <div
        ref={containerRef}
        className={`prose prose-base md:prose-sm dark:prose-invert max-w-none 
          prose-headings:text-foreground 
          prose-p:text-foreground/90 
          prose-strong:text-foreground 
          prose-code:text-foreground 
          prose-pre:bg-[#1e1e1e] dark:prose-pre:bg-[#0d1117] 
          prose-pre:border prose-pre:border-border/50
          prose-pre:text-[#d4d4d4] dark:prose-pre:text-[#c9d1d9]
          prose-blockquote:text-foreground/80
          prose-blockquote:border-primary/60 dark:prose-blockquote:border-primary/80
          prose-a:text-primary prose-a:no-underline hover:prose-a:underline
          prose-table:bg-card/50
          prose-th:text-foreground prose-td:text-foreground
          ${className}`}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkCitations]}
          rehypePlugins={[rehypeRaw, [rehypeSanitize, citationSanitizeSchema]]}
          components={{
          // Custom styling for tables
          table: ({ children }) => (
            <div className="overflow-x-auto my-4">
              <table className="min-w-full divide-y divide-border border border-border rounded-lg bg-card/50">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-secondary/80">{children}</thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-border bg-card/30">{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-secondary/30 transition-colors">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="px-4 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wider">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-3 text-sm text-foreground">
              {children}
            </td>
          ),
          // Code blocks with better dark mode support
          code: ({ node, inline, className, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(className || '');
            return !inline && match ? (
              <pre className="bg-[#1e1e1e] dark:bg-[#0d1117] rounded-lg p-4 overflow-x-auto my-4 border border-border/50 shadow-lg">
                <code className={`${className} text-[#d4d4d4] dark:text-[#c9d1d9] font-mono text-sm leading-relaxed`} {...props}>
                  {children}
                </code>
              </pre>
            ) : (
              <code className="bg-secondary/80 dark:bg-secondary/60 text-foreground px-1.5 py-0.5 rounded text-sm font-mono border border-border/30" {...props}>
                {children}
              </code>
            );
          },
          // Lists
          ul: ({ children }) => (
            <ul className="list-disc list-inside space-y-1 my-4 text-foreground marker:text-foreground/60">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside space-y-1 my-4 text-foreground marker:text-foreground/60">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="text-foreground">{children}</li>
          ),
          // Headings
          h1: ({ children }) => (
            <h1 className="text-2xl font-bold text-foreground mt-6 mb-4">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl font-bold text-foreground mt-5 mb-3">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-lg font-semibold text-foreground mt-4 mb-2">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-base font-semibold text-foreground mt-3 mb-2">{children}</h4>
          ),
          // Paragraphs
          p: ({ children }) => (
            <p className="text-base md:text-sm text-foreground/90 mb-3 leading-relaxed">{children}</p>
          ),
          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-primary/60 dark:border-primary/80 bg-secondary/30 dark:bg-secondary/20 pl-4 py-2 italic my-4 text-foreground/80 rounded-r">
              {children}
            </blockquote>
          ),
          // Links
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary/80 hover:underline transition-colors"
            >
              {children}
            </a>
          ),
          // Horizontal rule
          hr: () => <hr className="my-6 border-border/50" />,
          // Strong/Bold
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          // Emphasis/Italic
          em: ({ children }) => (
            <em className="italic text-foreground/90">{children}</em>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
      </div>
      
      <PdfViewerDialog
        open={pdfDialogOpen}
        onOpenChange={(open) => {
          setPdfDialogOpen(open);
          // Reset PDF state when dialog closes to prevent stale state
          if (!open) {
            // Small delay to ensure dialog is fully closed before resetting
            setTimeout(() => {
              setPdfUrl(null);
              setPdfPage(1);
              setPdfDocumentName('Document');
            }, 100);
          }
        }}
        pdfUrl={pdfUrl}
        initialPage={pdfPage}
        documentName={pdfDocumentName}
      />
    </>
  );
};

