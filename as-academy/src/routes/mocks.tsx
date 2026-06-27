import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav, SiteFooter } from "@/components/site-nav";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/mocks")({
  head: () => ({
    meta: [
      { title: "Mock Tests — AS Academy" },
      {
        name: "description",
        content:
          "Full-length, timed SAT mock tests with official module timing (32/32/35/35). Free to take.",
      },
    ],
  }),
  component: Mocks,
});

const MODULE_LABELS = [
  { key: "rw1", label: "RW Module 1", min: 32 },
  { key: "rw2", label: "RW Module 2", min: 32 },
  { key: "math1", label: "Math Module 1", min: 35 },
  { key: "math2", label: "Math Module 2", min: 35 },
] as const;

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

  const { data: counts } = useQuery({
    queryKey: ["mock-question-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mock_questions")
        .select("mock_id, module, count:mock_id.count()")
        .order("mock_id")
        .order("module") as any;
      if (error) return [];
      return (data ?? []) as { mock_id: string; module: string; count: number }[];
    },
  });

  const countMap = new Map<string, Map<string, number>>();
  for (const c of counts ?? []) {
    if (!countMap.has(c.mock_id)) countMap.set(c.mock_id, new Map());
    countMap.get(c.mock_id)!.set(c.module, c.count);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav />
      <main className="container mx-auto max-w-6xl px-6 py-14 flex-1">
        <p className="crest">Full Mock Tests</p>
        <h1 className="font-display text-5xl md:text-6xl rule-gold mt-3">
          Sit the real thing
        </h1>
        <p className="mt-4 text-muted-foreground max-w-2xl text-base leading-relaxed">
          Four modules, official SAT timing — Reading &amp; Writing 32+32 min, Math 35+35 min,
          with a 10-minute break between sections. Sign in before starting to save your score.
        </p>

        {isLoading ? (
          <p className="mt-12 text-muted-foreground animate-pulse-soft">Loading…</p>
        ) : !mocks || mocks.length === 0 ? (
          <div className="mt-12 card-elegant p-10 text-center">
            <p className="font-serif text-2xl">No mock tests yet.</p>
            <p className="text-sm text-muted-foreground mt-2">
              An administrator will publish full mocks soon.
            </p>
          </div>
        ) : (
          <div className="mt-12 grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {mocks.map((m) => {
              const qc = countMap.get(m.id);
              const total = qc ? Array.from(qc.values()).reduce((a, b) => a + b, 0) : null;
              return (
                <Link
                  key={m.id}
                  to="/mocks/$mockId"
                  params={{ mockId: m.id }}
                  className="card-elegant p-6 block group"
                >
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <Badge
                      variant="outline"
                      className="border-accent/40 text-accent bg-accent/5 shrink-0"
                    >
                      134 min
                    </Badge>
                    {m.topic && (
                      <span className="text-xs text-muted-foreground capitalize">{m.topic}</span>
                    )}
                  </div>
                  <h3 className="font-serif text-xl leading-tight group-hover:text-accent transition-colors">
                    {m.title}
                  </h3>
                  {m.description && (
                    <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                      {m.description}
                    </p>
                  )}

                  <div className="mt-4 text-xs text-muted-foreground space-y-1">
                    {MODULE_LABELS.map((mod) => (
                      <div key={mod.key} className="flex justify-between">
                        <span>{mod.label}</span>
                        <span>
                          {qc?.get(mod.key) ?? "—"} questions · {mod.min} min
                        </span>
                      </div>
                    ))}
                    {total !== null && (
                      <div className="border-t border-border pt-1 mt-1 font-medium text-foreground flex justify-between">
                        <span>Total</span>
                        <span>{total} questions</span>
                      </div>
                    )}
                  </div>

                  <p className="mt-5 text-xs text-accent font-medium group-hover:underline">
                    Begin mock →
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
