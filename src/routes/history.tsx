import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/lib/session";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/history")({
  head: () => ({ meta: [{ title: "History — Friends Pool" }] }),
  component: HistoryPage,
});

type Matchday = { id: string; label: string; created_at: string };

function HistoryPage() {
  const { user, ready } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && !user) navigate({ to: "/" });
  }, [ready, user, navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["history", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: mds, error } = await supabase
        .from("matchdays")
        .select("id,label,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      // For each matchday, get my submission
      const ids = (mds ?? []).map((m) => m.id);
      if (!ids.length) return { matchdays: [], mySubs: {} };
      const { data: subs } = await supabase
        .from("submissions")
        .select("id,matchday_id,submitted_at")
        .eq("user_id", user!.id)
        .in("matchday_id", ids);
      const mySubs: Record<string, { id: string; submitted_at: string }> = {};
      (subs ?? []).forEach((s) => {
        mySubs[s.matchday_id] = { id: s.id, submitted_at: s.submitted_at };
      });
      return { matchdays: (mds ?? []) as Matchday[], mySubs };
    },
  });

  if (!ready || !user) return null;

  return (
    <AppShell>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Your history</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Your submitted matchdays. Others' predictions only appear if you submitted in time.
      </p>
      {isLoading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : !data?.matchdays.length ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
          Nothing yet.
        </div>
      ) : (
        <Accordion type="multiple" className="space-y-3">
          {data.matchdays.map((md) => {
            const mine = data.mySubs[md.id];
            return (
              <AccordionItem
                key={md.id}
                value={md.id}
                className="rounded-xl border border-border bg-card px-4"
              >
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex flex-1 items-center justify-between pr-2">
                    <span className="font-medium">{md.label}</span>
                    {mine ? (
                      <Badge variant="secondary">
                        Submitted {new Date(mine.submitted_at).toLocaleDateString()}
                      </Badge>
                    ) : (
                      <Badge variant="outline">Not submitted</Badge>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <MatchdayDetail matchdayId={md.id} mySubmissionId={mine?.id ?? null} />
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </AppShell>
  );
}

function MatchdayDetail({
  matchdayId,
  mySubmissionId,
}: {
  matchdayId: string;
  mySubmissionId: string | null;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["md-detail", matchdayId, mySubmissionId],
    queryFn: async () => {
      const { data: matches } = await supabase
        .from("matches")
        .select("id,home_team,away_team,kickoff_at")
        .eq("matchday_id", matchdayId)
        .order("kickoff_at", { ascending: true });

      let mine: any[] = [];
      if (mySubmissionId) {
        const { data } = await supabase
          .from("predictions")
          .select("match_id,outcome,home_score,away_score")
          .eq("submission_id", mySubmissionId);
        mine = data ?? [];
      }

      let others: { username: string; submitted_at: string; preds: any[] }[] = [];
      if (mySubmissionId) {
        // Visibility: I submitted, so I can see other users' predictions
        const { data: subs } = await supabase
          .from("submissions")
          .select("id,submitted_at,user_id,users(username)")
          .eq("matchday_id", matchdayId)
          .neq("id", mySubmissionId);
        const subIds = (subs ?? []).map((s: any) => s.id);
        let allPreds: any[] = [];
        if (subIds.length) {
          const { data: p } = await supabase
            .from("predictions")
            .select("submission_id,match_id,outcome,home_score,away_score")
            .in("submission_id", subIds);
          allPreds = p ?? [];
        }
        others = (subs ?? []).map((s: any) => ({
          username: s.users?.username ?? "?",
          submitted_at: s.submitted_at,
          preds: allPreds.filter((p) => p.submission_id === s.id),
        }));
      }
      return { matches: matches ?? [], mine, others };
    },
  });

  if (isLoading) return <div className="py-3 text-sm text-muted-foreground">Loading…</div>;
  if (!data) return null;

  const fmt = (p?: any) => (p ? `${p.outcome} | ${p.home_score}-${p.away_score}` : "—");

  return (
    <div className="space-y-6 pb-2 pt-1">
      {mySubmissionId ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Your predictions
          </h3>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <tbody>
                {data.matches.map((m: any) => {
                  const p = data.mine.find((x: any) => x.match_id === m.id);
                  return (
                    <tr key={m.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        {m.home_team} vs {m.away_team}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(p)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300">
          You didn't submit for this matchday, so other users' predictions are hidden.
        </div>
      )}

      {mySubmissionId && (
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Other users' predictions
          </h3>
          {data.others.length === 0 ? (
            <p className="text-sm text-muted-foreground">No one else submitted.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">User</th>
                    {data.matches.map((m: any) => (
                      <th key={m.id} className="px-3 py-2 whitespace-nowrap">
                        {m.home_team} vs {m.away_team}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.others.map((o) => (
                    <tr key={o.username} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">@{o.username}</td>
                      {data.matches.map((m: any) => {
                        const p = o.preds.find((x: any) => x.match_id === m.id);
                        return (
                          <td key={m.id} className="px-3 py-2 font-mono whitespace-nowrap">
                            {fmt(p)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
