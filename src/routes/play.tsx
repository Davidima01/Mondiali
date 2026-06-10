import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Clock, AlertTriangle, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/play")({
  head: () => ({ meta: [{ title: "Current Matchday — Friends Pool" }] }),
  component: PlayPage,
});

type Match = {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  position: number;
};

type Pick = { outcome: "1" | "X" | "2" | ""; home: string; away: string };

function PlayPage() {
  const { user, ready } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (ready && !user) navigate({ to: "/" });
  }, [ready, user, navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["current-matchday", user?.id],
    enabled: !!user,
    queryFn: async () => {
      // Latest matchday by creation
      const { data: mds, error: e1 } = await supabase
        .from("matchdays")
        .select("id,label,created_at")
        .order("created_at", { ascending: false })
        .limit(1);
      if (e1) throw e1;
      const md = mds?.[0];
      if (!md) return { matchday: null, matches: [], submission: null };

      const { data: matches, error: e2 } = await supabase
        .from("matches")
        .select("id,home_team,away_team,kickoff_at,position")
        .eq("matchday_id", md.id)
        .order("kickoff_at", { ascending: true });
      if (e2) throw e2;

      const { data: sub } = await supabase
        .from("submissions")
        .select("id,submitted_at")
        .eq("matchday_id", md.id)
        .eq("user_id", user!.id)
        .maybeSingle();

      return { matchday: md, matches: matches ?? [], submission: sub };
    },
  });

  const firstKickoff = useMemo(() => {
    const ms = (data?.matches ?? []) as Match[];
    return ms.length ? new Date(ms[0].kickoff_at) : null;
  }, [data]);
  const isClosed = !!firstKickoff && firstKickoff.getTime() <= Date.now();

  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [reviewOpen, setReviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data?.matches) {
      setPicks((prev) => {
        const next = { ...prev };
        for (const m of data.matches as Match[]) {
          if (!next[m.id]) next[m.id] = { outcome: "", home: "", away: "" };
        }
        return next;
      });
    }
  }, [data]);

  if (!ready || !user) return null;

  return (
    <AppShell>
      {isLoading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : !data?.matchday ? (
        <EmptyState />
      ) : data.submission ? (
        <AlreadySubmitted
          matchdayLabel={data.matchday.label}
          submittedAt={data.submission.submitted_at}
        />
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{data.matchday.label}</h1>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                {isClosed
                  ? "Closed — submissions ended at first kickoff."
                  : firstKickoff
                  ? `Closes at ${firstKickoff.toLocaleString()}`
                  : "No matches yet"}
              </p>
            </div>
            <Badge variant={isClosed ? "destructive" : "default"}>
              {isClosed ? "CLOSED" : "OPEN"}
            </Badge>
          </div>

          {(data.matches as Match[]).length === 0 ? (
            <p className="text-muted-foreground">No matches in this matchday yet.</p>
          ) : (
            <div className="space-y-3">
              {(data.matches as Match[]).map((m) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  disabled={isClosed}
                  pick={picks[m.id] ?? { outcome: "", home: "", away: "" }}
                  onChange={(p) => setPicks((prev) => ({ ...prev, [m.id]: p }))}
                />
              ))}
            </div>
          )}

          <div className="sticky bottom-4 mt-8 flex justify-end">
            <Button
              size="lg"
              disabled={
                isClosed ||
                (data.matches as Match[]).length === 0 ||
                !(data.matches as Match[]).every((m) => isComplete(picks[m.id]))
              }
              onClick={() => setReviewOpen(true)}
            >
              Review & Submit
            </Button>
          </div>

          <ReviewDialog
            open={reviewOpen}
            onOpenChange={setReviewOpen}
            matches={data.matches as Match[]}
            picks={picks}
            saving={saving}
            onConfirm={async () => {
              if (!data.matchday) return;
              setSaving(true);
              try {
                const { data: sub, error: e1 } = await supabase
                  .from("submissions")
                  .insert({ user_id: user.id, matchday_id: data.matchday.id })
                  .select("id")
                  .single();
                if (e1) throw e1;
                const rows = (data.matches as Match[]).map((m) => ({
                  submission_id: sub.id,
                  match_id: m.id,
                  outcome: picks[m.id].outcome as "1" | "X" | "2",
                  home_score: Number(picks[m.id].home),
                  away_score: Number(picks[m.id].away),
                }));
                const { error: e2 } = await supabase.from("predictions").insert(rows);
                if (e2) throw e2;
                toast.success("Submitted! Predictions are now final.");
                setReviewOpen(false);
                qc.invalidateQueries({ queryKey: ["current-matchday"] });
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not submit");
              } finally {
                setSaving(false);
              }
            }}
          />
        </>
      )}
    </AppShell>
  );
}

