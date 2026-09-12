"use client";

import { useEffect, useState } from "react";
import { KeyRound, Save, ShieldCheck, UserRound } from "lucide-react";
import ImageUrlField from "@/components/ui/ImageUrlField";

type Profile = { name: string; email: string; phone?: string | null; address?: string | null; profileImage?: string | null };

export default function OwnerProfilePage() {
  const [profile, setProfile] = useState<Profile>({ name: "", email: "", phone: "", address: "", profileImage: "" });
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "" });
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { const timer = setTimeout(() => { fetch("/api/owner/profile").then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.message); setProfile(j.data); }).catch((e: Error) => setMessage(e.message)); }, 0); return () => clearTimeout(timer); }, []);
  async function save() { setSaving(true); try { const r = await fetch("/api/owner/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) }); const j = await r.json(); setMessage(j.message || (r.ok ? "Profile saved." : "Unable to save profile.")); if (r.ok) setProfile(j.data); } finally { setSaving(false); } }
  async function changePassword() { const r = await fetch("/api/owner/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(passwords) }); const j = await r.json(); setMessage(j.message); if (r.ok) setPasswords({ currentPassword: "", newPassword: "" }); }
  return <div className="erp-page erp-page-owner-profile space-y-6 p-6">
    <div className="profile-page-head"><div><span className="profile-eyebrow">Account & identity</span><h1>Owner Profile</h1><p>Keep your account recognizable, complete and secure without digging through settings.</p></div><button className="profile-primary" disabled={saving} onClick={() => save().catch(() => setMessage("Unable to save profile."))}><Save className="h-4 w-4" />{saving ? "Saving..." : "Save changes"}</button></div>
    {message && <div className="profile-feedback" role="status">{message}</div>}
    <div className="profile-layout">
      <section className="profile-card">
        <div className="profile-card-head"><div className="erp-section-icon"><UserRound className="h-5 w-5" /></div><div><h2>Personal information</h2><p>Details used across your restaurant workspace and account.</p></div></div>
        <div className="profile-form-grid">
          <label><span>Full name</span><input placeholder="Your full name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></label>
          <label><span>Email address</span><input type="email" placeholder="name@example.com" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} /></label>
          <label><span>Phone number</span><input placeholder="+92 300 0000000" value={profile.phone || ""} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></label>
          <label><span>Address</span><input placeholder="City or business address" value={profile.address || ""} onChange={(e) => setProfile({ ...profile, address: e.target.value })} /></label>
        </div>
        <div className="mt-5"><ImageUrlField label="Profile image" aspect="square" value={profile.profileImage || ""} onChange={(profileImage) => setProfile({ ...profile, profileImage })} help="Paste an HTTPS profile photo URL. You will see it before saving." /></div>
      </section>
      <section className="profile-card profile-security">
        <div className="profile-card-head"><div className="erp-section-icon is-security"><ShieldCheck className="h-5 w-5" /></div><div><span className="profile-security-mark">Security</span><h2>Change password</h2><p>Use at least 8 characters with uppercase, lowercase and a number.</p></div></div>
        <div className="space-y-4"><label><span>Current password</span><input type="password" autoComplete="current-password" value={passwords.currentPassword} onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })} /></label><label><span>New password</span><input type="password" autoComplete="new-password" value={passwords.newPassword} onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })} /></label></div>
        <div className="erp-security-note"><KeyRound className="h-4 w-4" /><span>Changing your password signs out existing sessions for security.</span></div>
        <button className="profile-secondary" onClick={() => changePassword().catch(() => setMessage("Unable to change password."))}>Update password</button>
      </section>
    </div>
  </div>;
}
