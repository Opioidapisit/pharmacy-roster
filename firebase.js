import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBJYZgp_s8-Ha5SGikmn8Vgq1uXjWhQjRg",
  authDomain: "pharmacy-roster-715ec.firebaseapp.com",
  projectId: "pharmacy-roster-715ec",
  storageBucket: "pharmacy-roster-715ec.firebasestorage.app",
  messagingSenderId: "490816179680",
  appId: "1:490816179680:web:b2d0588de269921c236f85",
  measurementId: "G-W2FSZ30096"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
