"use client";

import { useEffect, useMemo, useState } from "react";

type RestaurantSettingsLite = {
  currency: string;
  taxPercentage: number;
  taxName: string;
  taxInclusive?: boolean;
  receiptHeader?: string | null;
  receiptFooter?: string | null;
  printLogo?: boolean;
  autoPrintReceipt?: boolean;
  restaurant?: { name?: string | null; phone?: string | null; address?: string | null; logo?: string | null } | null;
};

const FALLBACK: RestaurantSettingsLite = { currency: "USD", taxPercentage: 0, taxName: "Tax", taxInclusive: false, printLogo: true, autoPrintReceipt: false };

export function useRestaurantSettings() {
  const [settings, setSettings] = useState<RestaurantSettingsLite>(FALLBACK);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/owner/workspace-preferences", { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.message || "Could not load restaurant settings.");
        if (active) setSettings({ ...FALLBACK, ...json.data, taxPercentage: Number(json.data.taxPercentage || 0) });
      })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const money = useMemo(() => (value: string | number, maximumFractionDigits = 2) => {
    const amount = Number(value) || 0;
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: settings.currency || "USD", maximumFractionDigits }).format(amount);
    } catch {
      return `${settings.currency || "USD"} ${amount.toFixed(maximumFractionDigits)}`;
    }
  }, [settings.currency]);

  return { settings, money, loading };
}
