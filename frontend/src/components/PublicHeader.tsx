import Link from "next/link";
import { Wallet } from "lucide-react";
import { Logo } from "./Logo";
import { LinkButton } from "./Button";

export function PublicHeader() {
  return (
    <header className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
      <Logo />
      <nav className="hidden sm:flex items-center gap-6 text-sm text-muted">
        <Link href="/" className="hover:text-white transition">
          Explore
        </Link>
      </nav>
      <LinkButton href="/dashboard" variant="secondary">
        <Wallet size={16} /> Connect Wallet
      </LinkButton>
    </header>
  );
}
