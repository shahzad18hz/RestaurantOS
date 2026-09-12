"use client";

import { useEffect, useMemo, useState } from "react";

import CategoryToolbar from "@/components/owner/category/CategoryToolbar";
import CategoryTable from "@/components/owner/category/CategoryTable";
import CategoryForm from "@/components/owner/category/CategoryForm";
import DeleteCategoryDialog from "@/components/owner/category/DeleteCategoryDialog";

export interface Category {
  id: number;
  restaurantId: number;
  name: string;
  image: string | null;
  description: string | null;
  status: "ACTIVE" | "INACTIVE";
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// Restaurant is now resolved server-side from the session on every
// /api/owner/* request — no more hardcoded tenant id here.
const RESTAURANT_ID = 0;
const PAGE_SIZE = 8;

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");

  const [status, setStatus] = useState<
    "ALL" | "ACTIVE" | "INACTIVE"
  >("ALL");

  const [page, setPage] = useState(1);

  const [openForm, setOpenForm] = useState(false);

  const [editingCategory, setEditingCategory] =
    useState<Category | null>(null);

  const [deleteCategory, setDeleteCategory] =
    useState<Category | null>(null);

  //------------------------------------------------
  // Load Categories
  //------------------------------------------------

  async function loadCategories() {
    try {
      setLoading(true);

      const res = await fetch("/api/owner/category", { cache: "no-store" });

      const data = await res.json();

      if (data.success) {
        setCategories(data.data);
      } else {
        alert(data.message);
      }
    } catch (error) {
      console.error(error);
      alert("Failed to load categories.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCategories();
  }, []);

  //------------------------------------------------
  // Reset page on filter/search
  //------------------------------------------------

  useEffect(() => {
    setPage(1);
  }, [search, status]);

  //------------------------------------------------
  // Search + Filter
  //------------------------------------------------

  const filteredCategories = useMemo(() => {
    let data = [...categories];

    if (search.trim()) {
      data = data.filter((item) =>
        item.name
          .toLowerCase()
          .includes(search.toLowerCase())
      );
    }

    if (status !== "ALL") {
      data = data.filter(
        (item) => item.status === status
      );
    }

    return data;
  }, [categories, search, status]);

  //------------------------------------------------
  // Pagination
  //------------------------------------------------

  const totalPages = Math.ceil(
    filteredCategories.length / PAGE_SIZE
  );

  const paginatedCategories = filteredCategories.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  //------------------------------------------------
  // Actions
  //------------------------------------------------

  function refreshData() {
    loadCategories();
  }

  function handleAdd() {
    setEditingCategory(null);
    setOpenForm(true);
  }

  function handleEdit(category: Category) {
    setEditingCategory(category);
    setOpenForm(true);
  }

  function handleDelete(category: Category) {
    setDeleteCategory(category);
  }

  return (
    <div className="erp-page erp-page-owner-categories space-y-6 p-6">

      {/* Header */}

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">

        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Categories
          </h1>

          <p className="text-muted-foreground">
            Manage your restaurant categories
          </p>
        </div>

        <button
          onClick={handleAdd}
          className="rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
        >
          + Add Category
        </button>

      </div>

      {/* Toolbar */}

      <CategoryToolbar
        search={search}
        setSearch={setSearch}
        status={status}
        setStatus={setStatus}
      />

      {/* Stats */}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">

        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">
            Total Categories
          </p>

          <h2 className="mt-2 text-3xl font-bold">
            {categories.length}
          </h2>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">
            Active
          </p>

          <h2 className="mt-2 text-3xl font-bold text-green-600">
            {
              categories.filter(
                (item) => item.status === "ACTIVE"
              ).length
            }
          </h2>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">
            Inactive
          </p>

          <h2 className="mt-2 text-3xl font-bold text-red-600">
            {
              categories.filter(
                (item) => item.status === "INACTIVE"
              ).length
            }
          </h2>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">
            Showing
          </p>

          <h2 className="mt-2 text-3xl font-bold">
            {paginatedCategories.length}
          </h2>
        </div>

      </div>

      {/* Table */}

      <CategoryTable
        loading={loading}
        categories={paginatedCategories}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />      {/* Pagination */}

      {!loading && totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">

          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * PAGE_SIZE + 1} -
            {Math.min(
              page * PAGE_SIZE,
              filteredCategories.length
            )}{" "}
            of {filteredCategories.length}
          </p>

          <div className="flex items-center gap-2">

            <button
              disabled={page === 1}
              onClick={() => setPage((prev) => prev - 1)}
              className="rounded-lg border px-4 py-2 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>

            <span className="rounded-lg border px-4 py-2">
              {page} / {totalPages}
            </span>

            <button
              disabled={page === totalPages}
              onClick={() => setPage((prev) => prev + 1)}
              className="rounded-lg border px-4 py-2 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>

          </div>

        </div>
      )}

      {/* Add / Edit Category */}

      <CategoryForm
        open={openForm}
        category={editingCategory}
        restaurantId={RESTAURANT_ID}
        onClose={() => {
          setOpenForm(false);
          setEditingCategory(null);
        }}
        onSuccess={() => {
          refreshData();
          setOpenForm(false);
          setEditingCategory(null);
        }}
      />

      {/* Delete Category */}

      <DeleteCategoryDialog
        open={!!deleteCategory}
        category={deleteCategory}
        onClose={() => setDeleteCategory(null)}
        onSuccess={() => {
          refreshData();
          setDeleteCategory(null);
        }}
      />

    </div>
  );
}