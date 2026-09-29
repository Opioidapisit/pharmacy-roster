# Pharmacy Roster Web V5 — Schedule System

เพิ่มจาก V4:

## สำหรับ User ทุกคน
- เมนู "ดูตารางเวร"
- เห็นเฉพาะเวรของตัวเอง
- เลือกเดือน
- สรุปชั่วโมง
- สรุป เช้า 08-16 / บ่าย 16-24 / AD 09-24 / OFF

## สำหรับ Manager / Admin
- เมนู "จัดตารางเวร"
- Matrix ทั้งเดือนในหน้าเดียว:
  - วันที่ = แถว
  - ทุกสาขา = คอลัมน์
  - REQUEST = คอลัมน์สุดท้าย
- สี User แต่ละคนไม่เหมือนกัน
- Legend สี User
- Coverage bar 08:00-24:00 ในแต่ละวัน/สาขา
- เลือกเวลาเริ่ม-จบได้อิสระ
- OFF
- หมายเหตุ
- เพิ่ม/แก้ไข/ลบได้บน Browser โดยยังไม่เขียน Firestore
- ปุ่ม "บันทึกทั้งหมด" เขียนทุกการเปลี่ยนแปลงด้วย Firestore writeBatch ครั้งเดียว
- เตือนเมื่อออกจากหน้า / เปลี่ยนเดือน / refresh ทั้งที่ยังไม่ได้บันทึก
- Summary ถูกย้ายไว้ล่างสุด

## Firestore
Collection:
`schedules/{scheduleId}`

Fields:
- yearMonth
- date
- branchId
- userId
- userName
- startTime
- endTime
- isOff
- note
- deleted
- createdAt
- updatedAt
- updatedBy

## สำคัญ
V5 ปรับ Firestore Rules ของ schedules:
- User อ่านได้เฉพาะเวรตัวเอง
- Manager/Admin อ่านและจัดการทั้งหมด

ก่อนทดสอบ V5:
1. เปิด Firestore > Rules
2. วาง `firestore.rules` ชุด V5
3. Publish

GitHub:
Upload/overwrite:
- index.html
- app.css
- app.js
- firebase.js

Commit > รอ GitHub Pages > Ctrl+F5
