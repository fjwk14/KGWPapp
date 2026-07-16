-- =============================================================
-- 0025: メンバー管理の強化(メールアドレス変更の同期)
--
--   1. 本人が auth 側でメールアドレスを変更(確認メールのリンクを開いて
--      確定)したとき、public.users.email へ自動で同期するトリガー。
--      ※ public.users.email はクライアントから直接更新できない設計
--        (0001: なりすまし招待の防止)のため、auth 経由の正規の変更
--        だけがこのトリガーを通って反映される。
--
--   2. メンバーのチーム削除(登録削除)は 0001 の memberships_delete
--      ポリシーで既に管理者に許可済み。今回はアプリ側にUIを追加した
--      だけで、DB変更はない。
--
-- 何度実行しても安全(idempotent)。
-- =============================================================

create or replace function public.sync_user_email()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  update public.users set email = lower(new.email) where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sync_user_email();
