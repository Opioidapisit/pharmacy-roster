import { auth, db, firebaseConfig } from "./firebase.js?v=3.0.0";

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  getAuth,
  createUserWithEmailAndPassword,
  deleteUser
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";

import {
  initializeApp,
  deleteApp
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";

import {
  doc,
  getDoc,
  collection,
  onSnapshot,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

const $ = id => document.getElementById(id);
const setText = (id, value) => {
  const el = $(id);
  if(el) el.textContent = value ?? "";
  return el;
};
const toggleHidden = (id, hide) => {
  const el = $(id);
  if(el) el.classList.toggle("hidden", !!hide);
  return el;
};
const INTERNAL_DOMAIN = "pharmacy-roster.local";

let currentUser = null;
let currentProfile = null;
let branches = [];
let users = [];
let unsubscribeBranches = null;
let unsubscribeUsers = null;
let currentView = "dashboard";

const REQUIRED_V21 = [
  "loading","loadingText","toast","loginView","appView","topUser","roleBadge",
  "dashName","dashUsername","dashRole","branchNav","branchSearch","branchStatus",
  "branchRows","branchTableWrap","branchEmpty","userRows","userTableWrap","userEmpty","modalHost"
];
const missingV21 = REQUIRED_V21.filter(id=>!$(id));
if(missingV21.length){
  console.warn("V2.1 DOM mismatch:", missingV21);
}

function internalEmail(username){
  return `${username.trim().toLowerCase()}@${INTERNAL_DOMAIN}`;
}

function showLoading(show, text="กำลังโหลด..."){
  setText("loadingText", text);
  const el = $("loading");
  if(el) el.classList.toggle("hidden", !show);
}

function toast(message, isError=false){
  const el = $("toast");
  if(!el){ console.log(message); return; }
  el.textContent = message;
  el.className = `toast${isError ? " err" : ""}`;
  el.classList.remove("hidden");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(()=>el.classList.add("hidden"), 3000);
}

function showOnly(viewId){
  document.querySelectorAll(".view").forEach(v=>v.classList.add("hidden"));
  $(viewId).classList.remove("hidden");
}

function setNav(view){
  currentView = view;
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active", b.dataset.view===view));
  if(view==="dashboard") showOnly("dashboardView");
  if(view==="branches") showOnly("branchesView");
  if(view==="users") showOnly("usersView");
  $("sidebar").classList.remove("open");
}

function canAdmin(){
  return currentProfile?.active === true && currentProfile?.role === "admin";
}

$("loginForm").addEventListener("submit", async e=>{
  e.preventDefault();
  $("loginError").textContent = "";
  showLoading(true, "กำลังเข้าสู่ระบบ...");
  try{
    await signInWithEmailAndPassword(
      auth,
      internalEmail($("username").value),
      $("password").value
    );
  }catch(err){
    console.error(err);
    $("loginError").textContent = "Username หรือ Password ไม่ถูกต้อง";
    showLoading(false);
  }
});

$("logoutBtn")?.addEventListener("click", ()=>signOut(auth));
$("menuBtn")?.addEventListener("click", ()=>$("sidebar")?.classList.toggle("open"));
$("goBranchBtn")?.addEventListener("click", ()=>setNav("branches"));
document.querySelectorAll(".nav-item").forEach(btn=>btn.addEventListener("click", ()=>setNav(btn.dataset.view)));

onAuthStateChanged(auth, async user=>{
  showLoading(true, "กำลังโหลดข้อมูลผู้ใช้...");
  if(!user){
    currentUser = null;
    currentProfile = null;
    if(unsubscribeBranches){ unsubscribeBranches(); unsubscribeBranches=null; }
    if(unsubscribeUsers){ unsubscribeUsers(); unsubscribeUsers=null; }
    $("appView").classList.add("hidden");
    $("loginView").classList.remove("hidden");
    $("password").value = "";
    showLoading(false);
    return;
  }

  try{
    const snap = await getDoc(doc(db, "users", user.uid));
    if(!snap.exists()) throw new Error("ไม่พบ User profile ใน Firestore");

    const profile = snap.data();
    if(profile.active !== true) throw new Error("บัญชีนี้ถูกปิดใช้งาน");

    currentUser = user;
    currentProfile = { uid:user.uid, ...profile };

    $("loginView").classList.add("hidden");
    $("appView").classList.remove("hidden");

    setText("topUser", `${profile.name || profile.username} · ${profile.username}`);
    setText("roleBadge", profile.role || "-");
    setText("dashName", profile.name || "-");
    setText("dashUsername", profile.username || "-");
    setText("dashRole", profile.role || "-");

    const isAdmin = profile.role === "admin";
    $("branchNav").classList.toggle("hidden", !isAdmin);
    $("userNav").classList.toggle("hidden", !isAdmin);
    $("adminQuick").classList.toggle("hidden", !isAdmin);

    setNav("dashboard");
    if(isAdmin){
      startBranchListener();
      startUserListener();
    }

  }catch(err){
    console.error(err);
    await signOut(auth);
    $("loginError").textContent = err.message || "ไม่สามารถโหลดข้อมูลผู้ใช้ได้";
  }finally{
    showLoading(false);
  }
});

/* ---------------- BRANCH MASTER ---------------- */

function startBranchListener(){
  if(unsubscribeBranches) unsubscribeBranches();

  unsubscribeBranches = onSnapshot(
    collection(db, "branches"),
    snap=>{
      branches = snap.docs.map(d=>({ id:d.id, ...d.data() }));
      branches.sort((a,b)=>(Number(a.sortOrder)||9999)-(Number(b.sortOrder)||9999) || String(a.branchName||"").localeCompare(String(b.branchName||"")));
      renderBranches();
    },
    err=>{
      console.error(err);
      toast("โหลดข้อมูลสาขาไม่สำเร็จ", true);
    }
  );
}

$("branchSearch")?.addEventListener("input", renderBranches);
$("branchStatus")?.addEventListener("change", renderBranches);
$("addBranchBtn")?.addEventListener("click", ()=>openBranchModal());

function renderBranches(){
  if(!canAdmin()) return;

  const q = $("branchSearch").value.trim().toLowerCase();
  const status = $("branchStatus").value;

  const filtered = branches.filter(b=>{
    const text = `${b.id} ${b.branchId||""} ${b.branchName||""}`.toLowerCase();
    const matchesSearch = !q || text.includes(q);
    const active = b.active !== false;
    const matchesStatus =
      status==="all" ||
      (status==="active" && active) ||
      (status==="inactive" && !active);
    return matchesSearch && matchesStatus;
  });

  $("branchEmpty").classList.toggle("hidden", filtered.length !== 0);
  $("branchTableWrap").classList.toggle("hidden", filtered.length === 0);

  $("branchRows").innerHTML = filtered.map(b=>`
    <tr>
      <td><b>${escapeHtml(b.branchId || b.id)}</b></td>
      <td>${escapeHtml(b.branchName || "")}</td>
      <td>${escapeHtml(parentLabel(b.parentBranchId))}</td>
      <td>${escapeHtml(b.openTime || "08:00")}</td>
      <td>${escapeHtml(b.closeTime || "24:00")}</td>
      <td><span class="status ${b.active===false ? "inactive":"active"}">${b.active===false ? "Inactive":"Active"}</span></td>
      <td>${Number(b.sortOrder)||""}</td>
      <td>
        <div class="row-actions">
          <button class="btn ghost" data-edit="${escapeAttr(b.id)}">แก้ไข</button>
        </div>
      </td>
    </tr>
  `).join("");

  document.querySelectorAll("[data-edit]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const b = branches.find(x=>x.id===btn.dataset.edit);
      if(b) openBranchModal(b);
    });
  });
}

