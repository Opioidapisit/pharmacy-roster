# Pharmacy Roster Web V8 — Maintenance + Audit + Validation UX

## ปรับ Validation ตามคำขอ
- ปัญหาแดง (Critical) แสดง/Highlight อัตโนมัติ
- ถ้ามีแต่ Warning สีเหลือง จะไม่เปิด Panel เอง
- Badge บนปุ่ม “ตรวจสอบตาราง” แสดงเฉพาะจำนวนปัญหาแดง
- กด “ตรวจสอบตาราง” เพื่อเปิด/ปิดรายละเอียด Warning สีเหลือง
- Coverage bar ยังทำงานตามปกติ
- ก่อน Save All ยังตรวจครบทั้ง Critical + Warning และถามก่อน Override

## Account
- User เปลี่ยนรหัสผ่านของตัวเองได้จาก Top bar
- ถ้า Firebase ต้องการ recent login ระบบจะแจ้งให้ Logout/Login ใหม่

## Audit Log (Admin)
บันทึกเหตุการณ์หลัก:
- BRANCH_SAVE
- USER_CREATE / USER_UPDATE
- REQUEST_CREATE / REQUEST_DELETE / REQUEST_RULE_SAVE
- SCHEDULE_SAVE
- CHANGE_REQUEST_CREATE / CHANGE_REQUEST_DECIDE
- PASSWORD_CHANGE
- RESET_OPERATIONAL_DATA

## Maintenance (Admin)
ปุ่มล้าง Operational Data:
- schedules
- requests
- requestDays
- requestUsage
- changeRequests

ไม่ลบ:
- users
- branches
- settings
- auditLogs

ต้องพิมพ์ `RESET` ก่อนยืนยัน

## IMPORTANT
V8 เปลี่ยน Firestore Rules เพื่อให้ Admin hard-delete operational collections ได้ตอน Reset

1. Firestore > Rules
2. วาง `firestore.rules` V8
3. Publish

GitHub:
Upload/overwrite:
- index.html
- app.css
- app.js
- firebase.js

Commit > รอ Pages > Ctrl+F5
