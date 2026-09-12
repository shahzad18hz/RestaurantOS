"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

type Props = {
  search: string;
  setSearch: (value: string) => void;

  status: "ALL" | "ACTIVE" | "INACTIVE";
  setStatus: (value: "ALL" | "ACTIVE" | "INACTIVE") => void;

};

export default function CategoryToolbar({
  search,
  setSearch,
  status,
  setStatus,
}: Props) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      {/* Search */}
      <div className="relative w-full lg:max-w-md">
        <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search category..."
          className="pl-9"
        />
      </div>

      {/* Right Side */}
      <div className="flex items-center gap-3">
        {/* Status Filter */}
        <select
          value={status}
          onChange={(e) =>
            setStatus(
              e.target.value as "ALL" | "ACTIVE" | "INACTIVE"
            )
          }
          className="h-10 rounded-lg border px-3 text-sm"
        >
          <option value="ALL">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>

      </div>
    </div>
  );
}