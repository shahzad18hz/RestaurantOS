"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast, Toaster } from "sonner";
import { useRestaurantSettings } from "@/hooks/useRestaurantSettings";
import {
  Search,
  Loader2,
  ShoppingCart,
  X,
  Ban,
  CreditCard,
  CheckCircle2,
} from "lucide-react";

/* ========================================================== */

interface OrderItem {
  id: number;
  nameSnapshot: string;
  quantity: number;
  price: string;
  status: string;
  notes?: string | null;
  menuItem: { id: number; name: string; image: string | null };
}

interface Order {
  id: number;
  orderNumber: string;
  type: "DINE_IN" | "TAKEAWAY" | "DELIVERY";
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  customerName: string | null;
  customerPhone: string | null;
  subtotal: string;
  taxAmount: string;
  discountAmount: string;
  totalAmount: string;
  notes: string | null;
  createdAt: string;
  table: { id: number; name: string } | null;
  items: OrderItem[];
}

const STATUS_FLOW = ["PENDING", "CONFIRMED", "PREPARING", "READY", "SERVED", "COMPLETED"];

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-gray-100 text-gray-700",
  CONFIRMED: "bg-blue-100 text-blue-700",
  PREPARING: "bg-yellow-100 text-yellow-700",
  READY: "bg-purple-100 text-purple-700",
  SERVED: "bg-indigo-100 text-indigo-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
};

