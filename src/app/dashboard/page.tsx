"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, Clock3, Package, Plus, ShoppingCart, Sparkles, TrendingUp, Users, WalletCards } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useRestaurantSettings } from "@/hooks/useRestaurantSettings";

type DashboardData = {
  isDemo?: boolean;
  orders: { total: number; today: number; pending: number; completed: number; cancelled: number };
  revenue: { today: number; monthly: number; expenses: number; profit: number };
  counts: { customers: number; staff: number; menuItems: number; categories: number; inventoryItems: number; suppliers: number };
  tables: { active: number; occupied: number };
  inventory: { lowStock: number; outOfStock: number };
  charts: { trend: { date: string; revenue: number; expenses: number }[]; orderStatuses: Record<string, number>; topSelling: { name: string; quantity: number }[] };
  recent: { orders: { id: number; orderNumber: string; status: string; totalAmount: number; customerName: string | null }[]; reservations: { id: number; reservationNumber: string; customerName: string; status: string }[]; payments: { id: number; transactionId: string; amount: number; status: string }[]; expenses: { id: number; title: string; amount: number; status: string }[]; customers: { id: number; name: string; phone: string }[] };
  alerts: { pendingReservations: number; failedPayments: number; unreadNotifications: number; subscriptionExpiry: string | null };
};

const chartColors = ["#1463ff", "#63a0ff", "#b9ff3f", "#21c98b", "#f5b942", "#f45b69"];

function Metric({ label, value, helper, icon: Icon }: { label:string; value:string|number; helper:string; icon:typeof ShoppingCart }) {
  return <article className="portfolio-metric">
    <div className="portfolio-metric-icon"><Icon size={18}/></div>
    <div className="min-w-0"><p className="portfolio-metric-label">{label}</p><p className="portfolio-metric-value">{value}</p><p className="portfolio-metric-helper">{helper}</p></div>
  </article>;
}

function Panel({ title, eyebrow, action, children, className="" }: { title:string; eyebrow:string; action?:React.ReactNode; children:React.ReactNode; className?:string }) {
  return <section className={`portfolio-panel ${className}`}>
    <header className="portfolio-panel-head"><div><p>{eyebrow}</p><h2>{title}</h2></div>{action}</header>{children}
  </section>;
}

