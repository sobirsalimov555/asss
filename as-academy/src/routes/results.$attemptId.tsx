import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav, SiteFooter } from "@/components/site-nav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/results/$attemptId")({
  head: () => ({ meta: [{ title: "Result — AS Academy" }] }),
  component: ResultView,
});

type Answer = {
  id: string;
  question_id: string;
  selected_index: number | null;
  is_correct: boolean;
  questions: {
    id: string;
    prompt: string;
    choices: string[];
    correct_index: number;
    explanation: string | null;
    points: number;
    module: string | null;
    image_url: string | null;
  };
};

function ResultView() {
  const { attemptId } = Route.useParams();

  const { data: attempt } = useQuery({
    queryKey: ["attempt", attemptId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attempts")
        .select("*, profiles:user_id(display_name), mock_tests:test_id(title)")
        .eq("id", attemptId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: answers, isLoading: answersLoading } = useQuery({
    queryKey: ["attempt-answers", attemptId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attempt_answers")
        .select(
          "id, question_id, selected_index, is_correct, questions:question_id(id, prompt, choices, correct_index, explanation, points, module, image_url)",
        )
        .eq("attempt_id", attemptId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as Answer[];
    },
  });

  const isLoading = !attempt || answersLoading;
  const notFound = !isLoading && (!attempt || !answers);

  const rwAnswers = answers?.filter(
    (a) => a.questions.module === "rw1" || a.questions.module === "rw2",
  );
  const mathAnswers = answers?.filter(
    (a) => a.questions.module === "math1" || a.questions.module === "math2",
  );

  const rwCorrect = rwAnswers?.filter((a) => a.is_correct).length ?? 0;
  const rwTotal = rwAnswers?.length ?? 0;
  const mathCorrect = mathAnswers?.filter((a) => a.is_correct).length ?? 0;
  const mathTotal = mathAnswers?.length ?? 0;

  const scaleSection = (n: number, total: number) =>
    total === 0 ? 200 : Math.round(200 + (n / total) * 600);
  const rwScaled = scaleSection(rwCorrect, rwTotal);
  const mathScaled = scaleSection(mathCorrect, mathTotal);
  const satTotal = rwScaled + mathScaled;

  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav />
      <main className="container mx-auto max-w-4xl px-6 py-14 flex-1">
        {isLoading ? (
          <div className="text-center text-muted-foreground animate-pulse-soft py-20">
            Loading your results…
          </div>
        ) : notFound ? (
          <div className="text-center py-20">
            <p className="font-display text-4xl">Result not found</p>
            <Button asChild variant="outline" className="mt-6">
              <Link to="/mocks">Back to mocks</Link>
            </Button>
          </div>
        ) : (
          <div className="animate-fade-in">
            {/* Header */}
            <p className="crest">Your Result</p>
            <h1 className="font-display text-4xl md:text-5xl rule-gold mt-3">
              {attempt.mock_tests?.title ?? "Mock Test"}
            </h1>
            {attempt.profiles?.display_name && (
              <p className="mt-2 text-muted-foreground">
                by {attempt.profiles.display_name}
              </p>
            )}

            {/* SAT Score Hero */}
            <div className="mt-8 card-elegant p-8 md:p-10 text-center bg-primary text-primary-foreground border-primary">
              <p className="crest text-primary-foreground/60">SAT Score</p>
              <p className="font-display text-6xl md:text-7xl mt-2 tracking-tight">{satTotal}</p>
              <div className="mt-4 flex justify-center gap-8 text-sm">
                <div>
                  <p className="font-display text-2xl font-medium">{rwScaled}</p>
                  <p className="text-primary-foreground/60 text-xs uppercase tracking-widest mt-0.5">
                    Reading &amp; Writing
                  </p>
                </div>
                <div className="w-px bg-primary-foreground/20" />
                <div>
                  <p className="font-display text-2xl font-medium">{mathScaled}</p>
                  <p className="text-primary-foreground/60 text-xs uppercase tracking-widest mt-0.5">
                    Math
                  </p>
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard
                label="Correct"
                value={`${attempt.correct_count}/${attempt.total_count}`}
                accent
              />
              <StatCard
                label="Score"
                value={`${attempt.score}/${attempt.max_score}`}
              />
              <StatCard
                label="Accuracy"
                value={`${attempt.max_score > 0 ? Math.round((attempt.score / attempt.max_score) * 100) : 0}%`}
              />
              <StatCard
                label="Time"
                value={
                  attempt.time_taken_seconds
                    ? `${Math.floor(attempt.time_taken_seconds / 60)}m ${attempt.time_taken_seconds % 60}s`
                    : "—"
                }
              />
            </div>

            {/* Section Breakdown */}
            <div className="mt-10 grid md:grid-cols-2 gap-4">
              <div className="card-elegant p-6">
                <p className="crest text-accent">Reading &amp; Writing</p>
                <p className="font-display text-3xl mt-2">{rwCorrect}/{rwTotal}</p>
                <p className="text-xs text-muted-foreground mt-1">correct</p>
              </div>
              <div className="card-elegant p-6">
                <p className="crest text-accent">Math</p>
                <p className="font-display text-3xl mt-2">{mathCorrect}/{mathTotal}</p>
                <p className="text-xs text-muted-foreground mt-1">correct</p>
              </div>
            </div>

            {/* Question Review */}
            {answers && answers.length > 0 && (
              <>
                <h2 className="mt-14 font-display text-3xl rule-gold">Question Review</h2>
                <div className="mt-8 space-y-5">
                  {answers.map((a, i) => {
                    const q = a.questions;
                    const picked = a.selected_index;
                    const correct = a.is_correct;
                    return (
                      <div
                        key={a.id}
                        className={cn(
                          "card-elegant p-6 border-l-4",
                          correct
                            ? "border-l-correct"
                            : picked === null
                              ? "border-l-muted"
                              : "border-l-incorrect",
                        )}
                      >
                        <div className="flex items-center gap-2 mb-3">
                          <Badge
                            variant="outline"
                            className={
                              correct
                                ? "border-correct/40 text-correct bg-correct/5"
                                : "border-incorrect/40 text-incorrect bg-incorrect/5"
                            }
                          >
                            Q{i + 1}
                          </Badge>
                          <span
                            className={cn(
                              "text-xs font-medium",
                              correct
                                ? "text-correct"
                                : picked === null
                                  ? "text-muted-foreground"
                                  : "text-incorrect",
                            )}
                          >
                            {correct ? "Correct" : picked === null ? "Skipped" : "Incorrect"}
                          </span>
                          {q.module && (
                            <span className="text-xs text-muted-foreground ml-auto">
                              {q.module === "rw1" || q.module === "rw2" ? "RW" : "Math"}
                            </span>
                          )}
                        </div>

                        {q.image_url && (
                          <img
                            src={q.image_url}
                            alt="Question illustration"
                            className="mb-4 max-h-64 w-full object-contain rounded border"
                          />
                        )}

                        <p className="font-question text-lg leading-relaxed">{q.prompt}</p>

                        <div className="mt-4 space-y-1.5">
                          {q.choices.map((c, idx) => {
                            const isCorrectChoice = idx === q.correct_index;
                            const isPicked = idx === picked;
                            return (
                              <div
                                key={idx}
                                className={cn(
                                  "flex items-start gap-3 p-3 rounded text-sm",
                                  isCorrectChoice
                                    ? "bg-correct/10 text-foreground"
                                    : isPicked && !isCorrectChoice
                                      ? "bg-incorrect/10 text-foreground"
                                      : "text-muted-foreground",
                                )}
                              >
                                <span
                                  className={cn(
                                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium shrink-0",
                                    isCorrectChoice
                                      ? "bg-correct text-white"
                                      : isPicked && !isCorrectChoice
                                        ? "bg-incorrect text-white"
                                        : "bg-muted text-muted-foreground",
                                  )}
                                >
                                  {String.fromCharCode(65 + idx)}
                                </span>
                                <span className="pt-0.5">{c}</span>
                              </div>
                            );
                          })}
                        </div>

                        {q.explanation && (
                          <div className="mt-4 border-l-2 border-accent pl-4">
                            <p className="crest mb-1">Explanation</p>
                            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                              {q.explanation}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Actions */}
            <div className="mt-12 flex gap-4 justify-center">
              <Button asChild variant="outline" size="lg">
                <Link to="/mocks">More mocks</Link>
              </Button>
              <Button asChild size="lg" className="bg-primary text-primary-foreground">
                <Link to="/leaderboard">Leaderboard</Link>
              </Button>
            </div>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="card-elegant p-5 text-center">
      <div className={cn("font-display text-2xl md:text-3xl", accent && "text-accent")}>
        {value}
      </div>
      <div className="crest mt-1">{label}</div>
    </div>
  );
}
