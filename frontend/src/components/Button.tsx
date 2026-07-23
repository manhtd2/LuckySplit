import { forwardRef } from "react";
import Link from "next/link";

type Variant = "primary" | "secondary" | "danger";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "gradient-btn text-white hover:brightness-110",
  secondary: "bg-white/5 border border-white/10 text-white hover:bg-white/10",
  danger: "bg-red/10 border border-red/30 text-red hover:bg-red/20",
};

const baseClasses =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", className = "", ...props }, ref) => (
    <button ref={ref} className={`${baseClasses} ${VARIANT_CLASSES[variant]} ${className}`} {...props} />
  ),
);
Button.displayName = "Button";

export function LinkButton({
  href,
  variant = "primary",
  className = "",
  children,
}: {
  href: string;
  variant?: Variant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={`${baseClasses} ${VARIANT_CLASSES[variant]} ${className}`}>
      {children}
    </Link>
  );
}
