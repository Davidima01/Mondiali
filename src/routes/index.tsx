import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginOrCreate, getSession } from "@/lib/session";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Friends Pool — Football Predictions" },
      {
        name: "description",
        content: "A friendly football prediction pool for friends. Pick 1/X/2 and exact scores.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getSession()) navigate({ to: "/play" });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await loginOrCreate(username);
      navigate({ to: "/play" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not continue");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <Trophy className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Friends Pool</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Predict the matchday with your crew. No passwords, just a username.
          </p>
        </div>
        <form
          onSubmit={submit}
          className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm"
        >
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              autoFocus
              autoComplete="off"
              placeholder="e.g. luca"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              If it doesn't exist, we'll create it. Use <code>admin</code> to manage matchdays.
            </p>
          </div>
          <Button type="submit" className="w-full" disabled={loading || !username.trim()}>
            {loading ? "Loading…" : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
