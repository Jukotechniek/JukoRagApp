'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, X, ExternalLink, Maximize2, Minimize2 } from 'lucide-react';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Reset state when dialog opens
  useEffect(() => {
    if (open && pdfUrl) {
      setLoading(true);
      setError(null);
      setIframeKey(prev => prev + 1); // Force iframe reload
      
      // Small delay to ensure iframe is ready
      setTimeout(() => {
        setLoading(false);
      }, 500);
    }
  }, [open, pdfUrl, initialPage]);

  const handleIframeLoad = () => {
    setLoading(false);
    setError(null);
  };

  const handleIframeError = () => {
    setLoading(false);
    setError('Kon PDF niet laden. Het bestand is mogelijk niet toegankelijk of beschadigd.');
  };

  const handleOpenInNewTab = () => {
    if (pdfUrl) {
      const urlWithPage = initialPage > 1 
        ? `${pdfUrl}#page=${initialPage}`
        : pdfUrl;
      window.open(urlWithPage, '_blank', 'noopener,noreferrer');
    }
  };

  const handleToggleFullscreen = () => {
    const dialogElement = document.querySelector('[data-pdf-dialog]') as HTMLElement;
    if (!dialogElement) return;

    if (!isFullscreen) {
      // Enter fullscreen
      if (dialogElement.requestFullscreen) {
        dialogElement.requestFullscreen();
      } else if ((dialogElement as any).webkitRequestFullscreen) {
        (dialogElement as any).webkitRequestFullscreen();
      } else if ((dialogElement as any).msRequestFullscreen) {
        (dialogElement as any).msRequestFullscreen();
      }
      setIsFullscreen(true);
    } else {
      // Exit fullscreen
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      } else if ((document as any).msExitFullscreen) {
        (document as any).msExitFullscreen();
      }
      setIsFullscreen(false);
    }
  };

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange);
    };
  }, []);

  if (!pdfUrl) {
    return null;
  }

  const urlWithPage = initialPage > 1 
    ? `${pdfUrl}#page=${initialPage}`
    : pdfUrl;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-pdf-dialog
        className="max-w-6xl w-full h-[90vh] flex flex-col p-0 [&>button[class*='right-4'][class*='top-4']]:hidden"
        aria-describedby="pdf-viewer-description"
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="text-lg font-semibold flex-1">
              {documentName}
              {initialPage > 1 && (
                <span className="ml-2 text-sm text-muted-foreground font-normal">
                  (Pagina {initialPage})
                </span>
              )}
            </DialogTitle>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleOpenInNewTab}
                className="text-xs"
              >
                <ExternalLink className="h-4 w-4 mr-1" />
                Openen in nieuw tabblad
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleToggleFullscreen}
                className="h-8 w-8"
                title={isFullscreen ? 'Volledig scherm afsluiten' : 'Volledig scherm'}
              >
                {isFullscreen ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                className="h-8 w-8"
                title="Sluiten"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden bg-secondary/20 relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
              <div className="flex flex-col items-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground mt-2">PDF laden...</span>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
              <div className="text-center p-4">
                <p className="text-destructive mb-2">{error}</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Controleer de browser console voor meer details
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenInNewTab}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Probeer in nieuw tabblad
                </Button>
              </div>
            </div>
          )}

          <iframe
            key={iframeKey}
            src={urlWithPage}
            className="w-full h-full border-0"
            title={`PDF Viewer: ${documentName}`}
            onLoad={handleIframeLoad}
            onError={handleIframeError}
            style={{ minHeight: '600px' }}
          />
        </div>

        <div id="pdf-viewer-description" className="sr-only">
          PDF viewer voor {documentName}
        </div>
      </DialogContent>
    </Dialog>
  );
}
