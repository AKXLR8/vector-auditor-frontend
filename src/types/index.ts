export interface User {
  id: string;
  email: string;
  display_name?: string | null;
  roles: string[];
  mfa_enabled: boolean;
  created_at: string;
}

export interface QueryRequest {
  question: string;
  document_ids?: string[];
  conversation_history?: { role: "user" | "assistant"; content: string }[];
}

export interface Citation {
  quote: string;
  source: string;
  location: string;
  page?: number;
}

export interface QueryResponse {
  answer: string;
  citations: Citation[];
  reasoning_path: string[];
  tokens_used: number;
  cost_usd: number;
  query_id: string;
  timestamp: string;
  verification?: string | null;
}

export interface Document {
  id: string;
  document_id?: string;
  filename: string;
  status: string;
  has_pii: boolean;
  sha256: string;
  cloudinary_url?: string;
  uploaded_by: string;
  created_at: string;
}

export interface FeedbackRequest {
  query_id: string;
  thumbs_up: boolean;
  comment?: string;
}

export interface HealthResponse {
  status: string;
  version: string;
  timestamp: string;
  checks: Record<string, string>;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  reasoning_path?: string[];
  tokens_used?: number;
  cost_usd?: number;
  query_id?: string;
  feedback?: boolean | null;
  timestamp: string;
  verification?: string | null;
}

export interface UploadProgress {
  id: string;
  filename: string;
  stage: string;
  progress: number;
  error?: string | null;
  document_id?: string | null;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface DocGroup {
  id: string;
  name: string;
  documentIds: string[];
}

export interface ChatSession {
  id: string;
  title: string | null;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[] | null;
  reasoning_path?: string[] | null;
  tokens_used?: number | null;
  cost_usd?: number | null;
  query_id?: string | null;
  feedback?: string | null;
  verification?: string | null;
  created_at: string;
}

export interface LocalSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
}

export interface StreamEvent {
  type: "citations" | "token" | "verification" | "gap_analysis" | "done";
  citations?: Citation[];
  reasoning_path?: string[];
  content?: string;
  query_id?: string;
  tokens_used?: number;
}
