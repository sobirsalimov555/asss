import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav, SiteFooter } from "@/components/site-nav";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "Leaderboard — AS Academy" },
      { name: "description", content: "Top SAT students ranked by their average full-mock score. Countdown to the next digital SAT." },
    ],
  }),
  component: Leaderboard,
});

interface Row {
  user_id: string;
  display_name: string;
  avg_sat: number;
  attempts: number;
}

function Leaderboard() {
  const { user } = useAuth();

  const { data: board, isLoading } = useQuery({
    queryKey: ["leaderboard-avg"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_leaderboard");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const { data: nextSat } = useQuery({
    queryKey: ["next-sat-date"],
    queryFn: async () => {
      const { data } = await supabase
        .from("site_settings").select("value").eq("key", "next_sat_date").maybeSingle();
      return data?.value ?? null;
    },
  });

  const myRow = user ? board?.find((r) => r.user_id === user.id) : null;
  const myRank = user && board ? board.findIndex((r) => r.user_id === user.id) + 1 : 0;

  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav />
      <main className="container mx-auto max-w-4xl px-6 py-14 flex-1">
        <p className="crest">Hall of Scores</p>
        <h1 className="font-display text-5xl rule-gold mt-3">Leaderboard</h1>
        <p className="mt-4 text-muted-foreground max-w-xl">
          Ranked by each student's average SAT score across full-length mocks (out of 1600).
        </p>

        <div className="mt-10 grid md:grid-cols-2 gap-5">
          <CountdownCard iso={nextSat ?? null} />
          <MyAvgCard user={user} row={myRow ?? null} rank={myRank} />
        </div>

        {isLoading ? (
          <p className="mt-12 text-muted-foreground">Loading…</p>
        ) : !board || board.length === 0 ? (
          <div className="mt-12 card-elegant p-10 text-center">
            <p className="font-display text-2xl">No mock scores yet.</p>
            <p className="text-sm text-muted-foreground mt-2">Sit a full mock to appear on the board.</p>
          </div>
        ) : (
          <div className="mt-10 card-elegant overflow-hidden">
            <table className="w-full text-base">
              <thead className="bg-muted/50 text-left">
                <tr className="border-b border-border">
                  <th className="px-4 py-3 w-16 crest">Rank</th>
                  <th className="px-4 py-3 crest">Student</th>
                  <th className="px-4 py-3 crest text-right">Avg SAT</th>
                  <th className="px-4 py-3 crest text-right">Mocks</th>
                </tr>
              </thead>
              <tbody>
                {board.map((r, i) => {
                  const isMe = user?.id === r.user_id;
                  return (
                    <tr key={r.user_id} className={`border-b border-border/60 last:border-0 ${isMe ? "bg-accent/10" : "hover:bg-accent/5"}`}>
                      <td className="px-4 py-3 font-display text-lg">
                        {i < 3 ? <span className="text-accent">{i + 1}</span> : i + 1}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {r.display_name}{isMe && <span className="ml-2 text-xs text-accent">(you)</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-display text-lg">{r.avg_sat}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{r.attempts}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

function MyAvgCard({ user, row, rank }: { user: any; row: Row | null; rank: number }) {
  if (!user) {
    return (
      <div className="card-elegant p-6">
        <p className="crest">Your average</p>
        <p className="mt-3 text-sm text-muted-foreground">Sign in and take a mock to track your average SAT score here.</p>
      </div>
    );
  }
  if (!row) {
    return (
      <div className="card-elegant p-6">
        <p className="crest">Your average</p>
        <p className="mt-3 font-display text-2xl">—</p>
        <p className="text-sm text-muted-foreground mt-1">Take a full mock to see your average.</p>
      </div>
    );
  }
  return (
    <div className="card-elegant p-6">
      <p className="crest">Your average SAT</p>
      <p className="mt-3 font-display text-4xl text-accent">{row.avg_sat}</p>
      <p className="text-xs text-muted-foreground mt-2">
        Rank #{rank} · {row.attempts} mock{row.attempts === 1 ? "" : "s"} sat
      </p>
    </div>
  );
}

function CountdownCard({ iso }: { iso: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!iso) {
    return (
      <div className="card-elegant p-6">
        <p className="crest">Next Digital SAT</p>
        <p className="mt-3 font-display text-2xl">Date not set</p>
        <p className="text-sm text-muted-foreground mt-1">An admin will publish it soon.</p>
      </div>
    );
  }
  const target = new Date(iso).getTime();
  const diff = target - now;
  const dateLabel = new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  if (diff <= 0) {
    return (
      <div className="card-elegant p-6">
        <p className="crest">Digital SAT</p>
        <p className="mt-3 font-display text-2xl text-accent">It's exam time.</p>
        <p className="text-sm text-muted-foreground mt-1">{dateLabel}</p>
      </div>
    );
  }
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  return (
    <div className="card-elegant p-6">
      <p className="crest">Next Digital SAT</p>
      <p className="mt-3 font-display text-4xl text-accent">
        {days}<span className="text-base text-muted-foreground"> days</span>
        {days < 30 && <> <span className="text-2xl">{hours}h</span></>}
      </p>
      <p className="text-xs text-muted-foreground mt-2">{dateLabel}</p>
    </div>
  );
}