async function getError(res: Response) {
  try {
    const data = await res.json();
    return data.message || "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
}

/* ========================================================== */

export default function OrdersPage() {
  const { money } = useRestaurantSettings();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [selected, setSelected] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/owner/order", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message);
      setOrders(data.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load orders.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Keep the open detail panel in sync with the freshest list data
  useEffect(() => {
    if (selected) {
      const fresh = orders.find((o) => o.id === selected.id);
      if (fresh) setSelected(fresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      const matchesSearch =
        o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
        (o.customerName || "").toLowerCase().includes(search.toLowerCase()) ||
        (o.table?.name || "").toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "ALL" || o.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [orders, search, statusFilter]);

  async function advanceStatus(order: Order) {
    const idx = STATUS_FLOW.indexOf(order.status);
    const next = STATUS_FLOW[idx + 1];
    if (!next) return;

    if (next === "COMPLETED" && order.paymentStatus !== "PAID") {
      toast.error("Record payment before completing this order.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/owner/order/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error(await getError(res));
      toast.success(`Order #${order.orderNumber} marked ${next.toLowerCase()}.`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update order.");
    } finally {
      setBusy(false);
    }
  }

  async function recordPayment(order: Order, method: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/owner/order/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentStatus: "PAID", paymentMethod: method }),
      });
      if (!res.ok) throw new Error(await getError(res));
      toast.success("Payment recorded.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record payment.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelOrder(order: Order) {
    if (!confirm(`Cancel order #${order.orderNumber}? This can't be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/owner/order/${order.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      toast.success("Order cancelled.");
      setSelected(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel order.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="erp-page erp-page-orders space-y-6 p-6">
      <Toaster position="top-right" />

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
        <p className="text-muted-foreground">Track every order from placement to payment</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        {["ALL", ...STATUS_FLOW, "CANCELLED"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-xl border p-4 text-left shadow-sm transition ${
              statusFilter === s ? "border-black bg-black text-white" : "bg-white hover:bg-gray-50"
            }`}
          >
            <p className="text-xs opacity-70">{s === "ALL" ? "All Orders" : s}</p>
            <h2 className="mt-1 text-2xl font-bold">
              {s === "ALL" ? orders.length : orders.filter((o) => o.status === s).length}
            </h2>
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by order #, customer, or table..."
          className="w-full rounded-xl border py-3 pl-10 pr-4 outline-none focus:border-black"
        />
      </div>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-4 text-left font-semibold">Order</th>
              <th className="p-4 text-left font-semibold">Type / Table</th>
              <th className="p-4 text-left font-semibold">Items</th>
              <th className="p-4 text-left font-semibold">Total</th>
              <th className="p-4 text-left font-semibold">Payment</th>
              <th className="p-4 text-left font-semibold">Status</th>
              <th className="p-4 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="p-10 text-center text-gray-500">
                  <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                  Loading orders...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-10 text-center text-gray-500">
                  <ShoppingCart className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                  No orders found.
                </td>
              </tr>
            ) : (
              filtered.map((order) => (
                <tr
                  key={order.id}
                  className="cursor-pointer border-t hover:bg-gray-50"
                  onClick={() => setSelected(order)}
                >
                  <td className="p-4">
                    <p className="font-semibold">#{order.orderNumber}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(order.createdAt).toLocaleString()}
                    </p>
                  </td>
                  <td className="p-4 text-gray-600">
                    {order.type.replace("_", " ")}
                    {order.table ? ` · ${order.table.name}` : ""}
                  </td>
                  <td className="p-4 text-gray-600">
                    {order.items.reduce((n, i) => n + i.quantity, 0)} items
                  </td>
                  <td className="p-4 font-semibold">{money(order.totalAmount)}</td>
                  <td className="p-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        order.paymentStatus === "PAID"
                          ? "bg-green-100 text-green-700"
                          : "bg-orange-100 text-orange-700"
                      }`}
                    >
                      {order.paymentStatus.replace("_", " ")}
                    </span>
                  </td>
                  <td className="p-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_COLORS[order.status]}`}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td className="p-4 text-right text-xs text-gray-400">View →</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50">
          <div className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">#{selected.orderNumber}</h2>
                <p className="text-sm text-gray-500">
                  {new Date(selected.createdAt).toLocaleString()}
                </p>
              </div>
              <button onClick={() => setSelected(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_COLORS[selected.status]}`}>
                {selected.status}
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  selected.paymentStatus === "PAID"
                    ? "bg-green-100 text-green-700"
                    : "bg-orange-100 text-orange-700"
                }`}
              >
                {selected.paymentStatus.replace("_", " ")}
              </span>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                {selected.type.replace("_", " ")}
                {selected.table ? ` · ${selected.table.name}` : ""}
              </span>
            </div>

            {(selected.customerName || selected.customerPhone) && (
              <div className="mb-4 rounded-lg bg-gray-50 p-3 text-sm">
                <p className="font-medium">{selected.customerName || "Guest"}</p>
                {selected.customerPhone && <p className="text-gray-500">{selected.customerPhone}</p>}
              </div>
            )}

            <div className="space-y-3">
              {selected.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between border-b pb-3">
                  <div>
                    <p className="font-medium">
                      {item.quantity}× {item.nameSnapshot}
                    </p>
                    {item.notes && <p className="text-xs text-gray-500">{item.notes}</p>}
                    <span className="text-xs text-gray-400">{item.status}</span>
                  </div>
                  <p className="font-semibold">{money(Number(item.price) * item.quantity)}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-500">
                <span>Subtotal</span>
                <span>{money(selected.subtotal)}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Tax</span>
                <span>{money(selected.taxAmount)}</span>
              </div>
              {Number(selected.discountAmount) > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>Discount</span>
                  <span>-{money(selected.discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-1.5 text-base font-bold">
                <span>Total</span>
                <span>{money(selected.totalAmount)}</span>
              </div>
            </div>

            {selected.notes && (
              <p className="mt-3 rounded-lg bg-yellow-50 p-2 text-xs text-yellow-800">
                Note: {selected.notes}
              </p>
            )}

            {/* Actions */}
            {!["COMPLETED", "CANCELLED"].includes(selected.status) && (
              <div className="mt-6 space-y-2">
                {selected.paymentStatus !== "PAID" && (
                  <div className="flex gap-2">
                    {["CASH", "CARD", "ONLINE"].map((m) => (
                      <button
                        key={m}
                        disabled={busy}
                        onClick={() => recordPayment(selected, m)}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
                      >
                        <CreditCard className="h-3.5 w-3.5" />
                        {m}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  {STATUS_FLOW.indexOf(selected.status) < STATUS_FLOW.length - 1 && (
                    <button
                      disabled={busy}
                      onClick={() => advanceStatus(selected)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-black py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Mark {STATUS_FLOW[STATUS_FLOW.indexOf(selected.status) + 1]}
                    </button>
                  )}
                  <button
                    disabled={busy}
                    onClick={() => cancelOrder(selected)}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 disabled:opacity-50"
                  >
                    <Ban className="h-4 w-4" />
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


