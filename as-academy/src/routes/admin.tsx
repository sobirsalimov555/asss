import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteNav, SiteFooter } from "@/components/site-nav";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({ meta: [{ title: "Admin · AS Academy" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const { data: isAdmin, isLoading: roleLoading } = useQuery({
    queryKey: ["is-admin", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id)
        .eq("role", "admin")
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  if (loading || roleLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <SiteNav />
        <div className="flex-1 container mx-auto max-w-6xl px-6 py-16">Loading…</div>
        <SiteFooter />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col">
        <SiteNav />
        <div className="flex-1 container mx-auto max-w-6xl px-6 py-16">
          <h1 className="font-display text-3xl mb-3">Access denied</h1>
          <p className="text-muted-foreground">You need admin access to view this page.</p>
        </div>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav />
      <main className="flex-1 container mx-auto max-w-6xl px-6 py-10">
        <h1 className="font-display text-4xl mb-8">Admin Console</h1>
        <Tabs defaultValue="settings">
          <TabsList className="mb-6 flex-wrap">
            <TabsTrigger value="settings">SAT Date</TabsTrigger>
            <TabsTrigger value="questions">Questions</TabsTrigger>
            <TabsTrigger value="mocks">Mock Tests</TabsTrigger>
            <TabsTrigger value="resources">Resources</TabsTrigger>
          </TabsList>
          <TabsContent value="settings">
            <SettingsTab />
          </TabsContent>
          <TabsContent value="questions">
            <QuestionsTab />
          </TabsContent>
          <TabsContent value="mocks">
            <MocksTab />
          </TabsContent>
          <TabsContent value="resources">
            <ResourcesTab />
          </TabsContent>
        </Tabs>
      </main>
      <SiteFooter />
    </div>
  );
}

/* ---------- SAT date ---------- */
function SettingsTab() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["site_setting", "next_sat_date"],
    queryFn: async () => {
      const { data } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "next_sat_date")
        .maybeSingle();
      return data?.value ?? "";
    },
  });
  const [value, setValue] = useState("");
  useEffect(() => {
    if (data !== undefined) setValue(data);
  }, [data]);

  const save = async () => {
    const { error } = await supabase
      .from("site_settings")
      .upsert({ key: "next_sat_date", value, updated_at: new Date().toISOString() });
    if (error) return toast.error(error.message);
    toast.success("SAT date saved");
    qc.invalidateQueries({ queryKey: ["site_setting", "next_sat_date"] });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Next SAT date</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 max-w-sm">
        <Label htmlFor="sat-date">Date</Label>
        <Input id="sat-date" type="date" value={value} onChange={(e) => setValue(e.target.value)} />
        <Button onClick={save}>Save</Button>
      </CardContent>
    </Card>
  );
}

/* ---------- Questions ---------- */
const MODULES = ["math1", "math2", "rw1", "rw2"] as const;
const SUBJECTS = ["math", "reading", "grammar"] as const;

function QuestionsTab() {
  const qc = useQueryClient();
  const empty = {
    prompt: "",
    choices: ["", "", "", ""],
    correct_index: 0,
    explanation: "",
    points: 1,
    module: "math1" as (typeof MODULES)[number],
    subject: "math" as (typeof SUBJECTS)[number],
    topic: "",
    difficulty: "medium",
    in_bank: true,
    image_url: "",
  };
  const [form, setForm] = useState(empty);
  const [uploading, setUploading] = useState(false);

  const { data: questions } = useQuery({
    queryKey: ["admin-questions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("questions")
        .select("id, prompt, module, in_bank, image_url")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const uploadImage = async (file: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const fileName = `${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("question_images")
        .upload(fileName, file);
      if (uploadError) throw uploadError;
      const { data: publicUrlData } = supabase.storage
        .from("question_images")
        .getPublicUrl(fileName);
      setForm({ ...form, image_url: publicUrlData.publicUrl });
      toast.success("Image uploaded");
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!form.prompt.trim() || form.choices.some((c) => !c.trim())) {
      return toast.error("Fill prompt and all 4 choices");
    }
    const { error } = await supabase.from("questions").insert({
      prompt: form.prompt,
      choices: form.choices,
      correct_index: form.correct_index,
      explanation: form.explanation || null,
      points: form.points,
      module: form.module,
      subject: form.subject,
      topic: form.topic || null,
      difficulty: form.difficulty || null,
      in_bank: form.in_bank,
      image_url: form.image_url || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Question created");
    setForm(empty);
    qc.invalidateQueries({ queryKey: ["admin-questions"] });
    qc.invalidateQueries({ queryKey: ["admin-question-pool"] });
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>New question</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Prompt</Label>
            <Textarea
              rows={3}
              value={form.prompt}
              onChange={(e) => setForm({ ...form, prompt: e.target.value })}
            />
          </div>
          {form.choices.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                checked={form.correct_index === i}
                onChange={() => setForm({ ...form, correct_index: i })}
                title="Correct"
              />
              <Input
                placeholder={`Choice ${String.fromCharCode(65 + i)}`}
                value={c}
                onChange={(e) => {
                  const choices = [...form.choices];
                  choices[i] = e.target.value;
                  setForm({ ...form, choices });
                }}
              />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Subject</Label>
              <Select
                value={form.subject}
                onValueChange={(v) => setForm({ ...form, subject: v as typeof form.subject })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUBJECTS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Module</Label>
              <Select
                value={form.module}
                onValueChange={(v) => setForm({ ...form, module: v as typeof form.module })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODULES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Topic</Label>
              <Input
                value={form.topic}
                onChange={(e) => setForm({ ...form, topic: e.target.value })}
              />
            </div>
            <div>
              <Label>Difficulty</Label>
              <Select
                value={form.difficulty}
                onValueChange={(v) => setForm({ ...form, difficulty: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["easy", "medium", "hard"].map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Image (optional)</Label>
            <div className="flex items-center gap-3">
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadImage(file);
                }}
                disabled={uploading}
              />
              {uploading && <span className="text-xs text-muted-foreground">Uploading…</span>}
            </div>
            {form.image_url && (
              <div className="mt-2">
                <img
                  src={form.image_url}
                  alt="Preview"
                  className="max-h-40 rounded border object-contain"
                />
                <button
                  type="button"
                  className="text-xs text-destructive mt-1 underline"
                  onClick={() => setForm({ ...form, image_url: "" })}
                >
                  Remove
                </button>
              </div>
            )}
          </div>
          <div>
            <Label>Explanation (optional)</Label>
            <Textarea
              rows={2}
              value={form.explanation}
              onChange={(e) => setForm({ ...form, explanation: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.in_bank}
              onChange={(e) => setForm({ ...form, in_bank: e.target.checked })}
            />
            Include in practice bank
          </label>
          <Button onClick={save}>Create question</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent questions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 max-h-[600px] overflow-auto">
          {questions?.map((q) => (
            <div key={q.id} className="text-sm border-b border-border py-2">
              <div className="text-xs text-muted-foreground">
                {q.module} · {q.in_bank ? "bank" : "mock-only"}
                {q.image_url ? " · has image" : ""}
              </div>
              <div className="line-clamp-2">{q.prompt}</div>
            </div>
          ))}
          {!questions?.length && <p className="text-sm text-muted-foreground">No questions yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------- Mock tests ---------- */
function MocksTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: "",
    description: "",
    kind: "full_mock" as "full_mock" | "topic_practice" | "quiz",
    topic: "",
    duration_minutes: 134,
    published: true,
  });
  const [selectedMockId, setSelectedMockId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const { data: mocks } = useQuery({
    queryKey: ["admin-mocks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mock_tests")
        .select("id, title, kind, published")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: pool } = useQuery({
    queryKey: ["admin-question-pool"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("questions")
        .select("id, prompt, module")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const { data: attached } = useQuery({
    queryKey: ["mock-questions", selectedMockId],
    enabled: !!selectedMockId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mock_questions")
        .select("id, position, module, question_id, questions:question_id(prompt)")
        .eq("mock_id", selectedMockId!)
        .order("position");
      if (error) throw error;
      return data;
    },
  });

  const createMock = async () => {
    if (!form.title.trim()) return toast.error("Title required");
    const { error } = await supabase.from("mock_tests").insert(form);
    if (error) return toast.error(error.message);
    toast.success("Mock created");
    setForm({ ...form, title: "", description: "", topic: "" });
    qc.invalidateQueries({ queryKey: ["admin-mocks"] });
  };

  const attach = async (questionId: string, module: string) => {
    if (!selectedMockId) return;
    const nextPos = (attached?.length ?? 0) + 1;
    const { error } = await supabase.from("mock_questions").insert({
      mock_id: selectedMockId,
      question_id: questionId,
      module: module as any,
      position: nextPos,
    });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["mock-questions", selectedMockId] });
  };

  const detach = async (id: string) => {
    const { error } = await supabase.from("mock_questions").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["mock-questions", selectedMockId] });
  };

  const generateMock = async () => {
    setGenerating(true);
    try {
      // Count existing mocks for naming
      const { count } = await supabase
        .from("mock_tests")
        .select("id", { count: "exact", head: true })
        .eq("kind", "full_mock");
      const mockNum = (count ?? 0) + 1;

      const mockTitle = `Full Mock ${mockNum}`;
      // Create the mock
      const { data: mock, error: createErr } = await supabase
        .from("mock_tests")
        .insert({
          title: mockTitle,
          description: `Auto-generated full mock with 27 RW + 22 Math questions from the practice bank.`,
          kind: "full_mock",
          duration_minutes: 134,
          published: true,
        })
        .select("id")
        .single();
      if (createErr) throw createErr;
      if (!mock) throw new Error("Failed to create mock");

      const perModule: Record<string, number> = { rw1: 27, rw2: 27, math1: 22, math2: 22 };
      const rows: { mock_id: string; question_id: string; module: string; position: number }[] = [];

      for (const [mod, limit] of Object.entries(perModule)) {
        const { data: qs, error: qErr } = await supabase
          .from("questions")
          .select("id")
          .eq("module", mod as any)
          .eq("in_bank", true)
          .limit(limit);
        if (qErr) throw qErr;
        if (!qs || qs.length < limit) {
          throw new Error(`Only ${qs?.length ?? 0} questions found for ${mod}, need ${limit}`);
        }
        qs.forEach((q, i) => {
          rows.push({
            mock_id: mock.id,
            question_id: q.id,
            module: mod,
            position: i + 1,
          });
        });
      }

      // Batch insert all mock_questions
      const { error: attachErr } = await supabase.from("mock_questions").insert(rows as any);
      if (attachErr) throw attachErr;

      toast.success(`Mock "${mockTitle}" created with ${rows.length} questions`);
      qc.invalidateQueries({ queryKey: ["admin-mocks"] });
      qc.invalidateQueries({ queryKey: ["admin-question-pool"] });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to generate mock");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>New mock test</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Kind</Label>
                <Select
                  value={form.kind}
                  onValueChange={(v) => setForm({ ...form, kind: v as typeof form.kind })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_mock">Full mock</SelectItem>
                    <SelectItem value="topic_practice">Topic practice</SelectItem>
                    <SelectItem value="quiz">Quiz</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Duration (min)</Label>
                <Input
                  type="number"
                  value={form.duration_minutes}
                  onChange={(e) =>
                    setForm({ ...form, duration_minutes: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="col-span-2">
                <Label>Topic</Label>
                <Input
                  value={form.topic}
                  onChange={(e) => setForm({ ...form, topic: e.target.value })}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.published}
                onChange={(e) => setForm({ ...form, published: e.target.checked })}
              />
              Published
            </label>
            <Button onClick={createMock}>Create mock</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Auto-generate full mock</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Automatically creates a new full mock with 27 RW1, 27 RW2, 22 Math1, and 22 Math2
              questions from the practice bank — one click.
            </p>
            <Button onClick={generateMock} disabled={generating} className="w-full">
              {generating ? "Generating…" : "Generate Mock"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Select a mock to edit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[500px] overflow-auto">
            {mocks?.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedMockId(m.id)}
                className={`w-full text-left px-3 py-2 rounded border ${selectedMockId === m.id ? "border-accent bg-accent/10" : "border-border"}`}
              >
                <div className="font-medium text-sm">{m.title}</div>
                <div className="text-xs text-muted-foreground">
                  {m.kind} · {m.published ? "published" : "draft"}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      {selectedMockId && (
        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Attached questions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[500px] overflow-auto">
              {attached?.map((a: any) => (
                <div
                  key={a.id}
                  className="flex items-start gap-2 text-sm border-b border-border py-2"
                >
                  <span className="text-muted-foreground w-6">{a.position}.</span>
                  <div className="flex-1">
                    <div className="text-xs text-muted-foreground">{a.module}</div>
                    <div className="line-clamp-2">{a.questions?.prompt}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => detach(a.id)}>
                    Remove
                  </Button>
                </div>
              ))}
              {!attached?.length && (
                <p className="text-sm text-muted-foreground">No questions attached.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Attach from pool</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[500px] overflow-auto">
              {pool?.map((q) => (
                <div
                  key={q.id}
                  className="flex items-start gap-2 text-sm border-b border-border py-2"
                >
                  <div className="flex-1">
                    <div className="text-xs text-muted-foreground">{q.module}</div>
                    <div className="line-clamp-2">{q.prompt}</div>
                  </div>
                  <Button size="sm" onClick={() => attach(q.id, q.module ?? "math1")}>
                    Add
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

/* ---------- Resources ---------- */
function ResourcesTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: "",
    description: "",
    url: "",
    category: "",
    published: true,
  });

  const { data: resources } = useQuery({
    queryKey: ["admin-resources"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("study_resources")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const save = async () => {
    if (!form.title.trim() || !form.url.trim()) return toast.error("Title and URL required");
    const { error } = await supabase.from("study_resources").insert({
      title: form.title,
      description: form.description || null,
      url: form.url,
      category: form.category || null,
      published: form.published,
    });
    if (error) return toast.error(error.message);
    toast.success("Resource added");
    setForm({ title: "", description: "", url: "", category: "", published: true });
    qc.invalidateQueries({ queryKey: ["admin-resources"] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("study_resources").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-resources"] });
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>New resource</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Title</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div>
            <Label>URL</Label>
            <Input
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://…"
            />
          </div>
          <div>
            <Label>Category</Label>
            <Input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="Video, PDF, …"
            />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.published}
              onChange={(e) => setForm({ ...form, published: e.target.checked })}
            />
            Published
          </label>
          <Button onClick={save}>Add resource</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All resources</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 max-h-[600px] overflow-auto">
          {resources?.map((r: any) => (
            <div key={r.id} className="flex items-start gap-2 text-sm border-b border-border py-2">
              <div className="flex-1">
                <div className="font-medium">{r.title}</div>
                <div className="text-xs text-muted-foreground">
                  {r.category} · {r.published ? "live" : "draft"}
                </div>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-accent underline break-all"
                >
                  {r.url}
                </a>
              </div>
              <Button size="sm" variant="ghost" onClick={() => remove(r.id)}>
                Delete
              </Button>
            </div>
          ))}
          {!resources?.length && <p className="text-sm text-muted-foreground">No resources yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
