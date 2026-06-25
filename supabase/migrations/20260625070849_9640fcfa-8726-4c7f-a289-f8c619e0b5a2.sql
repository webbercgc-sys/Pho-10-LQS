
-- ============ ENUMS ============
CREATE TYPE public.ticket_status AS ENUM ('waiting', 'in_progress', 'served');
CREATE TYPE public.item_status AS ENUM ('pending', 'done');

-- ============ DISHES ============
CREATE TABLE public.dishes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  price integer NOT NULL CHECK (price >= 0),
  is_available boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.dishes TO anon, authenticated;
GRANT ALL ON public.dishes TO service_role;
ALTER TABLE public.dishes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dishes are public" ON public.dishes FOR SELECT TO anon, authenticated USING (true);

-- ============ TICKETS ============
CREATE SEQUENCE public.tickets_queue_seq START 1;

CREATE TABLE public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_number integer NOT NULL UNIQUE DEFAULT nextval('public.tickets_queue_seq'),
  table_number integer NOT NULL CHECK (table_number > 0),
  status public.ticket_status NOT NULL DEFAULT 'waiting',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tickets TO anon, authenticated;
GRANT ALL ON public.tickets TO service_role;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tickets are public read" ON public.tickets FOR SELECT TO anon, authenticated USING (true);

-- ============ TICKET ITEMS ============
CREATE TABLE public.ticket_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  dish_id uuid NOT NULL REFERENCES public.dishes(id),
  quantity integer NOT NULL CHECK (quantity >= 1),
  status public.item_status NOT NULL DEFAULT 'pending',
  completed_at timestamptz
);
CREATE INDEX ticket_items_ticket_idx ON public.ticket_items(ticket_id);
CREATE INDEX ticket_items_dish_status_idx ON public.ticket_items(dish_id, status);
GRANT SELECT ON public.ticket_items TO anon, authenticated;
GRANT ALL ON public.ticket_items TO service_role;
ALTER TABLE public.ticket_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ticket items public read" ON public.ticket_items FOR SELECT TO anon, authenticated USING (true);

-- ============ BELL ALERTS ============
CREATE TABLE public.bell_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL UNIQUE REFERENCES public.tickets(id) ON DELETE CASCADE,
  acknowledged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bell_alerts TO anon, authenticated;
GRANT ALL ON public.bell_alerts TO service_role;
ALTER TABLE public.bell_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bell alerts public read" ON public.bell_alerts FOR SELECT TO anon, authenticated USING (true);

-- ============ updated_at TRIGGER ============
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER tickets_touch BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ RPC: place_order ============
-- p_items: jsonb array of { dish_id: uuid, quantity: int }
CREATE OR REPLACE FUNCTION public.place_order(p_table_number integer, p_items jsonb)
RETURNS public.tickets
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ticket public.tickets;
  v_item jsonb;
  v_dish_id uuid;
  v_qty integer;
  v_avail boolean;
  v_dish_name text;
BEGIN
  IF p_table_number IS NULL OR p_table_number <= 0 THEN
    RAISE EXCEPTION 'invalid_table_number';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'empty_order';
  END IF;

  -- Validate each dish exists and is available
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_dish_id := (v_item->>'dish_id')::uuid;
    v_qty := COALESCE((v_item->>'quantity')::int, 0);
    IF v_qty < 1 THEN
      RAISE EXCEPTION 'invalid_quantity';
    END IF;
    SELECT is_available, name INTO v_avail, v_dish_name FROM public.dishes WHERE id = v_dish_id;
    IF v_avail IS NULL THEN
      RAISE EXCEPTION 'dish_not_found';
    END IF;
    IF NOT v_avail THEN
      RAISE EXCEPTION 'dish_unavailable: %', v_dish_name;
    END IF;
  END LOOP;

  INSERT INTO public.tickets(table_number) VALUES (p_table_number) RETURNING * INTO v_ticket;

  INSERT INTO public.ticket_items(ticket_id, dish_id, quantity)
  SELECT v_ticket.id, (e->>'dish_id')::uuid, (e->>'quantity')::int
  FROM jsonb_array_elements(p_items) e;

  RETURN v_ticket;
