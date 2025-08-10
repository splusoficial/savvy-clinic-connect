-- Ensure unique index for upsert to work on onesignal_player_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_push_subscriptions_player_id
ON public.user_push_subscriptions (onesignal_player_id);

-- Helpful index for RLS lookups and joins
CREATE INDEX IF NOT EXISTS idx_user_push_subscriptions_user_id
ON public.user_push_subscriptions (user_id);

-- Keep updated_at fresh on updates using existing function
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_user_push_subscriptions_updated_at'
  ) THEN
    CREATE TRIGGER update_user_push_subscriptions_updated_at
    BEFORE UPDATE ON public.user_push_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END$$;