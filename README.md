<div align="center">
  <img src="icon-192.png" alt="SPDK ITU" width="120">
  
  # SPDK ITU
  ### Sistem Pendigitalan Data Kursus
  **Institut Teknologi Unggas (ITU), Jabatan Perkhidmatan Veterinar (DVS) Malaysia**

  [![Live](https://img.shields.io/badge/Portal-Live-brightgreen)](https://kursusitu.github.io/spdk)
  [![PWA](https://img.shields.io/badge/PWA-Ready-blue)](https://kursusitu.github.io/spdk)
  [![GAS](https://img.shields.io/badge/Platform-Google%20Apps%20Script-orange)](https://workspace.google.com)

  **🌐 URL Portal: [kursusitu.github.io/spdk](https://kursusitu.github.io/spdk)**
</div>

---

## 📋 Tentang Sistem

SPDK ITU adalah **portal pengurusan kursus dalaman Institut Teknologi Unggas (ITU)** yang membolehkan pegawai mendaftar dan mengurus penyertaan kursus secara dalam talian. Sistem ini dibina menggunakan Google Apps Script (GAS) dengan Google Sheets sebagai pangkalan data.

---

## 🚀 Cara Akses

| Platform | Cara |
|---|---|
| **Desktop** | Layari [kursusitu.github.io/spdk](https://kursusitu.github.io/spdk) |
| **Mobile (Android)** | Layari URL → Menu (⋮) → Add to Home Screen |
| **Mobile (iOS)** | Layari URL → Share → Add to Home Screen |

> ℹ️ Hanya email `@dvs.gov.my` dan `@gmail.com` dibenarkan untuk pendaftaran akaun.

---

## 👥 Peranan Pengguna

| Peranan | Keupayaan |
|---|---|
| **Peserta** | Daftar akaun, log masuk, semak katalog kursus, daftar kursus, semak status pendaftaran, muat turun eCERT |
| **Admin** | Semua keupayaan peserta + urus kursus, urus pendaftaran, hantar surat tawaran, urus kehadiran & QR, maklum balas, laporan & statistik |
| **Superadmin** | Semua keupayaan admin + urus pengguna, tetapkan peranan |

---

## 📦 Modul Sistem

| Modul | Penerangan |
|---|---|
| 🔐 **Auth** | Log masuk, daftar akaun, lupa/reset kata laluan, log keluar |
| 📚 **Katalog Kursus** | Senarai kursus tersedia, carian, tapisan |
| 📝 **Pendaftaran** | Daftar kursus, semakan kuota, semak status |
| 📊 **Dashboard** | Ringkasan status pendaftaran, kursus aktif |
| 🏫 **Urus Kursus** | Tambah, kemaskini, padam kursus |
| ✅ **Urus Pendaftaran** | Lulus/tolak permohonan, bulk approve/reject |
| 📧 **Surat Tawaran** | Jana dan hantar surat tawaran via emel |
| 📷 **Kehadiran & QR** | Tick manual admin, jana/scan QR, dan refresh status authoritative daripada backend selepas save |
| 💬 **Maklum Balas** | Borang maklum balas peserta, soalan dinamik |
| 🏆 **eCERT** | Auto-generate sijil digital, muat turun, verifikasi QR |
| 📈 **Laporan & Statistik** | Graf & carta, eksport Excel/PDF |
| 👤 **Profil** | Kemaskini maklumat peribadi, tukar kata laluan |
| 🔧 **Urus Pengguna** | Cipta, kemaskini, nyahaktif pengguna (Superadmin) |

---

## 🎨 Clay 3D Design System

Portal SPDK menggunakan tema **Clay 3D** — design language yang konsisten merentasi semua halaman:

| Elemen | Style |
|---|---|
| Background auth pages | `linear-gradient(145deg, #0d2b5e → #1a56db)` |
| Kad utama | `border-radius: 28px`, Clay 4-layer shadow |
| Button primary | Clay 3D gradient biru, press effect, `btnpop` animation |
| Input fields | `border-radius: 14px`, inset shadow, focus ring biru |
| SPDK dots | 4 warna: merah `#e63946`, biru `#1a56db`, kuning `#f4c430`, hijau `#2dc653` |
| Stat cards | `border-radius: 16px`, Clay shadow, `cardPop` animation |
| Counter | Rolling number animation dari 0 ke nilai sebenar |

**Halaman yang dah apply Clay 3D:**
- ✅ Login
- ✅ Daftar Akaun
- ✅ Dashboard Peserta
- ✅ Lupa Kata Laluan
- ✅ Reset Kata Laluan
- ✅ Panel Admin

---

## 📱 PWA (Progressive Web App)

Repo ini berfungsi sebagai **PWA shell** untuk SPDK ITU:

**Versi semasa:** `v1.0.1`

| Fail | Fungsi |
|---|---|
| `index.html` | PWA portal utama dengan route peserta, admin dan paparan eSijil |
| `manifest.json` | Metadata PWA (nama, icon, warna tema) |
| `sw.js` | Service Worker — offline fallback |
| `version.json` | Metadata versi untuk popup kemas kini |
| `offline.html` | Halaman offline Clay 3D |
| `icon-192.png` | Icon app 192×192 |
| `icon-512.png` | Icon app 512×512 |
| `assets/certificate-base.png` | Template kosong sijil untuk renderer PWA |

**Warna tema:** `#1a56db` (Biru DVS)

> `assets/certificate-base.png` digunakan oleh renderer sijil PWA. Jangan rename
> atau buang asset ini tanpa sync semula layout sijil.

---

## Release Frontend / PWA

Setiap kali deploy versi frontend baharu:

1. Update `APP_VERSION` dalam `index.html`.
2. Update `version` dalam `version.json`.
3. Update cache key dalam `sw.js`.
4. Commit perubahan.
5. Push ke repo `kursusitu/spdk`.
6. Tunggu GitHub Pages deploy.
7. Test browser normal dan mobile.
8. Pastikan `version.json` live.
9. Pastikan popup hanya muncul bila user masih guna versi lama.

Popup kemas kini membaca `version.json` dan membandingkannya dengan
`APP_VERSION`. Jika pengguna masih berada pada cache lama, popup akan meminta
pengguna refresh untuk mendapatkan versi PWA terkini.

---

## Kemas Kini Terkini

### PWA v1.0.1 - Sync Layout Sijil

PWA certificate renderer telah diselaraskan dengan layout final Apps Script
`SijilSaya.html`. Kemas kini ini hanya melibatkan repo GitHub Pages/PWA
`kursusitu/spdk` dan tidak mengubah backend GAS dalam source repo
`BurnDVS/SPDK-V1.5`.

Paparan sijil PWA kini menyokong:

- `SIJIL PENYERTAAN` untuk `Peserta` atau sijil lama tanpa `jenisSijil`.
- `SIJIL PENGHARGAAN` untuk `Penceramah`.
- No. Kad Pengenalan apabila data `noKp` dibekalkan oleh API.
- Paparan CPD optional apabila `cpd.text` wujud.
- QR pengesahan tanpa label teks bawah QR.
- Format tarikh/lokasi seragam: `pada`, tarikh, `bertempat di`, lokasi.

Template sijil menggunakan asset:

```text
https://kursusitu.github.io/spdk/assets/certificate-base.png
```

Version frontend telah dibump ke `v1.0.1` melalui `APP_VERSION`, `version.json`,
dan cache service worker.

### Urus Pendaftaran - Assign Peserta

PWA `Urus Pendaftaran > Assign Peserta` kini telah dipadankan dengan kelakuan asas
GAS Web App. Panel ini sudah mempunyai kawalan `Cari Nama`, `Jawatan`, `Gred` dan
`Reset`; pilihan `Gred` dibina secara dinamik daripada senarai peserta yang dimuatkan.

`Pilih Semua` dan `Nyahpilih` kini bertindak pada baris peserta yang sedang
dipaparkan selepas tapisan digunakan. Kiraan peserta dipilih dan status butang
`Assign` turut dikemas kini selepas perubahan tapisan atau checkbox.

Dropdown kursus juga memaparkan format `NamaKursus (TarikhMula)` apabila tarikh
wujud. Kemas kini ini hanya melibatkan frontend PWA dalam `index.html`; backend GAS,
database, manifest, service worker, offline page dan nama action API tidak diubah.

---

## eSijil PWA

Paparan eSijil kini dikendalikan terus dalam PWA melalui route `#view-sijil?certId=...`.

Flow peserta:
1. Log masuk ke PWA.
2. Buka menu **Sijil Saya**.
3. Klik **Buka Sijil**.

Sijil penuh dipaparkan dalam PWA sendiri dan tidak lagi redirect ke GAS `page=sijil-saya`. Data sijil diambil melalui API `getSijilSaya`, kemudian sijil dicari berdasarkan `certId`.

Template sijil PWA telah disync dengan layout final GAS `SijilSaya.html`.
Cetakan dan simpan PDF diset kepada A4 portrait. QR pengesahan sijil dipaparkan
pada sijil dan membawa pengguna ke page pengesahan GAS `page=verify-cert&certId=...`.

Fix ini hanya melibatkan PWA dan tidak mengubah GAS/backend.

---

## 🛠️ Tech Stack

| Komponen | Teknologi |
|---|---|
| **Backend** | Google Apps Script (GAS) |
| **Frontend** | HTML + CSS + JavaScript |
| **Database** | Google Sheets |
| **Email** | GmailApp (`bukhori@dvs.gov.my`) |
| **Auth** | Custom session token (UUID) |
| **QR Code** | api.qrserver.com |
| **PWA Hosting** | GitHub Pages (`kursusitu/spdk`) |
| **Source Code** | GitHub (`BurnDVS/SPDK-V1.5`) — private |

---

## 🔗 Repository Berkaitan

| Repo | Fungsi |
|---|---|
| [`kursusitu/spdk`](https://github.com/kursusitu/spdk) | PWA shell + short URL redirect (repo ini) |
| `BurnDVS/SPDK-V1.5` | Source code GAS (private) |

Repo `kursusitu/spdk` ialah production GitHub Pages/PWA. Source GAS production
dikekalkan berasingan dalam repo `BurnDVS/SPDK-V1.5`.

---

## Changelog

### 2026-07-13

- Selepas manual attendance disimpan, senarai peserta dimuat semula daripada
  backend supaya checkbox memaparkan status authoritative, termasuk rekod QR
  yang tidak boleh dibuang melalui stale untick.
- Perubahan frontend direkodkan dalam commit `132d233`.

### 2026-07-11

- Tambah asset `assets/certificate-base.png`.
- Sync renderer sijil PWA dengan layout final Apps Script `SijilSaya.html`.
- Sokong layout `SIJIL PENYERTAAN` dan `SIJIL PENGHARGAAN`.
- Bump PWA ke `v1.0.1`.

### 2026-06-24

- Tambah route paparan sijil PWA.
- Betulkan print layout A4.
- Betulkan QR pengesahan sijil.

---

## 📞 Hubungi

**Pembangunan & Penyelenggaraan:**
Urusetia Kursus, Institut Teknologi Unggas (ITU)
Jabatan Perkhidmatan Veterinar Malaysia
📧 bukhori@dvs.gov.my

---

<div align="center">
  <sub>© 2025 Institut Teknologi Unggas, Jabatan Perkhidmatan Veterinar Malaysia</sub>
</div>
