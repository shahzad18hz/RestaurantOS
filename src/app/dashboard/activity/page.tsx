"use client";
import { useEffect, useState } from "react";
import { Activity, Loader2, ShieldCheck } from "lucide-react";

type Log = { id:number; action:string; entity:string; entityId:string|null; details:unknown; createdAt:string; actorName:string|null; actorEmail:string };
export default function ActivityPage(){
 const [logs,setLogs]=useState<Log[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState("");
 useEffect(()=>{fetch("/api/owner/audit-log?limit=100",{cache:"no-store"}).then(async r=>{const j=await r.json(); if(!r.ok||!j.success) throw new Error(j.message); setLogs(j.data)}).catch(e=>setError(e.message||"Failed to load activity.")).finally(()=>setLoading(false))},[]);
 return <div className="erp-page space-y-6 p-6"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-blue-600">Trust & accountability</p><h1 className="mt-1 flex items-center gap-2 text-3xl font-bold"><Activity className="h-7 w-7"/> Activity log</h1><p className="mt-1 text-slate-500">See who changed important operational settings and transactions.</p></div>
 {loading?<div className="rounded-2xl border bg-white p-12 text-center text-slate-500"><Loader2 className="mx-auto mb-2 animate-spin"/>Loading activity...</div>:error?<div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900"><ShieldCheck className="mb-2"/><b>Audit log needs setup</b><p className="mt-1 text-sm">{error}</p></div>:logs.length===0?<div className="rounded-2xl border border-dashed bg-white p-12 text-center text-slate-500">No tracked activity yet. New billing, table and settings changes will appear here.</div>:<div className="overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="divide-y">{logs.map(log=><div key={log.id} className="grid gap-2 p-4 md:grid-cols-[180px_1fr_190px]"><div><p className="font-semibold text-slate-900">{log.action.replaceAll("_"," ")}</p><p className="text-xs text-slate-500">{log.entity}{log.entityId?` #${log.entityId}`:""}</p></div><div><p className="text-sm font-medium">{log.actorName||log.actorEmail}</p><p className="text-xs text-slate-500">{log.actorEmail}</p></div><time className="text-sm text-slate-500 md:text-right">{new Date(log.createdAt).toLocaleString()}</time></div>)}</div></div>}
 </div>
}
