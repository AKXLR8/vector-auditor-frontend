import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  Sparkle, CaretRight, List, MagnifyingGlass, FileText,
  Quotes, Robot, Brain, Lightning, Globe,
  Stack, Upload, Shield,
} from "@phosphor-icons/react";

/* ─── Shared Primitives ────────────────────────────────────────────── */

function LogoMark({ className }: { className?: string }) {
  return (
    <img src="/logo.png" alt="Logo" className={`object-contain ${className ?? ""}`} />
  );
}

function SectionEyebrow({ label, tag }: { label: string; tag?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0" />
      <span className="text-sm text-white/70">{label}</span>
      {tag && <span className="px-2 py-0.5 rounded-full border border-white/10 text-white/50 text-xs">{tag}</span>}
    </div>
  );
}

/* ─── Data ──────────────────────────────────────────────────────────── */

const NAV_LINKS = ["Features", "How It Works", "Pricing", "Docs"];

const FEATURES = [
  {
    icon: Brain,
    title: "Semantic Search",
    desc: "all-MiniLM-L6-v2 embeddings power meaning-based retrieval — find relevant passages even when your query uses different words than the document.",
  },
  {
    icon: Quotes,
    title: "Cited Grounding",
    desc: "Every answer includes inline [N] citation markers. Click any chip to jump directly to the exact page in the source PDF.",
  },
  {
    icon: Shield,
    title: "PII Redaction",
    desc: "Uploaded documents are automatically scanned for personally identifiable information and redacted before indexing — keeping sensitive data out of your vector store.",
  },
  {
    icon: Lightning,
    title: "Section-Aware Chunking",
    desc: "Documents are split by markdown headers into 1000-character windows with a 50-character overlap, preserving section boundaries and context.",
  },
  {
    icon: Globe,
    title: "Multi-Document Q&A",
    desc: "Select any subset of your uploaded PDFs. The agent queries only the chosen sources, keeping answers scoped and precise.",
  },
  {
    icon: Robot,
    title: "AI-Powered Answers",
    desc: "Powered by Inception Labs' Mercury-2",
  },
];

const STEPS = [
  { number: "1", title: "Upload PDFs", desc: "Drag-and-drop any PDF document. Files are stored in Cloudinary and locally for instant PDF previews." },
  { number: "2", title: "Ask Questions", desc: "Type a question in natural language. The system searches across your selected documents in real time." },
  { number: "3", title: "Get Cited Answers", desc: "Receive AI-generated answers with inline source citations. Click any citation to view the exact page." },
];

const TESTIMONIALS = [
  {
    quote: "We analyze hundreds of technical reports weekly. Vector Auditor cut our document review time by 70% and eliminated manual cross-referencing.",
    name: "Dr. Priya Sharma",
    role: "Head of Research",
    company: "MERIDIAN LABS",
  },
  {
    quote: "The citation grounding is a game-changer. Every answer points to a specific page and paragraph — no more hunting for sources.",
    name: "James Okonkwo",
    role: "Senior Legal Analyst",
    company: "AXON LEGAL",
  },
  {
    quote: "Our support team uses it to answer product questions from our knowledge base. Zero hallucination, precise citations every time.",
    name: "Lena Voss",
    role: "VP of Customer Success",
    company: "RADIANT TECH",
  },
];

const gradientStyle: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(to right, #091020 0%, #0B2551 12.5%, #A4F4FD 32.5%, #00d2ff 50%, #0B2551 67.5%, #091020 87.5%, #091020 100%)",
  backgroundSize: "200% auto",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
  WebkitTextFillColor: "transparent",
  filter: "url(#c3-noise)",
};

/* ─── Demo conversation messages ────────────────────────────────────── */

const DEMO_MSGS = [
  { role: "user", text: "What were the key findings in the Q3 security audit?" },
  { role: "assistant", text: "The Q3 security audit identified 3 critical vulnerabilities and 12 medium-severity issues across the infrastructure layer:\n\n**Critical findings:**\n- Unpatched TLS 1.0 support on subdomain `api-v1.example.com` [1]\n- S3 bucket `logs-prod` had public read access enabled [2]\n- Root user MFA was not enforced on 2 of 5 admin accounts [3]\n\n**Recommendation:** Prioritize the TLS deprecation (48 hr SLA) and rotate all IAM keys within the week." },
];

/* ─── Component ─────────────────────────────────────────────────────── */

