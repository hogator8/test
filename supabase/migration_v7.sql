-- Online Test System - v7 incremental migration
-- Paste this whole file into the Supabase SQL Editor and run it once
-- against a database that already has migration_v6.sql applied.

-- 段階的アクションで既に発動済みの段階数(0=未発動)。auto_pause解除後もリセットしない。
alter table test_sessions
  add column if not exists leave_stage_reached integer not null default 0;

-- leave_staged_actions のデータ形式を、単純な文字列配列
-- (例: ["warning_only","auto_pause","auto_submit"]) から、しきい値を含む
-- オブジェクトの配列(例: [{"action":"warning_only","count_threshold":1,
-- "duration_threshold_seconds":null}, ...])へ変換する。
-- 「N回目の発生=N段階目」という旧来の挙動を維持するため、count_threshold には
-- 配列内の位置(1始まり)をそのまま使う。
-- 既にオブジェクト形式(先頭要素がstringでない)の行は対象外とする。
update tests
set leave_staged_actions = (
  select jsonb_agg(
    jsonb_build_object(
      'action', elem,
      'count_threshold', ord,
      'duration_threshold_seconds', null
    )
    order by ord
  )
  from jsonb_array_elements_text(leave_staged_actions) with ordinality as t(elem, ord)
)
where leave_staged_actions is not null
  and jsonb_typeof(leave_staged_actions) = 'array'
  and jsonb_array_length(leave_staged_actions) > 0
  and jsonb_typeof(leave_staged_actions -> 0) = 'string';
