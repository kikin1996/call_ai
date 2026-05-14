import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import Link from "next/link";
import { NavbarAuth } from "@/components/NavbarAuth";
import {
  CalendarDays,
  MessageSquare,
  Phone,
  Send,
  CheckCircle2,
  ArrowRight,
  LayoutDashboard,
  RefreshCw,
  Bell,
} from "lucide-react";

export default async function HomePage() {
  // Přihlášený uživatel → rovnou na dashboard
  try {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) redirect("/dashboard");
  } catch {
    // chybějící env – pokračovat na landing page
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Navbar ───────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy">
              <CalendarDays className="h-5 w-5 text-white" />
            </div>
            <span className="font-display text-lg font-bold text-navy">
              Renote
            </span>
          </div>
          <nav className="flex items-center gap-2">
            <NavbarAuth />
          </nav>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-navy py-24 text-white">
        {/* dekorativní kruh */}
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-emerald/10" />
        <div className="pointer-events-none absolute -bottom-20 -left-20 h-72 w-72 rounded-full bg-white/5" />

        <div className="container relative text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm">
            <CalendarDays className="h-4 w-4 text-emerald-400" />
            Automatizace prohlídek nemovitostí
          </div>
          <h1 className="font-display text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
            Nikdy nezapomeňte{" "}
            <span className="text-emerald-400">připomenout prohlídku</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-white/70">
            Renote propojí váš Google Kalendář s SMS notifikacemi a AI hovory.
            Klienti dostanou automatické připomínky – vy se soustředíte na prodej.
          </p>
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-7 py-3.5 text-base font-semibold text-white shadow-lg transition-all hover:bg-emerald-400 hover:shadow-emerald-500/30 hover:shadow-xl"
            >
              Začít zdarma
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-7 py-3.5 text-base font-semibold text-white transition-all hover:bg-white/20"
            >
              Přihlásit se
            </Link>
          </div>
        </div>
      </section>

      {/* ── Jak to funguje ────────────────────────────────────────── */}
      <section className="py-20">
        <div className="container">
          <div className="mb-12 text-center">
            <h2 className="font-display text-3xl font-bold text-navy">
              Jak Renote funguje?
            </h2>
            <p className="mt-3 text-muted-foreground">
              Tři kroky a prohlídky se řídí samy.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                step: "1",
                icon: CalendarDays,
                title: "Propojte Google Kalendář",
                desc: "Přidejte do události klíčové slovo (např. #prohlidka) a zadejte tel. číslo a adresu klienta. Renote si vše automaticky načte.",
                color: "bg-navy",
              },
              {
                step: "2",
                icon: MessageSquare,
                title: "SMS jdou samy",
                desc: "2 hodiny a 1 hodinu před prohlídkou odešle systém SMS s potvrzením. Klient odpoví ANO nebo NE – vy vidíte status v dashboardu.",
                color: "bg-emerald",
              },
              {
                step: "3",
                icon: Phone,
                title: "AI hovor 30 minut před",
                desc: "Volitelně zavolá AI asistent klientovi 30 minut před prohlídkou. Automaticky, bez vaší účasti.",
                color: "bg-navy",
              },
            ].map((item) => (
              <div key={item.step} className="relative rounded-2xl border border-border bg-card p-8 shadow-sm">
                <div className={`mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl ${item.color} text-white`}>
                  <item.icon className="h-6 w-6" />
                </div>
                <div className="absolute right-6 top-6 font-display text-5xl font-bold text-muted/30 select-none">
                  {item.step}
                </div>
                <h3 className="mb-2 font-display text-xl font-semibold text-navy">
                  {item.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Funkce ───────────────────────────────────────────────── */}
      <section className="bg-muted/40 py-20">
        <div className="container">
          <div className="mb-12 text-center">
            <h2 className="font-display text-3xl font-bold text-navy">
              Vše na jednom místě
            </h2>
            <p className="mt-3 text-muted-foreground">
              Komplexní řešení pro makléře i realitní kanceláře.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: RefreshCw,
                title: "Sync z Google Kalendáře",
                desc: "Automatický import prohlídek každý večer. Stačí správně zapsat událost.",
              },
              {
                icon: MessageSquare,
                title: "SMS 2h a 1h před",
                desc: "Šablona zprávy s adresou a časem, odeslaná přes SMSbrána.cz.",
              },
              {
                icon: CheckCircle2,
                title: "Potvrzení od klienta",
                desc: "AI analyzuje odpověď klienta (ANO / NE / nejasné) a aktualizuje status.",
              },
              {
                icon: Phone,
                title: "AI telefonní hovor",
                desc: "VAPI asistent zavolá klientovi 30 minut před prohlídkou.",
              },
              {
                icon: Send,
                title: "Telegram notifikace",
                desc: "Vy dostanete zprávu na Telegram při každém odeslání SMS nebo odpovědi klienta.",
              },
              {
                icon: Bell,
                title: "Vlastní notifikace",
                desc: "Přidejte libovolný počet připomínek – SMS nebo hovor v čase, který si nastavíte.",
              },
              {
                icon: LayoutDashboard,
                title: "Přehledný dashboard",
                desc: "Seznam a kalendářový pohled na všechny prohlídky se stavy v reálném čase.",
              },
            ].map((f) => (
              <div key={f.title} className="flex gap-4 rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-bg">
                  <f.icon className="h-5 w-5 text-emerald" />
                </div>
                <div>
                  <h3 className="font-medium text-navy">{f.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────── */}
      <section className="bg-navy py-20 text-white">
        <div className="container text-center">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">
            Připraveni automatizovat prohlídky?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-white/70">
            Zaregistrujte se a propojte svůj Google Kalendář. Nastavení trvá méně než 5 minut.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-8 py-3.5 text-base font-semibold text-white shadow-lg transition-all hover:bg-emerald-400"
            >
              Začít zdarma
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-8 py-3.5 text-base font-semibold text-white transition-all hover:bg-white/20"
            >
              Mám účet – přihlásit se
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="border-t border-border py-6">
        <div className="container flex flex-col items-center justify-between gap-2 text-sm text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-navy" />
            <span className="font-display font-semibold text-navy">Renote</span>
          </div>
          <p>© {new Date().getFullYear()} Renote. Všechna práva vyhrazena.</p>
          <div className="flex gap-4">
            <Link href="/login" className="hover:text-foreground transition-colors">Přihlásit se</Link>
            <Link href="/register" className="hover:text-foreground transition-colors">Registrovat se</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
