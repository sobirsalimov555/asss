import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export function SiteNav() {
  const { user, signOut } = useAuth();
  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles").select("role")
        .eq("user_id", user!.id).eq("role", "admin").maybeSingle();
      return !!data;
    },
  });

  return (
    <header className="border-b border-border/70 bg-background/80 backdrop-blur-sm sticky top-0 z-40">
      <div className="container mx-auto max-w-6xl flex items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2 group">
          <img src="/logo.png" alt="AS Academy" className="h-12 w-12 rounded-sm object-contain" />
          <span className="font-display text-xl tracking-tight">
            AS <span className="text-accent">Academy</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-7 text-sm">
          <Link to="/practice" className="hover:text-accent transition-colors [&.active]:text-accent">
            Question Bank
          </Link>
          <Link to="/mocks" className="hover:text-accent transition-colors [&.active]:text-accent">
            Mock Tests
          </Link>
          <Link to="/leaderboard" className="hover:text-accent transition-colors [&.active]:text-accent">
            Leaderboard
          </Link>
          <Link to="/resources" className="hover:text-accent transition-colors [&.active]:text-accent">
            Resources
          </Link>
          {isAdmin && (
            <Link to="/admin" className="hover:text-accent transition-colors [&.active]:text-accent">
              Admin
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <span className="hidden sm:inline text-xs text-muted-foreground">
                {user.email}
              </span>
              <Button variant="ghost" size="sm" onClick={signOut}>Sign out</Button>
            </>
          ) : (
            <Button asChild size="sm" className="bg-primary text-primary-foreground hover:opacity-90">
              <Link to="/auth">Sign in</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border mt-24">
      <div className="container mx-auto max-w-6xl px-6 py-10 text-sm text-muted-foreground flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <p className="font-display text-base text-foreground">AS Academy</p>
        <p>© {new Date().getFullYear()} AS Academy. Built for serious SAT students.</p>
      </div>
    </footer>
  );
}