function parentLabel(parentId){
  if(!parentId) return "-";
  const parent = branches.find(x=>x.id===parentId || x.branchId===parentId);
  return parent ? `${parent.branchId || parent.id} · ${parent.branchName}` : parentId;
}

function openBranchModal(branch=null){
  if(!canAdmin()){
    toast("เฉพาะ Admin เท่านั้น", true);
    return;
  }

  const editing = !!branch;
  const parentOptions = branches
    .filter(b=>!editing || b.id!==branch.id)
    .map(b=>`<option value="${escapeAttr(b.id)}" ${branch?.parentBranchId===b.id ? "selected":""}>${escapeHtml(b.branchId||b.id)} · ${escapeHtml(b.branchName||"")}</option>`)
    .join("");

  $("modalHost").innerHTML = `
    <div class="modal-backdrop" id="branchBackdrop">
      <div class="modal">
        <div class="page-head">
          <div>
            <h2>${editing ? "แก้ไขสาขา":"เพิ่มสาขา"}</h2>
            <div class="muted">${editing ? escapeHtml(branch.branchName||"") : "สร้าง Branch Master ใหม่"}</div>
          </div>
        </div>

        <div class="modal-grid">
          <div>
            <label>Branch ID</label>
            <input id="mBranchId" value="${escapeAttr(branch?.branchId || branch?.id || "")}" ${editing ? "disabled":""} placeholder="เช่น A">
          </div>

          <div>
            <label>ชื่อสาขา</label>
            <input id="mBranchName" value="${escapeAttr(branch?.branchName || "")}" placeholder="เช่น Earth Pharmacy">
          </div>

          <div>
            <label>สาขาหลัก (กรณีเป็นสาขาย่อย)</label>
            <select id="mParent">
              <option value="">— ไม่มี —</option>
              ${parentOptions}
            </select>
          </div>

          <div>
            <label>ลำดับแสดงผล</label>
            <input id="mSort" type="number" min="1" value="${escapeAttr(branch?.sortOrder ?? branches.length+1)}">
          </div>

          <div>
            <label>เวลาเปิด</label>
            <input id="mOpen" value="${escapeAttr(branch?.openTime || "08:00")}" placeholder="08:00">
          </div>

          <div>
            <label>เวลาปิด</label>
            <input id="mClose" value="${escapeAttr(branch?.closeTime || "24:00")}" placeholder="24:00">
          </div>
        </div>

        <label class="checkbox-row">
          <input id="mActive" type="checkbox" ${branch?.active===false ? "" : "checked"}>
          Active / เปิดใช้งานสาขานี้
        </label>

        <div class="actions">
          <button id="cancelBranch" class="btn ghost">ยกเลิก</button>
          <button id="saveBranch" class="btn primary">${editing ? "บันทึกการแก้ไข":"เพิ่มสาขา"}</button>
        </div>
      </div>
    </div>
  `;

  $("cancelBranch").addEventListener("click", closeModal);
  $("branchBackdrop").addEventListener("click", e=>{ if(e.target.id==="branchBackdrop") closeModal(); });
  $("saveBranch").addEventListener("click", ()=>saveBranch(branch));
}

