"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast, Toaster } from "sonner";
import ImageUrlField from "@/components/ui/ImageUrlField";
import { useRestaurantSettings } from "@/hooks/useRestaurantSettings";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  UtensilsCrossed,
  Leaf,
  Beef,
  X,
} from "lucide-react";

/* ========================================================== */
/* TYPES                                                       */
/* ========================================================== */

interface Category {
  id: number;
  name: string;
  status: "ACTIVE" | "INACTIVE";
}

interface InventoryOption {
  id: number;
  name: string;
  unit: string;
  currentStock: string | number;
  minimumStock: string | number;
}

interface RecipeRow {
  inventoryItemId: string;
  quantity: string;
}

interface MenuItem {
  id: number;
  categoryId: number;
  name: string;
  description: string | null;
  image: string | null;
  price: string | number;
  isVeg: boolean;
  preparationTime: number | null;
  status: "ACTIVE" | "INACTIVE";
  sortOrder: number;
  category: { id: number; name: string };
  recipeIngredients?: { inventoryItemId: number; quantity: string | number; inventoryItem: InventoryOption }[];
}

interface FormState {
  categoryId: string;
  name: string;
  description: string;
  image: string;
  price: string;
  isVeg: boolean;
  preparationTime: string;
  status: "ACTIVE" | "INACTIVE";
  sortOrder: string;
}

const emptyForm: FormState = {
  categoryId: "",
  name: "",
  description: "",
  image: "",
  price: "",
  isVeg: true,
  preparationTime: "",
  status: "ACTIVE",
  sortOrder: "0",
};

const PAGE_SIZE = 10;

/* ========================================================== */
/* HELPERS                                                      */
/* ========================================================== */

