# Pharmacy Roster Web V7 — Schedule Validation

เพิ่มจาก V6:

- ตรวจเวรซ้อนของ User คนเดียวกัน รวมถึงอยู่ 2 สาขาพร้อมกัน
- ตรวจ OFF + เวรทำงานในวันเดียวกัน
- ตรวจเวรซ้ำ
- ตรวจเวลาไม่ถูกต้อง
- เตือนเวรยาวมากกว่า 15 ชั่วโมง (AD 09:00-24:00 = 15 ชั่วโมง ไม่เตือน)
- ตรวจ Coverage ทุกสาขา 08:00-24:00
- แสดงช่วงเวลาที่ Coverage ขาด
- Highlight สีแดง/เหลืองบน Matrix
- Coverage bar:
  - เขียว = 100%
  - เหลือง = 50-99%
  - แดง = <50%
- ปุ่ม “ตรวจสอบตาราง” พร้อม badge จำนวนปัญหา
- ก่อน Save All ระบบตรวจอีกครั้ง
- Manager/Admin ยัง Override และเลือกบันทึกต่อได้กรณีพิเศษ

Deploy:
1. Upload/overwrite: index.html, app.css, app.js, firebase.js
2. Commit
3. รอ GitHub Pages
4. Ctrl+F5

V7 ไม่เปลี่ยน Firestore schema หรือ Security Rules จาก V6
จึงไม่จำเป็นต้อง Publish Rules ใหม่ถ้ากำลังใช้ V6 Rules อยู่
