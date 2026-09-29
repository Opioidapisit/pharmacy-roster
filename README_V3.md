# Pharmacy Roster Web V3 — User Master

เพิ่มจาก V2.1:
- User Master จริง
- Realtime users collection
- Search / filter role / filter active
- เพิ่ม User จากหน้า Admin
- สร้าง Firebase Authentication account โดยใช้ Secondary Firebase App
  ทำให้ Admin คนปัจจุบัน "ไม่หลุด Login"
- สร้าง Firestore `users/{uid}` profile พร้อมกัน
- แก้ไข name / role / homeBranch / color / active
- ป้องกัน Admin ปิด Active บัญชีตัวเองขณะกำลัง Login
- สีประจำ User สำหรับใช้ใน Schedule Matrix ต่อไป

สำคัญ:
- Username ใหม่จะถูกแปลงภายในเป็น `<username>@pharmacy-roster.local`
- Username ของบัญชีที่สร้างแล้วจะยังแก้ไม่ได้ใน V3
- การเปลี่ยน Password ของ User อื่นจะทำในขั้นต่อไปด้วย workflow ที่ปลอดภัยกว่า
- การปิด Active จะบล็อกการเข้า Web App ผ่าน Firestore profile/rules แม้ Auth account ยังมีอยู่

Deploy:
1. Upload/overwrite ที่ GitHub root:
   - index.html
   - app.css
   - app.js
   - firebase.js
2. Commit
3. รอ GitHub Pages deploy
4. Ctrl+F5
5. Login admin
6. เข้า "จัดการ User" และลองสร้าง user ทดสอบ
