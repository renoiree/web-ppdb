-- 1. Daftar dulu akun admin lewat aplikasi atau dashboard Auth Supabase.
-- 2. Ganti email di bawah sesuai akun admin yang mau dijadikan super admin.

update public.profiles
set role = 'admin'
where email = 'admin@ppdb.id';
