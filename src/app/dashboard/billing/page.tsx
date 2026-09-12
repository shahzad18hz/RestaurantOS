"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Eye, Loader2, Mail, Plus, Printer, Search, Split, Trash2, X } from "lucide-react";
import { toast, Toaster } from "sonner";
import { ThermalReceipt } from "@/components/billing/ThermalReceipt";
import { useRestaurantSettings } from "@/hooks/useRestaurantSettings";

type Payment = { id: number; method: string; amount: string; reference: string | null; createdAt: string };
type Bill = {
  id: number; billNumber: string; billingDate: string; subtotal: string; discountAmount: string; taxAmount: string;
  serviceCharges: string; deliveryCharges: string; grandTotal: string; paymentStatus: string; paymentMethod: string | null;
  notes: string | null; payments?: Payment[];
  order: { id: number; orderNumber: string; customerName: string | null; customerPhone: string | null; table: { name: string } | null; items: { id: number; nameSnapshot: string; quantity: number; price: string }[] };
};
type Order = Bill["order"] & { totalAmount?: string; subtotal?: string; taxAmount?: string; discountAmount?: string };
type SplitRow = { method: "CASH" | "CARD" | "ONLINE" | "WALLET"; amount: string; reference: string };

const STATUSES = ["UNPAID", "PARTIALLY_PAID", "PAID", "REFUNDED", "CANCELLED"];
const METHODS = ["CASH", "CARD", "ONLINE", "WALLET"] as const;
const colors: Record<string, string> = { UNPAID: "bg-gray-100 text-gray-700", PARTIALLY_PAID: "bg-yellow-100 text-yellow-700", PAID: "bg-green-100 text-green-700", REFUNDED: "bg-purple-100 text-purple-700", CANCELLED: "bg-red-100 text-red-700" };

