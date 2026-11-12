

PRD
ApplyTrack Agent
Automated Job Application Tracking & Analytics System
1. Overview
Product Name

ApplyTrack

Product Vision

Membantu pencari kerja mencatat, mengelola, dan menganalisis seluruh proses pencarian kerja secara otomatis tanpa harus melakukan input manual setiap kali melamar pekerjaan.

> Catatan (12 Nov 2026): sinkronisasi JobStreet dihapus dulu — sync-nya gagal terus — produk fokus ke Glints. Baris JobStreet lama yang sudah tersimpan tetap tampil. Bagian PRD di bawah yang menyebut JobStreet masih menggambarkan visi awal, bukan fitur yang aktif.

Ketika pengguna melamar suatu lowongan di platform seperti:

JobStreet
Glints
LinkedIn
Kalibrr
Indeed

Agent akan mendeteksi aktivitas tersebut, mengekstrak informasi lowongan, dan menyimpannya ke database secara otomatis.

2. Problem Statement

Saat aktif mencari kerja, pengguna sering:

Lupa posisi yang sudah dilamar
Lupa tanggal apply
Tidak tahu perusahaan mana yang sudah di-follow up
Sulit menghitung rasio interview
Kesulitan menentukan platform terbaik

Biasanya pencatatan dilakukan secara manual menggunakan:

Excel
Google Sheets
Notion

yang memakan waktu dan sering tidak konsisten.

3. Goals
Business Goals
Meningkatkan keteraturan pencarian kerja
Mengurangi input manual
Menyediakan insight berbasis data
User Goals
Tidak perlu mencatat lamaran secara manual
Mengetahui status setiap lamaran
Melihat statistik progress pencarian kerja
4. Primary User
Job Seeker

Karakteristik:

Fresh Graduate
Career Switcher
Professional Employee
5. User Stories
US-001

Sebagai pencari kerja,

Saya ingin sistem mencatat setiap lowongan yang saya apply,

Agar saya tidak perlu memasukkan data secara manual.

US-002

Sebagai pencari kerja,

Saya ingin melihat seluruh riwayat lamaran,

Agar tidak melamar posisi yang sama dua kali.

US-003

Sebagai pencari kerja,

Saya ingin melihat progress setiap lamaran,

Agar dapat melakukan follow-up tepat waktu.

US-004

Sebagai pencari kerja,

Saya ingin melihat statistik lamaran,

Agar tahu platform mana yang paling efektif.

6. Core Features
Feature 1
Auto Job Detection

Agent mendeteksi user melakukan apply.

Trigger:

Click Apply
Form Submit
Redirect Success Page

Output:

{
  "timestamp": "2026-10-20 03:55",
  "platform": "Glints",
  "job_title": "Data Analyst",
  "company": "ABC Corp"
}

Feature 2
Automatic Job Extraction

Agent mengambil:

Job Title
Company
Location
URL
Employment Type
Salary (jika tersedia)

Contoh:

{
  "job_title": "Business Intelligence Analyst",
  "company": "PT XYZ",
  "location": "Jakarta",
  "platform": "JobStreet"
}

Feature 3
Application Tracker

Status lifecycle:

Applied
↓
HR Screening
↓
Interview
↓
Technical Test
↓
User Interview
↓
Offer
↓
Accepted


Alternatif:

Applied
↓
Rejected

Feature 4
Follow-Up Reminder

Agent memberikan reminder:

Belum ada update selama 14 hari.

Apakah ingin follow-up ke recruiter?

Feature 5
Analytics Dashboard

Metrics:

Total Applications
Total Interviews
Total Technical Tests
Total Offers
Total Rejections

Formula:

Interview Rate
=
Interview / Application

Offer Rate
=
Offer / Application

7. Agent Responsibilities
Agent Name

ApplyTrack Agent

Main Tasks
Observe

Memantau:

Glints
JobStreet
LinkedIn Jobs
Kalibrr
Indeed
Extract

Mengambil:

Job Title
Company
Location
URL
Platform
Apply Time

Categorize

Menentukan status:

Applied
Interview
Test
Offer
Rejected

Notify

Mengirim:

Reminder follow-up
Status update
Weekly report
8. Database Design
applications
Column	Typeid	UUID
job_title	VARCHAR
company_name	VARCHAR
platform	VARCHAR
location	VARCHAR
job_url	TEXT
applied_at	DATETIME
status	VARCHAR
notes	TEXT
status_history
Column	Typeid	UUID
application_id	UUID
old_status	VARCHAR
new_status	VARCHAR
changed_at	DATETIME
9. Dashboard Pages
Dashboard

Menampilkan:

Total Application
Interview Rate
Offer Rate
Platform Performance
Application List

Filter:

Platform
Status
Company
Date
Analytics

Visualisasi:

Applications per Month
Platform Distribution
Interview Conversion Funnel
Offer Conversion Funnel
10. Recommended Tech Stack
Frontend
Next.js
TailwindCSS
Shadcn/UI
Backend
FastAPI

atau

NestJS
Database
PostgreSQL
Agent Layer
OpenAI Agent SDK
LangGraph
CrewAI
Browser Monitoring
Chrome Extension
Analytics
Apache ECharts
Chart.js
MVP Scope (Versi Portfolio)

Jika ini untuk portfolio dan ingin selesai dalam 2-4 minggu:

MVP V1

✅ Manual Add Application
 ✅ Status Tracking
 ✅ Dashboard Analytics
 ✅ Reminder Follow-up

MVP V2

✅ Chrome Extension
 ✅ Auto Capture Apply Event
 ✅ Auto Fill Database

MVP V3

✅ Report Analysis
 ✅ Weekly Job Search Report
 ✅ Recommendation & Insights

Ini cocok dijadikan project portfolio yang kuat karena menggabungkan Full-Stack Development, Browser Extension, Database Design, dan Data Analytics dalam satu produk yang relevan dengan kebutuhan job seeker.