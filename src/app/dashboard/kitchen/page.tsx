"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast, Toaster } from "sonner";
import { ChefHat, Clock, Loader2, Check, Volume2, VolumeX } from "lucide-react";

/* ========================================================== */

interface Ticket {
  id: number;
  orderNumber: string;
  type: string;
  status: string;
  createdAt: string;
  table: { id: number; name: string } | null;
  items: {
    id: number;
    nameSnapshot: string;
    quantity: number;
    status: string;
    notes: string | null;
    menuItem: { id: number; name: string; preparationTime: number | null };
  }[];
}

const ITEM_FLOW = ["PENDING", "PREPARING", "READY", "SERVED"];

const ITEM_COLORS: Record<string, string> = {
  PENDING: "bg-gray-100 text-gray-700",
  PREPARING: "bg-yellow-100 text-yellow-700",
  READY: "bg-green-100 text-green-700",
  SERVED: "bg-blue-100 text-blue-700",
};

function minutesAgo(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

async function getError(res: Response) {
  try {
    const data = await res.json();
    return data.message || "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
}

/* ========================================================== */

export default function KitchenPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [, forceTick] = useState(0);
  const busyRef = useRef(new Set<number>());
  const knownTicketIds = useRef(new Set<number>());
  const [liveMode, setLiveMode] = useState<"LIVE" | "FALLBACK">("LIVE");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/owner/kitchen", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message);
      setTickets(data.data);
    } catch (err) {
      if (!silent) toast.error(err instanceof Error ? err.message : "Failed to load tickets.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    let fallback: ReturnType<typeof setInterval> | undefined;
    const source = new EventSource("/api/owner/kitchen/stream");
    source.addEventListener("tickets", (event) => {
      try {
        const next = JSON.parse((event as MessageEvent).data) as Ticket[];
        const incoming = next.filter((ticket) => !knownTicketIds.current.has(ticket.id));
        if (knownTicketIds.current.size && incoming.length) {
          if (soundEnabled && audioContextRef.current) {
            try { const ctx = audioContextRef.current; const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.connect(gain); gain.connect(ctx.destination); osc.frequency.value = 880; gain.gain.value = 0.06; osc.start(); osc.stop(ctx.currentTime + 0.16); } catch {}
          }
          toast.info(`${incoming.length} new kitchen ticket${incoming.length === 1 ? "" : "s"}.`);
        }
        knownTicketIds.current = new Set(next.map((ticket) => ticket.id));
        setTickets(next); setLoading(false); setLiveMode("LIVE");
      } catch {}
    });
    source.onerror = () => {
      setLiveMode("FALLBACK");
      if (!fallback) fallback = setInterval(() => load(true), 5000);
    };
    const clock = setInterval(() => forceTick((n) => n + 1), 15000);
    return () => { source.close(); if (fallback) clearInterval(fallback); clearInterval(clock); };
  }, [load, soundEnabled]);

  async function toggleSound() {
    if (soundEnabled) { setSoundEnabled(false); return; }
    try {
      const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return toast.error("Audio alerts are not supported in this browser.");
      const ctx = audioContextRef.current || new AudioContextCtor();
      audioContextRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();
      setSoundEnabled(true);
      const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.connect(gain); gain.connect(ctx.destination); osc.frequency.value = 660; gain.gain.value = 0.04; osc.start(); osc.stop(ctx.currentTime + 0.1);
      toast.success("Kitchen sound alerts enabled.");
    } catch { toast.error("Could not enable sound alerts."); }
  }

  async function advanceItem(orderId: number, item: Ticket["items"][number]) {
    const idx = ITEM_FLOW.indexOf(item.status);
    const next = ITEM_FLOW[idx + 1];
    if (!next) return;

    const key = item.id;
    if (busyRef.current.has(key)) return;
    busyRef.current.add(key);

    try {
      const res = await fetch(`/api/owner/order/${orderId}/item/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error(await getError(res));
      await load(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update item.");
    } finally {
      busyRef.current.delete(key);
    }
  }

  return (
    <div className="erp-page erp-page-kitchen erp-kds-shell min-h-full bg-gray-900 p-6 text-white">
      <Toaster position="top-right" />

      <div className="mb-6 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ChefHat className="h-6 w-6" /> Kitchen Display
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={toggleSound} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${soundEnabled ? "bg-emerald-500/15 text-emerald-300" : "bg-gray-800 text-gray-400"}`}>{soundEnabled ? <Volume2 className="h-3.5 w-3.5"/> : <VolumeX className="h-3.5 w-3.5"/>}{soundEnabled ? "Sound on" : "Enable sound"}</button>
          <span className="rounded-full bg-gray-800 px-3 py-1 text-xs text-gray-400">{liveMode === "LIVE" ? "Live sync" : "Fallback · 5s"}</span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 p-16 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading tickets...
        </div>
      ) : tickets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-700 p-16 text-center text-gray-500">
          <ChefHat className="mx-auto mb-2 h-10 w-10" />
          No active tickets. New orders will appear here automatically.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tickets.map((ticket) => {
            const age = minutesAgo(ticket.createdAt);
            const urgent = age >= 15;
            return (
              <div
                key={ticket.id}
                className={`rounded-2xl border bg-gray-800 p-4 shadow-lg ${
                  urgent ? "border-red-500" : "border-gray-700"
                }`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="font-bold">
                      #{ticket.orderNumber}
                      {ticket.table ? ` · ${ticket.table.name}` : ""}
                    </p>
                    <p className="text-xs text-gray-400">{ticket.type.replace("_", " ")}</p>
                  </div>
                  <span
                    className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      urgent ? "bg-red-500/20 text-red-400" : "bg-gray-700 text-gray-300"
                    }`}
                  >
                    <Clock className="h-3 w-3" />
                    {age}m
                  </span>
                </div>

                <div className="space-y-2">
                  {ticket.items.map((item) => {
                    const isFinal = item.status === "SERVED";
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between rounded-lg bg-gray-900/60 p-2.5"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            {item.quantity}× {item.nameSnapshot}
                          </p>
                          {item.notes && <p className="text-xs text-gray-400">{item.notes}</p>}
                        </div>
                        <button
                          disabled={isFinal}
                          onClick={() => advanceItem(ticket.id, item)}
                          className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition ${ITEM_COLORS[item.status]} ${
                            isFinal ? "cursor-default opacity-70" : "hover:brightness-95"
                          }`}
                        >
                          {isFinal && <Check className="h-3 w-3" />}
                          {item.status}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
