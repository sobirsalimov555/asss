import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav, SiteFooter } from "@/components/site-nav";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/mocks")({
  head: () => ({
    meta: [
      { title: "Mock Tests — AS Academy" },
      { name: "description", content: "Full-length, timed SAT mock tests with official module timing (32/32/35/35). Free to take." },
    ],
  }),
  component: Mocks,
});

function Mocks() {
  const { data: mocks, isLoading } = useQuery({
    queryKey: ["full-mocks-public"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mock_tests")
        .select("id, title, description, topic, created_at")
        .eq("published", true)
        .eq("kind", "full_mock")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav />
      <main className="container mx-auto max-w-6xl px-6 py-14 flex-1">
        <p className="crest">Full Mock Tests</p>
        <h1 className="font-display text-5xl rule-gold mt-3">Sit the real thing</h1>
        <p className="mt-4 text-muted-foreground max-w-2xl">
          Four modules, official SAT timing — Reading &amp; Writing 32+32 min, Math 35+35 min, with a break between sections.
          Sign in before starting if you want your score on the leaderboard.
        </p>

        {isLoading ? (
          <p className="mt-12 text-muted-foreground">Loading…</p>
        ) : !mocks || mocks.length === 0 ? (
          <div className="mt-12 card-elegant p-10 text-center">
            <p className="font-display text-2xl">No mock tests yet.</p>
            <p className="text-sm text-muted-foreground mt-2">An administrator will publish full mocks soon.</p>
          </div>
        ) : (
          <div className="mt-12 grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {mocks.map((m) => (
              <Link
                key={m.id}
                to="/mocks/$mockId"
                params={{ mockId: m.id }}
                className="card-elegant p-6 block"
              >
                <div className="flex items-start justify-between gap-3">
                  <Badge variant="outline" className="border-accent/40 text-accent bg-accent/5">134 min</Badge>
                  {m.topic && <span className="text-xs text-muted-foreground">{m.topic}</span>}
                </div>
                <h3 className="mt-4 font-display text-xl leading-tight">{m.title}</h3>
                {m.description && <p className="mt-2 text-sm text-muted-foreground line-clamp-3">{m.description}</p>}
                <p className="mt-5 text-xs text-accent">Begin mock →</p>
              </Link>
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
