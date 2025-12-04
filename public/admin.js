let firestore = null;
let auth = null;
let currentUser = null;
let currentIsAdmin = false;

// 追加: 管理用 UI 状態
let showManageControls = false;
let currentArchiveItems = [];

function appendMsg(el, msg) {
    el.textContent = msg;
    setTimeout(() => { el.textContent = ''; }, 3000);
}

// FIREBASE_CONFIG をロードする関数
async function loadFirebaseConfigForAdmin() {
    if (!window.FIREBASE_CONFIG) {
        try {
            const res = await fetch('/firestore.json', { cache: 'no-store' });
            if (res.ok) {
                const cfg = await res.json();
                if (cfg && cfg.projectId) {
                    window.FIREBASE_CONFIG = cfg;
                }
            }
        } catch (e) {
            console.warn('Failed to load firestore.json', e);
        }
    }
}

function initFirebase() {
    if (window.FIREBASE_CONFIG && typeof firebase !== 'undefined') {
        try {
            firebase.initializeApp(window.FIREBASE_CONFIG);
            firestore = firebase.firestore();
            auth = firebase.auth();

            auth.onAuthStateChanged(async (user) => {
                currentUser = user;
                const signInBtn = document.getElementById('signInBtn');
                const signOutBtn = document.getElementById('signOutBtn');
                const userInfo = document.getElementById('userInfo');
                const adminStatus = document.getElementById('adminStatus');
                const addBtn = document.getElementById('addAdminBtn');

                if (user) {
                    userInfo.textContent = `${user.displayName || user.email} (UID: ${user.uid})`;
                    signInBtn.style.display = 'none';
                    signOutBtn.style.display = 'inline-block';

                    // 管理者判定
                    try {
                        const doc = await firestore.collection('admins').doc(user.uid).get();
                        currentIsAdmin = doc.exists;
                    } catch (e) {
                        currentIsAdmin = false;
                    }

                    adminStatus.textContent = currentIsAdmin ? '✅ 管理者です' : '❌ 管理者ではありません';
                    addBtn.disabled = !currentIsAdmin;

                    if (currentIsAdmin) {
                        loadAdminList();
                    }
                } else {
                    userInfo.textContent = '';
                    adminStatus.textContent = '';
                    signInBtn.style.display = 'inline-block';
                    signOutBtn.style.display = 'none';
                    addBtn.disabled = true;
                }

                (async () => {
                    if (currentIsAdmin) {
                        // 管理者向け: アーカイブ一覧関連 UI を有効化
                        const toggleBtn = document.getElementById('toggleManageBtn');
                        if (toggleBtn) {
                            toggleBtn.style.display = 'inline-block';
                            toggleBtn.textContent = '管理モード: 非表示';
                            toggleBtn.onclick = toggleManageControls;
                        }
                        // 検索イベント
                        const searchInput = document.getElementById('archiveSearch');
                        const clearBtn = document.getElementById('archiveSearchClear');
                        if (searchInput) {
                            searchInput.addEventListener('input', (e) => {
                                const filtered = applyArchiveSearch(currentArchiveItems, e.target.value.trim());
                                renderArchiveList(filtered);
                            });
                        }
                        if (clearBtn) {
                            clearBtn.addEventListener('click', () => {
                                const si = document.getElementById('archiveSearch');
                                si.value = '';
                                renderArchiveList(currentArchiveItems);
                            });
                        }
                        // 初回ロード
                        await loadArchiveList();
                    } else {
                        const toggleBtn = document.getElementById('toggleManageBtn');
                        if (toggleBtn) toggleBtn.style.display = 'none';
                    }
                })();
            });

            document.getElementById('signInBtn').addEventListener('click', async () => {
                const provider = new firebase.auth.GoogleAuthProvider();
                try { await auth.signInWithPopup(provider); } catch (e) { console.error('ログイン失敗', e); }
            });
            document.getElementById('signOutBtn').addEventListener('click', async () => {
                try { await auth.signOut(); } catch (e) { console.error('ログアウト失敗', e); }
            });
            document.getElementById('addAdminBtn').addEventListener('click', addAdmin);

        } catch (e) {
            console.error('Firebase 初期化エラー', e);
        }
    } else {
        console.log('FIREBASE_CONFIG が設定されていません');
    }
}

