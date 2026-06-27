import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav, SiteFooter } from "@/components/site-nav";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/practice")({
  head: () => ({
    meta: [
      { title: "Question Bank — AS Academy" },
      {
        name: "description",
        content:
          "Browse and practice individual SAT questions by subject — Math, Reading, or Grammar. Instant feedback. No sign-up required.",
      },
    ],
  }),
  component: QuestionBank,
});

const SUBJECT_LABEL: Record<string, string> = {
  math: "Math",
  reading: "Reading",
  grammar: "Grammar",
};

type BankQuestion = {
  id: string;
  prompt: string;
  choices: string[];
  subject: string | null;
  topic: string | null;
  difficulty: string | null;
  image_url: string | null;
};

function QuestionBank() {
  const { user } = useAuth();
  const [subjectF, setSubjectF] = useState<string>("all");
  const [diffF, setDiffF] = useState<string>("all");
  const [topicF, setTopicF] = useState<string>("all");
  const [activeId, setActiveId] = useState<string | null>(null);

  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);

  const { data: questions, isLoading } = useQuery({
    queryKey: ["bank-questions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("questions")
        .select("id, prompt, choices, subject, topic, difficulty, image_url")
        .eq("in_bank", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BankQuestion[];
    },
  });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("bank_practice")
        .select("is_correct")
        .eq("user_id", user.id);
      if (!data) return;
      setCorrect(data.filter((r) => r.is_correct).length);
      setWrong(data.filter((r) => !r.is_correct).length);
    })();
  }, [user]);

  const topics = useMemo(() => {
    const s = new Set<string>();
    questions?.forEach((q) => q.topic && s.add(q.topic));
    return Array.from(s).sort();
  }, [questions]);

  const filtered = useMemo(() => {
    return (questions ?? []).filter((q) => {
      if (subjectF !== "all" && q.subject !== subjectF) return false;
      if (diffF !== "all" && q.difficulty !== diffF) return false;
      if (topicF !== "all" && q.topic !== topicF) return false;
      return true;
    });
  }, [questions, subjectF, diffF, topicF]);

  const active = filtered.find((q) => q.id === activeId) ?? null;

  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav />
      <main className="container mx-auto max-w-6xl px-6 py-14 flex-1">
        <p className="crest">Question Bank</p>
        <h1 className="font-display text-5xl rule-gold mt-3">Practice, one question at a time</h1>
        <p className="mt-4 text-muted-foreground max-w-2xl">
          Filter by subject, topic, or difficulty. Browse freely —{" "}
          {user ? (
            "your progress is saved as you attempt."
          ) : (
            <>
              <Link to="/auth" className="text-accent underline">
                sign in
              </Link>{" "}
              to attempt questions and track your stats.
            </>
          )}
        </p>

        <div className="mt-8 grid grid-cols-3 gap-4 max-w-md">
          <Counter label="Correct" value={correct} tone="accent" />
          <Counter label="Wrong" value={wrong} tone="destructive" />
          <Counter label="Total" value={correct + wrong} tone="muted" />
        </div>

        <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-3xl">
          <Select value={subjectF} onValueChange={setSubjectF}>
            <SelectTrigger>
              <SelectValue placeholder="Subject" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All subjects</SelectItem>
              <SelectItem value="math">Math</SelectItem>
              <SelectItem value="reading">Reading</SelectItem>
              <SelectItem value="grammar">Grammar</SelectItem>
            </SelectContent>
          </Select>
          <Select value={diffF} onValueChange={setDiffF}>
            <SelectTrigger>
              <SelectValue placeholder="Difficulty" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All difficulties</SelectItem>
              <SelectItem value="easy">Easy</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="hard">Hard</SelectItem>
            </SelectContent>
          </Select>
          <Select value={topicF} onValueChange={setTopicF}>
            <SelectTrigger>
              <SelectValue placeholder="Topic" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All topics</SelectItem>
              {topics.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-10 grid lg:grid-cols-[1fr_1.4fr] gap-8">
          <section>
            <p className="crest mb-3">
              {filtered.length} question{filtered.length === 1 ? "" : "s"}
            </p>
            {isLoading ? (
              <p className="text-muted-foreground text-sm">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="text-muted-foreground text-sm">No questions match these filters.</p>
            ) : (
              <ul className="space-y-2 max-h-[70vh] overflow-y-auto pr-2">
                {filtered.map((q, i) => (
                  <li key={q.id}>
                    <button
                      onClick={() => setActiveId(q.id)}
                      className={`w-full text-left card-elegant p-4 transition-colors ${activeId === q.id ? "ring-2 ring-accent" : ""}`}
                    >
                      <div className="flex items-center gap-2 text-xs mb-2">
                        {q.subject && (
                          <Badge
                            variant="outline"
                            className="border-accent/40 text-accent bg-accent/5"
                          >
                            {SUBJECT_LABEL[q.subject] ?? q.subject}
                          </Badge>
                        )}
                        {q.difficulty && (
                          <span className="text-muted-foreground capitalize">{q.difficulty}</span>
                        )}
                        {q.topic && <span className="text-muted-foreground">· {q.topic}</span>}
                      </div>
                      <p className="text-sm line-clamp-2">
                        <b>Q{i + 1}.</b> {q.prompt}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            {active ? (
              user ? (
                <QuestionAttempt
                  question={active}
                  onResult={async (isCorrect, selected) => {
                    if (isCorrect) setCorrect((n) => n + 1);
                    else setWrong((n) => n + 1);
                    await supabase.from("bank_practice").insert({
                      user_id: user.id,
                      question_id: active.id,
                      selected_index: selected,
                      is_correct: isCorrect,
                    });
                  }}
                />
              ) : (
                <QuestionPreview question={active} />
              )
            ) : (
              <div className="card-elegant p-10 text-center text-muted-foreground">
                <p className="font-display text-2xl text-foreground">Pick a question to begin.</p>
                <p className="text-sm mt-2">Use the filters or scroll the list on the left.</p>
              </div>
            )}
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function Counter({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "accent" | "destructive" | "muted";
}) {
  const color =
    tone === "accent"
      ? "text-accent"
      : tone === "destructive"
        ? "text-destructive"
        : "text-foreground";
  return (
    <div className="card-elegant p-4">
      <div className={`font-display text-3xl ${color}`}>{value}</div>
      <div className="text-xs uppercase tracking-widest text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function QuestionPreview({ question }: { question: BankQuestion }) {
  return (
    <article className="card-elegant p-7">
      <div className="flex flex-wrap items-center gap-2 text-xs mb-3">
        {question.subject && (
          <Badge variant="outline" className="border-accent/40 text-accent bg-accent/5">
            {SUBJECT_LABEL[question.subject] ?? question.subject}
          </Badge>
        )}
        {question.difficulty && (
          <span className="text-muted-foreground capitalize">{question.difficulty}</span>
        )}
        {question.topic && <span className="text-muted-foreground">· {question.topic}</span>}
      </div>
      {question.image_url && (
        <img
          src={question.image_url}
          alt="Question illustration"
          className="mb-4 max-h-64 w-full object-contain rounded border"
        />
      )}
      <p className="font-display text-xl leading-snug whitespace-pre-wrap">{question.prompt}</p>

      <div className="mt-6 space-y-2">
        {question.choices.map((c, i) => (
          <div
            key={i}
            className="w-full text-left flex items-start gap-3 p-4 rounded border border-border opacity-80"
          >
            <span className="font-display text-sm w-6 shrink-0">
              {String.fromCharCode(65 + i)}.
            </span>
            <span className="text-sm">{c}</span>
          </div>
        ))}
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <p className="font-display text-lg">Sign in to attempt this question</p>
        <p className="text-sm text-muted-foreground mt-1">
          You can browse the bank without an account, but answering and tracking results requires
          sign-in.
        </p>
        <Button asChild className="mt-4 bg-primary text-primary-foreground">
          <Link to="/auth">Sign in to answer</Link>
        </Button>
      </div>
    </article>
  );
}

function QuestionAttempt({
  question,
  onResult,
}: {
  question: BankQuestion;
  onResult: (isCorrect: boolean, selectedIndex: number) => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [answer, setAnswer] = useState<{
    correct_index: number;
    explanation: string | null;
  } | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setSelected(null);
    setSubmitted(false);
    setAnswer(null);
  }, [question.id]);

  async function submit() {
    if (selected === null) return toast.error("Pick an answer first");
    setChecking(true);
    const { data, error } = await supabase
      .from("questions")
      .select("correct_index, explanation")
      .eq("id", question.id)
      .maybeSingle();
    setChecking(false);
    if (error || !data) {
      toast.error("Could not grade this question");
      return;
    }
    setAnswer({ correct_index: data.correct_index, explanation: data.explanation });
    setSubmitted(true);
    void onResult(selected === data.correct_index, selected);
  }

  return (
    <article className="card-elegant p-7">
      <div className="flex flex-wrap items-center gap-2 text-xs mb-3">
        {question.subject && (
          <Badge variant="outline" className="border-accent/40 text-accent bg-accent/5">
            {SUBJECT_LABEL[question.subject] ?? question.subject}
          </Badge>
        )}
        {question.difficulty && (
          <span className="text-muted-foreground capitalize">{question.difficulty}</span>
        )}
        {question.topic && <span className="text-muted-foreground">· {question.topic}</span>}
      </div>
      {question.image_url && (
        <img
          src={question.image_url}
          alt="Question illustration"
          className="mb-4 max-h-64 w-full object-contain rounded border"
        />
      )}
      <p className="font-display text-xl leading-snug whitespace-pre-wrap">{question.prompt}</p>

      <div className="mt-6 space-y-2">
        {question.choices.map((c, i) => {
          const isCorrect = answer ? i === answer.correct_index : false;
          const isPicked = selected === i;
          const showState = submitted && (isCorrect || isPicked);
          return (
            <button
              key={i}
              disabled={submitted}
              onClick={() => setSelected(i)}
              className={`w-full text-left flex items-start gap-3 p-4 rounded border transition-colors ${
                showState && isCorrect
                  ? "border-accent bg-accent/10"
                  : showState && isPicked && !isCorrect
                    ? "border-destructive bg-destructive/10"
                    : isPicked
                      ? "border-foreground"
                      : "border-border hover:border-foreground/40"
              }`}
            >
              <span className="font-display text-sm w-6 shrink-0">
                {String.fromCharCode(65 + i)}.
              </span>
              <span className="text-sm">{c}</span>
            </button>
          );
        })}
      </div>

      {!submitted ? (
        <Button
          onClick={submit}
          disabled={checking}
          className="mt-6 bg-primary text-primary-foreground"
        >
          {checking ? "Checking…" : "Check answer"}
        </Button>
      ) : answer ? (
        <div className="mt-6">
          <p
            className={
              selected === answer.correct_index
                ? "text-accent font-display text-lg"
                : "text-destructive font-display text-lg"
            }
          >
            {selected === answer.correct_index ? "Correct." : "Incorrect."}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Correct answer: <b>{String.fromCharCode(65 + answer.correct_index)}</b> —{" "}
            {question.choices[answer.correct_index]}
          </p>
          {answer.explanation && (
            <div className="mt-4 border-l-2 border-accent pl-4">
              <p className="crest mb-1">Explanation</p>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{answer.explanation}</p>
            </div>
          )}
        </div>
      ) : null}
    </article>
  );
}
