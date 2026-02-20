"use client";

import React, { useEffect, useRef, useState } from "react";

const PDFJS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379";
const PDF_SCRIPT_URL = `${PDFJS_CDN}/pdf.min.mjs`;
const PDF_WORKER_URL = `${PDFJS_CDN}/pdf.worker.min.mjs`;

type PdfViewerScrollableProps = {
  pdfUrl: string;
  /** When set to a page number (1-based), the container scrolls to show that page. */
  scrollToPage: number | null;
  className?: string;
};

let pdfjsLibPromise: Promise<{
  getDocument: (params: { url: string }) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<unknown> }> };
}> | null = null;

/** Load PDF.js from CDN at runtime (no npm package). */
function loadPdfJs(): Promise<{
  getDocument: (params: { url: string }) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<unknown> }> };
}> {
  if (pdfjsLibPromise) return pdfjsLibPromise;
  pdfjsLibPromise = (async () => {
    const lib = await import(/* webpackIgnore: true */ PDF_SCRIPT_URL) as {
      GlobalWorkerOptions: { workerSrc: string };
      getDocument: (params: { url: string }) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<unknown> }> };
    };
    lib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
    return lib;
  })();
  return pdfjsLibPromise;
}

export function PdfViewerScrollable({
  pdfUrl,
  scrollToPage,
  className = "",
}: PdfViewerScrollableProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [numPages, setNumPages] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pdfUrl) return;
    setLoading(true);
    setError(null);
    setNumPages(null);
    let cancelled = false;

    loadPdfJs()
      .then((pdfjsLib) => {
        if (cancelled) return;
        return pdfjsLib.getDocument({ url: pdfUrl }).promise;
      })
      .then((pdf) => {
        if (cancelled || !pdf) return;
        return pdf.numPages;
      })
      .then((n) => {
        if (!cancelled && n != null) setNumPages(n);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load PDF");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pdfUrl]);

  useEffect(() => {
    if (scrollToPage == null || scrollToPage < 1) return;
    const el = pageRefs.current.get(scrollToPage);
    if (el && containerRef.current) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [scrollToPage]);

  const setPageRef = (pageNum: number) => (el: HTMLDivElement | null) => {
    if (el) pageRefs.current.set(pageNum, el);
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-slate-100 ${className}`}>
        <p className="text-slate-600">Loading PDF…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 bg-slate-100 p-4 ${className}`}>
        <p className="text-red-600">{error}</p>
        <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
          Open PDF in new tab
        </a>
      </div>
    );
  }

  if (numPages == null || numPages < 1) {
    return (
      <div className={`flex items-center justify-center bg-slate-100 ${className}`}>
        <p className="text-slate-600">No pages</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`overflow-y-auto bg-slate-200 ${className}`}
      style={{ height: "100%" }}
    >
      {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
        <PdfPage
          key={pageNum}
          pdfUrl={pdfUrl}
          pageNumber={pageNum}
          setRef={setPageRef(pageNum)}
        />
      ))}
    </div>
  );
}

function PdfPage({
  pdfUrl,
  pageNumber,
  setRef,
}: {
  pdfUrl: string;
  pageNumber: number;
  setRef: (el: HTMLDivElement | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scale = 1.5;

  useEffect(() => {
    if (!pdfUrl || !canvasRef.current) return;
    let cancelled = false;

    loadPdfJs()
      .then((pdfjsLib) => pdfjsLib.getDocument({ url: pdfUrl }).promise)
      .then((pdf) => {
        if (cancelled) return null;
        return pdf.getPage(pageNumber);
      })
      .then(async (page) => {
        if (!page || cancelled || !canvasRef.current) return;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        await page.render({ canvasContext: ctx, viewport }).promise;
      })
      .catch(() => {
        // ignore
      });

    return () => {
      cancelled = true;
    };
  }, [pdfUrl, pageNumber]);

  return (
    <div ref={setRef} className="flex justify-center bg-white shadow-sm" data-page-number={pageNumber}>
      <canvas ref={canvasRef} className="max-w-full" />
    </div>
  );
}
