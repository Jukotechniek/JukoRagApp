import { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { visit } from 'unist-util-visit';
import type { Root, Text, Paragraph } from 'mdast';
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

interface CitationInfo {
  filename: string;
  pageNumber: number;
  fullText: string;
  pageNumberIndex?: number; // Position of this page number in the original text
}

// Parse citation patterns like "(Bron: FILENAME.pdf, Pagina: NUMBER)" or variations
// Returns array of citations to handle multiple page numbers
function parseCitations(text: string): Array<{ citation: CitationInfo; pageNumbers: number[] }> {
  const results: Array<{ citation: CitationInfo; pageNumbers: number[] }> = [];
  
  // Pattern to match: Bron: FILENAME.pdf, Pagina: NUMBER1, NUMBER2, NUMBER3, etc.
  // Handles variations with/without parentheses, different spacing
  const pattern = /\(?Bron:\s*([^,)]+\.pdf)\s*[,)]?\s*Pagina:?\s*([\d\s,]+)\)?/gi;
  
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const filename = match[1].trim();
    const pageNumbersStr = match[2].trim();
    
    // Extract all page numbers (can be comma or space separated)
    const pageNumbers = pageNumbersStr
      .split(/[,\s]+/)
      .map(p => parseInt(p.trim(), 10))
      .filter(p => !isNaN(p) && p > 0);
    
    if (filename && pageNumbers.length > 0) {
      results.push({
        citation: {
          filename,
          pageNumber: pageNumbers[0], // First page number for backwards compatibility
          fullText: match[0],
        },
        pageNumbers,
      });
    }
  }
  
  return results;
}

// Custom remark plugin to transform citations
function remarkCitations() {
  return (tree: Root) => {
    visit(tree, 'text', (node: Text, index: number | undefined, parent: Paragraph | undefined) => {
      if (!parent || index === undefined) return;

      const text = node.value;
      const citationResults = parseCitations(text);

      if (citationResults.length > 0) {
        // Process citations in reverse order to maintain correct indices
        const sortedResults = [...citationResults].sort((a, b) => {
          const aIndex = text.indexOf(a.citation.fullText);
          const bIndex = text.indexOf(b.citation.fullText);
          return bIndex - aIndex; // Reverse order
        });

        let processedText = text;

        // Process each citation
        for (const { citation, pageNumbers } of sortedResults) {
          const citationIndex = processedText.indexOf(citation.fullText);
          if (citationIndex === -1) continue;

          // Find "Pagina:" in the citation
          const paginaIndex = citation.fullText.toLowerCase().indexOf('pagina');
          if (paginaIndex === -1) continue;

          // Get the part before "Pagina:"
          const beforePagina = citation.fullText.substring(0, paginaIndex);
          
          // Get the part after "Pagina:" and extract page numbers
          const afterPagina = citation.fullText.substring(paginaIndex);
          const paginaMatch = afterPagina.match(/pagina:?\s*(.+)/i);
          if (!paginaMatch) continue;

          const pageNumbersPart = paginaMatch[1].trim();
          
          // Replace each page number with a clickable link
          let replacedPageNumbers = pageNumbersPart;
          for (const pageNum of pageNumbers) {
            const pageNumStr = pageNum.toString();
            // Replace the page number with a link, but only if it's a whole word/number
            replacedPageNumbers = replacedPageNumbers.replace(
              new RegExp(`\\b${pageNumStr}\\b`, 'g'),
              `<span data-citation-filename="${citation.filename}" data-citation-page="${pageNum}" class="citation-page-link text-red-600 dark:text-red-400 cursor-pointer hover:underline font-medium">${pageNumStr}</span>`
            );
          }

          // Rebuild the citation
          const newCitation = beforePagina + 'Pagina: ' + replacedPageNumbers;
          
          // Replace in processedText
          processedText = processedText.substring(0, citationIndex) + 
                          newCitation + 
                          processedText.substring(citationIndex + citation.fullText.length);
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
  const [loadingPdf, setLoadingPdf] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleCitationClick = useCallback(async (filename: string, pageNumber: number) => {
    setLoadingPdf(true);
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
        setLoadingPdf(false);
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
    } finally {
      setLoadingPdf(false);
    }
  }, [user?.organization_id, toast]);

  // Attach click handlers to citation links after render
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const citationLink = target.closest('.citation-page-link');
      
      if (citationLink) {
        e.preventDefault();
        e.stopPropagation();
        const filename = citationLink.getAttribute('data-citation-filename');
        const pageNumber = citationLink.getAttribute('data-citation-page');
        
        if (filename && pageNumber) {
          handleCitationClick(filename, parseInt(pageNumber, 10));
        }
      }
    };

    container.addEventListener('click', handleClick);
    
    return () => {
      container.removeEventListener('click', handleClick);
    };
  }, [handleCitationClick, content]);

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
          rehypePlugins={[rehypeRaw]}
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
        onOpenChange={setPdfDialogOpen}
        pdfUrl={pdfUrl}
        initialPage={pdfPage}
        documentName={pdfDocumentName}
      />
    </>
  );
};

