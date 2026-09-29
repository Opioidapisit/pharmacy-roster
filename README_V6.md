# Pharmacy Roster Web V6 — Change Request / Approve-Reject

เพิ่มจาก V5:

## User
- ในหน้า "ดูตารางเวร" แต่ละเวรมีปุ่ม "ขอแก้เวร"
- ขอเปลี่ยน:
  - สาขา
  - เวลาเริ่ม
  - เวลาจบ
  - OFF
  - เหตุผล
- 1 เวรมีคำขอ Pending ได้ครั้งละ 1 รายการ
- หน้าเวรแสดงสถานะ:
  - รออนุมัติ
  - อนุมัติแล้ว
  - ไม่อนุมัติ

## Manager / Admin
- หน้า "จัดตารางเวร" มีปุ่ม "คำขอแก้เวร"
- มี badge จำนวน Pending
- เห็นเวรเดิมเทียบกับเวรที่ User ขอ
- Approve / Reject
- Approve ใช้ Firestore Transaction:
  1. ตรวจว่าคำขอยัง pending
  2. ตรวจว่า schedule เดิมยังมี
  3. แก้ schedule
  4. เปลี่ยน changeRequest เป็น approved
- User เห็นตารางใหม่แบบ Realtime โดยไม่ Refresh

Collection:
`changeRequests/{id}`

ก่อนทดสอบ:
1. Firestore > Rules
2. วาง `firestore.rules` V6
3. Publish

GitHub:
Upload/overwrite:
- index.html
- app.css
- app.js
- firebase.js

Commit > รอ Pages deploy > Ctrl+F5

Test แนะนำ:
1. Login User
2. เปิด "ดูตารางเวร"
3. กด "ขอแก้เวร"
4. Logout
5. Login Manager/Admin
6. เปิด "จัดตารางเวร" > "คำขอแก้เวร"
7. Approve
8. Login User อีกครั้ง / หรือเปิดอีก browser แล้วดูตารางเปลี่ยนแบบ Realtime
