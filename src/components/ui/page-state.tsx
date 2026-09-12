import { AlertCircle, Inbox, Loader2, RefreshCw } from "lucide-react";

export function PageSkeleton({ rows = 5 }: { rows?: number }) {
  return <div className="erp-state-shell" aria-busy="true" aria-live="polite">
    <div className="erp-skeleton erp-skeleton-title" />
    <div className="erp-skeleton-grid">{Array.from({ length: 4 }, (_, i) => <div key={i} className="erp-skeleton erp-skeleton-card" />)}</div>
    <div className="erp-skeleton-table">{Array.from({ length: rows }, (_, i) => <div key={i} className="erp-skeleton erp-skeleton-row" />)}</div>
    <span className="sr-only">Loading content</span>
  </div>;
}

export function EmptyState({ title = "Nothing here yet", description = "When records become available, they will appear here.", action }: { title?: string; description?: string; action?: React.ReactNode }) {
  return <div className="erp-empty-state"><span className="erp-empty-icon"><Inbox size={22}/></span><h3>{title}</h3><p>{description}</p>{action && <div className="mt-4">{action}</div>}</div>;
}

export function ErrorState({ message = "We couldn't load this view.", onRetry }: { message?: string; onRetry?: () => void }) {
  return <div className="erp-error-state" role="alert"><span className="erp-error-icon"><AlertCircle size={22}/></span><h3>Something needs attention</h3><p>{message}</p>{onRetry && <button onClick={onRetry}><RefreshCw size={15}/> Try again</button>}</div>;
}

export function InlineLoader({ label = "Loading" }: { label?: string }) {
  return <span className="erp-inline-loader" role="status"><Loader2 className="animate-spin" size={16}/>{label}</span>;
}
