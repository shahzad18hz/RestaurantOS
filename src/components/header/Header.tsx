"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bell, ChevronDown, LogOut, Menu, Search, Settings, UserRound, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { MENU, MenuItem } from "@/components/navigation/menu";
import { matchesPrefix, DEMO_BLOCKED_DASHBOARD_PREFIXES } from "@/lib/demo-policy";

interface UserType { id: number; name: string; email: string; role: string; isDemo?: boolean; }
function getInitials(name?: string) { if (!name) return "U"; const p=name.trim().split(" "); return (p.length>1 ? p[0][0]+p[1][0] : p[0].slice(0,2)).toUpperCase(); }
function pageTitle(pathname:string) { const part=pathname.split("/").filter(Boolean).pop() || "dashboard"; return part.replaceAll("-"," ").replace(/\b\w/g,c=>c.toUpperCase()); }
function flatten(items: MenuItem[]) { return items.flatMap(i => i.children ? i.children : [i]).filter(i => i.href !== "#"); }

export default function Header() {
  const pathname = usePathname();
  const [user,setUser]=useState<UserType|null>(null);
  const [unreadNotifications,setUnreadNotifications]=useState(0);
  const [searchOpen,setSearchOpen]=useState(false);
  const [profileOpen,setProfileOpen]=useState(false);
  const [query,setQuery]=useState("");
  const profileRef=useRef<HTMLDivElement>(null);

  useEffect(()=>{ (async()=>{try{const r=await fetch("/api/auth/me",{credentials:"include"});if(r.ok){const d=await r.json();setUser(d.user)}}catch(e){console.error(e)}})();},[]);
  useEffect(()=>{async function load(){try{const r=await fetch("/api/owner/notifications?pageSize=1",{cache:"no-store"});if(r.ok){const d=await r.json();if(d.success)setUnreadNotifications(d.unreadCount??0)}}catch(e){console.error(e)}} load();const i=window.setInterval(load,60000);return()=>window.clearInterval(i)},[]);
  useEffect(()=>{ const close=(e:MouseEvent)=>{if(profileRef.current&&!profileRef.current.contains(e.target as Node)) setProfileOpen(false)}; document.addEventListener("mousedown",close); return()=>document.removeEventListener("mousedown",close)},[]);
  useEffect(()=>{ const key=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();setSearchOpen(true)}}; window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key)},[]);
  async function logout(){await fetch("/api/auth/logout",{method:"POST"});window.location.href="/login";}

  const items=useMemo(()=>flatten(MENU[user?.role || "OWNER"] || MENU.OWNER || []).filter(item => !user?.isDemo || !matchesPrefix(item.href, DEMO_BLOCKED_DASHBOARD_PREFIXES)),[user?.role,user?.isDemo]);
  const results=useMemo(()=>{const q=query.trim().toLowerCase(); return (q?items.filter(i=>i.title.toLowerCase().includes(q)):items.slice(0,8)).slice(0,8)},[items,query]);

  return <>
    <header className="erp-header sticky top-0 z-30 flex min-h-[72px] items-center justify-between gap-3 border-b border-slate-200/80 bg-white/90 px-3 backdrop-blur-xl sm:px-5 xl:px-7">
      <div className="flex min-w-0 items-center gap-3">
        <button aria-label="Open navigation" onClick={()=>window.dispatchEvent(new Event("erp:open-sidebar"))} className="ui-icon-btn lg:hidden"><Menu size={20}/></button>
        <div className="min-w-0"><p className="hidden text-[11px] font-semibold text-slate-400 sm:block">Restaurant workspace</p><h2 className="truncate text-[19px] font-extrabold tracking-[-.025em] text-slate-900">{pageTitle(pathname)}</h2></div>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2">
        <button onClick={()=>setSearchOpen(true)} className="hidden h-10 min-w-[220px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 text-left text-sm text-slate-400 transition hover:border-blue-200 hover:bg-white md:flex"><Search size={16}/><span className="flex-1">Find a page...</span><kbd className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">⌘K</kbd></button>
        <button onClick={()=>setSearchOpen(true)} aria-label="Find a page" className="ui-icon-btn md:hidden"><Search size={18}/></button>
        <Link href="/dashboard/notifications" aria-label="Notifications" className="ui-icon-btn relative"><Bell size={18}/>{unreadNotifications>0&&<span className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-[#1463ff] px-1 text-[9px] font-bold text-white ring-2 ring-white">{unreadNotifications>99?"99+":unreadNotifications}</span>}</Link>
        <div className="relative" ref={profileRef}>
          <button onClick={()=>setProfileOpen(v=>!v)} className="flex h-11 items-center gap-2 rounded-xl px-1.5 transition hover:bg-slate-50 sm:px-2" aria-expanded={profileOpen}>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#1463ff] to-[#5c8cff] text-xs font-extrabold text-white shadow-sm">{getInitials(user?.name)}</div>
            <div className="hidden max-w-32 text-left leading-tight xl:block"><p className="truncate text-[13px] font-bold text-slate-800">{user?.name??"Loading..."}</p><p className="truncate text-[11px] capitalize text-slate-400">{user?.role?.replaceAll("_"," ").toLowerCase()??"—"}</p></div><ChevronDown size={14} className="hidden text-slate-400 sm:block"/>
          </button>
          {profileOpen&&<div className="absolute right-0 top-[calc(100%+8px)] w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_50px_rgba(15,23,42,.14)]">
            <div className="border-b border-slate-100 px-3 py-2.5"><p className="truncate text-sm font-bold text-slate-800">{user?.name}</p><p className="truncate text-xs text-slate-400">{user?.email}</p></div>
            {!user?.isDemo && <Link href="/dashboard/owner-profile" className="ui-menu-action" onClick={()=>setProfileOpen(false)}><UserRound size={16}/>My profile</Link>}
            {!user?.isDemo && <Link href="/dashboard/settings" className="ui-menu-action" onClick={()=>setProfileOpen(false)}><Settings size={16}/>Settings</Link>}
            <button onClick={logout} className="ui-menu-action w-full text-rose-600 hover:bg-rose-50"><LogOut size={16}/>Sign out</button>
          </div>}
        </div>
      </div>
    </header>

    {searchOpen&&<div className="fixed inset-0 z-[80] flex items-start justify-center bg-slate-950/35 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={(e)=>{if(e.currentTarget===e.target)setSearchOpen(false)}}>
      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-white/50 bg-white shadow-[0_30px_90px_rgba(15,23,42,.24)]">
        <div className="flex items-center gap-3 border-b border-slate-100 px-4"><Search className="text-slate-400" size={20}/><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search orders, inventory, reports..." className="h-14 flex-1 border-0 bg-transparent text-[15px] outline-none placeholder:text-slate-400"/><button onClick={()=>setSearchOpen(false)} className="ui-icon-btn h-8 w-8"><X size={16}/></button></div>
        <div className="max-h-[55vh] overflow-y-auto p-2"><p className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">{query?"Matching pages":"Quick navigation"}</p>{results.length?results.map(i=>{const Icon=i.icon;return <Link key={i.href} href={i.href} onClick={()=>{setSearchOpen(false);setQuery("")}} className="flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-[#edf4ff]"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Icon size={17}/></span><span className="text-sm font-semibold text-slate-700">{i.title}</span></Link>}):<div className="px-4 py-8 text-center text-sm text-slate-400">No page found. Try another keyword.</div>}</div>
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-[11px] text-slate-400">Tip: press Ctrl/⌘ + K anywhere to jump between pages.</div>
      </div>
    </div>}
  </>;
}
