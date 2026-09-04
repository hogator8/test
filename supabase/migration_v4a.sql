-- Online Test System - v4a incremental migration
-- Run this in the Supabase SQL Editor AFTER migration.sql and
-- migration_v3.sql have already been applied.

-- ① 受験セッションの論理削除(削除後は同じ学生が同じテストを再受験できる)
alter table test_sessions add column deleted_at timestamptz;

alter table test_sessions drop constraint if exists test_sessions_student_id_test_id_key;
create unique index if not exists test_sessions_active_unique
  on test_sessions (student_id, test_id)
  where deleted_at is null;

-- ② パスコード入力後の案内文言のカスタマイズ
alter table tests add column start_screen_message text;

-- ④ 得点表示のオン/オフ
alter table tests add column show_score_to_student boolean not null default true;

-- ⑫ 学生属性の追加
alter table students add column class_name text;
alter table students add column reading text;
alter table students add column nationality text;
alter table students add column gender text;

-- ⑪ パフォーマンス改善: 頻繁にWHERE句で使われる外部キー列にインデックスを追加
create index if not exists idx_test_sessions_student_id on test_sessions(student_id);
create index if not exists idx_answers_question_id on answers(question_id);
