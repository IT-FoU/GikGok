/**
 * Shared UI primitives used by player and admin shells.
 */
export const SHARED_UI_MODULE = "shared/ui" as const;

export { Button, buttonVariants } from "@/components/ui/button";
export { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
export { Dialog } from "@/components/ui/dialog";
export { FilterBar } from "@/components/ui/filter-bar";
export { Input } from "@/components/ui/input";
export { Label } from "@/components/ui/label";
export { Pagination } from "@/components/ui/pagination";
export {
  EmptyState,
  ErrorState,
  LoadingState,
  Skeleton,
} from "@/components/ui/states";
export { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
export { ToastProvider, useToast } from "@/components/ui/toast";
