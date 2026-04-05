-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  message     TEXT,
  link        TEXT,
  is_read     BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS announcements (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_by  UUID REFERENCES profiles(id),
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- Notifications: users see their own
CREATE POLICY "Users view own notifications"
  ON notifications FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users update own notifications"
  ON notifications FOR UPDATE USING (user_id = auth.uid());

-- Service role (API) can insert for any user - handled via admin client bypassing RLS
-- Announcements: all authenticated users can view
CREATE POLICY "All view announcements"
  ON announcements FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins manage announcements"
  ON announcements FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));

-- Enable realtime on notifications
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