async function loadAdminList() {
    try {
        const snapshot = await firestore.collection('admins').get();
        const admins = snapshot.docs.map(d => ({ uid: d.id, ...d.data() }));
        const listDiv = document.getElementById('adminList');

        if (admins.length === 0) {
            listDiv.innerHTML = '<p style="color:#999;">管理者はまだいません。</p>';
            return;
        }

        listDiv.innerHTML = admins.map(admin => `
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; padding:8px; background:#f9f9f9; border-radius:6px;">
                <span><strong>${admin.uid}</strong></span>
                <button style="padding:4px 12px; background:#ff6b6b; color:#fff; border:none; border-radius:4px; cursor:pointer;" onclick="window._removeAdmin('${admin.uid}')">削除</button>
            </div>
        `).join('');
    } catch (e) {
        console.error('管理者一覧読み込み失敗', e);
    }
}

async function addAdmin() {
    if (!currentIsAdmin) {
        appendMsg(document.getElementById('addMsg'), '管理者のみ追加可能です');
        return;
    }

    const uid = document.getElementById('adminUid').value.trim();
    if (!uid) {
        appendMsg(document.getElementById('addMsg'), 'UID を入力してください');
        return;
    }

    try {
        await firestore.collection('admins').doc(uid).set({});
        document.getElementById('adminUid').value = '';
        appendMsg(document.getElementById('addMsg'), '管理者を追加しました');
        loadAdminList();
    } catch (e) {
        console.error('追加失敗', e);
        appendMsg(document.getElementById('addMsg'), '追加に失敗しました');
    }
}

window._removeAdmin = async (uid) => {
    if (!confirm(`${uid} を管理者から削除しますか？`)) return;
    try {
        await firestore.collection('admins').doc(uid).delete();
        appendMsg(document.getElementById('addMsg'), '削除しました');
        loadAdminList();
    } catch (e) {
        console.error('削除失敗', e);
        appendMsg(document.getElementById('addMsg'), '削除に失敗しました');
    }
};

// 追加: アーカイブにURLから追加する関数
async function addArchiveByUrl() {
    if (!currentIsAdmin) {
        appendMsg(document.getElementById('addArchiveMsg'), '管理者のみ追加可能です');
        return;
    }
    const url = document.getElementById('archiveUrlInput').value.trim();
    const description = document.getElementById('archiveDescInput')?.value?.trim() || url;
    const author = document.getElementById('archiveAuthorInput')?.value?.trim() || '';
    const tagsRaw = document.getElementById('archiveTagsInput')?.value?.trim() || '';
    const tags = tagsRaw ? tagsRaw.split(/[, ]+/).filter(Boolean) : [];
    const thumbnail = document.getElementById('archiveThumbnailInput')?.value?.trim() || '';

    if (!url) {
        appendMsg(document.getElementById('addArchiveMsg'), 'URLを入力してください');
        return;
    }
    let msgEl = document.getElementById('addArchiveMsg');
    msgEl.textContent = '判定中...';
    try {
        const urlObj = new URL(url);
        const filename = urlObj.pathname.split('/').pop() || url;
        let type = detectTypeFromFilename(filename);

        try {
            const headRes = await fetch(url, { method: 'HEAD' });
            if (headRes.ok) {
                const ct = headRes.headers.get('content-type') || '';
                if (ct.startsWith('image/')) type = 'image';
                else if (ct.startsWith('video/')) type = 'video';
                else if (ct.startsWith('audio/')) type = 'audio';
                else if (ct.includes('gltf') || ct.includes('glb') || ct.includes('model')) type = 'model';
            }
        } catch (e) {
            // HEAD が使えない場合は拡張子ベースで判断
        }

        // 変更: 重複チェック - URL ベースに変更（filename のみではなく URL で判定）
        try {
            const q = await firestore.collection('archive').where('url', '==', url).get();
            if (!q.empty) {
                msgEl.textContent = '同じ URL は既に存在します';
                setTimeout(() => { msgEl.textContent = ''; }, 3000);
                return;
            }
        } catch (e) {
            console.warn('重複チェック失敗', e);
        }

        const newItem = {
            filename,
            url,
            description,
            detail: '',
            author,
            tags,
            type,
            owner: currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (type === 'model' && thumbnail) {
            newItem.thumbnail = thumbnail;
        }

        // Firestore に追加
        const newDocRef = await firestore.collection('archive').add(newItem);
        msgEl.textContent = 'アーカイブに追加しました';
        document.getElementById('archiveUrlInput').value = '';
        document.getElementById('archiveDescInput').value = '';
        document.getElementById('archiveAuthorInput').value = '';
        document.getElementById('archiveTagsInput').value = '';
        document.getElementById('archiveThumbnailInput').value = '';

        // 可能なら contentHash を計算して doc を更新
        (async () => {
            try {
                const h = await computeContentHash(url);
                if (h) await firestore.collection('archive').doc(newDocRef.id).update({ contentHash: h });
            } catch (e) { console.warn('hash update fail', e); }
        })();
    } catch (e) {
        console.error(e);
        msgEl.textContent = '追加に失敗しました';
    }
    setTimeout(() => { msgEl.textContent = ''; }, 3000);
}

// 追加: ファイル名からタイプ判定
function detectTypeFromFilename(filename) {
    const ext = (filename.split('.').pop() || '').toLowerCase();
    if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) return 'image';
    if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'audio';
    if (['glb', 'gltf', 'obj', 'fbx', 'dae'].includes(ext)) return 'model';
    return 'other';
}

