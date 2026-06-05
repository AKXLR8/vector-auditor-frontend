import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import { FileText, X, CaretLeft, CaretRight, Spinner } from "@phosphor-icons/react";
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
}

export default function DocumentViewer({ docId, citation, page: initialPage, onClose }: Props) {
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(initialPage);
  const [pageLoaded, setPageLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    setPageNumber(initialPage);
    setPageLoaded(false);
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

  const token = useMemo(() => localStorage.getItem("access_token") || "", []);

  const fileUrl = useMemo(() => ({
    url: `${getApiBaseUrl()}/api/documents/${docId}/pdf`,
    withCredentials: false,
  }), [docId]);

  const options = useMemo(() => ({
    httpHeaders: { Authorization: `Bearer ${token}` },
  }), [token]);

  const onLoadSuccess = useCallback(({ numPages: n }: { numPages: number }) => {
    setNumPages(n);
  }, []);

  const onPageLoadSuccess = useCallback(() => {
    setPageLoaded(true);
  }, []);

  const highlightText = citation.quote;

  const customTextRenderer = useCallback(
    ({ str }: { str: string }) => {
      if (!highlightText) return str;

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
    [highlightText],
  );

  const goToPage = (p: number) => {
    if (p >= 1 && p <= numPages) {
      setPageNumber(p);
      setPageLoaded(false);
    }
  };

  return (
    <aside className="h-full flex flex-col bg-[#000000]/80 backdrop-blur-xl">
      <div className="flex items-center gap-3 px-4 h-14 glass-header shrink-0">
        <FileText size={16} className="text-[#00d2ff]" />
        <span className="text-sm font-medium truncate flex-1">{citation.source}</span>
        {pageNumber > 0 && (
          <span className="text-[11px] text-[#6e7681] font-mono">p. {pageNumber}</span>
        )}
        <button onClick={onClose}
          className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-[#a0a0a8] transition-colors">
          <X size={18} />
        </button>
      </div>

      {citation.quote && (
        <div className="px-4 py-2.5 border-b border-[#2a2a30]/30 bg-gradient-to-r from-[#141416] to-[#141416]/60 shrink-0">
          <p className="text-[11px] text-[#6e7681] mb-0.5 flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-[#00d2ff] inline-block" /> Cited passage
          </p>
          <p className="text-xs text-[#f0f0f0] italic leading-relaxed">
            &ldquo;{citation.quote.slice(0, 200)}{citation.quote.length > 200 ? "..." : ""}&rdquo;
          </p>
        </div>
      )}

      <div ref={containerRef} className="flex-1 overflow-auto bg-[#0a0a0c] relative">
        {width > 0 && (
          <Document
            file={fileUrl}
            options={options}
            onLoadSuccess={onLoadSuccess}
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
                <p className="text-sm text-red-400">Failed to load PDF document.</p>
              </div>
            }
          >
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
          </Document>
        )}
        {!pageLoaded && width > 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0c]/80">
            <div className="flex flex-col items-center gap-3 text-[#6e7681]">
              <Spinner size={24} className="animate-spin" />
              <span className="text-sm">Rendering page {pageNumber}...</span>
            </div>
          </div>
        )}
      </div>

      {numPages > 1 && (
        <div className="flex items-center justify-center gap-3 px-4 py-2.5 border-t border-[#2a2a30]/30 bg-[#141416] shrink-0">
          <button
            onClick={() => goToPage(pageNumber - 1)}
            disabled={pageNumber <= 1}
            className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-[#6e7681] hover:text-[#f0f0f0] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <CaretLeft size={15} />
          </button>
          <span className="text-xs font-mono text-[#a0a0a8]">
            {pageNumber} / {numPages}
          </span>
          <button
            onClick={() => goToPage(pageNumber + 1)}
            disabled={pageNumber >= numPages}
            className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-[#6e7681] hover:text-[#f0f0f0] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <CaretRight size={15} />
          </button>
        </div>
      )}
    </aside>
  );
}