function isComplete(p?: Pick) {
  if (!p) return false;
  if (!p.outcome) return false;
  if (p.home === "" || p.away === "") return false;
  return /^\d{1,2}$/.test(p.home) && /^\d{1,2}$/.test(p.away);
}

function MatchCard({
  match,
  pick,
  onChange,
  disabled,
}: {
  match: Match;
  pick: Pick;
  onChange: (p: Pick) => void;
  disabled?: boolean;
}) {
  const k = new Date(match.kickoff_at);
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium">
          {match.home_team} <span className="text-muted-foreground">vs</span> {match.away_team}
        </div>
        <div className="text-xs text-muted-foreground">{k.toLocaleString()}</div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <div className="flex gap-1">
          {(["1", "X", "2"] as const).map((o) => (
            <button
              key={o}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ ...pick, outcome: o })}
              className={`h-9 w-10 rounded-md border text-sm font-medium transition-colors ${
                pick.outcome === o
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-secondary"
              } disabled:opacity-50`}
            >
              {o}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            inputMode="numeric"
            className="w-16 text-center"
            placeholder="0"
            value={pick.home}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...pick, home: e.target.value.replace(/[^0-9]/g, "").slice(0, 2) })
            }
          />
          <span className="text-muted-foreground">–</span>
          <Input
            inputMode="numeric"
            className="w-16 text-center"
            placeholder="0"
            value={pick.away}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...pick, away: e.target.value.replace(/[^0-9]/g, "").slice(0, 2) })
            }
          />
        </div>
      </div>
    </div>
  );
}

function ReviewDialog({
  open,
  onOpenChange,
  matches,
  picks,
  onConfirm,
  saving,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  matches: Match[];
  picks: Record<string, Pick>;
  onConfirm: () => void;
  saving: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Review your predictions</DialogTitle>
          <DialogDescription>
            Double-check before confirming — submission is permanent and cannot be edited.
          </DialogDescription>
        </DialogHeader>
        <div className="my-2 max-h-[50vh] space-y-2 overflow-y-auto rounded-md border border-border p-3">
          {matches.map((m) => {
            const p = picks[m.id];
            return (
              <div key={m.id} className="flex items-center justify-between text-sm">
                <span>
                  {m.home_team} vs {m.away_team}
                </span>
                <span className="font-mono font-medium">
                  {p?.outcome} | {p?.home}-{p?.away}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex items-start gap-2 rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Once confirmed, you can't change these picks.
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Back
          </Button>
          <Button onClick={onConfirm} disabled={saving}>
            {saving ? "Saving…" : "Confirm & save permanently"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border p-10 text-center">
      <h2 className="text-lg font-medium">No matchday yet</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Ask the admin to create the next matchday.
      </p>
    </div>
  );
}

function AlreadySubmitted({
  matchdayLabel,
  submittedAt,
}: {
  matchdayLabel: string;
  submittedAt: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-8 text-center">
      <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
      <h2 className="mt-3 text-xl font-semibold">You're in for {matchdayLabel}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Submitted {new Date(submittedAt).toLocaleString()}. See your picks and others' in History.
      </p>
    </div>
  );
}
