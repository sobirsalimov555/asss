import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav } from "@/components/site-nav";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/mocks/$mockId")({
  head: () => ({ meta: [{ title: "Mock Test — AS Academy" }] }),
  component: TakeMock,
});

// Official SAT digital module timings (minutes)
const MODULES = [
  { key: "rw1", label: "Reading & Writing — Module 1", minutes: 32 },
  { key: "rw2", label: "Reading & Writing — Module 2", minutes: 32 },
  { key: "math1", label: "Math — Module 1", minutes: 35 },
  { key: "math2", label: "Math — Module 2", minutes: 35 },
] as const;

type ModuleKey = (typeof MODULES)[number]["key"];

type MQ = {
  id: string;
  position: number;
  module: ModuleKey;
  questions: {
    id: string;
    prompt: string;
    choices: string[];
    points: number;
    image_url: string | null;
  };
};

function TakeMock() {
  const { mockId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: mock } = useQuery({
    queryKey: ["mock", mockId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mock_tests")
        .select("id, title, description, published, kind")
        .eq("id", mockId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ["mock-questions", mockId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mock_questions")
        .select(
          "id, position, module, questions:question_id(id, prompt, choices, points, image_url)",
        )
        .eq("mock_id", mockId)
        .order("module")
        .order("position");
      if (error) throw error;
      return ((data ?? []) as unknown as MQ[]).filter((d) => d.questions);
    },
  });

  const byModule = useMemo(() => {
    const m: Record<ModuleKey, MQ[]> = { rw1: [], rw2: [], math1: [], math2: [] };
    items?.forEach((q) => m[q.module].push(q));
    return m;
  }, [items]);

  // Flow: 'intro' -> module 0 -> break -> module 1 -> ... -> 'done'
  const [stage, setStage] = useState<"intro" | "module" | "break" | "submitting" | "done">("intro");
  const [moduleIdx, setModuleIdx] = useState(0);
  const moduleIdxRef = useRef(moduleIdx);
  moduleIdxRef.current = moduleIdx;
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const current = MODULES[moduleIdx];
  const currentQs = byModule[current.key];

  // Timer
  useEffect(() => {
    if (stage !== "module") return;
    if (secondsLeft <= 0) {
      advanceModule();
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, secondsLeft]);

  function startMock() {
    if (!items || items.length === 0) {
      toast.error("This mock has no questions yet.");
      return;
    }
    setStartedAt(Date.now());
    setModuleIdx(0);
    setSecondsLeft(MODULES[0].minutes * 60);
    setStage("module");
  }

  function advanceModule() {
    const idx = moduleIdxRef.current;
    if (idx === 1) {
      setStage("break");
      return;
    }
    if (idx >= 3) {
      void finalize();
      return;
    }
    const next = idx + 1;
    setModuleIdx(next);
    setSecondsLeft(MODULES[next].minutes * 60);
    setStage("module");
  }

  function endBreak() {
    const next = 2;
    setModuleIdx(next);
    setSecondsLeft(MODULES[next].minutes * 60);
    setStage("module");
  }

  async function finalize() {
    setStage("submitting");
    const all = items ?? [];

    // Fetch correct answers server-side (requires signed-in user via RLS)
    const qIds = all.map((it) => it.questions.id);
    const { data: answerRows2, error: ansErr } = qIds.length
      ? await supabase.from("questions").select("id, correct_index").in("id", qIds)
      : { data: [], error: null as any };
    if (ansErr) {
      toast.error("Couldn't grade your mock: " + ansErr.message);
      setStage("done");
      return;
    }
    const correctMap = new Map<string, number>();
    for (const r of (answerRows2 ?? []) as { id: string; correct_index: number }[]) {
      correctMap.set(r.id, r.correct_index);
    }

    // Per-module tallies for SAT scaling
    const rwCorrect = { n: 0, total: 0 };
    const mathCorrect = { n: 0, total: 0 };

    let correctCount = 0;
    let score = 0;
    let max = 0;
    const answerRows: {
      question_id: string;
      selected_index: number | null;
      is_correct: boolean;
    }[] = [];
    for (const it of all) {
      max += it.questions.points;
      const sel = answers[it.questions.id];
      const ci = correctMap.get(it.questions.id);
      const ok = sel !== undefined && ci !== undefined && sel === ci;
      if (ok) {
        correctCount += 1;
        score += it.questions.points;
      }
      const isMath = it.module === "math1" || it.module === "math2";
      const bucket = isMath ? mathCorrect : rwCorrect;
      bucket.total += 1;
      if (ok) bucket.n += 1;

      answerRows.push({
        question_id: it.questions.id,
        selected_index: sel ?? null,
        is_correct: ok,
      });
    }
    const timeTaken = startedAt ? Math.round((Date.now() - startedAt) / 1000) : null;

    // SAT scaling — linear approximation, 200–800 per section
    const scaleSection = (n: number, total: number) =>
      total === 0 ? 200 : Math.round(200 + (n / total) * 600);
    const rwScaled = scaleSection(rwCorrect.n, rwCorrect.total);
    const mathScaled = scaleSection(mathCorrect.n, mathCorrect.total);
    const satScore = rwScaled + mathScaled;

    if (user) {
      const { data: a, error } = await supabase
        .from("attempts")
        .insert({
          user_id: user.id,
          test_id: mockId,
          score,
          max_score: max,
          correct_count: correctCount,
          total_count: all.length,
          time_taken_seconds: timeTaken,
          sat_score: satScore,
        } as any)
        .select("id")
        .single();
      if (error) {
        toast.error("Couldn't save your result: " + error.message);
        setStage("done");
        return;
      }
      await supabase
        .from("attempt_answers")
        .insert(answerRows.map((r) => ({ ...r, attempt_id: a.id })));
      toast.success(
        `SAT score: ${satScore} (RW ${rwScaled} / Math ${mathScaled}) — opening results.`,
      );
      navigate({ to: "/results/$attemptId", params: { attemptId: a.id } });
      return;
    }

    // Anonymous: just show summary
    toast.success(`Mock complete — SAT ${satScore} (RW ${rwScaled} / Math ${mathScaled}).`);
    setStage("done");
  }

  if (!mock) {
    return (
      <>
        <SiteNav />
        <div className="container mx-auto px-6 py-20">Loading…</div>
      </>
    );
  }

  if (!mock.published) {
    return (
      <>
        <SiteNav />
        <div className="container mx-auto max-w-md px-6 py-20 text-center">
          <p className="crest">Not available</p>
          <h1 className="font-display text-3xl mt-3">This mock isn't published.</h1>
          <Button asChild variant="outline" className="mt-6">
            <Link to="/mocks">Back to mocks</Link>
          </Button>
        </div>
      </>
    );
  }

  if (stage === "intro") {
    return (
      <>
        <SiteNav />
        <main className="container mx-auto max-w-3xl px-6 py-14">
          <p className="crest">Full Mock</p>
          <h1 className="font-display text-4xl rule-gold mt-3">{mock.title}</h1>
          {mock.description && <p className="mt-4 text-muted-foreground">{mock.description}</p>}

          <div className="mt-10 card-elegant p-6">
            <p className="crest mb-3">Section timing</p>
            <ul className="space-y-2 text-sm">
              {MODULES.map((m, i) => (
                <li key={m.key} className="flex justify-between border-b border-border/60 pb-2">
                  <span>{m.label}</span>
                  <span className="text-muted-foreground">
                    {m.minutes} min · {byModule[m.key].length} questions
                  </span>
                  {i === 1 && <span />}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground mt-4">
              A 10-minute break is offered between Reading &amp; Writing and Math.
            </p>
          </div>

          {!user ? (
            <div className="mt-8 card-elegant p-6">
              <p className="font-display text-xl">Sign in to take this mock</p>
              <p className="text-sm text-muted-foreground mt-1">
                Mock tests are timed and scored — you need an account so your result counts toward
                the leaderboard.
              </p>
              <Button asChild className="mt-5 bg-primary text-primary-foreground h-12 px-7">
                <Link to="/auth">Sign in to begin</Link>
              </Button>
            </div>
          ) : itemsLoading ? (
            <p className="mt-8 text-muted-foreground">Loading questions…</p>
          ) : items && items.length > 0 ? (
            <Button
              onClick={startMock}
              className="mt-8 bg-primary text-primary-foreground h-12 px-7"
            >
              Begin mock
            </Button>
          ) : (
            <div className="mt-8 card-elegant p-6">
              <p className="font-display text-xl">This mock has no questions yet.</p>
              <p className="text-sm text-muted-foreground mt-1">An administrator needs to attach questions.</p>
            </div>
          )}
        </main>
      </>
    );
  }

  if (stage === "break") {
    return (
      <>
        <SiteNav />
        <main className="container mx-auto max-w-2xl px-6 py-20 text-center">
          <p className="crest">Section break</p>
          <h1 className="font-display text-4xl rule-gold mt-3">Take a 10-minute break.</h1>
          <p className="mt-4 text-muted-foreground">Math begins when you're ready.</p>
          <Button onClick={endBreak} className="mt-8 bg-primary text-primary-foreground h-12 px-7">
            Start Math — Module 1
          </Button>
        </main>
      </>
    );
  }

  if (stage === "submitting") {
    return (
      <>
        <SiteNav />
        <div className="container mx-auto px-6 py-20 text-center text-muted-foreground">
          Scoring your mock…
        </div>
      </>
    );
  }

  if (stage === "done") {
    return (
      <>
        <SiteNav />
        <main className="container mx-auto max-w-2xl px-6 py-20 text-center">
          <p className="crest">Mock complete</p>
          <h1 className="font-display text-4xl rule-gold mt-3">Well sat.</h1>
          <p className="mt-4 text-muted-foreground">
            Sign in before your next attempt to save your score.
          </p>
          <div className="mt-8 flex gap-3 justify-center">
            <Button asChild variant="outline">
              <Link to="/mocks">More mocks</Link>
            </Button>
            <Button asChild className="bg-primary text-primary-foreground">
              <Link to="/auth">Sign in</Link>
            </Button>
          </div>
        </main>
      </>
    );
  }

  // stage === 'module'
  const mins = Math.floor(secondsLeft / 60)
    .toString()
    .padStart(2, "0");
  const secs = (secondsLeft % 60).toString().padStart(2, "0");

  return (
    <>
      <SiteNav />
      <main className="container mx-auto max-w-3xl px-6 py-10">
        <div className="flex items-center justify-between sticky top-16 bg-background/95 backdrop-blur py-3 z-30 border-b border-border">
          <div>
            <p className="crest">Module {moduleIdx + 1} of 4</p>
            <h2 className="font-display text-xl mt-1">{current.label}</h2>
          </div>
          <div className="text-right">
            <div
              className={`font-display text-3xl tabular-nums ${secondsLeft < 60 ? "text-destructive" : ""}`}
            >
              {mins}:{secs}
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-widest">Time left</div>
          </div>
        </div>

        {currentQs.length === 0 ? (
          <p className="mt-10 text-muted-foreground">This module has no questions. Skipping…</p>
        ) : (
          <ol className="mt-8 space-y-8">
            {currentQs.map((it, i) => {
              const q = it.questions;
              return (
                <li key={it.id} className="card-elegant p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant="outline" className="border-accent/40 text-accent bg-accent/5">
                      Q{i + 1}
                    </Badge>
                  </div>
                  {q.image_url && (
                    <img
                      src={q.image_url}
                      alt="Question illustration"
                      className="mb-4 max-h-64 w-full object-contain rounded border"
                    />
                  )}
                  <p className="font-display text-lg leading-snug whitespace-pre-wrap">
                    {q.prompt}
                  </p>
                  <div className="mt-5 space-y-2">
                    {q.choices.map((c, idx) => {
                      const picked = answers[q.id] === idx;
                      return (
                        <label
                          key={idx}
                          className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition-colors ${picked ? "border-foreground" : "border-border hover:border-foreground/40"}`}
                        >
                          <input
                            type="radio"
                            name={q.id}
                            checked={picked}
                            onChange={() => setAnswers((a) => ({ ...a, [q.id]: idx }))}
                            className="mt-1"
                          />
                          <span className="text-sm">
                            <b>{String.fromCharCode(65 + idx)}.</b> {c}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <div className="mt-10 flex justify-end">
          <Button onClick={advanceModule} className="bg-primary text-primary-foreground h-12 px-7">
            {moduleIdx === 3
              ? "Submit mock"
              : moduleIdx === 1
                ? "End module — take break"
                : "End module"}
          </Button>
        </div>
      </main>
    </>
  );
}
