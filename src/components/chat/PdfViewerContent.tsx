'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import PDF.js only for mobile
const MobilePDFViewer = dynamic<{ pdfUrl: string; initialPage: number }>(
  () => import('./MobilePDFViewer').then((mod) => ({ default: mod.MobilePDFViewer })),
  { 
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">PDF viewer laden...</div>
      </div>
    )
  }
);

interface PDFViewerContentProps {
  pdfUrl: string;
  initialPage: number;
}

export function PDFViewerContent({ pdfUrl, initialPage }: PDFViewerContentProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Detect mobile
    const checkMobile = () => {
      const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || 
                     window.innerWidth < 768;
      setIsMobile(mobile);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Build URL with page parameter for desktop
  const pdfUrlWithPage = initialPage > 1 
    ? `${pdfUrl}#page=${initialPage}`
    : pdfUrl;

  // Mobile: use pdfjs-dist viewer
  if (isMobile) {
    return (
      <div 
        className="w-full h-full relative"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <MobilePDFViewer pdfUrl={pdfUrl} initialPage={initialPage} />
      </div>
    );
  }

  // Desktop: use iframe (works perfectly)
  return (
    <div 
      className="w-full h-full relative"
      style={{ 
        height: '100%', 
        width: '100%',
        position: 'relative',
        minHeight: 0,
        touchAction: 'none',
      }}
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      <iframe
        ref={iframeRef}
        key={pdfUrlWithPage}
        src={pdfUrlWithPage}
        className="w-full h-full border-0"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          minHeight: 0,
          touchAction: 'manipulation',
        }}
        title="PDF Viewer"
        allow="fullscreen"
      />
    </div>
  );
}

