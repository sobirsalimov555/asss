import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav, SiteFooter } from "@/components/site-nav";

export const Route = createFileRoute("/results/$attemptId")({
  head: () => ({ meta: [{ title: "Result — AS Academy" }] }),
  component: ResultView,
});

function ResultView() {
  const { attemptId } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["attempt", attemptId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attempts")
        .select("*, profiles:user_id(display_name), mock_tests:test_id(title, duration_minutes)")
        .eq("id", attemptId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav />
      <main className="container mx-auto max-w-2xl px-6 py-14 flex-1">
        {isLoading ? <p>Loading…</p> : !data ? <p>Not found.</p> : (
          <>
            <p className="crest">Result</p>
            <h1 className="font-display text-4xl rule-gold mt-3">{(data as any).mock_tests?.title}</h1>
            <p className="mt-2 text-muted-foreground">by {(data as any).profiles?.display_name ?? "Anonymous"}</p>

            <div className="mt-8 card-elegant p-8 grid grid-cols-3 gap-6 text-center">
              <div><div className="font-display text-4xl">{data.correct_count}/{data.total_count}</div><div className="crest mt-1">Correct</div></div>
              <div><div className="font-display text-4xl">{data.score}/{data.max_score}</div><div className="crest mt-1">Points</div></div>
              <div><div className="font-display text-4xl">{data.max_score > 0 ? Math.round((data.score/data.max_score)*100) : 0}%</div><div className="crest mt-1">Score</div></div>
            </div>
            <Link to="/leaderboard" className="mt-8 inline-block text-accent hover:underline">See where this ranks →</Link>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
