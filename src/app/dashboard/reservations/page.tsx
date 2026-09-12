"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Eye, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { toast, Toaster } from "sonner";

type Status = "PENDING" | "CONFIRMED" | "SEATED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
type Reservation = {
  id: number;
  reservationNumber: string;
  customerName: string;
  phoneNumber: string;
  email: string | null;
  numberOfGuests: number;
  reservationAt: string;
  status: Status;
  notes: string | null;
  durationMinutes: number;
  table: { id: number; name: string; capacity: number } | null;
  customer: { id: number; name: string; phone: string; email: string | null } | null;
  assignedStaff: { id: number; name: string; email: string } | null;
};
type TableOption = { id: number; name: string; capacity: number; status: string };
type StaffOption = { id: number; name: string; email: string; role: string };
type FormState = {
  customerName: string;
  phoneNumber: string;
  email: string;
  tableId: string;
  numberOfGuests: string;
  reservationDate: string;
  reservationTime: string;
  status: Status;
  notes: string;
  durationMinutes: string;
  assignedStaffId: string;
};

const STATUSES: Status[] = ["PENDING", "CONFIRMED", "SEATED", "COMPLETED", "CANCELLED", "NO_SHOW"];
const STATUS_COLORS: Record<Status, string> = {
  PENDING: "bg-gray-100 text-gray-700",
  CONFIRMED: "bg-blue-100 text-blue-700",
  SEATED: "bg-purple-100 text-purple-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
  NO_SHOW: "bg-orange-100 text-orange-700",
};
const emptyForm = (): FormState => ({
  customerName: "", phoneNumber: "", email: "", tableId: "", numberOfGuests: "2",
  reservationDate: new Date().toISOString().slice(0, 10), reservationTime: "19:00",
  status: "PENDING", notes: "", durationMinutes: "90", assignedStaffId: "",
});