async function saveBranch(existing){
  if(!canAdmin()) return;

  const branchId = (existing?.branchId || existing?.id || $("mBranchId").value).trim();
  const branchName = $("mBranchName").value.trim();
  const parentBranchId = $("mParent").value || "";
  const openTime = $("mOpen").value.trim() || "08:00";
  const closeTime = $("mClose").value.trim() || "24:00";
  const sortOrder = Number($("mSort").value) || 999;
  const active = $("mActive").checked;

  if(!branchId){
    toast("กรุณาระบุ Branch ID", true); return;
  }
  if(!branchName){
    toast("กรุณาระบุชื่อสาขา", true); return;
  }
  if(!/^[A-Za-z0-9_-]+$/.test(branchId)){
    toast("Branch ID ใช้เฉพาะ A-Z, 0-9, _ หรือ -", true); return;
  }

  if(!existing && branches.some(b=>String(b.branchId||b.id).toLowerCase()===branchId.toLowerCase())){
    toast("Branch ID นี้มีอยู่แล้ว", true); return;
  }

  showLoading(true, "กำลังบันทึกสาขา...");
  try{
    const ref = doc(db, "branches", branchId);
    const payload = {
      branchId,
      branchName,
      parentBranchId,
      openTime,
      closeTime,
      sortOrder,
      active,
      updatedAt: serverTimestamp()
    };

    if(!existing) payload.createdAt = serverTimestamp();

    await setDoc(ref, payload, { merge:true });
    closeModal();
    toast(existing ? "แก้ไขสาขาเรียบร้อย":"เพิ่มสาขาเรียบร้อย");
  }catch(err){
    console.error(err);
    toast(err.message || "บันทึกไม่สำเร็จ", true);
  }finally{
    showLoading(false);
  }
}


/* ---------------- USER MASTER ---------------- */

function startUserListener(){
  if(unsubscribeUsers) unsubscribeUsers();

  unsubscribeUsers = onSnapshot(
    collection(db, "users"),
    snap=>{
      users = snap.docs.map(d=>({ uid:d.id, ...d.data() }));
      users.sort((a,b)=>String(a.username||"").localeCompare(String(b.username||"")));
      renderUsers();
    },
    err=>{
      console.error(err);
      toast("โหลดข้อมูล User ไม่สำเร็จ", true);
    }
  );
}

$("userSearch")?.addEventListener("input", renderUsers);
$("userRoleFilter")?.addEventListener("change", renderUsers);
$("userStatusFilter")?.addEventListener("change", renderUsers);
$("addUserBtn")?.addEventListener("click", ()=>openUserModal());

