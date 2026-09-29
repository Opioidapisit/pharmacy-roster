# Pharmacy Roster Web V2 — Branch Master

## ใช้แทน V1 ทั้ง 4 ไฟล์ที่ root
- index.html
- app.css
- app.js
- firebase.js

## เพิ่มใน V2
- Dashboard ใหม่
- Sidebar
- Role-based Admin menu
- Branch Master
- เพิ่ม / แก้ไข / Active-Inactive
- Parent branch เช่น A > A1
- เวลาเปิด / ปิด
- Sort order
- Firestore realtime listener
- Loading overlay
- Search + filter

## Firestore collection
`branches/{branchId}`

Fields:
- branchId
- branchName
- parentBranchId
- openTime
- closeTime
- sortOrder
- active
- createdAt
- updatedAt

## Deploy
1. แตก ZIP
2. Upload/overwrite 4 ไฟล์ที่ root ของ GitHub repository
3. Commit changes
4. รอ GitHub Pages deploy
5. Ctrl+F5
6. Login admin
7. เข้า "จัดการสาขา"
