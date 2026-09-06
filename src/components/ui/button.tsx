import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex touch-target items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-lg)] text-sm font-medium transition-[transform,opacity,background-color] duration-[var(--motion-base)] ease-[var(--ease-out)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brand-background)] disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--brand-accent)] text-[var(--brand-accent-foreground)] hover:opacity-90",
        secondary:
          "bg-[var(--brand-surface)] text-[var(--brand-foreground)] hover:bg-[var(--brand-surface-elevated)]",
        outline:
          "border border-[var(--brand-border)] bg-transparent hover:bg-[var(--brand-surface)]",
        ghost: "hover:bg-[var(--brand-surface)]",
        danger:
          "bg-[color-mix(in_oklab,var(--status-danger)_20%,transparent)] text-[var(--status-danger)] border border-[color-mix(in_oklab,var(--status-danger)_40%,transparent)]",
      },
      size: {
        default: "h-11 px-4 py-2",
        sm: "h-9 rounded-[var(--radius-md)] px-3",
        lg: "h-12 rounded-[var(--radius-xl)] px-6 text-base",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
