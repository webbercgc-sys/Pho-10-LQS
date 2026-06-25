import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  Bell, ChefHat, ArrowLeft, Check, Power, Clock, ShoppingBag,
  Wallet, LogOut, History, X, Plus, Minus, RotateCcw, Trash2, AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatVnd } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/kitchen")({
  head: () => ({
    meta: [
      { title: "Kitchen — Phở 10" },
      { name: "description", content: "Live cooking queue, payments and history." },
    ],
  }),
  component: Kitchen,
});

type Dish = { id: string; name: string; price: number; is_available: boolean; sort_order: number };
type Ticket = {
  id: string; queue_number: number; table_number: number;
  status: "waiting" | "in_progress" | "served";
  payment_status: "none" | "requested" | "paid";
  created_at: string; updated_at: string;
  payment_requested_at: string | null; paid_at: string | null;
  closed_at: string | null; cancelled_at: string | null;
};
type TicketItem = { id: string; ticket_id: string; dish_id: string; quantity: number; status: "pending" | "done" };
type BellRow = { id: string; ticket_id: string; acknowledged: boolean; created_at: string };

type Tab = "cook" | "pay" | "history" | "inventory";

function Kitchen() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("cook");
  const [now, setNow] = useState(() => Date.now());
  const [tableFilter, setTableFilter] = useState<string>("all");

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(i);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["kitchen"],
    queryFn: async () => {
      const [dishesRes, ticketsRes, itemsRes, bellsRes] = await Promise.all([
        supabase.from("dishes").select("*").order("sort_order"),
        supabase.from("tickets").select("*").order("created_at"),
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
        bells: bellsRes.data as BellRow[],
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
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const completeBatch = useMutation({
    mutationFn: async (vars: { dishId: string; tableNumber?: number }) => {
      const { data, error } = await supabase.rpc("complete_dish_batch", { p_dish_id: vars.dishId });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => { toast.success(`Marked ${n} item(s) done.`); },
    onError: (e: Error) => toast.error(e.message),
  });

  const ackBell = useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase.rpc("acknowledge_bell", { p_alert_id: alertId });
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleDish = useMutation({
    mutationFn: async (dishId: string) => {
      const { error } = await supabase.rpc("toggle_dish_availability", { p_dish_id: dishId });
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmPayment = useMutation({
    mutationFn: async (ticketId: string) => {
      const { error } = await supabase.rpc("confirm_payment", { p_ticket_id: ticketId });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Payment confirmed."),
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelTicket = useMutation({
    mutationFn: async (ticketId: string) => {
      const { error } = await supabase.rpc("cancel_ticket", { p_ticket_id: ticketId });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Ticket cancelled."),
    onError: (e: Error) => toast.error(e.message),
  });

  const reopenTicket = useMutation({
    mutationFn: async (ticketId: string) => {
      const { error } = await supabase.rpc("reopen_ticket", { p_ticket_id: ticketId });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Ticket reopened."),
    onError: (e: Error) => toast.error(e.message),
  });

  const updateItemQty = useMutation({
    mutationFn: async (vars: { itemId: string; qty: number }) => {
      const { error } = await supabase.rpc("update_ticket_item_quantity", {
        p_item_id: vars.itemId, p_quantity: vars.qty,
      });
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.rpc("delete_ticket_item", { p_item_id: itemId });
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  // Active = not paid, not cancelled
  const activeTickets = (data?.tickets ?? []).filter(t => t.payment_status !== "paid" && !t.cancelled_at);
  const cookingTickets = activeTickets.filter(t => t.status !== "served");
  const awaitingPayment = activeTickets.filter(t => t.status === "served" || t.payment_status === "requested");
  const tablesInPlay = Array.from(new Set(cookingTickets.map(t => t.table_number))).sort((a, b) => a - b);

  // Cooking batches: grouped by table, then by dish. FCFS by earliest ticket created_at.
  type Batch = { dish: Dish; total: number; tickets: { ticket: Ticket; qty: number }[]; earliest: number };
  const batchesByTable = useMemo(() => {
    if (!data) return [] as { table: number; earliest: number; batches: Batch[] }[];
    const dishById = new Map(data.dishes.map(d => [d.id, d]));
    const ticketById = new Map(cookingTickets.map(t => [t.id, t]));
    const map = new Map<number, Map<string, Batch>>();
    for (const it of data.items) {
      if (it.status !== "pending") continue;
      const ticket = ticketById.get(it.ticket_id);
      if (!ticket) continue;
      const dish = dishById.get(it.dish_id);
      if (!dish) continue;
      let perTable = map.get(ticket.table_number);
      if (!perTable) { perTable = new Map(); map.set(ticket.table_number, perTable); }
      let entry = perTable.get(dish.id);
      if (!entry) {
        entry = { dish, total: 0, tickets: [], earliest: Number.POSITIVE_INFINITY };
        perTable.set(dish.id, entry);
      }
      entry.total += it.quantity;
      entry.tickets.push({ ticket, qty: it.quantity });
      const ts = new Date(ticket.created_at).getTime();
      if (ts < entry.earliest) entry.earliest = ts;
    }
    const rows = Array.from(map.entries()).map(([table, perTable]) => {
      const batches = Array.from(perTable.values()).sort((a, b) => a.earliest - b.earliest);
      const earliest = batches.reduce((m, b) => Math.min(m, b.earliest), Number.POSITIVE_INFINITY);
      return { table, earliest, batches };
    });
    return rows.sort((a, b) => a.earliest - b.earliest);
  }, [data, cookingTickets]);

  const filteredBatchRows = tableFilter === "all"
    ? batchesByTable
    : batchesByTable.filter(r => String(r.table) === tableFilter);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Link to="/" className="btn-press grid h-9 w-9 place-items-center rounded-lg bg-muted hover:bg-border">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <ChefHat className="h-6 w-6 text-primary" />
          <div className="flex-1 min-w-[140px]">
            <div className="text-xs font-semibold uppercase tracking-widest text-primary">Phở 10</div>
            <div className="text-lg font-black tracking-tight">Kitchen Dashboard</div>
          </div>
          <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted p-1">
            <TabBtn active={tab === "cook"} onClick={() => setTab("cook")} count={cookingTickets.length}>Cook</TabBtn>
            <TabBtn active={tab === "pay"} onClick={() => setTab("pay")} count={awaitingPayment.length} highlight>Pay</TabBtn>
            <TabBtn active={tab === "history"} onClick={() => setTab("history")}><History className="h-3 w-3" /></TabBtn>
            <TabBtn active={tab === "inventory"} onClick={() => setTab("inventory")}>Inv</TabBtn>
          </div>
          <button onClick={signOut} className="btn-press grid h-9 w-9 place-items-center rounded-lg bg-muted hover:bg-border" title="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        {data && data.bells.length > 0 && (
          <section className="rounded-2xl border-2 border-primary bg-card p-4 anim-pop" style={{ boxShadow: "var(--shadow-card)" }}>
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
                    <span className="flex-1 text-sm">Queue #{t?.queue_number ?? "?"} is asking for service</span>
                    <button onClick={() => ackBell.mutate(b.id)} className="btn-press rounded-lg bg-foreground px-3 py-1.5 text-sm font-semibold text-background">
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
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-black flex-1">Cooking Batches</h2>
                <div className="flex flex-wrap gap-1">
                  <FilterChip active={tableFilter === "all"} onClick={() => setTableFilter("all")}>All tables</FilterChip>
                  {tablesInPlay.map(n => (
                    <FilterChip key={n} active={tableFilter === String(n)} onClick={() => setTableFilter(String(n))}>
                      Table {n}
                    </FilterChip>
                  ))}
                </div>
              </div>
              {isLoading && <p className="text-muted-foreground">Loading…</p>}
              {filteredBatchRows.length === 0 && !isLoading && (
                <div className="rounded-2xl bg-card p-8 text-center text-muted-foreground" style={{ boxShadow: "var(--shadow-card)" }}>
                  No active orders. The kitchen is calm. 🍜
                </div>
              )}
              <div className="space-y-5">
                {filteredBatchRows.map((row) => (
                  <div key={row.table} className="rounded-2xl bg-card p-4" style={{ boxShadow: "var(--shadow-card)" }}>
                    <div className="mb-3 flex items-center gap-2">
                      <span className="rounded-md bg-secondary px-2 py-0.5 text-sm font-black text-secondary-foreground">Table {row.table}</span>
                      <span className="text-xs text-muted-foreground">earliest order {Math.floor((now - row.earliest) / 60000)}m ago</span>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {row.batches.map((b) => (
                        <div key={b.dish.id} className="flex flex-col rounded-xl border border-border bg-background p-4 anim-pop">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-base font-bold">{b.dish.name}</h3>
                            <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-xl font-black text-primary-foreground tabular-nums">
                              {b.total}
                            </div>
                          </div>
                          <ul className="mt-3 flex-1 space-y-1 text-xs">
                            {b.tickets
                              .slice()
                              .sort((a, b) => new Date(a.ticket.created_at).getTime() - new Date(b.ticket.created_at).getTime())
                              .map(({ ticket, qty }) => (
                                <li key={ticket.id} className="flex items-center justify-between text-muted-foreground">
                                  <span>
                                    <span className="font-semibold text-foreground">#{ticket.queue_number}</span>
                                    <span className="ml-2">{Math.floor((now - new Date(ticket.created_at).getTime()) / 60000)}m</span>
                                  </span>
                                  <span className="tabular-nums">× {qty}</span>
                                </li>
                              ))}
                          </ul>
                          <button
                            disabled={completeBatch.isPending}
                            onClick={() => completeBatch.mutate({ dishId: b.dish.id })}
                            className="btn-press btn-glow mt-3 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
                          >
                            <Check className="h-4 w-4" />
                            Complete Batch
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {tab === "pay" && (
          <section>
            <h2 className="mb-3 text-xl font-black flex items-center gap-2"><Wallet className="h-5 w-5" /> Awaiting Payment</h2>
            {awaitingPayment.length === 0 && (
              <div className="rounded-2xl bg-card p-8 text-center text-muted-foreground" style={{ boxShadow: "var(--shadow-card)" }}>
                No tickets are waiting to pay. 💸
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              {awaitingPayment
                .slice()
                .sort((a, b) => {
                  const aT = a.payment_requested_at ? new Date(a.payment_requested_at).getTime() : new Date(a.created_at).getTime();
                  const bT = b.payment_requested_at ? new Date(b.payment_requested_at).getTime() : new Date(b.created_at).getTime();
                  return aT - bT;
                })
                .map((t) => {
                  const its = data!.items.filter((i) => i.ticket_id === t.id);
                  const total = its.reduce((s, i) => {
                    const d = data!.dishes.find((d) => d.id === i.dish_id);
                    return s + i.quantity * (d?.price ?? 0);
                  }, 0);
                  const requested = t.payment_status === "requested";
                  return (
                    <div key={t.id} className={`rounded-2xl bg-card p-5 anim-pop ${requested ? "ring-2 ring-primary" : ""}`} style={{ boxShadow: "var(--shadow-card)" }}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Queue</div>
                          <div className="text-3xl font-black tabular-nums">#{t.queue_number}</div>
                          <div className="text-sm text-muted-foreground">Table {t.table_number}</div>
                        </div>
                        {requested && (
                          <span className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground animate-pulse">
                            Payment requested
                          </span>
                        )}
                        {!requested && t.status === "served" && (
                          <span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-secondary-foreground">
                            Served — waiting for customer
                          </span>
                        )}
                      </div>
                      <ul className="mt-3 space-y-1 text-sm">
                        {its.map((i) => {
                          const d = data!.dishes.find((d) => d.id === i.dish_id);
                          return (
                            <li key={i.id} className="flex justify-between text-muted-foreground">
                              <span>{d?.name ?? "—"} × {i.quantity}</span>
                              <span className="tabular-nums">{formatVnd((d?.price ?? 0) * i.quantity)}</span>
                            </li>
                          );
                        })}
                      </ul>
                      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                        <span className="text-sm text-muted-foreground">Total</span>
                        <span className="text-xl font-black">{formatVnd(total)}</span>
                      </div>
                      <button
                        disabled={confirmPayment.isPending}
                        onClick={() => confirmPayment.mutate(t.id)}
                        className="btn-press btn-glow mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground disabled:opacity-60"
                      >
                        <Check className="h-4 w-4" />
                        Confirm Payment Received
                      </button>
                    </div>
                  );
                })}
            </div>
          </section>
        )}

        {tab === "history" && data && (
          <HistorySection
            tickets={data.tickets}
            items={data.items}
            dishes={data.dishes}
            onCancel={(id) => cancelTicket.mutate(id)}
            onReopen={(id) => reopenTicket.mutate(id)}
            onUpdateQty={(itemId, qty) => updateItemQty.mutate({ itemId, qty })}
            onDeleteItem={(itemId) => deleteItem.mutate(itemId)}
          />
        )}

        {tab === "inventory" && data && (
          <section>
            <h2 className="mb-3 text-xl font-black">Inventory</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Toggle a dish off and every customer device updates instantly.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {data.dishes.map((d) => (
                <div key={d.id} className="flex items-center gap-4 rounded-2xl bg-card p-4" style={{ boxShadow: "var(--shadow-card)" }}>
                  <ShoppingBag className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="font-bold">{d.name}</div>
                    <div className="text-sm text-muted-foreground">{formatVnd(d.price)}</div>
                  </div>
                  <button
                    onClick={() => toggleDish.mutate(d.id)}
                    className={`btn-press flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${
                      d.is_available
                        ? "bg-[color:var(--herb)] text-white"
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

function TabBtn({
  active, onClick, children, count, highlight,
}: { active: boolean; onClick: () => void; children: React.ReactNode; count?: number; highlight?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`btn-press relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition ${
        active ? "bg-card text-foreground shadow" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
      {count != null && count > 0 && (
        <span className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-black ${
          highlight ? "bg-primary text-primary-foreground animate-pulse" : "bg-muted-foreground/20 text-foreground"
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`btn-press rounded-full px-3 py-1 text-xs font-semibold transition ${
      active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-border"
    }`}>
      {children}
    </button>
  );
}

function HistorySection({
  tickets, items, dishes, onCancel, onReopen, onUpdateQty, onDeleteItem,
}: {
  tickets: Ticket[]; items: TicketItem[]; dishes: Dish[];
  onCancel: (id: string) => void; onReopen: (id: string) => void;
  onUpdateQty: (itemId: string, qty: number) => void; onDeleteItem: (itemId: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const dishById = new Map(dishes.map((d) => [d.id, d]));
  const sorted = tickets.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  function ticketTotal(tid: string) {
    return items.filter((i) => i.ticket_id === tid).reduce((s, i) => s + i.quantity * (dishById.get(i.dish_id)?.price ?? 0), 0);
  }

  return (
    <section>
      <h2 className="mb-3 text-xl font-black flex items-center gap-2"><History className="h-5 w-5" /> Ticket History</h2>
      <div className="overflow-hidden rounded-2xl bg-card" style={{ boxShadow: "var(--shadow-card)" }}>
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Queue</th>
              <th className="px-4 py-2">Table</th>
              <th className="px-4 py-2">Created</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Total</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => {
              const isOpen = openId === t.id;
              const its = items.filter((i) => i.ticket_id === t.id);
              return (
                <React.Fragment key={t.id}>
                  <tr className="border-t border-border">
                    <td className="px-4 py-2 font-black tabular-nums">#{t.queue_number}</td>
                    <td className="px-4 py-2">{t.table_number}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {new Date(t.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2"><TicketStatus t={t} /></td>
                    <td className="px-4 py-2 text-right font-bold tabular-nums">{formatVnd(ticketTotal(t.id))}</td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => setOpenId(isOpen ? null : t.id)} className="btn-press text-xs font-semibold text-primary hover:underline">
                        {isOpen ? "Close" : "Edit"}
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-t border-border bg-muted/40">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="space-y-2">
                          {its.map((i) => {
                            const d = dishById.get(i.dish_id);
                            return (
                              <div key={i.id} className="flex items-center gap-2">
                                <span className="flex-1 text-sm">{d?.name ?? "—"}</span>
                                <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
                                  <button onClick={() => onUpdateQty(i.id, Math.max(1, i.quantity - 1))} className="btn-press grid h-7 w-7 place-items-center rounded-md hover:bg-muted">
                                    <Minus className="h-3 w-3" />
                                  </button>
                                  <span className="w-6 text-center text-sm font-bold tabular-nums">{i.quantity}</span>
                                  <button onClick={() => onUpdateQty(i.id, i.quantity + 1)} className="btn-press grid h-7 w-7 place-items-center rounded-md hover:bg-muted">
                                    <Plus className="h-3 w-3" />
                                  </button>
                                </div>
                                <button onClick={() => onDeleteItem(i.id)} className="btn-press grid h-8 w-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            );
                          })}
                          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                            {t.cancelled_at || t.payment_status === "paid" ? (
                              <button onClick={() => onReopen(t.id)} className="btn-press flex items-center gap-1 rounded-lg bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground">
                                <RotateCcw className="h-3 w-3" /> Reopen
                              </button>
                            ) : (
                              <button onClick={() => { if (confirm("Cancel this ticket?")) onCancel(t.id); }} className="btn-press flex items-center gap-1 rounded-lg bg-destructive px-3 py-1.5 text-xs font-bold text-destructive-foreground">
                                <X className="h-3 w-3" /> Cancel ticket
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No tickets yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TicketStatus({ t }: { t: Ticket }) {
  if (t.cancelled_at) return <Badge cls="bg-destructive text-destructive-foreground"><AlertTriangle className="h-3 w-3" /> Cancelled</Badge>;
  if (t.payment_status === "paid") return <Badge cls="bg-[color:var(--herb)] text-white"><Check className="h-3 w-3" /> Paid</Badge>;
  if (t.payment_status === "requested") return <Badge cls="bg-primary text-primary-foreground"><Wallet className="h-3 w-3" /> Pay requested</Badge>;
  if (t.status === "served") return <Badge cls="bg-secondary text-secondary-foreground">Served</Badge>;
  if (t.status === "in_progress") return <Badge cls="bg-primary text-primary-foreground">Cooking</Badge>;
  return <Badge cls="bg-muted text-muted-foreground">Waiting</Badge>;
}

function Badge({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${cls}`}>{children}</span>;
}

// React needed for Fragment
import React from "react";