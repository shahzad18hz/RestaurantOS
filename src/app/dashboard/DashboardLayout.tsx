"use client";

import { useState, useEffect, useCallback } from "react";
import { z } from "zod";
import { toast, Toaster } from "sonner";
import {
  Search,
  Plus,
  MoreHorizontal,
  Store,
  Edit2,
  Trash2,
  CheckCircle,
  Clock,
  Ban,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ImagePlus,
  X,
} from "lucide-react";

/* ==========================================================
   TYPES
========================================================== */

interface Restaurant {
  id: number;
  name: string;
  email: string;
  phone: string;
  address: string;
  logo?: string | null;

  status: "PENDING" | "ACTIVE" | "SUSPENDED" | "REJECTED";

  createdAt: string;
  updatedAt: string;

  users: {
    role: string;
    user: {
      id: number;
      name: string;
      email: string;
    };
  }[];
}

interface RestaurantFormState {
  restaurantName: string;
  restaurantEmail: string;
  phone: string;
  address: string;
  ownerName: string;
  ownerEmail: string;
}

const emptyForm: RestaurantFormState = {
  restaurantName: "",
  restaurantEmail: "",
  phone: "",
  address: "",
  ownerName: "",
  ownerEmail: "",
};

const API_BASE = "/api/restaurant";
const PER_PAGE = 10;

/* ==========================================================
   VALIDATION (Zod) — Part 9, Step 5
========================================================== */

const restaurantSchema = z.object({
  restaurantName: z.string().min(3, "Restaurant name minimum 3 characters required"),
  restaurantEmail: z.string().email("Invalid restaurant email"),
  phone: z.string().min(10, "Invalid phone number"),
  address: z.string().min(5, "Address required"),
  ownerName: z.string().min(3, "Owner name required"),
  ownerEmail: z.string().email("Invalid owner email"),
});

/* ==========================================================
   HELPERS
========================================================== */

// Part 9, Step 7 — better API error handler: reads `message` or `error`
// from the response body, falls back cleanly if the body isn't JSON.
async function getError(res: Response) {
  try {
    const data = await res.json();
    return data.message || data.error || "Server Error";
  } catch {
    return "Server Error";
  }
}

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#";
  let pass = "";
  for (let i = 0; i < 12; i++) pass += chars[Math.floor(Math.random() * chars.length)];
  return pass;
}

/* ==========================================================
   API LAYER
========================================================== */

async function apiGetRestaurants(): Promise<Restaurant[]> {
  const res = await fetch(API_BASE, { cache: "no-store" });
  if (!res.ok) throw new Error(await getError(res));
  const data = await res.json();
  return Array.isArray(data) ? data : data.data ?? [];
}

async function apiCreateRestaurant(body: Record<string, unknown>) {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await getError(res));
  return res.json();
}

async function apiUpdateRestaurant(id: number, body: Record<string, unknown>) {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await getError(res));
  return res.json();
}

async function apiUpdateStatus(id: number, status: string) {
  const res = await fetch(API_BASE, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id,
      status,
    }),
  });

  if (!res.ok) throw new Error(await getError(res));

  return res.json();
}

async function apiDeleteRestaurant(id: number) {
  const res = await fetch(API_BASE, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id,
    }),
  });

  if (!res.ok) throw new Error(await getError(res));

  return res.json();
}

/* ==========================================================
   COMPONENT
========================================================== */

