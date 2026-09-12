"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2 } from "lucide-react";

export interface Category {
  id: number;
  restaurantId: number;

  name: string;
  description: string | null;
  image: string | null;

  status: "ACTIVE" | "INACTIVE";

  sortOrder: number;

  createdAt: string;
  updatedAt: string;
}

interface Props {
  loading: boolean;
  categories: Category[];
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
}

export default function CategoryTable({
  loading,
  categories,
  onEdit,
  onDelete,
}: Props) {
  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Image</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Sort</TableHead>
            <TableHead className="text-right">
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell
                colSpan={6}
                className="py-10 text-center"
              >
                Loading...
              </TableCell>
            </TableRow>
          ) : categories.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={6}
                className="py-10 text-center text-muted-foreground"
              >
                No Categories Found
              </TableCell>
            </TableRow>
          ) : (
            categories.map((category) => (
              <TableRow key={category.id}>
                <TableCell>
                  <img
                    src={
                      category.image ||
                      "/placeholder.svg"
                    }
                    alt={category.name}
                    className="h-12 w-12 rounded-lg border object-cover"
                  />
                </TableCell>

                <TableCell className="font-medium">
                  {category.name}
                </TableCell>

                <TableCell>
                  {category.description || "-"}
                </TableCell>

                <TableCell>
                  <Badge
                    variant={
                      category.status === "ACTIVE"
                        ? "default"
                        : "secondary"
                    }
                  >
                    {category.status}
                  </Badge>
                </TableCell>

                <TableCell>
                  {category.sortOrder}
                </TableCell>

                <TableCell className="space-x-2 text-right">
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => onEdit(category)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>

                  <Button
                    size="icon"
                    variant="destructive"
                    onClick={() =>
                      onDelete(category)
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}