# Course Planner

Aplikasi perkuliahan pribadi untuk mengelola jadwal, absensi, tugas, dan daftar mata kuliah. Data disimpan di akun dan disinkronkan antarperangkat.

## Fitur
- **Mata kuliah:** pilih atau cari nama dari daftar yang disediakan, lalu atur dosen, SKS, dan hingga 2 waktu kelas per mata kuliah
- **Jadwal:** tampilan jadwal mingguan dari data mata kuliah
- **Absensi:** catat kehadiran harian (Hadir, Izin, Sakit, Alpa, Tidak ada), rekap persentase, dan riwayat yang bisa diedit
- **Tugas:** judul, keterangan, tenggat, dan tanda selesai
- **Akun:** masuk dengan alamat surel dan kata sandi, sinkronisasi melalui Supabase
- **Tampilan:** mode terang, gelap, atau ikut sistem

## Struktur Berkas
- `index.html`: halaman utama dengan desain baru
- `style.css`: gaya dasar dan gaya desain baru
- `index.html.old`, `style.css.old`: salinan halaman dan gaya asli
- `script.js`: logika aplikasi dan koneksi Supabase

## Penyiapan
1. Buat proyek di [Supabase](https://supabase.com).
2. Jalankan SQL berikut di Editor SQL:

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

3. Buat akun di **Autentikasi → Pengguna** (aplikasi ini tidak menyediakan halaman pendaftaran).
4. Isi `SUPABASE_URL` dan `SUPABASE_ANON_KEY` (kunci publik) di bagian atas `script.js`.
5. Terbitkan folder ini sebagai situs statis, atau buka `index.html` di peramban.

> RLS wajib aktif. Kunci publik memang dapat dilihat siapa saja, jadi kebijakan RLS-lah yang melindungi data setiap pengguna.

## Catatan
- Sinkronisasi menyimpan seluruh data sebagai satu blok dan memakai versi terbaru. Mengedit di dua perangkat sekaligus dapat menimpa perubahan yang lebih lama.
- Absensi diisi otomatis "Hadir" satu kali untuk akun baru (sejak 7 Sep 2026). Ubah melalui tombol ✎ di Riwayat jika ada hari libur.
