import { auth, db, firebaseConfig } from "./firebase.js?v=7.0.0";

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
  serverTimestamp,
  query,
  where,
  runTransaction,
  writeBatch
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
let unsubscribeRequests = null;
let unsubscribeRequestRules = null;
let requests = [];
let requestRules = { dayLimit:null, userMonthMax:null };
let currentRequestMonth = "";

let unsubscribeMySchedule = null;
let unsubscribeManageSchedule = null;
let unsubscribeManageRequests = null;
let mySchedules = [];
let manageScheduleBase = [];
let manageScheduleRequests = [];
let scheduleDrafts = new Map();
let scheduleDeletes = new Set();
let manageScheduleMonthValue = "";

let unsubscribeMyChangeRequests = null;
let unsubscribePendingChangeRequests = null;
let myChangeRequests = [];
let pendingChangeRequests = [];
let lastScheduleValidation = { errors:[], warnings:[], shiftFlags:new Map(), cellFlags:new Map() };

let currentView = "dashboard";

const REQUIRED_V21 = [
  "loading","loadingText","toast","loginView","appView","topUser","roleBadge",
  "dashName","dashUsername","dashRole","branchNav","branchSearch","branchStatus",
  "branchRows","branchTableWrap","branchEmpty","userRows","userTableWrap","userEmpty","requestCalendar","requestMonth","myScheduleList","myScheduleMonth","manageScheduleMonth","scheduleMatrixHost","modalHost"
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
  if(currentView==="manageSchedule" && view!=="manageSchedule" && hasScheduleDirty()){
    if(!confirm(`มีการแก้ไขตารางเวร ${scheduleDirtyCount()} รายการที่ยังไม่ได้บันทึก\n\nหากออกจากหน้านี้ การแก้ไขจะหายไป\nต้องการออกโดยไม่บันทึกหรือไม่?`)){
      return;
    }
    clearScheduleDrafts();
  }

  currentView = view;
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active", b.dataset.view===view));

  if(view==="dashboard") showOnly("dashboardView");
  if(view==="requests"){
    showOnly("requestsView");
    ensureRequestMonth();
  }
  if(view==="mySchedule"){
    showOnly("myScheduleView");
    ensureMyScheduleMonth();
  }
  if(view==="manageSchedule"){
    showOnly("manageScheduleView");
    ensureManageScheduleMonth();
  }
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
    if(unsubscribeRequests){ unsubscribeRequests(); unsubscribeRequests=null; }
    if(unsubscribeRequestRules){ unsubscribeRequestRules(); unsubscribeRequestRules=null; }
    if(unsubscribeMySchedule){ unsubscribeMySchedule(); unsubscribeMySchedule=null; }
    if(unsubscribeManageSchedule){ unsubscribeManageSchedule(); unsubscribeManageSchedule=null; }
    if(unsubscribeManageRequests){ unsubscribeManageRequests(); unsubscribeManageRequests=null; }
    if(unsubscribeMyChangeRequests){ unsubscribeMyChangeRequests(); unsubscribeMyChangeRequests=null; }
    if(unsubscribePendingChangeRequests){ unsubscribePendingChangeRequests(); unsubscribePendingChangeRequests=null; }
    myChangeRequests = [];
    pendingChangeRequests = [];
    clearScheduleDrafts();
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

    const canManageRequests = ["admin","manager"].includes(profile.role);
    $("requestRuleBtn")?.classList.toggle("hidden", !canManageRequests);
    $("manageScheduleNav")?.classList.toggle("hidden", !canManageRequests);

    setNav("dashboard");
    if(isAdmin){
      startBranchListener();
      startUserListener();
    }

    startMyChangeRequestListener();
    if(canManageRequests) startPendingChangeRequestListener();

  }catch(err){
    console.error(err);
    await signOut(auth);
    $("loginError").textContent = err.message || "ไม่สามารถโหลดข้อมูลผู้ใช้ได้";
  }finally{
    showLoading(false);
  }
});


/* ---------------- REQUEST SYSTEM ---------------- */

function bangkokYearMonth(){
  return new Date().toLocaleDateString("en-CA", { timeZone:"Asia/Bangkok" }).slice(0,7);
}

function ensureRequestMonth(){
  const monthInput = $("requestMonth");
  if(!monthInput) return;

  if(!monthInput.value) monthInput.value = currentRequestMonth || bangkokYearMonth();
  const ym = monthInput.value;

  if(currentRequestMonth !== ym || !unsubscribeRequests){
    startRequestMonth(ym);
  }else{
    renderRequestCalendar();
  }
}

$("requestMonth")?.addEventListener("change", ()=>{
  const ym = $("requestMonth").value;
  if(ym) startRequestMonth(ym);
});

$("requestRuleBtn")?.addEventListener("click", openRequestRulesModal);

function startRequestMonth(ym){
  currentRequestMonth = ym;

  if(unsubscribeRequests){ unsubscribeRequests(); unsubscribeRequests=null; }
  if(unsubscribeRequestRules){ unsubscribeRequestRules(); unsubscribeRequestRules=null; }

  requests = [];
  requestRules = { dayLimit:null, userMonthMax:null };
  renderRequestCalendar();

  const q = query(
    collection(db, "requests"),
    where("yearMonth", "==", ym)
  );

  unsubscribeRequests = onSnapshot(
    q,
    snap=>{
      requests = snap.docs
        .map(d=>({ id:d.id, ...d.data() }))
        .filter(r=>r.status==="active")
        .sort((a,b)=>
          String(a.date||"").localeCompare(String(b.date||"")) ||
          (Number(a.queueNo)||0)-(Number(b.queueNo)||0)
        );
      renderRequestCalendar();
    },
    err=>{
      console.error(err);
      toast("โหลด Request ไม่สำเร็จ", true);
    }
  );

  const rulesRef = doc(db, "settings", `requestRules_${ym}`);
  unsubscribeRequestRules = onSnapshot(
    rulesRef,
    snap=>{
      if(snap.exists()){
        const d = snap.data();
        requestRules = {
          dayLimit: numberOrNull(d.dayLimit),
          userMonthMax: numberOrNull(d.userMonthMax)
        };
      }else{
        requestRules = { dayLimit:null, userMonthMax:null };
      }
      renderRequestCalendar();
    },
    err=>{
      console.error(err);
      toast("โหลด Request Limit ไม่สำเร็จ", true);
    }
  );
}

