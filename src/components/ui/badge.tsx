import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-cyan-500/30 bg-cyan-500/10 text-cyan-400",
        critical: "border-red-500/30 bg-red-500/10 text-red-400",
        high: "border-orange-500/30 bg-orange-500/10 text-orange-400",
        medium: "border-yellow-500/30 bg-yellow-500/10 text-yellow-400",
        low: "border-blue-500/30 bg-blue-500/10 text-blue-400",
        info: "border-slate-500/30 bg-slate-500/10 text-slate-400",
        success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
        warning: "border-amber-500/30 bg-amber-500/10 text-amber-400",
        destructive: "border-red-500/30 bg-red-500/10 text-red-400",
        outline: "border-slate-700 text-slate-300",
        secondary: "border-slate-700 bg-slate-800 text-slate-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