// 追加: URL の内容をフェッチして SHA-1 ハッシュ文字列を返す（失敗時は null）
async function computeContentHash(url) {
    try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return null;
        const buf = await res.arrayBuffer();
        const hashBuf = await crypto.subtle.digest('SHA-1', buf);
        const hashArray = Array.from(new Uint8Array(hashBuf));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
        console.warn('computeContentHash error', e);
        return null;
    }
}

// 追加: アーカイブ全件を走査し、contentHash 未設定のものを計算して Firestore に保存する
async function ensureAllHashes(progressCallback) {
    if (!firestore) return;
    const snapshot = await firestore.collection('archive').get();
    const docs = snapshot.docs;
    for (let i = 0; i < docs.length; i++) {
        const d = docs[i];
        const data = d.data();
        if (data && data.contentHash) {
            if (progressCallback) progressCallback(i + 1, docs.length, d.id, 'skip');
            continue;
        }
        if (!data || !data.url) {
            if (progressCallback) progressCallback(i + 1, docs.length, d.id, 'no-url');
            continue;
        }
        if (progressCallback) progressCallback(i + 1, docs.length, d.id, 'hashing');
        const h = await computeContentHash(data.url);
        if (h) {
            try {
                await firestore.collection('archive').doc(d.id).update({ contentHash: h });
                if (progressCallback) progressCallback(i + 1, docs.length, d.id, 'updated');
            } catch (e) {
                console.warn('update contentHash failed', d.id, e);
                if (progressCallback) progressCallback(i + 1, docs.length, d.id, 'fail');
            }
        } else {
            if (progressCallback) progressCallback(i + 1, docs.length, d.id, 'error');
        }
        // 少し待って API 負荷を下げる
        await new Promise(r => setTimeout(r, 200));
    }
}

// 追加: 重複グルーピングを実行して結果を返す
async function findDuplicateGroups() {
    const snapshot = await firestore.collection('archive').get();
    const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    // key: `${contentHash}::${ext}`
    const groups = {};
    docs.forEach(item => {
        const urlOrFilename = item.filename || (item.url ? item.url.split('/').pop() : '');
        const ext = (urlOrFilename.split('.').pop() || '').toLowerCase();
        const key = (item.contentHash || '') + '::' + ext;
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
    });
    // フィルタ: contentHash 空ではグループ化しない／2件未満は不要
    const res = Object.values(groups).filter(g => g.length > 1 && g[0].contentHash);
    return res;
}

// 追加: 重複グループをレンダリング（グループごとに残すアイテムを選んで削除可能）
function renderDuplicateGroups(groups) {
    const container = document.getElementById('duplicateList');
    if (!groups.length) {
        container.innerHTML = '<p style="color:#666;">重複は見つかりませんでした。</p>';
        return;
    }
    container.innerHTML = groups.map((g, idx) => {
        const ext = (g[0].filename || g[0].url || '').split('.').pop();
        const itemsHtml = g.map(it => `<li style="margin-bottom:6px;">
            <strong>${it.id}</strong> — ${it.filename || (it.url || '')} — ${it.description || ''} 
            <button onclick="window._keepOne('${idx}','${it.id}')" style="margin-left:8px;">この件を残す</button>
            </li>`).join('');
        return `<div style="padding:12px; border:1px solid #ddd; margin-bottom:12px; background:#fff;">
            <div style="font-weight:600; margin-bottom:8px;">グループ ${idx + 1} （拡張子: ${ext} / 件数: ${g.length}）</div>
            <ul style="margin:0; padding-left:18px;">${itemsHtml}</ul>
        </div>`;
    }).join('');
}

