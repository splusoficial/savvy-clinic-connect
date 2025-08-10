-- Enable RLS on table
ALTER TABLE IF EXISTS public.user_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Create policies if they don't exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'user_push_subscriptions' 
      AND policyname = 'Users can view their own push subscriptions'
  ) THEN
    CREATE POLICY "Users can view their own push subscriptions"
    ON public.user_push_subscriptions
    FOR SELECT
    USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'user_push_subscriptions' 
      AND policyname = 'Users can insert their own push subscriptions'
  ) THEN
    CREATE POLICY "Users can insert their own push subscriptions"
    ON public.user_push_subscriptions
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'user_push_subscriptions' 
      AND policyname = 'Users can update their own push subscriptions'
  ) THEN
    CREATE POLICY "Users can update their own push subscriptions"
    ON public.user_push_subscriptions
    FOR UPDATE
    USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'user_push_subscriptions' 
      AND policyname = 'Users can delete their own push subscriptions'
  ) THEN
    CREATE POLICY "Users can delete their own push subscriptions"
    ON public.user_push_subscriptions
    FOR DELETE
    USING (auth.uid() = user_id);
  END IF;
END $$;