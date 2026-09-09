-- Online Test System - v13 incremental migration
-- Paste this whole file into the Supabase SQL Editor and run it once
-- against a database that already has migration_v12.sql applied.

-- trueなら学生ごとにセクション内で問題順をシャッフル。
-- trueなら学生ごとに選択肢の表示順をシャッフル(記述式には影響しない)。
alter table tests
  add column if not exists randomize_questions boolean not null default false,
  add column if not exists randomize_choices boolean not null default false;

-- セッション開始時に1回だけ生成する問題表示順(問題IDの配列。セクション内シャッフル済み)。
-- randomize_questionsが無効なテストのセッションはnullのまま。
-- セッション開始時に1回だけ生成する選択肢表示順({問題ID: 元の選択肢番号の配列})。
-- randomize_choicesが無効なテストのセッションはnullのまま。
alter table test_sessions
  add column if not exists question_order jsonb,
  add column if not exists choice_orders jsonb;