function numberOrNull(v){
  if(v===null || v===undefined || v==="") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function monthDates(ym){
  if(!/^\d{4}-\d{2}$/.test(ym)) return [];
  const [y,m] = ym.split("-").map(Number);
  const days = new Date(y,m,0).getDate();
  return Array.from({length:days},(_,i)=>`${ym}-${String(i+1).padStart(2,"0")}`);
}

function formatRequestTime(ts){
  if(!ts) return "";
  try{
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"});
  }catch(e){ return ""; }
}

function myMonthlyUsage(){
  return new Set(
    requests
      .filter(r=>r.userId===currentUser?.uid && r.status==="active")
      .map(r=>r.date)
  ).size;
}

function renderRequestCalendar(){
  const host = $("requestCalendar");
  if(!host || !currentProfile) return;

  const ym = $("requestMonth")?.value || currentRequestMonth || bangkokYearMonth();
  const dates = monthDates(ym);
  const firstDay = dates.length ? new Date(`${dates[0]}T12:00:00`).getDay() : 0;

  setText("dayLimitBadge", `Limit/วัน: ${requestRules.dayLimit===null ? "ไม่จำกัด" : requestRules.dayLimit}`);
  setText("userMaxBadge", `สิทธิ์/คน/เดือน: ${requestRules.userMonthMax===null ? "ไม่จำกัด" : requestRules.userMonthMax}`);
  setText("myUsageBadge", `ใช้แล้ว: ${myMonthlyUsage()} วัน`);

  const byDate = {};
  requests.forEach(r=>(byDate[r.date] ??= []).push(r));

  const cells = [];
  for(let i=0;i<firstDay;i++) cells.push(`<div class="request-day out"></div>`);

  for(const date of dates){
    const list = (byDate[date] || []).slice().sort((a,b)=>(Number(a.queueNo)||0)-(Number(b.queueNo)||0));
    const dayLimit = requestRules.dayLimit;
    const full = dayLimit !== null && list.length >= dayLimit;
    const mine = list.find(r=>r.userId===currentUser.uid);
    const maxUsed = requestRules.userMonthMax !== null && myMonthlyUsage() >= requestRules.userMonthMax;
    const canAdd = !full && !mine && !maxUsed;
    const canManage = ["admin","manager"].includes(currentProfile.role);
    const dayNo = Number(date.slice(-2));

    cells.push(`
      <div class="request-day">
        <div class="request-date">
          <span>${dayNo}</span>
          <span class="request-count ${full ? "full":""}">
            ${dayLimit===null ? list.length : `${list.length}/${dayLimit}`}
          </span>
        </div>

        ${list.map(r=>`
          <div class="req-card ${r.userId===currentUser.uid ? "mine":""}">
            <div class="req-top">
              <span class="req-queue">คิว ${escapeHtml(r.queueNo)} · ${escapeHtml(r.userName||"")}</span>
              ${(r.userId===currentUser.uid || canManage) ? `<button class="req-delete" data-request-delete="${escapeAttr(r.id)}" title="ลบ Request">×</button>`:""}
            </div>
            <div>${escapeHtml(r.requestText||"")}</div>
            <div class="req-time">${escapeHtml(formatRequestTime(r.createdAt))}</div>
          </div>
        `).join("")}

        <button class="req-add" data-request-add="${date}" ${canAdd ? "" : "disabled"}>
          ${mine ? "มี Request แล้ว" : full ? "เต็มแล้ว" : maxUsed ? "ใช้สิทธิ์ครบแล้ว" : "+ ขอรีเควส"}
        </button>
      </div>
    `);
  }

  host.innerHTML = `
    ${["อา","จ","อ","พ","พฤ","ศ","ส"].map(x=>`<div class="request-dow">${x}</div>`).join("")}
    ${cells.join("")}
  `;

  host.querySelectorAll("[data-request-add]").forEach(btn=>{
    btn.addEventListener("click", ()=>openRequestModal(btn.dataset.requestAdd));
  });

  host.querySelectorAll("[data-request-delete]").forEach(btn=>{
    btn.addEventListener("click", ()=>deleteRequestById(btn.dataset.requestDelete));
  });
}

function openRequestModal(date){
  if(!currentUser || !currentProfile) return;

  $("modalHost").innerHTML = `
    <div class="modal-backdrop" id="requestBackdrop">
      <div class="modal">
        <div class="page-head">
          <div>
            <h2>ขอ Request</h2>
            <div class="muted">${escapeHtml(date)}</div>
          </div>
        </div>

        <label>รายละเอียด</label>
        <div class="preset-row">
          <button type="button" class="preset" data-preset="ขอหยุด">ขอหยุด</button>
          <button type="button" class="preset" data-preset="ขอเข้าเช้า">ขอเข้าเช้า</button>
          <button type="button" class="preset" data-preset="ขอเข้าบ่าย">ขอเข้าบ่าย</button>
          <button type="button" class="preset" data-preset="ขอเข้า AD">ขอเข้า AD</button>
        </div>

        <input id="mRequestText" placeholder="เช่น ขอหยุด / ขอเข้าเช้า / ขอเข้าบ่าย">

        <div id="requestResult"></div>

        <div class="actions">
          <button id="cancelRequest" class="btn ghost">ยกเลิก</button>
          <button id="saveRequest" class="btn primary">ส่ง Request</button>
        </div>
      </div>
    </div>
  `;

  $("cancelRequest").addEventListener("click", closeModal);
  $("requestBackdrop").addEventListener("click", e=>{ if(e.target.id==="requestBackdrop") closeModal(); });
  document.querySelectorAll("[data-preset]").forEach(btn=>{
    btn.addEventListener("click", ()=>$("mRequestText").value=btn.dataset.preset);
  });
  $("saveRequest").addEventListener("click", ()=>submitRequestTransaction(date));
  $("mRequestText")?.focus();
}

async function submitRequestTransaction(date){
  const text = $("mRequestText")?.value.trim() || "";
  if(!text){
    toast("กรุณาระบุรายละเอียด Request", true);
    return;
  }

  const ym = date.slice(0,7);
  const requestId = `${date}__${currentUser.uid}`;
  const requestRef = doc(db, "requests", requestId);
  const dayRef = doc(db, "requestDays", date);
  const usageRef = doc(db, "requestUsage", `${ym}__${currentUser.uid}`);
  const rulesRef = doc(db, "settings", `requestRules_${ym}`);

  showLoading(true, "กำลังจัดลำดับคิว...");

  try{
    const queueNo = await runTransaction(db, async tx=>{
      const requestSnap = await tx.get(requestRef);
      const daySnap = await tx.get(dayRef);
      const usageSnap = await tx.get(usageRef);
      const ruleSnap = await tx.get(rulesRef);

      if(requestSnap.exists() && requestSnap.data().status==="active"){
        throw new Error("คุณมี Request ในวันนี้แล้ว");
      }

      const ruleData = ruleSnap.exists() ? ruleSnap.data() : {};
      const dayLimit = numberOrNull(ruleData.dayLimit);
      const userMonthMax = numberOrNull(ruleData.userMonthMax);

      const dayData = daySnap.exists() ? daySnap.data() : {};
      const usageData = usageSnap.exists() ? usageSnap.data() : {};

      const activeCount = Number(dayData.activeCount)||0;
      const nextQueue = Number(dayData.nextQueue)||0;
      const userActiveCount = Number(usageData.activeCount)||0;

      if(dayLimit !== null && activeCount >= dayLimit){
        throw new Error(`วันที่ ${date} Request เต็มแล้ว (${dayLimit} คน)`);
      }

      if(userMonthMax !== null && userActiveCount >= userMonthMax){
        throw new Error(`คุณใช้สิทธิ์ Request ครบ ${userMonthMax} วันในเดือนนี้แล้ว`);
      }

      const queue = nextQueue + 1;

      tx.set(requestRef, {
        yearMonth: ym,
        date,
        userId: currentUser.uid,
        userName: currentProfile.name || currentProfile.username,
        requestText: text,
        queueNo: queue,
        status: "active",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      tx.set(dayRef, {
        date,
        activeCount: activeCount + 1,
        nextQueue: queue,
        updatedAt: serverTimestamp()
      }, { merge:true });

      tx.set(usageRef, {
        yearMonth: ym,
        userId: currentUser.uid,
        activeCount: userActiveCount + 1,
        updatedAt: serverTimestamp()
      }, { merge:true });

      return queue;
    });

    const result = $("requestResult");
    if(result){
      result.innerHTML = `<div class="request-queue-success">ส่ง Request สำเร็จ — คุณได้คิวที่ <b>${queueNo}</b></div>`;
    }
    toast(`ส่ง Request แล้ว — คิวที่ ${queueNo}`);
    setTimeout(closeModal, 650);

  }catch(err){
    console.error(err);
    toast(err.message || "ส่ง Request ไม่สำเร็จ", true);
  }finally{
    showLoading(false);
  }
}

async function deleteRequestById(requestId){
  const r = requests.find(x=>x.id===requestId);
  if(!r) return;

  const canManage = ["admin","manager"].includes(currentProfile.role);
  if(r.userId!==currentUser.uid && !canManage){
    toast("ไม่มีสิทธิ์ลบ Request นี้", true);
    return;
  }

  if(!confirm(`ลบ Request คิว ${r.queueNo} ของ ${r.userName}?`)) return;

  const requestRef = doc(db, "requests", requestId);
  const dayRef = doc(db, "requestDays", r.date);
  const usageRef = doc(db, "requestUsage", `${r.yearMonth}__${r.userId}`);

  showLoading(true, "กำลังลบ Request...");

  try{
    await runTransaction(db, async tx=>{
      const reqSnap = await tx.get(requestRef);
      const daySnap = await tx.get(dayRef);
      const usageSnap = await tx.get(usageRef);

      if(!reqSnap.exists() || reqSnap.data().status!=="active") return;

      const dayData = daySnap.exists() ? daySnap.data() : {};
      const usageData = usageSnap.exists() ? usageSnap.data() : {};

      tx.set(requestRef, {
        status:"deleted",
        deletedAt:serverTimestamp(),
        updatedAt:serverTimestamp()
      }, { merge:true });

      tx.set(dayRef, {
        activeCount: Math.max(0,(Number(dayData.activeCount)||0)-1),
        nextQueue: Number(dayData.nextQueue)||Number(r.queueNo)||0,
        updatedAt:serverTimestamp()
      }, { merge:true });

      tx.set(usageRef, {
        activeCount: Math.max(0,(Number(usageData.activeCount)||0)-1),
        updatedAt:serverTimestamp()
      }, { merge:true });
    });

    toast("ลบ Request แล้ว");
  }catch(err){
    console.error(err);
    toast(err.message || "ลบ Request ไม่สำเร็จ", true);
  }finally{
    showLoading(false);
  }
}

function openRequestRulesModal(){
  if(!["admin","manager"].includes(currentProfile?.role)){
    toast("เฉพาะ Admin / Manager เท่านั้น", true);
    return;
  }

  const ym = $("requestMonth")?.value || currentRequestMonth || bangkokYearMonth();

  $("modalHost").innerHTML = `
    <div class="modal-backdrop" id="requestRuleBackdrop">
      <div class="modal">
        <div class="page-head">
          <div>
            <h2>Request Limit</h2>
            <div class="muted">${escapeHtml(ym)}</div>
          </div>
        </div>

        <div class="modal-grid">
          <div>
            <label>จำนวน Request สูงสุดต่อวัน</label>
            <input id="mDayLimit" type="number" min="0" value="${requestRules.dayLimit ?? ""}" placeholder="ว่าง = ไม่จำกัด">
          </div>

          <div>
            <label>จำนวนวันสูงสุดต่อ User / เดือน</label>
            <input id="mUserMax" type="number" min="0" value="${requestRules.userMonthMax ?? ""}" placeholder="ว่าง = ไม่จำกัด">
          </div>
        </div>

        <div class="password-note">เว้นว่าง = ไม่จำกัด</div>

        <div class="actions">
          <button id="cancelRequestRule" class="btn ghost">ยกเลิก</button>
          <button id="saveRequestRule" class="btn primary">บันทึก</button>
        </div>
      </div>
    </div>
  `;

  $("cancelRequestRule").addEventListener("click", closeModal);
  $("requestRuleBackdrop").addEventListener("click", e=>{ if(e.target.id==="requestRuleBackdrop") closeModal(); });
  $("saveRequestRule").addEventListener("click", saveRequestRules);
}

async function saveRequestRules(){
  if(!["admin","manager"].includes(currentProfile?.role)) return;

  const ym = $("requestMonth")?.value || currentRequestMonth;
  const rawDay = $("mDayLimit")?.value ?? "";
  const rawUser = $("mUserMax")?.value ?? "";

  const dayLimit = rawDay==="" ? null : Number(rawDay);
  const userMonthMax = rawUser==="" ? null : Number(rawUser);

  if(dayLimit !== null && (!Number.isInteger(dayLimit) || dayLimit < 0)){
    toast("Limit/วัน ไม่ถูกต้อง", true); return;
  }
  if(userMonthMax !== null && (!Number.isInteger(userMonthMax) || userMonthMax < 0)){
    toast("สิทธิ์/คน/เดือน ไม่ถูกต้อง", true); return;
  }

  showLoading(true, "กำลังบันทึก Request Limit...");
  try{
    await setDoc(doc(db, "settings", `requestRules_${ym}`), {
      yearMonth: ym,
      dayLimit,
      userMonthMax,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser.uid
    }, { merge:true });

    closeModal();
    toast("บันทึก Request Limit แล้ว");
  }catch(err){
    console.error(err);
    toast(err.message || "บันทึกไม่สำเร็จ", true);
  }finally{
    showLoading(false);
  }
}



/* ---------------- SCHEDULE SYSTEM ---------------- */

function canManageSchedule(){
  return ["admin","manager"].includes(currentProfile?.role);
}

function scheduleDirtyCount(){
  return scheduleDrafts.size + scheduleDeletes.size;
}

function hasScheduleDirty(){
  return scheduleDirtyCount() > 0;
}

function clearScheduleDrafts(){
  scheduleDrafts.clear();
  scheduleDeletes.clear();
  updateScheduleSaveState();
}

window.addEventListener("beforeunload", e=>{
  if(hasScheduleDirty()){
    e.preventDefault();
    e.returnValue = "";
  }
});

function userColor(userId){
  const u = users.find(x=>x.uid===userId);
  if(u?.color) return u.color;

  const palette = ["#2563eb","#dc2626","#16a34a","#9333ea","#ea580c","#0891b2","#db2777","#4f46e5","#65a30d","#b45309","#0f766e","#7c3aed"];
  let h=0;
  for(const c of String(userId||"")) h=((h<<5)-h)+c.charCodeAt(0);
  return palette[Math.abs(h)%palette.length];
}

function activeBranches(){
  return branches.filter(b=>b.active!==false)
    .sort((a,b)=>(Number(a.sortOrder)||9999)-(Number(b.sortOrder)||9999));
}

function activeScheduleUsers(){
  return users.filter(u=>u.active!==false)
    .sort((a,b)=>String(a.name||a.username||"").localeCompare(String(b.name||b.username||"")));
}

function scheduleBranchName(branchId){
  const b = branches.find(x=>x.id===branchId || x.branchId===branchId);
  return b ? (b.branchName || b.branchId || b.id) : (branchId || "-");
}

function scheduleHours(start,end){
  if(!start || !end) return 0;

  const cv = value=>{
    const [h,m] = String(value).split(":").map(Number);
    return (h||0) + (m||0)/60;
  };

  return Math.max(0, cv(end)-cv(start));
}

function scheduleDateLabel(date){
  try{
    return new Date(`${date}T12:00:00`).toLocaleDateString("th-TH",{
      weekday:"short",day:"numeric",month:"short"
    });
  }catch(e){
    return date;
  }
}

/* ----- MY SCHEDULE ----- */

$("myScheduleMonth")?.addEventListener("change", ()=>startMyScheduleMonth($("myScheduleMonth").value));

function ensureMyScheduleMonth(){
  const el = $("myScheduleMonth");
  if(!el) return;
  if(!el.value) el.value = bangkokYearMonth();
  startMyScheduleMonth(el.value);
}

function startMyScheduleMonth(ym){
  if(!currentUser || !ym) return;
  if(unsubscribeMySchedule){ unsubscribeMySchedule(); unsubscribeMySchedule=null; }

  const q = query(
    collection(db,"schedules"),
    where("yearMonth","==",ym),
    where("userId","==",currentUser.uid)
  );

  unsubscribeMySchedule = onSnapshot(
    q,
    snap=>{
      mySchedules = snap.docs
        .map(d=>({id:d.id,...d.data()}))
        .filter(s=>s.deleted!==true)
        .sort((a,b)=>String(a.date||"").localeCompare(String(b.date||"")) || String(a.startTime||"").localeCompare(String(b.startTime||"")));
      renderMySchedule();
    },
    err=>{
      console.error(err);
      toast("โหลดตารางเวรไม่สำเร็จ",true);
    }
  );
}

function renderMySchedule(){
  const host = $("myScheduleList");
  if(!host) return;

  const hours = mySchedules.reduce((sum,s)=>sum+(s.isOff?0:scheduleHours(s.startTime,s.endTime)),0);
  const day = mySchedules.filter(s=>!s.isOff && s.startTime==="08:00" && s.endTime==="16:00").length;
  const evening = mySchedules.filter(s=>!s.isOff && s.startTime==="16:00" && s.endTime==="24:00").length;
  const ad = mySchedules.filter(s=>!s.isOff && s.startTime==="09:00" && s.endTime==="24:00").length;
  const off = mySchedules.filter(s=>s.isOff).length;

  $("myScheduleSummary").innerHTML = `
    <span class="info-pill">รวม ${hours} ชม.</span>
    <span class="info-pill">เช้า ${day}</span>
    <span class="info-pill">บ่าย ${evening}</span>
    <span class="info-pill">AD ${ad}</span>
    <span class="info-pill">OFF ${off}</span>
  `;

  if(!mySchedules.length){
    host.innerHTML = `<div class="schedule-empty">ยังไม่มีตารางเวรในเดือนนี้</div>`;
    return;
  }

  host.innerHTML = mySchedules.map(s=>{
    const req = latestChangeForSchedule(s.id);
    const pending = req?.status==="pending";

    return `
      <div class="my-shift" style="--u:${userColor(s.userId)}">
        <div class="my-shift-date">${escapeHtml(scheduleDateLabel(s.date))}</div>
        <div class="my-shift-main">
          <div class="my-shift-time">${s.isOff ? "OFF" : `${escapeHtml(s.startTime)}-${escapeHtml(s.endTime)}`}</div>
          <div>${escapeHtml(scheduleBranchName(s.branchId))}</div>
          ${s.note ? `<div class="my-shift-note">${escapeHtml(s.note)}</div>` : ""}
          ${req ? `<div style="margin-top:5px"><span class="change-pill ${escapeAttr(req.status)}">${changeStatusLabel(req.status)}</span></div>` : ""}
        </div>
        <button class="change-btn" data-my-change="${escapeAttr(s.id)}" ${pending ? "disabled":""}>
          ${pending ? "รออนุมัติ":"ขอแก้เวร"}
        </button>
      </div>
    `;
  }).join("");

  host.querySelectorAll("[data-my-change]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const s = mySchedules.find(x=>x.id===btn.dataset.myChange);
      if(s) openChangeRequestModal(s);
    });
  });
}

