import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Download } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — Friends Pool" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { user, ready } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (ready && !user) navigate({ to: "/" });
  }, [ready, user, navigate]);

  const [label, setLabel] = useState("");
  const today = new Date();
  const defaultLabel = `Giorno ${String(today.getDate()).padStart(2, "0")}/${String(
    today.getMonth() + 1,
  ).padStart(2, "0")}`;

  const { data: matchdays } = useQuery({
    queryKey: ["admin-matchdays"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matchdays")
        .select("id,label,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const createMatchday = async () => {
    const l = (label || defaultLabel).trim();
    if (!l) return;
    const { error } = await supabase.from("matchdays").insert({ label: l });
    if (error) toast.error(error.message);
    else {
      toast.success("Matchday created");
      setLabel("");
      qc.invalidateQueries({ queryKey: ["admin-matchdays"] });
    }
  };

  if (!ready || !user) return null;

  return (
    <AppShell>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Admin</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Create matchdays, add matches, monitor submissions, export results.
      </p>

      <section className="mb-8 rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          New matchday
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <Label htmlFor="label">Label</Label>
            <Input
              id="label"
              placeholder={defaultLabel}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <Button onClick={createMatchday}>
            <Plus className="mr-1 h-4 w-4" /> Create
          </Button>
        </div>
      </section>

      <div className="space-y-4">
        {(matchdays ?? []).map((md) => (
          <MatchdayAdminCard key={md.id} matchday={md} />
        ))}
        {matchdays && matchdays.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
            No matchdays yet.
          </div>
        )}
      </div>
    </AppShell>
  );
}

type MD = { id: string; label: string };

function MatchdayAdminCard({ matchday }: { matchday: MD }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-md", matchday.id],
    queryFn: async () => {
      const { data: matches } = await supabase
        .from("matches")
        .select("id,home_team,away_team,kickoff_at,position")
        .eq("matchday_id", matchday.id)
        .order("kickoff_at", { ascending: true });
      const { data: subs } = await supabase
        .from("submissions")
        .select("id")
        .eq("matchday_id", matchday.id);
      return { matches: matches ?? [], subCount: subs?.length ?? 0 };
    },
  });

  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [kickoff, setKickoff] = useState("");

  const firstKickoff =
    data?.matches.length ? new Date(data.matches[0].kickoff_at) : null;
  const isClosed = !!firstKickoff && firstKickoff.getTime() <= Date.now();

  const addMatch = async () => {
    if (!home.trim() || !away.trim() || !kickoff) {
      toast.error("Fill all fields");
      return;
    }
    const { error } = await supabase.from("matches").insert({
      matchday_id: matchday.id,
      home_team: home.trim(),
      away_team: away.trim(),
      kickoff_at: new Date(kickoff).toISOString(),
      position: data?.matches.length ?? 0,
    });
    if (error) toast.error(error.message);
    else {
      setHome("");
      setAway("");
      setKickoff("");
      qc.invalidateQueries({ queryKey: ["admin-md", matchday.id] });
    }
  };

  const removeMatch = async (id: string) => {
    const { error } = await supabase.from("matches").delete().eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["admin-md", matchday.id] });
  };

  const exportCsv = async () => {
    // Fetch all submissions + users + predictions
    const { data: subs } = await supabase
      .from("submissions")
      .select("id,submitted_at,users(username)")
      .eq("matchday_id", matchday.id);
    const subIds = (subs ?? []).map((s: any) => s.id);
    let preds: any[] = [];
    if (subIds.length) {
      const { data } = await supabase
        .from("predictions")
        .select("submission_id,match_id,outcome,home_score,away_score")
        .in("submission_id", subIds);
      preds = data ?? [];
    }
    const matches = data?.matches ?? [];
    const header = ["username", ...matches.map((m: any) => `${m.home_team} vs ${m.away_team}`)];
    const rows = (subs ?? []).map((s: any) => {
      const row = [s.users?.username ?? "?"];
      for (const m of matches) {
        const p = preds.find((x) => x.submission_id === s.id && x.match_id === m.id);
        row.push(p ? `${p.outcome} | ${p.home_score}-${p.away_score}` : "");
      }
      return row;
    });
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${matchday.label.replace(/[^\w]+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">{matchday.label}</h3>
            <Badge variant={isClosed ? "destructive" : "default"}>
              {isClosed ? "CLOSED" : "OPEN"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {data?.subCount ?? 0} submission{(data?.subCount ?? 0) === 1 ? "" : "s"}
            {firstKickoff ? ` · First kickoff ${firstKickoff.toLocaleString()}` : ""}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!isClosed}
          onClick={exportCsv}
          title={isClosed ? "Export CSV" : "Available after first kickoff"}
        >
          <Download className="mr-1 h-4 w-4" /> Export CSV
        </Button>
      </div>

      <div className="space-y-2">
        {(data?.matches ?? []).map((m: any) => (
          <div
            key={m.id}
            className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <div>
              <span className="font-medium">
                {m.home_team} vs {m.away_team}
              </span>
              <span className="ml-2 text-xs text-muted-foreground">
                {new Date(m.kickoff_at).toLocaleString()}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeMatch(m.id)}
              disabled={isClosed}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {data && data.matches.length === 0 && (
          <p className="text-sm text-muted-foreground">No matches yet.</p>
        )}
      </div>

      {!isClosed && (
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <Input placeholder="Home team" value={home} onChange={(e) => setHome(e.target.value)} />
          <Input placeholder="Away team" value={away} onChange={(e) => setAway(e.target.value)} />
          <Input
            type="datetime-local"
            value={kickoff}
            onChange={(e) => setKickoff(e.target.value)}
          />
          <Button onClick={addMatch}>
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
      )}
    </section>
  );
}
