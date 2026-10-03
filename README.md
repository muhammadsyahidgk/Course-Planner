# Course Planner

Planner perkuliahan pribadi: jadwal, absensi, tugas, dan daftar mata kuliah. Data disimpan di akun dan tersinkron antar perangkat.

## Fitur
- **Mata kuliah:** nama, dosen, SKS, dan hingga 2 waktu kelas per mata kuliah
- **Jadwal:** tampilan jadwal mingguan dari data mata kuliah
- **Absensi:** catat kehadiran harian (Hadir, Izin, Sakit, Alpha, Tidak ada), rekap persentase, dan riwayat yang bisa diedit
- **Tugas:** judul, keterangan, tenggat, dan tanda selesai
- **Akun:** login email dan kata sandi, sinkron lewat Supabase
- **Tampilan:** mode terang, gelap, atau ikut sistem

## Struktur
- `index.html`: kerangka halaman
- `style.css`: tampilan
- `script.js`: logika aplikasi dan koneksi Supabase

## Setup
1. Buat project di [Supabase](https://supabase.com).
2. Jalankan SQL berikut di SQL Editor:

```sql
create table planner_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table planner_state enable row level security;

create policy "akses data sendiri" on planner_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

3. Buat akun di **Authentication → Users** (aplikasi ini tidak punya halaman daftar).
4. Isi `SUPABASE_URL` dan `SUPABASE_ANON_KEY` (publishable key) di bagian atas `script.js`.
5. Deploy folder ini sebagai situs statis, atau buka `index.html` di browser.

> RLS wajib aktif. Publishable key memang terlihat publik, jadi kebijakan RLS-lah yang menjaga data tiap pengguna.

## Catatan
- Sinkron menyimpan seluruh data sebagai satu blok dan memakai versi terbaru. Mengedit di dua perangkat sekaligus bisa menimpa perubahan yang lebih lama.
- Absensi diisi otomatis "Hadir" sekali saja untuk akun baru (sejak 7 Sep 2026). Ubah lewat tombol ✎ di Riwayat bila ada yang libur.
