import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import { FileText, X, CaretLeft, CaretRight, Spinner } from "@phosphor-icons/react";
import { getDocument } from "../api/documents";
import { getApiBaseUrl } from "../api/config";
import type { Citation } from "../types";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

interface Props {
  docId: string;
  citation: Citation;
  page: number;
  onClose: () => void;
  cloudinaryUrl?: string;
}

export default function DocumentViewer({ docId, citation, page: initialPage, onClose, cloudinaryUrl }: Props) {
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(initialPage);
  const [pageLoaded, setPageLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [pdfUrl, setPdfUrl] = useState<string | null>(cloudinaryUrl || null);
  const [resolving, setResolving] = useState(true);
  const [viewerMode, setViewerMode] = useState<"react-pdf" | "iframe" | "none">("react-pdf");
  const pageViewport = useRef<{ width: number; height: number } | null>(null);
  const pageWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPageNumber(initialPage);
    setPageLoaded(false);
    pageViewport.current = null;
  }, [initialPage, docId]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function resolveUrl() {
      setResolving(true);

      if (cloudinaryUrl) {
        if (!cancelled) {
          setPdfUrl(cloudinaryUrl);
          setResolving(false);
        }
        return;
      }

      try {
        const doc = await getDocument(docId);
        if (!cancelled && doc.cloudinary_url) {
          setPdfUrl(doc.cloudinary_url);
          setResolving(false);
          return;
        }
      } catch {
        /* doc fetch failed — fall through to proxy fallback */
      }

      if (!cancelled) {
        const fallback = `${getApiBaseUrl()}/documents/${docId}/pdf`;
        setPdfUrl(fallback);
        setResolving(false);
      }
    }

    resolveUrl();
    return () => { cancelled = true; };
  }, [cloudinaryUrl, docId]);

  const onLoadSuccess = useCallback(({ numPages: n }: { numPages: number }) => {
    setNumPages(n);
  }, []);

  const onPageLoadSuccess = useCallback((page: any) => {
    const vp = page.getViewport({ scale: 1 });
    pageViewport.current = { width: vp.width, height: vp.height };
    setPageLoaded(true);
  }, []);

  const useBboxHighlight = citation.bboxes && citation.bboxes.length > 0;

  const highlights = useMemo(() => {
    if (!useBboxHighlight || !pageViewport.current || !width) return [];
    const { width: ptW, height: ptH } = pageViewport.current;
    const renderedH = width * (ptH / ptW);
    const scaleX = width / ptW;
    const scaleY = renderedH / ptH;
    return citation.bboxes!.map(([x0, y0, x1, y1]) => ({
      left: x0 * scaleX,
      top: y0 * scaleY,
      width: (x1 - x0) * scaleX,
      height: (y1 - y0) * scaleY,
    }));
  }, [citation.bboxes, useBboxHighlight, width]);

  const highlightText = citation.quote;

  const customTextRenderer = useCallback(
    ({ str }: { str: string }) => {
      if (useBboxHighlight || !highlightText) return str;

      const lower = str.toLowerCase();
      const search = highlightText.toLowerCase();
      const pos = lower.indexOf(search);

      if (pos >= 0) {
        const before = str.slice(0, pos);
        const match = str.slice(pos, pos + search.length);
        const after = str.slice(pos + search.length);
        return `${before}<mark class="pdf-highlight">${match}</mark>${after}`;
      }

      const normStr = str.replace(/\s+/g, " ").trim();
      const normQuote = highlightText.replace(/\s+/g, " ").trim();
      if (
        normStr.length > 3 &&
        (normQuote.includes(normStr) || normStr.includes(normQuote))
      ) {
        return `<mark class="pdf-highlight">${str}</mark>`;
      }

      return str;
    },
    [highlightText, useBboxHighlight],
  );

  const goToPage = (p: number) => {
    if (p >= 1 && p <= numPages) {
      setPageNumber(p);
      setPageLoaded(false);
      pageViewport.current = null;
    }
  };

  const renderOverlay = useMemo(() => {
    if (highlights.length === 0) return null;
    return (
      <div className="absolute inset-0 pointer-events-none z-10">
        {highlights.map((h, i) => (
          <mark
            key={i}
            className="pdf-highlight"
            style={{
              position: "absolute",
              left: h.left,
              top: h.top,
              width: h.width,
              height: h.height,
            }}
          />
        ))}
      </div>
    );
  }, [highlights]);

  return (
    <>
      {/* Backdrop — tappable to close on mobile */}
      <div
        className="fixed inset-0 bg-black/60 z-30 md:hidden"
        onClick={onClose}
      />

      <aside
        className="
          fixed md:relative inset-x-0 bottom-0 md:inset-auto z-40
          md:z-auto h-[85vh] md:h-full flex flex-col
          bg-[#0a0a0c] md:bg-[#000000]/80 md:backdrop-blur-xl
          rounded-t-2xl md:rounded-none
          shadow-2xl
          animate-slide-up
        "
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-3 md:px-4 h-14 shrink-0 border-b border-white/[0.06] bg-[#0a0a0c] md:bg-transparent">
          <button
            onClick={onClose}
            className="w-10 h-10 md:w-8 md:h-8 rounded-xl md:rounded-lg hover:bg-white/10 flex items-center justify-center text-[#a0a0a8] transition-colors active:scale-95"
            aria-label="Close PDF viewer"
          >
            <X size={20} />
          </button>

          <div className="flex items-center gap-2 min-w-0 flex-1">
            <FileText size={15} className="text-[#00d2ff] shrink-0" />
            <span className="text-sm font-medium text-white/90 truncate">{citation.source}</span>
          </div>

          {pageNumber > 0 && viewerMode === "react-pdf" && (
            <span className="text-[11px] text-[#6e7681] font-mono shrink-0 mr-1">
              p. {pageNumber}
            </span>
          )}
        </div>

        {/* Cited passage — collapsible preview */}
        {citation.quote && (
          <div className="px-3 md:px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02] shrink-0">
            <p className="text-[10px] text-[#6e7681] mb-1 tracking-wider uppercase flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-[#00d2ff] inline-block" />
              Cited
            </p>
            <p className="text-xs text-white/70 leading-relaxed line-clamp-2">
              &ldquo;{citation.quote.slice(0, 160)}{citation.quote.length > 160 ? "..." : ""}&rdquo;
            </p>
          </div>
        )}

        {/* PDF area */}
        <div ref={containerRef} className="flex-1 overflow-auto bg-[#050808] relative">
          {resolving && (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3 text-[#6e7681]">
                <Spinner size={24} className="animate-spin" />
                <span className="text-sm">Loading document...</span>
              </div>
            </div>
          )}

          {!resolving && !pdfUrl && (
            <div className="flex items-center justify-center h-full p-8">
              <div className="text-center">
                <p className="text-sm text-red-400 mb-2">PDF URL not available for this document.</p>
                <p className="text-xs text-[#6e7681]">The document may not have been uploaded to cloud storage.</p>
              </div>
            </div>
          )}

          {!resolving && pdfUrl && viewerMode === "react-pdf" && width > 0 && (
            <Document
              file={pdfUrl}
              onLoadSuccess={onLoadSuccess}
              onLoadError={() => setViewerMode("iframe")}
              loading={
                <div className="flex items-center justify-center h-full">
                  <div className="flex flex-col items-center gap-3 text-[#6e7681]">
                    <Spinner size={24} className="animate-spin" />
                    <span className="text-sm">Loading document...</span>
                  </div>
                </div>
              }
              error={
                <div className="flex items-center justify-center h-full p-8">
                  <div className="text-center">
                    <p className="text-sm text-red-400 mb-3">Failed to load PDF viewer.</p>
                    <button
                      onClick={() => setViewerMode("iframe")}
                      className="text-xs text-[#3B82F6] hover:underline"
                    >
                      Try alternative viewer
                    </button>
                  </div>
                </div>
              }
            >
              <div ref={pageWrapperRef} className="relative inline-block mx-auto">
                <Page
                  pageNumber={pageNumber}
                  width={width}
                  onLoadSuccess={onPageLoadSuccess}
                  customTextRenderer={customTextRenderer}
                  loading={
                    <div className="flex items-center justify-center py-20">
                      <Spinner size={20} className="animate-spin text-[#6e7681]" />
                    </div>
                  }
                />
                {pageLoaded && renderOverlay}
              </div>
            </Document>
          )}

          {!resolving && pdfUrl && viewerMode === "iframe" && (
            <iframe
              src={pdfUrl}
              className="w-full h-full border-0"
              title={citation.source}
            />
          )}

          {!pageLoaded && viewerMode === "react-pdf" && !resolving && pdfUrl && width > 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#050808]/80 pointer-events-none">
              <div className="flex flex-col items-center gap-3 text-[#6e7681]">
                <Spinner size={24} className="animate-spin" />
                <span className="text-sm">Rendering page {pageNumber}...</span>
              </div>
            </div>
          )}
        </div>

        {/* Page nav */}
        {numPages > 1 && viewerMode === "react-pdf" && (
          <div className="flex items-center justify-center gap-3 px-4 py-3 border-t border-white/[0.06] bg-[#0a0a0c] shrink-0">
            <button
              onClick={() => goToPage(pageNumber - 1)}
              disabled={pageNumber <= 1}
              className="w-9 h-9 md:w-7 md:h-7 rounded-xl md:rounded-lg hover:bg-white/10 flex items-center justify-center text-[#6e7681] hover:text-[#f0f0f0] disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95"
            >
              <CaretLeft size={16} />
            </button>
            <span className="text-xs font-mono text-[#a0a0a8] min-w-[60px] text-center tabular-nums">
              {pageNumber} / {numPages}
            </span>
            <button
              onClick={() => goToPage(pageNumber + 1)}
              disabled={pageNumber >= numPages}
              className="w-9 h-9 md:w-7 md:h-7 rounded-xl md:rounded-lg hover:bg-white/10 flex items-center justify-center text-[#6e7681] hover:text-[#f0f0f0] disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95"
            >
              <CaretRight size={16} />
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