function formatDate(value: string) {
  return new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

async function errorMessage(response: Response) {
  try {
    const data = await response.json();
    return data.message || "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
}

export default function ReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [tables, setTables] = useState<TableOption[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Reservation | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [selected, setSelected] = useState<Reservation | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Reservation | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "10" });
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      const response = await fetch(`/api/owner/reservation?${params}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message);
      setReservations(data.data);
      setPageCount(Math.max(1, data.meta.pageCount));
      setTotal(data.meta.total);
      setTables(data.options.tables);
      setStaff(data.options.staff);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load reservations.");
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => STATUSES.reduce((result, status) => {
    result[status] = reservations.filter((reservation) => reservation.status === status).length;
    return result;
  }, {} as Record<Status, number>), [reservations]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setFormOpen(true);
  }

  function openEdit(reservation: Reservation) {
    const date = new Date(reservation.reservationAt);
    setEditing(reservation);
    setForm({
      customerName: reservation.customerName, phoneNumber: reservation.phoneNumber, email: reservation.email || "",
      tableId: reservation.table ? String(reservation.table.id) : "", numberOfGuests: String(reservation.numberOfGuests),
      reservationDate: date.toISOString().slice(0, 10), reservationTime: date.toTimeString().slice(0, 5),
      status: reservation.status, notes: reservation.notes || "", durationMinutes: String(reservation.durationMinutes || 90),
      assignedStaffId: reservation.assignedStaff ? String(reservation.assignedStaff.id) : "",
    });
    setSelected(null);
    setFormOpen(true);
  }

  async function save() {
    if (!form.customerName.trim() || !form.phoneNumber.trim() || !form.reservationDate || !form.reservationTime) {
      toast.error("Customer, phone, date, and time are required.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(editing ? `/api/owner/reservation/${editing.id}` : "/api/owner/reservation", {
        method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, numberOfGuests: Number(form.numberOfGuests), durationMinutes: Number(form.durationMinutes), tableId: form.tableId || null, assignedStaffId: form.assignedStaffId || null }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      toast.success(editing ? "Reservation updated." : "Reservation created.");
      setFormOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save reservation.");
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(reservation: Reservation, status: Status) {
    setBusy(true);
    try {
      const response = await fetch(`/api/owner/reservation/${reservation.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      toast.success(`Reservation marked ${status.toLowerCase().replace("_", " ")}.`);
      setSelected(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update reservation.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/owner/reservation/${deleteTarget.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await errorMessage(response));
      toast.success("Reservation deleted.");
      setDeleteTarget(null);
      setSelected(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete reservation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="erp-page erp-page-reservations space-y-6 p-6">
      <Toaster position="top-right" />
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div><h1 className="text-3xl font-bold tracking-tight">Reservations</h1><p className="text-muted-foreground">Manage bookings, guests, and table availability</p></div>
        <button onClick={openCreate} className="flex items-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Add Reservation</button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {STATUSES.map((status) => <button key={status} onClick={() => { setStatusFilter(statusFilter === status ? "ALL" : status); setPage(1); }} className={`rounded-xl border p-4 text-left shadow-sm ${statusFilter === status ? "border-black bg-black text-white" : "bg-white"}`}><p className="text-xs opacity-70">{status.replace("_", " ")}</p><p className="mt-1 text-2xl font-bold">{counts[status] || 0}</p></button>)}
      </div>

      <div className="flex flex-col gap-3 md:flex-row">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search reservation #, customer, or phone..." className="w-full rounded-xl border py-3 pl-10 pr-4 outline-none focus:border-black" /></div>
        <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} className="rounded-xl border bg-white px-4 py-3"><option value="ALL">All statuses</option>{STATUSES.map((status) => <option key={status} value={status}>{status.replace("_", " ")}</option>)}</select>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full min-w-[800px] text-sm"><thead className="bg-gray-50"><tr>{["Reservation", "Guest", "Date & time", "Table", "Guests", "Status", "Action"].map((heading) => <th key={heading} className="p-4 text-left font-semibold">{heading}</th>)}</tr></thead>
          <tbody>{loading ? <tr><td colSpan={7} className="p-12 text-center text-gray-500"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading reservations...</td></tr> : reservations.length === 0 ? <tr><td colSpan={7} className="p-12 text-center text-gray-500"><CalendarDays className="mx-auto mb-2 h-8 w-8 text-gray-300" />No reservations found.</td></tr> : reservations.map((reservation) => <tr key={reservation.id} className="cursor-pointer border-t hover:bg-gray-50" onClick={() => setSelected(reservation)}>
            <td className="p-4"><p className="font-semibold">#{reservation.reservationNumber}</p><p className="text-xs text-gray-500">{reservation.phoneNumber}</p></td>
            <td className="p-4">{reservation.customerName}</td><td className="p-4 text-gray-600">{formatDate(reservation.reservationAt)}</td><td className="p-4">{reservation.table?.name || "Walk-in"}</td><td className="p-4">{reservation.numberOfGuests}</td>
            <td className="p-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_COLORS[reservation.status]}`}>{reservation.status.replace("_", " ")}</span></td>
            <td className="p-4 text-right"><button onClick={(event) => { event.stopPropagation(); setSelected(reservation); }} className="text-gray-500 hover:text-black"><Eye className="h-4 w-4" /></button></td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm text-gray-500"><span>{total} reservation{total === 1 ? "" : "s"}</span><div className="flex items-center gap-2"><button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border p-2 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button><span>Page {page} of {pageCount}</span><button disabled={page >= pageCount} onClick={() => setPage(page + 1)} className="rounded-lg border p-2 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></div></div>

      {formOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-2xl font-bold">{editing ? "Edit Reservation" : "Add Reservation"}</h2><button onClick={() => setFormOpen(false)}><X className="h-5 w-5" /></button></div>
        <div className="grid gap-4 md:grid-cols-2">{[
          ["customerName", "Customer name", "text"], ["phoneNumber", "Phone number", "tel"], ["email", "Email (optional)", "email"], ["numberOfGuests", "Number of guests", "number"], ["durationMinutes", "Duration (minutes)", "number"],
        ].map(([key, placeholder, type]) => <input key={key} type={type} min={type === "number" ? "1" : undefined} placeholder={placeholder} value={form[key as keyof FormState]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className="rounded-lg border p-3" />)}
          <select value={form.tableId} onChange={(event) => setForm({ ...form, tableId: event.target.value })} className="rounded-lg border bg-white p-3"><option value="">Walk-in / no table</option>{tables.map((table) => <option key={table.id} value={table.id}>{table.name} ({table.capacity} seats)</option>)}</select>
          <select value={form.assignedStaffId} onChange={(event) => setForm({ ...form, assignedStaffId: event.target.value })} className="rounded-lg border bg-white p-3"><option value="">Unassigned staff</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.name} ({member.role})</option>)}</select>
          <input type="date" value={form.reservationDate} onChange={(event) => setForm({ ...form, reservationDate: event.target.value })} className="rounded-lg border p-3" /><input type="time" value={form.reservationTime} onChange={(event) => setForm({ ...form, reservationTime: event.target.value })} className="rounded-lg border p-3" />
          {!editing ? <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Status })} className="rounded-lg border bg-white p-3"><option value="PENDING">Pending</option><option value="CONFIRMED">Confirmed</option></select> : <div className="rounded-lg border bg-slate-50 p-3 text-sm text-slate-600"><b>Status:</b> {editing.status.replace("_", " ")}<br/><span className="text-xs">Use the reservation details panel to move through Confirmed → Seated → Completed.</span></div>}
          <textarea placeholder="Guest notes / special requests" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="min-h-24 rounded-lg border p-3 md:col-span-2" />
        </div><div className="mt-6 flex justify-end gap-3"><button onClick={() => setFormOpen(false)} className="rounded-lg border px-5 py-2">Cancel</button><button onClick={save} disabled={busy} className="flex items-center gap-2 rounded-lg bg-black px-5 py-2 text-white disabled:opacity-60">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{editing ? "Update reservation" : "Create reservation"}</button></div>
      </div></div>}

      {selected && <div className="fixed inset-0 z-50 flex justify-end bg-black/50"><div className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl"><div className="mb-5 flex items-start justify-between"><div><h2 className="text-xl font-bold">#{selected.reservationNumber}</h2><p className="text-sm text-gray-500">{formatDate(selected.reservationAt)}</p></div><button onClick={() => setSelected(null)}><X className="h-5 w-5" /></button></div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_COLORS[selected.status]}`}>{selected.status.replace("_", " ")}</span><div className="mt-5 space-y-3 rounded-xl bg-gray-50 p-4 text-sm"><p><b>Customer:</b> {selected.customerName}</p><p><b>Phone:</b> {selected.phoneNumber}</p>{selected.email && <p><b>Email:</b> {selected.email}</p>}<p><b>Table:</b> {selected.table?.name || "Walk-in"}</p><p><b>Guests:</b> {selected.numberOfGuests}</p><p><b>Duration:</b> {selected.durationMinutes || 90} min</p><p><b>Assigned staff:</b> {selected.assignedStaff?.name || "Unassigned"}</p>{selected.notes && <p><b>Notes:</b> {selected.notes}</p>}</div>
        <div className="mt-6 grid grid-cols-2 gap-2">{selected.status !== "CANCELLED" && selected.status !== "COMPLETED" && <><button disabled={busy} onClick={() => openEdit(selected)} className="flex items-center justify-center gap-2 rounded-lg border py-2 text-sm"><Pencil className="h-4 w-4" /> Edit</button><button disabled={busy} onClick={() => updateStatus(selected, "CANCELLED")} className="rounded-lg border border-red-200 py-2 text-sm text-red-600">Cancel</button></>}{selected.status === "PENDING" && <button disabled={busy} onClick={() => updateStatus(selected, "CONFIRMED")} className="col-span-2 rounded-lg bg-black py-2 text-sm text-white">Confirm reservation</button>}{selected.status === "CONFIRMED" && <button disabled={busy} onClick={() => updateStatus(selected, "SEATED")} className="col-span-2 rounded-lg bg-black py-2 text-sm text-white">Mark seated</button>}{selected.status === "SEATED" && <button disabled={busy} onClick={() => updateStatus(selected, "COMPLETED")} className="col-span-2 rounded-lg bg-black py-2 text-sm text-white">Mark completed</button>}<button disabled={busy} onClick={() => setDeleteTarget(selected)} className="col-span-2 flex items-center justify-center gap-2 rounded-lg border border-red-200 py-2 text-sm text-red-600"><Trash2 className="h-4 w-4" /> Cancel reservation</button></div>
      </div></div>}

      {deleteTarget && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-sm rounded-2xl bg-white p-6"><h2 className="text-lg font-bold">Cancel reservation?</h2><p className="mt-2 text-sm text-gray-500">The booking will stay in history and the table will be released safely.</p><div className="mt-6 flex gap-3"><button onClick={() => setDeleteTarget(null)} className="flex-1 rounded-lg border py-2">Keep</button><button disabled={busy} onClick={remove} className="flex-1 rounded-lg bg-red-600 py-2 text-white">Cancel booking</button></div></div></div>}
    </div>
  );
}
