import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav } from "@/components/site-nav";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/mocks/$mockId")({
  head: () => ({ meta: [{ title: "Mock Test — AS Academy" }] }),
  component: TakeMock,
});

const MODULES = [
  { key: "rw1" as const, label: "Reading & Writing — Module 1", minutes: 32 },
  { key: "rw2" as const, label: "Reading & Writing — Module 2", minutes: 32 },
  { key: "math1" as const, label: "Math — Module 1", minutes: 35 },
  { key: "math2" as const, label: "Math — Module 2", minutes: 35 },
];

type ModuleKey = (typeof MODULES)[number]["key"];
type Stage = "intro" | "module" | "break" | "confirm" | "submitting" | "done";

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

  const [stage, setStage] = useState<Stage>("intro");
  const [moduleIdx, setModuleIdx] = useState(0);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const moduleIdxRef = useRef(moduleIdx);
  moduleIdxRef.current = moduleIdx;

  const currentModule = MODULES[moduleIdx];
  const currentQs = byModule[currentModule.key];
  const totalQs = currentQs.length;
  const answeredCount = currentQs.filter((q) => answers[q.questions.id] !== undefined).length;
  const allAnswered = answeredCount === totalQs;

  const advanceModule = useCallback(() => {
    const idx = moduleIdxRef.current;
    if (idx === 1) {
      setStage("break");
      return;
    }
    if (idx >= 3) {
      setShowConfirm(true);
      return;
    }
    const next = idx + 1;
    setModuleIdx(next);
    setCurrentQ(0);
    setSecondsLeft(MODULES[next].minutes * 60);
    setStage("module");
  }, []);

  const timerEffect = useCallback(() => {
    if (secondsLeft <= 0) {
      advanceModule();
      return false;
    }
    return true;
  }, [secondsLeft, advanceModule]);

  useEffect(() => {
    if (stage !== "module") return;
    const ok = timerEffect();
    if (!ok) return;
    const id = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [stage, timerEffect]);

  function startMock() {
    if (!items || items.length === 0) {
      toast.error("This mock has no questions yet.");
      return;
    }
    setStartedAt(Date.now());
    setModuleIdx(0);
    setCurrentQ(0);
    setSecondsLeft(MODULES[0].minutes * 60);
    setStage("module");
  }

  function endBreak() {
    setModuleIdx(2);
    setCurrentQ(0);
    setSecondsLeft(MODULES[2].minutes * 60);
    setStage("module");
  }

  function goToQuestion(idx: number) {
    setCurrentQ(Math.max(0, Math.min(idx, totalQs - 1)));
  }

  function selectAnswer(questionId: string, choiceIdx: number) {
    setAnswers((a) => ({ ...a, [questionId]: choiceIdx }));
  }

  async function finalize() {
    setStage("submitting");
    setShowConfirm(false);
    const all = items ?? [];

    const qIds = all.map((it) => it.questions.id);
    const { data: answerRows, error: ansErr } = qIds.length
      ? await supabase.from("questions").select("id, correct_index").in("id", qIds)
      : { data: [], error: null as any };
    if (ansErr) {
      toast.error("Couldn't grade your mock: " + ansErr.message);
      setStage("done");
      return;
    }
    const correctMap = new Map<string, number>();
    for (const r of (answerRows ?? []) as { id: string; correct_index: number }[]) {
      correctMap.set(r.id, r.correct_index);
    }

    const rwCorrect = { n: 0, total: 0 };
    const mathCorrect = { n: 0, total: 0 };

    let correctCount = 0;
    let score = 0;
    let max = 0;
    const answerRowsInsert: { question_id: string; selected_index: number | null; is_correct: boolean }[] = [];
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
      answerRowsInsert.push({
        question_id: it.questions.id,
        selected_index: sel ?? null,
        is_correct: ok,
      });
    }
    const timeTaken = startedAt ? Math.round((Date.now() - startedAt) / 1000) : null;

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
        .insert(answerRowsInsert.map((r) => ({ ...r, attempt_id: a.id })));
      toast.success(`SAT score: ${satScore} (RW ${rwScaled} / Math ${mathScaled})`);
      navigate({ to: "/results/$attemptId", params: { attemptId: a.id } });
      return;
    }

    toast.success(`Mock complete — SAT ${satScore} (RW ${rwScaled} / Math ${mathScaled}). Sign in to save your score.`);
    setStage("done");
  }

  // --- Intro stage ---
  if (!mock) {
    return (
      <>
        <SiteNav />
        <div className="container mx-auto px-6 py-20 text-center text-muted-foreground">Loading…</div>
      </>
    );
  }

  if (!mock.published || mock.kind !== "full_mock") {
    return (
      <>
        <SiteNav />
        <div className="container mx-auto max-w-md px-6 py-20 text-center">
          <p className="crest">Not available</p>
          <h1 className="font-display text-3xl mt-3">This mock isn't available.</h1>
          <Button asChild variant="outline" className="mt-6">
            <Link to="/mocks">Back to mocks</Link>
          </Button>
        </div>
      </>
    );
  }

  if (stage === "intro") {
    const totalQCount = items?.length ?? 0;
    return (
      <>
        <SiteNav />
        <main className="container mx-auto max-w-3xl px-6 py-14 animate-fade-in">
          <p className="crest">Full Mock Test</p>
          <h1 className="font-display text-4xl md:text-5xl rule-gold mt-3">{mock.title}</h1>
          {mock.description && <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">{mock.description}</p>}

          <div className="mt-8 space-y-4">
            {MODULES.map((m, i) => {
              const qs = byModule[m.key];
              return (
                <div key={m.key} className="card-elegant p-5 flex items-center justify-between">
                  <div>
                    <p className="font-serif text-base font-medium">{m.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{m.minutes} minutes</p>
                  </div>
                  <Badge variant="outline" className="border-accent/40 text-accent bg-accent/5 shrink-0">
                    {qs.length} questions
                  </Badge>
                </div>
              );
            })}
          </div>

          <div className="mt-6 card-elegant p-5 bg-accent/5 border-accent/20">
            <p className="font-serif font-medium">A 10-minute break is offered between the Reading &amp; Writing and Math sections.</p>
            {totalQCount > 0 && <p className="text-sm text-muted-foreground mt-1">{totalQCount} questions total across 4 modules.</p>}
          </div>

          {!user ? (
            <div className="mt-8 card-elegant p-6 text-center">
              <p className="font-serif text-xl">Sign in to take this mock</p>
              <p className="text-sm text-muted-foreground mt-1">Your score will be saved and you'll appear on the leaderboard.</p>
              <Button asChild className="mt-5 bg-primary text-primary-foreground h-12 px-8 text-base">
                <Link to="/auth">Sign in to begin</Link>
              </Button>
            </div>
          ) : itemsLoading ? (
            <p className="mt-8 text-muted-foreground animate-pulse-soft">Loading questions…</p>
          ) : items && items.length > 0 ? (
            <Button
              onClick={startMock}
              className="mt-8 bg-primary text-primary-foreground h-13 px-10 text-base"
            >
              Begin mock
            </Button>
          ) : (
            <div className="mt-8 card-elegant p-6 text-center">
              <p className="font-serif text-xl">This mock has no questions yet.</p>
              <p className="text-sm text-muted-foreground mt-1">An administrator needs to attach questions first.</p>
            </div>
          )}
        </main>
      </>
    );
  }

  // --- Break stage ---
  if (stage === "break") {
    return (
      <>
        <SiteNav />
        <main className="container mx-auto max-w-2xl px-6 py-20 text-center animate-fade-in">
          <p className="crest">Section Break</p>
          <h1 className="font-display text-4xl md:text-5xl rule-gold mt-3">Take a 10-minute break.</h1>
          <p className="mt-4 text-muted-foreground text-lg">The Math section begins when you're ready.</p>
          <div className="mt-6 text-5xl font-display text-accent animate-pulse-soft">10:00</div>
          <p className="text-xs text-muted-foreground mt-2 uppercase tracking-widest">Minutes</p>
          <Button
            onClick={endBreak}
            className="mt-10 bg-primary text-primary-foreground h-13 px-10 text-base"
          >
            Start Math — Module 1
          </Button>
        </main>
      </>
    );
  }

  // --- Submitting stage ---
  if (stage === "submitting") {
    return (
      <>
        <SiteNav />
        <div className="container mx-auto px-6 py-20 text-center">
          <div className="font-display text-2xl text-muted-foreground animate-pulse-soft">Scoring your mock…</div>
        </div>
      </>
    );
  }

  // --- Done stage ---
  if (stage === "done") {
    return (
      <>
        <SiteNav />
        <main className="container mx-auto max-w-2xl px-6 py-20 text-center animate-fade-in">
          <p className="crest">Mock Complete</p>
          <h1 className="font-display text-4xl md:text-5xl rule-gold mt-3">Well sat.</h1>
          <p className="mt-4 text-muted-foreground text-lg">Sign in before your next attempt to save your score and climb the leaderboard.</p>
          <div className="mt-10 flex gap-4 justify-center">
            <Button asChild variant="outline" size="lg">
              <Link to="/mocks">More mocks</Link>
            </Button>
            <Button asChild size="lg" className="bg-primary text-primary-foreground">
              <Link to="/auth">Sign in</Link>
            </Button>
          </div>
        </main>
      </>
    );
  }

  // --- Confirm submit overlay ---
  if (showConfirm) {
    const unanswered = totalQs - answeredCount;
    return (
      <>
        <SiteNav />
        <main className="container mx-auto max-w-lg px-6 py-20 text-center animate-fade-in">
          <p className="crest">Submit mock?</p>
          <h1 className="font-display text-3xl rule-gold mt-3">Are you ready to submit?</h1>
          {unanswered > 0 ? (
            <p className="mt-4 text-muted-foreground">
              You have <span className="text-destructive font-medium">{unanswered}</span> unanswered question{unanswered === 1 ? "" : "s"} out of {totalQs}.
            </p>
          ) : (
            <p className="mt-4 text-muted-foreground">All questions answered. Ready to see your score.</p>
          )}
          <div className="mt-10 flex gap-4 justify-center">
            <Button variant="outline" size="lg" onClick={() => setShowConfirm(false)}>
              Go back
            </Button>
            <Button size="lg" className="bg-primary text-primary-foreground" onClick={finalize}>
              Yes, submit mock
            </Button>
          </div>
        </main>
      </>
    );
  }

  // --- Module stage ---
  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const q = currentQs[currentQ];
  const isLastModule = moduleIdx === 3;

  return (
    <>
      <SiteNav />
      <main className="container mx-auto max-w-4xl px-4 md:px-6 py-6 animate-fade-in">
        {/* Top bar: module info + timer */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
          <div>
            <p className="crest">Module {moduleIdx + 1} of 4</p>
            <h2 className="font-serif text-lg font-medium mt-0.5">{currentModule.label}</h2>
          </div>
          <div className="text-right">
            <div
              className={cn(
                "font-display text-3xl md:text-4xl tabular-nums tracking-tight",
                secondsLeft < 60 ? "text-destructive animate-pulse-soft" : "",
              )}
            >
              {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
            </div>
            <div className="crest mt-0.5">Time remaining</div>
          </div>
        </div>

        <div className="flex gap-8">
          {/* Question grid sidebar */}
          <aside className="hidden md:block w-48 shrink-0">
            <div className="sticky top-24">
              <p className="crest mb-3">
                {answeredCount}/{totalQs} answered
              </p>
              <div className="grid grid-cols-5 gap-1.5">
                {currentQs.map((it, i) => {
                  const isAnswered = answers[it.questions.id] !== undefined;
                  const isCurrent = i === currentQ;
                  return (
                    <button
                      key={it.id}
                      onClick={() => goToQuestion(i)}
                      className={cn(
                        "w-8 h-8 rounded text-xs font-medium transition-colors",
                        isCurrent
                          ? "bg-primary text-primary-foreground ring-2 ring-accent"
                          : isAnswered
                            ? "bg-accent/20 text-foreground border border-accent/40"
                            : "bg-muted text-muted-foreground border border-border hover:border-accent/50",
                      )}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>

              {/* Module progress */}
              <div className="mt-6">
                <p className="crest mb-2">Modules</p>
                <div className="space-y-1.5">
                  {MODULES.map((m, i) => (
                    <div
                      key={m.key}
                      className={cn(
                        "flex items-center gap-2 text-xs",
                        i === moduleIdx ? "text-foreground font-medium" : i < moduleIdx ? "text-accent" : "text-muted-foreground",
                      )}
                    >
                      <div
                        className={cn(
                          "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium",
                          i === moduleIdx
                            ? "bg-primary text-primary-foreground"
                            : i < moduleIdx
                              ? "bg-accent/20 text-accent border border-accent/40"
                              : "bg-muted text-muted-foreground border border-border",
                        )}
                      >
                        {i < moduleIdx ? "✓" : i + 1}
                      </div>
                      {m.label.replace(" — Module " + (i + 1), "")}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          {/* Question display */}
          <section className="flex-1 min-w-0">
            {q ? (
              <div key={q.id} className="animate-slide-up">
                {/* Question header */}
                <div className="flex items-center gap-3 mb-5">
                  <Badge variant="outline" className="border-accent/40 text-accent bg-accent/5 text-xs px-3">
                    Question {currentQ + 1} of {totalQs}
                  </Badge>
                  {answers[q.questions.id] !== undefined && (
                    <Badge variant="outline" className="border-correct/40 text-correct bg-correct/5 text-xs">
                      Answered
                    </Badge>
                  )}
                </div>

                {/* Image */}
                {q.questions.image_url && (
                  <img
                    src={q.questions.image_url}
                    alt="Question illustration"
                    className="mb-5 max-h-72 w-full object-contain rounded-lg border border-border"
                  />
                )}

                {/* Prompt - EB Garamond */}
                <p className="font-question text-lg md:text-xl leading-relaxed whitespace-pre-wrap">
                  {q.questions.prompt}
                </p>

                {/* Choices */}
                <div className="mt-6 space-y-3">
                  {q.questions.choices.map((c, idx) => {
                    const picked = answers[q.questions.id] === idx;
                    return (
                      <label
                        key={idx}
                        className={cn(
                          "flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all duration-150",
                          picked
                            ? "border-accent bg-accent/8 shadow-sm"
                            : "border-border hover:border-accent/50 hover:bg-muted/30",
                        )}
                      >
                        <div
                          className={cn(
                            "w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium shrink-0 transition-colors",
                            picked
                              ? "bg-accent text-accent-foreground"
                              : "bg-muted text-muted-foreground border border-border",
                          )}
                        >
                          {String.fromCharCode(65 + idx)}
                        </div>
                        <span className="font-question text-base md:text-lg leading-relaxed pt-1">
                          {c}
                        </span>
                        <input
                          type="radio"
                          name={q.questions.id}
                          checked={picked}
                          onChange={() => selectAnswer(q.questions.id, idx)}
                          className="sr-only"
                        />
                      </label>
                    );
                  })}
                </div>

                {/* Navigation */}
                <div className="mt-8 flex items-center justify-between">
                  <Button
                    variant="outline"
                    onClick={() => goToQuestion(currentQ - 1)}
                    disabled={currentQ === 0}
                    className="px-6"
                  >
                    ← Previous
                  </Button>

                  <div className="flex items-center gap-2">
                    {currentQ < totalQs - 1 ? (
                      <Button
                        onClick={() => goToQuestion(currentQ + 1)}
                        className="bg-primary text-primary-foreground px-6"
                      >
                        Next →
                      </Button>
                    ) : (
                      <Button
                        onClick={advanceModule}
                        className={cn(
                          "px-8",
                          isLastModule
                            ? "bg-accent text-accent-foreground hover:opacity-90"
                            : "bg-primary text-primary-foreground",
                        )}
                      >
                        {isLastModule ? "Submit mock" : moduleIdx === 1 ? "End module — break" : "End module"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="card-elegant p-10 text-center">
                <p className="font-serif text-xl text-muted-foreground">This module has no questions.</p>
                <Button onClick={advanceModule} className="mt-6 bg-primary text-primary-foreground">
                  Continue
                </Button>
              </div>
            )}
          </section>
        </div>

        {/* Mobile: progress bar at bottom */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border px-4 py-3 z-30">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span>Question {currentQ + 1} of {totalQs}</span>
            <span>{answeredCount} answered</span>
          </div>
          <div className="flex gap-1">
            {currentQs.map((it, i) => (
              <button
                key={it.id}
                onClick={() => goToQuestion(i)}
                className={cn(
                  "flex-1 h-1.5 rounded-full transition-colors",
                  i === currentQ
                    ? "bg-primary"
                    : answers[it.questions.id] !== undefined
                      ? "bg-accent/60"
                      : "bg-muted",
                )}
              />
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
