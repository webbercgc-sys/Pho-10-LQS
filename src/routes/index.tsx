import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ChefHat, QrCode, UtensilsCrossed } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Phở 10 — Sync System" },
      { name: "description", content: "Live restaurant ordering & kitchen sync for Phở 10." },
      { property: "og:title", content: "Phở 10 — Sync System" },
      { property: "og:description", content: "Live restaurant ordering & kitchen sync." },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [table, setTable] = useState("1");

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--gradient-warm)" }}
    >
      <div className="mx-auto max-w-5xl px-6 py-16">
        <div
          className="rounded-3xl px-8 py-16 text-center text-primary-foreground"
          style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-bowl)" }}
        >
          <div className="mb-3 text-sm font-semibold uppercase tracking-widest opacity-90">
            Phở 10 · Hà Nội
          </div>
          <h1 className="text-5xl font-black tracking-tight md:text-7xl">
            Phở 10 Sync System
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base opacity-95 md:text-lg">
            Customers order. Kitchen cooks. Everything stays in sync — in real time.
          </p>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <div
            className="rounded-2xl bg-card p-7"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-foreground">
                <QrCode className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Customer</h2>
                <p className="text-sm text-muted-foreground">Open the menu for a table</p>
              </div>
            </div>
            <form
              className="mt-5 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const n = Math.max(1, Number(table) || 1);
                navigate({ to: "/t/$table", params: { table: String(n) } });
              }}
            >
              <input
                type="number"
                min={1}
                value={table}
                onChange={(e) => setTable(e.target.value)}
                className="w-24 rounded-lg border border-input bg-background px-3 py-2 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
                aria-label="Table number"
              />
              <button
                type="submit"
                className="flex-1 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground transition hover:opacity-90"
              >
                Open Menu →
              </button>
            </form>
            <p className="mt-3 text-xs text-muted-foreground">
              In production this URL comes from a QR code on the table.
            </p>
          </div>

          <div
            className="rounded-2xl bg-card p-7"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-secondary text-secondary-foreground">
                <ChefHat className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Kitchen</h2>
                <p className="text-sm text-muted-foreground">Live cooking queue & alerts</p>
              </div>
            </div>
            <Link
              to="/kitchen"
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-3 font-semibold text-background transition hover:opacity-90"
            >
              <UtensilsCrossed className="h-4 w-4" />
              Open Kitchen Dashboard
            </Link>
            <p className="mt-3 text-xs text-muted-foreground">
              Manager can toggle inventory from the same screen.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
