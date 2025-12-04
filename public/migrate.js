// ...small, self-contained migration script...
let firestore = null;
let auth = null;
let currentUser = null;
let currentIsAdmin = false;

function appendLog(msg) {
    const el = document.getElementById('migrateLog');
    if (!el) return;
    const ts = new Date().toLocaleTimeString();
    el.textContent += `[${ts}] ${msg}\n`;
    el.scrollTop = el.scrollHeight;
}

async function loadFirebaseConfig() {
    try {
        if (!window.FIREBASE_CONFIG) {
            const res = await fetch('/firestore.json', { cache: 'no-store' });
            if (res.ok) {
                const cfg = await res.json();
                if (cfg && cfg.projectId) {
                    window.FIREBASE_CONFIG = cfg;
                    appendLog('FIREBASE_CONFIG loaded from /firestore.json (migrate)');
                } else {
                    appendLog('firestore.json の内容が不正です (migrate)');
                }
            } else {
                appendLog('No /firestore.json for migrate (status ' + res.status + ')');
            }
        }
    } catch (e) {
        appendLog('firestore.json 読み込み失敗 (migrate): ' + e.message);
    }
}

function initFirebase() {
    if (window.FIREBASE_CONFIG && typeof firebase !== 'undefined') {
        try {
            firebase.initializeApp(window.FIREBASE_CONFIG);
            firestore = firebase.firestore();
            auth = firebase.auth();
            appendLog('Firebase 初期化済み');

            auth.onAuthStateChanged(async (user) => {
                currentUser = user;
                const signInBtn = document.getElementById('signInBtn');
                const signOutBtn = document.getElementById('signOutBtn');
                const userInfo = document.getElementById('userInfo');
                const startBtn = document.getElementById('startMigrateBtn');

                if (user) {
                    userInfo.textContent = `${user.displayName || ''} ${user.email || ''} (UID:${user.uid})`;
                    signInBtn.style.display = 'none';
                    signOutBtn.style.display = 'inline-block';
                    try {
                        const doc = await firestore.collection('admins').doc(user.uid).get();
                        currentIsAdmin = doc.exists;
                    } catch (e) {
                        currentIsAdmin = false;
                        appendLog('管理者判定でエラー: ' + e.message);
                    }
                    appendLog(currentIsAdmin ? '管理者として認証されました' : '管理者ではありません');
                    startBtn.disabled = !currentIsAdmin;
                } else {
                    userInfo.textContent = '';
                    signInBtn.style.display = 'inline-block';
                    signOutBtn.style.display = 'none';
                    startBtn.disabled = true;
                }
            });

            document.getElementById('signInBtn').addEventListener('click', async () => {
                const provider = new firebase.auth.GoogleAuthProvider();
                try { await auth.signInWithPopup(provider); } catch (e) { appendLog('ログイン失敗: ' + e.message); }
            });
            document.getElementById('signOutBtn').addEventListener('click', async () => {
                try { await auth.signOut(); } catch (e) { appendLog('ログアウト失敗: ' + e.message); }
            });
            document.getElementById('startMigrateBtn').addEventListener('click', startMigration);

        } catch (e) {
            appendLog('Firebase 初期化エラー: ' + e.message);
        }
    } else {
        appendLog('FIREBASE_CONFIG が設定されていません');
    }
}

async function fetchJson(path) {
    try {
        const res = await fetch(path);
        if (!res.ok) { appendLog(`fetch ${path} failed: ${res.status}`); return []; }
        return await res.json();
    } catch (e) {
        appendLog(`fetch ${path} error: ${e.message}`);
        return [];
    }
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// 追加: URL から SHA-1 を計算するユーティリティ（migrate.js 用）
async function computeContentHashForMigrate(url) {
    try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return null;
        const buf = await res.arrayBuffer();
        const hbuf = await crypto.subtle.digest('SHA-1', buf);
        const arr = Array.from(new Uint8Array(hbuf));
        return arr.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
        appendLog('ハッシュ計算失敗: ' + e.message);
        return null;
    }
}

async function startMigration() {
    if (!currentUser || !currentIsAdmin) { appendLog('管理者でログインしてください'); return; }
    if (!confirm('ローカルの JSON を Firestore に移行します。既に存在する filename はスキップします。よろしいですか？')) return;

    const lists = [
        { path: '/imgindex.json', type: 'image', baseUrl: `${location.origin}/imgs/` },
        { path: '/modelindex.json', type: 'model', baseUrl: `${location.origin}/models/` },
        { path: '/videoindex.json', type: 'video', baseUrl: `${location.origin}/videos/` }
    ];

    let total = 0, added = 0, skipped = 0;
    appendLog('移行開始');

    for (const info of lists) {
        appendLog('読み込み: ' + info.path);
        const arr = await fetchJson(info.path);
        if (!Array.isArray(arr) || arr.length === 0) { appendLog('データなし: ' + info.path); continue; }
        for (const item of arr) {
            total++;
            const filename = item.filename || item.name || '';
            const url = item.url || (filename ? (info.baseUrl + filename) : (item.url || ''));
            appendLog(`処理: ${filename}`);
            try {
                const q = await firestore.collection('archive').where('filename', '==', filename).get();
                if (!q.empty) { skipped++; appendLog(`スキップ（既存）: ${filename}`); await delay(120); continue; }
            } catch (e) { appendLog('存在確認失敗: ' + e.message); }
            const doc = {
                filename,
                url,
                description: item.description || item.title || filename,
                detail: item.detail || '',
                // 追加: thumbnail 情報を保存（model index の thumbnail フィールドをそのまま保持）
                thumbnail: item.thumbnail || '',
                author: item.author || '',
                tags: Array.isArray(item.tags) ? item.tags : [],
                type: info.type,
                owner: currentUser.uid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            try {
                const addedRef = await firestore.collection('archive').add(doc);
                // 追加: 非同期で contentHash を計算して更新（CORS 等で失敗しても無視）
                (async () => {
                    try {
                        if (doc.url) {
                            const h = await computeContentHashForMigrate(doc.url);
                            if (h) await firestore.collection('archive').doc(addedRef.id).update({ contentHash: h });
                        }
                    } catch (e) {
                        appendLog('contentHash 更新失敗: ' + e.message);
                    }
                })();
                added++;
                appendLog(`追加: ${filename} (${added} 追加, ${skipped} スキップ)`);
            } catch (e) {
                appendLog(`追加失敗: ${filename} - ${e.message}`);
            }
            await delay(200);
        }
    }

    appendLog(`移行完了: 合計 ${total} 件中 ${added} 件追加, ${skipped} 件スキップ`);
    alert('移行が完了しました');
}

window.addEventListener('DOMContentLoaded', async () => {
    await loadFirebaseConfig();
    initFirebase();
});
