# Web PPDB

Project ini adalah web PPDB statis yang siap di-host di Vercel dan memakai Supabase untuk:

- auth login dan registrasi
- role `user` dan `admin`
- form data pendaftaran yang lebih lengkap
- upload pas foto dan dokumen persyaratan
- admin bisa cari, filter, lihat detail, beri catatan verifikasi, ubah status, dan hapus user
- riwayat aktivitas pendaftaran dan dokumen

## Fitur Yang Sudah Ada

- Jenjang `SD`, `SMP`, `SMA`, `SMK`
- Jalur `Zonasi`, `Afirmasi`, `Prestasi`, `Akademik`, `Non Akademik`, `Perpindahan Tugas Orang Tua/Wali`
- Draft pendaftaran dan kirim pendaftaran
- Upload dokumen:
  - pas foto
  - kartu keluarga
  - akte kelahiran
  - rapor / nilai
  - sertifikat prestasi
  - surat perpindahan tugas
- Catatan admin pada setiap pendaftar
- Dashboard admin dengan pencarian dan filter
- Timeline history untuk user dan admin

## Struktur

- [index.html](/c:/Users/Raffael/Documents/GitHub/web-ppdb/index.html)
- [assets/app.css](/c:/Users/Raffael/Documents/GitHub/web-ppdb/assets/app.css)
- [assets/app.js](/c:/Users/Raffael/Documents/GitHub/web-ppdb/assets/app.js)
- [assets/config.example.js](/c:/Users/Raffael/Documents/GitHub/web-ppdb/assets/config.example.js)
- [supabase/schema.sql](/c:/Users/Raffael/Documents/GitHub/web-ppdb/supabase/schema.sql)
- [supabase/seed-admin.sql](/c:/Users/Raffael/Documents/GitHub/web-ppdb/supabase/seed-admin.sql)
- [supabase/functions/admin-delete-user/index.ts](/c:/Users/Raffael/Documents/GitHub/web-ppdb/supabase/functions/admin-delete-user/index.ts)

## Setup Supabase

1. Buat project baru di Supabase.
2. Buka SQL Editor lalu jalankan [supabase/schema.sql](/c:/Users/Raffael/Documents/GitHub/web-ppdb/supabase/schema.sql).
3. Di `Authentication > Providers`, aktifkan login Email.
4. Kalau mau login langsung setelah register, nonaktifkan email confirmation sementara.
5. Copy `Project URL` dan `anon public key`.
6. Edit [assets/config.js](/c:/Users/Raffael/Documents/GitHub/web-ppdb/assets/config.js) pakai format dari [assets/config.example.js](/c:/Users/Raffael/Documents/GitHub/web-ppdb/assets/config.example.js).

Contoh:

```js
window.APP_CONFIG = {
  supabaseUrl: "https://xxxxx.supabase.co",
  supabaseAnonKey: "eyJ..."
};
```

Schema ini akan membuat:

- tabel `profiles`
- tabel `applications`
- tabel `application_documents`
- tabel `application_history`
- bucket storage `ppdb-documents`
- RLS policy untuk user dan admin
- view `admin_applications_view`

## Alur User

1. User registrasi akun.
2. User login.
3. User isi biodata siswa dan data orang tua.
4. User upload dokumen.
5. User bisa simpan `Draft` atau `Kirim Pendaftaran`.
6. Setelah dikirim, admin bisa verifikasi dan memberi catatan.

Dokumen wajib saat klik `Kirim Pendaftaran`:

- pas foto
- kartu keluarga
- akte kelahiran
- rapor / nilai

## History / Audit Trail

Setiap perubahan penting sekarang dicatat ke tabel `application_history`, termasuk:

- formulir dibuat
- formulir diperbarui
- pendaftaran dikirim
- status diubah admin
- catatan admin diperbarui
- dokumen diupload atau diperbarui
- dokumen dihapus

History ini tampil:

- di dashboard user sebagai timeline aktivitas
- di modal detail admin untuk setiap pendaftar

## Buat Admin

1. Register akun admin lewat web ini, misalnya `admin@ppdb.id`.
2. Edit email di [supabase/seed-admin.sql](/c:/Users/Raffael/Documents/GitHub/web-ppdb/supabase/seed-admin.sql).
3. Jalankan SQL itu di Supabase.
4. Login ulang. Akun tersebut akan masuk ke dashboard admin.

## Edge Function Hapus User

Frontend sudah memanggil function `admin-delete-user`, jadi supaya tombol hapus benar-benar menghapus:

- akun auth
- profil
- pendaftaran
- record dokumen
- file di Storage

Langkah deploy:

1. Install Supabase CLI di komputer lokal kamu.
2. Login ke Supabase CLI.
3. Deploy function dari [supabase/functions/admin-delete-user/index.ts](/c:/Users/Raffael/Documents/GitHub/web-ppdb/supabase/functions/admin-delete-user/index.ts).
4. Tambahkan secret `SUPABASE_ANON_KEY` dan `SUPABASE_SERVICE_ROLE_KEY`.

Command umumnya:

```bash
supabase functions deploy admin-delete-user
supabase secrets set SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
```

## Upload ke GitHub

Karena terminal saya saat ini tidak punya `git`, saya belum bisa push langsung. Di mesin kamu, jalankan:

```bash
git init
git add .
git commit -m "Initial PPDB web"
git branch -M main
git remote add origin https://github.com/USERNAME/web-ppdb.git
git push -u origin main
```

## Deploy ke Vercel

1. Push repo ini ke GitHub.
2. Login ke Vercel.
3. Import repository `web-ppdb`.
4. Framework preset pilih `Other`.
5. Deploy.

Karena ini project statis, Vercel tidak butuh build command khusus.

## Keterbatasan Saat Ini

- Saya belum bisa push ke GitHub dari environment ini karena `git` tidak tersedia.
- Saya belum bisa jalankan test browser end-to-end di environment ini karena `node` dan tooling frontend tidak tersedia.
- Kalau project Supabase kamu sebelumnya sudah pakai schema versi lama, paling aman jalankan ini di project Supabase fresh atau sesuaikan migration manual.
- Versi ini tetap berbasis static frontend + Supabase, jadi kalau nanti mau tambah export PDF, email otomatis, laporan kompleks, atau workflow multi-step, lebih cocok dinaikkan ke `Next.js + Supabase`.
