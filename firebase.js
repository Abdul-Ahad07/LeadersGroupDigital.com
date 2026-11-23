import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// FIREBASE CONFIGURATION
const firebaseConfig = {
  apiKey: "AIzaSyAiOsae5B6H26bIfe_jLGzx--CoEU2gXvI",
  authDomain: "leaders-group-digital-agency.firebaseapp.com",
  projectId: "leaders-group-digital-agency",
  storageBucket: "leaders-group-digital-agency.firebasestorage.app",
  messagingSenderId: "1053379003937",
  appId: "1:1053379003937:web:380653f1639eb5ab178560"
};

// INITIALIZE FIREBASE
const app = initializeApp(firebaseConfig);

// AUTHENTICATION
const auth = getAuth(app);

// DATABASE
const db = getFirestore(app);

// EXPORTS
export {
  app,
  auth,
  db,

  // Authentication
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,

  // Firestore
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs
};
