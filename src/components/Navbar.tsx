"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Settings, LayoutDashboard, LogOut, ShieldCheck, Coins, CreditCard, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
  { label: "AI Volání", icon: Phone, path: "/ai-call" },
  { label: "Předplatné", icon: CreditCard, path: "/subscription" },
  { label: "Nastavení", icon: Settings, path: "/settings" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { signOut, user } = useAuth();
  const [credits, setCredits] = useState<number | null>(null);

  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  const isAdmin = adminEmail && user?.email === adminEmail;

  useEffect(() => {
    if (!user) return;
    fetch("/api/subscription")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setCredits(data.creditsRemaining ?? null); })
      .catch(() => {});
  }, [user]);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <CalendarDays className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-display text-lg font-bold text-foreground">
            Renote
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.path;
            const isSubscription = item.path === "/subscription";
            const lowCredits = credits !== null && credits < 5;
            const medCredits = credits !== null && credits >= 5 && credits < 15;
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
                {isSubscription && credits !== null && (
                  <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none ${
                    lowCredits
                      ? "bg-destructive text-destructive-foreground"
                      : medCredits
                      ? "bg-amber-500 text-white"
                      : isActive
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}>
                    <Coins className="inline h-3 w-3 mr-0.5 -mt-0.5" />
                    {credits}
                  </span>
                )}
              </Link>
            );
          })}

          {isAdmin && (
            <Link
              href="/admin"
              className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                pathname === "/admin"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
              Admin
            </Link>
          )}

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
