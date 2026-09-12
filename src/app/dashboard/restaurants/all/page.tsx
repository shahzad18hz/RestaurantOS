"use client";

import { useState, useEffect, useCallback } from "react";
import { z } from "zod";
import { toast, Toaster } from "sonner";
import {
  Search,
  Plus,
  Store,
  Edit2,
  Trash2,
  Eye,
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

  // Optional — shown in the side panel stat grid when the API provides them.
  // Falls back to "—" so nothing breaks if your backend doesn't send these yet.
  revenue?: number;
  branchesCount?: number;
  employeesCount?: number;
  rating?: number;

  users: {
    role: string;
    user: {
      id: number;
      name: string;
      email: string;
    };
  }[];
}

function getInitials(name: string) {
  const parts = name.trim().split(" ");
  return parts.length > 1
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : parts[0].slice(0, 2).toUpperCase();
}

function formatMoney(n?: number) {
  if (n === undefined || n === null) return "—";
  return `$${n.toLocaleString()}`;
}

interface RestaurantFormState {
  restaurantName: string;
  restaurantEmail: string;
  phone: string;
  address: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string; // New
}

const emptyForm: RestaurantFormState = {
  restaurantName: "",
  restaurantEmail: "",
  phone: "",
  address: "",
  ownerName: "",
  ownerEmail: "",
  ownerPassword: "", // New
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
  ownerPassword: z
    .string()
    .min(8, "Password must be at least 8 characters"),
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
  // Drives the slide-in transform on the side panel — flips to true a frame
  // after selectedId is set, so the CSS transition actually has something
  // to animate from.
  const [panelVisible, setPanelVisible] = useState(false);

  // (dropdown menu removed — actions are direct icon buttons now)

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
     Side panel slide-in / slide-out
  ------------------------------------------------------ */

  useEffect(() => {
    if (selectedId !== null) {
      const raf = requestAnimationFrame(() => setPanelVisible(true));
      return () => cancelAnimationFrame(raf);
    }
  }, [selectedId]);

  function closePanel() {
    setPanelVisible(false);
    // wait for the slide-out transition to finish before unmounting
    setTimeout(() => setSelectedId(null), 200);
  }

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
      toast.error(validation.error.issues[0].message);
      return;
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
        ownerPassword: form.ownerPassword, // New
      };

      if (editingId) {
        await apiUpdateRestaurant(editingId, payload);
        toast.success("Restaurant updated successfully");
        await fetchRestaurants();
        setAddOpen(false);
        resetForm();
      } else {

        await apiCreateRestaurant(payload);
        setGeneratedCreds({
          email: form.ownerEmail,
          password: form.ownerPassword,
        });
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
      ownerPassword: "", // Add this line
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
      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20"
      : status === "PENDING"
        ? "bg-[#e8b93f]/10 text-[#a97a1f] ring-1 ring-[#e8b93f]/30"
        : status === "SUSPENDED"
          ? "bg-red-50 text-red-700 ring-1 ring-red-600/20"
          : "bg-gray-100 text-gray-600 ring-1 ring-gray-300";

  /* ==========================================================
     RENDER
  ========================================================== */

  return (
    <div className="erp-page erp-page-restaurants-all space-y-6 p-6 bg-gray-50 min-h-screen">
      {/* Self-contained: mounts the toast portal right here so this single
          file works without touching layout.tsx. If you later add a
          <Toaster /> to your root layout for other pages too, remove this
          one to avoid having two instances mounted at once. */}
      <Toaster position="top-right" />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Restaurants</h1>
          <p className="text-[13px] text-gray-500 mt-0.5">Manage all registered restaurants</p>
        </div>

        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#e8b93f] to-[#c99a2e] text-[#101322] font-semibold text-sm shadow-sm shadow-[#e8b93f]/20 hover:shadow-md hover:shadow-[#e8b93f]/30 transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Restaurant
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-5 hover:border-[#e8b93f]/40 transition-colors shadow-sm">
          <div className="flex justify-between">
            <div>
              <p className="text-[13px] text-gray-500">Total Restaurants</p>
              <h2 className="text-2xl font-bold mt-2 text-gray-900">{restaurants.length}</h2>
            </div>
            <div className="w-11 h-11 rounded-xl bg-[#101322] flex items-center justify-center">
              <Store size={18} className="text-[#e8b93f]" />
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 hover:border-[#e8b93f]/40 transition-colors shadow-sm">
          <div className="flex justify-between">
            <div>
              <p className="text-[13px] text-gray-500">Active</p>
              <h2 className="text-2xl font-bold mt-2 text-gray-900">{restaurants.filter((r) => r.status === "ACTIVE").length}</h2>
            </div>
            <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center">
              <CheckCircle size={18} className="text-emerald-600" />
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 hover:border-[#e8b93f]/40 transition-colors shadow-sm">
          <div className="flex justify-between">
            <div>
              <p className="text-[13px] text-gray-500">Pending</p>
              <h2 className="text-2xl font-bold mt-2 text-gray-900">{restaurants.filter((r) => r.status === "PENDING").length}</h2>
            </div>
            <div className="w-11 h-11 rounded-xl bg-[#e8b93f]/10 flex items-center justify-center">
              <Clock size={18} className="text-[#a97a1f]" />
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 hover:border-[#e8b93f]/40 transition-colors shadow-sm">
          <div className="flex justify-between">
            <div>
              <p className="text-[13px] text-gray-500">Suspended</p>
              <h2 className="text-2xl font-bold mt-2 text-gray-900">{restaurants.filter((r) => r.status === "SUSPENDED").length}</h2>
            </div>
            <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center">
              <Ban size={18} className="text-red-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Search + filter */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search restaurant..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-[#e8b93f] focus:ring-2 focus:ring-[#e8b93f]/15 transition-colors"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-[#e8b93f] focus:ring-2 focus:ring-[#e8b93f]/15 transition-colors"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-visible shadow-sm">
        {loading ? (
          <div className="p-10 flex justify-center items-center gap-3 text-gray-400 text-sm">
            <Loader2 className="animate-spin w-4 h-4" />
            Loading restaurants...
          </div>
        ) : pagedRestaurants.length === 0 ? (
          <div className="p-10 text-center">
            <div className="w-12 h-12 rounded-xl bg-[#101322] flex items-center justify-center mx-auto">
              <Store className="w-5 h-5 text-[#e8b93f]" />
            </div>
            <h3 className="mt-3 text-base font-semibold text-gray-900">No restaurants found</h3>
            <p className="text-gray-500 text-sm mt-1">Try changing your search or add a new restaurant.</p>
          </div>
        ) : (
          <div className="overflow-x-auto overflow-y-visible">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left p-4 text-xs font-semibold uppercase tracking-wide text-gray-400">Restaurant</th>
                  <th className="text-left p-4 text-xs font-semibold uppercase tracking-wide text-gray-400">Owner</th>
                  <th className="text-left p-4 text-xs font-semibold uppercase tracking-wide text-gray-400">Status</th>
                  <th className="text-left p-4 text-xs font-semibold uppercase tracking-wide text-gray-400">Created</th>
                  <th className="text-right p-4 text-xs font-semibold uppercase tracking-wide text-gray-400">Action</th>
                </tr>
              </thead>
              <tbody>
                {pagedRestaurants.map((restaurant) => (
                  <tr key={restaurant.id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/80 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        {restaurant.logo ? (
                          <img src={restaurant.logo} alt={restaurant.name} className="w-11 h-11 rounded-xl object-cover" />
                        ) : (
                          <div className="w-11 h-11 rounded-xl bg-[#101322] flex items-center justify-center">
                            <Store size={16} className="text-[#e8b93f]" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-sm text-gray-900">{restaurant.name}</p>
                          <p className="text-[13px] text-gray-500">{restaurant.email}</p>
                        </div>
                      </div>
                    </td>

                    <td className="p-4">
                      <div>
                        <p className="font-medium text-sm text-gray-900">{restaurant.users?.[0]?.user?.name || "N/A"}</p>
                        <p className="text-[13px] text-gray-500">{restaurant.users?.[0]?.user?.email || "N/A"}</p>
                      </div>
                    </td>

                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${statusBadgeClass(restaurant.status)}`}>
                        {restaurant.status}
                      </span>
                    </td>

                    <td className="p-4">
                      <p className="text-sm text-gray-500">{new Date(restaurant.createdAt).toLocaleDateString()}</p>
                    </td>

                    <td className="p-4 text-right">
                      <div className="flex justify-end items-center gap-1">
                        <button
                          onClick={() => setSelectedId(restaurant.id)}
                          className="p-2 rounded-lg text-gray-400 hover:text-[#a97a1f] hover:bg-[#e8b93f]/10 transition-colors"
                          title="View details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEditModal(restaurant)}
                          className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(restaurant.id)}
                          className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
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
      <div className="flex items-center justify-between p-1">
        <p className="text-[13px] text-gray-500">
          Showing {pagedRestaurants.length} of {filtered.length} restaurants
        </p>

        <div className="flex items-center gap-2">
          <button
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
            className="p-2 rounded-lg border border-gray-200 bg-white text-gray-500 hover:border-[#e8b93f]/50 disabled:opacity-40 disabled:hover:border-gray-200 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="px-3.5 py-2 rounded-lg bg-[#101322] text-[#e8b93f] text-xs font-semibold">
            {page} / {totalPages}
          </span>

          <button
            disabled={page === totalPages}
            onClick={() => setPage(page + 1)}
            className="p-2 rounded-lg border border-gray-200 bg-white text-gray-500 hover:border-[#e8b93f]/50 disabled:opacity-40 disabled:hover:border-gray-200 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Detail panel — right-side sliding drawer, opened via "View details" */}
      {selected && (
        <>
          {/* Backdrop */}
          <div
            onClick={closePanel}
            className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-200 ${panelVisible ? "opacity-100" : "opacity-0"
              }`}
          />

          {/* Drawer */}
          <div
            className={`fixed top-0 right-0 h-screen w-full max-w-[420px] bg-[#12131c] border-l border-white/10 z-50 shadow-2xl overflow-y-auto transition-transform duration-200 ease-out ${panelVisible ? "translate-x-0" : "translate-x-full"
              }`}
          >
            {/* Header */}
            <div className="p-5 border-b border-white/10">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  {selected.logo ? (
                    <img src={selected.logo} alt={selected.name} className="w-12 h-12 rounded-xl object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#e8b93f] to-[#a97a1f] flex items-center justify-center text-[#101322] font-bold text-sm shrink-0">
                      {getInitials(selected.name)}
                    </div>
                  )}
                  <div>
                    <h3 className="text-base font-semibold text-white">{selected.name}</h3>
                    <p className="text-[13px] text-white/40">R-{String(selected.id).padStart(4, "0")}</p>
                  </div>
                </div>
                <button onClick={closePanel} className="text-white/40 hover:text-white transition-colors">
                  <X size={18} />
                </button>
              </div>

              <div className="flex gap-2 mt-4 flex-wrap">
                {selected.status === "PENDING" && (
                  <>
                    <button
                      onClick={() => approveRestaurant(selected.id)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 transition-colors"
                    >
                      <CheckCircle size={15} />
                      Approve
                    </button>
                    <button
                      onClick={() => rejectRestaurant(selected.id)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 text-sm font-medium hover:bg-red-500/20 transition-colors"
                    >
                      <Ban size={15} />
                      Reject
                    </button>
                  </>
                )}

                {selected.status === "ACTIVE" && (
                  <>
                    <button
                      onClick={() => openEditModal(selected)}
                      className="px-4 py-2 rounded-lg bg-[#e8b93f]/10 text-[#e8b93f] border border-[#e8b93f]/20 text-sm font-medium hover:bg-[#e8b93f]/20 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => suspendRestaurant(selected.id)}
                      className="px-4 py-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 text-sm font-medium hover:bg-red-500/20 transition-colors"
                    >
                      Suspend
                    </button>
                  </>
                )}

                {selected.status === "SUSPENDED" && (
                  <button
                    onClick={() => activateRestaurant(selected.id)}
                    className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 transition-colors"
                  >
                    Activate
                  </button>
                )}

                <button
                  onClick={() => setDeleteConfirmId(selected.id)}
                  className="px-4 py-2 rounded-lg border border-white/10 text-white/50 text-sm font-medium hover:bg-white/5 hover:text-red-400 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>

            {/* Stat grid */}
            <div className="p-5 grid grid-cols-2 gap-3">
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3.5">
                <p className="flex items-center gap-1.5 text-[12px] text-white/40">
                  <span className="text-[#e8b93f]">$</span> Revenue
                </p>
                <p className="text-lg font-bold text-white mt-1">{formatMoney(selected.revenue)}</p>
              </div>
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3.5">
                <p className="flex items-center gap-1.5 text-[12px] text-white/40">
                  <Store size={13} className="text-[#e8b93f]" /> Branches
                </p>
                <p className="text-lg font-bold text-white mt-1">{selected.branchesCount ?? "—"}</p>
              </div>
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3.5">
                <p className="flex items-center gap-1.5 text-[12px] text-white/40">
                  <CheckCircle size={13} className="text-[#e8b93f]" /> Employees
                </p>
                <p className="text-lg font-bold text-white mt-1">{selected.employeesCount ?? "—"}</p>
              </div>
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3.5">
                <p className="flex items-center gap-1.5 text-[12px] text-white/40">
                  <Clock size={13} className="text-[#e8b93f]" /> Rating
                </p>
                <p className="text-lg font-bold text-white mt-1">{selected.rating ?? "—"}</p>
              </div>
            </div>

            {/* Info list */}
            <div className="px-5 pb-6 space-y-3">
              <div className="flex justify-between items-center border-b border-white/5 pb-2.5">
                <span className="text-[13px] text-white/40">Owner</span>
                <span className="text-sm font-medium text-white">{selected.users?.[0]?.user?.name || "N/A"}</span>
              </div>
              <div className="flex justify-between items-center border-b border-white/5 pb-2.5">
                <span className="text-[13px] text-white/40">Email</span>
                <span className="text-sm font-medium text-white break-all text-right">{selected.users?.[0]?.user?.email || selected.email}</span>
              </div>
              <div className="flex justify-between items-center border-b border-white/5 pb-2.5">
                <span className="text-[13px] text-white/40">Phone</span>
                <span className="text-sm font-medium text-white">{selected.phone}</span>
              </div>
              <div className="flex justify-between items-center border-b border-white/5 pb-2.5">
                <span className="text-[13px] text-white/40">Location</span>
                <span className="text-sm font-medium text-white text-right max-w-[220px]">{selected.address}</span>
              </div>
              <div className="flex justify-between items-center border-b border-white/5 pb-2.5">
                <span className="text-[13px] text-white/40">Status</span>
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${statusBadgeClass(selected.status)}`}>
                  {selected.status}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[13px] text-white/40">Created</span>
                <span className="text-sm font-medium text-white">{new Date(selected.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Add / Edit modal */}
      {addOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-xl rounded-2xl p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg font-semibold text-gray-900">{editingId ? "Edit Restaurant" : "Add Restaurant"}</h2>
              <button onClick={() => { setAddOpen(false); resetForm(); }} className="text-gray-400 hover:text-gray-700 transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Logo */}
              <div>
                <label className="text-sm font-medium text-gray-700">Restaurant Logo</label>
                <div className="mt-2 flex items-center gap-4">
                  {logoPreview ? (
                    <img src={logoPreview} className="w-20 h-20 rounded-xl object-cover" alt="Logo preview" />
                  ) : (
                    <div className="w-20 h-20 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center">
                      <ImagePlus className="text-gray-400" />
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
                    className="text-sm text-gray-500"
                  />
                </div>
              </div>

              <input
                placeholder="Restaurant Name"
                value={form.restaurantName}
                onChange={(e) => setForm({ ...form, restaurantName: e.target.value })}
                className="w-full p-3 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-[#e8b93f] focus:ring-2 focus:ring-[#e8b93f]/15 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              />

              <input
                placeholder="Restaurant Email"
                value={form.restaurantEmail}
                onChange={(e) => setForm({ ...form, restaurantEmail: e.target.value })}
                className="w-full p-3 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-[#e8b93f] focus:ring-2 focus:ring-[#e8b93f]/15 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              />

              <input
                placeholder="Phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full p-3 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-[#e8b93f] focus:ring-2 focus:ring-[#e8b93f]/15 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              />

              <textarea
                placeholder="Address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full p-3 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-[#e8b93f] focus:ring-2 focus:ring-[#e8b93f]/15 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              />

              <hr className="border-gray-200" />

              <h3 className="font-semibold text-sm text-gray-900">Owner Information</h3>

              <input
                placeholder="Owner Name"
                value={form.ownerName}
                onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                className="w-full p-3 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-[#e8b93f] focus:ring-2 focus:ring-[#e8b93f]/15 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={!!editingId}
              />

              <input
                placeholder="Owner Email"
                value={form.ownerEmail}
                onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })}
                className="w-full p-3 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-[#e8b93f] focus:ring-2 focus:ring-[#e8b93f]/15 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={!!editingId}
              />
              <input
                type="password"
                placeholder="Owner Password"
                value={form.ownerPassword}
                onChange={(e) =>
                  setForm({ ...form, ownerPassword: e.target.value })
                }
                className="w-full p-3 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-[#e8b93f] focus:ring-2 focus:ring-[#e8b93f]/15 transition-colors"
              />
              {editingId && (
                <p className="text-xs text-gray-400 -mt-2">
                  Owner login details can't be changed here.
                </p>
              )}

              <button
                disabled={submitting}
                onClick={handleSubmit}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-[#e8b93f] to-[#c99a2e] text-[#101322] font-semibold text-sm flex justify-center items-center gap-2 disabled:opacity-60 shadow-sm shadow-[#e8b93f]/20 hover:shadow-md hover:shadow-[#e8b93f]/30 transition-all"
              >
                {submitting ? (
                  <>
                    <Loader2 className="animate-spin w-4 h-4" />
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center mb-4">
              <CheckCircle className="text-emerald-600 w-5 h-5" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Restaurant Created</h2>

            <p className="text-xs text-gray-400 uppercase tracking-wide">Email</p>
            <p className="font-medium text-sm mb-3 text-gray-900">{generatedCreds.email}</p>

            <p className="text-xs text-gray-400 uppercase tracking-wide">Password</p>
            <p className="font-medium text-sm mb-5 text-gray-900">{generatedCreds.password}</p>

            <button
              onClick={() => setGeneratedCreds(null)}
              className="w-full bg-gradient-to-r from-[#e8b93f] to-[#c99a2e] text-[#101322] font-semibold text-sm py-3 rounded-xl shadow-sm shadow-[#e8b93f]/20 hover:shadow-md hover:shadow-[#e8b93f]/30 transition-all"
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center mb-4">
              <Trash2 className="text-red-600 w-5 h-5" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 mb-1">Delete restaurant?</h2>
            <p className="text-sm text-gray-500 mb-5">
              {restaurantPendingDelete
                ? `This will permanently remove "${restaurantPendingDelete.name}" and cannot be undone.`
                : "This action cannot be undone."}
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteConfirmId !== null && handleDelete(deleteConfirmId)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-red-700 disabled:opacity-60 transition-colors"
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
