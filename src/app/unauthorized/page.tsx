import Link from "next/link";
import { ArrowLeft, ShieldAlert } from "lucide-react";

export default function UnauthorizedPage(){
 return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6"><section className="w-full max-w-lg rounded-[28px] border bg-white p-8 text-center shadow-xl"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700"><ShieldAlert className="h-7 w-7"/></div><p className="mt-5 text-xs font-bold uppercase tracking-[.18em] text-amber-700">Protected workspace</p><h1 className="mt-2 text-3xl font-bold text-slate-950">You don’t have access to this page</h1><p className="mt-3 text-sm leading-6 text-slate-500">Your restaurant role does not include this area. Ask an owner or manager if you need additional permissions.</p><Link href="/dashboard" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"><ArrowLeft className="h-4 w-4"/> Back to dashboard</Link></section></main>
}
