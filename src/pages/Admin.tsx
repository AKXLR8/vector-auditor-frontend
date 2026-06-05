import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, type Variants } from "framer-motion";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { health } from "../api/auth";
import client from "../api/client";
import AnimatedPage from "../components/AnimatedPage";
import { ArrowLeft, Shield, ActivityIcon, Database, Trash } from "@phosphor-icons/react";

const fadeUp: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
};

function SkeletonBar({ className }: { className?: string }) {
  return (
    <motion.div
      animate={{ opacity: [0.3, 0.6, 0.3] }}
      transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
      className={`h-4 rounded-md bg-[#1a1a1e] ${className ?? ""}`}
    />
  );
}

export default function Admin() {
  const { isAdmin } = useAuth();
  const [healthData, setHealthData] = useState<any>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [dlq, setDlq] = useState<any[]>([]);
  const [dlqLoading, setDlqLoading] = useState(true);
  const [flushing, setFlushing] = useState(false);

  useEffect(() => {
    health().then(setHealthData).catch(() => {}).finally(() => setHealthLoading(false));
    client.get("/admin/dlq").then((r) => setDlq(r.data?.dead_letter_queue || [])).catch(() => {}).finally(() => setDlqLoading(false));
  }, []);

  if (!isAdmin) {
    return (
      <AnimatedPage className="auth-gradient min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-[#f0f0f0] mb-2">Access Denied</h1>
          <p className="text-sm text-[#a0a0a8] mb-4">Admin access required.</p>
          <Link to="/chat" className="text-[#00d2ff] hover:underline text-sm">&larr; Back to Dashboard</Link>
        </div>
      </AnimatedPage>
    );
  }

  const handleFlush = async () => {
    setFlushing(true);
    try {
      await client.post("/cache/flush");
      toast.success("Cache flushed successfully");
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Flush failed");
    } finally {
      setFlushing(false);
    }
  };

  return (
    <AnimatedPage className="min-h-screen bg-[#000000] p-6 max-w-3xl mx-auto">
      <motion.div variants={fadeUp} className="mb-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-[#00d2ff] hover:underline"
        >
          <ArrowLeft size={15} /> Back
        </Link>
      </motion.div>
      <motion.h1
        variants={fadeUp}
        className="text-xl font-semibold text-[#f0f0f0] mb-6 flex items-center gap-2"
      >
        <Shield size={22} /> Admin Panel
      </motion.h1>

      {/* Health */}
      <motion.div variants={fadeUp} className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[#6e7681] mb-3 flex items-center gap-1.5">
          <ActivityIcon size={13} /> System Health
        </h2>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="bg-[#141416] border border-[#2a2a30] rounded-xl p-4"
        >
          {healthLoading ? (
            <div className="space-y-2">
              <SkeletonBar className="w-3/4" />
              <SkeletonBar className="w-1/2" />
              <SkeletonBar className="w-2/3" />
            </div>
          ) : healthData ? (
            <pre className="text-xs font-mono text-[#a0a0a8] overflow-x-auto">{JSON.stringify(healthData, null, 2)}</pre>
          ) : (
            <p className="text-sm text-[#6e7681]">Failed to load health data.</p>
          )}
        </motion.div>
      </motion.div>

      {/* Cache */}
      <motion.div variants={fadeUp} className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[#6e7681] mb-3 flex items-center gap-1.5">
          <Database size={13} /> Cache
        </h2>
        <div className="bg-[#141416] border border-[#2a2a30] rounded-xl p-4">
          <p className="text-sm text-[#a0a0a8] mb-3">Clears all cached data (query results, embeddings, documents).</p>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleFlush}
            disabled={flushing}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#f85149]/15 text-[#f85149] rounded-lg text-sm hover:bg-[#f85149]/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Trash size={15} /> {flushing ? "Flushing..." : "Flush Cache"}
          </motion.button>
        </div>
      </motion.div>

      {/* DLQ */}
      <motion.div variants={fadeUp}>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[#6e7681] mb-3">
          Dead Letter Queue ({dlq.length})
        </h2>
        {dlqLoading ? (
          <div className="space-y-2">
            <div className="bg-[#141416] border border-[#2a2a30] rounded-xl p-4">
              <SkeletonBar className="w-full" />
            </div>
            <div className="bg-[#141416] border border-[#2a2a30] rounded-xl p-4">
              <SkeletonBar className="w-3/4" />
            </div>
          </div>
        ) : dlq.length === 0 ? (
          <p className="text-sm text-[#6e7681]">No failed items.</p>
        ) : (
          <div className="space-y-2">
            {dlq.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-[#141416] border border-[#2a2a30] rounded-xl p-4"
              >
                <pre className="text-xs font-mono text-[#a0a0a8] overflow-x-auto">{JSON.stringify(item, null, 2)}</pre>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </AnimatedPage>
  );
}
