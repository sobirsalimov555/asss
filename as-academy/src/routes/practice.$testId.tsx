import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav } from "@/components/site-nav";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/practice/$testId")({
  head: () => ({ meta: [{ title: "Test — AS Academy" }] }),
  component: TakeTest,
});

interface Question {
  id: string;
  position: number;
  prompt: string;
  choices: string[];
  points: number;
  image_url: string | null;
}

interface GradedQuestion extends Question {
  correct_index: number;
  explanation: string | null;
}

function TakeTest() {
  const { testId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["test", testId],
    queryFn: async () => {
      const [{ data: test, error: te }, { data: qs, error: qe }] = await Promise.all([
        supabase
          .from("mock_tests")
          .select("*")
          .eq("id", testId)
          .eq("published", true)
          .maybeSingle(),
        supabase
          .from("questions")
          .select("id, position, prompt, choices, points, image_url")
          .eq("test_id", testId)
          .order("position"),
      ]);
      if (te) throw te;
      if (qe) throw qe;
      return { test, questions: (qs ?? []) as Question[] };
    },
  });

  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [gradedQs, setGradedQs] = useState<GradedQuestion[]>([]);
  const [result, setResult] = useState<{
    correct: number;
    score: number;
    max: number;
    total: number;
  } | null>(null);
  const [startedAt] = useState(() => Date.now());
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!data?.test || submitted) return;
    setRemaining(data.test.duration_minutes * 60);
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r === null) return r;
        if (r <= 1) {
          clearInterval(id);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [data?.test, submitted]);

  async function handleSubmit() {
    if (!data || submitting) return;
    if (!user) {
      toast.error("Sign in to grade and save your results.");
      return;
    }
    setSubmitting(true);
    try {
      const qIds = data.questions.map((q) => q.id);
      const { data: keys, error: ke } = qIds.length
        ? await supabase.from("questions").select("id, correct_index, explanation").in("id", qIds)
        : { data: [], error: null as any };
      if (ke) throw ke;
      const keyMap = new Map<string, { correct_index: number; explanation: string | null }>();
      for (const k of (keys ?? []) as {
        id: string;
        correct_index: number;
        explanation: string | null;
      }[]) {
        keyMap.set(k.id, { correct_index: k.correct_index, explanation: k.explanation });
      }
      const graded: GradedQuestion[] = data.questions.map((q) => ({
        ...q,
        correct_index: keyMap.get(q.id)?.correct_index ?? -1,
        explanation: keyMap.get(q.id)?.explanation ?? null,
      }));
      setGradedQs(graded);

      let correct = 0;
      let score = 0;
      let max = 0;
      for (const q of graded) {
        max += q.points;
        if (answers[q.id] === q.correct_index) {
          correct += 1;
          score += q.points;
        }
      }
      const computed = { correct, score, max, total: graded.length };
      setResult(computed);
      setSubmitted(true);

      const timeTaken = Math.floor((Date.now() - startedAt) / 1000);
      const { data: attempt, error } = await supabase
        .from("attempts")
        .insert({
          user_id: user.id,
          test_id: testId,
          score: computed.score,
          max_score: computed.max,
          correct_count: computed.correct,
          total_count: computed.total,
          time_taken_seconds: timeTaken,
        })
        .select("id")
        .single();
      if (error) throw error;
      setAttemptId(attempt.id);
      const rows = graded.map((q) => ({
        attempt_id: attempt.id,
        question_id: q.id,
        selected_index: answers[q.id] ?? null,
        is_correct: answers[q.id] === q.correct_index,
      }));
      if (rows.length) await supabase.from("attempt_answers").insert(rows);
      toast.success("Saved to your record");
    } catch (e: any) {
      toast.error(e.message ?? "Could not save result");
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading)
    return (
      <>
        <SiteNav />
        <div className="container mx-auto max-w-3xl px-6 py-20">Loading…</div>
      </>
    );
  if (!data?.test)
    return (
      <>
        <SiteNav />
        <div className="container mx-auto max-w-3xl px-6 py-20">
          Test not found.{" "}
          <Link to="/practice" className="text-accent underline">
            Back
          </Link>
        </div>
      </>
    );

  if (submitted) {
    return (
      <>
        <SiteNav />
        <main className="container mx-auto max-w-3xl px-6 py-14">
          <p className="crest">Result</p>
          <h1 className="font-display text-4xl rule-gold mt-3">{data.test.title}</h1>
          <div className="mt-8 card-elegant p-8">
            <div className="grid grid-cols-3 gap-6">
              <Cell big={`${result!.correct}/${result!.total}`} label="Correct" />
              <Cell big={`${result!.score}`} label={`/ ${result!.max} points`} />
              <Cell
                big={`${Math.round((result!.correct / Math.max(result!.total, 1)) * 100)}%`}
                label="Accuracy"
              />
            </div>
            {!user && (
              <p className="mt-6 text-sm text-muted-foreground">
                <Link to="/auth" className="text-accent underline">
                  Sign in
                </Link>{" "}
                next time to save your score and appear on the leaderboard.
              </p>
            )}
          </div>

          <h2 className="mt-12 font-display text-2xl">Review</h2>
          <div className="mt-5 space-y-5">
            {gradedQs.map((q, i) => {
              const picked = answers[q.id];
              const correct = picked === q.correct_index;
              return (
                <div key={q.id} className="card-elegant p-6">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="crest">Q{i + 1}</span>
                    <span className={correct ? "text-accent" : "text-destructive"}>
                      {correct ? "Correct" : picked === undefined ? "Skipped" : "Incorrect"}
                    </span>
                  </div>
                  {q.image_url && (
                    <img
                      src={q.image_url}
                      alt="Question illustration"
                      className="mt-3 max-h-64 w-full object-contain rounded border"
                    />
                  )}
                  <p className="mt-3 font-serif text-lg">{q.prompt}</p>
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {q.choices.map((c, idx) => (
                      <li
                        key={idx}
                        className={
                          idx === q.correct_index
                            ? "text-accent font-medium"
                            : idx === picked
                              ? "text-destructive"
                              : "text-muted-foreground"
                        }
                      >
                        {String.fromCharCode(65 + idx)}. {c}
                      </li>
                    ))}
                  </ul>
                  {q.explanation && (
                    <p className="mt-3 text-sm text-muted-foreground italic">{q.explanation}</p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-10 flex gap-3">
            <Button asChild className="bg-primary text-primary-foreground">
              <Link to="/practice">More tests</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/leaderboard">Leaderboard</Link>
            </Button>
            {attemptId && (
              <Button asChild variant="ghost">
                <Link to="/results/$attemptId" params={{ attemptId }}>
                  Share-able link
                </Link>
              </Button>
            )}
          </div>
        </main>
      </>
    );
  }

  const mm = remaining !== null ? Math.floor(remaining / 60) : 0;
  const ss = remaining !== null ? remaining % 60 : 0;

  return (
    <>
      <SiteNav />
      <main className="container mx-auto max-w-3xl px-6 py-12">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="crest">{data.test.kind.replace("_", " ")}</p>
            <h1 className="font-display text-3xl md:text-4xl mt-2">{data.test.title}</h1>
            {data.test.description && (
              <p className="mt-2 text-sm text-muted-foreground">{data.test.description}</p>
            )}
          </div>
          {remaining !== null && (
            <div className="text-right shrink-0">
              <div className="crest">Time left</div>
              <div className="font-display text-2xl tabular-nums">
                {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
              </div>
            </div>
          )}
        </div>

        {data.questions.length === 0 ? (
          <p className="mt-12 text-muted-foreground">No questions in this test yet.</p>
        ) : (
          <div className="mt-10 space-y-6">
            {data.questions.map((q, i) => (
              <fieldset key={q.id} className="card-elegant p-6">
                <legend className="crest px-2 -ml-2">Question {i + 1}</legend>
                {q.image_url && (
                  <img
                    src={q.image_url}
                    alt="Question illustration"
                    className="mb-4 max-h-64 w-full object-contain rounded border"
                  />
                )}
                <p className="font-serif text-lg leading-relaxed">{q.prompt}</p>
                <div className="mt-4 space-y-2">
                  {q.choices.map((c, idx) => {
                    const picked = answers[q.id] === idx;
                    return (
                      <label
                        key={idx}
                        className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition ${picked ? "border-accent bg-accent/10" : "border-border hover:border-accent/50"}`}
                      >
                        <input
                          type="radio"
                          name={q.id}
                          checked={picked}
                          onChange={() => setAnswers((a) => ({ ...a, [q.id]: idx }))}
                          className="mt-1 accent-current"
                        />
                        <span className="text-sm">
                          <b className="font-semibold mr-2">{String.fromCharCode(65 + idx)}.</b>
                          {c}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}

            <div className="flex items-center justify-between gap-4 pt-2">
              <p className="text-xs text-muted-foreground">
                {Object.keys(answers).length}/{data.questions.length} answered
                {!user && " · Not signed in — score won't be saved"}
              </p>
              <Button
                onClick={handleSubmit}
                disabled={submitting}
                className="bg-primary text-primary-foreground h-11 px-7"
              >
                Submit test
              </Button>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

function Cell({ big, label }: { big: string; label: string }) {
  return (
    <div>
      <div className="font-display text-4xl">{big}</div>
      <div className="text-xs uppercase tracking-widest text-muted-foreground mt-1">{label}</div>
    </div>
  );
}
