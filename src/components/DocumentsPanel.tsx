import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import {
  X, FileText, Plus, Trash, FolderPlus,
  CaretDown, CaretRight, Upload, CheckCircle,
} from "@phosphor-icons/react";
import type { Document, DocGroup } from "../types";
import { deleteDocument } from "../api/documents";
import { errorMessage } from "../lib/errors";

interface Props {
  docs: Document[];
  groups: DocGroup[];
  onGroupsChange: (groups: DocGroup[]) => void;
  onDocsDeleted: (ids: string[]) => void;
  onClose: () => void;
  onUpload: (files: FileList | null) => void;
  onRefresh: () => Promise<void> | void;
  uploadProgress: Record<string, { stage: string; progress: number; error?: string }>;
  uploading: boolean;
}

const STAGE_LABELS: Record<string, string> = {
  queued: "Queued",
  cloudinary: "Uploading to cloud",
  parsing: "Parsing document",
  indexing: "Indexing vectors",
  saving: "Saving metadata",
  completed: "Completed",
  failed: "Failed",
  duplicate: "Already in library",
  skipped: "Skipped",
  stuck: "Taking longer than expected",
};

type DocStatusKey = "ready" | "processing" | "failed" | "unknown";
function docStatusKey(doc: { status?: string | null }): DocStatusKey {
  const s = (doc.status || "").toLowerCase();
  if (s === "success" || s === "ready" || s === "completed" || s === "indexed") return "ready";
  if (s === "processing" || s === "queued" || s === "parsing" || s === "indexing" || s === "uploading") return "processing";
  if (s === "failed" || s === "error") return "failed";
  return "unknown";
}

const DOC_STATUS_PILL: Record<DocStatusKey, { label: string; cls: string }> = {
  ready: { label: "Ready", cls: "bg-green-500/15 text-green-400" },
  processing: { label: "Processing", cls: "bg-blue-500/15 text-blue-400" },
  failed: { label: "Failed", cls: "bg-red-500/15 text-red-400" },
  unknown: { label: "Pending", cls: "bg-white/5 text-[#9DAFAC]" },
};

function docDisplayName(doc: { filename?: string | null; document_id?: string; id?: string }): string {
  const f = (doc.filename || "").trim();
  if (f) return f;
  const id = (doc.document_id ?? doc.id ?? "?").toString();
  return `Untitled (${id.slice(0, 8)})`;
}

function docExt(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i >= 0 && i < filename.length - 1 ? filename.slice(i + 1).toLowerCase() : "";
}

