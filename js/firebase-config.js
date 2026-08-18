// Firebase Configuration for Search Blocker Media Player
const firebaseConfig = {
    apiKey: "AIzaSyCXfzDbswO3Al0r022em0kvS-TirZBuFGw",
    authDomain: "demoproject-8ddb1.firebaseapp.com",
    projectId: "demoproject-8ddb1",
    storageBucket: "demoproject-8ddb1.firebasestorage.app",
    messagingSenderId: "560328341190",
    appId: "1:560328341190:web:5cd871206dd9711c6989c7",
    measurementId: "G-N5J18SVYLM"
};

// Initialize Firebase App & Firestore Database instance
let db = null;
try {
    if (typeof firebase !== 'undefined') {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        db = firebase.firestore();
        window.firebaseDb = db;
        console.log("🔥 Firebase Firestore initialized successfully!");
    }
} catch (e) {
    console.error("Firebase Firestore initialization error:", e);
}