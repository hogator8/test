-- Online Test System - initial schema
-- Paste this whole file into the Supabase SQL Editor and run it once.
-- RLS is intentionally left disabled: all DB access happens server-side
-- (Next.js API Routes) using the service role key. The browser never talks
-- to Supabase directly.

-- 学生マスタ(本システム専用。出席管理システムとは非連携)
create table students (
  id uuid primary key default gen_random_uuid(),
  student_id text unique not null,      -- ログインID
  name text not null,
  password_hash text not null,          -- bcryptでハッシュ化して保存
  created_at timestamptz default now()
);

-- テスト
create table tests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  passcode text unique not null,        -- テスト1つにつき共通パスコード(教員が任意指定)
  time_limit_minutes integer,           -- nullの場合は制限時間なし
  leave_detection_enabled boolean not null default true,
  leave_grace_seconds integer not null default 3,       -- これ未満の離脱は無視
  leave_count_threshold integer,        -- 累計離脱回数のしきい値(nullなら回数では発動しない)
  leave_duration_threshold_seconds integer, -- 累計離脱時間のしきい値(nullなら時間では発動しない)
  leave_action text not null default 'warning_only', -- 'warning_only' | 'auto_pause' | 'auto_submit'
  created_at timestamptz default now()
);

-- 問題(セクション番号・問題番号で並び順を管理)
create table questions (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references tests(id) on delete cascade,
  section_number integer not null,
  question_number integer not null,
  question_text text not null,
  choice_1 text not null,
  choice_2 text not null,
  choice_3 text,
  choice_4 text,
  choice_5 text,
  correct_answer integer not null check (correct_answer between 1 and 5),
  created_at timestamptz default now(),
  unique (test_id, section_number, question_number)
);

-- 受験セッション(1学生が1テストを受験するごとに1レコード)
create table test_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id),
  test_id uuid not null references tests(id),
  status text not null default 'in_progress', -- 'in_progress' | 'paused' | 'submitted'
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  total_score integer,
  auto_submitted boolean not null default false,
  created_at timestamptz default now(),
  unique (student_id, test_id) -- 同一学生は同一テストを1回のみ受験可能とする
);

-- 解答
create table answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references test_sessions(id) on delete cascade,
  question_id uuid not null references questions(id),
  selected_choice integer check (selected_choice between 1 and 5),
  is_correct boolean,
  answered_at timestamptz,
  unique (session_id, question_id)
);

-- 離脱・フルスクリーン解除ログ
create table proctoring_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references test_sessions(id) on delete cascade,
  event_type text not null, -- 'background' | 'fullscreen_exit'
  left_at timestamptz not null,
  returned_at timestamptz,
  duration_seconds integer,
  created_at timestamptz default now()
);

-- 一時停止からの再開ログ(離脱ログとは別に、いつ再開ボタンが押されたかを記録する)
create table session_resume_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references test_sessions(id) on delete cascade,
  resumed_at timestamptz not null default now()
);

create index idx_questions_test_id on questions(test_id);
create index idx_test_sessions_test_id on test_sessions(test_id);
create index idx_answers_session_id on answers(session_id);
create index idx_proctoring_logs_session_id on proctoring_logs(session_id);
create index idx_session_resume_logs_session_id on session_resume_logs(session_id);
