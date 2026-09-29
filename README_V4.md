# Pharmacy Roster Web V4 — Request System

เพิ่มจาก V3:
- เมนู Request สำหรับทุก Role
- Calendar ทั้งเดือน
- ทุกคนเห็น Request ของวันนั้นแบบ Realtime
- Queue No เรียงตาม transaction ของ Firestore
- Request preset: ขอหยุด / ขอเข้าเช้า / ขอเข้าบ่าย / ขอเข้า AD
- User 1 คนมี Request ได้ 1 รายการต่อวัน
- User ลบ Request ตัวเองได้
- Manager/Admin ลบ Request ของทุกคนได้
- Manager/Admin ตั้ง:
  - จำนวน Request สูงสุดต่อวัน
  - จำนวนวัน Request สูงสุดต่อ User ต่อเดือน
- Firestore Transaction ป้องกันหลายคนแย่ง slot สุดท้ายพร้อมกัน
- ลบ Request แล้ว Queue เดิมไม่ถูกนำกลับมาใช้ซ้ำ
- Realtime update โดยไม่ Refresh

Collections:
- requests/{date__uid}
- requestDays/{date}
- requestUsage/{yearMonth__uid}
- settings/requestRules_{yearMonth}

สำคัญมาก:
ก่อนทดสอบ Request ให้อัปเดต Firestore Rules ด้วยไฟล์ `firestore.rules`
แล้วกด Publish

Deploy GitHub:
อัปโหลด/ทับ:
- index.html
- app.css
- app.js
- firebase.js

จากนั้น Commit > รอ Pages deploy > Ctrl+F5
