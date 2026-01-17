'use client';

import { useEffect, useRef } from 'react';

interface PDFViewerContentProps {
  pdfUrl: string;
  initialPage: number;
}

export function PDFViewerContent({ pdfUrl, initialPage }: PDFViewerContentProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // Update iframe src when page or URL changes
    if (iframeRef.current) {
      // Add #page=X to the URL to jump to specific page
      // PDF.js in browser supports this format
      const urlWithPage = initialPage > 1 
        ? `${pdfUrl}#page=${initialPage}`
        : pdfUrl;
      iframeRef.current.src = urlWithPage;
    }
  }, [pdfUrl, initialPage]);

  return (
    <div 
      className="w-full h-full relative"
      style={{ 
        height: '100%', 
        width: '100%',
        position: 'relative',
        minHeight: 0 // Ensure flexbox children can shrink
      }}
      onClick={(e) => {
        // Prevent clicks from bubbling up to parent elements
        e.stopPropagation();
      }}
    >
      <iframe
        ref={iframeRef}
        src={`${pdfUrl}${initialPage > 1 ? `#page=${initialPage}` : ''}`}
        className="w-full h-full border-0"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          minHeight: 0
        }}
        title="PDF Viewer"
        // Allow touch gestures for mobile pinch-to-zoom
        allow="fullscreen"
      />
    </div>
  );
}

