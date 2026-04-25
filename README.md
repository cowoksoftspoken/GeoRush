# GeoRush

GeoRush adalah game location guessing multiplayer real-time berbasis Vue, Mapillary, Leaflet, dan Firebase. Pemain masuk dengan Google, membuat atau bergabung ke room, menebak lokasi dari street-level imagery, lalu bersaing lewat skor ronde dan global leaderboard.

## Fitur

- Multiplayer real-time dengan room code 4 huruf.
- Login Google via Firebase Authentication.
- Global leaderboard berbasis Firebase Realtime Database.
- Imagery Mapillary dengan auto-reroll jika gambar gagal dimuat.
- Pool lokasi lintas Asia, Europe, Americas, dan Oceania.
- Minimap interaktif untuk menaruh tebakan.
- Round result map dengan garis jarak tebakan ke lokasi benar.
- Solo win otomatis jika lawan keluar atau disconnect saat game berjalan.

## Tech Stack

- Vue 3
- TypeScript
- Vite
- Firebase Authentication
- Firebase Realtime Database
- MapillaryJS dan Mapillary Graph API
- Leaflet

## Prasyarat

- Node.js versi modern.
- Project Firebase.
- Firebase Authentication dengan provider Google aktif.
- Firebase Realtime Database aktif.
- Mapillary access token.

## Setup

Install dependency:

```bash
npm install
```

Buat file `.env` di root project:

```env
VITE_MAPILLARY_ACCESS_TOKEN=YOUR_MAPILLARY_ACCESS_TOKEN
```

Jalankan development server:

```bash
npm run dev
```

Build production:

```bash
npm run build
```

Preview build:

```bash
npm run preview
```

## Firebase

Konfigurasi Firebase ada di `src/firebase/index.ts`. Pastikan nilai berikut sesuai dengan project Firebase yang dipakai:

- `apiKey`
- `authDomain`
- `databaseURL`
- `projectId`
- `storageBucket`
- `messagingSenderId`
- `appId`

Di Firebase Console:

1. Buka Authentication.
2. Aktifkan Google provider.
3. Buka Realtime Database.
4. Buat database.
5. Deploy atau paste rules dari `firebase-rules.json`.

Jika memakai Firebase CLI, tambahkan `firebase.json` seperti ini:

```json
{
  "database": {
    "rules": "firebase-rules.json"
  }
}
```

Lalu deploy:

```bash
firebase deploy --only database
```

## Struktur Data

Realtime Database memakai struktur utama:

```text
rooms/{roomCode}
leaderboard/{uid}
```

`rooms/{roomCode}` menyimpan:

- `meta`: host, status game, ronde aktif, durasi ronde, dan winner jika solo win.
- `players`: data pemain, skor per ronde, total skor, warna, dan foto profil.
- `locations`: lokasi Mapillary untuk setiap ronde.
- `rounds`: waktu ronde dan tebakan pemain.

`leaderboard/{uid}` menyimpan:

- best score.
- last score.
- total score.
- games played.
- average score.
- wins.
- waktu terakhir bermain.

## Rules

Rules yang dipakai ada di `firebase-rules.json`.

Inti aksesnya:

- Room baru boleh dibuat oleh user yang sudah login.
- Host boleh mengatur meta room, lokasi, ronde, reset, dan skor.
- Pemain boleh menulis data player miliknya sendiri.
- Pemain boleh submit guess miliknya sekali per ronde.
- Pemain yang masih ada di room boleh mengubah meta untuk kasus solo win.
- Leaderboard bisa dibaca publik.
- User hanya boleh menulis entry leaderboard miliknya sendiri.

Jika muncul `permission denied`, cek tiga hal ini:

- Rules terbaru sudah benar-benar ter-deploy ke database yang sama dengan `databaseURL`.
- User sudah login Google sebelum create atau join room.
- Firebase project di `src/firebase/index.ts` sama dengan project tempat rules dideploy.

## Mapillary

Game memakai Mapillary Graph API untuk mencari image di sekitar seed location. Field yang dipakai antara lain:

- `id`
- `computed_geometry`
- `geometry`
- `computed_compass_angle`
- `compass_angle`
- `thumb_1024_url`

Jika image gagal dimuat di MapillaryJS, host akan otomatis mencari lokasi baru dan menulisnya ke room supaya semua client ikut pindah ke imagery yang valid.

## Catatan Development

- Room lama yang dibuat sebelum rules atau kode terbaru bisa menyimpan data lama. Buat room baru setelah deploy rules.
- Warning chunk size dari Vite bisa muncul karena Firebase, MapillaryJS, dan Leaflet cukup besar. Itu bukan error build.
- Untuk production, pertimbangkan memindahkan Firebase config ke environment variable dan menambahkan domain deployment ke Authorized domains di Firebase Authentication.