/* ----- MANAGER MATRIX ----- */

$("manageScheduleMonth")?.addEventListener("change", e=>{
  const next = e.target.value;
  if(hasScheduleDirty()){
    if(!confirm(`มี ${scheduleDirtyCount()} รายการที่ยังไม่ได้บันทึก\\nเปลี่ยนเดือนโดยทิ้งรายการเหล่านี้หรือไม่?`)){
      e.target.value = manageScheduleMonthValue;
      return;
    }
    clearScheduleDrafts();
  }
  startManageScheduleMonth(next);
});

$("saveScheduleAllBtn")?.addEventListener("click", saveAllSchedules);

function ensureManageScheduleMonth(){
  if(!canManageSchedule()) return;

  const el = $("manageScheduleMonth");
  if(!el) return;
  if(!el.value) el.value = manageScheduleMonthValue || bangkokYearMonth();

  if(manageScheduleMonthValue!==el.value || !unsubscribeManageSchedule){
    startManageScheduleMonth(el.value);
  }else{
    renderScheduleMatrix();
  }
}

function startManageScheduleMonth(ym){
  if(!canManageSchedule() || !ym) return;

  manageScheduleMonthValue = ym;

  if(unsubscribeManageSchedule){ unsubscribeManageSchedule(); unsubscribeManageSchedule=null; }
  if(unsubscribeManageRequests){ unsubscribeManageRequests(); unsubscribeManageRequests=null; }

  manageScheduleBase = [];
  manageScheduleRequests = [];
  clearScheduleDrafts();

  const sq = query(collection(db,"schedules"),where("yearMonth","==",ym));
  unsubscribeManageSchedule = onSnapshot(
    sq,
    snap=>{
      manageScheduleBase = snap.docs
        .map(d=>({id:d.id,...d.data()}))
        .filter(s=>s.deleted!==true);
      renderScheduleMatrix();
      renderScheduleSummary();
    },
    err=>{
      console.error(err);
      toast("โหลดตารางเวรสำหรับจัดตารางไม่สำเร็จ",true);
    }
  );

  const rq = query(collection(db,"requests"),where("yearMonth","==",ym));
  unsubscribeManageRequests = onSnapshot(
    rq,
    snap=>{
      manageScheduleRequests = snap.docs
        .map(d=>({id:d.id,...d.data()}))
        .filter(r=>r.status==="active")
        .sort((a,b)=>String(a.date||"").localeCompare(String(b.date||"")) || (Number(a.queueNo)||0)-(Number(b.queueNo)||0));
      renderScheduleMatrix();
    },
    err=>{
      console.error(err);
      toast("โหลด Request สำหรับหน้าจัดเวรไม่สำเร็จ",true);
    }
  );

  renderScheduleLegend();
  renderScheduleMatrix();
  renderScheduleSummary();
}

