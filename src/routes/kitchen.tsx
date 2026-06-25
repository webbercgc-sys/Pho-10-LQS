import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Bell, ChefHat, ArrowLeft, Check, Power, Clock, ShoppingBag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatVnd } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/kitchen")({
  head: () => ({
    meta: [
      { title: "Kitchen — Phở 10" },
      { name: "description", content: "Live cooking queue and customer alerts." },
    ],
  }),
  component: Kitchen,
});

type Dish = { id: string; name: string; price: number; is_available: boolean; sort_order: number };
type Ticket = { id: string; queue_number: number; table_number: number; status: "waiting" | "in_progress" | "served"; created_at: string };
type TicketItem = { id: string; ticket_id: string; dish_id: string; quantity: number; status: "pending" | "done" };
type Bell = { id: string; ticket_id: string; acknowledged: boolean; created_at: string };

function Kitchen() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"cook" | "inventory">("cook");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(i);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["kitchen"],
    queryFn: async () => {
      const [dishesRes, ticketsRes, itemsRes, bellsRes] = await Promise.all([
        supabase.from("dishes").select("*").order("sort_order"),
        supabase.from("tickets").select("*").neq("status", "served").order("created_at"),
        supabase.from("ticket_items").select("*"),
        supabase.from("bell_alerts").select("*").eq("acknowledged", false).order("created_at"),
      ]);
      if (dishesRes.error) throw dishesRes.error;
      if (ticketsRes.error) throw ticketsRes.error;
      if (itemsRes.error) throw itemsRes.error;
      if (bellsRes.error) throw bellsRes.error;
      return {
        dishes: dishesRes.data as Dish[],
        tickets: ticketsRes.data as Ticket[],
        items: itemsRes.data as TicketItem[],
        bells: bellsRes.data as Bell[],
      };
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("kitchen-room")
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => qc.invalidateQueries({ queryKey: ["kitchen"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "ticket_items" }, () => qc.invalidateQueries({ queryKey: ["kitchen"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "bell_alerts" }, () => qc.invalidateQueries({ queryKey: ["kitchen"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "dishes" }, () => qc.invalidateQueries({ queryKey: ["kitchen"] }))
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const completeBatch = useMutation({
    mutationFn: async (dishId: string) => {
      const { data, error } = await supabase.rpc("complete_dish_batch", { p_dish_id: dishId });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => {
      toast.success(`Marked ${n} item(s) done.`);
      qc.invalidateQueries({ queryKey: ["kitchen"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ackBell = useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase.rpc("acknowledge_bell", { p_alert_id: alertId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kitchen"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleDish = useMutation({
    mutationFn: async (dishId: string) => {
      const { error } = await supabase.rpc("toggle_dish_availability", { p_dish_id: dishId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kitchen"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  // Aggregate pending items per dish
  const batches = useMemo(() => {
    if (!data) return [];
    const dishById = new Map(data.dishes.map((d) => [d.id, d]));
    const ticketById = new Map(data.tickets.map((t) => [t.id, t]));
    const byDish = new Map<string, { dish: Dish; total: number; tickets: { ticket: Ticket; qty: number }[] }>();
    for (const it of data.items) {
      if (it.status !== "pending") continue;
      const ticket = ticketById.get(it.ticket_id);
      if (!ticket) continue; // ticket already served
      const dish = dishById.get(it.dish_id);
      if (!dish) continue;
      let entry = byDish.get(dish.id);
      if (!entry) {
        entry = { dish, total: 0, tickets: [] };
        byDish.set(dish.id, entry);
      }
      entry.total += it.quantity;
      entry.tickets.push({ ticket, qty: it.quantity });
    }
    return Array.from(byDish.values()).sort((a, b) => b.total - a.total);
  }, [data]);

  const activeTickets = data?.tickets ?? [];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link to="/" className="grid h-9 w-9 place-items-center rounded-lg bg-muted hover:bg-border">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <ChefHat className="h-6 w-6 text-primary" />
          <div className="flex-1">
            <div className="text-xs font-semibold uppercase tracking-widest text-primary">Phở 10</div>
            <div className="text-lg font-black tracking-tight">Kitchen Dashboard</div>
          </div>
          <div className="hidden text-right text-sm md:block">
            <div className="font-bold tabular-nums">{activeTickets.length} active</div>
            <div className="text-xs text-muted-foreground">orders in queue</div>
          </div>
          <div className="flex rounded-lg border border-border bg-muted p-1">
            <TabBtn active={tab === "cook"} onClick={() => setTab("cook")}>Cook</TabBtn>
            <TabBtn active={tab === "inventory"} onClick={() => setTab("inventory")}>Inventory</TabBtn>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        {/* Bell alerts */}
        {data && data.bells.length > 0 && (
          <section className="rounded-2xl border-2 border-primary bg-card p-4" style={{ boxShadow: "var(--shadow-card)" }}>
            <div className="mb-3 flex items-center gap-2 text-primary">
              <Bell className="h-5 w-5 animate-pulse" />
              <h2 className="font-black uppercase tracking-wide">{data.bells.length} customer alert(s)</h2>
            </div>
            <ul className="space-y-2">
              {data.bells.map((b) => {
                const t = activeTickets.find((x) => x.id === b.ticket_id);
                return (
                  <li key={b.id} className="flex items-center gap-3 rounded-lg bg-muted px-3 py-2">
                    <span className="rounded-md bg-primary px-2 py-0.5 text-sm font-bold text-primary-foreground">
                      Table {t?.table_number ?? "?"}
                    </span>
                    <span className="flex-1 text-sm">
                      Queue #{t?.queue_number ?? "?"} is asking for service
                    </span>
                    <button
                      onClick={() => ackBell.mutate(b.id)}
                      className="rounded-lg bg-foreground px-3 py-1.5 text-sm font-semibold text-background hover:opacity-90"
                    >
                      Acknowledge
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {tab === "cook" && (
          <>
            <section>
              <h2 className="mb-3 text-xl font-black">Cooking Batches</h2>
              {isLoading && <p className="text-muted-foreground">Loading…</p>}
              {batches.length === 0 && !isLoading && (
                <div className="rounded-2xl bg-card p-8 text-center text-muted-foreground" style={{ boxShadow: "var(--shadow-card)" }}>
                  No active orders. The kitchen is calm. 🍜
                </div>
              )}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {batches.map((b) => (
                  <div
                    key={b.dish.id}
                    className="flex flex-col rounded-2xl bg-card p-5"
                    style={{ boxShadow: "var(--shadow-card)" }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-lg font-bold">{b.dish.name}</h3>
                      <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary text-2xl font-black text-primary-foreground tabular-nums">
                        {b.total}
                      </div>
                    </div>
                    <ul className="mt-3 flex-1 space-y-1 text-sm">
                      {b.tickets.map(({ ticket, qty }) => (
                        <li key={ticket.id} className="flex items-center justify-between text-muted-foreground">
                          <span>
                            <span className="font-semibold text-foreground">#{ticket.queue_number}</span>
                            <span className="ml-2">Table {ticket.table_number}</span>
                          </span>
                          <span className="tabular-nums">× {qty}</span>
                        </li>
                      ))}
                    </ul>
                    <button
                      disabled={completeBatch.isPending}
                      onClick={() => completeBatch.mutate(b.dish.id)}
                      className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground hover:opacity-95 disabled:opacity-60"
                    >
                      <Check className="h-4 w-4" />
                      Complete Batch
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-black">Active Tickets</h2>
              <div className="overflow-hidden rounded-2xl bg-card" style={{ boxShadow: "var(--shadow-card)" }}>
                <table className="w-full text-sm">
                  <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2">Queue</th>
                      <th className="px-4 py-2">Table</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">Waiting</th>
                      <th className="px-4 py-2">Items</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeTickets.map((t) => {
                      const its = data!.items.filter((i) => i.ticket_id === t.id);
                      const done = its.filter((i) => i.status === "done").length;
                      const ageMin = Math.floor((now - new Date(t.created_at).getTime()) / 60000);
                      return (
                        <tr key={t.id} className="border-t border-border">
                          <td className="px-4 py-2 font-black tabular-nums">#{t.queue_number}</td>
                          <td className="px-4 py-2">{t.table_number}</td>
                          <td className="px-4 py-2"><StatusBadge status={t.status} /></td>
                          <td className="px-4 py-2 text-muted-foreground">
                            <Clock className="mr-1 inline h-3 w-3" />
                            {ageMin}m
                          </td>
                          <td className="px-4 py-2 tabular-nums text-muted-foreground">{done}/{its.length}</td>
                        </tr>
                      );
                    })}
                    {activeTickets.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No tickets.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {tab === "inventory" && data && (
          <section>
            <h2 className="mb-3 text-xl font-black">Inventory</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Toggle a dish off and every customer device updates instantly.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {data.dishes.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center gap-4 rounded-2xl bg-card p-4"
                  style={{ boxShadow: "var(--shadow-card)" }}
                >
                  <ShoppingBag className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="font-bold">{d.name}</div>
                    <div className="text-sm text-muted-foreground">{formatVnd(d.price)}</div>
                  </div>
                  <button
                    onClick={() => toggleDish.mutate(d.id)}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition ${
                      d.is_available
                        ? "bg-[color:var(--herb)] text-white hover:opacity-90"
                        : "bg-muted text-muted-foreground hover:bg-border"
                    }`}
                  >
                    <Power className="h-4 w-4" />
                    {d.is_available ? "Available" : "Sold out"}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
        active ? "bg-card text-foreground shadow" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: Ticket["status"] }) {
  const map = {
    waiting: { label: "Waiting", cls: "bg-secondary text-secondary-foreground" },
    in_progress: { label: "Cooking", cls: "bg-primary text-primary-foreground" },
    served: { label: "Served", cls: "bg-muted text-muted-foreground" },
  } as const;
  const s = map[status];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${s.cls}`}>{s.label}</span>;
}