// 追加: 選んだ id を残して他を削除する（管理者用、確認ダイアログ付き）
window._keepOne = async (groupIndex, keepId) => {
    try {
        const groups = window.__lastDuplicateGroups || [];
        const g = groups[parseInt(groupIndex, 10)];
        if (!g) return alert('グループが見つかりません');
        if (!confirm(`${keepId} を残してその他 ${g.length - 1} 件を削除しますか？この操作は取り消せません。`)) return;
        const deletes = g.filter(it => it.id !== keepId).map(it => firestore.collection('archive').doc(it.id).delete());
        await Promise.all(deletes);
        alert('削除完了');
        // 再検出
        document.getElementById('detectDuplicatesBtn').click();
    } catch (e) {
        console.error('削除失敗', e);
        alert('削除に失敗しました');
    }
};

// DOM イベントバインド: 重複検出ボタン
document.addEventListener('DOMContentLoaded', () => {
    const detBtn = document.getElementById('detectDuplicatesBtn');
    const detMsg = document.getElementById('detectMsg');
    if (detBtn) {
        detBtn.addEventListener('click', async () => {
            detMsg.textContent = '処理中...';
            try {
                // 1) 未ハッシュのものはハッシュ計算して Firestore に保存
                await ensureAllHashes((cur, total, id, status) => {
                    detMsg.textContent = `ハッシュ 計算中: ${cur}/${total} (${status})`;
                });
                detMsg.textContent = 'ハッシュ計算完了。重複抽出中...';
                // 2) 重複を見つけて表示
                const groups = await findDuplicateGroups();
                window.__lastDuplicateGroups = groups; // グローバル保存して操作に使う
                renderDuplicateGroups(groups);
                detMsg.textContent = `重複検出完了（${groups.length} グループ）`;
            } catch (e) {
                console.error('重複検出失敗', e);
                detMsg.textContent = '重複検出に失敗しました';
            }
            setTimeout(() => { detMsg.textContent = ''; }, 3000);
        });
    }
});

// 追加: 管理モードのトグル
function toggleManageControls() {
    showManageControls = !showManageControls;
    const btn = document.getElementById('toggleManageBtn');
    btn.textContent = showManageControls ? '管理モード: 表示中' : '管理モード: 非表示';
    // 再描画
    renderArchiveList(applyArchiveSearch(currentArchiveItems, document.getElementById('archiveSearch').value.trim()));
}

// 追加: 検索処理（単純部分一致）
function applyArchiveSearch(items, q) {
    if (!q) return items;
    const k = q.toLowerCase();
    return (items || []).filter(it => {
        return (it.filename && it.filename.toLowerCase().includes(k)) ||
            (it.description && it.description.toLowerCase().includes(k)) ||
            (Array.isArray(it.tags) && it.tags.join(' ').toLowerCase().includes(k)) ||
            (it.author && it.author.toLowerCase().includes(k));
    });
}

// 追加: アーカイブ一覧を Firestore から取得して表示
async function loadArchiveList() {
    const listDiv = document.getElementById('archiveList');
    const msgEl = document.getElementById('archiveMsg');
    if (!firestore) {
        listDiv.innerHTML = '<p style="color:#999;">Firestore 未接続です。</p>';
        return;
    }
    try {
        msgEl.textContent = '読み込み中...';
        const snap = await firestore.collection('archive').orderBy('createdAt', 'desc').get();
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        currentArchiveItems = items;
        renderArchiveList(items);
        msgEl.textContent = `件数: ${items.length}`;
    } catch (e) {
        console.error('アーカイブ取得失敗', e);
        listDiv.innerHTML = '<p style="color:#f66;">取得に失敗しました。</p>';
        msgEl.textContent = '取得に失敗しました';
    }
}

