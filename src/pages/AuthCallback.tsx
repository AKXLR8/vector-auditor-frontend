import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

export default function AuthCallback() {
  const [params] = useSearchParams();

  useEffect(() => {
    const code = params.get("code");
    const state = params.get("state");

    const savedState = localStorage.getItem("oauth_state");
    localStorage.removeItem("oauth_state");

    if (!window.opener) {
      window.location.href = "/login";
      return;
    }

    if (code && state && state === savedState) {
      window.opener.postMessage({ provider: "github", code }, window.location.origin);
    }

    window.close();
  }, [params]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#000000]">
      <p className="text-sm text-[#6e7681]">Completing sign-in...</p>
    </main>
  );
}