function renderUsers(){
  if(!canAdmin()) return;

  const q = $("userSearch")?.value.trim().toLowerCase() || "";
  const role = $("userRoleFilter")?.value || "all";
  const status = $("userStatusFilter")?.value || "all";

  const filtered = users.filter(u=>{
    const text = `${u.username||""} ${u.name||""}`.toLowerCase();
    const active = u.active !== false;
    const okSearch = !q || text.includes(q);
    const okRole = role==="all" || u.role===role;
    const okStatus = status==="all" ||
      (status==="active" && active) ||
      (status==="inactive" && !active);
    return okSearch && okRole && okStatus;
  });

  $("userEmpty")?.classList.toggle("hidden", filtered.length !== 0);
  $("userTableWrap")?.classList.toggle("hidden", filtered.length === 0);

  if(!$("userRows")) return;

  $("userRows").innerHTML = filtered.map(u=>`
    <tr>
      <td><span class="user-dot" style="background:${escapeAttr(u.color || "#64748b")}"></span></td>
      <td><b>${escapeHtml(u.username || "")}</b></td>
      <td>${escapeHtml(u.name || "")}</td>
      <td><span class="role-pill ${escapeAttr(u.role||"user")}">${escapeHtml(u.role||"user")}</span></td>
      <td>${escapeHtml(branchNameForUser(u.homeBranch))}</td>
      <td><span class="status ${u.active===false ? "inactive":"active"}">${u.active===false ? "Inactive":"Active"}</span></td>
      <td>
        <div class="row-actions">
          <button class="btn ghost" data-user-edit="${escapeAttr(u.uid)}">แก้ไข</button>
        </div>
      </td>
    </tr>
  `).join("");

  document.querySelectorAll("[data-user-edit]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const u = users.find(x=>x.uid===btn.dataset.userEdit);
      if(u) openUserModal(u);
    });
  });
}

function branchNameForUser(branchId){
  if(!branchId) return "-";
  const b = branches.find(x=>x.id===branchId || x.branchId===branchId);
  return b ? `${b.branchId||b.id} · ${b.branchName||""}` : branchId;
}

function openUserModal(user=null){
  if(!canAdmin()){
    toast("เฉพาะ Admin เท่านั้น", true);
    return;
  }

  const editing = !!user;
  const branchOptions = branches
    .filter(b=>b.active!==false)
    .map(b=>`<option value="${escapeAttr(b.id)}" ${user?.homeBranch===b.id ? "selected":""}>${escapeHtml(b.branchId||b.id)} · ${escapeHtml(b.branchName||"")}</option>`)
    .join("");

  $("modalHost").innerHTML = `
    <div class="modal-backdrop" id="userBackdrop">
      <div class="modal">
        <div class="page-head">
          <div>
            <h2>${editing ? "แก้ไข User":"เพิ่ม User"}</h2>
            <div class="muted">${editing ? escapeHtml(user.username||"") : "สร้างบัญชี Firebase Authentication + Firestore Profile"}</div>
          </div>
        </div>

        <div class="modal-grid">
          <div>
            <label>Username</label>
            <input id="mUsername" value="${escapeAttr(user?.username||"")}" ${editing ? "disabled":""} placeholder="เช่น oil">
          </div>

          <div>
            <label>ชื่อที่แสดง</label>
            <input id="mUserName" value="${escapeAttr(user?.name||"")}" placeholder="เช่น Oil">
          </div>

          ${editing ? "" : `
          <div>
            <label>Password เริ่มต้น</label>
            <input id="mPassword" type="password" placeholder="อย่างน้อย 6 ตัวอักษร">
            <div class="password-note">ใช้สำหรับ Login ครั้งแรก</div>
          </div>`}

          <div>
            <label>Role</label>
            <select id="mRole">
              <option value="user" ${user?.role==="user" ? "selected":""}>user</option>
              <option value="manager" ${user?.role==="manager" ? "selected":""}>manager</option>
              <option value="admin" ${user?.role==="admin" ? "selected":""}>admin</option>
            </select>
          </div>

          <div>
            <label>สาขาประจำ</label>
            <select id="mHomeBranch">
              <option value="">— ไม่ระบุ —</option>
              ${branchOptions}
            </select>
          </div>

          <div>
            <label>สีประจำ User</label>
            <div class="color-line">
              <input id="mColor" type="color" value="${escapeAttr(user?.color || nextUserColor())}">
              <span class="muted">ใช้ในตารางเวร</span>
            </div>
          </div>
        </div>

        <label class="checkbox-row">
          <input id="mUserActive" type="checkbox" ${user?.active===false ? "" : "checked"}>
          Active / อนุญาตให้ใช้งานระบบ
        </label>

        <div class="actions">
          <button id="cancelUser" class="btn ghost">ยกเลิก</button>
          <button id="saveUser" class="btn primary">${editing ? "บันทึกการแก้ไข":"สร้าง User"}</button>
        </div>
      </div>
    </div>
  `;

  $("cancelUser").addEventListener("click", closeModal);
  $("userBackdrop").addEventListener("click", e=>{ if(e.target.id==="userBackdrop") closeModal(); });
  $("saveUser").addEventListener("click", ()=>saveUser(user));
}

