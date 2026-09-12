"use client";

import { useEffect, useState } from "react";
import { Building2, Globe2, Landmark, Save } from "lucide-react";
import ImageUrlField from "@/components/ui/ImageUrlField";

type RestaurantProfile = {
  name: string; email: string; phone: string; address: string; logo?: string | null; description?: string | null;
  website?: string; city?: string; country?: string; currency?: string; timezone?: string; taxNumber?: string; registrationNumber?: string;
  coverImage?: string; receiptLogo?: string; favicon?: string;
};
const empty: RestaurantProfile = { name: "", email: "", phone: "", address: "", website: "", city: "", country: "", currency: "USD", timezone: "UTC", taxNumber: "", registrationNumber: "", logo: "", coverImage: "", receiptLogo: "", favicon: "" };

export default function RestaurantProfilePage() {
  const [data, setData] = useState<RestaurantProfile>(empty);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { const timer = setTimeout(() => { fetch("/api/owner/restaurant-profile").then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.message); const settings = j.data.restaurantSettings || {}; setData({ ...empty, ...j.data, ...settings }); }).catch((e: Error) => setMessage(e.message)); }, 0); return () => clearTimeout(timer); }, []);
  async function save() { setSaving(true); try { const r = await fetch("/api/owner/restaurant-profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); const j = await r.json(); setMessage(j.message || (r.ok ? "Restaurant profile saved." : "Unable to save profile.")); } finally { setSaving(false); } }
  const set = (key: keyof RestaurantProfile, value: string) => setData((current) => ({ ...current, [key]: value }));
  return <div className="erp-page erp-page-restaurant-profile space-y-6 p-6">
    <div className="profile-page-head"><div><span className="profile-eyebrow">Restaurant workspace</span><h1>Restaurant Profile</h1><p>Your brand, business details and regional settings in one clear workspace.</p></div><button className="profile-primary" disabled={saving} onClick={() => save().catch(() => setMessage("Unable to save profile."))}><Save className="h-4 w-4" />{saving ? "Saving..." : "Save changes"}</button></div>
    {message && <div className="profile-feedback" role="status">{message}</div>}
    <section className="profile-card">
      <div className="profile-card-head"><div className="erp-section-icon"><Building2 className="h-5 w-5" /></div><div><h2>Business identity</h2><p>The core information your staff and operational screens use.</p></div></div>
      <div className="profile-form-grid profile-form-grid-wide">
        <label><span>Restaurant name</span><input value={data.name} onChange={(e) => set("name", e.target.value)} /></label>
        <label><span>Business email</span><input type="email" value={data.email} onChange={(e) => set("email", e.target.value)} /></label>
        <label><span>Phone</span><input value={data.phone} onChange={(e) => set("phone", e.target.value)} /></label>
        <label><span>Website</span><input type="url" placeholder="https://yourrestaurant.com" value={data.website || ""} onChange={(e) => set("website", e.target.value)} /></label>
        <label className="profile-span-2"><span>Address</span><input value={data.address} onChange={(e) => set("address", e.target.value)} /></label>
      </div>
    </section>
    <section className="profile-card">
      <div className="profile-card-head"><div className="erp-section-icon"><Globe2 className="h-5 w-5" /></div><div><h2>Region & legal</h2><p>Keep currency, timezone and registration information easy to scan.</p></div></div>
      <div className="profile-form-grid profile-form-grid-wide">
        <label><span>City</span><input value={data.city || ""} onChange={(e) => set("city", e.target.value)} /></label>
        <label><span>Country</span><input value={data.country || ""} onChange={(e) => set("country", e.target.value)} /></label>
        <label><span>Currency</span><input placeholder="USD" value={data.currency || ""} onChange={(e) => set("currency", e.target.value)} /></label>
        <label><span>Timezone</span><input placeholder="UTC" value={data.timezone || ""} onChange={(e) => set("timezone", e.target.value)} /></label>
        <label><span>Tax number</span><input value={data.taxNumber || ""} onChange={(e) => set("taxNumber", e.target.value)} /></label>
        <label><span>Registration number</span><input value={data.registrationNumber || ""} onChange={(e) => set("registrationNumber", e.target.value)} /></label>
      </div>
    </section>
    <section className="profile-card">
      <div className="profile-card-head"><div className="erp-section-icon"><Landmark className="h-5 w-5" /></div><div><h2>Brand assets</h2><p>Preview external images before they are used across the product.</p></div></div>
      <div className="erp-brand-assets-grid">
        <ImageUrlField label="Restaurant logo" aspect="square" value={data.logo || ""} onChange={(v) => set("logo", v)} />
        <ImageUrlField label="Cover image" value={data.coverImage || ""} onChange={(v) => set("coverImage", v)} />
        <ImageUrlField label="Receipt logo" aspect="square" value={data.receiptLogo || ""} onChange={(v) => set("receiptLogo", v)} />
        <ImageUrlField label="Favicon" aspect="square" value={data.favicon || ""} onChange={(v) => set("favicon", v)} />
      </div>
      <div className="profile-actions"><p>Only HTTPS image links are previewed. This keeps external image loading safer.</p><button className="profile-primary" disabled={saving} onClick={() => save().catch(() => setMessage("Unable to save profile."))}><Save className="h-4 w-4" />Save restaurant profile</button></div>
    </section>
  </div>;
}
