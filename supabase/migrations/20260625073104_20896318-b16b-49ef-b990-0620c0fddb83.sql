
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'kitchen');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_kitchen_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'kitchen')
  )
$$;

-- Payment status
CREATE TYPE public.payment_status AS ENUM ('none', 'requested', 'paid');

ALTER TABLE public.tickets
  ADD COLUMN payment_status public.payment_status NOT NULL DEFAULT 'none',
  ADD COLUMN payment_requested_at timestamptz,
  ADD COLUMN paid_at timestamptz,
  ADD COLUMN closed_at timestamptz,
  ADD COLUMN cancelled_at timestamptz;

-- Request payment (customer)
CREATE OR REPLACE FUNCTION public.request_payment(p_ticket_id uuid)
RETURNS public.tickets LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ticket public.tickets;
BEGIN
  UPDATE public.tickets
  SET payment_status = 'requested',
      payment_requested_at = COALESCE(payment_requested_at, now()),
      updated_at = now()
  WHERE id = p_ticket_id
    AND payment_status <> 'paid'
    AND cancelled_at IS NULL
  RETURNING * INTO v_ticket;
  IF v_ticket.id IS NULL THEN RAISE EXCEPTION 'ticket_not_found_or_paid'; END IF;
  RETURN v_ticket;
END $$;

-- Confirm payment (kitchen)
CREATE OR REPLACE FUNCTION public.confirm_payment(p_ticket_id uuid)
RETURNS public.tickets LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ticket public.tickets;
BEGIN
  IF NOT public.is_kitchen_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.tickets
  SET payment_status = 'paid',
      paid_at = now(),
      closed_at = now(),
      updated_at = now()
  WHERE id = p_ticket_id
  RETURNING * INTO v_ticket;
  IF v_ticket.id IS NULL THEN RAISE EXCEPTION 'ticket_not_found'; END IF;
  RETURN v_ticket;
END $$;

-- Edit / delete ticket items (kitchen)
CREATE OR REPLACE FUNCTION public.update_ticket_item_quantity(p_item_id uuid, p_quantity integer)
RETURNS public.ticket_items LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_item public.ticket_items;
BEGIN
  IF NOT public.is_kitchen_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_quantity < 1 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;
  UPDATE public.ticket_items SET quantity = p_quantity WHERE id = p_item_id RETURNING * INTO v_item;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'item_not_found'; END IF;
  RETURN v_item;
END $$;

CREATE OR REPLACE FUNCTION public.delete_ticket_item(p_item_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_kitchen_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.ticket_items WHERE id = p_item_id;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_ticket(p_ticket_id uuid)
RETURNS public.tickets LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ticket public.tickets;
BEGIN
  IF NOT public.is_kitchen_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.tickets
  SET cancelled_at = now(), closed_at = now(), updated_at = now()
  WHERE id = p_ticket_id RETURNING * INTO v_ticket;
  IF v_ticket.id IS NULL THEN RAISE EXCEPTION 'ticket_not_found'; END IF;
  RETURN v_ticket;
END $$;

CREATE OR REPLACE FUNCTION public.reopen_ticket(p_ticket_id uuid)
RETURNS public.tickets LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ticket public.tickets;
BEGIN
  IF NOT public.is_kitchen_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.tickets
  SET cancelled_at = NULL, closed_at = NULL,
      payment_status = 'none', payment_requested_at = NULL, paid_at = NULL,
      status = 'waiting', updated_at = now()
  WHERE id = p_ticket_id RETURNING * INTO v_ticket;
  IF v_ticket.id IS NULL THEN RAISE EXCEPTION 'ticket_not_found'; END IF;
  RETURN v_ticket;
END $$;

-- Update complete_dish_batch: keep served as cooking-complete; do not close
CREATE OR REPLACE FUNCTION public.complete_dish_batch(p_dish_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  IF NOT public.is_kitchen_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  WITH updated AS (
    UPDATE public.ticket_items
    SET status = 'done', completed_at = now()
    WHERE dish_id = p_dish_id AND status = 'pending'
    RETURNING ticket_id
  )
  SELECT count(*) INTO v_count FROM updated;

  UPDATE public.tickets t SET status = 'served', updated_at = now()
  WHERE t.status <> 'served'
    AND t.cancelled_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.ticket_items ti WHERE ti.ticket_id = t.id AND ti.status = 'pending'
    );

  UPDATE public.tickets t SET status = 'in_progress', updated_at = now()
  WHERE t.status = 'waiting'
    AND t.cancelled_at IS NULL
    AND EXISTS (SELECT 1 FROM public.ticket_items ti WHERE ti.ticket_id = t.id AND ti.status = 'done')
    AND EXISTS (SELECT 1 FROM public.ticket_items ti WHERE ti.ticket_id = t.id AND ti.status = 'pending');

  RETURN v_count;
END $$;

-- Toggle availability: require kitchen
CREATE OR REPLACE FUNCTION public.toggle_dish_availability(p_dish_id uuid)
RETURNS public.dishes LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_dish public.dishes;
BEGIN
  IF NOT public.is_kitchen_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.dishes SET is_available = NOT is_available
  WHERE id = p_dish_id RETURNING * INTO v_dish;
  IF v_dish.id IS NULL THEN RAISE EXCEPTION 'dish_not_found'; END IF;
  RETURN v_dish;
END $$;

CREATE OR REPLACE FUNCTION public.acknowledge_bell(p_alert_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_kitchen_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.bell_alerts SET acknowledged = true WHERE id = p_alert_id;
END $$;

-- Bell: block when paid/cancelled
CREATE OR REPLACE FUNCTION public.ring_bell(p_ticket_id uuid)
RETURNS public.bell_alerts LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ticket public.tickets;
  v_alert public.bell_alerts;
BEGIN
  SELECT * INTO v_ticket FROM public.tickets WHERE id = p_ticket_id;
  IF v_ticket.id IS NULL THEN RAISE EXCEPTION 'ticket_not_found'; END IF;
  IF v_ticket.payment_status = 'paid' OR v_ticket.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'ticket_closed';
  END IF;
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

ALTER PUBLICATION supabase_realtime ADD TABLE public.user_roles;