// 変更: renderArchiveList に編集ボタンを追加し、イベント登録を行うように更新
function renderArchiveList(items) {
    const container = document.getElementById('archiveList');
    if (!items || items.length === 0) {
        container.innerHTML = '<p style="color:#999;">アーカイブはありません。</p>';
        return;
    }
    container.innerHTML = items.map(it => {
        const thumb = it.thumbnail ? (it.thumbnail.startsWith('http') ? it.thumbnail : `/thumbnails/${it.thumbnail}`) : (it.url && it.url.startsWith('http') ? '' : `/thumbnails/${(it.filename || '').replace(/\.[^.]+$/, '.webp')}`);
        const thumbHtml = thumb ? `<img src="${thumb}" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:6px;margin-right:8px;">` : '';
        const meta = `${it.type || ''} ${it.author ? ' / ' + it.author : ''}`;
        const deleteBtn = showManageControls ? `<button data-id="${it.id}" class="archive-delete-btn" style="margin-left:8px;background:#ff6b6b;color:#fff;border:none;padding:6px;border-radius:6px;cursor:pointer;">削除</button>` : '';
        const editBtn = showManageControls ? `<button data-id="${it.id}" class="archive-edit-btn" style="margin-left:8px;background:#1976d2;color:#fff;border:none;padding:6px;border-radius:6px;cursor:pointer;">編集</button>` : '';
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px;border-bottom:1px solid #eee;">
            <div style="display:flex;align-items:center;flex:1;">
                ${thumbHtml}
                <div style="flex:1;">
                    <div style="font-weight:600;">${escapeHtml(it.filename || it.url || '(no-name)')}</div>
                    <div style="font-size:0.9em;color:#666;">${escapeHtml(it.description || '')} <span style="color:#999;margin-left:6px;">${escapeHtml(meta)}</span></div>
                    <div style="font-size:0.85em;color:#888;margin-top:6px;">${(Array.isArray(it.tags) ? it.tags.join(' ') : '')}</div>
                </div>
            </div>
            <div style="margin-left:12px;">${editBtn}${deleteBtn}</div>
        </div>`;
    }).join('');
    // 削除ボタンのイベントを委譲で登録
    container.querySelectorAll('.archive-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = btn.getAttribute('data-id');
            await deleteArchive(id);
        });
    });
    // 編集ボタンのイベント登録
    container.querySelectorAll('.archive-edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = btn.getAttribute('data-id');
            // 現在のアイテムデータを取得してフォームを開く
            const item = currentArchiveItems.find(x => x.id === id);
            if (item) openEditForm(id, item);
        });
    });
}

// 追加: 編集フォームを行下にインライン表示
function openEditForm(id, item) {
    // 既にフォームがあれば閉じる
    const existing = document.getElementById(`edit-form-${id}`);
    if (existing) { existing.remove(); return; }

    const container = document.getElementById('archiveList');
    const btn = container.querySelector(`button.archive-edit-btn[data-id="${id}"]`);
    if (!btn) return;
    let row = btn.closest('div[style*="border-bottom"]');
    if (!row) {
        row = btn.parentElement.parentElement;
    }

    // create form element
    const form = document.createElement('div');
    form.id = `edit-form-${id}`;
    form.style.padding = '8px';
    form.style.border = '1px dashed #ddd';
    form.style.margin = '8px 0 12px 0';
    form.style.background = '#fafafa';

    const author = escapeHtml(item.author || '');
    const tags = Array.isArray(item.tags) ? item.tags.join(', ') : (item.tags || '');
    const desc = escapeHtml(item.description || '');
    const url = escapeHtml(item.url || '');
    const thumbnail = escapeHtml(item.thumbnail || '');

    form.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:6px;">
            <label>説明: <input type="text" name="desc" value="${desc}" style="width:100%; padding:6px;" /></label>
            <label>URL: <input type="text" name="url" value="${url}" style="width:100%; padding:6px;" /></label>
            <label>サムネイル: <input type="text" name="thumbnail" value="${thumbnail}" placeholder="model/image タイプの場合のみ使用" style="width:100%; padding:6px;" /></label>
             <label>著者: <input type="text" name="author" value="${author}" style="width:100%; padding:6px;" /></label>
             <label>タグ（カンマ区切り）: <input type="text" name="tags" value="${escapeHtml(tags)}" style="width:100%; padding:6px;" /></label>
             <div style="display:flex; gap:8px; justify-content:flex-end;">
                 <button id="save-edit-${id}" style="background:#4caf50;color:#fff;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;">保存</button>
                 <button id="cancel-edit-${id}" style="background:#999;color:#fff;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;">キャンセル</button>
             </div>
         </div>
     `;

    // insert after row
    row.parentNode.insertBefore(form, row.nextSibling);

    document.getElementById(`cancel-edit-${id}`).addEventListener('click', () => {
        form.remove();
    });

    document.getElementById(`save-edit-${id}`).addEventListener('click', async () => {
        const newDesc = form.querySelector('input[name="desc"]').value.trim();
        const newUrl = form.querySelector('input[name="url"]').value.trim();
        const newThumbnail = form.querySelector('input[name="thumbnail"]').value.trim();
        const newAuthor = form.querySelector('input[name="author"]').value.trim();
        const tagsRaw = form.querySelector('input[name="tags"]').value.trim();
        const newTags = tagsRaw ? tagsRaw.split(/\s*,\s*/).map(t => t.trim()).filter(Boolean) : [];

        try {
            await firestore.collection('archive').doc(id).update({
                description: newDesc,
                url: newUrl,
                thumbnail: newThumbnail,
                author: newAuthor,
                tags: newTags
            });
            appendMsg(document.getElementById('archiveMsg'), '更新しました');
            // ローカル配列を更新して再描画
            const idx = currentArchiveItems.findIndex(x => x.id === id);
            if (idx >= 0) {
                currentArchiveItems[idx].description = newDesc;
                currentArchiveItems[idx].url = newUrl;
                currentArchiveItems[idx].thumbnail = newThumbnail;
                currentArchiveItems[idx].author = newAuthor;
                currentArchiveItems[idx].tags = newTags;
            }
            form.remove();
            renderArchiveList(applyArchiveSearch(currentArchiveItems, document.getElementById('archiveSearch').value.trim()));
        } catch (e) {
            console.error('更新失敗', e);
            appendMsg(document.getElementById('archiveMsg'), '更新に失敗しました');
        }
    });
}

// 追加: HTML エスケープ（簡易）
function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 追加: アーカイブ削除（管理者のみ）
async function deleteArchive(id) {
    if (!confirm('このアイテムを削除しますか？この操作は取り消せません。')) return;
    try {
        await firestore.collection('archive').doc(id).delete();
        appendMsg(document.getElementById('archiveMsg'), '削除しました');
        // 再読み込み
        await loadArchiveList();
    } catch (e) {
        console.error('削除失敗', e);
        appendMsg(document.getElementById('archiveMsg'), '削除に失敗しました');
    }
}

// 追加: Webサイト追加関数
async function addWebsiteByUrl() {
    if (!currentIsAdmin) {
        appendMsg(document.getElementById('addWebsiteMsg'), '管理者のみ追加可能です');
        return;
    }
    const url = document.getElementById('websiteUrlInput').value.trim();
    const title = document.getElementById('websiteTitleInput')?.value?.trim() || '';
    const description = document.getElementById('websiteDescInput')?.value?.trim() || '';
    const author = document.getElementById('websiteAuthorInput')?.value?.trim() || '';
    const tagsRaw = document.getElementById('websiteTagsInput')?.value?.trim() || '';
    const tags = tagsRaw ? tagsRaw.split(/[, ]+/).filter(Boolean) : [];
    const thumbnail = document.getElementById('websiteThumbnailInput')?.value?.trim() || '';

    if (!url) {
        appendMsg(document.getElementById('addWebsiteMsg'), 'URL を入力してください');
        return;
    }

    let msgEl = document.getElementById('addWebsiteMsg');
    msgEl.textContent = '追加中...';

    try {
        const urlObj = new URL(url);
        const siteName = title || urlObj.hostname || url;

        const newItem = {
            filename: urlObj.hostname,
            url,
            description: description || siteName,
            detail: '',
            author,
            tags,
            type: 'website',
            thumbnail: thumbnail || '',
            owner: currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        // Firestore に追加
        await firestore.collection('archive').add(newItem);
        msgEl.textContent = 'Webサイトを追加しました';
        document.getElementById('websiteUrlInput').value = '';
        document.getElementById('websiteTitleInput').value = '';
        document.getElementById('websiteDescInput').value = '';
        document.getElementById('websiteAuthorInput').value = '';
        document.getElementById('websiteTagsInput').value = '';
        document.getElementById('websiteThumbnailInput').value = '';

    } catch (e) {
        console.error(e);
        msgEl.textContent = '追加に失敗しました';
    }
    setTimeout(() => { msgEl.textContent = ''; }, 3000);
}

window.addEventListener('DOMContentLoaded', async () => {
    await loadFirebaseConfigForAdmin();
    initFirebase();
    // 追加: アーカイブ追加ボタンのイベント
    const addArchiveBtn = document.getElementById('addArchiveBtn');
    if (addArchiveBtn) {
        addArchiveBtn.addEventListener('click', addArchiveByUrl);
    }
    // 追加: Webサイト追加ボタンのイベント
    const addWebsiteBtn = document.getElementById('addWebsiteBtn');
    if (addWebsiteBtn) {
        addWebsiteBtn.addEventListener('click', addWebsiteByUrl);
    }
});
