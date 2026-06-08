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

  const signInWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  const signUpWithEmail = async (email: string, password: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : ""
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${origin}/auth/callback` },
    })
    return { data, error }
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

  return { user, loading, signInWithEmail, signUpWithEmail, signOut }
}
