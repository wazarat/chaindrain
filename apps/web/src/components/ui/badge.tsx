import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default: "border-transparent bg-accent/10 text-accent",
        secondary: "border-transparent bg-muted text-foreground",
        outline: "text-foreground",
        info: "border-transparent bg-sev-info/15 text-sev-info",
        low: "border-transparent bg-sev-low/15 text-sev-low",
        medium: "border-transparent bg-sev-medium/15 text-sev-medium",
        high: "border-transparent bg-sev-high/15 text-sev-high",
        critical: "border-transparent bg-sev-critical/15 text-sev-critical",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
export { Badge, badgeVariants };
