"use client";

import { useEffect, useState } from "react";

type Config = Record<string, unknown>;

const sections = [
  ["General", ["appName", "companyName", "defaultLanguage", "timezone", "currency", "dateFormat", "timeFormat"]],
  ["Security", ["sessionTimeout", "loginAttempts", "twoFactorReady", "csrfEnabled", "rateLimit"]],
  ["Localization", ["rtlSupport", "numberFormat"]],
  ["Maintenance", ["maintenanceMode", "maintenanceMessage"]],
];

export default function SystemConfigurationPage() {
  const [config, setConfig] = useState<Config>({});
  const [changes, setChanges] = useState<unknown[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    const response = await fetch("/api/admin/system-configuration");
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Unable to load configuration.");
    setConfig(result.data);
    setChanges(result.changes || []);
  }

  useEffect(() => {
    const timer = setTimeout(() => { load().catch((error: Error) => setMessage(error.message)).finally(() => setLoading(false)); }, 0);
    return () => clearTimeout(timer);
  }, []);

  async function save() {
    const response = await fetch("/api/admin/system-configuration", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Unable to save configuration.");
    setConfig(result.data);
    setMessage("Configuration saved.");
  }

  async function reset() {
    const response = await fetch("/api/admin/system-configuration", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "RESET" }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Unable to reset configuration.");
    setConfig(result.data);
    setMessage("Defaults restored.");
  }

  function exportConfig() {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "system-configuration.json"; link.click(); URL.revokeObjectURL(url);
  }

  if (loading) return <div className="p-6">Loading configuration...</div>;
  return (
    <div className="erp-page erp-page-system-configuration space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold">System Configuration</h1><p className="text-sm text-muted-foreground">Global settings available to Super Admin only.</p></div>
        <div className="flex gap-2"><button className="rounded border px-3 py-2" onClick={exportConfig}>Export</button><button className="rounded border px-3 py-2" onClick={() => reset().catch((e: Error) => setMessage(e.message))}>Reset Defaults</button><button className="rounded bg-primary px-3 py-2 text-primary-foreground" onClick={() => save().catch((e: Error) => setMessage(e.message))}>Save</button></div>
      </div>
      {message && <div className="rounded border p-3 text-sm">{message}</div>}
      {sections.map(([title, keys]) => <section className="rounded-lg border p-4" key={title as string}><h2 className="mb-4 text-lg font-medium">{title}</h2><div className="grid gap-4 md:grid-cols-2">{(keys as string[]).map((key) => {
        const value = config[key];
        const checkbox = typeof value === "boolean";
        return <label className="flex flex-col gap-1 text-sm" key={key}><span>{key.replace(/[A-Z]/g, (letter) => ` ${letter}`).replace(/^./, (letter) => letter.toUpperCase())}</span>{checkbox ? <input type="checkbox" checked={value as boolean} onChange={(event) => setConfig({ ...config, [key]: event.target.checked })} /> : <input className="rounded border px-3 py-2" value={String(value ?? "")} type={typeof value === "number" ? "number" : "text"} onChange={(event) => setConfig({ ...config, [key]: typeof value === "number" ? Number(event.target.value) : event.target.value })} />}</label>;
      })}</div></section>)}
      <section className="rounded-lg border p-4"><h2 className="mb-3 text-lg font-medium">Activity Log</h2><div className="space-y-2 text-sm">{changes.map((change, index) => <pre className="overflow-auto rounded bg-muted p-2" key={index}>{JSON.stringify(change)}</pre>)}</div></section>
    </div>
  );
}