function mergedSchedules(){
  const map = new Map(manageScheduleBase.map(s=>[s.id,{...s}]));

  for(const [id,draft] of scheduleDrafts.entries()){
    map.set(id,{...draft});
  }

  for(const id of scheduleDeletes){
    map.delete(id);
  }

  return [...map.values()].filter(s=>s.deleted!==true);
}

function renderScheduleLegend(){
  const host = $("scheduleUserLegend");
  if(!host) return;

  host.innerHTML = activeScheduleUsers().map(u=>`
    <span class="schedule-legend-item" style="--u:${escapeAttr(userColor(u.uid))}">
      ${escapeHtml(u.name||u.username)}
    </span>
  `).join("");
}

function coveragePercent(date,branchId,schedules){
  const list = schedules.filter(s=>s.date===date && s.branchId===branchId && !s.isOff);
  let covered=0;

  for(let h=8;h<24;h++){
    const ok = list.some(s=>{
      const sh = Number(String(s.startTime||"0:00").split(":")[0]);
      const eh = Number(String(s.endTime||"0:00").split(":")[0]);
      return sh<=h && eh>h;
    });
    if(ok) covered++;
  }

  return Math.round((covered/16)*100);
}

function renderScheduleMatrix(){
  const host = $("scheduleMatrixHost");
  if(!host || !canManageSchedule()) return;

  renderScheduleLegend();

  const ym = $("manageScheduleMonth")?.value || manageScheduleMonthValue || bangkokYearMonth();
  const dates = monthDates(ym);
  const bList = activeBranches();
  const schedules = mergedSchedules();
  lastScheduleValidation=validateSchedule(schedules);
  renderScheduleValidationPanel();
  renderValidationCount();

  const reqByDate = {};
  manageScheduleRequests.forEach(r=>(reqByDate[r.date] ??= []).push(r));

  const head = `
    <thead>
      <tr>
        <th class="date-col">วันที่</th>
        ${bList.map(b=>`
          <th class="schedule-branch-head">
            ${escapeHtml(b.branchName||b.branchId||b.id)}
            <small>${escapeHtml(b.branchId||b.id)}</small>
          </th>
        `).join("")}
        <th class="schedule-request-col">REQUEST</th>
      </tr>
    </thead>
  `;

  const body = dates.map(date=>{
    const weekday = new Date(`${date}T12:00:00`).toLocaleDateString("th-TH",{weekday:"short"});
    return `
      <tr>
        <td class="date-col">${Number(date.slice(-2))}<br><span class="muted">${escapeHtml(weekday)}</span></td>

        ${bList.map(b=>{
          const cell = schedules
            .filter(s=>s.date===date && s.branchId===b.id)
            .sort((a,b)=>String(a.startTime||"").localeCompare(String(b.startTime||"")));
          const coverage = coveragePercent(date,b.id,schedules);

          const cellFlag=lastScheduleValidation.cellFlags.get(`${date}__${b.id}`);
          const coverageClass=coverage<50 ? "coverage-bad" : coverage<100 ? "coverage-mid" : "";

          return `
            <td class="${cellFlag?.severity==="error" ? "schedule-cell-error" : cellFlag?.severity==="warn" ? "schedule-cell-warning" : ""}" title="${escapeAttr((cellFlag?.messages||[]).join(" | "))}">
              ${cell.map(s=>`
                <div
                  class="schedule-shift ${s.isOff ? "off":""} ${scheduleDrafts.has(s.id) ? "dirty":""} ${lastScheduleValidation.shiftFlags.get(s.id)?.severity==="error" ? "validation-error" : lastScheduleValidation.shiftFlags.get(s.id)?.severity==="warn" ? "validation-warn" : ""}"
                  title="${escapeAttr((lastScheduleValidation.shiftFlags.get(s.id)?.messages||[]).join(" | "))}" style="--u:${escapeAttr(userColor(s.userId))};background:${escapeAttr(userColor(s.userId))}18"
                  data-schedule-edit="${escapeAttr(s.id)}">
                  <b>${escapeHtml(s.userName||"")}</b>
                  ${s.isOff ? "OFF" : `${escapeHtml(s.startTime)}-${escapeHtml(s.endTime)}`}
                </div>
              `).join("")}

              <button class="schedule-add" data-schedule-add-date="${date}" data-schedule-add-branch="${escapeAttr(b.id)}">+ เพิ่มเวร</button>
              <div class="schedule-coverage ${coverageClass}" title="Coverage ${coverage}%"><i style="width:${coverage}%"></i></div>
            </td>
          `;
        }).join("")}

        <td class="schedule-request-col">
          ${(reqByDate[date]||[]).map(r=>`
            <div class="schedule-request">
              <b>คิว ${escapeHtml(r.queueNo)} · ${escapeHtml(r.userName||"")}</b><br>
              ${escapeHtml(r.requestText||"")}
            </div>
          `).join("")}
        </td>
      </tr>
    `;
  }).join("");

  host.innerHTML = `<div class="schedule-matrix-wrap"><table class="schedule-matrix">${head}<tbody>${body}</tbody></table></div>`;

  host.querySelectorAll("[data-schedule-add-date]").forEach(btn=>{
    btn.addEventListener("click", ()=>openScheduleModal(null,btn.dataset.scheduleAddDate,btn.dataset.scheduleAddBranch));
  });

  host.querySelectorAll("[data-schedule-edit]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const s = mergedSchedules().find(x=>x.id===btn.dataset.scheduleEdit);
      if(s) openScheduleModal(s);
    });
  });

  updateScheduleSaveState();
}

