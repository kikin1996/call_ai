"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export default function Navbar() {
  const pathname = usePathname();
  const { signOut } = useAuth();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/ai-call" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <Phone className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-display text-lg font-bold text-foreground">
            AI Call
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          <Link
            href="/ai-call"
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              pathname === "/ai-call"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Phone className="h-4 w-4" />
            AI Volání
          </Link>

          <Button
            variant="ghost"
            size="sm"
            className="ml-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => signOut()}
          >
            <LogOut className="h-4 w-4 mr-1.5" />
            Odhlásit
          </Button>
        </nav>
      </div>
    </header>
  );
}
