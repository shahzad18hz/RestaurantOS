"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Plus, Search, Trash2, X } from "lucide-react";
import { toast, Toaster } from "sonner";

type Branch = {
  id: number; code: string; name: string; status: string; phone: string | null; email: string | null;
  address: string | null; city: string | null; country: string | null; timezone: string; currency: string;
  openingTime: string; closingTime: string; isDefault: boolean;
  manager: { id: number; name: string; email: string } | null;
};
type Manager = { id: number; name: string; email: string };
type Form = {
  name: string; code: string; managerId: string; phone: string; email: string; address: string; city: string;
  country: string; timezone: string; currency: string; openingTime: string; closingTime: string;
  status: string; isDefault: boolean;
};
const initial: Form = { name: "", code: "", managerId: "", phone: "", email: "", address: "", city: "", country: "", timezone: "UTC", currency: "USD", openingTime: "09:00", closingTime: "23:00", status: "ACTIVE", isDefault: false };

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [form, setForm] = useState<Form>(initial);
  const [editing, setEditing] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/owner/branches?search=${encodeURIComponent(search)}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.message || "Failed to load branches.");
      setBranches(d.data); setManagers(d.managers);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load branches."); }
    finally { setLoading(false); }
  }, [search]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 150); return () => window.clearTimeout(timer); }, [load]);

  function edit(branch?: Branch) {
    if (!branch) { setEditing(null); setForm(initial); }
    else {
      setEditing(branch.id);
      setForm({
        name: branch.name, code: branch.code, managerId: branch.manager ? String(branch.manager.id) : "",
        phone: branch.phone || "", email: branch.email || "", address: branch.address || "", city: branch.city || "",
        country: branch.country || "", timezone: branch.timezone || "UTC", currency: branch.currency || "USD",
        openingTime: branch.openingTime || "09:00", closingTime: branch.closingTime || "23:00",
        status: branch.status || "ACTIVE", isDefault: branch.isDefault,
      });
    }
    setOpen(true);
  }

  async function save() {
    if (!form.name.trim()) return toast.error("Branch name is required.");
    setBusy(true);
    try {
      const url = editing ? `/api/owner/branches/${editing}` : "/api/owner/branches";
      const r = await fetch(url, { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.message || "Could not save branch.");
      toast.success(editing ? "Branch updated." : "Branch created.");
      setOpen(false); await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save branch."); }
    finally { setBusy(false); }
  }

  async function remove(id: number) {
    if (!window.confirm("Delete this branch?")) return;
    const r = await fetch(`/api/owner/branches/${id}`, { method: "DELETE" });
    const d = await r.json();
    if (!r.ok || !d.success) return toast.error(d.message || "Could not delete branch.");
    toast.success("Branch deleted."); await load();
  }

  return <div className="erp-page erp-page-branches space-y-6 p-6">
    <Toaster position="top-right" />
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center"><div><h1 className="text-3xl font-bold">Branches</h1><p className="text-gray-500">Manage restaurant locations and branch operations.</p></div><button onClick={() => edit()} className="flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-white"><Plus className="h-4 w-4" />Add branch</button></div>
    <div className="relative max-w-md"><Search className="absolute left-3 top-3.5 h-4 w-4 text-gray-400"/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search branches..." className="w-full rounded-xl border py-3 pl-10 pr-3"/></div>
    {loading ? <div className="rounded-2xl border bg-white p-12 text-center text-gray-500">Loading branches...</div> : branches.length === 0 ? <div className="rounded-2xl border border-dashed bg-white p-12 text-center text-gray-500">No branches found.</div> : <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{branches.map(branch => <div key={branch.id} className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex justify-between"><Building2 className="h-6 w-6 text-indigo-600"/><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${branch.status === "ACTIVE" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"}`}>{branch.status}</span></div><h2 className="mt-4 text-xl font-semibold">{branch.name}</h2><p className="text-sm text-gray-500">{branch.code} · {branch.city || "No city"}</p><p className="mt-3 text-sm">Manager: {branch.manager?.name || "Unassigned"}</p><p className="mt-1 text-xs text-gray-500">{branch.openingTime}–{branch.closingTime} · {branch.currency}</p>{branch.isDefault && <span className="mt-3 inline-block rounded bg-indigo-50 px-2 py-1 text-xs text-indigo-700">Default branch</span>}<div className="mt-4 flex gap-2"><button onClick={() => edit(branch)} className="flex-1 rounded-lg border px-3 py-2">Edit</button><button onClick={() => remove(branch.id)} className="rounded-lg border border-red-200 p-2 text-red-600"><Trash2 className="h-4 w-4"/></button></div></div>)}</div>}

    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"><div className="erp-premium-modal max-h-[92vh] w-full max-w-4xl overflow-y-auto">
      <div className="erp-premium-modal-head"><div><span className="erp-form-eyebrow">Location setup</span><h2>{editing ? "Update branch" : "Create branch"}</h2><p>Keep contact, regional, operating and manager information together without overwriting existing values.</p></div><button onClick={() => setOpen(false)} className="erp-icon-button" aria-label="Close"><X className="h-5 w-5"/></button></div>
      <div className="erp-premium-form">
        <section className="erp-form-section"><div className="erp-form-section-copy"><span>01</span><div><h3>Branch identity</h3><p>Name, code and manager used throughout operations.</p></div></div><div className="erp-form-grid"><label className="erp-field"><span>Name <b>*</b></span><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Downtown Branch"/></label><label className="erp-field"><span>Code</span><input value={form.code} onChange={e=>setForm({...form,code:e.target.value.toUpperCase()})} placeholder="BR-001"/></label><label className="erp-field"><span>Manager</span><select value={form.managerId} onChange={e=>setForm({...form,managerId:e.target.value})}><option value="">Unassigned</option>{managers.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label className="erp-field"><span>Status</span><select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label></div></section>
        <section className="erp-form-section"><div className="erp-form-section-copy"><span>02</span><div><h3>Contact & address</h3><p>Details staff and customers may use to reach this location.</p></div></div><div className="erp-form-grid"><label className="erp-field"><span>Phone</span><input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label><label className="erp-field"><span>Email</span><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label className="erp-field erp-field-full"><span>Address</span><input value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/></label><label className="erp-field"><span>City</span><input value={form.city} onChange={e=>setForm({...form,city:e.target.value})}/></label><label className="erp-field"><span>Country</span><input value={form.country} onChange={e=>setForm({...form,country:e.target.value})}/></label></div></section>
        <section className="erp-form-section"><div className="erp-form-section-copy"><span>03</span><div><h3>Operations</h3><p>Regional money/time settings and opening hours for this branch.</p></div></div><div className="erp-form-grid"><label className="erp-field"><span>Timezone</span><input value={form.timezone} onChange={e=>setForm({...form,timezone:e.target.value})}/></label><label className="erp-field"><span>Currency</span><input value={form.currency} maxLength={3} onChange={e=>setForm({...form,currency:e.target.value.toUpperCase()})} placeholder="PKR"/></label><label className="erp-field"><span>Opening time</span><input type="time" value={form.openingTime} onChange={e=>setForm({...form,openingTime:e.target.value})}/></label><label className="erp-field"><span>Closing time</span><input type="time" value={form.closingTime} onChange={e=>setForm({...form,closingTime:e.target.value})}/></label><label className="erp-choice-card erp-field-full"><input type="checkbox" checked={form.isDefault} onChange={e=>setForm({...form,isDefault:e.target.checked})}/><div><strong>Default branch</strong><small>Use this location as the primary branch for the restaurant.</small></div></label></div></section>
      </div>
      <div className="erp-premium-modal-actions"><p>All existing branch values are preserved when you edit this form.</p><div><button onClick={()=>setOpen(false)} className="erp-button-secondary">Cancel</button><button disabled={busy} onClick={save} className="erp-button-primary">{busy?"Saving...":editing?"Save changes":"Create branch"}</button></div></div>
    </div></div>}
  </div>;
}
