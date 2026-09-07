-- Online Test System - v6 incremental migration
-- Run this in the Supabase SQL Editor AFTER migration.sql, migration_v3.sql
-- and migration_v4a.sql have already been applied.

-- v5: 段階的な離脱検知アクション
alter table tests add column leave_staged_actions jsonb;
alter table test_sessions add column leave_violation_count integer not null default 0;

-- 1: 問題の論理削除(CSV差し替えで消えた問題を物理削除せず残す)
alter table questions add column deleted_at timestamptz;

-- 3: 選択肢2〜10択対応
alter table questions add column choice_6 text;
alter table questions add column choice_7 text;
alter table questions add column choice_8 text;
alter table questions add column choice_9 text;
alter table questions add column choice_10 text;

alter table questions drop constraint if exists questions_correct_answer_check;
alter table questions add constraint questions_correct_answer_check
  check (correct_answer is null or correct_answer between 1 and 10);

alter table answers drop constraint if exists answers_selected_choice_check;
alter table answers add constraint answers_selected_choice_check
  check (selected_choice is null or selected_choice between 1 and 10);

-- 4: 記述式問題への対応
alter table questions add column question_type text not null default 'multiple_choice';
alter table questions alter column choice_1 drop not null;
alter table questions alter column choice_2 drop not null;
alter table questions alter column correct_answer drop not null;
alter table questions add column free_text_answer_1 text;
alter table questions add column free_text_answer_2 text;
alter table questions add column free_text_answer_3 text;
alter table questions add column free_text_answer_4 text;
alter table questions add column free_text_answer_5 text;
alter table answers add column free_text_response text;
