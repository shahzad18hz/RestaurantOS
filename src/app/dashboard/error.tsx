"use client";
import { ErrorState } from "@/components/ui/page-state";
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="p-4 sm:p-6"><ErrorState message={error.message || "This page could not be loaded."} onRetry={reset} /></div>;
}