export default function Landing() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (href.startsWith("#")) {
      e.preventDefault();
      const el = document.querySelector(href);
      el?.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="relative min-h-screen w-full bg-[#070E0D] text-white selection:bg-brand/30 overflow-x-hidden">

      {/* ─── SVG Noise Filters ──────────────────────────── */}
      <svg className="absolute w-0 h-0" aria-hidden>
        <filter id="c3-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.35 0" />
          <feComposite in2="SourceGraphic" operator="in" result="noise" />
          <feBlend in="SourceGraphic" in2="noise" mode="multiply" />
        </filter>
      </svg>

      {/* ─── Background Video ───────────────────────────── */}
      <div className="fixed inset-0 z-0 pointer-events-none safe-area-top safe-area-bottom">
        <video
          autoPlay loop muted playsInline
          className="w-full h-full object-cover pointer-events-none scale-110"
          style={{ filter: "blur(4px) brightness(0.35)" }}
          src="/video/upscaled-video.mp4"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#070E0D]/40 via-transparent to-[#070E0D]/60" />
      </div>

      {/* ─── Section 1 — Navbar ─────────────────────────── */}
      <motion.nav
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <LogoMark className="w-12 h-12 text-white" />
          <span className="text-lg hidden sm:inline" style={{ fontFamily: "'New York','NewYork','Times New Roman',Times,serif", fontWeight: 600, letterSpacing: "0.01em" }}>VecxAud</span>
        </div>

        <div className="hidden md:flex gap-8">
          {NAV_LINKS.map((link, i) => (
            <motion.a
              key={link}
              href={link === "Docs" ? "/chat" : `#${link.toLowerCase().replace(/\s+/g, "-")}`}
              onClick={(e) => { if (link !== "Docs") handleNavClick(e, `#${link.toLowerCase().replace(/\s+/g, "-")}`); }}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.05, duration: 0.4 }}
              className="text-white/70 text-sm font-medium hover:text-white transition-colors"
            >
              {link}
            </motion.a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <>
              <span className="text-sm text-white/50">{user?.display_name || "User"}</span>
              <Link
                to="/chat"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-white text-black font-medium text-sm px-5 py-3 transition-all hover:bg-white/90 active:scale-[0.98]"
              >
                Dashboard
              </Link>
              <button
                onClick={() => { localStorage.removeItem("chat_messages"); logout(); }}
                className="text-sm text-white/50 hover:text-white transition-colors cursor-pointer"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-sm text-white/70 hover:text-white transition-colors">Sign In</Link>
              <Link
                to={user ? "/chat" : "/register"}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-white text-black font-medium text-sm px-5 py-3 transition-all hover:bg-white/90 active:scale-[0.98]"
              >
                {user ? "Dashboard" : "Get Started"}
              </Link>
            </>
          )}
        </div>

        <button
          onClick={() => setMobileNavOpen(!mobileNavOpen)}
          className="md:hidden w-10 h-10 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/70 cursor-pointer"
        >
          <List size={18} />
        </button>
      </motion.nav>

      {/* ─── Mobile Nav ──────────────────────────────────── */}
      <AnimatePresence>
        {mobileNavOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="md:hidden relative z-10 w-full px-4 pb-4 safe-area-bottom"
          >
            <div className="max-w-6xl mx-auto rounded-2xl bg-black/60 backdrop-blur-xl border border-white/10 p-4 space-y-3">
            {NAV_LINKS.map((link) => (
              <a key={link} href={`#${link.toLowerCase().replace(/\s+/g, "-")}`}
                onClick={(e) => { setMobileNavOpen(false); handleNavClick(e, `#${link.toLowerCase().replace(/\s+/g, "-")}`); }}
                className="block text-sm text-white/70 hover:text-white py-2.5">{link}</a>
            ))}
            <hr className="border-white/10" />
            {user ? (
              <div className="space-y-2 pt-2">
                <span className="block text-xs text-white/50">{user?.display_name || "User"}</span>
                <Link to="/chat" className="block text-sm text-white font-medium">Dashboard</Link>
                <button onClick={() => { localStorage.removeItem("chat_messages"); logout(); }}
                  className="text-sm text-white/50 hover:text-white cursor-pointer">Logout</button>
              </div>
            ) : (
              <div className="space-y-2 pt-2">
                <Link to="/login" className="block text-sm text-white/70 hover:text-white">Sign In</Link>
                <Link to="/register" className="block text-sm text-white font-medium">Get Started</Link>
              </div>
            )}
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* ─── Section 2 — Hero ─────────────────────────────── */}
      <section className="relative z-10 w-full pt-16 md:pt-28 pb-20 text-center flex flex-col items-center px-4 sm:px-6">
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="text-4xl sm:text-5xl md:text-7xl font-semibold tracking-tight leading-[0.9]"
        >
          <span>Your documents.</span>
          <br />
          <span className="animate-shiny" style={gradientStyle}>
            Revitalized
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="mt-8 text-white/60 max-w-lg text-sm sm:text-base leading-[1.5] px-2"
        >
          Upload PDFs, ask questions in natural language, and get cited answers with page-level accuracy. Vector Auditor is the AI-powered document intelligence platform for teams who demand precision.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.6 }}
          className="mt-8 flex flex-col items-center gap-3"
        >
          {user ? (
            <Link
              to="/chat"
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-white text-black font-medium text-sm px-5 py-3 transition-all hover:bg-white/90 active:scale-[0.98]"
            >
              Open Dashboard
              <CaretRight size={16} className="transition-transform group-hover:translate-x-[1px]" />
            </Link>
          ) : (
            <Link to="/register"
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-white text-black font-medium text-sm px-5 py-3 transition-all hover:bg-white/90 active:scale-[0.98]"
            >
              Get Started Free
              <CaretRight size={16} className="transition-transform group-hover:translate-x-[1px]" />
            </Link>
          )}
          <span className="text-xs text-white/40">No credit card required · Upload & query in seconds</span>
        </motion.div>
      </section>

      {/* ─── Section 3 — Live Demo Mockup ──────────────────── */}
      <section className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 py-12 md:py-24">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3, duration: 0.7 }}
          className="relative rounded-2xl overflow-hidden border border-white/10 bg-[#0e1014]/90 backdrop-blur-2xl"
        >
          {/* Title bar */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
            <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <span className="w-3 h-3 rounded-full bg-[#28c840]" />
            <span className="mx-auto text-xs text-white/50">Vector Auditor — Document Q&A</span>
          </div>

          {/* Body */}
          <div className="grid grid-cols-1 md:grid-cols-12 h-auto md:h-[520px]">
            {/* Sidebar — document list */}
            <div className="md:col-span-3 border-b md:border-b-0 md:border-r border-white/10 bg-black/30 p-4 flex flex-col gap-4">
              <button className="flex items-center justify-center gap-2 rounded-lg bg-white text-black text-xs font-semibold px-3 py-2.5 cursor-pointer">
                <Upload size={14} />
                Upload Documents
              </button>

              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-white/30 font-medium mb-2">Documents</p>
                {[
                  { name: "Q3_Security_Audit.pdf", pages: 24, active: true },
                  { name: "Architecture_Overview.pdf", pages: 56 },
                  { name: "Compliance_Report_2025.pdf", pages: 142 },
                  { name: "API_Reference_v3.pdf", pages: 88 },
                  { name: "Incident_Postmortem.pdf", pages: 12 },
                ].map((doc, i) => (
                  <div
                    key={doc.name}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                      doc.active ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5"
                    }`}
                  >
                    <FileText size={14} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs truncate">{doc.name}</p>
                      <p className="text-[10px] text-white/30">{doc.pages} pages</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-auto hidden md:block">
                <p className="text-[10px] uppercase tracking-wider text-white/30 font-medium mb-2">Selected Sources</p>
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[10px] px-2 py-1 rounded-full bg-[#00d2ff]/10 text-[#00d2ff] border border-[#00d2ff]/20">4 docs</span>
                  <span className="text-[10px] px-2 py-1 rounded-full bg-white/5 text-white/40">486 pages</span>
                </div>
              </div>
            </div>

            {/* Chat area */}
            <div className="md:col-span-9 flex flex-col">
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {DEMO_MSGS.map((msg, i) => (
                  <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                    {msg.role === "assistant" && (
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#00d2ff] to-[#0B2551] flex items-center justify-center shrink-0 mt-0.5">
                        <Robot size={14} />
                      </div>
                    )}
                    <div className={`max-w-[85%] md:max-w-[75%] ${msg.role === "user" ? "order-first" : ""}`}>
                      {msg.role === "user" ? (
                        <div className="px-4 py-2.5 rounded-2xl rounded-br-md bg-white/10 text-sm text-white/90">
                          {msg.text}
                        </div>
                      ) : (
                        <div className="space-y-3 text-sm text-white/80 leading-[1.7]">
                          <div className="liquid-glass rounded-xl p-4 space-y-2">
                            <div className="flex items-center gap-2 text-[#A4F4FD] text-xs font-medium">
                              <Sparkle size={14} />
                              Answer by Vector Auditor
                            </div>
                            <div className="whitespace-pre-line">{msg.text}</div>
                          </div>
                          <div className="flex items-center gap-2 text-xs flex-wrap">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#00d2ff] shrink-0" />
                            <span className="text-white/40 shrink-0">Sources:</span>
                            <button className="px-2 py-0.5 rounded bg-white/5 text-[#00d2ff] hover:bg-white/10 transition-colors whitespace-nowrap">Q3_Security_Audit.pdf — p.12</button>
                            <button className="px-2 py-0.5 rounded bg-white/5 text-[#00d2ff] hover:bg-white/10 transition-colors whitespace-nowrap">Incident_Postmortem.pdf — p.4</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Input */}
              <div className="border-t border-white/10 p-3">
                <div className="flex items-center gap-2 bg-white/5 rounded-xl px-4 py-2.5">
                  <input
                    type="text"
                    placeholder="Ask a question about your documents..."
                    className="flex-1 bg-transparent text-sm text-white/80 placeholder:text-white/30 outline-none"
                    readOnly
                  />
                  <button className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white/40">
                    <CaretRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ─── Section 5 — Features ──────────────────────────── */}
      <section id="features" className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 py-20 md:py-28">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="text-center mb-16"
        >
          <SectionEyebrow label="Features" tag="AI-native" />
          <h2 className="mt-5 text-3xl md:text-5xl font-semibold tracking-tight leading-[1.02]">
            Purpose-built for
            <br />
            document intelligence.
          </h2>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.5 }}
              className="liquid-glass rounded-2xl p-5 md:p-6"
            >
              <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center mb-3">
                <f.icon size={18} className="text-[#00d2ff]" />
              </div>
              <h3 className="text-sm font-semibold mb-2">{f.title}</h3>
              <p className="text-xs sm:text-sm text-white/60 leading-[1.6]">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── Section 6 — How It Works ──────────────────────── */}
      <section id="how-it-works" className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 py-20 md:py-28">
        <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-start">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <SectionEyebrow label="Workflow" tag="3 steps" />
            <h2 className="mt-5 text-3xl md:text-5xl font-semibold tracking-tight leading-[1.02]">
              From PDF to answer
              <br />
              in three clicks.
            </h2>
            <p className="mt-6 text-white/60 text-sm md:text-base leading-[1.6] max-w-md">
              No setup, no training. Upload your documents, ask a question, and get a cited answer with page-level precision. The system handles chunking, embedding, retrieval, and reranking automatically.
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              {["Semantic search", "Cited grounding", "Page-level nav", "Multi-doc select"].map((chip) => (
                <span key={chip} className="text-xs text-white/70 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.03]">
                  {chip}
                </span>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="liquid-glass rounded-2xl p-5"
          >
            <p className="text-xs text-white/50 mb-4">Pipeline · 3 stages</p>
            <div className="space-y-3">
              {STEPS.map((step, i) => (
                <div key={step.number} className="liquid-glass rounded-lg p-4 flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-semibold text-white shrink-0">
                    {step.number}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{step.title}</p>
                    <p className="text-xs text-white/40 mt-1">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── Section 7 — LogoCloud ─────────────────────────── */}
      <section className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-20 text-center">
        <p className="text-xs uppercase tracking-widest text-white/40">
          Used by teams at
        </p>
        <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-6">
          {["Linear", "Vercel", "Figma", "Stripe", "Ramp", "Notion", "Loom", "Arc"].map((name, i) => (
            <motion.span
              key={name}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
              className="text-sm font-semibold tracking-tight text-white/50 hover:text-white transition-colors"
            >
              {name}
            </motion.span>
          ))}
        </div>
      </section>

      {/* ─── Section 8 — Testimonials ──────────────────────── */}
      <section className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 py-20 md:py-28 border-t border-white/10">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {TESTIMONIALS.map((t, i) => (
            <motion.figure
              key={t.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className="liquid-glass rounded-2xl p-5 md:p-6 flex flex-col"
            >
              <blockquote className="text-sm text-white/80 leading-[1.6] flex-1">
                &ldquo;{t.quote}&rdquo;
              </blockquote>
              <figcaption className="mt-5 pt-4 border-t border-white/10">
                <p className="text-sm font-semibold">{t.name}</p>
                <p className="text-xs text-white/50">{t.role}</p>
                <p className="text-xs text-white font-semibold tracking-wide mt-0.5">{t.company}</p>
              </figcaption>
            </motion.figure>
          ))}
        </div>
      </section>

      {/* ─── Section 9 — Pricing ───────────────────────────── */}
      <section id="pricing" className="relative z-10 w-full py-16 md:py-24">
        <svg className="absolute w-0 h-0" aria-hidden>
          <filter id="c3-noise">
            <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="2" stitchTiles="stitch" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.075" />
            </feComponentTransfer>
            <feComposite in2="SourceGraphic" operator="in" result="noise" />
            <feBlend in="SourceGraphic" in2="noise" mode="overlay" />
          </filter>
        </svg>

        <div className="relative w-full max-w-xl mx-auto px-4 sm:px-6">
          <div className="c3-watermark-container" style={{ marginTop: 0 }}>
            <div className="c3-watermark-main">
              <span className="c3-watermark-line-1">Free, period.</span>
              <span className="c3-watermark-line-2">No "Pro" upsell nonsense.</span>
            </div>
          </div>

          <div className="mt-12 md:mt-16">
            <div className="c3-card" style={{ minHeight: 0, padding: "40px 28px", borderRadius: "32px", textAlign: "center" }}>
              <span className="c3-tier-small">Free</span>
              <span className="c3-tier-large" style={{ fontSize: "3rem" }}>$0</span>
              <p className="c3-desc" style={{ minHeight: "2.8em", marginBottom: "28px", fontSize: "0.82rem" }}>
                Everything you need. No wallet required.
              </p>
              <ul className="c3-list" style={{ marginBottom: 0, display: "inline-block", textAlign: "left" }}>
                {[
                  "Semantic search across your documents",
                  "Multi-document Q&A with citations",
                  "Page-level source grounding",
                  "Cross-encoder reranking",
                  "All features, unlimited documents",
                ].map((f) => (
                  <li key={f} style={{ fontSize: "0.85rem", marginBottom: "14px" }}>
                    <span className="c3-check" style={{ width: 24, height: 24 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to={user ? "/chat" : "/register"}
                className="c3-btn"
                style={{ marginTop: "28px", display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}
              >Get Started</Link>
              <p className="mt-6 text-xs text-white/30 italic leading-relaxed max-w-sm mx-auto">
                "We wanted to charge $49/mo for dark mode and $79/mo for paragraphs that make sense,
                but our therapist said we should just let people have nice things."
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Section 10 — Final CTA ────────────────────────── */}
      <section className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 py-20 md:py-32">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="liquid-glass relative overflow-hidden rounded-3xl px-6 md:px-8 py-16 md:py-24 text-center"
        >
          <div
            className="absolute inset-0 pointer-events-none opacity-30"
            style={{
              background: "radial-gradient(600px circle at 50% 0%, rgba(255,255,255,0.15), transparent 70%)",
            }}
          />
          <div className="relative z-10">
            <h2 className="text-3xl md:text-6xl font-semibold tracking-tight leading-[1.02]">
              Stop searching.
              <br />
              Start knowing.
            </h2>
            <p className="mt-6 text-white/60 max-w-md mx-auto text-sm leading-[1.6]">
              Upload your first document and ask a question. You'll get a cited answer with page-level precision — in seconds.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              {user ? (
                <Link
                  to="/chat"
                  className="group inline-flex items-center justify-center gap-2 rounded-full bg-white text-black font-medium text-sm px-5 py-3 transition-all hover:bg-white/90 active:scale-[0.98]"
                >
                  Open Dashboard
                  <CaretRight size={16} className="transition-transform group-hover:translate-x-[1px]" />
                </Link>
              ) : (
                <Link to="/register"
                  className="group inline-flex items-center justify-center gap-2 rounded-full bg-white text-black font-medium text-sm px-5 py-3 transition-all hover:bg-white/90 active:scale-[0.98]"
                >
                  Get Started Free
                  <CaretRight size={16} className="transition-transform group-hover:translate-x-[1px]" />
                </Link>
              )}
              <Link to="/login"
                className="group inline-flex items-center justify-center gap-2 rounded-full border border-white/15 text-white text-sm font-medium px-5 py-3 hover:bg-white/5 transition-all"
              >
                Sign In
                <CaretRight size={16} className="transition-transform group-hover:translate-x-[1px]" />
              </Link>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ─── Footer ────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/10 py-8 safe-area-bottom">
        <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/40">
          <div className="flex items-center gap-2">
            <LogoMark className="w-10 h-10" />
            <span className="font-medium text-white/60">Vector Auditor</span>
          </div>
          <div className="flex items-center justify-center gap-4 flex-wrap text-center">
            <span>Document Q&A</span>
            <span aria-hidden="true" className="hidden sm:inline">·</span>
            <span>Cited answers</span>
            <span aria-hidden="true" className="hidden sm:inline">·</span>
            <span>Page-level precision</span>
          </div>
          <p>&copy; {new Date().getFullYear()} Vector Auditor</p>
        </div>
      </footer>
    </div>
  );
}
