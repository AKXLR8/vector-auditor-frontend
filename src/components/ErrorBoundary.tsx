import { Component, type ErrorInfo, type ReactNode } from "react";
import { motion } from "framer-motion";
import { WarningCircle, ArrowClockwise, House } from "@phosphor-icons/react";
import { Link } from "react-router-dom";

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (typeof console !== "undefined") {
      console.error("[ErrorBoundary] Uncaught:", error, info.componentStack);
    }
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.state.error!, this.reset);
    return <DefaultErrorFallback error={this.state.error!} onReset={this.reset} />;
  }
}

function DefaultErrorFallback({ error, onReset }: { error: Error; onReset: () => void }) {
  return (
    <div className="h-screen w-full flex items-center justify-center bg-[#070E0D] text-white p-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="text-center max-w-md"
      >
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-5">
          <WarningCircle size={28} weight="duotone" className="text-red-400" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight mb-2">Something went sideways</h1>
        <p className="text-sm text-white/60 leading-relaxed mb-6">
          {error?.message || "An unexpected error occurred. Your work hasn't been lost."}
        </p>
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={onReset}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black text-sm font-semibold hover:bg-white/90 active:scale-[0.98] transition-all"
          >
            <ArrowClockwise size={14} weight="bold" /> Try again
          </button>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 text-white/80 text-sm hover:bg-white/5 active:scale-[0.98] transition-all"
          >
            <House size={14} /> Go home
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
