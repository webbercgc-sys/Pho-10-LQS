
CREATE OR REPLACE FUNCTION public.grant_self_kitchen()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), 'kitchen')
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;