END $$;
GRANT EXECUTE ON FUNCTION public.place_order(integer, jsonb) TO anon, authenticated;

-- ============ RPC: ring_bell ============
CREATE OR REPLACE FUNCTION public.ring_bell(p_ticket_id uuid)
RETURNS public.bell_alerts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ticket public.tickets;
  v_alert public.bell_alerts;
BEGIN
  SELECT * INTO v_ticket FROM public.tickets WHERE id = p_ticket_id;
  IF v_ticket.id IS NULL THEN RAISE EXCEPTION 'ticket_not_found'; END IF;
  IF now() - v_ticket.created_at < interval '10 minutes' THEN
    RAISE EXCEPTION 'bell_too_early';
  END IF;
  INSERT INTO public.bell_alerts(ticket_id) VALUES (p_ticket_id)
  ON CONFLICT (ticket_id) DO NOTHING
  RETURNING * INTO v_alert;
  IF v_alert.id IS NULL THEN
    SELECT * INTO v_alert FROM public.bell_alerts WHERE ticket_id = p_ticket_id;
  END IF;
  RETURN v_alert;
END $$;
GRANT EXECUTE ON FUNCTION public.ring_bell(uuid) TO anon, authenticated;

-- ============ RPC: acknowledge_bell ============
CREATE OR REPLACE FUNCTION public.acknowledge_bell(p_alert_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.bell_alerts SET acknowledged = true WHERE id = p_alert_id;
$$;
GRANT EXECUTE ON FUNCTION public.acknowledge_bell(uuid) TO anon, authenticated;

-- ============ RPC: complete_dish_batch ============
-- Marks all pending items of the given dish as done.
-- Tickets whose items are all done become 'served'.
-- Tickets that still have pending items but at least one done become 'in_progress'.
CREATE OR REPLACE FUNCTION public.complete_dish_batch(p_dish_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer;
BEGIN
  WITH updated AS (
    UPDATE public.ticket_items
    SET status = 'done', completed_at = now()
    WHERE dish_id = p_dish_id AND status = 'pending'
    RETURNING ticket_id
  )
  SELECT count(*) INTO v_count FROM updated;

  -- Mark tickets fully served
  UPDATE public.tickets t SET status = 'served'
  WHERE t.status <> 'served'
    AND NOT EXISTS (
      SELECT 1 FROM public.ticket_items ti WHERE ti.ticket_id = t.id AND ti.status = 'pending'
    );

  -- Mark partially-cooked tickets as in_progress
  UPDATE public.tickets t SET status = 'in_progress'
  WHERE t.status = 'waiting'
    AND EXISTS (SELECT 1 FROM public.ticket_items ti WHERE ti.ticket_id = t.id AND ti.status = 'done')
    AND EXISTS (SELECT 1 FROM public.ticket_items ti WHERE ti.ticket_id = t.id AND ti.status = 'pending');

  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.complete_dish_batch(uuid) TO anon, authenticated;

-- ============ RPC: toggle_dish_availability ============
CREATE OR REPLACE FUNCTION public.toggle_dish_availability(p_dish_id uuid)
RETURNS public.dishes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_dish public.dishes;
BEGIN
  UPDATE public.dishes SET is_available = NOT is_available
  WHERE id = p_dish_id RETURNING * INTO v_dish;
  IF v_dish.id IS NULL THEN RAISE EXCEPTION 'dish_not_found'; END IF;
  RETURN v_dish;
END $$;
GRANT EXECUTE ON FUNCTION public.toggle_dish_availability(uuid) TO anon, authenticated;

-- ============ REALTIME ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.dishes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bell_alerts;
ALTER TABLE public.dishes REPLICA IDENTITY FULL;
ALTER TABLE public.tickets REPLICA IDENTITY FULL;
ALTER TABLE public.ticket_items REPLICA IDENTITY FULL;
ALTER TABLE public.bell_alerts REPLICA IDENTITY FULL;
