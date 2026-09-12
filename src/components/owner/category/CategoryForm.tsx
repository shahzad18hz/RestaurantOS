"use client";

import { useEffect, useState } from "react";
import { Loader2, Tag, X } from "lucide-react";
import { toast } from "sonner";
import ImageUrlField from "@/components/ui/ImageUrlField";

export interface Category {
  id?: number; restaurantId: number; name: string; description: string | null; image: string | null;
  status: "ACTIVE" | "INACTIVE"; sortOrder?: number; createdAt?: string; updatedAt?: string;
}
interface Props { open: boolean; onClose: () => void; onSuccess: () => void; category: Category | null; restaurantId: number; }

export default function CategoryForm({ open, onClose, onSuccess, category, restaurantId }: Props) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ restaurantId, name: "", description: "", image: "", status: "ACTIVE" as "ACTIVE" | "INACTIVE", sortOrder: 0 });
  useEffect(() => { setForm(category ? { restaurantId, name: category.name, description: category.description || "", image: category.image || "", status: category.status, sortOrder: category.sortOrder ?? 0 } : { restaurantId, name: "", description: "", image: "", status: "ACTIVE", sortOrder: 0 }); }, [category, restaurantId, open]);
  if (!open) return null;

  async function handleSubmit() {
    if (!form.name.trim()) return toast.error("Category name is required.");
    try {
      setLoading(true);
      const res = await fetch(category ? `/api/owner/category/${category.id}` : "/api/owner/category", { method: category ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) return toast.error(data.message || "Unable to save category.");
      toast.success(data.message || (category ? "Category updated." : "Category created."));
      onSuccess(); onClose();
    } catch (error) { console.error(error); toast.error("Something went wrong."); } finally { setLoading(false); }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
    <div className="erp-premium-modal max-h-[92vh] w-full max-w-2xl overflow-y-auto">
      <div className="erp-premium-modal-head"><div><span className="erp-form-eyebrow">Menu structure</span><h2>{category ? "Update category" : "Create category"}</h2><p>Organize menu items into clear groups your team can scan quickly.</p></div><button className="erp-icon-button" onClick={onClose} aria-label="Close form"><X className="h-5 w-5" /></button></div>
      <div className="erp-premium-form">
        <section className="erp-form-section">
          <div className="erp-form-section-copy"><span><Tag className="h-4 w-4" /></span><div><h3>Category details</h3><p>Use a short, recognizable name and an optional description.</p></div></div>
          <div className="erp-form-grid">
            <label className="erp-field"><span>Category name <b>*</b></span><input placeholder="e.g. Signature Burgers" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label className="erp-field"><span>Status</span><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as "ACTIVE" | "INACTIVE" })}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label>
            <label className="erp-field"><span>Sort order</span><input type="number" min="0" step="1" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Math.max(0, Number(e.target.value) || 0) })} /><small>Lower numbers appear first. Use 0 for default.</small></label>
            <label className="erp-field erp-field-full"><span>Description</span><textarea rows={3} placeholder="What type of items belong in this category?" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /><small>Optional · Helpful for menu organization.</small></label>
          </div>
        </section>
        <section className="erp-form-section"><div className="erp-form-section-copy"><span>02</span><div><h3>Category image</h3><p>Add a visual used in menu browsing and category cards.</p></div></div><ImageUrlField label="Category image" value={form.image} onChange={(image) => setForm({ ...form, image })} /></section>
      </div>
      <div className="erp-premium-modal-actions"><p>Inactive categories remain saved but can be hidden from active workflows.</p><div><button onClick={onClose} className="erp-button-secondary">Cancel</button><button onClick={handleSubmit} disabled={loading} className="erp-button-primary">{loading && <Loader2 className="h-4 w-4 animate-spin" />}{loading ? "Saving..." : category ? "Save changes" : "Create category"}</button></div></div>
    </div>
  </div>;
}
