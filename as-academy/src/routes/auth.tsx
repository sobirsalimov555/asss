import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — AS Academy" }] }),
  component: Auth,
});

const emailSchema = z.string().trim().email("Enter a valid email address").max(255);

function Auth() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const cleanEmail = emailSchema.parse(email);
      if (password.length < 6) throw new Error("Password must be at least 6 characters");

      if (mode === "signup") {
        const cleanName = name.trim() || cleanEmail.split("@")[0];
        const { error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/practice`,
            data: { display_name: cleanName },
          },
        });
        if (error) throw error;
        toast.success("Account created. You're signed in.");
        navigate({ to: "/practice" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (error) throw error;
        toast.success("Welcome back.");
        navigate({ to: "/practice" });
      }
    } catch (err: any) {
      const msg = err?.issues?.[0]?.message ?? err?.message ?? "Something went wrong";
      toast.error(
        mode === "signin" && /invalid|credential/i.test(msg)
          ? "Invalid email or password"
          : msg,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen hero-surface flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <Link to="/" className="crest hover:text-accent">← AS Academy</Link>
        <div className="mt-6 card-elegant p-8">
          <h1 className="font-display text-3xl rule-gold">
            {mode === "signin" ? "Welcome back" : "Join AS Academy"}
          </h1>
          <p className="mt-5 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Sign in to save scores and appear on the leaderboard."
              : "Create an account and start practicing immediately."}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            {mode === "signup" && (
              <div>
                <Label htmlFor="name">Display name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                  placeholder="Your name on the leaderboard"
                  autoComplete="name"
                />
              </div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                maxLength={255}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                maxLength={72}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
            </div>
            <Button type="submit" disabled={busy} className="w-full bg-primary text-primary-foreground h-11">
              {busy ? "..." : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setPassword("");
            }}
            className="mt-5 text-sm text-muted-foreground hover:text-accent w-full text-center"
          >
            {mode === "signin" ? "No account? Sign up" : "Already a member? Sign in"}
          </button>
        </div>
        <p className="text-xs text-center text-muted-foreground mt-4">
          You can <Link to="/practice" className="underline hover:text-accent">practice without an account</Link>.
        </p>
      </div>
    </div>
  );
}
