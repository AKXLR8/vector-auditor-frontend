# Vector Auditor — Backend API Reference

> Auto-derived from the frontend's `src/api/*` and `src/types/index.ts`. This document describes every endpoint the frontend currently consumes, the exact request/response shapes it expects, and the special behaviors it depends on.

**Base URL:** `http://127.0.0.1:8000` (configurable via `VITE_API_URL` on the frontend)

**CORS:** Backend must allow the frontend origin. Dev proxy in Vite forwards `/auth/*`, `/documents`, `/query`, `/feedback`, `/analyze`, `/uploads`, `/sessions`, `/admin`, `/cache`, `/health` to `http://127.0.0.1:8000`. The `/auth/callback` path is bypassed (Vite history fallback serves `index.html`).

---

## Table of Contents

- [Authentication](#authentication)
- [Error Format](#error-format)
- [Auth Endpoints](#auth-endpoints)
- [Health](#health)
- [Query (RAG)](#query-rag)
- [Documents](#documents)
- [Uploads](#uploads)
- [Sessions & Messages](#sessions--messages)
- [Admin](#admin)
- [Data Models](#data-models)

---

## Authentication

All non-auth endpoints require a Bearer access token.

```
Authorization: Bearer <access_token>
```

- Tokens are JWTs containing `{ sub, roles: string[], exp, display_name? }`.
- The frontend stores the token in `localStorage` under the key `access_token`.
- When any request returns **401**, the frontend **automatically** calls `GET /auth/token/refresh` (in a single-flight queue) to get a new token, then retries the original request. If the refresh itself 401s, the user is hard-logged-out and redirected to `/login?expired=1`.
- Access tokens are expected to last long enough that a refresh is only needed close to expiry (frontend schedules a refresh ~1 day before `exp`).

### OAuth (GitHub) Flow

1. Frontend calls `GET /auth/oauth/config` to get `github_client_id`.
2. Frontend opens `https://github.com/login/oauth/authorize?client_id=...&redirect_uri=<origin>/oauth/callback&scope=user:email&state=<csrf>` in a popup.
3. GitHub redirects the popup to `<origin>/oauth/callback?code=...&state=...`.
4. The frontend's `AuthCallback` page `postMessage`s `{ provider: "github", code }` to the opener window.
5. The opener calls `POST /auth/oauth/github` with `{ code }` to exchange the code for a session token.

> **Important:** The GitHub OAuth App's allowed callback URL must match `<origin>/oauth/callback` exactly.

---

## Error Format

FastAPI's standard error envelope. The frontend extracts `detail` for display:

```json
{
  "detail": "Email already registered"
}
```

For Pydantic 422 validation errors, `detail` is an array of error objects:

```json
{
  "detail": [
    { "type": "missing", "loc": ["body", "first_name"], "msg": "Field required", "input": {} },
    { "type": "value_error", "loc": ["body", "email"], "msg": "value is not a valid email address", "input": {} }
  ]
}
```

The frontend formats these as `"First Name: Field required • Email: value is not a valid email address"`.

**HTTP codes the frontend handles specially:**
- `401` → trigger refresh flow → if refresh fails, hard-logout
- `404` → generic "not found" toast
- `429` → "Too many requests. Please wait a moment and try again."
- `5xx` → "Our servers are having a moment. Please retry shortly."
- `0` (network) → "You're offline. Check your connection and try again."

---

## Auth Endpoints

### `GET /auth/oauth/config`
Get OAuth provider client IDs.

**Auth:** No
**Response:**
```json
{ "github_client_id": "Iv1.abc123" }
```

### `POST /auth/register`
Create a new account.

**Auth:** No
**Request:**
```json
{
  "email": "user@example.com",
  "password": "at-least-8-chars",
  "first_name": "Jane",      // optional but recommended
  "last_name": "Doe"         // optional but recommended
}
```
**Response:** `User` (see [Data Models](#data-models))

### `POST /auth/login`
Email/password sign-in.

**Auth:** No
**Request:**
```json
{ "email": "user@example.com", "password": "..." }
```
**Response:**
```json
{ "access_token": "eyJ...", "user_id": "...", "roles": ["user"] }
```

### `POST /auth/login/mfa`
Complete MFA challenge.

**Auth:** `Authorization: Bearer <mfa_temp_token>`
**Request:**
```json
{ "code": "123456" }
```
**Response:** same as `/auth/login`

### `GET /auth/token/refresh`
Refresh an expiring access token.

**Auth:** `Authorization: Bearer <current_token>`
**Response:**
```json
{ "access_token": "eyJ-new..." }
```

### `POST /auth/logout`
Invalidate the current session (best-effort; frontend clears local storage regardless).

**Auth:** Yes
**Response:** `204 No Content` (or any 2xx; frontend ignores the body)

### `POST /auth/mfa/setup`
Generate MFA secret + QR code.

**Auth:** Yes
**Response:**
```json
{ "secret": "JBSWY3DPEHPK3PXP", "uri": "otpauth://...", "qr_code_url": "data:image/png;base64,..." }
```

### `POST /auth/mfa/verify`
Confirm MFA code and enable MFA on the account.

**Auth:** Yes
**Request:**
```json
{ "code": "123456" }
```
**Response:** `User` (with `mfa_enabled: true`)

### `POST /auth/oauth/github`
Exchange a GitHub OAuth code for a session token.

**Auth:** No
**Request:**
```json
{ "code": "github_auth_code" }
```
**Response:** same as `/auth/login`

---

## Health

### `GET /health`
Liveness + dependency checks.

**Auth:** No
**Response:**
```json
{
  "status": "ok",
  "version": "1.2.3",
  "timestamp": "2026-06-07T10:30:00Z",
  "checks": {
    "database": "ok",
    "vector_store": "ok",
    "object_store": "ok",
    "llm_provider": "ok"
  }
}
```

---

## Query (RAG)

### `POST /query` (non-streaming)
Single-shot RAG query. Returns the full response when done. The frontend prefers the streaming variant but falls back to this when SSE isn't available.

**Auth:** Yes
**Request:** `QueryRequest`
```json
{
  "question": "What is the refund policy?",
  "document_ids": ["doc-uuid-1"],            // optional: scope to specific docs
  "conversation_history": [                    // optional: prior turns
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "mode": "white_box",                         // optional: "white_box" | "black_box" (default "white_box")
  "max_citations": 5                           // optional: cap on citations returned
}
```
**Response:** `QueryResponse`
```json
{
  "answer": "According to section 3.2, refunds are issued within 30 days...",
  "citations": [
    { "quote": "Refunds will be issued within 30 days", "source": "policy.pdf", "location": "Section 3.2", "page": 4 }
  ],
  "reasoning_path": ["Retrieved 5 chunks", "Reranked", "Composed answer"],
  "tokens_used": 842,
  "cost_usd": 0.012,
  "query_id": "qry_abc123",
  "timestamp": "2026-06-07T10:30:00Z",
  "verification": "All claims are supported by the cited sources.",
  "mode": "white_box"
}
```

### `POST /query/stream` (SSE streaming)
Streaming RAG query using Server-Sent Events. **This is the variant the frontend uses by default.**

**Auth:** Yes (via `Authorization: Bearer <token>` header, NOT cookies — the frontend uses `fetch` with manual header injection)
**Request:** same `QueryRequest` as `/query`
**Response:** SSE stream of `StreamEvent` objects, one per `data:` line. Stream ends with `data: [DONE]`.

Each event has a `type` discriminator. Frontend handling per type:

| `type` | Fields | Frontend behavior |
|--------|--------|-------------------|
| `citations` | `citations: Citation[]`, `query_id?: string` | Stored on the assistant message; rendered as `[1]` chips in the answer. |
| `token` | `content: string` | Appended to the streaming answer text. |
| `verification` | `content: string` | Shown in a verification panel. **Ignored when `mode === "black_box"`.** |
| `gap_analysis` | `content: string` | Shown in a gap-analysis panel. **Ignored when `mode === "black_box"`.** |
| `done` | `tokens_used?: number`, `mode?: QueryMode` | Marks the stream as complete; frontend finalizes message. |

Example stream:
```
data: {"type":"citations","citations":[{"quote":"...","source":"policy.pdf","location":"Section 3.2","page":4}],"query_id":"qry_abc123"}

data: {"type":"token","content":"According "}

data: {"type":"token","content":"to section 3.2, "}

data: {"type":"token","content":"refunds are issued within 30 days."}

data: {"type":"verification","content":"All claims are supported by the cited sources."}

data: {"type":"done","tokens_used":842,"mode":"white_box"}

data: [DONE]
```

**Mode semantics (frontend UX):**
- `white_box` (default): full reasoning path shown, "as a researcher" framing, gap analysis + verification displayed.
- `black_box`: terse answer only, no reasoning/gap/verification UI sections, reasoning_path omitted from response.

The frontend uses `AbortController` to cancel streams — make sure the backend respects client disconnects and stops the LLM generation promptly.

### `POST /feedback`
Submit thumbs-up/down on a query response.

**Auth:** Yes
**Request:** `FeedbackRequest`
```json
{ "query_id": "qry_abc123", "thumbs_up": true, "comment": "Very helpful" }
```
**Response:** `204 No Content`

### `POST /analyze`
Multi-document analysis. Returns a structured research report.

**Auth:** Yes
**Request:**
```json
{
  "question": "Compare the risk methodologies across these documents",  // optional focus
  "document_ids": ["doc-1", "doc-2", "doc-3"],                          // optional subset
  "max_citations": 5                                                    // optional
}
```
**Response:** `DocumentAnalysis`
```json
{
  "summary": "The three documents collectively cover...",
  "key_findings": ["Finding 1", "Finding 2", "Finding 3"],
  "methodology": "Cross-referenced claims from all three documents...",
  "research_gaps": ["Gap 1", "Gap 2"],
  "contradictions": ["Document A claims X, but Document B claims Y"],
  "open_questions": ["How does Z compare to W?"],
  "limitations": "Analysis is limited to the three provided documents...",
  "confidence": "high",
  "citations": [{ "quote": "...", "source": "...", "location": "...", "page": 1 }],
  "documents_analyzed": ["doc-1", "doc-2", "doc-3"]
}
```

`confidence` must be one of: `"high" | "moderate" | "low"`.

---

## Documents

### `GET /documents`
List the current user's documents.

**Auth:** Yes
**Response:**
```json
{
  "documents": [
    {
      "id": "doc-uuid-1",
      "document_id": "doc-uuid-1",   // frontend tolerates either id or document_id
      "filename": "policy.pdf",
      "status": "ready",              // "processing" | "ready" | "failed" | "duplicate" | "skipped" | "stuck"
      "has_pii": false,
      "sha256": "abc123...",
      "cloudinary_url": "https://res.cloudinary.com/.../policy.pdf",
      "uploaded_by": "user-uuid",
      "created_at": "2026-06-07T10:30:00Z"
    }
  ]
}
```

> **Critical for upload UX:** Documents only appear in this list **after** the upload finishes processing (the frontend expects a `document_uploaded` event to flip status to `ready`). The frontend inserts optimistic `status: "processing"` placeholders into its local list immediately on upload to avoid a perceived 10s delay — see [Special Behaviors](#special-behaviors) below.

### `GET /documents/:id`
Get metadata for a single document.

**Auth:** Yes
**Response:** `Document` (same shape as one element above)

### `POST /documents`
Upload one or more documents (multipart).

**Auth:** Yes
**Content-Type:** `multipart/form-data`
**Form fields:** `files` (repeatable) — the file blobs
**Response:**
```json
{
  "uploaded_documents": [
    {
      "upload_id": "upl_abc123",       // use this with GET /uploads/:id to poll progress
      "document_id": "doc-uuid-1",     // the eventual document ID (may differ from upload_id)
      "filename": "policy.pdf",
      "status": "processing"           // or "duplicate" / "skipped" if backend short-circuits
    }
  ]
}
```

> **Duplicate handling:** If a file's hash matches an existing document, the response can include `"status": "duplicate"` and the frontend will show a "Already in your library" toast and skip polling for that upload_id.

### `DELETE /documents/:id`
Delete a document. Idempotent (404 is OK — frontend tolerates it).

**Auth:** Yes
**Response:** `204 No Content`

---

## Uploads

### `GET /uploads/:uploadId`
Poll the status of an in-flight upload.

**Auth:** Yes
**Response:** `UploadProgress`
```json
{
  "id": "upl_abc123",
  "filename": "policy.pdf",
  "stage": "completed",            // "uploading" | "extracting" | "chunking" | "embedding" | "indexing" | "completed" | "failed" | "duplicate" | "skipped" | "stuck"
  "progress": 100,                 // 0-100
  "error": null,                   // string | null
  "document_id": "doc-uuid-1",     // set when stage is "completed"
  "user_id": "user-uuid",
  "created_at": "2026-06-07T10:30:00Z",
  "updated_at": "2026-06-07T10:30:05Z"
}
```

> The frontend polls this endpoint every 2s while uploads are active. Terminal stages (`completed`, `failed`, `duplicate`, `skipped`, `stuck`) stop polling. After `completed`, the document also appears in `GET /documents`.

---

## Sessions & Messages

Sessions are per-user chat threads. Messages are stored server-side for cross-device sync.

### `GET /sessions`
List the current user's sessions (newest first).

**Auth:** Yes
**Response:**
```json
{
  "sessions": [
    {
      "id": "sess-uuid-1",
      "title": "Refund policy question",
      "user_id": "user-uuid",
      "created_at": "2026-06-07T10:00:00Z",
      "updated_at": "2026-06-07T10:30:00Z"
    }
  ]
}
```

### `POST /sessions`
Create a new session.

**Auth:** Yes
**Request:**
```json
{ "title": "Optional title", "id": "optional-client-supplied-id" }
```
**Response:** `ChatSession`

### `GET /sessions/:id`
Get a session with all its messages.

**Auth:** Yes
**Response:** `ChatSession & { messages: ChatMessage[] }`

### `PUT /sessions/:id`
Update session metadata (e.g., rename).

**Auth:** Yes
**Request:**
```json
{ "title": "New title" }
```
**Response:** `ChatSession`

### `DELETE /sessions/:id`
Delete a session and all its messages.

**Auth:** Yes
**Response:** `204 No Content`

### `POST /sessions/:sessionId/messages`
Add a message to a session. Frontend calls this for both user and assistant messages (assistant messages get persisted once streaming completes).

**Auth:** Yes
**Request:**
```json
{
  "role": "user",                       // "user" | "assistant"
  "content": "What is the refund policy?",
  "citations": null,                     // Citation[] | null (assistant only)
  "reasoning_path": null,                // string[] | null (assistant only, white_box)
  "tokens_used": 842,                    // number | null (assistant only)
  "cost_usd": 0.012,                     // number | null (assistant only)
  "query_id": "qry_abc123",              // string | null (assistant only)
  "verification": null                   // string | null (assistant only, white_box)
}
```
**Response:** `ChatMessage` (with server-assigned `id` and `created_at`)

### `GET /sessions/:sessionId/messages`
List all messages in a session, oldest first.

**Auth:** Yes
**Response:**
```json
{ "messages": [ChatMessage, ...] }
```

---

## Admin

These endpoints are only called by users whose JWT contains `"admin"` in `roles`.

### `GET /admin/dlq`
Inspect the dead-letter queue (failed async jobs that need manual intervention).

**Auth:** Yes (admin)
**Response:**
```json
{
  "dead_letter_queue": [
    { "id": "dlq_1", "task": "embed_document", "payload": {...}, "error": "...", "failed_at": "..." }
  ]
}
```

### `POST /cache/flush`
Clear the response cache.

**Auth:** Yes (admin)
**Response:** `204 No Content` (or any 2xx)

---

## Data Models

### `User`
```ts
{
  id: string;
  email: string;
  display_name?: string | null;
  roles: string[];              // e.g. ["user"] or ["user", "admin"]
  mfa_enabled: boolean;
  created_at: string;           // ISO 8601
}
```

### `Citation`
```ts
{
  quote: string;                // exact text from the source document
  source: string;               // filename
  location: string;             // e.g. "Section 3.2" or "Paragraph 4"
  page?: number;                // 1-indexed page number
}
```

### `QueryRequest`
```ts
{
  question: string;
  document_ids?: string[];
  conversation_history?: { role: "user" | "assistant"; content: string }[];
  mode?: "white_box" | "black_box";   // default "white_box"
  max_citations?: number;             // default backend-defined
}
```

### `QueryResponse`
```ts
{
  answer: string;
  citations: Citation[];
  reasoning_path: string[];          // empty for black_box
  tokens_used: number;
  cost_usd: number;
  query_id: string;
  timestamp: string;
  verification?: string | null;      // null for black_box
  mode?: "white_box" | "black_box";
}
```

### `StreamEvent` (SSE)
```ts
{ type: "citations"; citations: Citation[]; query_id?: string; reasoning_path?: string[] }
{ type: "token"; content: string }
{ type: "verification"; content: string }   // white_box only
{ type: "gap_analysis"; content: string }  // white_box only
{ type: "done"; tokens_used?: number; mode?: "white_box" | "black_box" }
```

### `Document`
```ts
{
  id: string;
  document_id?: string;          // frontend tolerates either
  filename: string;
  status: "processing" | "ready" | "failed" | "duplicate" | "skipped" | "stuck";
  has_pii: boolean;
  sha256: string;
  cloudinary_url?: string;
  uploaded_by: string;
  created_at: string;
}
```

### `UploadProgress`
```ts
{
  id: string;
  filename: string;
  stage: "uploading" | "extracting" | "chunking" | "embedding" | "indexing" | "completed" | "failed" | "duplicate" | "skipped" | "stuck";
  progress: number;              // 0-100
  error?: string | null;
  document_id?: string | null;
  user_id: string;
  created_at: string;
  updated_at: string;
}
```

### `ChatSession`
```ts
{
  id: string;
  title: string | null;
  user_id: string;
  created_at: string;
  updated_at: string;
}
```

### `ChatMessage`
```ts
{
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[] | null;
  reasoning_path?: string[] | null;
  tokens_used?: number | null;
  cost_usd?: number | null;
  query_id?: string | null;
  feedback?: string | null;       // server-stored feedback note (not the same as /feedback endpoint)
  verification?: string | null;
  created_at: string;
}
```

### `FeedbackRequest`
```ts
{ query_id: string; thumbs_up: boolean; comment?: string }
```

### `DocumentAnalysis`
```ts
{
  summary: string;
  key_findings: string[];
  methodology: string;
  research_gaps: string[];
  contradictions: string[];
  open_questions: string[];
  limitations: string;
  confidence: "high" | "moderate" | "low";
  citations: Citation[];
  documents_analyzed: string[];
}
```

### `HealthResponse`
```ts
{
  status: "ok" | "degraded" | "down";
  version: string;
  timestamp: string;
  checks: Record<string, string>;  // e.g. { database: "ok", vector_store: "ok" }
}
```

---

## Special Behaviors

### Optimistic upload insert
The frontend inserts docs with `status: "processing"` into its local list **immediately** on upload (before the backend has finished processing). The merge logic on the next `GET /documents` poll preserves optimistic entries the server hasn't returned yet. See the section below for why this matters.

### `document_uploaded` lifecycle
The frontend expects the upload pipeline to:
1. Return from `POST /documents` with `uploaded_documents[].upload_id` and `document_id` for each file (status `"processing"`).
2. Make `GET /uploads/:upload_id` reflect stage transitions (`uploading` → `extracting` → `chunking` → `embedding` → `indexing` → `completed`).
3. **After** the pipeline completes, the doc should appear in `GET /documents` with `status: "ready"`.

If a doc is only added to the library AFTER the upload fully completes (which the current backend does), the user's UI will show an empty list for the full processing duration (often 5-10s). This is the issue the frontend works around with optimistic inserts — the backend could improve perceived latency by returning `status: "processing"` documents from `GET /documents` immediately and updating them in place.

### Real-time sync (frontend side)
The frontend polls `GET /documents` every 10s when the tab is visible, and immediately on `visibilitychange`/`focus`. It also uses `BroadcastChannel("vector-auditor-docs")` for same-browser cross-tab sync. No server push is required, but a WebSocket or SSE channel for `document_uploaded` / `document_deleted` events would eliminate the polling delay entirely.

### Mode switching (`mode` field)
- `white_box` (default): backend should include `reasoning_path` in the response, stream `verification` and `gap_analysis` events, and use the "as a researcher" framing.
- `black_box`: backend should use temperature 0, omit `reasoning_path`, skip `verification` and `gap_analysis` events, and produce a terse answer.

### Streaming abort
The frontend uses `AbortController` to cancel in-flight streams (e.g., when the user clicks "Stop generation"). The backend should detect client disconnects and stop the LLM generation promptly to avoid wasting tokens.

### Pinned sessions (frontend-only)
The frontend stores pinned session IDs in `localStorage` under `pinned_sessions_<user_id>`. This is purely client-side — no backend endpoint needed.

### Auto-save debounce
The frontend debounces session message persistence by 500ms (localStorage) and 3s (server sync via `POST /sessions/:id/messages`) to avoid hammering the backend during streaming. The backend should tolerate bursts and not rate-limit these endpoints aggressively.

### Cross-tab message dedup
The frontend uses a module-level `syncedCache: Map<sessionId, Set<messageId>>` to avoid posting the same message twice (e.g., when both the streaming-end handler and the 3s server-sync timer try to persist the same assistant message). If you implement your own client, follow the same pattern.

### Welcome message
The frontend sends a stable welcome message (`id: "welcome"`) as the first message in new sessions. It's a frontend-only artifact — the backend should not assume message IDs follow UUID format, but the welcome message will never be POSTed (it's only in local state).

### Polling intervals (frontend default)
- Upload progress: 2s
- Document list: 10s (with immediate refetch on `visibilitychange`/`focus`)
- Session list: on session switch + initial load

---

## Quick Reference: All Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET    | `/auth/oauth/config`        | No  | Get OAuth client IDs |
| POST   | `/auth/register`            | No  | Create account |
| POST   | `/auth/login`               | No  | Email/password sign-in |
| POST   | `/auth/login/mfa`           | MFA | Complete MFA challenge |
| GET    | `/auth/token/refresh`       | Yes | Refresh access token |
| POST   | `/auth/logout`              | Yes | End session |
| POST   | `/auth/mfa/setup`           | Yes | Start MFA enrollment |
| POST   | `/auth/mfa/verify`          | Yes | Confirm MFA + enable |
| POST   | `/auth/oauth/github`        | No  | Exchange GitHub code |
| GET    | `/health`                   | No  | Liveness + dependency check |
| POST   | `/query`                    | Yes | Non-streaming RAG query |
| POST   | `/query/stream`             | Yes | Streaming RAG query (SSE) |
| POST   | `/feedback`                 | Yes | Submit query feedback |
| POST   | `/analyze`                  | Yes | Multi-doc analysis |
| GET    | `/documents`                | Yes | List user's documents |
| GET    | `/documents/:id`            | Yes | Get document metadata |
| POST   | `/documents`                | Yes | Upload documents (multipart) |
| DELETE | `/documents/:id`            | Yes | Delete document |
| GET    | `/uploads/:uploadId`        | Yes | Poll upload progress |
| GET    | `/sessions`                 | Yes | List user's sessions |
| POST   | `/sessions`                 | Yes | Create session |
| GET    | `/sessions/:id`             | Yes | Get session + messages |
| PUT    | `/sessions/:id`             | Yes | Update session |
| DELETE | `/sessions/:id`             | Yes | Delete session |
| POST   | `/sessions/:id/messages`    | Yes | Add message to session |
| GET    | `/sessions/:id/messages`    | Yes | List session messages |
| GET    | `/admin/dlq`                | Admin | Inspect dead-letter queue |
| POST   | `/cache/flush`              | Admin | Clear response cache |
