# Course Planner

Aplikasi perkuliahan pribadi untuk mengelola jadwal, absensi, tugas, dan daftar mata kuliah. Data disimpan di akun dan disinkronkan antarperangkat.

## Fitur
- **Mata kuliah dan jadwal:** data bersama yang sama untuk satu prodi; admin mengelola nama mata kuliah, dosen, SKS, dan waktu kelas dari tab Mata Kuliah
- **Jadwal Prodi:** otomatis mengikuti jadwal pada kartu Mata Kuliah
- **Absensi:** rekap persentase dan riwayat; tombol di samping rekap membuka formulir untuk mencatat satu mata kuliah hari ini (bawaan Hadir, status bisa diubah)
- **Tugas:** tugas bersama program studi yang dikelola administrator prodi
- **Program studi:** data bersama khusus peserta prodi, dengan hak edit untuk administrator prodi
- **Peserta:** daftar akun yang memilih program studi yang sama
- **Akun:** masuk dengan alamat surel dan kata sandi, sinkronisasi melalui Supabase
- **Tampilan:** mode terang, gelap, atau ikut sistem

## Struktur Berkas
- `index.html`: halaman utama dengan desain baru
- `style.css`: gaya dasar dan gaya desain baru
- `index.html.old`, `style.css.old`: salinan halaman dan gaya asli
- `script.js`: logika aplikasi dan koneksi Supabase
- `prodi.js`: sinkronisasi jadwal, tugas, peran admin, dan peserta prodi

