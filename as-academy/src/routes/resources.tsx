import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav, SiteFooter } from "@/components/site-nav";

export const Route = createFileRoute("/resources")({
  head: () => ({
    meta: [
      { title: "Resources — AS Academy" },
      { name: "description", content: "Study notes and resources curated by AS Academy tutors." },
    ],
  }),
  component: Resources,
});

function Resources() {
  const { data, isLoading } = useQuery({
    queryKey: ["resources"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("study_resources")
        .select("*")
        .eq("published", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav />
      <main className="container mx-auto max-w-5xl px-6 py-14 flex-1">
        <p className="crest">The Library</p>
        <h1 className="font-display text-5xl rule-gold mt-3">Study resources</h1>
        <p className="mt-4 text-muted-foreground max-w-xl">
          Notes, articles, and PDFs hand-picked to fill the gaps the SAT loves to exploit.
        </p>

        {isLoading ? (
          <p className="mt-12 text-muted-foreground">Loading…</p>
        ) : !data || data.length === 0 ? (
          <div className="mt-12 card-elegant p-10 text-center">
            <p className="font-display text-2xl">No resources published yet.</p>
          </div>
        ) : (
          <div className="mt-10 grid md:grid-cols-2 gap-5">
            {data.map((r) => {
              const href = /^https?:\/\//i.test(r.url) ? r.url : `https://${r.url}`;
              return (
                <a key={r.id} href={href} target="_blank" rel="noopener noreferrer" className="card-elegant p-6 block">
                  {r.category && <p className="crest text-accent">{r.category}</p>}
                  <h3 className="mt-2 font-display text-xl">{r.title}</h3>
                  {r.description && <p className="mt-2 text-sm text-muted-foreground">{r.description}</p>}
                  <p className="mt-4 text-xs text-accent">Open →</p>
                </a>
              );
            })}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