async function getError(res: Response) {
  try {
    const data = await res.json();
    return data.message || "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
}

/* ========================================================== */
/* PAGE                                                         */
/* ========================================================== */

export default function MenuPage() {
  const { money, settings } = useRestaurantSettings();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [inventory, setInventory] = useState<InventoryOption[]>([]);
  const [recipeRows, setRecipeRows] = useState<RecipeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<MenuItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* -------------------- Load -------------------- */

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [itemsRes, catRes, inventoryRes] = await Promise.all([
        fetch("/api/owner/menu-item", { cache: "no-store" }),
        fetch("/api/owner/category", { cache: "no-store" }),
        fetch("/api/owner/inventory?pageSize=50&status=ACTIVE", { cache: "no-store" }),
      ]);

      const itemsData = await itemsRes.json();
      const catData = await catRes.json();
      const inventoryData = await inventoryRes.json();

      if (!itemsRes.ok || !itemsData.success) throw new Error(itemsData.message);
      if (!catRes.ok || !catData.success) throw new Error(catData.message);
      if (!inventoryRes.ok || !inventoryData.success) throw new Error(inventoryData.message);

      setItems(itemsData.data);
      setCategories(catData.data);
      setInventory(inventoryData.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load menu.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    setPage(1);
  }, [search, categoryFilter, statusFilter]);

  /* -------------------- Derived -------------------- */

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
      const matchesCategory =
        categoryFilter === "ALL" || item.categoryId === Number(categoryFilter);
      const matchesStatus = statusFilter === "ALL" || item.status === statusFilter;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [items, search, categoryFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  /* -------------------- Form -------------------- */

  function openCreate() {
    setEditing(null);
    setRecipeRows([]);
    setForm({ ...emptyForm, categoryId: categories[0] ? String(categories[0].id) : "" });
    setFormOpen(true);
  }

  function openEdit(item: MenuItem) {
    setEditing(item);
    setRecipeRows((item.recipeIngredients || []).map((row) => ({ inventoryItemId: String(row.inventoryItemId), quantity: String(row.quantity) })));
    setForm({
      categoryId: String(item.categoryId),
      name: item.name,
      description: item.description || "",
      image: item.image || "",
      price: String(item.price),
      isVeg: item.isVeg,
      preparationTime: item.preparationTime ? String(item.preparationTime) : "",
      status: item.status,
      sortOrder: String(item.sortOrder ?? 0),
    });
    setFormOpen(true);
  }

  async function handleSubmit() {
    if (!form.name.trim()) return toast.error("Item name is required.");
    if (!form.categoryId) return toast.error("Please select a category.");
    if (!form.price || Number.isNaN(Number(form.price)) || Number(form.price) < 0)
      return toast.error("Enter a valid price.");

    setSubmitting(true);
    try {
      const url = editing ? `/api/owner/menu-item/${editing.id}` : "/api/owner/menu-item";
      const method = editing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          categoryId: Number(form.categoryId),
          price: Number(form.price),
          preparationTime: form.preparationTime ? Number(form.preparationTime) : null,
          recipeIngredients: recipeRows
            .filter((row) => row.inventoryItemId && Number(row.quantity) > 0)
            .map((row) => ({ inventoryItemId: Number(row.inventoryItemId), quantity: Number(row.quantity) })),
        }),
      });

      if (!res.ok) throw new Error(await getError(res));

      toast.success(editing ? "Menu item updated." : "Menu item created.");
      setFormOpen(false);
      await loadAll();
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
      const res = await fetch(`/api/owner/menu-item/${deleteTarget.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      toast.success(data.message);
      setDeleteTarget(null);
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  }

  async function toggleStatus(item: MenuItem) {
    try {
      const nextStatus = item.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
      const res = await fetch(`/api/owner/menu-item/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) throw new Error(await getError(res));
      toast.success(`Marked ${nextStatus === "ACTIVE" ? "available" : "unavailable"}.`);
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status.");
    }
  }

  /* ========================================================== */
  /* RENDER                                                       */
  /* ========================================================== */

  return (
    <div className="erp-page erp-page-menu space-y-6 p-6">
      <Toaster position="top-right" />

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Menu</h1>
          <p className="text-muted-foreground">Manage the dishes you sell</p>
        </div>

        <button
          onClick={openCreate}
          disabled={categories.length === 0}
          className="flex items-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          title={categories.length === 0 ? "Create a category first" : ""}
        >
          <Plus className="h-4 w-4" />
          Add Menu Item
        </button>
      </div>

      {categories.length === 0 && !loading && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 shadow-sm">
          <div className="font-semibold">Menu setup required</div>
          <p className="mt-1 text-amber-800">You need at least one category before adding menu items.</p>
          <a
            href="/dashboard/owner/categories"
            className="mt-3 inline-flex rounded-lg bg-amber-950 px-3 py-2 font-semibold text-white transition hover:opacity-90"
          >
            Create your first category
          </a>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Items" value={items.length} />
        <StatCard
          label="Available"
          value={items.filter((i) => i.status === "ACTIVE").length}
          className="text-green-600"
        />
        <StatCard
          label="Unavailable"
          value={items.filter((i) => i.status === "INACTIVE").length}
          className="text-red-600"
        />
        <StatCard label="Categories" value={categories.length} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 md:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search menu items..."
            className="w-full rounded-xl border py-3 pl-10 pr-4 outline-none focus:border-black"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-xl border px-4 py-3"
        >
          <option value="ALL">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as never)}
          className="rounded-xl border px-4 py-3"
        >
          <option value="ALL">All Status</option>
          <option value="ACTIVE">Available</option>
          <option value="INACTIVE">Unavailable</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-4 text-left font-semibold">Item</th>
              <th className="p-4 text-left font-semibold">Category</th>
              <th className="p-4 text-left font-semibold">Price</th>
              <th className="p-4 text-left font-semibold">Prep Time</th>
              <th className="p-4 text-left font-semibold">Status</th>
              <th className="p-4 text-right font-semibold">Actions</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="p-10 text-center text-gray-500">
                  <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                  Loading menu...
                </td>
              </tr>
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-10 text-center text-gray-500">
                  <UtensilsCrossed className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                  No menu items found.
                </td>
              </tr>
            ) : (
              paged.map((item) => (
                <tr key={item.id} className="border-t hover:bg-gray-50">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={item.image || "/placeholder.svg"}
                        alt={item.name}
                        className="h-12 w-12 rounded-lg border object-cover"
                      />
                      <div>
                        <div className="flex items-center gap-1.5 font-medium">
                          {item.isVeg ? (
                            <Leaf className="h-3.5 w-3.5 text-green-600" />
                          ) : (
                            <Beef className="h-3.5 w-3.5 text-red-600" />
                          )}
                          {item.name}
                        </div>
                        {item.description && (
                          <p className="line-clamp-1 max-w-xs text-xs text-gray-500">
                            {item.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-gray-600">{item.category.name}</td>
                  <td className="p-4 font-semibold">{money(item.price)}</td>
                  <td className="p-4 text-gray-600">
                    {item.preparationTime ? `${item.preparationTime} min` : "-"}
                  </td>
                  <td className="p-4">
                    <button
                      onClick={() => toggleStatus(item)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                        item.status === "ACTIVE"
                          ? "bg-green-100 text-green-700 hover:bg-green-200"
                          : "bg-gray-200 text-gray-600 hover:bg-gray-300"
                      }`}
                    >
                      {item.status === "ACTIVE" ? "Available" : "Unavailable"}
                    </button>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => openEdit(item)}
                        className="rounded-lg border p-2 hover:bg-gray-100"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(item)}
                        className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, filtered.length)} of{" "}
            {filtered.length}
          </p>
          <div className="flex gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-lg border px-4 py-2 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="rounded-lg border px-4 py-2">
              {page} / {totalPages}
            </span>
            <button
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border px-4 py-2 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="erp-premium-modal max-h-[92vh] w-full max-w-3xl overflow-y-auto">
            <div className="erp-premium-modal-head">
              <div>
                <span className="erp-form-eyebrow">Menu management</span>
                <h2>{editing ? "Update menu item" : "Create menu item"}</h2>
                <p>Add the information your team and guests need. Required details come first.</p>
              </div>
              <button className="erp-icon-button" onClick={() => setFormOpen(false)} aria-label="Close form">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="erp-premium-form">
              <section className="erp-form-section">
                <div className="erp-form-section-copy"><span>01</span><div><h3>Item details</h3><p>Name, category and description shown across POS and menu screens.</p></div></div>
                <div className="erp-form-grid">
                  <label className="erp-field">
                    <span>Item name <b>*</b></span>
                    <input placeholder="e.g. Smoky Chicken Burger" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </label>
                  <label className="erp-field">
                    <span>Category <b>*</b></span>
                    <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                      <option value="">Choose category</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>
                  <label className="erp-field erp-field-full">
                    <span>Description</span>
                    <textarea rows={3} placeholder="Short, useful description for staff and customers" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                    <small>{form.description.length}/240 · Keep it concise and menu-friendly.</small>
                  </label>
                </div>
              </section>

              <section className="erp-form-section">
                <div className="erp-form-section-copy"><span>02</span><div><h3>Image</h3><p>Use a direct HTTPS image link. Preview it before saving.</p></div></div>
                <ImageUrlField label="Menu item image" value={form.image} onChange={(image) => setForm({ ...form, image })} />
              </section>

              <section className="erp-form-section">
                <div className="erp-form-section-copy"><span>03</span><div><h3>Pricing & preparation</h3><p>Set selling price, kitchen preparation time and availability.</p></div></div>
                <div className="erp-form-grid">
                  <label className="erp-field"><span>Price <b>*</b></span><div className="erp-prefix-input"><span>{settings.currency || "USD"}</span><input type="number" min="0" step="0.01" placeholder="0.00" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div></label>
                  <label className="erp-field"><span>Prep time</span><div className="erp-suffix-input"><input type="number" min="0" placeholder="15" value={form.preparationTime} onChange={(e) => setForm({ ...form, preparationTime: e.target.value })} /><span>min</span></div></label>
                  <label className="erp-choice-card"><input type="checkbox" checked={form.isVeg} onChange={(e) => setForm({ ...form, isVeg: e.target.checked })} /><div><strong>Vegetarian item</strong><small>Show a vegetarian indicator on ordering screens.</small></div></label>
                  <label className="erp-field"><span>Availability</span><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as never })}><option value="ACTIVE">Available</option><option value="INACTIVE">Unavailable</option></select></label>
                  <label className="erp-field"><span>Sort order</span><input type="number" min="0" step="1" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /><small>Lower numbers appear first in POS/menu lists.</small></label>
                </div>
              </section>

              <section className="erp-form-section">
                <div className="erp-form-section-copy"><span>04</span><div><h3>Recipe & stock</h3><p>Connect this menu item to inventory. Stock is validated before ordering and deducted automatically when payment completes.</p></div></div>
                <div className="space-y-3">
                  {recipeRows.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">No ingredients linked yet. Add ingredients to enable BOM stock control.</div>
                  ) : recipeRows.map((row, index) => {
                    const option = inventory.find((item) => item.id === Number(row.inventoryItemId));
                    return (
                      <div key={index} className="grid gap-3 rounded-2xl border bg-slate-50/70 p-4 md:grid-cols-[1fr_180px_auto] md:items-end">
                        <label className="erp-field"><span>Ingredient</span><select value={row.inventoryItemId} onChange={(e) => setRecipeRows((rows) => rows.map((item, i) => i === index ? { ...item, inventoryItemId: e.target.value } : item))}><option value="">Choose inventory item</option>{inventory.map((item) => <option key={item.id} value={item.id}>{item.name} · {Number(item.currentStock).toFixed(3)} {item.unit}</option>)}</select></label>
                        <label className="erp-field"><span>Qty per sale {option ? `(${option.unit})` : ""}</span><input type="number" min="0.001" step="0.001" value={row.quantity} onChange={(e) => setRecipeRows((rows) => rows.map((item, i) => i === index ? { ...item, quantity: e.target.value } : item))} placeholder="0.000" /></label>
                        <button type="button" onClick={() => setRecipeRows((rows) => rows.filter((_, i) => i !== index))} className="erp-icon-button mb-0.5 text-red-600" aria-label="Remove ingredient"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    );
                  })}
                  <button type="button" onClick={() => setRecipeRows((rows) => [...rows, { inventoryItemId: "", quantity: "" }])} className="erp-button-secondary inline-flex items-center gap-2"><Plus className="h-4 w-4" /> Add ingredient</button>
                </div>
              </section>
            </div>

            <div className="erp-premium-modal-actions">
              <p>{editing ? "Changes update the item across restaurant operations." : "You can edit availability anytime after creation."}</p>
              <div>
                <button onClick={() => setFormOpen(false)} className="erp-button-secondary">Cancel</button>
                <button onClick={handleSubmit} disabled={submitting} className="erp-button-primary">
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submitting ? "Saving..." : editing ? "Save changes" : "Create menu item"}
                </button>
              </div>
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
            <h2 className="mb-1 text-lg font-bold">Delete menu item?</h2>
            <p className="mb-5 text-sm text-gray-500">
              This will permanently remove &quot;{deleteTarget.name}&quot;. Items with past orders
              are deactivated instead.
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

function StatCard({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <h2 className={`mt-2 text-3xl font-bold ${className || ""}`}>{value}</h2>
    </div>
  );
}