function renderScheduleSummary(){
  const host = $("scheduleSummaryGrid");
  if(!host || !canManageSchedule()) return;

  const schedules = mergedSchedules();
  const ym = $("manageScheduleMonth")?.value || manageScheduleMonthValue;

  host.innerHTML = activeScheduleUsers().map(u=>{
    const list = schedules.filter(s=>s.userId===u.uid && s.yearMonth===ym);

    const hours = list.reduce((sum,s)=>sum+(s.isOff?0:scheduleHours(s.startTime,s.endTime)),0);
    const day = list.filter(s=>!s.isOff && s.startTime==="08:00" && s.endTime==="16:00").length;
    const evening = list.filter(s=>!s.isOff && s.startTime==="16:00" && s.endTime==="24:00").length;
    const ad = list.filter(s=>!s.isOff && s.startTime==="09:00" && s.endTime==="24:00").length;
    const off = list.filter(s=>s.isOff).length;

    return `
      <div class="schedule-stat" style="--u:${escapeAttr(userColor(u.uid))}">
        <b>${escapeHtml(u.name||u.username)}</b>
        <div>${hours} ชม.</div>
        <div class="muted">เช้า ${day} · บ่าย ${evening} · AD ${ad} · OFF ${off}</div>
      </div>
    `;
  }).join("");
}

function openScheduleModal(schedule=null,date="",branchId=""){
  if(!canManageSchedule()) return;

  const editing = !!schedule;
  const scheduleUsers = activeScheduleUsers();
  const bList = activeBranches();

  const userOptions = scheduleUsers.map(u=>`
    <option value="${escapeAttr(u.uid)}" ${schedule?.userId===u.uid ? "selected":""}>
      ${escapeHtml(u.name||u.username)}
    </option>
  `).join("");

  const branchOptions = bList.map(b=>`
    <option value="${escapeAttr(b.id)}" ${(schedule?.branchId||branchId)===b.id ? "selected":""}>
      ${escapeHtml(b.branchName||b.branchId||b.id)}
    </option>
  `).join("");

  $("modalHost").innerHTML = `
    <div class="modal-backdrop" id="scheduleBackdrop">
      <div class="modal">
        <div class="page-head">
          <div>
            <h2>${editing ? "แก้ไขเวร":"เพิ่มเวร"}</h2>
            <div class="muted">${escapeHtml(schedule?.date || date)}</div>
          </div>
        </div>

        <div class="modal-grid">
          <div>
            <label>พนักงาน</label>
            <select id="mScheduleUser">${userOptions}</select>
          </div>

          <div>
            <label>สาขา</label>
            <select id="mScheduleBranch">${branchOptions}</select>
          </div>

          <div>
            <label>เวลาเริ่ม</label>
            <input id="mScheduleStart" type="time" value="${escapeAttr(schedule?.startTime || "08:00")}">
          </div>

          <div>
            <label>เวลาจบ</label>
            <input id="mScheduleEnd" value="${escapeAttr(schedule?.endTime || "16:00")}" placeholder="16:00 หรือ 24:00">
          </div>
        </div>

        <label class="checkbox-row">
          <input id="mScheduleOff" type="checkbox" ${schedule?.isOff ? "checked":""}>
          OFF / วันหยุด
        </label>

        <label>หมายเหตุ</label>
        <input id="mScheduleNote" value="${escapeAttr(schedule?.note || "")}" placeholder="ถ้ามี">

        <div class="actions">
          ${editing ? `<button id="deleteSchedule" class="btn danger">ลบ</button>`:""}
          <button id="cancelSchedule" class="btn ghost">ยกเลิก</button>
          <button id="stageSchedule" class="btn primary">${editing ? "ตกลง":"เพิ่มลงตาราง"}</button>
        </div>
      </div>
    </div>
  `;

  const toggleTimes = ()=>{
    const off = $("mScheduleOff").checked;
    $("mScheduleStart").disabled = off;
    $("mScheduleEnd").disabled = off;
  };
  toggleTimes();

  $("mScheduleOff").addEventListener("change",toggleTimes);
  $("cancelSchedule").addEventListener("click",closeModal);
  $("scheduleBackdrop").addEventListener("click",e=>{if(e.target.id==="scheduleBackdrop") closeModal();});
  $("stageSchedule").addEventListener("click",()=>stageSchedule(schedule,schedule?.date||date));
  $("deleteSchedule")?.addEventListener("click",()=>stageDeleteSchedule(schedule));
}

function stageSchedule(existing,date){
  const userId = $("mScheduleUser")?.value || "";
  const branchId = $("mScheduleBranch")?.value || "";
  const startTime = $("mScheduleStart")?.value || "";
  const endTime = $("mScheduleEnd")?.value.trim() || "";
  const isOff = $("mScheduleOff")?.checked===true;
  const note = $("mScheduleNote")?.value.trim() || "";

  const u = users.find(x=>x.uid===userId);

  if(!userId || !u){
    toast("กรุณาเลือกพนักงาน",true);
    return;
  }
  if(!branchId){
    toast("กรุณาเลือกสาขา",true);
    return;
  }
  if(!isOff && (!startTime || !endTime)){
    toast("กรุณาระบุเวลาเริ่มและเวลาจบ",true);
    return;
  }
  if(!isOff && scheduleHours(startTime,endTime)<=0){
    toast("เวลาจบต้องมากกว่าเวลาเริ่ม",true);
    return;
  }

  let id = existing?.id;
  if(!id){
    id = doc(collection(db,"schedules")).id;
  }

  const draft = {
    id,
    yearMonth: date.slice(0,7),
    date,
    branchId,
    userId,
    userName: u.name || u.username,
    startTime: isOff ? "" : startTime,
    endTime: isOff ? "" : endTime,
    isOff,
    note,
    deleted:false,
    _isNew: existing?._isNew===true || !manageScheduleBase.some(s=>s.id===id)
  };

  scheduleDeletes.delete(id);
  scheduleDrafts.set(id,draft);

  closeModal();
  renderScheduleMatrix();
  renderScheduleSummary();
  updateScheduleSaveState();
}

