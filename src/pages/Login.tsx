import { useState, useEffect, useRef, type FormEvent } from "react";
import { Link, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { fetchOAuthConfig } from "../api/auth";
import { errorMessage } from "../lib/errors";
import { Eye, EyeSlash, GithubLogo, WarningCircle, Shield } from "@phosphor-icons/react";

function StepItem({ number, text, active }: { number: string; text: string; active?: boolean }) {
  return (
    <motion.div
      variants={item}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${active ? "bg-white text-black border border-white" : "bg-brand-gray text-white border-none"}`}
    >
      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${active ? "bg-black text-white" : "bg-white/10 text-white/40"}`}>
        {number}
      </span>
      <span className={`text-sm font-medium ${active ? "text-black" : "text-white/70"}`}>{text}</span>
    </motion.div>
  );
}

function InputGroup({ label, placeholder, type, value, onChange, error, children }: {
  label: string; placeholder: string; type: string; value: string; onChange: (v: string) => void; error?: string; children?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-white">{label}</label>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-brand-gray border-none rounded-xl h-11 px-4 text-white placeholder:text-white/20 focus:ring-2 focus:ring-white/20 focus:outline-none text-sm"
        />
        {children}
      </div>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}

const container = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { staggerChildren: 0.15, delayChildren: 0.2 } },
};

const item = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export default function Login() {
  const { isAuthenticated, login, oauthLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const from = (location.state as any)?.from?.pathname || "/chat";
  const wasExpired = searchParams.get("expired") === "1";

  useEffect(() => {
    if (isAuthenticated) navigate(from, { replace: true });
  }, [isAuthenticated, navigate, from]);

  useEffect(() => {
    if (wasExpired) toast("Your session expired. Please sign in again.", { icon: "🔒", duration: 4000 });
  }, [wasExpired]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [oAuthConfig, setOAuthConfig] = useState<{ github_client_id: string } | null>(null);
  const [oauthLoading, setOauthLoading] = useState(false);
  const oauthListener = useRef<((e: MessageEvent) => void) | null>(null);

  useEffect(() => {
    fetchOAuthConfig().then(setOAuthConfig).catch(() => {});
  }, []);

  useEffect(() => {
    oauthListener.current = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const { provider, code } = e.data || {};
      if (provider === "github" && code) {
        setOauthLoading(true);
        oauthLogin("github", code).then(() => navigate(from, { replace: true })).catch((err: any) => {
          setError(errorMessage(err, "GitHub login failed"));
        }).finally(() => setOauthLoading(false));
      }
    };
    window.addEventListener("message", oauthListener.current);
    return () => {
      if (oauthListener.current) window.removeEventListener("message", oauthListener.current);
    };
  }, [oauthLogin, navigate, from]);

  const handleGithubLogoLogin = () => {
    if (!oAuthConfig?.github_client_id) return;
    const state = crypto.randomUUID();
    localStorage.setItem("oauth_state", state);
    const redirectUri = `${window.location.origin}/oauth/callback`;
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.innerWidth - width) / 2;
    const top = window.screenY + (window.innerHeight - height) / 2;
    const popup = window.open(
      `https://github.com/login/oauth/authorize?client_id=${oAuthConfig.github_client_id}&redirect_uri=${redirectUri}&scope=user:email&state=${state}`,
      "github-oauth",
      `width=${width},height=${height},left=${left},top=${top}`
    );
    if (!popup) {
      setError("Popup was blocked. Please allow popups for this site.");
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!email.trim() || !password) {
      setError("Email and password are required");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(errorMessage(err, "Login failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen w-full bg-[#000000] selection:bg-brand/30 p-2 transition-all duration-500 lg:h-screen lg:overflow-hidden lg:p-4">
      {/* Left Column — Hero */}
      <div className="hidden lg:flex relative flex-col items-center justify-end pb-32 px-12 rounded-3xl overflow-hidden shadow-2xl h-full w-[52%]">
        <video autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover">
          <source src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260506_081238_406ed0e3-5d83-436e-a512-0bbff7ec5b95.mp4" type="video/mp4" />
        </video>

        <motion.div
          variants={container}
          initial="initial"
          animate="animate"
          className="relative z-10 w-full max-w-xs space-y-8"
        >
          <motion.div variants={item} className="flex items-center gap-2">
            <img src="/logo.png" alt="Logo" className="w-8 h-8 object-contain" />
            <span className="text-xl font-semibold tracking-tight">Vector Auditor</span>
          </motion.div>

          <motion.div variants={item} className="space-y-3">
            <h1 className="text-4xl font-medium tracking-tight whitespace-nowrap">Welcome Back</h1>
            <p className="text-white/60 text-sm leading-relaxed px-4">
              Sign in to your workspace to continue your document audits.
            </p>
          </motion.div>

          <motion.div variants={item} className="space-y-3">
            <StepItem number="1" text="Sign in to your account" active />
            <StepItem number="2" text="Access your workspace" />
            <StepItem number="3" text="Audit with AI precision" />
          </motion.div>
        </motion.div>
      </div>

      {/* Right Column — Form */}
      <div className="flex-1 flex flex-col items-center justify-center py-12 lg:py-6 px-4 sm:px-12 lg:px-16 xl:px-24 overflow-y-auto lg:overflow-hidden">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="w-full max-w-xl space-y-8 lg:space-y-6 sm:space-y-10"
        >
          <div className="space-y-1">
            <h2 className="text-3xl font-medium tracking-tight">Sign In</h2>
            <p className="text-white/40 text-sm">Enter your credentials to access your dashboard.</p>
          </div>

          {wasExpired && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200"
            >
              <Shield size={16} weight="duotone" className="shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed">
                <p className="font-medium">You were signed out</p>
                <p className="text-amber-200/70">For your security, sessions expire after a period of inactivity. Sign in again to continue.</p>
              </div>
            </motion.div>
          )}

          <div className="grid grid-cols-1 gap-4">
            <button
              onClick={handleGithubLogoLogin}
              disabled={oauthLoading || !oAuthConfig?.github_client_id}
              className="flex items-center justify-center gap-2 w-full h-12 bg-black border border-white/10 rounded-xl text-sm font-medium text-white/80 hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              {oauthLoading ? <span className="w-4 h-4 rounded-full border border-white/30 border-t-white animate-spin" /> : <GithubLogo size={16} />}
              Sign in with GitHub
            </button>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs font-medium text-white/40 uppercase tracking-widest">Or</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs font-medium text-white/40 uppercase tracking-widest">Account</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-4">
            <InputGroup label="Email" placeholder="you@example.com" type="email" value={email} onChange={setEmail} />

            <InputGroup label="Password" placeholder="Enter password" type={showPassword ? "text" : "password"} value={password} onChange={setPassword} error={error}>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
              >
                {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
              </button>
            </InputGroup>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 md:h-14 bg-white text-black font-semibold rounded-xl hover:bg-white/90 active:scale-[0.98] mt-4 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <p className="text-center text-sm text-white/30">
            Don't have an account?{" "}
            <Link to="/register" className="text-white underline hover:text-white/80 transition-colors">
              Create one
            </Link>
          </p>
        </motion.div>
      </div>
    </main>
  );
}
