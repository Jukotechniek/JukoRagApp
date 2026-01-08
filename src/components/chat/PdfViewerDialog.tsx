'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, ExternalLink } from 'lucide-react';

// Dynamically import PDF viewer to avoid SSR issues
const PDFViewer = dynamic<{ pdfUrl: string; initialPage: number }>(
  () => import('./PdfViewerContent').then((mod) => ({ default: mod.PDFViewerContent })),
  { 
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">PDF viewer laden...</div>
      </div>
    )
  }
);

interface PdfViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pdfUrl: string | null;
  initialPage?: number; // 1-based page number
  documentName?: string;
}

export function PdfViewerDialog({
  open,
  onOpenChange,
  pdfUrl,
  initialPage = 1,
  documentName = 'Document',
}: PdfViewerDialogProps) {
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);


  const handleOpenInNewTab = () => {
    if (pdfUrl) {
      const urlWithPage = initialPage > 1 
        ? `${pdfUrl}#page=${initialPage}`
        : pdfUrl;
      window.open(urlWithPage, '_blank', 'noopener,noreferrer');
    }
  };

  if (!pdfUrl) {
    return null;
  }

  // Lock body scroll when dialog opens on mobile
  useEffect(() => {
    if (open && isMobile) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [open, isMobile]);

  return (
    <Dialog 
      open={open} 
      onOpenChange={(newOpen) => {
        onOpenChange(newOpen);
        // Ensure body scroll is unlocked when dialog closes
        if (!newOpen) {
          document.body.style.overflow = '';
          // Force a small reflow to ensure layout is restored
          requestAnimationFrame(() => {
            window.scrollTo(0, window.scrollY);
          });
        }
      }}
    >
      <DialogContent
        data-pdf-dialog
        className={`
          ${isMobile 
            ? 'fixed inset-0 w-full h-full max-w-none translate-x-0 translate-y-0 rounded-none m-0' 
            : 'max-w-6xl w-full h-[90vh] max-h-[90vh]'
          }
          flex flex-col p-0 [&>button[class*='right-4'][class*='top-4']]:hidden
          z-[100]
        `}
        aria-describedby="pdf-viewer-description"
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          onOpenChange(false);
        }}
        onPointerDownOutside={(e) => {
          // Prevent closing on mobile when clicking outside (can interfere with PDF viewer)
          if (isMobile) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader className="px-3 sm:px-6 pt-3 sm:pt-6 pb-2 sm:pb-4 border-b flex-shrink-0 bg-background sticky top-0 z-10">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-sm sm:text-lg font-semibold flex-1 truncate min-w-0 pr-2">
              <span className="truncate block">{documentName}</span>
              {initialPage > 1 && (
                <span className="ml-1 sm:ml-2 text-xs sm:text-sm text-muted-foreground font-normal block sm:inline">
                  (Pagina {initialPage})
                </span>
              )}
            </DialogTitle>
            <div className="flex items-center gap-1 sm:gap-3 flex-shrink-0">
              {isMobile ? (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleOpenInNewTab}
                  className="h-8 w-8 sm:h-9 sm:w-9"
                  title="Openen in browser"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleOpenInNewTab}
                  className="text-xs"
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Openen in nieuw tabblad
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                className="h-8 w-8 sm:h-9 sm:w-9"
                title="Sluiten"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className={`flex-1 bg-secondary/20 relative w-full overflow-hidden ${isMobile ? 'min-h-0' : ''}`}>
          <PDFViewer pdfUrl={pdfUrl} initialPage={initialPage} />
        </div>

        <div id="pdf-viewer-description" className="sr-only">
          PDF viewer voor {documentName}
        </div>
      </DialogContent>
    </Dialog>
  );
}
