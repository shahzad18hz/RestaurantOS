"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { toast, Toaster } from "sonner";

type Plan = {
  id: number;
  name: string;
  code: string;
  monthlyPrice: string;
  yearlyPrice: string;
  trialDays: number;
  maxBranches: number;
  maxUsers: number;
  maxTables: number;
  maxMenuItems: number;
  maxOrdersPerMonth: number;
  storageLimit: number;
  status: "ACTIVE" | "INACTIVE";
};

type Form = {
  name: string;
  code: string;
  monthlyPrice: string;
  yearlyPrice: string;
  trialDays: string;
  maxBranches: string;
  maxUsers: string;
  maxTables: string;
  maxMenuItems: string;
  maxOrdersPerMonth: string;
  storageLimit: string;
  status: "ACTIVE" | "INACTIVE";
};

const blank = (): Form => ({
  name: "",
  code: "",
  monthlyPrice: "",
  yearlyPrice: "",
  trialDays: "0",
  maxBranches: "1",
  maxUsers: "10",
  maxTables: "20",
  maxMenuItems: "100",
  maxOrdersPerMonth: "1000",
  storageLimit: "1024",
  status: "ACTIVE",
});

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [form, setForm] = useState<Form>(blank());
  const [editing, setEditing] = useState<Plan | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch("/api/owner/plans", { cache: "no-store" });
    const d = await r.json();
    if (r.ok && d.success) setPlans(d.data);
    else toast.error(d.message || "Failed to load plans.");
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(blank());
    setOpen(true);
  }

  function openEdit(plan: Plan) {
    setEditing(plan);
    setForm({
      name: plan.name,
      code: plan.code,
      monthlyPrice: String(plan.monthlyPrice),
      yearlyPrice: String(plan.yearlyPrice),
      trialDays: String(plan.trialDays),
      maxBranches: String(plan.maxBranches),
      maxUsers: String(plan.maxUsers),
      maxTables: String(plan.maxTables),
      maxMenuItems: String(plan.maxMenuItems),
      maxOrdersPerMonth: String(plan.maxOrdersPerMonth),
      storageLimit: String(plan.storageLimit),
      status: plan.status,
    });
    setOpen(true);
  }

  async function save() {
    if (!form.name.trim() || !form.code.trim()) return toast.error("Plan name and code are required.");
    setBusy(true);
    try {
      const r = await fetch(editing ? `/api/owner/plans/${editing.id}` : "/api/owner/plans", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.message || "Could not save plan.");
      toast.success(editing ? "Plan updated." : "Plan created.");
      setOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save plan.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(plan: Plan) {
    if (!window.confirm(`Delete ${plan.name}?`)) return;
    const r = await fetch(`/api/owner/plans/${plan.id}`, { method: "DELETE" });
    const d = await r.json();
    if (!r.ok || !d.success) return toast.error(d.message || "Could not delete plan.");
    toast.success("Plan deleted.");
    await load();
  }

  return (
    <div className="erp-page erp-page-subscriptions-plans space-y-6 p-6">
      <Toaster position="top-right" />
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Subscription Plans</h1>
          <p className="text-gray-500">Manage SaaS pricing, limits, and availability.</p>
        </div>
        <button onClick={openCreate} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-white"><Plus className="h-4 w-4" /> Create plan</button>
      </div>

      {plans.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-white p-12 text-center text-gray-500">No subscription plans yet.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => (
            <div key={plan.id} className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div><h2 className="text-xl font-semibold">{plan.name}</h2><p className="text-xs text-gray-500">{plan.code} · {plan.status}</p></div>
                <div className="flex gap-2"><button onClick={() => openEdit(plan)} className="rounded-lg border p-2" aria-label={`Edit ${plan.name}`}><Pencil className="h-4 w-4" /></button><button onClick={() => remove(plan)} className="rounded-lg border border-red-200 p-2 text-red-600" aria-label={`Delete ${plan.name}`}><Trash2 className="h-4 w-4" /></button></div>
              </div>
              <p className="mt-4 text-2xl font-bold">USD {plan.monthlyPrice}<small className="text-sm font-medium text-gray-500"> / month</small></p>
              <p className="text-sm text-gray-500">USD {plan.yearlyPrice} yearly · {plan.trialDays} trial days</p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-gray-600"><span>{plan.maxBranches} branches</span><span>{plan.maxUsers} users</span><span>{plan.maxTables} tables</span><span>{plan.maxMenuItems} menu items</span><span>{plan.maxOrdersPerMonth} orders/mo</span><span>{plan.storageLimit} MB storage</span></div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="erp-premium-modal max-h-[92vh] w-full max-w-4xl overflow-y-auto">
            <div className="erp-premium-modal-head"><div><span className="erp-form-eyebrow">SaaS plan</span><h2>{editing ? "Update plan" : "Create plan"}</h2><p>Set pricing and hard usage limits clearly so subscription behavior matches what clients buy.</p></div><button onClick={() => setOpen(false)} className="erp-icon-button" aria-label="Close"><X className="h-5 w-5" /></button></div>
            <div className="erp-premium-form">
              <section className="erp-form-section"><div className="erp-form-section-copy"><span>01</span><div><h3>Identity & pricing</h3><p>Public-facing plan name, code and billing prices.</p></div></div><div className="erp-form-grid">
                <label className="erp-field"><span>Plan name <b>*</b></span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Growth" /></label>
                <label className="erp-field"><span>Plan code <b>*</b></span><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="GROWTH" /></label>
                <label className="erp-field"><span>Monthly price</span><input type="number" min="0" step="0.01" value={form.monthlyPrice} onChange={(e) => setForm({ ...form, monthlyPrice: e.target.value })} /></label>
                <label className="erp-field"><span>Yearly price</span><input type="number" min="0" step="0.01" value={form.yearlyPrice} onChange={(e) => setForm({ ...form, yearlyPrice: e.target.value })} /></label>
                <label className="erp-field"><span>Trial days</span><input type="number" min="0" value={form.trialDays} onChange={(e) => setForm({ ...form, trialDays: e.target.value })} /></label>
                <label className="erp-field"><span>Status</span><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Form["status"] })}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label>
              </div></section>
              <section className="erp-form-section"><div className="erp-form-section-copy"><span>02</span><div><h3>Usage limits</h3><p>These values are enforced by the SaaS layer, so keep them intentional.</p></div></div><div className="erp-form-grid">
                {[['maxBranches','Max branches'],['maxUsers','Max users'],['maxTables','Max tables'],['maxMenuItems','Max menu items'],['maxOrdersPerMonth','Orders per month'],['storageLimit','Storage limit (MB)']].map(([key,label]) => <label key={key} className="erp-field"><span>{label}</span><input type="number" min="1" value={form[key as keyof Form]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>)}
              </div></section>
            </div>
            <div className="erp-premium-modal-actions"><p>{editing ? "Existing subscriptions keep their history; updated limits apply through the plan definition." : "Review limits before publishing the plan."}</p><div><button onClick={() => setOpen(false)} className="erp-button-secondary">Cancel</button><button disabled={busy} onClick={save} className="erp-button-primary">{busy ? "Saving..." : editing ? "Save changes" : "Create plan"}</button></div></div>
          </div>
        </div>
      )}
    </div>
  );
}
