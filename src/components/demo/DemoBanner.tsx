"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock3, FlaskConical } from "lucide-react";

export default function DemoBanner({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const next = Math.max(0, new Date(expiresAt).getTime() - Date.now());
      setRemaining(next);
      if (!next) window.location.replace("/demo-ended");
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  const seconds = Math.floor((remaining ?? 0) / 1000);
  const label = remaining === null ? "--:--" : `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return <div className="erp-demo-banner relative z-40 flex min-h-10 items-center justify-center gap-2 bg-[#111827] px-3 py-2 text-center text-xs font-semibold text-white">
    <FlaskConical size={14} className="text-lime-300"/>
    <span>Demo workspace · fictional sample data</span>
    <span className="hidden text-slate-300 sm:inline">•</span>
    <span className="erp-demo-clock inline-flex items-center justify-center gap-1 text-lime-300"><Clock3 size={13}/>{label} remaining</span>
    <Link href="/demo-info" className="ml-1 underline decoration-white/50 underline-offset-4 hover:decoration-white">Limits</Link>
  </div>;
}
