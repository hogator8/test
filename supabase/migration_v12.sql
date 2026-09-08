-- Online Test System - v12 incremental migration
-- Paste this whole file into the Supabase SQL Editor and run it once
-- against a database that already has migration_v11.sql applied.

-- 対象クラス名の配列。nullまたは空配列なら全学生が対象(従来通り)。
-- 1つ以上のクラス名が入っている場合、そのクラス名に該当する学生のみが受験対象になる。
alter table tests
  add column if not exists assigned_classes text[];