## Penyiapan
1. Buat proyek di [Supabase](https://supabase.com).
2. Jalankan SQL berikut di Editor SQL:

> Untuk proyek yang sudah dibuat sebelumnya, jalankan seluruh blok SQL ini lagi. Tabel yang ada tidak dihapus; blok ini memperbarui batasan jenis data dan menambahkan tabel status tugas pribadi.

```sql
create table if not exists planner_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table planner_state enable row level security;

drop policy if exists "akses data sendiri" on planner_state;
create policy "akses data sendiri" on planner_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists programs (
  id text primary key,
  name text not null
);

insert into programs (id, name)
values ('ti-pagi', 'Teknik Informatika Pagi')
on conflict (id) do update set name = excluded.name;

create table if not exists program_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  program_id text not null references programs(id),
  display_name text not null,
  role text not null default 'member' check (role in ('member', 'admin'))
);

create table if not exists program_content (
  id text primary key,
  program_id text not null references programs(id) on delete cascade,
  kind text not null check (kind in ('schedule', 'task')),
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table program_content drop constraint if exists program_content_kind_check;
alter table program_content add constraint program_content_kind_check
  check (kind in ('course', 'schedule', 'task'));

create table if not exists program_task_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  program_id text not null references programs(id) on delete cascade,
  task_id text not null references program_content(id) on delete cascade,
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, task_id)
);

alter table program_members enable row level security;
alter table program_content enable row level security;
alter table program_task_progress enable row level security;

create or replace function current_program_id()
returns text
language sql stable security definer
set search_path = public
as $$
  select program_id from program_members where user_id = auth.uid()
$$;

create or replace function is_program_admin(target_program_id text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from program_members
    where user_id = auth.uid()
      and program_id = target_program_id
      and role = 'admin'
  )
$$;

grant execute on function current_program_id() to authenticated;
grant execute on function is_program_admin(text) to authenticated;
revoke all on function current_program_id() from public, anon;
revoke all on function is_program_admin(text) from public, anon;
grant select on programs to authenticated;
grant select, insert, update on program_members to authenticated;
grant select, insert, update, delete on program_content to authenticated;
grant select, insert, update on program_task_progress to authenticated;

drop policy if exists "anggota melihat peserta satu prodi" on program_members;
create policy "anggota melihat peserta satu prodi" on program_members
  for select to authenticated
  using (user_id = auth.uid() or program_id = current_program_id());

drop policy if exists "pengguna memilih prodi sebagai anggota" on program_members;
create policy "pengguna memilih prodi sebagai anggota" on program_members
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and role = 'member'
    and exists (select 1 from programs where id = program_id)
  );

drop policy if exists "anggota dapat mengganti pilihan prodi" on program_members;
create policy "anggota dapat mengganti pilihan prodi" on program_members
  for update to authenticated
  using (user_id = auth.uid() and role = 'member')
  with check (
    user_id = auth.uid()
    and role = 'member'
    and exists (select 1 from programs where id = program_id)
  );

drop policy if exists "anggota prodi melihat jadwal dan tugas" on program_content;
create policy "anggota prodi melihat jadwal dan tugas" on program_content
  for select to authenticated
  using (program_id = current_program_id());

drop policy if exists "admin prodi menambah data" on program_content;
create policy "admin prodi menambah data" on program_content
  for insert to authenticated
  with check (is_program_admin(program_id));

drop policy if exists "admin prodi mengubah data" on program_content;
create policy "admin prodi mengubah data" on program_content
  for update to authenticated
  using (is_program_admin(program_id))
  with check (is_program_admin(program_id));

drop policy if exists "admin prodi menghapus data" on program_content;
create policy "admin prodi menghapus data" on program_content
  for delete to authenticated
  using (is_program_admin(program_id));

drop policy if exists "peserta mengelola status tugas pribadi" on program_task_progress;
create policy "peserta mengelola status tugas pribadi" on program_task_progress
  for all to authenticated
  using (
    user_id = auth.uid()
    and program_id = current_program_id()
    and exists (
      select 1 from program_content
      where id = task_id and program_id = program_task_progress.program_id and kind = 'task'
    )
  )
  with check (
    user_id = auth.uid()
    and program_id = current_program_id()
    and exists (
      select 1 from program_content
      where id = task_id and program_id = program_task_progress.program_id and kind = 'task'
    )
  );

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'program_content'
     ) then
    alter publication supabase_realtime add table public.program_content;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'program_task_progress'
     ) then
    alter publication supabase_realtime add table public.program_task_progress;
  end if;
end $$;
```

3. Buat akun peserta dan admin di **Autentikasi → Pengguna** (aplikasi ini tidak menyediakan halaman pendaftaran). Setelah akun calon admin dibuat, tetapkan admin prodi melalui SQL Editor (ganti alamat surel):

```sql
insert into program_members (user_id, program_id, display_name, role)
select id, 'ti-pagi', coalesce(raw_user_meta_data ->> 'full_name', email), 'admin'
from auth.users
where email = 'admin@example.com'
on conflict (user_id) do update
set program_id = excluded.program_id,
    display_name = excluded.display_name,
    role = 'admin';
```

Peran admin hanya dapat diubah lewat SQL oleh pengelola Supabase. Untuk prodi berikutnya, tambahkan baris pada tabel `programs` dan pilihan program tersebut di `PROGRAMS` pada `prodi.js`, lalu tetapkan admin untuk program itu. Akun yang memilih prodi dapat melihat mata kuliah, jadwal, tugas, dan daftar peserta prodi itu; kebijakan RLS mencegah akses lintas prodi dan membatasi perubahan mata kuliah/jadwal/tugas untuk admin.

Untuk menyalin mata kuliah dan tugas lama dari data pribadi admin ke prodi, masuk dengan akun admin, buka tab **Mata Kuliah** atau **Tugas Prodi**, lalu pilih **Impor data lama**. Impor menyalin data dari akun admin yang sedang masuk, melewati data yang sudah ada, dan tidak menghapus data pribadi asal. Jadwal prodi lama yang sudah ada akan dipindahkan ke data mata kuliah bersama pada saat admin memuat prodi.

4. Isi `SUPABASE_URL` dan `SUPABASE_ANON_KEY` (kunci publik) di bagian atas `script.js`.
5. Terbitkan folder ini sebagai situs statis.

## Pasang di ponsel

Aplikasi mendukung pemasangan sebagai PWA. Situs harus dibuka melalui HTTPS (misalnya GitHub Pages); membuka `index.html` langsung dari komputer (`file://`) tidak mendukung pemasangan.

Untuk menerbitkan melalui GitHub Pages, buka **Settings → Pages**, pilih **Deploy from a branch**, pilih branch utama dan folder `/ (root)`, lalu simpan. Setelah situs terbit, buka alamat Pages tersebut di Chrome Android. Pilih **⋮ → Instal aplikasi** atau **Tambahkan ke layar utama → Instal**. Di iPhone/iPad, buka dengan Safari lalu pilih **Bagikan → Tambahkan ke Layar Utama**.

Shell aplikasi dan berkas inti disimpan untuk akses offline setelah kunjungan pertama. Sinkronisasi akun Supabase tetap memerlukan internet.

> RLS wajib aktif. Kunci publik memang dapat dilihat siapa saja, jadi kebijakan RLS-lah yang melindungi data setiap pengguna.

## Catatan
- Sinkronisasi menyimpan seluruh data sebagai satu blok dan memakai versi terbaru. Mengedit di dua perangkat sekaligus dapat menimpa perubahan yang lebih lama.
- Mata kuliah dan jadwal berasal dari data bersama prodi yang sama. Catatan dan status absensi tetap pribadi per akun.
- Centang selesai pada tugas disimpan per akun di tabel `program_task_progress`, terpisah dari data pribadi perencana kuliah.
- Jadwal prodi lama dikonversi menjadi mata kuliah bersama saat admin prodi membuka aplikasi setelah pembaruan skema.
- Untuk setiap mata kuliah prodi, riwayat absensi pribadi diisi otomatis "Hadir" sejak 7 Sep 2026 sampai hari ini saat pertama kali dibuka; peserta dapat mengubah status tiap catatan melalui tombol ✎. "Catat kehadiran" berada di samping judul rekap dan mencatat satu mata kuliah untuk hari ini.
