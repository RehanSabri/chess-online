import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyC5a3vvpskZtVTSdIeAzS7Pj4v_kpafoJo",
  authDomain: "chess-online-7ea23.firebaseapp.com",
  databaseURL: "https://chess-online-7ea23-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "chess-online-7ea23",
  storageBucket: "chess-online-7ea23.firebasestorage.app",
  messagingSenderId: "1061337626546",
  appId: "1:1061337626546:web:8a2c5f228efaff594c96ab",
  measurementId: "G-4LF9H9TJFW"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
// Only initialise Analytics in a real browser (guards against SSR / test envs)
export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;