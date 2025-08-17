let allImages = [];
let allModels = [];
let allVideos = []; // 動画用

const searchInput = document.getElementById('searchInput');
const error_window = document.getElementById('error_window');
const errorCloseBtn = document.getElementById('error-close');

// テキスト正規化（全角→半角、ひらがな→カタカナ小文字→小文字）
const normalizeText = t =>
    t.normalize('NFKC').toLowerCase().replace(/[ぁ-ん]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60));

const getSearchText = (filename, desc, detail, author) =>
    normalizeText(
        (desc || filename.replace(/\.[^.]+$/, '')) +
        (detail ? ' ' + detail : '') +
        (author ? ' ' + author : '')
    );

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

// タグ表示用ユーティリティ
const renderTags = (tags) => {
    if (!Array.isArray(tags) || tags.length === 0) return '';
    return tags.map(tag => `<a href="#" class="modal-tag" data-tag="${tag}">${tag}</a>`).join(' ');
};

// モーダルタグクリックで検索
document.addEventListener('click', function (e) {
    if (e.target.classList.contains('modal-tag')) {
        e.preventDefault();
        const tag = e.target.dataset.tag;
        searchInput.value = tag;
        searchInput.dispatchEvent(new Event('input'));
        setQueryParam('q', tag);
        // モーダル閉じる
        closeImageModal();
        closeModelModal();
        closeVideoModal();
    }
});