function nextUserColor(){
  const palette = [
    "#2563eb","#dc2626","#16a34a","#9333ea","#ea580c","#0891b2",
    "#db2777","#4f46e5","#65a30d","#b45309","#0f766e","#7c3aed"
  ];
  return palette[users.length % palette.length];
}

async function saveUser(existing){
  if(!canAdmin()) return;

  const username = (existing?.username || $("mUsername")?.value || "").trim().toLowerCase();
  const name = $("mUserName")?.value.trim() || "";
  const role = $("mRole")?.value || "user";
  const homeBranch = $("mHomeBranch")?.value || "";
  const color = $("mColor")?.value || "#64748b";
  const active = $("mUserActive")?.checked === true;

  if(!username){
    toast("กรุณาระบุ Username", true); return;
  }
  if(!/^[a-z0-9._-]+$/.test(username)){
    toast("Username ใช้ a-z, 0-9, จุด, _ หรือ - เท่านั้น", true); return;
  }
  if(!name){
    toast("กรุณาระบุชื่อที่แสดง", true); return;
  }
  if(!["admin","manager","user"].includes(role)){
    toast("Role ไม่ถูกต้อง", true); return;
  }

  // Prevent accidentally disabling the currently logged-in admin.
  if(existing?.uid === currentUser?.uid && !active){
    toast("ไม่สามารถปิด Active บัญชีที่กำลัง Login อยู่", true); return;
  }

  if(existing){
    showLoading(true, "กำลังบันทึก User...");
    try{
      await setDoc(doc(db, "users", existing.uid), {
        username,
        name,
        role,
        homeBranch,
        color,
        active,
        updatedAt: serverTimestamp()
      }, { merge:true });

      closeModal();
      toast("แก้ไข User เรียบร้อย");
    }catch(err){
      console.error(err);
      toast(err.message || "บันทึก User ไม่สำเร็จ", true);
    }finally{
      showLoading(false);
    }
    return;
  }

  const password = $("mPassword")?.value || "";
  if(password.length < 6){
    toast("Password อย่างน้อย 6 ตัวอักษร", true); return;
  }
  if(users.some(u=>String(u.username||"").toLowerCase()===username)){
    toast("Username นี้มีอยู่แล้ว", true); return;
  }

  showLoading(true, "กำลังสร้างบัญชี User...");
  let secondaryApp = null;
  let createdAuthUser = null;

  try{
    // Secondary Firebase app keeps the Admin signed in on the primary app.
    secondaryApp = initializeApp(firebaseConfig, `user-create-${Date.now()}`);
    const secondaryAuth = getAuth(secondaryApp);

    const cred = await createUserWithEmailAndPassword(
      secondaryAuth,
      internalEmail(username),
      password
    );

    createdAuthUser = cred.user;

    try{
      await setDoc(doc(db, "users", createdAuthUser.uid), {
        username,
        name,
        role,
        homeBranch,
        color,
        active,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }catch(profileErr){
      // Avoid orphan Auth account when Firestore profile creation fails.
      try{ await deleteUser(createdAuthUser); }catch(cleanErr){ console.error("cleanup auth user failed", cleanErr); }
      throw profileErr;
    }

    await signOut(secondaryAuth);
    closeModal();
    toast(`สร้าง User ${username} เรียบร้อย`);
  }catch(err){
    console.error(err);
    let msg = err.message || "สร้าง User ไม่สำเร็จ";
    if(err.code==="auth/email-already-in-use") msg = "Username นี้มีบัญชี Authentication อยู่แล้ว";
    if(err.code==="auth/weak-password") msg = "Password ต้องอย่างน้อย 6 ตัวอักษร";
    toast(msg, true);
  }finally{
    if(secondaryApp){
      try{ await deleteApp(secondaryApp); }catch(e){}
    }
    showLoading(false);
  }
}

function closeModal(){
  $("modalHost").innerHTML = "";
}

function escapeHtml(value){
  return String(value ?? "").replace(/[&<>"']/g, c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function escapeAttr(value){
  return escapeHtml(value);
}
