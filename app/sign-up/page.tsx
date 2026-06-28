"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { insforge } from "@/lib/insforge";
import { useAuth } from "@/components/auth-provider";

export default function SignUp() {
  const router = useRouter();
  const { refreshUser } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data, error: signUpError } = await insforge.auth.signUp({
        email,
        password,
        name,
        redirectTo: window.location.origin + "/auth/callback",
      });
      if (signUpError) throw signUpError;

      const { data: signInData, error: signInError } = await insforge.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;

      if (signInData?.accessToken) {
        await refreshUser();
        router.push("/");
      }
    } catch (err: any) {
      setError(err.message || "Failed to create account. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setLoading(true);
    setError(null);
    try {
      const { error: oAuthError } = await insforge.auth.signInWithOAuth("google", {
        redirectTo: window.location.origin + "/auth/callback",
      });
      if (oAuthError) throw oAuthError;
    } catch (err: any) {
      setError(err.message || "Failed to start Google Sign-Up.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen text-slate-200 bg-[#030712] relative overflow-hidden font-sans flex items-center justify-center px-6 py-12">
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-purple-900/15 animate-pulse-glow z-0 pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-900/15 animate-pulse-glow z-0 pointer-events-none" style={{ animationDelay: "2s" }}></div>
      <div className="absolute inset-0 grid-bg opacity-40 pointer-events-none z-0"></div>

      <div className="w-full max-w-md glass-premium rounded-3xl p-8 sm:p-10 relative z-10 shadow-2xl shadow-purple-950/20 border border-white/5">
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-8">
          <Link href="/" className="flex items-center space-x-2.5 group mb-4">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-blue-500 flex items-center justify-center shadow-lg shadow-purple-900/40 group-hover:scale-105 transition-transform duration-300">
              <svg className="w-5 h-5 text-white animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-xl font-bold tracking-tight text-white group-hover:text-purple-400 transition-colors duration-300">
              OmniSync<span className="text-purple-500">.ai</span>
            </span>
          </Link>
          <h2 className="text-xl font-bold text-white tracking-tight">Create Account</h2>
          <p className="text-slate-400 text-xs mt-1.5 text-center">
            Sign up to build your unified cognitive workspace.
          </p>
        </div>

        {error && (
          <div className="p-4 bg-rose-500/10 rounded-xl border border-rose-500/20 text-xs text-rose-400 mb-6 flex items-start space-x-2">
            <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Google Button */}
        <button
          onClick={handleGoogleSignUp}
          disabled={loading}
          type="button"
          className="w-full flex items-center justify-center space-x-2.5 py-3 px-4 bg-white/5 hover:bg-white/10 active:bg-white/5 border border-white/10 hover:border-white/20 rounded-xl text-slate-200 text-sm font-semibold transition duration-200 cursor-pointer shadow-md mb-6"
        >
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
          </svg>
          <span>Register with Google</span>
        </button>

        {/* Separator */}
        <div className="flex items-center my-6">
          <div className="flex-1 h-px bg-white/10"></div>
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider px-3">or email details</span>
          <div className="flex-1 h-px bg-white/10"></div>
        </div>

        {/* Sign Up Form */}
        <form onSubmit={handleSignUp} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Display Name</label>
            <input
              type="text"
              required
              disabled={loading}
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 bg-black/40 border border-white/10 hover:border-white/20 focus:border-purple-500 rounded-xl text-white text-sm focus:outline-none transition"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Email Address</label>
            <input
              type="email"
              required
              disabled={loading}
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-black/40 border border-white/10 hover:border-white/20 focus:border-purple-500 rounded-xl text-white text-sm focus:outline-none transition"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Password</label>
            <input
              type="password"
              required
              disabled={loading}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-black/40 border border-white/10 hover:border-white/20 focus:border-purple-500 rounded-xl text-white text-sm focus:outline-none transition"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 px-6 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-xl text-sm transition duration-200 transform active:scale-[0.98] cursor-pointer flex items-center justify-center"
          >
            {loading ? (
              <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : "Create Account"}
          </button>
        </form>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-white/5 text-center text-xs text-slate-400 flex flex-col space-y-2.5">
          <span>
            Already have an account?{" "}
            <Link href="/sign-in" className="text-purple-400 hover:text-purple-300 font-semibold transition">
              Sign In
            </Link>
          </span>
          <Link href="/" className="text-slate-500 hover:text-slate-400 transition flex items-center justify-center space-x-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back to landing page</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
