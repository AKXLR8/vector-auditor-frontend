import { useEffect } from "react";
import { X, Quotes, ArrowSquareOut, FileText } from "@phosphor-icons/react";
import type { Citation } from "../types";

interface Props {
  url: string;
  citation: Citation;
  onClose: () => void;
}

export default function PdfViewer({ url, citation, onClose }: Props) {
  const page = citation.page && citation.page > 0 ? citation.page : undefined;
  const viewUrl = page ? `${url}#page=${page}` : url;

  useEffect(() => {
    window.open(viewUrl, "_blank");
  }, [viewUrl]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-[#141416] border border-[#2a2a30] rounded-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 h-14 border-b border-[#2a2a30]">
          <FileText size={18} className="text-[#00d2ff] shrink-0" />
          <span className="text-sm font-medium text-[#f0f0f0] flex-1 truncate">
            Document viewer
          </span>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-[#1a1a1e] flex items-center justify-center text-[#a0a0a8] transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-4 py-4 space-y-3">
          <div>
            <p className="text-xs text-[#a0a0a8] mb-1">Source</p>
            <p className="text-sm text-[#00d2ff]">{citation.source}</p>
          </div>
          <div>
            <p className="text-xs text-[#a0a0a8] mb-1">Quotes</p>
            <p className="text-sm text-[#f0f0f0] italic leading-relaxed">&ldquo;{citation.quote}&rdquo;</p>
          </div>
          <div>
            <p className="text-xs text-[#a0a0a8] mb-1">Location</p>
            <p className="text-sm text-[#f0f0f0]">{citation.location}</p>
          </div>

          <a
            href={viewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2.5 bg-[#00d2ff] text-black rounded-lg text-sm font-semibold hover:bg-[#A4F4FD] transition-colors"
          >
            <ArrowSquareOut size={16} /> Open PDF{page ? ` (page ${page})` : ""}
          </a>
        </div>
      </div>
    </div>
  );
}
