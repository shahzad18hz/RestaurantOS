"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Sparkles, UtensilsCrossed, X } from "lucide-react";
import { MENU, MenuItem } from "../navigation/menu";

type Props = { role: keyof typeof MENU; isDemo?: boolean };

type NavGroup = { label: string; items: MenuItem[] };
const OWNER_GROUPS: { label: string; titles: string[] }[] = [
  { label: "Overview", titles: ["Dashboard"] },
  { label: "Daily Operations", titles: ["POS","Orders","Kitchen","Reservations","Tables"] },
  { label: "Restaurant", titles: ["Menu","Categories","Inventory","Suppliers","Purchases"] },
  { label: "People", titles: ["Customers","Staff"] },
  { label: "Business", titles: ["Billing","Expenses","Finance","Reports"] },
  { label: "Workspace", titles: ["Notifications","Email & SMS","Roles & Permissions","Restaurant Profile","Owner Profile","Settings"] },
];

function groupMenus(role:string, menus:MenuItem[]):NavGroup[]{
  if(role!=="OWNER") return [{label:"Workspace",items:menus}];
  return OWNER_GROUPS.map(g=>({label:g.label,items:g.titles.map(t=>menus.find(m=>m.title===t)).filter(Boolean) as MenuItem[]})).filter(g=>g.items.length);
}

export default function Sidebar({ role, isDemo = false }: Props) {
  const pathname = usePathname();
  const demoNavigation = new Set(["Dashboard", "Menu", "POS", "Orders", "Kitchen", "Billing", "Inventory"]);
  const menus = (MENU[role] ?? []).filter(item => !isDemo || demoNavigation.has(item.title));
  const groups=useMemo(()=>groupMenus(String(role),menus),[role,menus]);
  const [openMenus, setOpenMenus] = useState<string[]>(["Restaurant Management"]);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { const open = () => setMobileOpen(true); window.addEventListener("erp:open-sidebar", open); return () => window.removeEventListener("erp:open-sidebar", open); }, []);
  useEffect(() => setMobileOpen(false), [pathname]);
  function toggleMenu(title: string) { setOpenMenus((prev) => prev.includes(title) ? prev.filter((x) => x !== title) : [...prev, title]); }

  const renderItem=(item:MenuItem)=>{
    const Icon=item.icon; const isOpen=openMenus.includes(item.title);
    const active=pathname===item.href || (item.href!=="#"&&pathname.startsWith(item.href+"/"));
    if(item.children){
      const groupActive=item.children.some(c=>pathname===c.href||pathname.startsWith(c.href+"/"));
      return <div key={item.title}><button onClick={()=>toggleMenu(item.title)} title={collapsed?item.title:undefined} className={`nav-item w-full ${groupActive?"nav-item-active":""} ${collapsed?"justify-center":""}`}><Icon size={18}/>{!collapsed&&<><span className="flex-1 text-left">{item.title}</span><ChevronDown size={15} className={`transition-transform ${isOpen?"rotate-180":""}`}/></>}</button>{!collapsed&&<div className={`grid transition-all duration-200 ${isOpen?"grid-rows-[1fr] opacity-100":"grid-rows-[0fr] opacity-0"}`}><div className="overflow-hidden"><div className="ml-5 mt-1 space-y-1 border-l border-white/10 pl-3">{item.children.map(child=>{const ChildIcon=child.icon; const ca=pathname===child.href||pathname.startsWith(child.href+"/");return <Link key={child.href} href={child.href} className={`nav-child ${ca?"nav-child-active":""}`}><ChildIcon size={14}/><span>{child.title}</span></Link>})}</div></div></div>}</div>
    }
    return <Link key={item.href} href={item.href} title={collapsed?item.title:undefined} className={`nav-item ${active?"nav-item-active":""} ${collapsed?"justify-center":""}`}><Icon size={18}/>{!collapsed&&<span className="truncate">{item.title}</span>}</Link>
  };

  return <>
    {mobileOpen&&<button aria-label="Close navigation" onClick={()=>setMobileOpen(false)} className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-sm lg:hidden"/>}
    <aside className={`erp-sidebar fixed inset-y-0 left-0 z-50 flex h-dvh flex-col overflow-hidden bg-[#0f172a] text-white shadow-[18px_0_60px_rgba(15,23,42,.12)] transition-[width,transform] duration-300 lg:sticky lg:top-0 lg:translate-x-0 ${collapsed?"lg:w-[80px]":"lg:w-[268px]"} ${mobileOpen?"w-[292px] translate-x-0":"w-[292px] -translate-x-full"}`}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-[radial-gradient(circle_at_20%_0%,rgba(99,102,241,.20),transparent_70%)]"/>
      <div className="relative flex h-[72px] shrink-0 items-center gap-3 border-b border-white/[.07] px-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1463ff] text-white shadow-lg shadow-indigo-950/20"><UtensilsCrossed size={20}/></div>
        {!collapsed&&<div className="min-w-0 flex-1"><h1 className="truncate text-[16px] font-extrabold tracking-[-.02em]">Plateful ERP</h1><div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-semibold text-slate-400"><Sparkles size={10} className="text-[#b9ff3f]"/>Restaurant management</div></div>}
        <button onClick={()=>setMobileOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"><X size={18}/></button>
      </div>

      <nav className="relative flex-1 overflow-y-auto px-3 py-4 [scrollbar-color:rgba(148,163,184,.25)_transparent] [scrollbar-width:thin]">
        {groups.map((group,gi)=><div key={group.label} className={gi?"mt-5":""}>{!collapsed&&<p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-slate-500">{group.label}</p>}<div className="space-y-1">{group.items.map(renderItem)}</div></div>)}
      </nav>

      <div className="relative border-t border-white/[.07] p-3">
        {!collapsed&&<div className="mb-2 flex items-center gap-3 rounded-xl bg-white/[.045] px-3 py-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#b9ff3f]/10 text-[#b9ff3f]"><CircleHelp size={16}/></span><div className="min-w-0"><p className="text-xs font-bold text-slate-200">Need help?</p><p className="text-[10px] text-slate-500">Use page search with Ctrl + K</p></div></div>}
        <button onClick={()=>setCollapsed(v=>!v)} className="hidden w-full items-center justify-center rounded-xl py-2 text-slate-500 transition hover:bg-white/[.055] hover:text-white lg:flex" aria-label={collapsed?"Expand navigation":"Collapse navigation"}>{collapsed?<ChevronRight size={17}/>:<ChevronLeft size={17}/>}</button>
      </div>
    </aside>

    {String(role)==="OWNER"&&<nav className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-4 rounded-2xl border border-slate-200/80 bg-white/95 p-1.5 shadow-[0_14px_40px_rgba(15,23,42,.18)] backdrop-blur-xl lg:hidden">{[
      ["Dashboard","/dashboard",MENU.OWNER.find(i=>i.title==="Dashboard")?.icon],
      ["POS","/dashboard/pos",MENU.OWNER.find(i=>i.title==="POS")?.icon],
      ["Orders","/dashboard/orders",MENU.OWNER.find(i=>i.title==="Orders")?.icon],
      ["Menu","/dashboard/menu",MENU.OWNER.find(i=>i.title==="Menu")?.icon]
    ].map(([title,href,Icon])=>{const active=pathname===href; const C=Icon as MenuItem["icon"]; return <Link href={href as string} key={title as string} className={`flex flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-bold transition ${active?"bg-[#edf4ff] text-[#1463ff]":"text-slate-500"}`}><C size={18}/><span>{title as string}</span></Link>})}</nav>}
  </>;
}
