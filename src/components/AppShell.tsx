import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Trophy, History, ShieldCheck, LogOut } from "lucide-react";
import { useSession, setSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, ready } = useSession();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (!ready) return null;

  const nav = [
    { to: "/play", label: "Matchday", icon: Trophy },
    { to: "/history", label: "History", icon: History },
    { to: "/admin", label: "Manage", icon: ShieldCheck },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/play" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Trophy className="h-4 w-4" />
            </span>
            <span className="hidden sm:inline">Friends Pool</span>
          </Link>
          <nav className="flex items-center gap-1">
            {nav.map((n) => {
              const Icon = n.icon;
              const active = pathname.startsWith(n.to);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{n.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            {user && (
              <>
                <span className="hidden text-sm text-muted-foreground sm:inline">
                  @{user.username}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSession(null);
                    navigate({ to: "/" });
                  }}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-10">{children}</main>
    </div>
  );
}
