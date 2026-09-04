-- Online Test System - v3 incremental migration
-- Run this in the Supabase SQL Editor AFTER migration.sql has already been
-- applied once. It only contains the changes introduced in v3:
--   - leave_warning_message / pause_release_pin columns on tests
--   - cascading deletes so a test or student can be deleted along with
--     everything that references it (test_sessions -> answers /
--     proctoring_logs / session_resume_logs)

alter table tests add column leave_warning_message text;
alter table tests add column pause_release_pin text;

-- Allow deleting a student to cascade-delete their test_sessions (and, via
-- the existing on delete cascade on those tables, their answers /
-- proctoring_logs / session_resume_logs too).
alter table test_sessions drop constraint if exists test_sessions_student_id_fkey;
alter table test_sessions
  add constraint test_sessions_student_id_fkey
  foreign key (student_id) references students(id) on delete cascade;

-- Allow deleting a test to cascade-delete its test_sessions the same way
-- (questions already cascade; test_sessions previously did not).
alter table test_sessions drop constraint if exists test_sessions_test_id_fkey;
alter table test_sessions
  add constraint test_sessions_test_id_fkey
  foreign key (test_id) references tests(id) on delete cascade;
