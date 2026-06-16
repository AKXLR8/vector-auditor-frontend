import client from "./client";
import type { Document } from "../types";

export async function listDocuments(): Promise<Document[]> {
  const { data } = await client.get("/documents", { params: { _t: Date.now() } });
  const docs: any[] = Array.isArray(data) ? data : data?.documents ?? [];
  return docs.map((d: any) => ({
    ...d,
    document_id: d.id ?? d.document_id,
  }));
}

export async function getDocument(id: string): Promise<Document> {
  const { data } = await client.get(`/documents/${id}`);
  return { ...data, document_id: data.id ?? data.document_id };
}

export async function deleteDocument(id: string): Promise<void> {
  await client.delete(`/documents/${id}`);
}

export async function uploadDocuments(files: File[], privacy = false): Promise<{
  uploaded_documents: { upload_id: string; document_id: string; filename: string; status: string }[];
}> {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  form.append("privacy", privacy ? "true" : "false");
  const { data } = await client.post("/documents", form, {
    headers: { "Content-Type": undefined },
  });
  return data;
}
