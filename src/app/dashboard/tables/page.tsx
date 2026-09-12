"use client";

import { useCallback, useEffect, useState } from "react";
import { toast, Toaster } from "sonner";
import { useRestaurantSettings } from "@/hooks/useRestaurantSettings";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  TableProperties,
  Users,
  X,
  Receipt,
  ArrowRightLeft,
} from "lucide-react";

/* ========================================================== */

interface Table {
  id: number;
  name: string;
  capacity: number;
  location: string | null;
  status: "AVAILABLE" | "OCCUPIED" | "RESERVED" | "CLEANING";
  orders: { id: number; orderNumber: string; status: string; totalAmount: string }[];
}

interface FormState {
  name: string;
  capacity: string;
  location: string;
}

const emptyForm: FormState = { name: "", capacity: "2", location: "" };

const STATUS_STYLES: Record<Table["status"], string> = {
  AVAILABLE: "bg-green-100 text-green-700 border-green-200",
  OCCUPIED: "bg-red-100 text-red-700 border-red-200",
  RESERVED: "bg-blue-100 text-blue-700 border-blue-200",
  CLEANING: "bg-yellow-100 text-yellow-700 border-yellow-200",
};

const STATUS_OPTIONS: Table["status"][] = ["AVAILABLE", "OCCUPIED", "RESERVED", "CLEANING"];

