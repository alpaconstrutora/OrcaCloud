-- Migration: Create notifications and order_chats tables

-- 1. Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    recipient_email text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    link text,
    type text, -- 'status_change', 'chat_message', etc.
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create order_chats table
CREATE TABLE IF NOT EXISTS public.order_chats (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id uuid REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    sender_email text NOT NULL,
    sender_name text NOT NULL,
    message text NOT NULL,
    is_system boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_chats ENABLE ROW LEVEL SECURITY;

-- 3. Notification Policies
-- For simplicity in this dev environment, allow all to read/update if recipient_email matches (or public for now as per project pattern)
CREATE POLICY "Allow anon all on notifications" ON public.notifications
    FOR ALL TO public USING (true) WITH CHECK (true);

-- 4. Chat Policies
CREATE POLICY "Allow anon all on order_chats" ON public.order_chats
    FOR ALL TO public USING (true) WITH CHECK (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS notifications_recipient_email_idx ON public.notifications(recipient_email);
CREATE INDEX IF NOT EXISTS order_chats_order_id_idx ON public.order_chats(order_id);