function stageDeleteSchedule(schedule){
  if(!schedule) return;

  if(!confirm(`ลบเวรของ ${schedule.userName} วันที่ ${schedule.date}?`)) return;

  const existsOnServer = manageScheduleBase.some(s=>s.id===schedule.id);

  if(existsOnServer){
    scheduleDrafts.delete(schedule.id);
    scheduleDeletes.add(schedule.id);
  }else{
    scheduleDrafts.delete(schedule.id);
    scheduleDeletes.delete(schedule.id);
  }

  closeModal();
  renderScheduleMatrix();
  renderScheduleSummary();
  updateScheduleSaveState();
}

function updateScheduleSaveState(){
  const n = scheduleDirtyCount();
  const btn = $("saveScheduleAllBtn");
  const state = $("scheduleSaveState");

  if(btn) btn.disabled = n===0;

  if(state){
    state.textContent = n ? `ยังไม่บันทึก ${n} รายการ` : "บันทึกแล้ว";
    state.classList.toggle("unsaved", n>0);
  }
}

async function saveAllSchedules(){
  if(!canManageSchedule() || !hasScheduleDirty()) return;

  const validation=refreshScheduleValidation();
  const issueCount=validation.errors.length+validation.warnings.length;

  if(issueCount){
    const msg=[
      `พบรายการที่ต้องตรวจสอบ ${issueCount} รายการ`,
      validation.errors.length?`• ปัญหาสำคัญ ${validation.errors.length} รายการ`:"",
      validation.warnings.length?`• คำเตือน ${validation.warnings.length} รายการ`:"",
      "",
      "ต้องการบันทึกต่อแม้มีคำเตือนหรือไม่?"
    ].filter(Boolean).join("\n");

    if(!confirm(msg)) return;
  }

  const count = scheduleDirtyCount();
  showLoading(true,`กำลังบันทึก ${count} รายการ...`);

  try{
    const batch = writeBatch(db);

    for(const [id,s] of scheduleDrafts.entries()){
      const ref = doc(db,"schedules",id);

      const payload = {
        yearMonth:s.yearMonth,
        date:s.date,
        branchId:s.branchId,
        userId:s.userId,
        userName:s.userName,
        startTime:s.startTime,
        endTime:s.endTime,
        isOff:s.isOff,
        note:s.note,
        deleted:false,
        updatedAt:serverTimestamp(),
        updatedBy:currentUser.uid
      };

      if(s._isNew) payload.createdAt = serverTimestamp();

      batch.set(ref,payload,{merge:true});
    }

    for(const id of scheduleDeletes){
      const ref = doc(db,"schedules",id);
      batch.set(ref,{
        deleted:true,
        deletedAt:serverTimestamp(),
        updatedAt:serverTimestamp(),
        updatedBy:currentUser.uid
      },{merge:true});
    }

    await batch.commit();

    clearScheduleDrafts();
    toast(`บันทึกตารางเวรแล้ว ${count} รายการ`);

  }catch(err){
    console.error(err);
    toast(err.message || "บันทึกตารางเวรไม่สำเร็จ",true);
  }finally{
    showLoading(false);
  }
}




/* ---------------- SCHEDULE VALIDATION V7 ---------------- */

function timeToMinutes(value){
  if(!value) return null;
  const [hRaw,mRaw="0"] = String(value).split(":");
  const h=Number(hRaw), m=Number(mRaw);
  if(!Number.isFinite(h)||!Number.isFinite(m)||h<0||h>24||m<0||m>59||(h===24&&m!==0)) return null;
  return h*60+m;
}

function addShiftFlag(map,id,severity,message){
  if(!id) return;
  const item=map.get(id)||{severity:null,messages:[]};
  if(item.severity!=="error"&&severity==="error") item.severity="error";
  else if(!item.severity) item.severity=severity;
  item.messages.push(message);
  map.set(id,item);
}

function addCellFlag(map,date,branchId,severity,message){
  const key=`${date}__${branchId}`;
  const item=map.get(key)||{severity:null,messages:[]};
  if(item.severity!=="error"&&severity==="error") item.severity="error";
  else if(!item.severity) item.severity=severity;
  item.messages.push(message);
  map.set(key,item);
}

function compressHourRanges(hours){
  if(!hours.length) return [];
  const out=[];
  let start=hours[0], prev=hours[0];

  for(let i=1;i<=hours.length;i++){
    const cur=hours[i];
    if(cur===prev+1){
      prev=cur;
      continue;
    }
    out.push(`${String(start).padStart(2,"0")}:00-${String(prev+1).padStart(2,"0")}:00`);
    start=cur;
    prev=cur;
  }
  return out;
}

function validateSchedule(schedules){
  const errors=[],warnings=[],shiftFlags=new Map(),cellFlags=new Map();
  const ym=$("manageScheduleMonth")?.value||manageScheduleMonthValue||bangkokYearMonth();

  // Basic time checks + unusually long shifts.
  for(const s of schedules){
    if(s.isOff) continue;

    const st=timeToMinutes(s.startTime), en=timeToMinutes(s.endTime);
    if(st===null||en===null||en<=st){
      const msg=`${s.userName} ${s.date}: เวลา ${s.startTime||"-"}-${s.endTime||"-"} ไม่ถูกต้อง`;
      errors.push({message:msg});
      addShiftFlag(shiftFlags,s.id,"error",msg);
      continue;
    }

    const hours=(en-st)/60;
    if(hours>15){
      const msg=`${s.userName} ${s.date}: เวรยาว ${hours.toFixed(1)} ชม. (>15 ชม.)`;
      warnings.push({message:msg});
      addShiftFlag(shiftFlags,s.id,"warn",msg);
    }
  }

  // User/day conflicts.
  const byUserDate={};
  for(const s of schedules){
    (byUserDate[`${s.userId}__${s.date}`]??=[]).push(s);
  }

  for(const list of Object.values(byUserDate)){
    if(list.length<2) continue;

    const hasOff=list.some(s=>s.isOff);
    const hasWork=list.some(s=>!s.isOff);

    if(hasOff&&hasWork){
      const msg=`${list[0].userName} ${list[0].date}: มีทั้ง OFF และเวรทำงานในวันเดียวกัน`;
      errors.push({message:msg});
      list.forEach(s=>addShiftFlag(shiftFlags,s.id,"error",msg));
    }

    const work=list.filter(s=>!s.isOff);
    for(let i=0;i<work.length;i++){
      for(let j=i+1;j<work.length;j++){
        const a=work[i],b=work[j];
        const as=timeToMinutes(a.startTime),ae=timeToMinutes(a.endTime);
        const bs=timeToMinutes(b.startTime),be=timeToMinutes(b.endTime);
        if(as===null||ae===null||bs===null||be===null) continue;

        if(Math.max(as,bs)<Math.min(ae,be)){
          const msg=`${a.userName} ${a.date}: เวรซ้อน ${a.startTime}-${a.endTime} (${scheduleBranchName(a.branchId)}) กับ ${b.startTime}-${b.endTime} (${scheduleBranchName(b.branchId)})`;
          errors.push({message:msg});
          addShiftFlag(shiftFlags,a.id,"error",msg);
          addShiftFlag(shiftFlags,b.id,"error",msg);
          addCellFlag(cellFlags,a.date,a.branchId,"error",msg);
          addCellFlag(cellFlags,b.date,b.branchId,"error",msg);
        }

        if(a.branchId===b.branchId&&a.startTime===b.startTime&&a.endTime===b.endTime){
          const msg=`${a.userName} ${a.date}: มีเวรซ้ำรายการเดียวกัน`;
          errors.push({message:msg});
          addShiftFlag(shiftFlags,a.id,"error",msg);
          addShiftFlag(shiftFlags,b.id,"error",msg);
        }
      }
    }
  }

  // Coverage 08:00-24:00. This is a warning, so Manager can override.
  for(const date of monthDates(ym)){
    for(const b of activeBranches()){
      const list=schedules.filter(s=>s.date===date&&s.branchId===b.id&&!s.isOff);
      const uncovered=[];

      for(let h=8;h<24;h++){
        const slotStart=h*60, slotEnd=(h+1)*60;
        const covered=list.some(s=>{
          const st=timeToMinutes(s.startTime),en=timeToMinutes(s.endTime);
          return st!==null&&en!==null&&st<=slotStart&&en>=slotEnd;
        });
        if(!covered) uncovered.push(h);
      }

      if(uncovered.length){
        const msg=`${date} · ${scheduleBranchName(b.id)}: Coverage ไม่ครบ (${compressHourRanges(uncovered).join(", ")})`;
        warnings.push({message:msg});
        addCellFlag(cellFlags,date,b.id,"warn",msg);
      }
    }
  }

  return {errors,warnings,shiftFlags,cellFlags};
}

