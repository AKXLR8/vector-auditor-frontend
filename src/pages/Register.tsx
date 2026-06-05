import { useState, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { fetchOAuthConfig } from "../api/auth";
import {
  Eye, EyeSlash, GithubLogo,
} from "@phosphor-icons/react";

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
  label: string; placeholder: string; type: string; value: string; onChange: (v: string) => void; error?: string; children?: ReactNode;
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

export default function Register() {
  const { isAuthenticated, register, oauthLogin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) navigate("/chat", { replace: true });
  }, [isAuthenticated, navigate]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
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
        oauthLogin("github", code).then(() => navigate("/chat")).catch((err: any) => {
          const detail = err.response?.data?.detail;
          setError(Array.isArray(detail) ? detail.map((d: any) => d.msg).filter(Boolean).join(", ") : detail || "GitHub signup failed");
        }).finally(() => setOauthLoading(false));
      }
    };
    window.addEventListener("message", oauthListener.current);
    return () => {
      if (oauthListener.current) window.removeEventListener("message", oauthListener.current);
    };
  }, [oauthLogin, navigate]);

  const handleGithubLogoSignup = () => {
    if (!oAuthConfig?.github_client_id) return;
    const state = crypto.randomUUID();
    localStorage.setItem("oauth_state", state);
    const redirectUri = `${window.location.origin}/auth/callback`;
    const width = 600, height = 700;
    const left = window.screenX + (window.innerWidth - width) / 2;
    const top = window.screenY + (window.innerHeight - height) / 2;
    window.open(
      `https://github.com/login/oauth/authorize?client_id=${oAuthConfig.github_client_id}&redirect_uri=${redirectUri}&scope=user:email&state=${state}`,
      "github-oauth",
      `width=${width},height=${height},left=${left},top=${top}`
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setLoading(true);
    try {
      await register(email, password);
      toast.success("Account created! Please sign in.");
      navigate("/login");
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (Array.isArray(detail)) {
        setError(detail.map((d: any) => d.msg).filter(Boolean).join(", "));
      } else {
        setError(detail || "Registration failed");
      }
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
          {/* Brand */}
          <motion.div variants={item} className="flex items-center gap-2">
            <img src="/logo.png" alt="Logo" className="w-5 h-5 object-contain" />
            <span className="text-xl font-semibold tracking-tight">Vector Auditor</span>
          </motion.div>

          {/* Heading */}
          <motion.div variants={item} className="space-y-3">
            <h1 className="text-4xl font-medium tracking-tight whitespace-nowrap">Join Vector Auditor</h1>
            <p className="text-white/60 text-sm leading-relaxed px-4">
              Follow these 3 quick phases to activate your workspace.
            </p>
          </motion.div>

          {/* Steps */}
          <motion.div variants={item} className="space-y-3">
            <StepItem number="1" text="Register your identity" active />
            <StepItem number="2" text="Configure your studio" />
            <StepItem number="3" text="Finalize your profile" />
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
          {/* Header */}
          <div className="space-y-1">
            <h2 className="text-3xl font-medium tracking-tight">Create New Profile</h2>
            <p className="text-white/40 text-sm">Input your basic details to begin the journey.</p>
          </div>

          {/* Social buttons */}
          <div className="grid grid-cols-1 gap-4">
            <button
              onClick={handleGithubLogoSignup}
              disabled={oauthLoading || !oAuthConfig?.github_client_id}
              className="flex items-center justify-center gap-2 w-full h-11 bg-black border border-white/10 rounded-xl text-sm font-medium text-white/80 hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {oauthLoading ? <span className="w-4 h-4 rounded-full border border-white/30 border-t-white animate-spin" /> : <GithubLogo size={16} />}
              Sign up with GitHub
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs font-medium text-white/40 uppercase tracking-widest">Or</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <InputGroup label="First Name" placeholder="John" type="text" value={firstName} onChange={setFirstName} />
              <InputGroup label="Last Name" placeholder="Doe" type="text" value={lastName} onChange={setLastName} />
            </div>

            <InputGroup label="Email" placeholder="john@example.com" type="email" value={email} onChange={setEmail} />

            <InputGroup label="Password" placeholder="Enter password" type={showPassword ? "text" : "password"} value={password} onChange={setPassword} error={error}>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
              >
                {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
              </button>
            </InputGroup>
            <p className="text-xs text-white/20 -mt-3">Requires at least 8 symbols.</p>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-14 bg-white text-black font-semibold rounded-xl hover:bg-white/90 active:scale-[0.98] mt-4 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Creating Account..." : "Create Account"}
            </button>
          </form>

          {/* Footer */}
          <p className="text-center text-sm text-white/30">
            Member of the team?{" "}
            <Link to="/login" className="text-white underline hover:text-white/80 transition-colors">
              Log in
            </Link>
          </p>
        </motion.div>
      </div>
    </main>
  );
}
