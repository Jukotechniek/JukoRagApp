'use client';

import { Viewer, Worker } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';

// Import CSS for react-pdf-viewer
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';

interface PDFViewerContentProps {
  pdfUrl: string;
  initialPage: number;
}

export function PDFViewerContent({ pdfUrl, initialPage }: PDFViewerContentProps) {
  // Configure the default layout plugin
  const defaultLayoutPluginInstance = defaultLayoutPlugin({
    sidebarTabs: (defaultTabs) => [
      defaultTabs[0], // Thumbnail tab
      defaultTabs[1], // Bookmark tab
    ],
  });

  return (
    <Worker workerUrl="https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.js">
      <div 
        style={{ height: '100%', width: '100%', position: 'relative' }}
        onClick={(e) => {
          // Prevent clicks from bubbling up to parent elements
          // This ensures PDF viewer interactions don't interfere with chat
          e.stopPropagation();
        }}
      >
        <Viewer
          fileUrl={pdfUrl}
          plugins={[defaultLayoutPluginInstance]}
          initialPage={initialPage - 1} // react-pdf-viewer uses 0-based indexing
        />
      </div>
    </Worker>
  );
}