function refreshScheduleValidation(){
  lastScheduleValidation=validateSchedule(mergedSchedules());
  renderScheduleValidationPanel();
  renderValidationCount();
  return lastScheduleValidation;
}

function renderValidationCount(){
  const badge=$("validationCount");
  if(!badge) return;

  const n=lastScheduleValidation.errors.length+lastScheduleValidation.warnings.length;
  badge.textContent=String(n);
  badge.classList.toggle("hidden",n===0);
}

function renderScheduleValidationPanel(forceOpen=false){
  const host=$("scheduleValidationPanel");
  if(!host) return;

  const {errors,warnings}=lastScheduleValidation;
  const total=errors.length+warnings.length;

  if(!total&&!forceOpen){
    host.classList.add("hidden");
    host.innerHTML="";
    return;
  }

  host.classList.remove("hidden");
  const preview=[
    ...errors.map(x=>({...x,severity:"error"})),
    ...warnings.map(x=>({...x,severity:"warn"}))
  ].slice(0,30);

  host.innerHTML=`
    <div class="validation-head">
      <div class="validation-title">ผลตรวจสอบตารางเวร</div>
      <div class="validation-badges">
        ${total===0?`<span class="validation-badge ok">ไม่พบปัญหา</span>`:""}
        ${errors.length?`<span class="validation-badge error">ต้องตรวจ ${errors.length}</span>`:""}
        ${warnings.length?`<span class="validation-badge warn">เตือน ${warnings.length}</span>`:""}
      </div>
    </div>

    ${preview.length?`
      <div class="validation-list">
        ${preview.map(x=>`<div class="validation-item ${x.severity}">${escapeHtml(x.message)}</div>`).join("")}
        ${total>preview.length?`<div class="muted" style="font-size:10px">และอีก ${total-preview.length} รายการ</div>`:""}
      </div>
    `:""}
  `;
}

$("validateScheduleBtn")?.addEventListener("click",()=>{
  refreshScheduleValidation();
  renderScheduleValidationPanel(true);

  if(lastScheduleValidation.errors.length+lastScheduleValidation.warnings.length===0){
    toast("ตรวจสอบแล้ว ไม่พบปัญหา");
  }
});

/* ---------------- CHANGE REQUEST SYSTEM ---------------- */

function changeStatusLabel(status){
  return ({
    pending:"รออนุมัติ",
    approved:"อนุมัติแล้ว",
    rejected:"ไม่อนุมัติ",
    cancelled:"ยกเลิกแล้ว"
  })[status] || status || "-";
}

function latestChangeForSchedule(scheduleId){
  const list = myChangeRequests
    .filter(r=>r.scheduleId===scheduleId)
    .sort((a,b)=>{
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return tb-ta;
    });
  return list[0] || null;
}

function startMyChangeRequestListener(){
  if(!currentUser) return;
  if(unsubscribeMyChangeRequests){ unsubscribeMyChangeRequests(); unsubscribeMyChangeRequests=null; }

  const q = query(
    collection(db,"changeRequests"),
    where("userId","==",currentUser.uid)
  );

  unsubscribeMyChangeRequests = onSnapshot(
    q,
    snap=>{
      myChangeRequests = snap.docs.map(d=>({id:d.id,...d.data()}));
      renderMyChangeRequestInfo();
      renderMySchedule();
    },
    err=>{
      console.error(err);
      toast("โหลดคำขอแก้เวรไม่สำเร็จ",true);
    }
  );
}

function renderMyChangeRequestInfo(){
  const host = $("myChangeRequestInfo");
  if(!host) return;

  const ym = $("myScheduleMonth")?.value || bangkokYearMonth();
  const monthList = myChangeRequests.filter(r=>r.yearMonth===ym);

  const pending = monthList.filter(r=>r.status==="pending").length;
  const approved = monthList.filter(r=>r.status==="approved").length;
  const rejected = monthList.filter(r=>r.status==="rejected").length;

  host.innerHTML = `
    <span class="info-pill">คำขอแก้เวร: ${monthList.length}</span>
    <span class="change-pill pending">รอ ${pending}</span>
    <span class="change-pill approved">อนุมัติ ${approved}</span>
    <span class="change-pill rejected">ไม่อนุมัติ ${rejected}</span>
  `;
}

function openChangeRequestModal(schedule){
  if(!schedule || schedule.userId!==currentUser?.uid) return;

  const existing = latestChangeForSchedule(schedule.id);
  if(existing?.status==="pending"){
    toast("เวรนี้มีคำขอที่รออนุมัติอยู่แล้ว",true);
    return;
  }

  const branchOptions = activeBranches().map(b=>`
    <option value="${escapeAttr(b.id)}" ${b.id===schedule.branchId ? "selected":""}>
      ${escapeHtml(b.branchName||b.branchId||b.id)}
    </option>
  `).join("");

  $("modalHost").innerHTML = `
    <div class="modal-backdrop" id="changeBackdrop">
      <div class="modal">
        <div class="page-head">
          <div>
            <h2>ขอแก้ไขเวร</h2>
            <div class="muted">${escapeHtml(scheduleDateLabel(schedule.date))}</div>
          </div>
        </div>

        <div class="change-box">
          <b>เวรเดิม</b>
          ${schedule.isOff ? "OFF" : `${escapeHtml(schedule.startTime)}-${escapeHtml(schedule.endTime)}`}
          · ${escapeHtml(scheduleBranchName(schedule.branchId))}
        </div>

        <div class="modal-grid">
          <div>
            <label>สาขาที่ต้องการ</label>
            <select id="mChangeBranch">${branchOptions}</select>
          </div>

          <div>
            <label>สถานะ</label>
            <select id="mChangeMode">
              <option value="work" ${schedule.isOff ? "":"selected"}>ทำงาน</option>
              <option value="off" ${schedule.isOff ? "selected":""}>OFF</option>
            </select>
          </div>

          <div>
            <label>เวลาเริ่ม</label>
            <input id="mChangeStart" type="time" value="${escapeAttr(schedule.startTime || "08:00")}">
          </div>

          <div>
            <label>เวลาจบ</label>
            <input id="mChangeEnd" value="${escapeAttr(schedule.endTime || "16:00")}">
          </div>
        </div>

        <label>เหตุผล / หมายเหตุ</label>
        <input id="mChangeReason" placeholder="เช่น ขอเข้าบ่ายแทน เนื่องจากมีธุระช่วงเช้า">

        <div class="actions">
          <button id="cancelChangeReq" class="btn ghost">ยกเลิก</button>
          <button id="submitChangeReq" class="btn primary">ส่งให้ Manager</button>
        </div>
      </div>
    </div>
  `;

  const syncMode = ()=>{
    const off = $("mChangeMode").value==="off";
    $("mChangeStart").disabled = off;
    $("mChangeEnd").disabled = off;
  };
  syncMode();

  $("mChangeMode").addEventListener("change",syncMode);
  $("cancelChangeReq").addEventListener("click",closeModal);
  $("changeBackdrop").addEventListener("click",e=>{ if(e.target.id==="changeBackdrop") closeModal(); });
  $("submitChangeReq").addEventListener("click",()=>submitChangeRequest(schedule));
}