export default function Restaurants() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<RestaurantFormState>(emptyForm);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [generatedCreds, setGeneratedCreds] = useState<{ email: string; password: string } | null>(null);

  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* ------------------------------------------------------
     Load data
  ------------------------------------------------------ */

  const fetchRestaurants = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGetRestaurants();
      setRestaurants(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load restaurants");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRestaurants();
  }, [fetchRestaurants]);

  /* ------------------------------------------------------
     Status actions
  ------------------------------------------------------ */

  const setStatus = async (id: number, status: string, successMessage: string) => {
    try {
      await apiUpdateStatus(id, status);
      toast.success(successMessage);
      await fetchRestaurants();
    } catch (err: any) {
      toast.error(err.message || "Failed to update status");
    }
  };

  const approveRestaurant = (id: number) => setStatus(id, "ACTIVE", "Restaurant Approved");
  const rejectRestaurant = (id: number) => setStatus(id, "REJECTED", "Restaurant Rejected");
  const suspendRestaurant = (id: number) => setStatus(id, "SUSPENDED", "Restaurant Suspended");
  const activateRestaurant = (id: number) => setStatus(id, "ACTIVE", "Restaurant Activated");

  /* ------------------------------------------------------
     Logo upload — Part 9, Step 9: type + size validation
  ------------------------------------------------------ */

  async function uploadLogo() {
    if (!logoFile) return logoPreview || "";

    if (!logoFile.type.startsWith("image/")) {
      throw new Error("Only image files allowed");
    }
    if (logoFile.size > 2 * 1024 * 1024) {
      throw new Error("Image size must be less than 2MB");
    }

    const formData = new FormData();
    formData.append("file", logoFile);

    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Upload failed");
    return data.url as string;
  }

  /* ------------------------------------------------------
     Create / Update — Part 9, Step 5+6: zod validation first
  ------------------------------------------------------ */

  async function handleSubmit() {
    const validation = restaurantSchema.safeParse(form);
   if (!validation.success) {
  toast.error(validation.error.issues[0].message)
  return
}

    setSubmitting(true);
    try {
      const logo = await uploadLogo();

      const payload = {
        restaurantName: form.restaurantName,
        restaurantEmail: form.restaurantEmail,
        phone: form.phone,
        address: form.address,
        logo,
        ownerName: form.ownerName,
        ownerEmail: form.ownerEmail,
      };

      if (editingId) {
        await apiUpdateRestaurant(editingId, payload);
        toast.success("Restaurant updated successfully");
        await fetchRestaurants();
        setAddOpen(false);
        resetForm();
      } else {
        const password = generatePassword();
        await apiCreateRestaurant({ ...payload, ownerPassword: password });
        setGeneratedCreds({ email: form.ownerEmail, password });
        await fetchRestaurants();
        setAddOpen(false);
        resetForm();
      }
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  /* ------------------------------------------------------
     Delete
  ------------------------------------------------------ */

  const handleDelete = async (id: number) => {
    setDeleting(true);
    try {
      await apiDeleteRestaurant(id);
      toast.success("Restaurant deleted successfully");
      setDeleteConfirmId(null);
      setSelectedId(null);
      await fetchRestaurants();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete restaurant");
    } finally {
      setDeleting(false);
    }
  };

  /* ------------------------------------------------------
     Modal helpers
  ------------------------------------------------------ */

  function resetForm() {
    setForm(emptyForm);
    setLogoFile(null);
    setLogoPreview("");
    setEditingId(null);
  }

  function openCreateModal() {
    resetForm();
    setAddOpen(true);
  }

  function openEditModal(data: Restaurant) {
    setEditingId(data.id);
    setForm({
      restaurantName: data.name,
      restaurantEmail: data.email,
      phone: data.phone ?? "",
      address: data.address ?? "",
      ownerName: data.users?.[0]?.user?.name ?? "",
      ownerEmail: data.users?.[0]?.user?.email ?? "",
    });
    setLogoPreview(data.logo || "");
    setLogoFile(null);
    setAddOpen(true);
  }

  /* ------------------------------------------------------
     Derived state
  ------------------------------------------------------ */

  const filtered = restaurants.filter((r) => {
    const searchText = search.toLowerCase();
    const ownerName = r.users?.[0]?.user?.name ?? "";
    const matchSearch =
      r.name.toLowerCase().includes(searchText) ||
      ownerName.toLowerCase().includes(searchText) ||
      r.email.toLowerCase().includes(searchText);
    const matchStatus = statusFilter === "all" || r.status.toLowerCase() === statusFilter.toLowerCase();
    return matchSearch && matchStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const pagedRestaurants = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const selected = restaurants.find((r) => r.id === selectedId) || null;
  const restaurantPendingDelete = restaurants.find((r) => r.id === deleteConfirmId) || null;

  const statusBadgeClass = (status: string) =>
    status === "ACTIVE"
      ? "bg-green-100 text-green-700"
      : status === "PENDING"
      ? "bg-yellow-100 text-yellow-700"
      : status === "SUSPENDED"
      ? "bg-red-100 text-red-700"
      : "bg-gray-200 text-gray-700";

  /* ==========================================================
     RENDER
  ========================================================== */

  return (
    <div className="space-y-6 p-6">
      {/* Self-contained: mounts the toast portal right here so this single
          file works without touching layout.tsx. If you later add a
          <Toaster /> to your root layout for other pages too, remove this
          one to avoid having two instances mounted at once. */}
      <Toaster position="top-right" />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Restaurants</h1>
          <p className="text-gray-500 mt-1">Manage all registered restaurants</p>
        </div>

        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-5 py-3 rounded-xl bg-orange-600 text-white hover:bg-orange-700 transition"
        >
          <Plus className="w-5 h-5" />
          Add Restaurant
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5">
          <div className="flex justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Restaurants</p>
              <h2 className="text-3xl font-bold mt-2">{restaurants.length}</h2>
            </div>
            <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
              <Store className="text-orange-600" />
            </div>
          </div>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5">
          <div className="flex justify-between">
            <div>
              <p className="text-sm text-gray-500">Active</p>
              <h2 className="text-3xl font-bold mt-2">{restaurants.filter((r) => r.status === "ACTIVE").length}</h2>
            </div>
            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
              <CheckCircle className="text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5">
          <div className="flex justify-between">
            <div>
              <p className="text-sm text-gray-500">Pending</p>
              <h2 className="text-3xl font-bold mt-2">{restaurants.filter((r) => r.status === "PENDING").length}</h2>
            </div>
            <div className="w-12 h-12 rounded-xl bg-yellow-100 flex items-center justify-center">
              <Clock className="text-yellow-600" />
            </div>
          </div>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5">
          <div className="flex justify-between">
            <div>
              <p className="text-sm text-gray-500">Suspended</p>
              <h2 className="text-3xl font-bold mt-2">{restaurants.filter((r) => r.status === "SUSPENDED").length}</h2>
            </div>
            <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
              <Ban className="text-red-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Search + filter */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search restaurant..."
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-[var(--border)] bg-transparent outline-none"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-4 py-3 rounded-xl border border-[var(--border)] bg-transparent"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-10 flex justify-center items-center gap-3 text-gray-500">
            <Loader2 className="animate-spin" />
            Loading restaurants...
          </div>
        ) : pagedRestaurants.length === 0 ? (
          <div className="p-10 text-center">
            <Store className="mx-auto w-12 h-12 text-gray-400" />
            <h3 className="mt-3 text-lg font-semibold">No restaurants found</h3>
            <p className="text-gray-500 mt-1">Try changing your search or add a new restaurant.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[var(--secondary)] border-b border-[var(--border)]">
                <tr>
                  <th className="text-left p-4 text-sm font-semibold">Restaurant</th>
                  <th className="text-left p-4 text-sm font-semibold">Owner</th>
                  <th className="text-left p-4 text-sm font-semibold">Status</th>
                  <th className="text-left p-4 text-sm font-semibold">Created</th>
                  <th className="text-right p-4 text-sm font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {pagedRestaurants.map((restaurant) => (
                  <tr key={restaurant.id} className="border-b border-[var(--border)] hover:bg-[var(--secondary)] transition">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        {restaurant.logo ? (
                          <img src={restaurant.logo} alt={restaurant.name} className="w-12 h-12 rounded-xl object-cover" />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
                            <Store className="text-orange-600" />
                          </div>
                        )}
                        <div>
                          <p className="font-semibold">{restaurant.name}</p>
                          <p className="text-sm text-gray-500">{restaurant.email}</p>
                        </div>
                      </div>
                    </td>

                    <td className="p-4">
                      <div>
                        <p className="font-medium">{restaurant.users?.[0]?.user?.name || "N/A"}</p>
                        <p className="text-sm text-gray-500">{restaurant.users?.[0]?.user?.email || "N/A"}</p>
                      </div>
                    </td>

                    <td className="p-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusBadgeClass(restaurant.status)}`}>
                        {restaurant.status}
                      </span>
                    </td>

                    <td className="p-4">
                      <p className="text-sm">{new Date(restaurant.createdAt).toLocaleDateString()}</p>
                    </td>

                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setSelectedId(restaurant.id)}
                          className="p-2 rounded-lg hover:bg-gray-100"
                          title="View details"
                        >
                          <MoreHorizontal className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => openEditModal(restaurant)}
                          className="p-2 rounded-lg hover:bg-blue-100 text-blue-600"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(restaurant.id)}
                          className="p-2 rounded-lg hover:bg-red-100 text-red-600"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between p-5 border-t border-[var(--border)]">
        <p className="text-sm text-gray-500">
          Showing {pagedRestaurants.length} of {filtered.length} restaurants
        </p>

        <div className="flex items-center gap-2">
          <button
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
            className="p-2 rounded-lg border disabled:opacity-40"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <span className="px-3 py-2 rounded-lg bg-orange-600 text-white text-sm">
            {page} / {totalPages}
          </span>

          <button
            disabled={page === totalPages}
            onClick={() => setPage(page + 1)}
            className="p-2 rounded-lg border disabled:opacity-40"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-sm overflow-hidden animate-slide-in">
          <div className="p-5 bg-gradient-to-br from-[#c8501f]/10 to-[#e8ac3e]/5 border-b border-[var(--border)]">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                {selected.logo ? (
                  <img src={selected.logo} alt={selected.name} className="w-12 h-12 rounded-xl object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
                    <Store className="w-6 h-6 text-orange-600" />
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-semibold">{selected.name}</h3>
                  <p className="text-sm text-gray-500">{selected.email}</p>
                </div>
              </div>
              <button onClick={() => setSelectedId(null)} className="text-gray-500 hover:text-red-500">
                ✕
              </button>
            </div>

            <div className="flex gap-2 mt-4 flex-wrap">
              {selected.status === "PENDING" && (
                <>
                  <button onClick={() => approveRestaurant(selected.id)} className="px-4 py-2 rounded-lg bg-green-600 text-white">
                    Approve
                  </button>
                  <button onClick={() => rejectRestaurant(selected.id)} className="px-4 py-2 rounded-lg bg-red-600 text-white">
                    Reject
                  </button>
                </>
              )}

              {selected.status === "ACTIVE" && (
                <>
                  <button onClick={() => openEditModal(selected)} className="px-4 py-2 rounded-lg bg-blue-600 text-white">
                    Edit
                  </button>
                  <button onClick={() => suspendRestaurant(selected.id)} className="px-4 py-2 rounded-lg bg-red-600 text-white">
                    Suspend
                  </button>
                </>
              )}

              {selected.status === "SUSPENDED" && (
                <button onClick={() => activateRestaurant(selected.id)} className="px-4 py-2 rounded-lg bg-green-600 text-white">
                  Activate
                </button>
              )}

              <button
                onClick={() => setDeleteConfirmId(selected.id)}
                className="px-4 py-2 rounded-lg border border-red-500 text-red-500"
              >
                Delete
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[var(--secondary)] rounded-xl p-3 border border-[var(--border)]">
                <p className="text-xs text-[var(--muted-foreground)]">Owner</p>
                <p className="font-semibold text-[var(--foreground)]">{selected.users?.[0]?.user?.name || "N/A"}</p>
              </div>
              <div className="bg-[var(--secondary)] rounded-xl p-3 border border-[var(--border)]">
                <p className="text-xs text-[var(--muted-foreground)]">Owner Email</p>
                <p className="font-semibold text-[var(--foreground)] break-all">{selected.users?.[0]?.user?.email || "N/A"}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center border-b border-[var(--border)] pb-2">
                <span className="text-sm text-[var(--muted-foreground)]">Restaurant Email</span>
                <span className="font-medium">{selected.email}</span>
              </div>
              <div className="flex justify-between items-center border-b border-[var(--border)] pb-2">
                <span className="text-sm text-[var(--muted-foreground)]">Phone</span>
                <span className="font-medium">{selected.phone}</span>
              </div>
              <div className="flex justify-between items-center border-b border-[var(--border)] pb-2">
                <span className="text-sm text-[var(--muted-foreground)]">Address</span>
                <span className="font-medium text-right max-w-[220px]">{selected.address}</span>
              </div>
              <div className="flex justify-between items-center border-b border-[var(--border)] pb-2">
                <span className="text-sm text-[var(--muted-foreground)]">Status</span>
                <span className={`px-2 py-1 rounded-lg text-xs font-semibold ${statusBadgeClass(selected.status)}`}>
                  {selected.status}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--muted-foreground)]">Created</span>
                <span className="font-medium">{new Date(selected.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit modal */}
      {addOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--card)] w-full max-w-xl rounded-2xl p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-xl font-bold">{editingId ? "Edit Restaurant" : "Add Restaurant"}</h2>
              <button onClick={() => { setAddOpen(false); resetForm(); }}>
                <X />
              </button>
            </div>

            <div className="space-y-4">
              {/* Logo */}
              <div>
                <label className="text-sm font-medium">Restaurant Logo</label>
                <div className="mt-2 flex items-center gap-4">
                  {logoPreview ? (
                    <img src={logoPreview} className="w-20 h-20 rounded-xl object-cover" alt="Logo preview" />
                  ) : (
                    <div className="w-20 h-20 rounded-xl bg-gray-100 flex items-center justify-center">
                      <ImagePlus />
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setLogoFile(file);
                        setLogoPreview(URL.createObjectURL(file));
                      }
                    }}
                    className="text-sm"
                  />
                </div>
              </div>

              <input
                placeholder="Restaurant Name"
                value={form.restaurantName}
                onChange={(e) => setForm({ ...form, restaurantName: e.target.value })}
                className="w-full p-3 rounded-xl border border-[var(--border)] bg-transparent outline-none focus:border-orange-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              />

              <input
                placeholder="Restaurant Email"
                value={form.restaurantEmail}
                onChange={(e) => setForm({ ...form, restaurantEmail: e.target.value })}
                className="w-full p-3 rounded-xl border border-[var(--border)] bg-transparent outline-none focus:border-orange-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              />

              <input
                placeholder="Phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full p-3 rounded-xl border border-[var(--border)] bg-transparent outline-none focus:border-orange-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              />

              <textarea
                placeholder="Address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full p-3 rounded-xl border border-[var(--border)] bg-transparent outline-none focus:border-orange-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              />

              <hr />

              <h3 className="font-semibold">Owner Information</h3>

              <input
                placeholder="Owner Name"
                value={form.ownerName}
                onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                className="w-full p-3 rounded-xl border border-[var(--border)] bg-transparent outline-none focus:border-orange-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={!!editingId}
              />

              <input
                placeholder="Owner Email"
                value={form.ownerEmail}
                onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })}
                className="w-full p-3 rounded-xl border border-[var(--border)] bg-transparent outline-none focus:border-orange-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={!!editingId}
              />
              {editingId && (
                <p className="text-xs text-gray-500 -mt-2">
                  Owner login details can't be changed here.
                </p>
              )}

              <button
                disabled={submitting}
                onClick={handleSubmit}
                className="w-full py-3 rounded-xl bg-orange-600 text-white flex justify-center items-center gap-2 disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 className="animate-spin w-5 h-5" />
                    {editingId ? "Updating..." : "Creating..."}
                  </>
                ) : editingId ? (
                  "Update Restaurant"
                ) : (
                  "Create Restaurant"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credentials modal */}
      {generatedCreds && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Restaurant Created</h2>

            <p>Email:</p>
            <p className="font-semibold mb-3">{generatedCreds.email}</p>

            <p>Password:</p>
            <p className="font-semibold mb-5">{generatedCreds.password}</p>

            <button
              onClick={() => setGeneratedCreds(null)}
              className="w-full bg-orange-600 text-white py-3 rounded-xl"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation modal — this was referenced (deleteConfirmId,
          deleting, handleDelete, and every button that calls
          setDeleteConfirmId) but the modal itself was missing. Added here. */}
      {deleteConfirmId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center mb-4">
              <Trash2 className="text-red-600 w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold mb-1">Delete restaurant?</h2>
            <p className="text-sm text-gray-500 mb-5">
              {restaurantPendingDelete
                ? `This will permanently remove "${restaurantPendingDelete.name}" and cannot be undone.`
                : "This action cannot be undone."}
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl border border-[var(--border)] disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteConfirmId !== null && handleDelete(deleteConfirmId)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {deleting && <Loader2 className="animate-spin w-4 h-4" />}
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
