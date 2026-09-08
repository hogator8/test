-- Online Test System - v11 incremental migration
-- Paste this whole file into the Supabase SQL Editor and run it once
-- against a database that already has migration_v9.sql applied.

-- 配点。デフォルト1点なので、既存の(点数を意識せず作られた)問題は
-- 「1問1点」として扱われ、これまでの「正答数」ベースの得点と同じ結果になる。
alter table questions
  add column if not exists points integer not null default 1;

alter table questions
  add constraint questions_points_check check (points > 0);