export default function BillingPage() {
  const { settings, money } = useRestaurantSettings();
  const [bills, setBills] = useState<Bill[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<Bill | null>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [sort, setSort] = useState("date");
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [serviceCharges, setServiceCharges] = useState("0");
  const [deliveryCharges, setDeliveryCharges] = useState("0");
  const [discountAmount, setDiscountAmount] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("UNPAID");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitRows, setSplitRows] = useState<SplitRow[]>([{ method: "CASH", amount: "", reference: "" }, { method: "CARD", amount: "", reference: "" }]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "10", sort });
      if (search.trim()) params.set("search", search.trim());
      if (status !== "ALL") params.set("status", status);
      const response = await fetch(`/api/owner/billing?${params}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message);
      setBills(data.data); setOrders(data.orders); setTotal(data.meta.total); setPageCount(Math.max(1, data.meta.pageCount));
      if (selected) setSelected(data.data.find((bill: Bill) => bill.id === selected.id) || null);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to load billing records."); }
    finally { setLoading(false); }
  }, [page, search, status, sort, selected?.id]);

  useEffect(() => { load(); }, [load]);


  async function showPrintableBill(id: number, autoPrint = false) {
    try {
      const response = await fetch(`/api/owner/billing/${id}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message);
      setSelected(data.data);
      if (autoPrint) window.setTimeout(() => window.print(), 180);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not prepare receipt.");
    }
  }

  async function createBill() {
    if (!orderId) return toast.error("Select an order.");
    setBusy(true);
    try {
      const response = await fetch("/api/owner/billing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: Number(orderId), serviceCharges: Number(serviceCharges), deliveryCharges: Number(deliveryCharges), discountAmount: discountAmount === "" ? undefined : Number(discountAmount), paymentStatus, paymentMethod: paymentMethod || undefined, notes }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message);
      toast.success("Bill generated."); setFormOpen(false); setOrderId(""); setPaymentStatus("UNPAID"); setPaymentMethod(""); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to generate bill."); }
    finally { setBusy(false); }
  }

  async function updatePayment(nextStatus: string) {
    if (!selected) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/owner/billing/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paymentStatus: nextStatus, paymentMethod: selected.paymentMethod || "CASH" }) });
      const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.message);
      toast.success(data.message); const billId = selected.id; setSelected(null); await load(); if (nextStatus === "PAID" && settings.autoPrintReceipt) await showPrintableBill(billId, true);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to update bill."); }
    finally { setBusy(false); }
  }

  const selectedPaid = useMemo(() => selected?.payments?.reduce((sum, payment) => sum + Number(payment.amount), 0) || 0, [selected]);
  const selectedBalance = selected ? Math.max(0, Number(selected.grandTotal) - selectedPaid) : 0;
  const splitTotal = splitRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

  function openSplit() {
    if (!selected) return;
    setSplitRows([{ method: "CASH", amount: selectedBalance ? selectedBalance.toFixed(2) : "", reference: "" }, { method: "CARD", amount: "", reference: "" }]);
    setSplitOpen(true);
  }

  async function submitSplit() {
    if (!selected) return;
    const payments = splitRows.filter((row) => Number(row.amount) > 0);
    if (!payments.length) return toast.error("Enter at least one payment amount.");
    if (splitTotal > selectedBalance + 0.009) return toast.error("Split amount is greater than the outstanding balance.");
    setBusy(true);
    try {
      const response = await fetch(`/api/owner/billing/${selected.id}/split-payment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payments: payments.map((row) => ({ ...row, amount: Number(row.amount) })) }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message);
      toast.success(data.message); const billId = selected.id; const completed = Number(data.data?.remaining ?? 1) <= 0.009; setSplitOpen(false); setSelected(null); await load(); if (completed && settings.autoPrintReceipt) await showPrintableBill(billId, true);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Split payment failed."); }
    finally { setBusy(false); }
  }

  return <div className="erp-page erp-page-billing space-y-6 p-6">
    <Toaster position="top-right" />
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><h1 className="text-3xl font-bold tracking-tight">Billing</h1><p className="text-muted-foreground">Generate invoices, record split payments and close tables safely</p></div><button onClick={() => setFormOpen(true)} className="flex items-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Create Bill</button></div>
    <div className="flex flex-col gap-3 md:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search bill #, order #, or customer..." className="w-full rounded-xl border py-3 pl-10 pr-4 outline-none focus:border-black" /></div><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="rounded-xl border bg-white px-4 py-3"><option value="ALL">All payment statuses</option>{STATUSES.map((item) => <option key={item} value={item}>{item.replace("_", " ")}</option>)}</select><select value={sort} onChange={(event) => setSort(event.target.value)} className="rounded-xl border bg-white px-4 py-3"><option value="date">Newest first</option><option value="total">Highest total</option></select></div>
    <div className="overflow-x-auto rounded-xl border bg-white shadow-sm"><table className="w-full min-w-[780px] text-sm"><thead className="bg-gray-50"><tr>{["Bill", "Order / customer", "Date", "Table", "Grand total", "Payment", "Action"].map((heading) => <th key={heading} className="p-4 text-left font-semibold">{heading}</th>)}</tr></thead><tbody>{loading ? <tr><td colSpan={7} className="p-12 text-center text-gray-500"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading bills...</td></tr> : bills.length === 0 ? <tr><td colSpan={7} className="p-12 text-center text-gray-500">No bills found.</td></tr> : bills.map((bill) => <tr key={bill.id} onClick={() => setSelected(bill)} className="cursor-pointer border-t hover:bg-gray-50"><td className="p-4 font-semibold">#{bill.billNumber}</td><td className="p-4"><p>{bill.order.orderNumber}</p><p className="text-xs text-gray-500">{bill.order.customerName || "Guest"}</p></td><td className="p-4 text-gray-600">{new Date(bill.billingDate).toLocaleString()}</td><td className="p-4">{bill.order.table?.name || "—"}</td><td className="p-4 font-semibold">{money(bill.grandTotal)}</td><td className="p-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${colors[bill.paymentStatus]}`}>{bill.paymentStatus.replace("_", " ")}</span></td><td className="p-4 text-right"><Eye className="h-4 w-4 text-gray-500" /></td></tr>)}</tbody></table></div>
    <div className="flex items-center justify-between text-sm text-gray-500"><span>{total} bill{total === 1 ? "" : "s"}</span><div className="flex items-center gap-2"><button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border p-2 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button><span>Page {page} of {pageCount}</span><button disabled={page >= pageCount} onClick={() => setPage(page + 1)} className="rounded-lg border p-2 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></div></div>

    {formOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-2xl font-bold">Create Bill</h2><button onClick={() => setFormOpen(false)}><X className="h-5 w-5" /></button></div><select value={orderId} onChange={(event) => { setOrderId(event.target.value); const order = orders.find((item) => item.id === Number(event.target.value)); setDiscountAmount(order?.discountAmount || ""); }} className="w-full rounded-lg border bg-white p-3"><option value="">Select an unbilled order</option>{orders.map((order) => <option key={order.id} value={order.id}>#{order.orderNumber} · {order.customerName || "Guest"} · {money(order.totalAmount || 0)}</option>)}</select><div className="mt-4 grid grid-cols-2 gap-3"><input type="number" min="0" placeholder="Discount" value={discountAmount} onChange={(event) => setDiscountAmount(event.target.value)} className="rounded-lg border p-3" /><input type="number" min="0" placeholder="Service charges" value={serviceCharges} onChange={(event) => setServiceCharges(event.target.value)} className="rounded-lg border p-3" /><input type="number" min="0" placeholder="Delivery charges" value={deliveryCharges} onChange={(event) => setDeliveryCharges(event.target.value)} className="rounded-lg border p-3" /><select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)} className="rounded-lg border bg-white p-3">{STATUSES.filter((item) => item !== "REFUNDED" && item !== "CANCELLED").map((item) => <option key={item} value={item}>{item.replace("_", " ")}</option>)}</select><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="rounded-lg border bg-white p-3"><option value="">Payment method</option>{METHODS.map((item) => <option key={item} value={item}>{item.replace("_", " ")}</option>)}</select></div><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Bill notes" className="mt-3 min-h-20 w-full rounded-lg border p-3" /><div className="mt-6 flex justify-end gap-3"><button onClick={() => setFormOpen(false)} className="rounded-lg border px-5 py-2">Cancel</button><button onClick={createBill} disabled={busy} className="rounded-lg bg-black px-5 py-2 text-white disabled:opacity-50">{busy ? "Generating..." : "Generate Invoice"}</button></div></div></div>}

    {selected && <div className="fixed inset-0 z-50 flex justify-end bg-black/50"><div className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl" id="bill-print"><div className="mb-5 flex items-start justify-between"><div><h2 className="text-xl font-bold">#{selected.billNumber}</h2><p className="text-sm text-gray-500">Order #{selected.order.orderNumber}</p></div><button onClick={() => setSelected(null)}><X className="h-5 w-5" /></button></div><div className="space-y-1 text-sm"><p><b>Customer:</b> {selected.order.customerName || "Guest"}</p><p><b>Table:</b> {selected.order.table?.name || "—"}</p><p><b>Date:</b> {new Date(selected.billingDate).toLocaleString()}</p></div><div className="my-5 space-y-3 border-y py-4 text-sm">{selected.order.items.map((item) => <div key={item.id} className="flex justify-between"><span>{item.quantity}× {item.nameSnapshot} <span className="text-gray-500">({money(item.price)})</span></span><b>{money(Number(item.price) * item.quantity)}</b></div>)}</div><div className="space-y-1 text-sm"><p className="flex justify-between"><span>Subtotal</span><b>{money(selected.subtotal)}</b></p><p className="flex justify-between"><span>Discount</span><b>-{money(selected.discountAmount)}</b></p><p className="flex justify-between"><span>Tax</span><b>{money(selected.taxAmount)}</b></p><p className="flex justify-between"><span>Service / delivery</span><b>{money(Number(selected.serviceCharges) + Number(selected.deliveryCharges))}</b></p><p className="flex justify-between border-t pt-2 text-lg font-bold"><span>Grand total</span><b>{money(selected.grandTotal)}</b></p></div>
      {!!selected.payments?.length && <div className="mt-5 rounded-2xl bg-slate-50 p-4"><div className="mb-2 flex justify-between text-sm font-semibold"><span>Payments received</span><span>{money(selectedPaid)}</span></div>{selected.payments.map((payment) => <div key={payment.id} className="flex justify-between border-t py-2 text-xs text-slate-600"><span>{payment.method.replace("_", " ")}{payment.reference ? ` · ${payment.reference}` : ""}</span><b>{money(payment.amount)}</b></div>)}<div className="mt-2 flex justify-between border-t pt-2 text-sm"><span>Balance</span><b>{money(selectedBalance)}</b></div></div>}
      <span className={`mt-4 inline-block rounded-full px-3 py-1 text-xs font-semibold ${colors[selected.paymentStatus]}`}>{selected.paymentStatus.replace("_", " ")}</span><div className="mt-6 grid grid-cols-2 gap-2 print:hidden"><button onClick={() => window.print()} className="flex items-center justify-center gap-2 rounded-lg border py-2 text-sm"><Printer className="h-4 w-4" /> Print receipt</button><button onClick={() => window.print()} className="flex items-center justify-center gap-2 rounded-lg border py-2 text-sm"><Download className="h-4 w-4" /> Download PDF</button><button disabled className="flex items-center justify-center gap-2 rounded-lg border py-2 text-sm text-gray-400"><Mail className="h-4 w-4" /> Email (future)</button>{!["PAID", "REFUNDED", "CANCELLED"].includes(selected.paymentStatus) && <button onClick={openSplit} className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white"><Split className="h-4 w-4" /> Split payment</button>}{selected.paymentStatus === "PAID" ? <button disabled={busy} onClick={() => updatePayment("REFUNDED")} className="rounded-lg border border-purple-200 py-2 text-sm text-purple-700">Refund bill</button> : selected.paymentStatus !== "CANCELLED" && <button disabled={busy} onClick={() => updatePayment("PAID")} className="rounded-lg bg-black py-2 text-sm text-white">Mark paid</button>}</div></div></div>}

    {selected && <ThermalReceipt bill={selected} settings={settings} money={money} />}

    {splitOpen && selected && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"><div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl"><div className="mb-5 flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-blue-600">Flexible checkout</p><h2 className="mt-1 text-2xl font-bold">Split payment</h2><p className="text-sm text-slate-500">Outstanding balance: {money(selectedBalance)}</p></div><button onClick={() => setSplitOpen(false)} className="rounded-xl border p-2"><X className="h-4 w-4" /></button></div><div className="space-y-3">{splitRows.map((row, index) => <div key={index} className="grid gap-3 rounded-2xl border bg-slate-50 p-4 md:grid-cols-[140px_1fr_1fr_auto]"><select value={row.method} onChange={(e) => setSplitRows((rows) => rows.map((item, i) => i === index ? { ...item, method: e.target.value as SplitRow["method"] } : item))} className="rounded-xl border bg-white px-3 py-2.5">{METHODS.map((method) => <option key={method}>{method}</option>)}</select><input type="number" min="0.01" step="0.01" placeholder="Amount" value={row.amount} onChange={(e) => setSplitRows((rows) => rows.map((item, i) => i === index ? { ...item, amount: e.target.value } : item))} className="rounded-xl border bg-white px-3 py-2.5" /><input placeholder="Reference (optional)" value={row.reference} onChange={(e) => setSplitRows((rows) => rows.map((item, i) => i === index ? { ...item, reference: e.target.value } : item))} className="rounded-xl border bg-white px-3 py-2.5" /><button onClick={() => setSplitRows((rows) => rows.filter((_, i) => i !== index))} className="rounded-xl border p-2 text-red-600"><Trash2 className="h-4 w-4" /></button></div>)}</div><button onClick={() => setSplitRows((rows) => [...rows, { method: "CASH", amount: "", reference: "" }])} className="mt-3 inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm"><Plus className="h-4 w-4" /> Add payment method</button><div className="mt-5 grid grid-cols-3 gap-3 rounded-2xl bg-slate-950 p-4 text-white"><div><p className="text-xs text-slate-400">Balance</p><b>{money(selectedBalance)}</b></div><div><p className="text-xs text-slate-400">Entering</p><b>{money(splitTotal)}</b></div><div><p className="text-xs text-slate-400">Remaining</p><b>{money(Math.max(0, selectedBalance - splitTotal))}</b></div></div><div className="mt-6 flex justify-end gap-3"><button onClick={() => setSplitOpen(false)} className="rounded-xl border px-4 py-2.5">Cancel</button><button disabled={busy || splitTotal <= 0 || splitTotal > selectedBalance + 0.009} onClick={submitSplit} className="rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50">{busy ? "Recording..." : "Record split payment"}</button></div></div></div>}
  </div>;
}
