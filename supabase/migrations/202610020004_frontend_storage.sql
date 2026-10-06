begin;
-- Folder contract used by IssueAttachments: project UUID / issue UUID / filename.
insert into storage.buckets(id, name, public, file_size_limit)
values ('issue-attachments', 'issue-attachments', false, 10485760);
create function internal.can_access_attachment(p_name text, p_write boolean) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_project uuid; v_issue uuid;
begin
  if not internal.is_active_user() then return false; end if;
  if array_length(string_to_array(p_name, '/'),1) <> 3 or split_part(p_name,'/',3) = '' then return false; end if;
  begin
    v_project := split_part(p_name,'/',1)::uuid;
    v_issue := split_part(p_name,'/',2)::uuid;
  exception when invalid_text_representation then return false;
  end;
  if not exists (select 1 from public.work_issue where id = v_issue and project_id = v_project) then return false; end if;
  return internal.is_project_member(v_project) or (not p_write and internal.has_role('director'));
end;
$$;
revoke all on function internal.can_access_attachment(text, boolean) from public, anon;
grant execute on function internal.can_access_attachment(text, boolean) to authenticated;
create policy hezb_attachment_read on storage.objects for select to authenticated
  using (bucket_id = 'issue-attachments' and internal.can_access_attachment(name, false));
create policy hezb_attachment_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'issue-attachments' and internal.can_access_attachment(name, true));
-- Append-only attachments: no overwrite/delete API in the existing frontend.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.core_notification;
  end if;
end;
$$;
notify pgrst, 'reload schema';
commit;