export default function DashboardPage() {
  const { money } = useRestaurantSettings();
  const currency = (value: number) => money(value, 0);
  const [data,setData]=useState<DashboardData|null>(null); const [error,setError]=useState(""); const [loading,setLoading]=useState(true);
  useEffect(()=>{const t=setTimeout(()=>{fetch("/api/owner/dashboard",{cache:"no-store"}).then(async r=>{const result=await r.json();if(!r.ok) throw new Error(result.message||"Unable to load dashboard.");setData(result.data)}).catch((e:Error)=>setError(e.message)).finally(()=>setLoading(false))},0);return()=>clearTimeout(t)},[]);
  if(loading) return <div className="portfolio-dashboard"><div className="h-72 animate-pulse rounded-[32px] bg-slate-200"/><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({length:4},(_,i)=><div key={i} className="h-36 animate-pulse rounded-3xl bg-slate-200"/>)}</div></div>;
  if(error||!data) return <div className="m-5 rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm font-semibold text-rose-700">{error||"Dashboard data is unavailable."}</div>;

  const statusData=Object.entries(data.charts.orderStatuses).map(([name,value])=>({name,value}));
  const attention=data.orders.pending+data.alerts.pendingReservations+data.inventory.lowStock;
  const setupSteps = [
    { label: "Categories", ready: data.counts.categories > 0, href: "/dashboard/owner/categories", help: "Create menu groups" },
    { label: "Menu", ready: data.counts.menuItems > 0, href: "/dashboard/menu", help: "Add sellable items" },
    { label: "Tables", ready: data.tables.active > 0, href: "/dashboard/tables", help: "Set up dine-in floor" },
    { label: "Inventory", ready: data.counts.inventoryItems > 0, href: "/dashboard/inventory", help: "Track ingredients" },
    { label: "Staff", ready: data.counts.staff > 0, href: "/dashboard/staff", help: "Create operational users" },
  ].filter(step => !data.isDemo || step.label !== "Staff");
  const setupReady = setupSteps.filter(step => step.ready).length;
  return <div className="portfolio-dashboard">
    <section className="portfolio-hero-card">
      <div className="portfolio-hero-copy">
        <span className="portfolio-live"><i/> Live restaurant workspace</span>
        <h1>Service overview</h1>
        <p>{attention} items need attention</p>
        <div className="portfolio-hero-actions">
          <a href="/dashboard/pos" className="portfolio-primary-action"><Plus size={17}/> Start new sale</a>
          <a href="/dashboard/orders" className="portfolio-secondary-action">Open orders <ArrowRight size={16}/></a>
        </div>
      </div>
      <div className="portfolio-hero-status">
        <div className="status-mini-grid">
          <a href="/dashboard/orders"><span>Pending orders</span><b>{data.orders.pending}</b></a>
          <a href="/dashboard/reservations"><span>Reservations</span><b>{data.alerts.pendingReservations}</b></a>
          <a href="/dashboard/inventory"><span>Low stock</span><b>{data.inventory.lowStock}</b></a>
        </div>
      </div>
    </section>

    {setupReady < setupSteps.length && <section className="rounded-[28px] border border-blue-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[.18em] text-blue-600">Setup checklist</p><h2 className="mt-1 text-xl font-bold text-slate-950">Finish setup before service</h2><p className="mt-1 text-sm text-slate-500">{setupReady}/{setupSteps.length} essentials ready. Complete these in order so POS, kitchen and stock flows stay connected.</p></div>
        <div className="grid flex-1 gap-2 sm:grid-cols-2 lg:max-w-3xl lg:grid-cols-5">{setupSteps.map(step => <a key={step.label} href={step.href} className={`rounded-2xl border p-3 transition ${step.ready ? "border-emerald-100 bg-emerald-50/70" : "border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50"}`}><div className="flex items-center justify-between"><b className="text-sm">{step.label}</b>{step.ready ? <CheckCircle2 size={16} className="text-emerald-600"/> : <ArrowRight size={15} className="text-blue-600"/>}</div><small className="mt-1 block text-xs text-slate-500">{step.ready ? "Ready" : step.help}</small></a>)}</div>
      </div>
    </section>}

    <section className="portfolio-metrics-grid">
      <Metric label="Revenue today" value={currency(data.revenue.today)} helper="Current trading day" icon={WalletCards}/>
      <Metric label="Month to date" value={currency(data.revenue.monthly)} helper="Gross revenue" icon={TrendingUp}/>
      <Metric label="Monthly profit" value={currency(data.revenue.profit)} helper="After recorded expenses" icon={CheckCircle2}/>
      <Metric label="Orders" value={data.orders.total} helper={`${data.orders.today} created today`} icon={ShoppingCart}/>
    </section>

    <section className="portfolio-bento">
      <Panel title="Revenue pulse" eyebrow="Financial performance" className="portfolio-bento-wide" action={<div className="portfolio-legend"><span><i className="bg-[#1463ff]"/>Revenue</span><span><i className="bg-[#8cb5ff]"/>Expenses</span></div>}>
        <div className="h-[320px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.charts.trend} margin={{top:12,right:8,left:-14,bottom:0}}><CartesianGrid stroke="#eaf0f7" vertical={false}/><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill:"#7a899c",fontSize:11}}/><YAxis axisLine={false} tickLine={false} tick={{fill:"#7a899c",fontSize:11}}/><Tooltip contentStyle={{borderRadius:16,border:"1px solid #dde6f0",boxShadow:"0 16px 45px rgba(7,17,31,.12)"}}/><Line type="monotone" dataKey="revenue" stroke="#1463ff" strokeWidth={3.5} dot={false} activeDot={{r:5,fill:"#1463ff"}}/><Line type="monotone" dataKey="expenses" stroke="#8cb5ff" strokeWidth={2.5} dot={false}/></LineChart></ResponsiveContainer></div>
      </Panel>

      <Panel title="Order mix" eyebrow="Service status">
        <div className="relative h-[205px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={statusData} dataKey="value" nameKey="name" innerRadius={64} outerRadius={88} paddingAngle={5} stroke="none">{statusData.map((s,i)=><Cell key={s.name} fill={chartColors[i%chartColors.length]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer><div className="portfolio-donut-label"><strong>{data.orders.total}</strong><span>Total orders</span></div></div>
        <div className="portfolio-status-list">{statusData.slice(0,4).map((s,i)=><div key={s.name}><span><i style={{backgroundColor:chartColors[i%chartColors.length]}}/>{s.name}</span><b>{s.value}</b></div>)}</div>
      </Panel>

      <Panel title="What needs attention" eyebrow="Operational queue">
        <div className="portfolio-alert-list">{([
          { label:"Low stock", value:data.inventory.lowStock, helper:"Inventory", Icon:Package, href:"/dashboard/inventory" },
          { label:"Out of stock", value:data.inventory.outOfStock, helper:"Inventory", Icon:AlertTriangle, href:"/dashboard/inventory" },
          { label:"Pending reservations", value:data.alerts.pendingReservations, helper:"Guest service", Icon:CalendarDays, href:"/dashboard/reservations" },
          { label:"Failed payments", value:data.alerts.failedPayments, helper:"Billing", Icon:WalletCards, href:"/dashboard/billing" }
        ]).map(({label,value,helper,Icon,href})=><a href={href} key={label}><span className="portfolio-alert-icon"><Icon size={17}/></span><span className="min-w-0 flex-1"><b>{label}</b><small>{helper}</small></span><strong>{value}</strong><ArrowRight size={15}/></a>)}</div>
      </Panel>

      <Panel title="Top menu items" eyebrow="Guest favourites" className="portfolio-bento-wide">
        <div className="h-[270px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.charts.topSelling} margin={{top:10,right:8,left:-16,bottom:0}}><CartesianGrid stroke="#eaf0f7" vertical={false}/><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill:"#7a899c",fontSize:11}}/><YAxis axisLine={false} tickLine={false} tick={{fill:"#7a899c",fontSize:11}}/><Tooltip contentStyle={{borderRadius:16,border:"1px solid #dde6f0"}}/><Bar dataKey="quantity" fill="#1463ff" radius={[9,9,3,3]}/></BarChart></ResponsiveContainer></div>
      </Panel>
    </section>

    <section className="grid gap-5 lg:grid-cols-2">
      <Panel title="Recent orders" eyebrow="Latest activity" action={<a className="portfolio-text-link" href="/dashboard/orders">View all <ArrowRight size={14}/></a>}>
        <div className="portfolio-activity-list">{data.recent.orders.length?data.recent.orders.slice(0,5).map(o=><a href="/dashboard/orders" key={o.id}><span className="activity-icon"><ShoppingCart size={16}/></span><span className="min-w-0 flex-1"><b>{o.orderNumber}</b><small>{o.customerName||"Guest"} · {o.status.toLowerCase()}</small></span><strong>{currency(o.totalAmount)}</strong></a>):<p className="empty-copy">No orders yet.</p>}</div>
      </Panel>
      <Panel title="Today at a glance" eyebrow="Restaurant snapshot">
        <div className="portfolio-snapshot-grid"><div><Users/><span>Customers</span><strong>{data.counts.customers}</strong></div><div><Package/><span>Menu items</span><strong>{data.counts.menuItems}</strong></div><div><CalendarDays/><span>Tables occupied</span><strong>{data.tables.occupied}/{data.tables.active}</strong></div><div><Clock3/><span>Pending orders</span><strong>{data.orders.pending}</strong></div></div>
      </Panel>
    </section>
  </div>;
}
