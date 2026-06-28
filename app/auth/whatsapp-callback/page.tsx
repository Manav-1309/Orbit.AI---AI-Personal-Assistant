"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

export default function WhatsAppCallbackPage() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [dots, setDots] = useState(".");
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const successRef = useRef(false);

  // Animated dots for loading text
  useEffect(() => {
    const dotsInterval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "." : d + "."));
    }, 500);
    return () => clearInterval(dotsInterval);
  }, []);

  // Poll for WhatsApp connection status
  useEffect(() => {
    if (!user) return;

    const poll = async () => {
      if (successRef.current) return;
      try {
        const res = await fetch("/api/whatsapp-connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "status", userId: user.id }),
        });

        if (!res.ok) return;
        const data = await res.json();

        if (data.status === "connected" && !successRef.current) {
          successRef.current = true;
          if (pollRef.current) clearInterval(pollRef.current);
          await refreshUser();
          setStatus("success");
          setTimeout(() => {
            router.push("/dashboard?tab=integrations");
          }, 2000);
        }
      } catch (e) {
        console.error("WhatsApp callback poll error:", e);
      }
    };

    // Poll immediately then every 1.5s
    poll();
    pollRef.current = setInterval(poll, 1500);

    // Timeout after 30s → show error
    const timeout = setTimeout(() => {
      if (!successRef.current) {
        setStatus("error");
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 30000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      clearTimeout(timeout);
    };
  }, [user, router, refreshUser]);

  return (
    <div className="min-h-screen text-slate-200 bg-[#030712] relative overflow-hidden font-sans flex items-center justify-center px-6">
      {/* Background glows — matches Gmail callback */}
      <div className="absolute top-[30%] left-[30%] w-[40%] h-[40%] rounded-full bg-emerald-900/10 filter blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute inset-0 grid-bg opacity-30 pointer-events-none z-0" />

      <div className="w-full max-w-sm glass-premium rounded-3xl p-8 relative z-10 text-center space-y-6 border border-white/5 shadow-2xl">

        {/* Loading state */}
        {status === "loading" && (
          <div className="py-6 space-y-4">
            <div className="relative mx-auto w-14 h-14">
              <div className="absolute inset-0 rounded-full border-2 border-dashed border-emerald-500 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 text-emerald-400 fill-current">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.532 5.848L.054 23.05a.75.75 0 00.919.919l5.255-1.488A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.95 0-3.77-.52-5.34-1.427l-.383-.228-3.963 1.122 1.093-3.888-.245-.4A9.956 9.956 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
                  </svg>
                </div>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Connecting WhatsApp Account</h3>
              <p className="text-[11px] text-slate-500 mt-1">
                Verifying device link with WhatsApp servers{dots}
              </p>
            </div>
            <div className="flex items-center justify-center space-x-1.5 pt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}

        {/* Success state */}
        {status === "success" && (
          <div className="py-6 space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">WhatsApp Synced Successfully</h3>
              <p className="text-[11px] text-slate-500 mt-1">Returning you to the integrations panel...</p>
            </div>
          </div>
        )}

        {/* Error state */}
        {status === "error" && (
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-white">Connection Timed Out</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              WhatsApp didn't confirm the link in time. Please try again from the Integrations panel.
            </p>
            <button
              onClick={() => router.push("/dashboard?tab=integrations")}
              className="w-full py-2.5 px-4 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-semibold border border-white/5 transition"
            >
              Back to Integrations
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
