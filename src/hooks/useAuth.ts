import { useEffect, useState } from "react"
import { User } from "@supabase/supabase-js"
import { createClient, isSupabaseConfigured } from "@/lib/supabase"

const DEV_USER: User = {
  id: "dev-admin",
  email: "admin@local.dev",
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
  created_at: new Date().toISOString(),
} as User

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      fetch("/api/dev-session")
        .then((r) => r.json())
        .then((data) => {
          setUser(data.user ? DEV_USER : null)
        })
        .catch(() => setUser(null))
        .finally(() => setLoading(false))
      return
    }

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setUser(session?.user ?? null)
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false))

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signInWithGoogle = async () => {
    const origin = typeof window !== "undefined" ? window.location.origin : ""
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback`,
      },
    })
  }

  const signOut = async () => {
    if (user?.id === "dev-admin") {
      await fetch("/api/dev-logout", { method: "POST" })
      setUser(null)
      window.location.href = "/login"
      return
    }
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  return { user, loading, signInWithGoogle, signOut }
}
