import Image from "next/image";
import Link from "next/link";

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 shrink-0">
      <Image src="/logo.png" alt="LuckySplit" width={size} height={size} className="rounded-full" />
      <span className="text-xl font-bold tracking-tight text-white">
        Lucky<span className="gradient-text">Split</span>
      </span>
    </Link>
  );
}