async function submitChangeRequest(schedule){
  if(!schedule || schedule.userId!==currentUser?.uid) return;

  const mode = $("mChangeMode")?.value || "work";
  const requestedOff = mode==="off";
  const requestedBranchId = $("mChangeBranch")?.value || schedule.branchId;
  const requestedStart = requestedOff ? "" : ($("mChangeStart")?.value || "");
  const requestedEnd = requestedOff ? "" : ($("mChangeEnd")?.value.trim() || "");
  const reason = $("mChangeReason")?.value.trim() || "";

  if(!requestedOff && (!requestedStart || !requestedEnd)){
    toast("กรุณาระบุเวลาเริ่มและจบ",true);
    return;
  }
  if(!requestedOff && scheduleHours(requestedStart,requestedEnd)<=0){
    toast("เวลาจบต้องมากกว่าเวลาเริ่ม",true);
    return;
  }

  // Prevent sending a no-op request.
  const same =
    requestedOff===schedule.isOff &&
    requestedBranchId===schedule.branchId &&
    (requestedOff || (requestedStart===schedule.startTime && requestedEnd===schedule.endTime));

  if(same){
    toast("เวรที่ขอเหมือนกับเวรเดิม",true);
    return;
  }

  const id = doc(collection(db,"changeRequests")).id;

  showLoading(true,"กำลังส่งคำขอแก้เวร...");
  try{
    await setDoc(doc(db,"changeRequests",id),{
      scheduleId:schedule.id,
      yearMonth:schedule.yearMonth,
      date:schedule.date,
      userId:currentUser.uid,
      userName:currentProfile.name || currentProfile.username,

      oldBranchId:schedule.branchId,
      oldStart:schedule.startTime || "",
      oldEnd:schedule.endTime || "",
      oldOff:schedule.isOff===true,

      requestedBranchId,
      requestedStart,
      requestedEnd,
      requestedOff,

      reason,
      status:"pending",
      createdAt:serverTimestamp(),
      updatedAt:serverTimestamp()
    });

    closeModal();
    toast("ส่งคำขอแก้เวรแล้ว");
  }catch(err){
    console.error(err);
    toast(err.message || "ส่งคำขอแก้เวรไม่สำเร็จ",true);
  }finally{
    showLoading(false);
  }
}

function startPendingChangeRequestListener(){
  if(!canManageSchedule()) return;
  if(unsubscribePendingChangeRequests){ unsubscribePendingChangeRequests(); unsubscribePendingChangeRequests=null; }

  const q = query(
    collection(db,"changeRequests"),
    where("status","==","pending")
  );

  unsubscribePendingChangeRequests = onSnapshot(
    q,
    snap=>{
      pendingChangeRequests = snap.docs
        .map(d=>({id:d.id,...d.data()}))
        .sort((a,b)=>{
          const da = String(a.date||"");
          const dbv = String(b.date||"");
          if(da!==dbv) return da.localeCompare(dbv);
          const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
          const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
          return ta-tb;
        });

      renderPendingChangeCount();
    },
    err=>{
      console.error(err);
      toast("โหลดคำขอแก้เวรรออนุมัติไม่สำเร็จ",true);
    }
  );
}

function renderPendingChangeCount(){
  const count = pendingChangeRequests.length;
  const badge = $("pendingChangesCount");
  if(!badge) return;

  badge.textContent = String(count);
  badge.classList.toggle("hidden",count===0);
}

$("pendingChangesBtn")?.addEventListener("click",openPendingChangesModal);

function openPendingChangesModal(){
  if(!canManageSchedule()) return;

  const items = pendingChangeRequests;

  $("modalHost").innerHTML = `
    <div class="modal-backdrop" id="pendingChangesBackdrop">
      <div class="modal" style="width:min(820px,100%)">
        <div class="page-head">
          <div>
            <h2>คำขอแก้เวรรออนุมัติ</h2>
            <div class="muted">${items.length} รายการ</div>
          </div>
        </div>

        <div class="change-list">
          ${items.length ? items.map(c=>`
            <div class="change-card">
              <div class="change-card-head">
                <div>
                  <b>${escapeHtml(c.userName||"")}</b>
                  <div class="muted">${escapeHtml(scheduleDateLabel(c.date||""))}</div>
                </div>
                <span class="change-pill pending">รออนุมัติ</span>
              </div>

              <div class="change-old-new">
                <div class="change-box">
                  <b>เดิม</b>
                  ${c.oldOff ? "OFF" : `${escapeHtml(c.oldStart||"")}-${escapeHtml(c.oldEnd||"")}`}
                  · ${escapeHtml(scheduleBranchName(c.oldBranchId))}
                </div>

                <div class="change-box">
                  <b>ขอเปลี่ยนเป็น</b>
                  ${c.requestedOff ? "OFF" : `${escapeHtml(c.requestedStart||"")}-${escapeHtml(c.requestedEnd||"")}`}
                  · ${escapeHtml(scheduleBranchName(c.requestedBranchId))}
                </div>
              </div>

              ${c.reason ? `<div class="change-reason"><b>เหตุผล:</b> ${escapeHtml(c.reason)}</div>`:""}

              <div class="change-actions">
                <button class="btn danger" data-change-reject="${escapeAttr(c.id)}">Reject</button>
                <button class="btn primary" data-change-approve="${escapeAttr(c.id)}">Approve</button>
              </div>
            </div>
          `).join("") : `<div class="schedule-empty">ไม่มีคำขอที่รออนุมัติ</div>`}
        </div>

        <div class="actions">
          <button id="closePendingChanges" class="btn ghost">ปิด</button>
        </div>
      </div>
    </div>
  `;

  $("closePendingChanges").addEventListener("click",closeModal);
  $("pendingChangesBackdrop").addEventListener("click",e=>{ if(e.target.id==="pendingChangesBackdrop") closeModal(); });

  document.querySelectorAll("[data-change-approve]").forEach(btn=>{
    btn.addEventListener("click",()=>decideChangeRequest(btn.dataset.changeApprove,"approved"));
  });
  document.querySelectorAll("[data-change-reject]").forEach(btn=>{
    btn.addEventListener("click",()=>decideChangeRequest(btn.dataset.changeReject,"rejected"));
  });
}

async function decideChangeRequest(changeId,decision){
  if(!canManageSchedule()) return;

  const c = pendingChangeRequests.find(x=>x.id===changeId);
  if(!c) return;

  const actionText = decision==="approved" ? "อนุมัติ" : "ไม่อนุมัติ";
  if(!confirm(`${actionText}คำขอของ ${c.userName} วันที่ ${c.date}?`)) return;

  showLoading(true,decision==="approved" ? "กำลังอนุมัติและแก้ตารางเวร..." : "กำลัง Reject...");

  try{
    await runTransaction(db,async tx=>{
      const changeRef = doc(db,"changeRequests",changeId);
      const scheduleRef = doc(db,"schedules",c.scheduleId);

      const changeSnap = await tx.get(changeRef);
      if(!changeSnap.exists()) throw new Error("ไม่พบคำขอแก้เวร");

      const fresh = changeSnap.data();
      if(fresh.status!=="pending") throw new Error("คำขอนี้ถูกดำเนินการแล้ว");

      if(decision==="approved"){
        const scheduleSnap = await tx.get(scheduleRef);
        if(!scheduleSnap.exists()) throw new Error("ไม่พบเวรต้นฉบับ");

        const currentSchedule = scheduleSnap.data();
        if(currentSchedule.userId!==fresh.userId) throw new Error("User ของคำขอไม่ตรงกับเวร");

        tx.set(scheduleRef,{
          branchId:fresh.requestedBranchId,
          startTime:fresh.requestedOff ? "" : fresh.requestedStart,
          endTime:fresh.requestedOff ? "" : fresh.requestedEnd,
          isOff:fresh.requestedOff===true,
          updatedAt:serverTimestamp(),
          updatedBy:currentUser.uid
        },{merge:true});
      }

      tx.set(changeRef,{
        status:decision,
        decidedBy:currentUser.uid,
        decidedByName:currentProfile.name || currentProfile.username,
        decidedAt:serverTimestamp(),
        updatedAt:serverTimestamp()
      },{merge:true});
    });

    toast(decision==="approved" ? "อนุมัติแล้ว ตารางเวรถูกแก้ไข" : "Reject คำขอแล้ว");
    closeModal();

    // Reopen refreshed pending list only when items remain.
    setTimeout(()=>{
      if(pendingChangeRequests.length) openPendingChangesModal();
    },250);

  }catch(err){
    console.error(err);
    toast(err.message || "ดำเนินการคำขอไม่สำเร็จ",true);
  }finally{
    showLoading(false);
  }
}


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
