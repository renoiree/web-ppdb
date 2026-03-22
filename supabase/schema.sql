create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text not null default '',
  phone text,
  role text not null default 'user' check (role in ('user', 'admin')),
  school_level text not null default 'SD' check (school_level in ('SD', 'SMP', 'SMA', 'SMK')),
  admission_path text not null default 'Zonasi' check (
    admission_path in ('Zonasi', 'Afirmasi', 'Prestasi', 'Akademik', 'Non Akademik', 'Perpindahan Tugas Orang Tua/Wali')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.school_targets (
  id uuid primary key default gen_random_uuid(),
  school_level text not null check (school_level in ('SD', 'SMP', 'SMA', 'SMK')),
  school_name text not null unique,
  quota integer not null default 100 check (quota > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.school_targets (school_level, school_name, quota)
values
  ('SD', 'SD Negeri 01 Nusantara', 120),
  ('SD', 'SD Negeri 02 Nusantara', 120),
  ('SMP', 'SMP Negeri 01 Nusantara', 180),
  ('SMP', 'SMP Negeri 02 Nusantara', 180),
  ('SMA', 'SMA Negeri 01 Nusantara', 216),
  ('SMA', 'SMA Negeri 02 Nusantara', 216),
  ('SMK', 'SMK Negeri 01 Nusantara', 144),
  ('SMK', 'SMK Negeri 02 Nusantara', 144)
on conflict (school_name) do nothing;

insert into public.announcements (title, content, is_published)
values
  ('Pembukaan Pendaftaran', 'Pendaftaran peserta didik baru sudah dibuka. Lengkapi data dan dokumen sebelum batas waktu berakhir.', true),
  ('Verifikasi Berkas', 'Pastikan dokumen yang diupload jelas, lengkap, dan sesuai jalur pendaftaran yang dipilih.', true)
on conflict do nothing;

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references public.profiles(id) on delete cascade,
  nisn text not null,
  nik text not null,
  family_card_number text not null,
  gender text not null check (gender in ('Laki-laki', 'Perempuan')),
  birth_place text not null,
  birth_date date not null,
  religion text not null,
  origin_school text not null,
  school_level text not null check (school_level in ('SD', 'SMP', 'SMA', 'SMK')),
  admission_path text not null check (
    admission_path in ('Zonasi', 'Afirmasi', 'Prestasi', 'Akademik', 'Non Akademik', 'Perpindahan Tugas Orang Tua/Wali')
  ),
  target_school_name text not null default '',
  major_choice text,
  average_score numeric(5,2),
  distance_km numeric(6,2),
  address text not null,
  parent_name text not null,
  parent_phone text not null,
  parent_job text not null,
  parent_income text not null,
  notes text,
  admin_notes text,
  submission_state text not null default 'draft' check (submission_state in ('draft', 'pending')),
  status text not null default 'draft' check (status in ('draft', 'pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.application_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  application_id uuid references public.applications(id) on delete cascade,
  document_type text not null check (
    document_type in (
      'student_photo',
      'family_card',
      'birth_certificate',
      'report_card',
      'achievement_certificate',
      'parent_transfer_letter'
    )
  ),
  file_name text not null,
  file_path text not null unique,
  public_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, document_type)
);

create table if not exists public.application_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.applications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text not null default 'user' check (actor_role in ('user', 'admin', 'system')),
  action_type text not null check (
    action_type in (
      'application_created',
      'application_updated',
      'application_submitted',
      'status_changed',
      'admin_note_updated',
      'document_uploaded',
      'document_deleted'
    )
  ),
  title text not null,
  description text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists set_applications_updated_at on public.applications;
create trigger set_applications_updated_at before update on public.applications
for each row execute procedure public.set_updated_at();

drop trigger if exists set_application_documents_updated_at on public.application_documents;
create trigger set_application_documents_updated_at before update on public.application_documents
for each row execute procedure public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone, school_level, admission_path)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone',
    coalesce(new.raw_user_meta_data->>'school_level', 'SD'),
    coalesce(new.raw_user_meta_data->>'admission_path', 'Zonasi')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.log_application_history(
  p_application_id uuid,
  p_user_id uuid,
  p_actor_id uuid,
  p_actor_role text,
  p_action_type text,
  p_title text,
  p_description text,
  p_old_value jsonb default null,
  p_new_value jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.application_history (
    application_id,
    user_id,
    actor_id,
    actor_role,
    action_type,
    title,
    description,
    old_value,
    new_value
  ) values (
    p_application_id,
    p_user_id,
    p_actor_id,
    coalesce(p_actor_role, 'system'),
    p_action_type,
    p_title,
    p_description,
    p_old_value,
    p_new_value
  );
end;
$$;

create or replace function public.handle_application_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_actor_role text;
begin
  v_actor_id := auth.uid();
  v_actor_role := case
    when public.is_admin() then 'admin'
    when auth.uid() is not null then 'user'
    else 'system'
  end;

  if tg_op = 'INSERT' then
    perform public.log_application_history(
      new.id,
      new.user_id,
      coalesce(v_actor_id, new.user_id),
      v_actor_role,
      'application_created',
      'Formulir dibuat',
      'Draft pendaftaran berhasil dibuat.',
      null,
      to_jsonb(new)
    );

    if new.submission_state = 'pending' then
      perform public.log_application_history(
        new.id,
        new.user_id,
        coalesce(v_actor_id, new.user_id),
        v_actor_role,
        'application_submitted',
        'Pendaftaran dikirim',
        'Formulir dikirim untuk diverifikasi admin.',
        null,
        jsonb_build_object('submission_state', new.submission_state, 'status', new.status)
      );
    end if;

    return new;
  end if;

  if old.submission_state is distinct from new.submission_state and new.submission_state = 'pending' then
    perform public.log_application_history(
      new.id,
      new.user_id,
      coalesce(v_actor_id, new.user_id),
      v_actor_role,
      'application_submitted',
      'Pendaftaran dikirim',
      'Formulir dikirim untuk diverifikasi admin.',
      jsonb_build_object('submission_state', old.submission_state),
      jsonb_build_object('submission_state', new.submission_state)
    );
  end if;

  if old.status is distinct from new.status then
    perform public.log_application_history(
      new.id,
      new.user_id,
      coalesce(v_actor_id, new.user_id),
      v_actor_role,
      'status_changed',
      'Status pendaftaran berubah',
      format('Status berubah dari %s ke %s.', old.status, new.status),
      jsonb_build_object('status', old.status),
      jsonb_build_object('status', new.status)
    );
  end if;

  if old.admin_notes is distinct from new.admin_notes then
    perform public.log_application_history(
      new.id,
      new.user_id,
      coalesce(v_actor_id, new.user_id),
      v_actor_role,
      'admin_note_updated',
      'Catatan admin diperbarui',
      'Catatan verifikasi admin diperbarui.',
      jsonb_build_object('admin_notes', old.admin_notes),
      jsonb_build_object('admin_notes', new.admin_notes)
    );
  end if;

  if to_jsonb(old) - 'status' - 'submission_state' - 'admin_notes' is distinct from to_jsonb(new) - 'status' - 'submission_state' - 'admin_notes' then
    perform public.log_application_history(
      new.id,
      new.user_id,
      coalesce(v_actor_id, new.user_id),
      v_actor_role,
      'application_updated',
      'Data formulir diperbarui',
      'Ada perubahan pada data formulir pendaftaran.',
      null,
      null
    );
  end if;

  return new;
end;
$$;

create or replace function public.handle_document_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_actor_role text;
  v_application_id uuid;
begin
  v_actor_id := auth.uid();
  v_actor_role := case
    when public.is_admin() then 'admin'
    when auth.uid() is not null then 'user'
    else 'system'
  end;

  if tg_op = 'INSERT' then
    v_application_id := new.application_id;
    perform public.log_application_history(
      v_application_id,
      new.user_id,
      coalesce(v_actor_id, new.user_id),
      v_actor_role,
      'document_uploaded',
      'Dokumen diupload',
      format('Dokumen %s berhasil diupload.', new.document_type),
      null,
      jsonb_build_object('document_type', new.document_type, 'file_name', new.file_name)
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_application_id := coalesce(new.application_id, old.application_id);
    perform public.log_application_history(
      v_application_id,
      new.user_id,
      coalesce(v_actor_id, new.user_id),
      v_actor_role,
      'document_uploaded',
      'Dokumen diperbarui',
      format('Dokumen %s diperbarui.', new.document_type),
      jsonb_build_object('file_name', old.file_name),
      jsonb_build_object('file_name', new.file_name)
    );
    return new;
  end if;

  v_application_id := old.application_id;
  perform public.log_application_history(
    v_application_id,
    old.user_id,
    coalesce(v_actor_id, old.user_id),
    v_actor_role,
    'document_deleted',
    'Dokumen dihapus',
    format('Dokumen %s dihapus.', old.document_type),
    jsonb_build_object('document_type', old.document_type, 'file_name', old.file_name),
    null
  );
  return old;
end;
$$;

drop trigger if exists on_application_history on public.applications;
create trigger on_application_history
after insert or update on public.applications
for each row execute procedure public.handle_application_history();

drop trigger if exists on_document_history on public.application_documents;
create trigger on_document_history
after insert or update or delete on public.application_documents
for each row execute procedure public.handle_document_history();

insert into storage.buckets (id, name, public)
values ('ppdb-documents', 'ppdb-documents', true)
on conflict (id) do nothing;

create or replace function public.get_school_position_overview(
  p_school_level text default null,
  p_target_school_name text default null
)
returns table (
  school_level text,
  school_name text,
  quota integer,
  total_applicants bigint,
  draft_count bigint,
  pending_count bigint,
  accepted_count bigint,
  rejected_count bigint,
  remaining_seats bigint
)
language sql
security definer
set search_path = public
as $$
  select
    st.school_level,
    st.school_name,
    st.quota,
    count(a.id) as total_applicants,
    count(*) filter (where a.status = 'draft') as draft_count,
    count(*) filter (where a.status = 'pending') as pending_count,
    count(*) filter (where a.status = 'accepted') as accepted_count,
    count(*) filter (where a.status = 'rejected') as rejected_count,
    greatest(st.quota - count(*) filter (where a.status in ('pending', 'accepted')), 0) as remaining_seats
  from public.school_targets st
  left join public.applications a on a.target_school_name = st.school_name
  where (p_school_level is null or st.school_level = p_school_level)
    and (p_target_school_name is null or st.school_name = p_target_school_name)
  group by st.school_level, st.school_name, st.quota
  order by st.school_level, st.school_name;
$$;

create or replace function public.get_user_school_position(p_user_id uuid)
returns table (
  user_id uuid,
  school_level text,
  target_school_name text,
  admission_path text,
  user_status text,
  quota integer,
  total_competitors bigint,
  queue_position bigint,
  remaining_seats bigint
)
language sql
security definer
set search_path = public
as $$
  with ranked as (
    select
      a.user_id,
      a.school_level,
      a.target_school_name,
      a.admission_path,
      a.status,
      st.quota,
      row_number() over (
        partition by a.target_school_name
        order by a.average_score desc nulls last, a.distance_km asc nulls last, a.created_at asc
      ) as queue_position,
      count(*) over (partition by a.target_school_name) as total_competitors
    from public.applications a
    left join public.school_targets st on st.school_name = a.target_school_name
    where a.target_school_name <> ''
  )
  select
    r.user_id,
    r.school_level,
    r.target_school_name,
    r.admission_path,
    r.status as user_status,
    coalesce(r.quota, 0) as quota,
    r.total_competitors,
    r.queue_position,
    greatest(coalesce(r.quota, 0) - (
      select count(*)
      from public.applications a2
      where a2.target_school_name = r.target_school_name
        and a2.status in ('pending', 'accepted')
    ), 0) as remaining_seats
  from ranked r
  where r.user_id = p_user_id;
$$;

create or replace view public.admin_applications_view
with (security_invoker = true) as
select
  a.id as application_id,
  p.id as user_id,
  p.full_name,
  p.email,
  p.phone,
  a.nisn,
  a.nik,
  a.family_card_number,
  a.gender,
  a.birth_place,
  a.birth_date,
  a.religion,
  a.origin_school,
  a.school_level,
  a.admission_path,
  a.target_school_name,
  a.major_choice,
  a.average_score,
  a.distance_km,
  a.address,
  a.parent_name,
  a.parent_phone,
  a.parent_job,
  a.parent_income,
  a.notes,
  a.admin_notes,
  a.submission_state,
  a.status,
  a.created_at,
  a.updated_at,
  count(d.id) as document_count,
  coalesce(
    json_agg(
      json_build_object(
        'document_type', d.document_type,
        'file_name', d.file_name,
        'public_url', d.public_url
      )
    ) filter (where d.id is not null),
    '[]'::json
  ) as documents
from public.applications a
join public.profiles p on p.id = a.user_id
left join public.application_documents d on d.user_id = p.id
group by
  a.id, p.id, p.full_name, p.email, p.phone, a.nisn, a.nik, a.family_card_number,
  a.gender, a.birth_place, a.birth_date, a.religion, a.origin_school, a.school_level,
  a.admission_path, a.target_school_name, a.major_choice, a.average_score, a.distance_km, a.address,
  a.parent_name, a.parent_phone, a.parent_job, a.parent_income, a.notes, a.admin_notes,
  a.submission_state, a.status, a.created_at, a.updated_at;

alter table public.profiles enable row level security;
alter table public.school_targets enable row level security;
alter table public.announcements enable row level security;
alter table public.applications enable row level security;
alter table public.application_documents enable row level security;
alter table public.application_history enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
for select using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin" on public.profiles
for update using (auth.uid() = id or public.is_admin())
with check (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin" on public.profiles
for delete using (public.is_admin());

drop policy if exists "school_targets_select_authenticated" on public.school_targets;
create policy "school_targets_select_authenticated" on public.school_targets
for select using (auth.role() = 'authenticated');

drop policy if exists "school_targets_admin_all" on public.school_targets;
create policy "school_targets_admin_all" on public.school_targets
for all using (public.is_admin())
with check (public.is_admin());

drop policy if exists "announcements_select_authenticated" on public.announcements;
create policy "announcements_select_authenticated" on public.announcements
for select using (auth.role() = 'authenticated');

drop policy if exists "announcements_admin_all" on public.announcements;
create policy "announcements_admin_all" on public.announcements
for all using (public.is_admin())
with check (public.is_admin());

drop policy if exists "applications_select_own_or_admin" on public.applications;
create policy "applications_select_own_or_admin" on public.applications
for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "applications_insert_own" on public.applications;
create policy "applications_insert_own" on public.applications
for insert with check (auth.uid() = user_id);

drop policy if exists "applications_update_own_or_admin" on public.applications;
create policy "applications_update_own_or_admin" on public.applications
for update using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "applications_delete_admin" on public.applications;
create policy "applications_delete_admin" on public.applications
for delete using (public.is_admin());

drop policy if exists "application_documents_select_own_or_admin" on public.application_documents;
create policy "application_documents_select_own_or_admin" on public.application_documents
for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "application_documents_insert_own" on public.application_documents;
create policy "application_documents_insert_own" on public.application_documents
for insert with check (auth.uid() = user_id);

drop policy if exists "application_documents_update_own_or_admin" on public.application_documents;
create policy "application_documents_update_own_or_admin" on public.application_documents
for update using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "application_documents_delete_own_or_admin" on public.application_documents;
create policy "application_documents_delete_own_or_admin" on public.application_documents
for delete using (auth.uid() = user_id or public.is_admin());

drop policy if exists "application_history_select_own_or_admin" on public.application_history;
create policy "application_history_select_own_or_admin" on public.application_history
for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "storage_upload_own_documents" on storage.objects;
create policy "storage_upload_own_documents" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'ppdb-documents'
  and ((storage.foldername(name))[1]) = auth.uid()::text
);

drop policy if exists "storage_view_documents" on storage.objects;
create policy "storage_view_documents" on storage.objects
for select to authenticated
using (
  bucket_id = 'ppdb-documents'
  and (((storage.foldername(name))[1]) = auth.uid()::text or public.is_admin())
);

drop policy if exists "storage_update_own_documents" on storage.objects;
create policy "storage_update_own_documents" on storage.objects
for update to authenticated
using (
  bucket_id = 'ppdb-documents'
  and (((storage.foldername(name))[1]) = auth.uid()::text or public.is_admin())
)
with check (
  bucket_id = 'ppdb-documents'
  and (((storage.foldername(name))[1]) = auth.uid()::text or public.is_admin())
);

drop policy if exists "storage_delete_own_documents" on storage.objects;
create policy "storage_delete_own_documents" on storage.objects
for delete to authenticated
using (
  bucket_id = 'ppdb-documents'
  and (((storage.foldername(name))[1]) = auth.uid()::text or public.is_admin())
);

grant select on public.admin_applications_view to authenticated;
grant execute on function public.get_school_position_overview(text, text) to authenticated;
grant execute on function public.get_user_school_position(uuid) to authenticated;
