-- Online Test System - v9 incremental migration
-- Paste this whole file into the Supabase SQL Editor and run it once
-- against a database that already has migration_v7.sql applied.

-- 現在の段階が始まった時刻(段階0の間はセッション開始時刻と同じ)。段階的アクションの
-- 回数・時間しきい値は、この時刻以降のproctoring_logsのみを対象に都度集計するために使う。
-- 段階が発動するたびに、このカラムを発動時刻へ更新することで以降の集計が自動的に
-- リセットされる(累計カウンタのインクリメント/リセット漏れを避けるための設計)。
alter table test_sessions
  add column if not exists current_stage_started_at timestamptz;

-- 既存セッションは、これまで段階0からの累計として扱ってきたため、
-- セッション開始時刻を初期値として設定する。
update test_sessions
set current_stage_started_at = started_at
where current_stage_started_at is null;

alter table test_sessions
  alter column current_stage_started_at set default now(),
  alter column current_stage_started_at set not null;