async function getError(res: Response) {
  try {
    const data = await res.json();
    return data.message || "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
}

/* ========================================================== */

export default function TablesPage() {
  const { money } = useRestaurantSettings();
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Table | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Table | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [moveSource, setMoveSource] = useState<Table | null>(null);
  const [moveTargetId, setMoveTargetId] = useState("");
  const [moveBusy, setMoveBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/owner/table", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message);
      setTables(data.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load tables.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEdit(table: Table) {
    setEditing(table);
    setForm({
      name: table.name,
      capacity: String(table.capacity),
      location: table.location || "",
    });
    setFormOpen(true);
  }

  async function handleSubmit() {
    if (!form.name.trim()) return toast.error("Table name/number is required.");
    if (!form.capacity || Number(form.capacity) < 1)
      return toast.error("Capacity must be at least 1.");

    setSubmitting(true);
    try {
      const url = editing ? `/api/owner/table/${editing.id}` : "/api/owner/table";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, capacity: Number(form.capacity) }),
      });
      if (!res.ok) throw new Error(await getError(res));
      toast.success(editing ? "Table updated." : "Table created.");
      setFormOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/owner/table/${deleteTarget.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      toast.success(data.message);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  }

  async function changeStatus(table: Table, status: Table["status"]) {
    try {
      const res = await fetch(`/api/owner/table/${table.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(await getError(res));
      toast.success(`${table.name} marked ${status.toLowerCase()}.`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status.");
    }
  }


  async function moveOrMerge() {
    if (!moveSource || !moveTargetId) return toast.error("Choose a destination table.");
    const target = tables.find((table) => table.id === Number(moveTargetId));
    if (!target) return toast.error("Destination table not found.");
    const action = target.orders[0] ? "MERGE" : "TRANSFER";
    setMoveBusy(true);
    try {
      const res = await fetch("/api/owner/table/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceTableId: moveSource.id, targetTableId: target.id, action }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message);
      toast.success(data.message);
      setMoveSource(null);
      setMoveTargetId("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Table move failed.");
    } finally {
      setMoveBusy(false);
    }
  }

  return (
    <div className="erp-page erp-page-tables space-y-6 p-6">
      <Toaster position="top-right" />

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tables</h1>
          <p className="text-muted-foreground">Manage your dining room layout & live status</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Add Table
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {STATUS_OPTIONS.map((status) => (
          <div key={status} className="rounded-xl border bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">{status.charAt(0) + status.slice(1).toLowerCase()}</p>
            <h2 className="mt-2 text-3xl font-bold">
              {tables.filter((t) => t.status === status).length}
            </h2>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border bg-white p-16 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading tables...
        </div>
      ) : tables.length === 0 ? (
        <div className="rounded-xl border bg-white p-16 text-center text-gray-500">
          <TableProperties className="mx-auto mb-2 h-10 w-10 text-gray-300" />
          No tables yet. Add your first one to start taking dine-in orders.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {tables.map((table) => {
            const activeOrder = table.orders[0];
            return (
              <div
                key={table.id}
                className={`rounded-2xl border-2 bg-white p-5 shadow-sm transition ${STATUS_STYLES[table.status]}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{table.name}</h3>
                    <p className="flex items-center gap-1 text-xs text-gray-500">
                      <Users className="h-3 w-3" /> {table.capacity} seats
                      {table.location && ` · ${table.location}`}
                    </p>
                  </div>
                  <span className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-semibold">
                    {table.status}
                  </span>
                </div>

                {activeOrder && (
                  <a
                    href="/dashboard/orders"
                    className="mt-3 flex items-center gap-1.5 rounded-lg bg-white/70 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-white"
                  >
                    <Receipt className="h-3.5 w-3.5" />#{activeOrder.orderNumber} · {money(activeOrder.totalAmount)}
                  </a>
                )}

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {STATUS_OPTIONS.filter((s) => s !== table.status).map((s) => (
                    <button
                      key={s}
                      onClick={() => changeStatus(table, s)}
                      className="rounded-lg bg-white/80 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-white"
                    >
                      {s.charAt(0) + s.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>

                {activeOrder && (
                  <button
                    onClick={() => { setMoveSource(table); setMoveTargetId(""); }}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" /> Transfer / merge table
                  </button>
                )}

                <div className="mt-3 flex justify-end gap-2 border-t border-black/5 pt-3">
                  <button
                    onClick={() => openEdit(table)}
                    className="rounded-lg bg-white/70 p-1.5 hover:bg-white"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(table)}
                    className="rounded-lg bg-white/70 p-1.5 text-red-600 hover:bg-white"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {moveSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div><p className="text-xs font-bold uppercase tracking-[.18em] text-blue-600">Live floor action</p><h2 className="mt-1 text-2xl font-bold">Move {moveSource.name}</h2><p className="mt-1 text-sm text-slate-500">Choose an empty table to transfer the order, or an occupied table to merge both orders into one bill.</p></div>
              <button onClick={() => setMoveSource(null)} className="rounded-xl border p-2"><X className="h-4 w-4" /></button>
            </div>
            <label className="erp-field"><span>Destination table</span><select value={moveTargetId} onChange={(e) => setMoveTargetId(e.target.value)}><option value="">Choose destination</option>{tables.filter((table) => table.id !== moveSource.id && table.status !== "CLEANING" && table.status !== "RESERVED").map((table) => <option key={table.id} value={table.id}>{table.name} · {table.orders[0] ? "Occupied — merge" : "Free — transfer"}</option>)}</select></label>
            {moveTargetId && <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">{tables.find((table) => table.id === Number(moveTargetId))?.orders[0] ? "Merge mode: items from both tables will share the destination order and bill." : "Transfer mode: the active order moves to the new table and the current table becomes free."}</div>}
            <div className="mt-6 flex justify-end gap-3"><button onClick={() => setMoveSource(null)} className="rounded-xl border px-4 py-2.5">Cancel</button><button disabled={moveBusy || !moveTargetId} onClick={moveOrMerge} className="rounded-xl bg-slate-950 px-5 py-2.5 font-semibold text-white disabled:opacity-50">{moveBusy ? "Processing..." : "Confirm action"}</button></div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold">{editing ? "Update Table" : "Add Table"}</h2>
              <button onClick={() => setFormOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <input
                className="w-full rounded-lg border p-3"
                placeholder="Table name / number (e.g. T-12)"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <input
                type="number"
                min="1"
                className="w-full rounded-lg border p-3"
                placeholder="Seating capacity"
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
              />
              <input
                className="w-full rounded-lg border p-3"
                placeholder="Location (e.g. Indoor, Patio)"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setFormOpen(false)} className="rounded-lg border px-5 py-2">
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 rounded-lg bg-black px-5 py-2 text-white disabled:opacity-60"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting ? "Saving..." : editing ? "Update Table" : "Create Table"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-100">
              <Trash2 className="h-5 w-5 text-red-600" />
            </div>
            <h2 className="mb-1 text-lg font-bold">Delete table?</h2>
            <p className="mb-5 text-sm text-gray-500">
              This removes &quot;{deleteTarget.name}&quot; permanently. Tables with an active order
              can&apos;t be deleted.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 rounded-xl border py-2.5 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 py-2.5 text-white disabled:opacity-60"
              >
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
