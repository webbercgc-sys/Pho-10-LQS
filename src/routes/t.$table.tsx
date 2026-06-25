import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Bell, Minus, Plus, ShoppingBag, ArrowLeft, Check, ChefHat, CircleDot, Wallet, PartyPopper } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatVnd } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/t/$table")({
  head: ({ params }) => ({
    meta: [
      { title: `Table ${params.table} — Phở 10` },
      { name: "description", content: `Order from your phone at table ${params.table}.` },
    ],
  }),
  component: TableView,
});

type Dish = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_available: boolean;
  sort_order: number;
};
type Ticket = {
  id: string;
  queue_number: number;
  table_number: number;
  status: "waiting" | "in_progress" | "served";
  payment_status: "none" | "requested" | "paid";
  created_at: string;
  cancelled_at: string | null;
};
type TicketItem = {
  id: string;
  ticket_id: string;
  dish_id: string;
  quantity: number;
  status: "pending" | "done";
};

const BELL_WAIT_MS = 10 * 60 * 1000;

function storageKey(table: string) {
  return `pho10:ticket:${table}`;
}

function TableView() {
  const { table } = Route.useParams();
  const qc = useQueryClient();
  const [ticketId, setTicketId] = useState<string | null>(null);

  useEffect(() => {
    setTicketId(localStorage.getItem(storageKey(table)));
  }, [table]);

  // Live dishes
  useEffect(() => {
    const ch = supabase
      .channel(`dishes-customer-${table}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "dishes" }, () => {
        qc.invalidateQueries({ queryKey: ["dishes"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc, table]);

  if (ticketId) {
    return (
      <TicketView
        ticketId={ticketId}
        table={table}
        onReset={() => {
          localStorage.removeItem(storageKey(table));
          setTicketId(null);
        }}
      />
    );
  }

  return (
    <MenuView
      table={table}
      onPlaced={(id) => {
        localStorage.setItem(storageKey(table), id);
        setTicketId(id);
      }}
    />
  );
}

// ───────────────────────── MENU + CART ─────────────────────────

function MenuView({ table, onPlaced }: { table: string; onPlaced: (id: string) => void }) {
  const [cart, setCart] = useState<Record<string, number>>({});

  const { data: dishes = [], isLoading } = useQuery({
    queryKey: ["dishes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dishes")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as Dish[];
    },
  });

  const placeOrder = useMutation({
    mutationFn: async () => {
      const items = Object.entries(cart)
        .filter(([, q]) => q > 0)
        .map(([dish_id, quantity]) => ({ dish_id, quantity }));
      if (items.length === 0) throw new Error("Cart is empty");
      const { data, error } = await supabase.rpc("place_order", {
        p_table_number: Number(table),
        p_items: items,
      });
      if (error) throw error;
      return data as Ticket;
    },
    onSuccess: (ticket) => {
      toast.success(`Order placed — queue #${ticket.queue_number}`);
      onPlaced(ticket.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totals = useMemo(() => {
    let count = 0;
    let total = 0;
    for (const d of dishes) {
      const q = cart[d.id] ?? 0;
      count += q;
      total += q * d.price;
    }
    return { count, total };
  }, [cart, dishes]);

  function setQty(id: string, q: number) {
    setCart((c) => ({ ...c, [id]: Math.max(0, q) }));
  }

  return (
    <div className="min-h-screen pb-32" style={{ background: "var(--gradient-warm)" }}>
      <Header table={table} />

      <main className="mx-auto max-w-2xl px-4 py-6">
        <h2 className="text-2xl font-black tracking-tight">Menu</h2>
        <p className="text-sm text-muted-foreground">Tap to add. Unavailable items appear faded.</p>

        <div className="mt-5 space-y-3">
          {isLoading && <div className="text-muted-foreground">Loading menu…</div>}
          {dishes.map((d) => {
            const q = cart[d.id] ?? 0;
            const off = !d.is_available;
            return (
              <div
                key={d.id}
                className={`flex items-center gap-3 rounded-2xl bg-card p-4 ${off ? "opacity-50" : ""}`}
                style={{ boxShadow: "var(--shadow-card)" }}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold">{d.name}</h3>
                    {off && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        Sold out
                      </span>
                    )}
                  </div>
                  {d.description && (
                    <p className="text-sm text-muted-foreground">{d.description}</p>
                  )}
                  <div className="mt-1 font-semibold text-primary">{formatVnd(d.price)}</div>
                </div>
                {!off && (
                  <QtyStepper q={q} onChange={(v) => setQty(d.id, v)} />
                )}
              </div>
            );
          })}
        </div>
      </main>

      {totals.count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <div className="flex-1">
              <div className="text-xs text-muted-foreground">{totals.count} item(s)</div>
              <div className="text-lg font-black">{formatVnd(totals.total)}</div>
            </div>
            <button
              disabled={placeOrder.isPending}
              onClick={() => placeOrder.mutate()}
              className="btn-press btn-glow flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground disabled:opacity-60"
            >
              <ShoppingBag className="h-4 w-4" />
              {placeOrder.isPending ? "Placing…" : "Place Order"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function QtyStepper({ q, onChange }: { q: number; onChange: (q: number) => void }) {
  if (q === 0) {
    return (
      <button
        onClick={() => onChange(1)}
        className="btn-press grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground"
        aria-label="Add"
      >
        <Plus className="h-5 w-5" />
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-full bg-muted p-1">
      <button onClick={() => onChange(q - 1)} className="btn-press grid h-8 w-8 place-items-center rounded-full bg-card" aria-label="Remove">
        <Minus className="h-4 w-4" />
      </button>
      <span className="w-6 text-center font-bold">{q}</span>
      <button onClick={() => onChange(q + 1)} className="btn-press grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground" aria-label="Add">
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

// ───────────────────────── TICKET VIEW ─────────────────────────

function TicketView({
  ticketId,
  table,
  onReset,
}: {
  ticketId: string;
  table: string;
  onReset: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["ticket", ticketId],
    queryFn: async () => {
      const [ticketRes, itemsRes, dishesRes, bellRes] = await Promise.all([
        supabase.from("tickets").select("*").eq("id", ticketId).maybeSingle(),
        supabase.from("ticket_items").select("*").eq("ticket_id", ticketId),
        supabase.from("dishes").select("id,name,price"),
        supabase.from("bell_alerts").select("*").eq("ticket_id", ticketId).maybeSingle(),
      ]);
      if (ticketRes.error) throw ticketRes.error;
      if (!ticketRes.data) throw new Error("not_found");
      if (itemsRes.error) throw itemsRes.error;
      if (dishesRes.error) throw dishesRes.error;
      return {
        ticket: ticketRes.data as Ticket,
        items: (itemsRes.data ?? []) as TicketItem[],
        dishes: (dishesRes.data ?? []) as Pick<Dish, "id" | "name" | "price">[],
        bell: bellRes.data as { id: string; acknowledged: boolean } | null,
      };
    },
  });

  // Realtime: refetch on changes touching this ticket
  useEffect(() => {
    const ch = supabase
      .channel(`ticket-${ticketId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets", filter: `id=eq.${ticketId}` }, () => {
        qc.invalidateQueries({ queryKey: ["ticket", ticketId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "ticket_items", filter: `ticket_id=eq.${ticketId}` }, () => {
        qc.invalidateQueries({ queryKey: ["ticket", ticketId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "bell_alerts", filter: `ticket_id=eq.${ticketId}` }, () => {
        qc.invalidateQueries({ queryKey: ["ticket", ticketId] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [ticketId, qc]);

  const ringBell = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("ring_bell", { p_ticket_id: ticketId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Bell rung — staff has been notified.");
      qc.invalidateQueries({ queryKey: ["ticket", ticketId] });
    },
    onError: (e: Error) => {
      const msg = e.message.includes("bell_too_early")
        ? "Please wait 10 minutes before ringing."
        : e.message;
      toast.error(msg);
    },
  });

  const requestPayment = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("request_payment", { p_ticket_id: ticketId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payment requested — staff will confirm shortly.");
      qc.invalidateQueries({ queryKey: ["ticket", ticketId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) {
    return (
      <div className="min-h-screen" style={{ background: "var(--gradient-warm)" }}>
        <Header table={table} />
        <div className="p-8 text-center text-muted-foreground">Loading your ticket…</div>
      </div>
    );
  }

  const { ticket, items, dishes, bell } = data;
  const dishById = new Map(dishes.map((d) => [d.id, d]));
  const totalCount = items.reduce((s, i) => s + i.quantity, 0);
  const doneCount = items.filter((i) => i.status === "done").reduce((s, i) => s + i.quantity, 0);
  const total = items.reduce((s, i) => s + i.quantity * (dishById.get(i.dish_id)?.price ?? 0), 0);

  const elapsed = now - new Date(ticket.created_at).getTime();
  const pct = Math.min(100, Math.round((elapsed / BELL_WAIT_MS) * 100));
  const isPaid = ticket.payment_status === "paid";
  const isClosed = isPaid || !!ticket.cancelled_at;
  const isServed = ticket.status === "served";
  const hideBell = isClosed || isServed;
  const canRing = elapsed >= BELL_WAIT_MS && !bell && !hideBell;
  const remainingMs = Math.max(0, BELL_WAIT_MS - elapsed);
  const mm = Math.floor(remainingMs / 60000);
  const ss = Math.floor((remainingMs % 60000) / 1000);

  const statusLabel = {
    waiting: "Waiting to be cooked",
    in_progress: "Cooking now",
    served: "Served — enjoy!",
  }[ticket.status];

  // Thank you screen — paid → auto return home
  if (isPaid) {
    return <ThankYouView table={table} onDone={() => {
      onReset();
      navigate({ to: "/" });
    }} />;
  }

  // Cancelled by staff
  if (ticket.cancelled_at) {
    return (
      <div className="min-h-screen pb-12" style={{ background: "var(--gradient-warm)" }}>
        <Header table={table} />
        <main className="mx-auto max-w-2xl px-4 py-10 text-center">
          <div className="rounded-3xl bg-card p-8 anim-pop" style={{ boxShadow: "var(--shadow-card)" }}>
            <h2 className="text-2xl font-black">Order cancelled</h2>
            <p className="mt-2 text-sm text-muted-foreground">Staff cancelled this ticket. Please start a new order.</p>
            <button onClick={onReset} className="btn-press btn-glow mt-6 rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground">
              Start new order
            </button>
          </div>
        </main>
      </div>
    );
  }

  const paymentRequested = ticket.payment_status === "requested";

  return (
    <div className="min-h-screen pb-12" style={{ background: "var(--gradient-warm)" }}>
      <Header table={table} />
      <main className="mx-auto max-w-2xl px-4 py-6 space-y-5">
        {/* Queue card */}
        <div
          className="rounded-3xl p-7 text-primary-foreground"
          style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-bowl)" }}
        >
          <div className="text-sm font-semibold uppercase tracking-widest opacity-90">Your Queue</div>
          <div className="mt-2 text-7xl font-black tabular-nums">#{ticket.queue_number}</div>
          <div className="mt-1 text-base opacity-95">Table {ticket.table_number} · {statusLabel}</div>
        </div>

        {/* Status bar */}
        <div className="rounded-2xl bg-card p-5" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">Cooking progress</span>
            <span className="text-muted-foreground tabular-nums">{doneCount}/{totalCount} items</span>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${totalCount ? Math.round((doneCount / totalCount) * 100) : 0}%` }}
            />
          </div>

          <ul className="mt-4 space-y-2">
            {items.map((it) => {
              const d = dishById.get(it.dish_id);
              return (
                <li key={it.id} className="flex items-center gap-3">
                  {it.status === "done" ? (
                    <Check className="h-5 w-5 text-[color:var(--herb)]" />
                  ) : (
                    <CircleDot className="h-5 w-5 text-muted-foreground" />
                  )}
                  <span className={`flex-1 ${it.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                    {d?.name ?? "—"} <span className="text-muted-foreground">× {it.quantity}</span>
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatVnd((d?.price ?? 0) * it.quantity)}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-lg font-black">{formatVnd(total)}</span>
          </div>
        </div>

        {/* Payment */}
        <div className="rounded-2xl bg-card p-5 anim-pop" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Wallet className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="font-bold">Ready to pay?</div>
              <div className="text-sm text-muted-foreground">
                {paymentRequested
                  ? "Payment requested — please wait while staff confirms."
                  : "Tap to ask staff for the bill. They'll come to confirm payment."}
              </div>
            </div>
          </div>
          <button
            disabled={paymentRequested || requestPayment.isPending}
            onClick={() => requestPayment.mutate()}
            className="btn-press btn-glow mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Wallet className="h-4 w-4" />
            {paymentRequested ? "Awaiting confirmation…" : "Request Payment"}
          </button>
        </div>

        {/* Bell — hidden once served or paid */}
        {!hideBell && (
        <div className="rounded-2xl bg-card p-5" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-secondary text-secondary-foreground">
              <Bell className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="font-bold">Need help?</div>
              <div className="text-sm text-muted-foreground">
                {bell
                  ? bell.acknowledged
                    ? "A staff member is on the way."
                    : "Bell sent — please wait."
                  : canRing
                    ? "Tap the bell to call staff."
                    : `Available in ${mm}:${String(ss).padStart(2, "0")}`}
              </div>
            </div>
          </div>
          {!canRing && !bell && (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-secondary transition-all" style={{ width: `${pct}%` }} />
            </div>
          )}
          <button
            disabled={!canRing || ringBell.isPending}
            onClick={() => ringBell.mutate()}
            className="btn-press btn-glow mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Bell className="h-4 w-4" />
            Ring Bell
          </button>
        </div>
        )}

        <Link to="/kitchen" className="block text-center text-xs text-muted-foreground hover:underline">
          <ChefHat className="mr-1 inline h-3 w-3" />
          Open kitchen view (demo)
        </Link>
      </main>
    </div>
  );
}

function ThankYouView({ table, onDone }: { table: string; onDone: () => void }) {
  const [count, setCount] = useState(6);
  useEffect(() => {
    if (count <= 0) { onDone(); return; }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count, onDone]);
  return (
    <div className="min-h-screen grid place-items-center px-4" style={{ background: "var(--gradient-warm)" }}>
      <div className="anim-bounce-in max-w-md text-center rounded-3xl bg-card p-10" style={{ boxShadow: "var(--shadow-bowl)" }}>
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full" style={{ background: "var(--gradient-hero)" }}>
          <PartyPopper className="h-10 w-10 text-primary-foreground" />
        </div>
        <h1 className="mt-6 text-3xl font-black">Cảm ơn quý khách!</h1>
        <p className="mt-2 text-muted-foreground">
          Thanh toán đã được xác nhận tại Table {table}. Hẹn gặp lại tại Phở 10!
        </p>
        <button onClick={onDone} className="btn-press btn-glow mt-6 w-full rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground">
          Back to home now
        </button>
        <p className="mt-3 text-xs text-muted-foreground">Returning in {count}s…</p>
      </div>
    </div>
  );
}

// ───────────────────────── Shared header ─────────────────────────

function Header({ table }: { table: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-card/90 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
        <Link to="/" className="btn-press grid h-9 w-9 place-items-center rounded-lg bg-muted text-foreground hover:bg-border">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <div className="text-xs font-semibold uppercase tracking-widest text-primary">Phở 10</div>
          <div className="text-sm font-bold">Table {table}</div>
        </div>
      </div>
    </header>
  );
}