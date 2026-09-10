-- v16: 学生ID・パスコードを組織単位でユニークにする + invited_by FK修正
-- 既存DBに対して1回だけ実行してください。新規インストールの場合は migration.sql
-- に統合済みのため不要です。

-- students.student_id: グローバルユニーク -> (organization_id, student_id)でユニークに変更
alter table students drop constraint if exists students_student_id_key;
alter table students add constraint students_org_student_id_key unique (organization_id, student_id);
create index if not exists idx_students_student_id on students(student_id);

-- tests.passcode: グローバルユニーク -> (organization_id, passcode)でユニークに変更
alter table tests drop constraint if exists tests_passcode_key;
alter table tests add constraint tests_org_passcode_key unique (organization_id, passcode);
create index if not exists idx_tests_passcode on tests(passcode);

-- organization_invites.invited_by: 招待した本人(教員)が退会(auth.usersから削除)しても
-- 招待履歴自体は残すよう、外部キーをon delete set nullに変更する。
-- (これがないと、教員アカウントの自己削除機能で「他の教員を招待したことがある教員」を
-- 削除しようとした際に外部キー制約違反でエラーになってしまう)
alter table organization_invites drop constraint if exists organization_invites_invited_by_fkey;
alter table organization_invites
  add constraint organization_invites_invited_by_fkey
  foreign key (invited_by) references auth.users(id) on delete set null;
