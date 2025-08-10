-- Enable RLS and add policies for user_push_subscriptions
ALTER TABLE IF EXISTS public.user_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own subscriptions
CREATE POLICY IF NOT EXISTS "Users can view their own push subscriptions"
ON public.user_push_subscriptions
FOR SELECT
USING (auth.uid() = user_id);

-- Allow users to insert their own subscriptions
CREATE POLICY IF NOT EXISTS "Users can insert their own push subscriptions"
ON public.user_push_subscriptions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own subscriptions
CREATE POLICY IF NOT EXISTS "Users can update their own push subscriptions"
ON public.user_push_subscriptions
FOR UPDATE
USING (auth.uid() = user_id);

-- Optional: allow users to delete their own subscriptions (cleanup)
CREATE POLICY IF NOT EXISTS "Users can delete their own push subscriptions"
ON public.user_push_subscriptions
FOR DELETE
USING (auth.uid() = user_id);