// 画像用モーダルを開く
const openImageModal = (filename, description, detail, author, tags) => {
    const ext = filename.split('.').pop().toUpperCase();
    const url = `${location.origin}/imgs/${filename}`;
    const modal = document.getElementById('modal');
    const imgTypeSelect = document.querySelector('select[name="img-type"]');
    const modalImg = document.getElementById('modal-img');
    const downloadBtn = document.getElementById('download-btn');
    const copyBtn = document.getElementById('img-copy-btn');

    modalImg.src = url;
    modalImg.alt = filename;
    document.getElementById('modal-caption').textContent = description || filename;
    // detail表示
    const modalDetail = document.getElementById('modal-detail');
    if (modalDetail) {
        modalDetail.textContent = detail || '';
        modalDetail.style.display = detail ? 'block' : 'none';
    }
    // author表示
    const modalAuthor = document.getElementById('modal-author');
    if (modalAuthor) {
        modalAuthor.textContent = author ? `by ${author}` : '';
        modalAuthor.style.display = author ? 'block' : 'none';
    }
    // タグ表示
    const modalTags = document.getElementById('modal-tags');
    if (modalTags) {
        modalTags.innerHTML = renderTags(tags);
        modalTags.style.display = (tags && tags.length) ? 'block' : 'none';
    }

    downloadBtn.href = url;
    downloadBtn.download = filename;

    copyBtn.dataset.url = location.origin + "/viewer.html" + `?img=${filename}`;

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
const openModelModal = (filename, description, detail, author, tags) => {
    const modelModal = document.getElementById('model-modal');
    const modelViewer = document.getElementById('model-viewer');
    const modelCaption = document.getElementById('model-caption');
    const modelCopyBtn = document.getElementById('model-copy-btn');

    modelViewer.src = `models/${filename}`;
    modelCaption.textContent = description || filename;
    modelCopyBtn.dataset.url = location.origin + "/viewer.html" + `?model=${filename}`;

    // detail表示
    const modelDetail = document.getElementById('model-detail');
    if (modelDetail) {
        modelDetail.textContent = detail || '';
        modelDetail.style.display = detail ? 'block' : 'none';
    }
    // author表示
    const modelAuthor = document.getElementById('model-author');
    if (modelAuthor) {
        modelAuthor.textContent = author ? `by ${author}` : '';
        modelAuthor.style.display = author ? 'block' : 'none';
    }
    // タグ表示
    const modelTags = document.getElementById('model-tags');
    if (modelTags) {
        modelTags.innerHTML = renderTags(tags);
        modelTags.style.display = (tags && tags.length) ? 'block' : 'none';
    }
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

// 動画用モーダルを開く
const openVideoModal = (filename, description, detail, author, tags) => {
    const videoModal = document.getElementById('video-modal');
    const videoPlayer = document.getElementById('video-player');
    const videoCaption = document.getElementById('video-caption');
    const videoCopyBtn = document.getElementById('video-copy-btn');

    videoPlayer.src = `videos/${filename}`;
    videoCaption.textContent = description || filename;
    videoCopyBtn.dataset.url = location.origin + "/viewer.html" + `?video=${filename}`;

    // detail表示
    const videoDetail = document.getElementById('video-detail');
    if (videoDetail) {
        videoDetail.textContent = detail || '';
        videoDetail.style.display = detail ? 'block' : 'none';
    }
    // author表示
    const videoAuthor = document.getElementById('video-author');
    if (videoAuthor) {
        videoAuthor.textContent = author ? `by ${author}` : '';
        videoAuthor.style.display = author ? 'block' : 'none';
    }
    // タグ表示
    const videoTags = document.getElementById('video-tags');
    if (videoTags) {
        videoTags.innerHTML = renderTags(tags);
        videoTags.style.display = (tags && tags.length) ? 'block' : 'none';
    }
    videoModal.style.display = 'flex';

    // URLに動画パラメータ追加
    const params = new URLSearchParams(window.location.search);
    params.set('video', filename);
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    history.replaceState(null, '', newUrl);
};

// 動画用モーダルを閉じる
const closeVideoModal = () => {
    const videoModal = document.getElementById('video-modal');
    const videoPlayer = document.getElementById('video-player');

    videoModal.style.display = 'none';
    videoPlayer.src = '';

    const params = new URLSearchParams(window.location.search);
    params.delete('video');
    const newUrl = params.toString()
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;
    history.replaceState(null, '', newUrl);
};

// 画像・モデル・動画一覧を描画
const renderItems = items => {
    const container = document.getElementById('imgContainer');
    container.innerHTML = '';

    items.forEach(({ type, filename, description, thumbnail, detail, author, tags }) => {
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

            // detail表示（必ず作成）
            const det = document.createElement('div');
            det.className = 'item-detail';
            det.textContent = detail || '';
            det.style.fontSize = '0.9em';
            det.style.color = '#666';
            det.style.marginTop = '4px';
            div.appendChild(det);

            // author表示（必ず作成）
            const aut = document.createElement('div');
            aut.className = 'item-author';
            aut.textContent = author ? `by ${author}` : '';
            aut.style.fontSize = '0.8em';
            aut.style.color = '#999';
            aut.style.marginTop = '2px';
            div.appendChild(aut);

            // タグ表示（カード用）
            const tagDiv = document.createElement('div');
            tagDiv.className = 'item-tags';
            tagDiv.style.marginTop = '4px';
            tagDiv.innerHTML = renderTags(tags);
            div.appendChild(tagDiv);

            div.addEventListener('click', () => {
                openImageModal(filename, description, detail, author, tags);
            });
        } else if (type === 'model') {
            const img = document.createElement('img');
            img.src = `thumbnails/${thumbnail || filename.replace(/\.[^.]+$/, '.webp')}`;
            img.alt = description || filename;
            img.loading = 'lazy';
            img.style.width = '200px';
            img.style.height = '200px';
            img.style.objectFit = 'contain';

            const cap = document.createElement('p');
            cap.textContent = description || filename;
            div.append(img, cap);

            // detail表示（必ず作成）
            const det = document.createElement('div');
            det.className = 'item-detail';
            det.textContent = detail || '';
            det.style.fontSize = '0.9em';
            det.style.color = '#666';
            det.style.marginTop = '4px';
            div.appendChild(det);

            // author表示（必ず作成）
            const aut = document.createElement('div');
            aut.className = 'item-author';
            aut.textContent = author ? `by ${author}` : '';
            aut.style.fontSize = '0.8em';
            aut.style.color = '#999';
            aut.style.marginTop = '2px';
            div.appendChild(aut);

            // タグ表示（カード用）
            const tagDiv = document.createElement('div');
            tagDiv.className = 'item-tags';
            tagDiv.style.marginTop = '4px';
            tagDiv.innerHTML = renderTags(tags);
            div.appendChild(tagDiv);

            div.addEventListener('click', () => {
                openModelModal(filename, description, detail, author, tags);
            });
        } else if (type === 'video') {
            const video = document.createElement('video');
            video.src = `videos/${filename}`;
            video.alt = description || filename;
            video.style.width = '200px';
            video.style.height = '200px';
            video.style.objectFit = 'contain';
            video.controls = false;
            video.muted = true;
            video.loop = true;
            video.autoplay = true;

            const cap = document.createElement('p');
            cap.textContent = description || filename;
            div.append(video, cap);

            // detail表示（必ず作成）
            const det = document.createElement('div');
            det.className = 'item-detail';
            det.textContent = detail || '';
            det.style.fontSize = '0.9em';
            det.style.color = '#666';
            det.style.marginTop = '4px';
            div.appendChild(det);

            // author表示（必ず作成）
            const aut = document.createElement('div');
            aut.className = 'item-author';
            aut.textContent = author ? `by ${author}` : '';
            aut.style.fontSize = '0.8em';
            aut.style.color = '#999';
            aut.style.marginTop = '2px';
            div.appendChild(aut);

            // タグ表示（カード用）
            const tagDiv = document.createElement('div');
            tagDiv.className = 'item-tags';
            tagDiv.style.marginTop = '4px';
            tagDiv.innerHTML = renderTags(tags);
            div.appendChild(tagDiv);

            div.addEventListener('click', () => {
                openVideoModal(filename, description, detail, author, tags);
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

const loadVideos = async () => {
    try {
        const res = await fetch('/videoindex.json');
        if (!res.ok) throw new Error('動画読み込み失敗チュー');
        const list = await res.json();
        allVideos = Array.isArray(list) ? list.map(item => ({ ...item, type: 'video' })) : [];
    } catch {
        console.error('動画の読み込みに失敗チュー');
        error_window.style.display = 'flex';
        document.getElementById('error-message').innerHTML = '動画の読み込みに失敗しました。';
    }
};

const restoreSearchFromURL = () => {
    const query = getQueryParam('q');
    const allItems = [...allImages, ...allModels, ...allVideos];
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
            openImageModal(
                found.filename,
                found.description,
                found.detail,
                found.author,
                found.tags || []
            );
        } else {
            error_window.style.display = 'flex';
            document.getElementById('error-message').innerHTML = 'URLパラメーターに誤りがあります。';
        }
    }
    const model = getQueryParam('model');
    if (model && allModels.length) {
        const foundModel = allModels.find(({ filename }) => filename === model);
        if (foundModel) {
            openModelModal(
                foundModel.filename,
                foundModel.description,
                foundModel.detail,
                foundModel.author,
                foundModel.tags || []
            );
        } else {
            error_window.style.display = 'flex';
            document.getElementById('error-message').innerHTML = 'URLパラメーターに誤りがあります。';
        }
    }
    const video = getQueryParam('video');
    if (video && allVideos.length) {
        const foundVideo = allVideos.find(({ filename }) => filename === video);
        if (foundVideo) {
            openVideoModal(
                foundVideo.filename,
                foundVideo.description,
                foundVideo.detail,
                foundVideo.author,
                foundVideo.tags || []
            );
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
    const copyBtn = document.getElementById('img-copy-btn');

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
document.getElementById('img-copy-btn').addEventListener('click', () => {
    const url = document.getElementById('img-copy-btn').dataset.url;
    navigator.clipboard.writeText(url)
        .then(() => showToast('コピーしましたチュー！'))
        .catch(() => showToast('コピーに失敗したチュー…'));
});
document.getElementById('model-copy-btn').addEventListener('click', () => {
    const url = document.getElementById('model-copy-btn').dataset.url;
    navigator.clipboard.writeText(url)
        .then(() => showToast('コピーしましたチュー！'))
        .catch(() => showToast('コピーに失敗したチュー…'));
});
document.getElementById('video-copy-btn').addEventListener('click', () => {
    const url = document.getElementById('video-copy-btn').dataset.url;
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
document.getElementById('video-close').addEventListener('click', closeVideoModal);
document.getElementById('video-modal').addEventListener('click', e => {
    if (e.target.id === 'video-modal') closeVideoModal();
});

// 検索機能
searchInput.addEventListener('input', e => {
    searchAndFilter();
});

const searchAndFilter = () => {
    const rawInput = searchInput.value.trim();
    const input = normalizeText(rawInput);
    setQueryParam('q', rawInput);

    const allItems = [...allImages, ...allModels, ...allVideos];

    if (!input) {
        showResultCount(allItems.length);
        renderItems(allItems);
        return;
    }

    let filtered = [];
    // タイプ検索対応
    if (input === '@動画') {
        filtered = allItems.filter(item => item.type === 'video');
    } else if (input === '@画像') {
        filtered = allItems.filter(item => item.type === 'image');
    } else if (input === '@3d' || input === '@３ｄ') {
        filtered = allItems.filter(item => item.type === 'model');
    }
    // タグ検索対応
    else if (input.startsWith('#')) {
        const tagKey = input;
        filtered = allItems.filter(({ tags, detail }) =>
            (Array.isArray(tags) && tags.some(t => normalizeText(t) === normalizeText(tagKey))) ||
            (detail && detail.includes(tagKey))
        );
    } else if (/(\s|^)or(\s|$)/i.test(input)) {
        const orKeys = input.split(/\s+or\s+/i).map(k => k.trim());
        filtered = allItems.filter(({ filename, description, tags, detail, author }) =>
            orKeys.some(k =>
                getSearchText(filename, description, detail, author).includes(k) ||
                (Array.isArray(tags) && tags.some(t => normalizeText(t).includes(k)))
            )
        );
    } else {
        const andKeys = input.split(/\s+/);
        filtered = allItems.filter(({ filename, description, tags, detail, author }) =>
            andKeys.every(k =>
                getSearchText(filename, description, detail, author).includes(k) ||
                (Array.isArray(tags) && tags.some(t => normalizeText(t).includes(k)))
            )
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
}

// タイトルクリックでリセット
document.getElementById("main-title").addEventListener("click", () => {
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input'));
    setQueryParam('q', '');
    closeImageModal();
    closeModelModal();
    closeVideoModal();
    history.replaceState(null, '', window.location.pathname);
});

// 最後に全部ロードチュー
Promise.all([loadImages(), loadModels(), loadVideos()]).then(() => {
    restoreSearchFromURL();
    restoreModalFromURL();
});
Promise.all([loadImages(), loadModels(), loadVideos()]).then(() => {
    restoreSearchFromURL();
    restoreModalFromURL();
});
