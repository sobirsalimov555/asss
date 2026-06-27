import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SiteNav, SiteFooter } from "@/components/site-nav";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AS Academy — Master the SAT" },
      { name: "description", content: "Full-length SAT mocks, topic practice, and study notes — no signup required to browse. Track your scores and climb the leaderboard." },
      { property: "og:title", content: "AS Academy — Master the SAT" },
      { property: "og:description", content: "Full SAT mocks, topic practice, and notes. Climb the leaderboard." },
    ],
  }),
  component: Index,
});

function Index() {
  const { data: stats } = useQuery({
    queryKey: ["home-stats"],
    queryFn: async () => {
      const [{ count: tests }, { count: attempts }] = await Promise.all([
        supabase.from("mock_tests").select("*", { count: "exact", head: true }).eq("published", true),
        supabase.from("attempts").select("*", { count: "exact", head: true }),
      ]);
      return { tests: tests ?? 0, attempts: attempts ?? 0 };
    },
  });

  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav />

      {/* Hero */}
      <section className="hero-surface">
        <div className="container mx-auto max-w-6xl px-6 pt-20 pb-24 md:pt-28 md:pb-32">
          <p className="crest">An Institute for SAT Mastery</p>
          <h1 className="mt-5 font-display text-5xl md:text-7xl leading-[1.02] max-w-3xl">
            Prepare for the SAT with the rigor of a <em className="text-accent not-italic">classical</em> education.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            Full-length mocks, focused topic drills, and curated study notes — written by tutors,
            sharpened by data. Browse freely. Sign in only when you want to keep your score.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button asChild size="lg" className="bg-primary text-primary-foreground hover:opacity-90 px-7 h-12">
              <Link to="/mocks">Take a full mock</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="border-foreground/20 h-12 px-7">
              <Link to="/practice">Open question bank</Link>
            </Button>
          </div>

          <div className="mt-16 grid grid-cols-3 gap-6 max-w-xl">
            <Stat n={stats?.tests ?? 0} label="Published tests" />
            <Stat n={stats?.attempts ?? 0} label="Attempts logged" />
            <Stat n={1600} label="Max score, naturally" />
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section className="container mx-auto max-w-6xl px-6 py-20">
        <p className="crest">The Method</p>
        <h2 className="mt-3 font-display text-4xl rule-gold">Three pillars. One score.</h2>
        <div className="mt-12 grid md:grid-cols-3 gap-6">
          <Pillar n="01" title="Full-length mocks" body="Sit a complete, timed SAT. Walk out with a section-by-section breakdown of every miss." />
          <Pillar n="02" title="Topic practice" body="Algebra, geometry, reading, grammar — short, surgical sets that target what slips." />
          <Pillar n="03" title="Study resources" body="Concise notes from the AS Academy library. The shortest path to a higher score." />
        </div>
      </section>

      {/* CTA strip */}
      <section className="bg-primary text-primary-foreground">
        <div className="container mx-auto max-w-6xl px-6 py-14 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <p className="crest text-primary-foreground/60">Free to try</p>
            <h3 className="font-display text-3xl mt-2">No account needed to practice or browse.</h3>
            <p className="mt-2 text-primary-foreground/70 max-w-xl">Sign in only when you want results saved and a spot on the leaderboard.</p>
          </div>
          <Button asChild size="lg" className="bg-accent text-accent-foreground hover:opacity-90 h-12 px-7">
            <Link to="/mocks">Pick a mock</Link>
          </Button>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <div className="font-display text-3xl md:text-4xl text-foreground">{n}</div>
      <div className="text-xs uppercase tracking-widest text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function Pillar({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <article className="card-elegant p-7">
      <div className="font-display text-accent text-sm">{n}</div>
      <h3 className="mt-3 font-display text-2xl">{title}</h3>
      <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{body}</p>
    </article>
  );
}
