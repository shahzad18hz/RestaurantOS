"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast, Toaster } from "sonner";
import { useRestaurantSettings } from "@/hooks/useRestaurantSettings";
import { Search, Plus, Minus, Trash2, Loader2, ShoppingBag, Leaf, Beef } from "lucide-react";

/* ========================================================== */

interface Category {
  id: number;
  name: string;
  status: "ACTIVE" | "INACTIVE";
}

interface MenuItem {
  id: number;
  categoryId: number;
  name: string;
  image: string | null;
  price: string;
  isVeg: boolean;
  status: "ACTIVE" | "INACTIVE";
  recipeIngredients?: { quantity: string | number; inventoryItem: { id: number; name: string; unit: string; currentStock: string | number; minimumStock: string | number } }[];
}

interface Table {
  id: number;
  name: string;
  status: "AVAILABLE" | "OCCUPIED" | "RESERVED" | "CLEANING";
  orders: { id: number; orderNumber: string }[];
}

interface CartLine {
  menuItem: MenuItem;
  quantity: number;
}

async function getError(res: Response) {
  try {
    const data = await res.json();
    return data.message || "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
}



/* ========================================================== */

export default function POSPage() {
  const { settings, money } = useRestaurantSettings();
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");

  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderType, setOrderType] = useState<"DINE_IN" | "TAKEAWAY" | "DELIVERY">("DINE_IN");
  const [tableId, setTableId] = useState<string>("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [placing, setPlacing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [itemsRes, catRes, tableRes] = await Promise.all([
        fetch("/api/owner/menu-item", { cache: "no-store" }),
        fetch("/api/owner/category", { cache: "no-store" }),
        fetch("/api/owner/table", { cache: "no-store" }),
      ]);
      const [itemsData, catData, tableData] = await Promise.all([
        itemsRes.json(),
        catRes.json(),
        tableRes.json(),
      ]);
      if (!itemsRes.ok) throw new Error(itemsData.message);
      if (!catRes.ok) throw new Error(catData.message);
      if (!tableRes.ok) throw new Error(tableData.message);

      setMenuItems(itemsData.data.filter((i: MenuItem) => i.status === "ACTIVE"));
      setCategories(catData.data);
      setTables(tableData.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load POS data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
      const matchesCategory =
        categoryFilter === "ALL" || item.categoryId === Number(categoryFilter);
      return matchesSearch && matchesCategory;
    });
  }, [menuItems, search, categoryFilter]);

  const subtotal = cart.reduce((sum, l) => sum + Number(l.menuItem.price) * l.quantity, 0);
  const taxRate = Math.max(0, Number(settings.taxPercentage || 0)) / 100;
  const tax = settings.taxInclusive && taxRate > 0 ? subtotal - subtotal / (1 + taxRate) : subtotal * taxRate;
  const total = settings.taxInclusive ? subtotal : subtotal + tax;

  function itemInStock(item: MenuItem) {
    if (!item.recipeIngredients?.length) return true;
    return item.recipeIngredients.every((recipe) => Number(recipe.inventoryItem.currentStock) + 1e-9 >= Number(recipe.quantity));
  }

  function addToCart(item: MenuItem) {
    if (!itemInStock(item)) {
      toast.error(`${item.name} is unavailable because an ingredient is out of stock.`);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((l) => l.menuItem.id === item.id);
      if (existing) {
        return prev.map((l) =>
          l.menuItem.id === item.id ? { ...l, quantity: l.quantity + 1 } : l
        );
      }
      return [...prev, { menuItem: item, quantity: 1 }];
    });
  }

  function updateQty(itemId: number, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => (l.menuItem.id === itemId ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0)
    );
  }

  function removeLine(itemId: number) {
    setCart((prev) => prev.filter((l) => l.menuItem.id !== itemId));
  }

  function resetCart() {
    setCart([]);
    setTableId("");
    setCustomerName("");
    setCustomerPhone("");
  }

  async function placeOrder() {
    if (cart.length === 0) return toast.error("Cart is empty.");
    if (orderType === "DINE_IN" && !tableId) return toast.error("Select a table for dine-in.");

    setPlacing(true);
    try {
      // If the chosen table already has an open order, add these items to it
      // instead of creating a duplicate order for the same table.
      const table = tables.find((t) => t.id === Number(tableId));
      const existingOrderId = orderType === "DINE_IN" ? table?.orders[0]?.id : undefined;

      if (existingOrderId) {
        for (const line of cart) {
          const res = await fetch(`/api/owner/order/${existingOrderId}/item`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ menuItemId: line.menuItem.id, quantity: line.quantity }),
          });
          if (!res.ok) throw new Error(await getError(res));
        }
        toast.success(`Items added to table ${table?.name}'s order.`);
      } else {
        const res = await fetch("/api/owner/order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: orderType,
            tableId: orderType === "DINE_IN" ? Number(tableId) : undefined,
            customerName: customerName || undefined,
            customerPhone: customerPhone || undefined,
            items: cart.map((l) => ({ menuItemId: l.menuItem.id, quantity: l.quantity })),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
        toast.success(`Order #${data.data.orderNumber} placed.`);
      }

      resetCart();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to place order.");
    } finally {
      setPlacing(false);
    }
  }

  return (
    <div className="erp-page erp-page-pos erp-pos-shell flex h-full flex-col lg:flex-row">
      <Toaster position="top-right" />

      {/* Menu grid */}
      <div className="flex-1 overflow-y-auto p-6">
        <h1 className="mb-4 text-2xl font-bold">Point of Sale</h1>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search menu..."
              className="w-full rounded-xl border py-2.5 pl-10 pr-4 outline-none focus:border-black"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-xl border px-4 py-2.5"
          >
            <option value="ALL">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {!loading && categories.length === 0 && (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 shadow-sm">
            <div className="font-semibold">Menu setup required</div>
            <p className="mt-1 text-amber-800">
              You need at least one category before adding menu items or taking POS orders.
            </p>
            <a
              href="/dashboard/owner/categories"
              className="mt-3 inline-flex rounded-lg bg-amber-950 px-3 py-2 font-semibold text-white transition hover:opacity-90"
            >
              Create a category
            </a>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-16 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading menu...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-16 text-center text-gray-400">No available items found.</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {filteredItems.map((item) => (
              <button
                key={item.id}
                onClick={() => addToCart(item)}
                disabled={!itemInStock(item)}
                className="relative rounded-xl border bg-white p-3 text-left shadow-sm transition hover:border-black hover:shadow-md disabled:cursor-not-allowed disabled:opacity-55"
              >
                <img
                  src={item.image || "/placeholder.svg"}
                  alt={item.name}
                  className="mb-2 h-24 w-full rounded-lg object-cover"
                />
                <div className="flex items-center gap-1 text-sm font-medium">
                  {item.isVeg ? (
                    <Leaf className="h-3 w-3 text-green-600" />
                  ) : (
                    <Beef className="h-3 w-3 text-red-600" />
                  )}
                  <span className="line-clamp-1">{item.name}</span>
                </div>
                <p className="mt-1 font-bold">{money(Number(item.price))}</p>
                {!itemInStock(item) && <span className="mt-2 inline-flex rounded-full bg-red-100 px-2 py-1 text-[10px] font-bold text-red-700">Ingredient out of stock</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cart */}
      <div className="flex w-full flex-col border-t bg-gray-50 p-6 lg:w-96 lg:border-l lg:border-t-0">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
          <ShoppingBag className="h-5 w-5" /> Current Order
        </h2>

        <div className="mb-4 flex gap-2">
          {(["DINE_IN", "TAKEAWAY", "DELIVERY"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setOrderType(t)}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold transition ${
                orderType === t ? "bg-black text-white" : "bg-white text-gray-600"
              }`}
            >
              {t.replace("_", " ")}
            </button>
          ))}
        </div>

        {orderType === "DINE_IN" && (
          <select
            value={tableId}
            onChange={(e) => setTableId(e.target.value)}
            className="mb-3 w-full rounded-lg border p-2.5 text-sm"
          >
            <option value="">Select a table</option>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} {t.status === "OCCUPIED" ? "(occupied — will add to bill)" : ""}
              </option>
            ))}
          </select>
        )}

        {orderType !== "DINE_IN" && (
          <div className="mb-3 space-y-2">
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Customer name"
              className="w-full rounded-lg border p-2.5 text-sm"
            />
            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="Phone number"
              className="w-full rounded-lg border p-2.5 text-sm"
            />
          </div>
        )}

        <div className="flex-1 space-y-2 overflow-y-auto">
          {cart.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">Tap an item to add it</p>
          ) : (
            cart.map((line) => (
              <div
                key={line.menuItem.id}
                className="flex items-center justify-between rounded-lg bg-white p-2.5 shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{line.menuItem.name}</p>
                  <p className="text-xs text-gray-500">{money(Number(line.menuItem.price))}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => updateQty(line.menuItem.id, -1)}
                    className="rounded bg-gray-100 p-1"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-5 text-center text-sm font-semibold">{line.quantity}</span>
                  <button
                    onClick={() => updateQty(line.menuItem.id, 1)}
                    className="rounded bg-gray-100 p-1"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => removeLine(line.menuItem.id)}
                    className="ml-1 rounded p-1 text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 space-y-1.5 border-t pt-3 text-sm">
          <div className="flex justify-between text-gray-500">
            <span>Subtotal</span>
            <span>{money(subtotal)}</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>{settings.taxName || "Tax"} ({Number(settings.taxPercentage || 0)}%{settings.taxInclusive ? ", included" : ""})</span>
            <span>{money(tax)}</span>
          </div>
          <div className="flex justify-between text-base font-bold">
            <span>Total</span>
            <span>{money(total)}</span>
          </div>
        </div>

        <button
          onClick={placeOrder}
          disabled={placing || cart.length === 0}
          className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-black py-3 font-semibold text-white disabled:opacity-50"
        >
          {placing && <Loader2 className="h-4 w-4 animate-spin" />}
          {placing ? "Placing Order..." : `Place Order · ${money(total)}`}
        </button>
      </div>
    </div>
  );
}
