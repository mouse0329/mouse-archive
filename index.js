let allImages = [];
let allModels = [];

const searchInput = document.getElementById('searchInput');
const error_window = document.getElementById('error_window');
const errorCloseBtn = document.getElementById('error-close');

// テキスト正規化（全角→半角、ひらがな→カタカナ小文字→小文字）
const normalizeText = t =>
    t.normalize('NFKC').toLowerCase().replace(/[ぁ-ん]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60));

const getSearchText = (filename, desc) => normalizeText(desc || filename.replace(/\.[^.]+$/, ''));

// トースト表示
const showToast = (msg, dur = 2000) => {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.style.display = 'block';
    setTimeout(() => (t.style.display = 'none'), dur);
};

// 検索結果件数表示
const showResultCount = c => {
    if (searchInput.value.trim() === '') {
        document.getElementById('resultCount').textContent = '';
        return;
    }
    document.getElementById('resultCount').textContent = `${c}件ヒットしましたチュー！`;
};

// 画像用モーダルを開く
const openImageModal = (filename, description) => {
    const ext = filename.split('.').pop().toUpperCase();
    const url = `${location.origin}/imgs/${filename}`;
    const modal = document.getElementById('modal');
    const imgTypeSelect = document.querySelector('select[name="img-type"]');
    const modalImg = document.getElementById('modal-img');
    const downloadBtn = document.getElementById('download-btn');
    const copyBtn = document.getElementById('copy-btn');

    modalImg.src = url;
    modalImg.alt = filename;
    document.getElementById('modal-caption').textContent = description || filename;

    downloadBtn.href = url;
    downloadBtn.download = filename;

    copyBtn.dataset.url = url;

    // selectの初期値セット
    if (ext === 'WEBP' || ext === 'PNG') {
        imgTypeSelect.value = ext;
    } else {
        imgTypeSelect.value = 'WEBP';
    }

    modal.style.display = 'flex';

    const params = new URLSearchParams(window.location.search);
    params.set('img', filename);
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    history.replaceState(null, '', newUrl);
};

// 画像用モーダルを閉じる
const closeImageModal = () => {
    document.getElementById('modal').style.display = 'none';

    const params = new URLSearchParams(window.location.search);
    params.delete('img');
    const newUrl = params.toString()
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;
    history.replaceState(null, '', newUrl);
    const modalImg = document.getElementById('modal-img');
    modalImg.src = '';
    modalImg.alt = '';
};

// 3Dモデル用モーダルを開く
const openModelModal = (filename, description) => {
    const modelModal = document.getElementById('model-modal');
    const modelViewer = document.getElementById('model-viewer');
    const modelCaption = document.getElementById('model-caption');

    modelViewer.src = `models/${filename}`;
    modelCaption.textContent = description || filename;
    modelModal.style.display = 'flex';

    // URLにモデルパラメータ追加
    const params = new URLSearchParams(window.location.search);
    params.set('model', filename);
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    history.replaceState(null, '', newUrl);
};

// 3Dモデル用モーダルを閉じる
const closeModelModal = () => {
    const modelModal = document.getElementById('model-modal');
    const modelViewer = document.getElementById('model-viewer');

    modelModal.style.display = 'none';
    modelViewer.src = '';

    const params = new URLSearchParams(window.location.search);
    params.delete('model');
    const newUrl = params.toString()
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;
    history.replaceState(null, '', newUrl);
};

// 画像とモデル一覧を描画する関数
const renderItems = items => {
    const container = document.getElementById('imgContainer');
    container.innerHTML = '';

    items.forEach(({ type, filename, description, thumbnail }) => {
        const div = document.createElement('div');
        div.className = 'img-item';
        div.style.display = 'inline-block';
        div.style.margin = '10px';
        div.style.textAlign = 'center';
        div.style.cursor = 'pointer';
        div.style.width = '200px';

        if (type === 'image') {
            const img = document.createElement('img');
            img.src = `imgs/${filename}`;
            img.alt = description || filename;
            img.loading = 'lazy';
            img.style.width = '200px';
            img.style.height = '200px';
            img.style.objectFit = 'contain';

            const cap = document.createElement('p');
            cap.textContent = description || filename;

            div.append(img, cap);

            div.addEventListener('click', () => {
                openImageModal(filename, description);
            });
        } else if (type === 'model') {
            const img = document.createElement('img');
            // 修正：items.thumbnail → thumbnail
            img.src = `thumbnails/${thumbnail || filename.replace(/\.[^.]+$/, '.webp')}`;
            img.alt = description || filename;
            img.loading = 'lazy';
            img.style.width = '200px';
            img.style.height = '200px';
            img.style.objectFit = 'contain';

            const cap = document.createElement('p');
            cap.textContent = description || filename;

            div.append(img, cap);

            div.addEventListener('click', () => {
                openModelModal(filename, description);
            });
        }

        container.appendChild(div);
    });
};

const getQueryParam = key => {
    const params = new URLSearchParams(window.location.search);
    return params.get(key) || '';
};

const setQueryParam = (key, value) => {
    const params = new URLSearchParams(window.location.search);
    if (value) {
        params.set(key, value);
    } else {
        params.delete(key);
    }
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    history.replaceState(null, '', newUrl);
};

