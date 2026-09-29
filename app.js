import { auth,db } from "./firebase.js";
import { signInWithEmailAndPassword,signOut,onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { doc,getDoc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

const $=id=>document.getElementById(id);
const INTERNAL_DOMAIN="pharmacy-roster.local";
function show(id){["loginView","appView"].forEach(x=>$(x).classList.add("hidden"));$(id).classList.remove("hidden")}
function loading(v){$("loading").classList.toggle("hidden",!v)}
function internalEmail(username){return `${username.trim().toLowerCase()}@${INTERNAL_DOMAIN}`}

$("loginForm").addEventListener("submit",async e=>{
  e.preventDefault(); $("loginError").textContent=""; loading(true);
  try{
    await signInWithEmailAndPassword(auth,internalEmail($("username").value),$("password").value);
  }catch(err){
    console.error(err);
    $("loginError").textContent="Username หรือ Password ไม่ถูกต้อง";
    loading(false);
  }
});
$("logoutBtn").addEventListener("click",()=>signOut(auth));

onAuthStateChanged(auth,async user=>{
  loading(true);
  if(!user){show("loginView");$("password").value="";loading(false);return}
  try{
    const snap=await getDoc(doc(db,"users",user.uid));
    if(!snap.exists()) throw new Error("ไม่พบ User profile ใน Firestore");
    const p=snap.data();
    if(p.active!==true) throw new Error("บัญชีนี้ถูกปิดใช้งาน");
    $("displayName").textContent=p.name||p.username||"User";
    $("displayUsername").textContent=p.username||"-";
    $("displayRole").textContent=p.role||"-";
    show("appView");
  }catch(err){
    console.error(err); await signOut(auth);
    $("loginError").textContent=err.message||"ไม่สามารถโหลดข้อมูลผู้ใช้ได้";
    show("loginView");
  }finally{loading(false)}
});
