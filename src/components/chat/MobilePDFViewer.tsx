'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';

// Dynamically import pdfjs-dist only when needed (mobile)
let pdfjs: any = null;
let pdfjsLoaded = false;

const loadPdfJs = async () => {
  if (pdfjsLoaded) return pdfjs;
  
  try {
    // Import pdfjs-dist dynamically
    pdfjs = await import('pdfjs-dist');
    
    // Configure worker
    if (typeof window !== 'undefined') {
      // Use CDN worker
      pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    }
    
    pdfjsLoaded = true;
    return pdfjs;
  } catch (error) {
    console.error('Failed to load pdfjs-dist:', error);
    throw error;
  }
};

interface MobilePDFViewerProps {
  pdfUrl: string;
  initialPage: number;
}

export function MobilePDFViewer({ pdfUrl, initialPage }: MobilePDFViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState<number>(initialPage);
  const [scale, setScale] = useState<number>(1.0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<any>(null);

  useEffect(() => {
    // Set initial page when prop changes
    if (initialPage > 0) {
      setPageNumber(initialPage);
    }
  }, [initialPage]);

  // Load PDF document
  useEffect(() => {
    let cancelled = false;

    const loadPDF = async () => {
      try {
        setLoading(true);
        setError(null);

        // Load pdfjs-dist
        const pdfjsLib = await loadPdfJs();
        
        if (cancelled) return;

        // Load PDF document
        const loadingTask = pdfjsLib.getDocument({
          url: pdfUrl,
          withCredentials: false,
        });

        const pdf = await loadingTask.promise;
        
        if (cancelled) return;

        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);
        
        // Set to initial page
        if (initialPage > 0 && initialPage <= pdf.numPages) {
          setPageNumber(initialPage);
        }
        
        setLoading(false);
      } catch (err: any) {
        if (!cancelled) {
          console.error('Error loading PDF:', err);
          setError('Kon PDF niet laden. Probeer het opnieuw.');
          setLoading(false);
        }
      }
    };

    loadPDF();

    return () => {
      cancelled = true;
    };
  }, [pdfUrl, initialPage]);

  // Render page
  useEffect(() => {
    if (!pdfDocRef.current || !canvasRef.current || pageNumber <= 0) return;

    const renderPage = async () => {
      try {
        const page = await pdfDocRef.current.getPage(pageNumber);
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        // Calculate viewport
        const viewport = page.getViewport({ scale });
        
        // Set canvas size
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        // Render page
        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        await page.render(renderContext).promise;
      } catch (err) {
        console.error('Error rendering page:', err);
      }
    };

    renderPage();
  }, [pageNumber, scale, pdfDocRef.current]);

  const goToPrevPage = () => {
    if (pageNumber > 1) {
      setPageNumber(pageNumber - 1);
    }
  };

  const goToNextPage = () => {
    if (numPages && pageNumber < numPages) {
      setPageNumber(pageNumber + 1);
    }
  };

  const zoomIn = () => {
    setScale((prev) => Math.min(prev + 0.25, 3.0));
  };

  const zoomOut = () => {
    setScale((prev) => Math.max(prev - 0.25, 0.5));
  };

  return (
    <div 
      ref={containerRef}
      className="flex flex-col h-full w-full"
      onClick={(e) => {
        e.stopPropagation();
      }}
      style={{
        touchAction: 'pan-x pan-y pinch-zoom',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {/* Controls */}
      <div className="flex items-center justify-between gap-2 p-2 border-b bg-secondary/50 flex-shrink-0 flex-wrap">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={goToPrevPage}
            disabled={pageNumber <= 1}
            className="h-8"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-foreground px-2 min-w-[100px] text-center">
            {pageNumber} / {numPages || '...'}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={goToNextPage}
            disabled={!numPages || pageNumber >= numPages}
            className="h-8"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={zoomOut}
            disabled={scale <= 0.5}
            className="h-8"
            title="Uitzoomen"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground px-2 min-w-[60px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={zoomIn}
            disabled={scale >= 3.0}
            className="h-8"
            title="Inzoomen"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* PDF Canvas */}
      <div 
        className="flex-1 overflow-auto bg-[#525252] p-4 min-h-0"
        style={{
          touchAction: 'pan-x pan-y pinch-zoom',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {error && (
          <div className="flex items-center justify-center h-full">
            <div className="text-destructive text-center p-4">
              {error}
            </div>
          </div>
        )}
        
        {loading && !error && (
          <div className="flex items-center justify-center h-full">
            <div className="text-muted-foreground">PDF laden...</div>
          </div>
        )}

        {!loading && !error && (
          <div className="flex justify-center items-center min-h-full">
            <canvas
              ref={canvasRef}
              className="shadow-lg max-w-full"
              style={{
                maxWidth: '100%',
                height: 'auto',
                touchAction: 'manipulation',
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