const loadImages = async () => {
    try {
        const res = await fetch('/imgindex.json');
        if (!res.ok) throw new Error('画像読み込み失敗チュー');
        const list = await res.json();
        allImages = list.map(item => ({ ...item, type: 'image' }));
    } catch {
        console.error('画像の読み込みに失敗チュー');
        error_window.style.display = 'flex';
        document.getElementById('error-message').innerHTML = '画像の読み込みに失敗しました。';
    }
};

const loadModels = async () => {
    try {
        const res = await fetch('/modelindex.json');
        if (!res.ok) throw new Error('モデル読み込み失敗チュー');
        const list = await res.json();
        allModels = list.map(item => ({ ...item, type: 'model' }));
    } catch {
        console.error('モデルの読み込みに失敗チュー');
        error_window.style.display = 'flex';
        document.getElementById('error-message').innerHTML = 'モデルの読み込みに失敗しました。';
    }
};

const restoreSearchFromURL = () => {
    const query = getQueryParam('q');
    const allItems = [...allImages, ...allModels];
    if (query) {
        searchInput.value = query;
        searchInput.dispatchEvent(new Event('input'));
    } else {
        showResultCount(allItems.length);
        renderItems(allItems);
    }
};

const restoreModalFromURL = () => {
    const img = getQueryParam('img');
    if (img && allImages.length) {
        const found = allImages.find(({ filename }) => filename === img);
        if (found) {
            openImageModal(found.filename, found.description);
        } else {
            error_window.style.display = 'flex';
            document.getElementById('error-message').innerHTML = 'URLパラメーターに誤りがあります。';
        }
    }
    const model = getQueryParam('model');
    if (model && allModels.length) {
        const foundModel = allModels.find(({ filename }) => filename === model);
        if (foundModel) {
            openModelModal(foundModel.filename, foundModel.description);
        } else {
            error_window.style.display = 'flex';
            document.getElementById('error-message').innerHTML = 'URLパラメーターに誤りがあります。';
        }
    }
};
// エラーメッセージウィンドウを閉じる
errorCloseBtn.addEventListener('click', () => {
    error_window.style.display = 'none';
});
error_window.addEventListener('click', e => {
    if (e.target === error_window) error_window.style.display = 'none';
});

// 画像モーダルのselectで画像形式切り替え対応チュー
const imgTypeSelect = document.querySelector('select[name="img-type"]');
imgTypeSelect.addEventListener('change', () => {
    const selectedType = imgTypeSelect.value.toLowerCase(); // 'webp' or 'png'
    const modalImg = document.getElementById('modal-img');
    const downloadBtn = document.getElementById('download-btn');
    const copyBtn = document.getElementById('copy-btn');

    const currentFilename = downloadBtn.download || modalImg.alt || '';
    if (!currentFilename) return;

    const baseName = currentFilename.replace(/\.[^.]+$/, '');
    const newFilename = `${baseName}.${selectedType}`;
    const newUrl = `${location.origin}/imgs/${newFilename}`;

    modalImg.src = newUrl;
    modalImg.alt = newFilename;

    downloadBtn.href = newUrl;
    downloadBtn.download = newFilename;

    copyBtn.dataset.url = newUrl;
});

// コピーURLボタン
document.getElementById('copy-btn').addEventListener('click', () => {
    const url = document.getElementById('copy-btn').dataset.url;
    navigator.clipboard.writeText(url)
        .then(() => showToast('コピーしましたチュー！'))
        .catch(() => showToast('コピーに失敗したチュー…'));
});

// モーダル閉じるボタン
document.getElementById('modal-close').addEventListener('click', closeImageModal);
document.getElementById('modal').addEventListener('click', e => {
    if (e.target.id === 'modal') closeImageModal();
});
document.getElementById('model-close').addEventListener('click', closeModelModal);
document.getElementById('model-modal').addEventListener('click', e => {
    if (e.target.id === 'model-modal') closeModelModal();
});

// 検索機能
searchInput.addEventListener('input', e => {
    const rawInput = e.target.value.trim();
    const input = normalizeText(rawInput);
    setQueryParam('q', rawInput);

    const allItems = [...allImages, ...allModels];

    if (!input) {
        showResultCount(allItems.length);
        renderItems(allItems);
        return;
    }

    let filtered = [];
    if (/(\s|^)or(\s|$)/i.test(input)) {
        const orKeys = input.split(/\s+or\s+/i).map(k => k.trim());
        filtered = allItems.filter(({ filename, description }) =>
            orKeys.some(k => getSearchText(filename, description).includes(k))
        );
    } else {
        const andKeys = input.split(/\s+/);
        filtered = allItems.filter(({ filename, description }) =>
            andKeys.every(k => getSearchText(filename, description).includes(k))
        );
    }

    showResultCount(filtered.length);
    if (filtered.length) {
        renderItems(filtered);
    } else {
        document.getElementById('imgContainer').innerHTML = `
      <p>
        <img src="imgs/404.webp" alt="404画像" style="width:60%;margin:20px auto;display:block;border-radius:10px;box-shadow:0 4px 10px rgba(0,0,0,0.1);">
        <br>該当するデータはありませんチュー…
      </p>`;
    }
});

// タイトルクリックでリセット
document.getElementById("main-title").addEventListener("click", () => {
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input'));
    setQueryParam('q', '');
    closeImageModal();
    closeModelModal();
    history.replaceState(null, '', window.location.pathname);
});

// 最後に全部ロードチュー
Promise.all([loadImages(), loadModels()]).then(() => {
    restoreSearchFromURL();
    restoreModalFromURL();
});