export default function DocumentsPanel({ docs, groups, onGroupsChange, onDocsDeleted, onClose, onUpload, onRefresh, uploadProgress, uploading }: Props) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [newGroupName, setNewGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [confirmDeleteDocs, setConfirmDeleteDocs] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const toggleGroup = (id: string) => {
    setExpandedGroups((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const createGroup = () => {
    const name = newGroupName.trim();
    if (!name) return;
    const id = crypto.randomUUID();
    onGroupsChange([...groups, { id, name, documentIds: [] }]);
    setNewGroupName("");
    setCreatingGroup(false);
    setExpandedGroups((p) => new Set(p).add(id));
  };

  const deleteGroup = (id: string) => {
    onGroupsChange(groups.filter((g) => g.id !== id));
  };

  const startRename = (g: DocGroup) => {
    setEditingGroup(g.id);
    setEditName(g.name);
  };

  const finishRename = (id: string) => {
    if (editName.trim()) {
      onGroupsChange(groups.map((g) => g.id === id ? { ...g, name: editName.trim() } : g));
    }
    setEditingGroup(null);
  };

  const addDocsToGroup = (groupId: string) => {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    const existing = new Set(group.documentIds);
    const toAdd = Array.from(selectedDocs).filter((id) => !existing.has(id));
    if (toAdd.length === 0) return;
    onGroupsChange(groups.map((g) => g.id === groupId ? { ...g, documentIds: [...g.documentIds, ...toAdd] } : g));
    setSelectedDocs(new Set());
  };

  const removeDocFromGroup = (groupId: string, docId: string) => {
    onGroupsChange(groups.map((g) => g.id === groupId ? { ...g, documentIds: g.documentIds.filter((d) => d !== docId) } : g));
  };

  const addDocToGroup = (groupId: string, docId: string) => {
    const group = groups.find((g) => g.id === groupId);
    if (!group || group.documentIds.includes(docId)) return;
    onGroupsChange(groups.map((g) => g.id === groupId ? { ...g, documentIds: [...g.documentIds, docId] } : g));
  };

  const handleDragStart = (e: React.DragEvent, docId: string) => {
    e.dataTransfer.setData("text/plain", docId);
    e.dataTransfer.effectAllowed = "move";
  };

  const deleteSelectedDocs = async () => {
    setDeleting(true);
    const ids = Array.from(selectedDocs);
    const results = await Promise.allSettled(ids.map((id) => deleteDocument(id)));
    const succeeded = ids.filter((_, i) => results[i].status === "fulfilled");
    const notFound = ids.filter((_, i) => results[i].status === "rejected" && (results[i] as PromiseRejectedResult).reason?.response?.status === 404);
    const realFailures = results.filter((r) => r.status === "rejected" && (r as PromiseRejectedResult).reason?.response?.status !== 404);
    setSelectedDocs(new Set());
    onGroupsChange(groups.map((g) => ({ ...g, documentIds: g.documentIds.filter((d) => !succeeded.includes(d) && !notFound.includes(d)) })));
    onDocsDeleted([...succeeded, ...notFound]);
    await onRefresh();
    if (succeeded.length > 0) {
      toast.success(`${succeeded.length} document${succeeded.length > 1 ? "s" : ""} deleted`);
    }
    if (notFound.length > 0 && succeeded.length === 0) {
      toast("Already removed", { icon: "🗑️", duration: 2000 });
    }
    if (realFailures.length > 0) {
      const reason = (realFailures[0] as PromiseRejectedResult).reason;
      toast.error(errorMessage(reason, "Some deletes failed"));
    }
    setDeleting(false);
    setConfirmDeleteDocs(false);
  };

  const toggleDocSelect = (id: string) => {
    setSelectedDocs((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const getDocById = (id: string) => docs.find((d) => (d.document_id ?? d.id) === id);

  return (
    <aside className="h-full flex flex-col bg-[#070E0D]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-[#102321]/50 shrink-0">
        <FileText size={16} className="text-[#00E6CF]" />
        <span className="text-sm font-medium text-white flex-1">Documents</span>
        <span className="text-[11px] text-[#9DAFAC] font-mono">{docs.length}</span>
        <button onClick={onClose}
          className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-[#9DAFAC] transition-colors">
          <X size={18} />
        </button>
      </div>

      {/* Upload progress */}
      {Object.keys(uploadProgress).length > 0 && (
        <div className="px-4 py-2 border-b border-[#102321]/30 space-y-1.5 shrink-0">
          {Object.entries(uploadProgress).map(([uid, prog]) => (
            <div key={uid} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#9DAFAC]">{STAGE_LABELS[prog.stage] || prog.stage}</span>
                <span className="text-[#9DAFAC] font-mono">{prog.progress}%</span>
              </div>
              <div className="w-full h-1 rounded-full bg-[#102321] overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${prog.progress}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className={`h-full rounded-full ${prog.stage === "failed" ? "bg-red-500" : prog.stage === "completed" ? "bg-green-500" : "bg-gradient-to-r from-[#00E6CF] to-[#00332E]"}`}
                />
              </div>
              {prog.error && <p className="text-[10px] text-red-400">{prog.error}</p>}
              {prog.stage === "completed" && (
                <p className="text-[10px] text-green-400 flex items-center gap-1"><CheckCircle size={10} /> Ready</p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* Create group */}
        <div className="px-4 pt-3 pb-2">
          {creatingGroup ? (
            <div className="flex items-center gap-2">
              <input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createGroup()}
                placeholder="Group name..."
                className="flex-1 bg-[#0A1514] border border-[#102321] rounded-lg px-3 py-1.5 text-sm text-white placeholder-[#9DAFAC]/60 outline-none focus:border-[#00E6CF]/30"
                autoFocus
              />
              <button onClick={createGroup}
                className="px-2.5 py-1.5 rounded-lg bg-[#00E6CF]/10 text-[#00E6CF] text-xs font-medium hover:bg-[#00E6CF]/20 transition-colors shrink-0">
                Save
              </button>
              <button onClick={() => { setCreatingGroup(false); setNewGroupName(""); }}
                className="px-2.5 py-1.5 rounded-lg text-[#9DAFAC] text-xs hover:bg-white/5 transition-colors shrink-0">
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setCreatingGroup(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[#102321] w-full text-sm text-[#9DAFAC] hover:bg-[#0A1514] hover:text-[#00E6CF] transition-all">
              <FolderPlus size={14} />
              Create Group
            </button>
          )}
        </div>

        {/* Groups */}
        <div className="px-3 space-y-1">
          {groups.map((group) => {
            const isExpanded = expandedGroups.has(group.id);
            const groupDocs = group.documentIds.map(getDocById).filter(Boolean) as Document[];
            return (
              <div key={group.id} className={`rounded-lg border transition-colors overflow-hidden ${
                dragOverGroupId === group.id
                  ? "border-[#00E6CF]/40 bg-[#00E6CF]/5"
                  : "border-[#102321]/40 bg-[#0A1514]/30"
              }`}>
                <div
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[#0A1514] transition-colors group"
                  onClick={() => toggleGroup(group.id)}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverGroupId(group.id); }}
                  onDragEnter={(e) => { e.preventDefault(); setDragOverGroupId(group.id); }}
                  onDragLeave={() => setDragOverGroupId(null)}
                  onDrop={(e) => { e.preventDefault(); setDragOverGroupId(null); const did = e.dataTransfer.getData("text/plain"); if (did) addDocToGroup(group.id, did); }}
                >
                  <button className="shrink-0 text-[#9DAFAC]">
                    {isExpanded ? <CaretDown size={12} /> : <CaretRight size={12} />}
                  </button>
                  {editingGroup === group.id ? (
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => finishRename(group.id)}
                      onKeyDown={(e) => e.key === "Enter" && finishRename(group.id)}
                      className="flex-1 bg-transparent border-b border-[#00E6CF]/30 text-sm text-white outline-none"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="flex-1 text-sm text-white truncate">{group.name}</span>
                  )}
                  <span className="text-[10px] text-[#9DAFAC] font-mono">{groupDocs.length}</span>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {selectedDocs.size > 0 && (
                      <button onClick={(e) => { e.stopPropagation(); addDocsToGroup(group.id); }}
                        className="w-6 h-6 rounded hover:bg-[#00E6CF]/10 flex items-center justify-center text-[#00E6CF]"
                        title="Add selected docs here">
                        <Plus size={12} />
                      </button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); startRename(group); }}
                      className="w-6 h-6 rounded hover:bg-white/5 flex items-center justify-center text-[#9DAFAC] hover:text-white"
                      title="Rename">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); deleteGroup(group.id); }}
                      className="w-6 h-6 rounded hover:bg-red-500/10 flex items-center justify-center text-[#9DAFAC] hover:text-red-400"
                      title="Delete group">
                      <X size={11} />
                    </button>
                  </div>
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 pb-2 space-y-1">
                        {groupDocs.length === 0 && (
                          <p className="text-[11px] text-[#9DAFAC]/60 text-center py-3">
                            Drag documents here or select &amp; click +
                          </p>
                        )}
                        {groupDocs.map((doc) => {
                          const did = doc.document_id ?? doc.id;
                          const name = docDisplayName(doc);
                          const ext = docExt(name);
                          const statusKey = docStatusKey(doc);
                          const pill = DOC_STATUS_PILL[statusKey];
                          return (
                            <div key={did}
                              className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-[#0D1C1A]/50 hover:bg-[#0D1C1A] transition-colors group/doc"
                            >
                              <FileText size={13} className="text-[#00E6CF] shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-white truncate" title={name}>{name}</p>
                                <p className="text-[10px] text-[#9DAFAC]">{ext ? ext.toUpperCase() : "FILE"} &middot; {new Date(doc.created_at).toLocaleDateString()}</p>
                              </div>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${pill.cls}`}>{pill.label}</span>
                              <button onClick={() => removeDocFromGroup(group.id, did)}
                                className="w-5 h-5 rounded hover:bg-red-500/10 flex items-center justify-center text-[#9DAFAC] hover:text-red-400 opacity-0 group-hover/doc:opacity-100 transition-all"
                                title="Remove from group">
                                <X size={10} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {/* Upload trigger */}
        <div className="px-3 pt-3 pb-1">
          <button onClick={() => fileInput.current?.click()} disabled={uploading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[#102321] w-full text-sm text-[#9DAFAC] hover:bg-[#0A1514] hover:text-[#00E6CF] transition-all disabled:opacity-40">
            <Upload size={14} />
            {uploading ? "Uploading..." : "Add Documents"}
          </button>
          <input ref={fileInput} type="file" multiple accept=".pdf,.md,.txt,.docx" className="hidden" onChange={(e) => onUpload(e.target.files)} />
        </div>

        {/* Bulk actions */}
        {selectedDocs.size > 0 && (
          <div className="px-3 py-2 flex items-center gap-2 border-t border-[#102321]/30">
            <span className="text-xs text-[#9DAFAC]">{selectedDocs.size} selected</span>
            <button onClick={() => setSelectedDocs(new Set())}
              className="text-xs text-[#9DAFAC] hover:text-white transition-colors">Clear</button>
            <div className="flex-1" />
            <button onClick={() => setConfirmDeleteDocs(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-colors">
              <Trash size={12} />
              Delete
            </button>
          </div>
        )}

        {/* Document list */}
        <div className="px-3 pb-4 space-y-0.5">
          {docs.length === 0 && !uploading && (
            <p className="text-xs text-[#9DAFAC]/60 text-center py-6">No documents yet</p>
          )}
          {docs.map((doc) => {
            const did = doc.document_id ?? doc.id;
            const name = docDisplayName(doc);
            const ext = docExt(name);
            const statusKey = docStatusKey(doc);
            const pill = DOC_STATUS_PILL[statusKey];
            const isSelected = selectedDocs.has(did);
            const inGroup = groups.some((g) => g.documentIds.includes(did));
            return (
              <div key={did}
                draggable
                onDragStart={(e) => handleDragStart(e, did)}
                title={name}
                className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-colors cursor-pointer
                  ${isSelected ? "bg-[#00E6CF]/5" : "hover:bg-[#0A1514]"}`}
                onClick={() => toggleDocSelect(did)}
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors
                  ${isSelected ? "bg-[#00E6CF] border-[#00E6CF]" : "border-[#102321]"}`}>
                  {isSelected && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <FileText size={14} className={`shrink-0 ${isSelected ? "text-[#00E6CF]" : inGroup ? "text-[#9DAFAC]" : "text-[#9DAFAC]/60"}`} />
                <span className={`flex-1 min-w-0 truncate text-xs ${isSelected ? "text-white" : "text-[#9DAFAC]"}`}>{name}</span>
                {statusKey === "processing" ? (
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
                ) : (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${pill.cls}`}>
                    {ext ? `${ext} · ${pill.label}` : pill.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Delete confirmation */}
      <AnimatePresence>
        {confirmDeleteDocs && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ type: "spring", damping: 22, stiffness: 300 }}
              className="bg-[#0D1C1A] border border-[#102321] rounded-xl p-4 max-w-xs w-full"
            >
              <p className="text-sm mb-1">Delete {selectedDocs.size} document{selectedDocs.size > 1 ? "s" : ""}?</p>
              <p className="text-xs text-[#9DAFAC] mb-4">This cannot be undone.</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmDeleteDocs(false)}
                  className="flex-1 py-2 rounded-lg text-sm border border-[#102321] text-[#9DAFAC] hover:bg-[#0A1514] transition-all active:scale-95">
                  Cancel
                </button>
                <button onClick={deleteSelectedDocs} disabled={deleting}
                  className="flex-1 py-2 rounded-lg text-sm bg-gradient-to-r from-red-500/15 to-red-500/10 text-[#f85149] hover:from-red-500/25 hover:to-red-500/20 transition-all active:scale-95 flex items-center justify-center gap-1.5">
                  {deleting && <span className="w-3 h-3 rounded-full border-2 border-red-400 border-t-transparent animate-spin" />}
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  );
}
