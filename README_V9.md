# Pharmacy Roster Web V9 — Production 1.0

V9 เป็นรอบ Final Production จาก V8

## เพิ่มตามคำขอ: หน้า "ดูตารางเวร"
- User ปกติ: เห็นเฉพาะตารางของตัวเองเหมือนเดิม
- Manager / Admin:
  - มี Dropdown เลือก User
  - ดูตารางของ User ทุกคนได้
  - สรุปชั่วโมง / เช้า / บ่าย / AD / OFF เปลี่ยนตาม User ที่เลือก
- ปุ่ม "ขอแก้เวร" จะแสดงเฉพาะตอนกำลังดูตารางของบัญชีตัวเอง
  Manager/Admin จะไม่สามารถส่ง Change Request แทน User อื่นจากหน้านี้

## Fix สำหรับ Manager
- Manager โหลด Branch Master ได้
- Manager โหลด User Master เพื่อใช้ Matrix / สี User / Dropdown ดูตาราง
- เมนูแก้ Master ยังถูกจำกัดเฉพาะ Admin

## Export
### หน้า "ดูตารางเวร"
- Export Excel `.xls`
- Print / Save as PDF

### หน้า "จัดตารางเวร"
- Export ตารางทั้งหมดเป็น Excel `.xls`
- Print / Save as PDF แบบ Matrix
- Export ใช้ข้อมูลที่กำลังแสดง รวม Draft ที่ยังไม่ Save ในหน้าจัดเวร

## Backup
Admin > Maintenance:
- Export Backup JSON
- เก็บ:
  users, branches, settings, schedules, requests,
  requestDays, requestUsage, changeRequests, auditLogs
- ไม่รวม Firebase Authentication Password

## Validation UX
คง behavior ตาม V8:
- ปัญหาแดงแสดงอัตโนมัติ
- Warning สีเหลืองไม่เปิดเอง
- กด "ตรวจสอบตาราง" เพื่อเปิด/ปิด Warning
- ก่อน Save All ยังตรวจทั้ง Critical + Warning

## Audit เพิ่ม
- SCHEDULE_EXPORT
- BACKUP_EXPORT

## Deploy
V9 ไม่ต้องเปลี่ยน Firestore Rules จาก V8

GitHub root:
- index.html
- app.css
- app.js
- firebase.js

Commit > รอ GitHub Pages > Ctrl+F5

Build ที่หน้า Login:
`Build V9.0.0 · Production 1.0`
