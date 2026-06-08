"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { Phone, AlertCircle, CheckCircle, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { user, signInWithEmail, signUpWithEmail, loading } = useAuth();
  const configured = isSupabaseConfigured();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (user) {
    router.replace("/ai-call");
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!email.trim() || !password) {
      setError("Vyplňte e-mail i heslo.");
      return;
    }
    if (mode === "signup" && password.length < 6) {
      setError("Heslo musí mít alespoň 6 znaků.");
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "signin") {
        const { error } = await signInWithEmail(email.trim(), password);
        if (error) {
          setError(error.message === "Invalid login credentials"
            ? "Nesprávný e-mail nebo heslo."
            : error.message);
          return;
        }
        router.replace("/ai-call");
      } else {
        const { data, error } = await signUpWithEmail(email.trim(), password);
        if (error) {
          setError(error.message);
          return;
        }
        // Pokud je vyžadováno potvrzení e-mailem, session zatím není
        if (data?.session) {
          router.replace("/ai-call");
        } else {
          setInfo("Účet vytvořen. Zkontrolujte e-mail a potvrďte registraci, poté se přihlaste.");
          setMode("signin");
        }
      }
    } catch {
      setError("Něco se pokazilo. Zkuste to znovu.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-navy/20 shadow-lg">
        {!configured && process.env.NODE_ENV === "development" && (
          <div className="mx-4 mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 flex gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Pro přihlášení přidejte do <code className="bg-amber-100 px-1 rounded">.env.local</code> proměnné{" "}
              <code className="bg-amber-100 px-1 rounded">NEXT_PUBLIC_SUPABASE_URL</code> a{" "}
              <code className="bg-amber-100 px-1 rounded">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> z Supabase Dashboard.
            </span>
          </div>
        )}
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-navy text-white">
            <Phone className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl font-display text-navy">
            AI Call
          </CardTitle>
          <CardDescription>
            {mode === "signin"
              ? "Přihlaste se e-mailem a heslem."
              : "Vytvořte si účet pomocí e-mailu a hesla."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vas@email.cz"
                className="mt-1"
                disabled={submitting}
              />
            </div>
            <div>
              <Label htmlFor="password">Heslo</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1"
                disabled={submitting}
              />
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" /> {error}
              </p>
            )}
            {info && (
              <p className="text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 shrink-0" /> {info}
              </p>
            )}

            <Button
              type="submit"
              variant="navy"
              size="lg"
              className="w-full"
              disabled={submitting || loading}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {mode === "signin" ? "Přihlašuji…" : "Vytvářím účet…"}
                </>
              ) : mode === "signin" ? "Přihlásit se" : "Zaregistrovat se"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            {mode === "signin" ? "Nemáte účet? " : "Už máte účet? "}
            <button
              type="button"
              className="font-medium text-navy hover:underline"
              onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); setInfo(null); }}
            >
              {mode === "signin" ? "Zaregistrovat se" : "Přihlásit se"}
            </button>
          </p>

          {process.env.NODE_ENV === "development" && (
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              asChild
            >
              <a href="/api/dev-admin">Vstoupit jako admin (náhled)</a>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
