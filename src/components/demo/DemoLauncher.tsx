"use client";

import { useState } from "react";
import { ArrowRight, Loader2, Play } from "lucide-react";

export default function DemoLauncher() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  async function start() {
    setLoading(true); setMessage("");
    try {
      for (let attempt = 0; attempt < 6; attempt++) {
        const response = await fetch("/api/demo/start", { method: "POST", headers: { "Content-Type": "application/json" } });
        const body = await response.json();
        if (body.code === "DEMO_USED") { window.location.assign("/demo-ended"); return; }
        if (body.code === "DEMO_PROVISIONING") { await new Promise(resolve => window.setTimeout(resolve, 700)); continue; }
        if (!response.ok) throw new Error(body.message || "Demo could not be started.");
        window.location.assign(body.data.redirectTo); return;
      }
      throw new Error("The workspace is taking longer than expected. Please try again shortly.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Demo could not be started."); setLoading(false); }
  }
  return <div><button onClick={start} disabled={loading} className="inline-flex h-13 items-center justify-center gap-2 rounded-xl bg-lime-300 px-6 text-sm font-extrabold text-slate-950 shadow-[0_16px_35px_rgba(190,242,100,.18)] transition hover:-translate-y-0.5 hover:bg-lime-200 disabled:cursor-wait disabled:opacity-70">{loading?<Loader2 size={17} className="animate-spin"/>:<Play size={16} fill="currentColor"/>}{loading?"Preparing your workspace…":"Try live demo"}<ArrowRight size={16}/></button>{message?<p role="alert" className="mt-3 max-w-sm text-sm leading-6 text-rose-300">{message}</p>:null}</div>;
}
