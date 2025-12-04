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
const showToast = (msg, dur = 2000, c) => {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.style.display = 'block';
    t.style.backgroundColor = c || 'black';
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
const openImageModal = (filename, description, detail, author, tags, url) => {
    const modal = document.getElementById('modal');
    const modalImg = document.getElementById('modal-img');
    const downloadBtn = document.getElementById('download-btn');
    const copyBtn = document.getElementById('img-copy-btn');
    const imgTypeSelect = document.querySelector('select[name="img-type"]');

    // 画像URL作成（item.url を優先）
    let srcUrl = url || `${location.origin}/imgs/${filename}`;

    // select 有効/無効制御（外部URLならフォーマット切替不可にする）
    if (imgTypeSelect) {
        imgTypeSelect.disabled = !!(url && !url.startsWith(location.origin + '/imgs/'));
        // selectにSVG追加（未追加なら）
        if (!imgTypeSelect.disabled && !Array.from(imgTypeSelect.options).some(o => o.value === 'SVG')) {
            ['WEBP', 'PNG', 'SVG'].forEach(type => {
                const opt = document.createElement('option');
                opt.value = type;
                opt.textContent = type;
                imgTypeSelect.appendChild(opt);
            });
        }
    }

    // 画像読み込みエラー時に代替画像表示
    modalImg.onerror = () => {
        modalImg.src = `${location.origin}/imgs/404.webp`;
        modalImg.alt = '代替画像';
        downloadBtn.href = '#';
        downloadBtn.download = '';
        copyBtn.dataset.url = '';
        showToast('画像が見つかりません…', 2000, '#f66');
    };

    modalImg.src = srcUrl;
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

    downloadBtn.href = srcUrl;
    downloadBtn.download = filename;
    copyBtn.dataset.url = srcUrl;

    // お気に入りボタン生成
    let favBtn = document.getElementById('modal-fav-btn');
    if (!favBtn) {
        favBtn = document.createElement('button');
        favBtn.id = 'modal-fav-btn';
        favBtn.style.margin = '8px 0';
        favBtn.style.border = 'none';
        favBtn.style.borderRadius = '6px';
        favBtn.style.padding = '6px 16px';
        favBtn.style.cursor = 'pointer';
        const modalContent = document.getElementById('modal-content');
        modalContent.insertBefore(favBtn, modalContent.firstChild);
    }
    updateModalFavorite('image', filename, description);

    // select初期値設定（ローカルパスの場合みのみ）
    const ext = filename.split('.').pop().toUpperCase();
    if (!imgTypeSelect.disabled) {
        if (['WEBP', 'PNG', 'SVG'].includes(ext)) {
            imgTypeSelect.value = ext;
        } else {
            imgTypeSelect.value = 'WEBP';
        }
    }

    // select変更時の処理（ローカルパスのみ）
    imgTypeSelect.onchange = () => {
        if (imgTypeSelect.disabled) return;
        const selectedType = imgTypeSelect.value.toLowerCase();
        const baseName = filename.replace(/\.[^.]+$/, '');
        const newFilename = `${baseName}.${selectedType}`;
        const newUrl = `${location.origin}/imgs/${newFilename}`;

        modalImg.src = newUrl;
        modalImg.alt = newFilename;

        downloadBtn.href = newUrl;
        downloadBtn.download = newFilename;
        copyBtn.dataset.url = newUrl;
    };

    modal.style.display = 'flex';

    // URLパラメータ追加
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
const openModelModal = (filename, description, detail, author, tags, url) => {
    const modelModal = document.getElementById('model-modal');
    const modelViewer = document.getElementById('model-viewer');
    const modelCaption = document.getElementById('model-caption');
    const modelCopyBtn = document.getElementById('model-copy-btn');
    const modelDownloadBtn = document.getElementById('model-download-btn');
    const modelOtherViewer = document.getElementById('model-other-viewer');

    const srcUrl = url || `${location.origin}/models/${filename}`;

    // 別のビュワーリンク設定
    if (modelOtherViewer) {
        const modelPath = url || `/models/${filename}`;
        modelOtherViewer.href = `mouse-3d-anime/index.html?model=${modelPath}`;
    }

    modelViewer.src = srcUrl;
    modelCaption.textContent = description || filename;
    modelCopyBtn.dataset.url = srcUrl || (location.origin + "/viewer.html" + `?model=${filename}`);
    // ダウンロードボタン設定
    if (modelDownloadBtn) {
        modelDownloadBtn.href = srcUrl;
        modelDownloadBtn.download = filename;
    }

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
    // お気に入りボタン生成・設置
    let favBtn = document.getElementById('model-fav-btn');
    if (!favBtn) {
        favBtn = document.createElement('button');
        favBtn.id = 'model-fav-btn';
        favBtn.style.margin = '8px 0';
        favBtn.style.border = 'none';
        favBtn.style.borderRadius = '6px';
        favBtn.style.padding = '6px 16px';
        favBtn.style.cursor = 'pointer';
        const modalDiv = document.querySelector('#model-modal > div');
        modalDiv.insertBefore(favBtn, modalDiv.firstChild);
    }
    updateModalFavorite('model', filename, description);

    modelModal.style.display = 'flex';

    // URLにモデルパラメータ追加（クエリは filename のみ保持）
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
const openVideoModal = (filename, description, detail, author, tags, url) => {
    const videoModal = document.getElementById('video-modal');
    const videoPlayer = document.getElementById('video-player');
    const videoCaption = document.getElementById('video-caption');
    const videoCopyBtn = document.getElementById('video-copy-btn');
    const videoDownloadBtn = document.getElementById('video-download-btn');

    const srcUrl = url || `videos/${filename}`;

    videoPlayer.src = srcUrl;
    videoCaption.textContent = description || filename;
    videoCopyBtn.dataset.url = srcUrl || (location.origin + "/viewer.html" + `?video=${filename}`);
    // ダウンロードボタン設定
    if (videoDownloadBtn) {
        videoDownloadBtn.href = srcUrl;
        videoDownloadBtn.download = filename;
    }

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
    // お気に入りボタン生成・設置
    let favBtn = document.getElementById('video-fav-btn');
    if (!favBtn) {
        favBtn = document.createElement('button');
        favBtn.id = 'video-fav-btn';
        favBtn.style.margin = '8px 0';
        favBtn.style.border = 'none';
        favBtn.style.borderRadius = '6px';
        favBtn.style.padding = '6px 16px';
        favBtn.style.cursor = 'pointer';
        const modalDiv = document.querySelector('#video-modal > div');
        modalDiv.insertBefore(favBtn, modalDiv.firstChild);
    }
    updateModalFavorite('video', filename, description);

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

// 追加: Webサイト用モーダルを開く
const openWebsiteModal = (filename, description, detail, author, tags, url, thumbnail) => {
    const modal = document.getElementById('website-modal');
    const img = document.getElementById('website-img');
    const caption = document.getElementById('website-caption');
    const detailDiv = document.getElementById('website-detail');
    const authorDiv = document.getElementById('website-author');
    const tagsDiv = document.getElementById('website-tags');
    const linkBtn = document.getElementById('website-link-btn');
    const copyBtn = document.getElementById('website-copy-btn');

    // サムネイル設定
    const src = thumbnail || `${location.origin}/imgs/web-icon.webp`;
    img.src = src;
    img.alt = description || filename;

    // キャプション・説明・著者・タグ
    caption.textContent = description || filename;
    detailDiv.textContent = detail || '';
    detailDiv.style.display = detail ? 'block' : 'none';
    authorDiv.textContent = author ? `by ${author}` : '';
    authorDiv.style.display = author ? 'block' : 'none';
    tagsDiv.innerHTML = renderTags(tags);
    tagsDiv.style.display = (tags && tags.length) ? 'block' : 'none';

    // リンク・コピーボタン設定
    linkBtn.href = url;
    copyBtn.dataset.url = url;

    // お気に入りボタン生成・設置
    let favBtn = document.getElementById('website-fav-btn');
    if (!favBtn) {
        favBtn = document.createElement('button');
        favBtn.id = 'website-fav-btn';
        favBtn.style.margin = '8px 0';
        favBtn.style.border = 'none';
        favBtn.style.borderRadius = '6px';
        favBtn.style.padding = '6px 16px';
        favBtn.style.cursor = 'pointer';
    }
    updateModalFavorite('website', filename, description);

    // URLパラメータ追加
    const params = new URLSearchParams(window.location.search);
    params.set('website', filename);
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    history.replaceState(null, '', newUrl);

    modal.style.display = 'flex';
};

// 追加: Webサイト用モーダルを閉じる
const closeWebsiteModal = () => {
    const modal = document.getElementById('website-modal');
    modal.style.display = 'none';

    const params = new URLSearchParams(window.location.search);
    params.delete('website');
    const newUrl = params.toString()
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;
    history.replaceState(null, '', newUrl);
};

// お気に入り管理
const FAVORITE_KEY = 'mouse_archive_favorites';
const getFavorites = () => {
    try {
        return JSON.parse(localStorage.getItem(FAVORITE_KEY)) || [];
    } catch {
        return [];
    }
};
const setFavorites = (arr) => {
    localStorage.setItem(FAVORITE_KEY, JSON.stringify(arr));
};
const isFavorite = (type, filename) => {
    const favs = getFavorites();
    return favs.some(f => f.type === type && f.filename === filename);
};
const toggleFavorite = (type, filename, description) => {
    let favs = getFavorites();
    if (isFavorite(type, filename)) {
        favs = favs.filter(f => !(f.type === type && f.filename === filename));
        showToast('お気に入り解除しました', 1200, '#666');
    } else {
        favs.push({ type, filename, description });
        showToast('お気に入り追加しました', 1200, '#f90');
    }
    setFavorites(favs);
    updateModalFavorite(type, filename, description);
};

// モーダル内お気に入りボタンの状態更新
function updateModalFavorite(type, filename, description) {
    let favBtn;
    if (type === 'image') {
        favBtn = document.getElementById('modal-fav-btn');
    } else if (type === 'model') {
        favBtn = document.getElementById('model-fav-btn');
    } else if (type === 'video') {
        favBtn = document.getElementById('video-fav-btn');
    } else if (type === 'website') {
        favBtn = document.getElementById('website-fav-btn');
    }
    if (!favBtn) return;
    favBtn.textContent = isFavorite(type, filename) ? '★お気に入り' : '☆お気に入り';
    favBtn.style.background = isFavorite(type, filename) ? '#ffe066' : '#eee';
    favBtn.onclick = () => toggleFavorite(type, filename, description);
}

// 画像・モデル・動画一覧を描画（url を優先して使うように変更）
const renderItems = items => {
    const container = document.getElementById('imgContainer');
    container.innerHTML = '';

    items.forEach(({ type, filename, description, thumbnail, detail, author, tags, url }) => {
        const div = document.createElement('div');
        div.className = 'img-item';
        div.style.display = 'inline-block';
        div.style.margin = '10px';
        div.style.textAlign = 'center';
        div.style.cursor = 'pointer';
        div.style.width = '200px';

        if (type === 'image') {
            const src = url || `imgs/${filename}`;
            const img = document.createElement('img');
            img.src = src;
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
                openImageModal(filename, description, detail, author, tags, url);
            });
        } else if (type === 'model') {
            // サムネイル URL: 外部URLなら thumbnail をそのまま使用、ローカルなら /thumbnails/{filename}.webp
            let src;
            if (url && url.startsWith('http')) {
                // 外部URL の場合: thumbnail フィールドがあればそれを使用
                src = thumbnail || url.replace(/\.[^.]+$/, '.webp');
            } else {
                // ローカルパスの場合: /thumbnails/{filename}.webp
                src = thumbnail ? `${location.origin}/thumbnails/${thumbnail}` : `${location.origin}/thumbnails/${filename.replace(/\.[^.]+$/, '.webp')}`;
            }

            const img = document.createElement('img');
            img.src = src;
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
                openModelModal(filename, description, detail, author, tags, url);
            });
        } else if (type === 'video') {
            const src = url || `videos/${filename}`;
            const video = document.createElement('video');
            video.src = src;
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
                openVideoModal(filename, description, detail, author, tags, url);
            });
        } else if (type === 'audio') {
            // 新規: audio タイプの表示
            const src = url || `videos/${filename}`;
            const audio = document.createElement('audio');
            audio.src = src;
            audio.controls = true;
            audio.style.width = '200px';
            audio.style.height = '40px';
            div.appendChild(audio);

            const cap = document.createElement('p');
            cap.textContent = description || filename;
            div.appendChild(cap);

            // detail / author / tags（既存と同様）
            const det = document.createElement('div');
            det.className = 'item-detail';
            det.textContent = detail || '';
            det.style.fontSize = '0.9em';
            det.style.color = '#666';
            det.style.marginTop = '4px';
            div.appendChild(det);

            const aut = document.createElement('div');
            aut.className = 'item-author';
            aut.textContent = author ? `by ${author}` : '';
            aut.style.fontSize = '0.8em';
            aut.style.color = '#999';
            aut.style.marginTop = '2px';
            div.appendChild(aut);

            const tagDiv = document.createElement('div');
            tagDiv.className = 'item-tags';
            tagDiv.style.marginTop = '4px';
            tagDiv.innerHTML = renderTags(tags);
            div.appendChild(tagDiv);

            div.addEventListener('click', () => {
                // audio は専用モーダル未実装のため、再生を優先 or 外部リンク表示
                if (url) {
                    window.open(url, '_blank', 'noopener');
                }
            });
        } else if (type === 'website') {
            // Webサイト表示（モーダル式）
            const src = thumbnail || `${location.origin}/imgs/web-icon.webp`;
            const img = document.createElement('img');
            img.src = src;
            img.alt = description || filename;
            img.loading = 'lazy';
            img.style.width = '200px';
            img.style.height = '200px';
            img.style.objectFit = 'contain';

            const cap = document.createElement('p');
            cap.textContent = description || filename;
            div.append(img, cap);

            // detail表示
            const det = document.createElement('div');
            det.className = 'item-detail';
            det.textContent = detail || '';
            det.style.fontSize = '0.9em';
            det.style.color = '#666';
            det.style.marginTop = '4px';
            div.appendChild(det);

            // author表示
            const aut = document.createElement('div');
            aut.className = 'item-author';
            aut.textContent = author ? `by ${author}` : '';
            aut.style.fontSize = '0.8em';
            aut.style.color = '#999';
            aut.style.marginTop = '2px';
            div.appendChild(aut);

            // タグ表示
            const tagDiv = document.createElement('div');
            tagDiv.className = 'item-tags';
            tagDiv.style.marginTop = '4px';
            tagDiv.innerHTML = renderTags(tags);
            div.appendChild(tagDiv);

            div.addEventListener('click', () => {
                // Webサイトはモーダルで表示
                openWebsiteModal(filename, description, detail, author, tags, url, thumbnail);
            });
        } else {
            // その他ファイル: リンク表示
            const link = document.createElement('a');
            link.href = url || (`files/${filename}`);
            link.target = '_blank';
            link.rel = 'noopener';
            link.textContent = description || filename;
            link.style.display = 'block';
            link.style.marginTop = '20px';
            div.appendChild(link);

            const det = document.createElement('div');
            det.className = 'item-detail';
            det.textContent = detail || '';
            det.style.fontSize = '0.9em';
            det.style.color = '#666';
            det.style.marginTop = '4px';
            div.appendChild(det);

            const aut = document.createElement('div');
            aut.className = 'item-author';
            aut.textContent = author ? `by ${author}` : '';
            aut.style.fontSize = '0.8em';
            aut.style.color = '#999';
            aut.style.marginTop = '2px';
            div.appendChild(aut);

            const tagDiv = document.createElement('div');
            tagDiv.className = 'item-tags';
            tagDiv.style.marginTop = '4px';
            tagDiv.innerHTML = renderTags(tags);
            div.appendChild(tagDiv);
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

// --- 追加: Firebase 初期化・Firestore 読み出し / URL追加処理 ---
let firebaseAvailable = false;
let firestore = null;
let auth = null;
let currentUser = null;
let currentIsAdmin = false;

function initFirebaseIfConfigured() {
    // window.FIREBASE_CONFIG を index.html にセットしてください
    if (window.FIREBASE_CONFIG && typeof firebase !== 'undefined') {
        try {
            firebase.initializeApp(window.FIREBASE_CONFIG);
            firestore = firebase.firestore();
            auth = firebase.auth();
            firebaseAvailable = true;
            console.log('Firebase 初期化済み');

            // 認証状態監視
            auth.onAuthStateChanged(async (user) => {
                currentUser = user;
                const signInBtn = document.getElementById('signInBtn');
                const signOutBtn = document.getElementById('signOutBtn');
                const userInfo = document.getElementById('userInfo');
                const adminBadge = document.getElementById('adminBadge');
                const migrateLink = document.getElementById('migratePageLink');
                if (user) {
                    userInfo.textContent = user.displayName ? `${user.displayName} (${user.email})` : user.email;
                    signInBtn.style.display = 'none';
                    signOutBtn.style.display = 'inline-block';

                    // 管理者判定: admins コレクションに doc id = uid が存在するか
                    try {
                        const doc = await firestore.collection('admins').doc(user.uid).get();
                        currentIsAdmin = doc.exists;
                    } catch (e) {
                        console.error('admin 判定失敗', e);
                        currentIsAdmin = false;
                    }
                    adminBadge.style.display = currentIsAdmin ? 'inline-block' : 'none';
                    // 管理者なら移行ページリンクを表示
                    if (migrateLink) migrateLink.style.display = currentIsAdmin ? 'inline-block' : 'none';
                } else {
                    // 未ログイン
                    userInfo.textContent = '';
                    signInBtn.style.display = 'inline-block';
                    signOutBtn.style.display = 'none';
                    adminBadge.style.display = 'none';
                    currentIsAdmin = false;
                }
            });

            // ログイン / ログアウトボタン動作
            document.addEventListener('DOMContentLoaded', () => {
                const signInBtn = document.getElementById('signInBtn');
                const signOutBtn = document.getElementById('signOutBtn');
                if (signInBtn) {
                    signInBtn.addEventListener('click', async () => {
                        const provider = new firebase.auth.GoogleAuthProvider();
                        try {
                            await auth.signInWithPopup(provider);
                        } catch (e) {
                            console.error('ログイン失敗', e);
                            showToast('ログインに失敗しました', 1600, '#f66');
                        }
                    });
                }
                if (signOutBtn) {
                    signOutBtn.addEventListener('click', async () => {
                        try {
                            await auth.signOut();
                        } catch (e) {
                            console.error('ログアウト失敗', e);
                        }
                    });
                }
            });

        } catch (e) {
            console.warn('Firebase 初期化エラー', e);
            firebaseAvailable = false;
        }
    } else {
        console.log('Firebase 未設定: フェールバックでローカルJSONを使用します');
    }
}

// Firestore の 'archive' コレクションから読み出して配列に振り分ける
async function loadFromFirestore() {
    if (!firebaseAvailable || !firestore) return;
    try {
        const snapshot = await firestore.collection('archive').get();
        const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        // リセット
        allImages = [];
        allModels = [];
        allVideos = [];
        // その他も保持したければ拡張
        docs.forEach(item => {
            const t = item.type || detectTypeFromFilename(item.filename || item.url || '');
            const entry = { ...item, type: t };
            if (t === 'image') allImages.push(entry);
            else if (t === 'model') allModels.push(entry);
            else if (t === 'video') allVideos.push(entry);
            else {
                // その他は images に混ぜる（UI上ではレンダリング分岐でハンドル）
                allImages.push(entry);
            }
        });
    } catch (e) {
        console.error('Firestore 読み込み失敗', e);
    }
}

// --- 追加: Firestore の archive をリアルタイム監視し、配列を更新して再描画する ---
let archiveUnsubscribe = null;
function handleArchiveDocs(docs) {
    // docs: array of firestore docs or plain objects
    // リセット
    allImages = [];
    allModels = [];
    allVideos = [];

    docs.forEach(item => {
        // item may be a DocumentSnapshot or plain object depending on caller
        const data = item.data ? item.data() : item;
        const filename = data.filename || '';
        const t = data.type || detectTypeFromFilename(filename || data.url || '');
        const entry = { ...data, type: t };
        if (t === 'image') allImages.push(entry);
        else if (t === 'model') allModels.push(entry);
        else if (t === 'video') allVideos.push(entry);
        else allImages.push(entry);
    });
    // 現在の検索条件を再適用（表示更新）
    searchInput.dispatchEvent(new Event('input'));
}

// Firestore の archive を購読（リアルタイム反映）
function subscribeArchiveRealtime() {
    if (!firebaseAvailable || !firestore) return;
    // 既存の購読を解除
    if (archiveUnsubscribe) {
        try { archiveUnsubscribe(); } catch (e) { /* ignore */ }
        archiveUnsubscribe = null;
    }
    archiveUnsubscribe = firestore.collection('archive').onSnapshot(snapshot => {
        const docs = snapshot.docs;
        handleArchiveDocs(docs);
    }, err => {
        console.warn('archive onSnapshot error', err);
    });
}

// GitHub からのロード処理
async function loadFromGithubRaw() {
    const msgEl = document.getElementById('ghMsg') || { textContent: '' };
    msgEl.textContent = 'GitHub から読み込み中...';

    try {
        const urls = [
            { path: '/imgindex.json', type: 'image', baseUrl: `${location.origin}/imgs/` },
            { path: '/modelindex.json', type: 'model', baseUrl: `${location.origin}/models/` },
            { path: '/videoindex.json', type: 'video', baseUrl: `${location.origin}/videos/` }
        ];

        for (const { path, type, baseUrl } of urls) {
            try {
                const { json: arr } = await ghGetJsonFile(path);
                if (!Array.isArray(arr)) continue;

                for (const item of arr) {
                    const filename = item.filename || item.name || '';
                    const url = item.url || (filename ? (baseUrl + filename) : (item.url || ''));
                    // 重複チェック（filename ベース）
                    const exists = type === 'image' ? allImages.some(i => i.filename === filename) :
                        type === 'model' ? allModels.some(m => m.filename === filename) :
                            type === 'video' ? allVideos.some(v => v.filename === filename) : false;
                    if (exists) {
                        if (msgEl) msgEl.textContent = `スキップ: ${filename}`;
                        await delay(150); // 軽い待ち
                        continue;
                    }

                    const doc = {
                        filename,
                        url,
                        description: item.description || item.title || filename,
                        detail: item.detail || '',
                        // 追加: サムネイルを含める
                        thumbnail: item.thumbnail || '',
                        author: item.author || '',
                        tags: Array.isArray(item.tags) ? item.tags : [],
                        type,
                        owner: currentUser ? currentUser.uid : 'guest',
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    };

                    if (firebaseAvailable && firestore) {
                        // Firestore に追加
                        const newDocRef = await firestore.collection('archive').add(doc);
                        // 非同期で contentHash を計算して更新（CORS 等で失敗してもログを出して無視）
                        (async () => {
                            try {
                                if (doc.url) {
                                    const h = await computeContentHash(doc.url);
                                    if (h) await firestore.collection('archive').doc(newDocRef.id).update({ contentHash: h });
                                }
                            } catch (e) {
                                console.warn('contentHash update failed', e);
                            }
                        })();
                    } else {
                        // ローカルに追加
                        if (type === 'image') allImages.unshift(doc);
                        else if (type === 'model') allModels.unshift(doc);
                        else if (type === 'video') allVideos.unshift(doc);
                        else allImages.unshift(doc);
                    }
                    if (msgEl) msgEl.textContent = `追加中: ${filename}`;
                    await delay(200); // 書き込み間隔を空ける
                }
            } catch (e) {
                console.warn('GitHub ロードエラー', path, e);
            }
        }

        if (msgEl) msgEl.textContent = 'GitHub からの読み込み完了';
        showToast('GitHub からのデータ読み込みが完了しました', 3000, '#4caf50');
        // 再読み込み
        await loadFromFirestore();
        searchInput.dispatchEvent(new Event('input'));
    } catch (e) {
        console.error('GitHub 読み込み失敗', e);
        if (msgEl) msgEl.textContent = 'GitHub からの読み込みに失敗しました';
        showToast('GitHub からの読み込みに失敗しました', 3000, '#f66');
    }
}

// --- 追加: JSON を Firestore に移行する処理 ---
async function migrateJsonToFirestore() {
    const msgEl = document.getElementById('migrateMsg');
    if (!firebaseAvailable || !firestore) {
        msgEl.textContent = 'Firebase が未設定です';
        return;
    }
    if (!auth || !currentUser || !currentIsAdmin) {
        msgEl.textContent = '管理者でログインしてください';
        return;
    }
    if (!confirm('ローカルの JSON を Firestore に移行します。既に存在する URL はスキップされます。よろしいですか？')) return;

    msgEl.textContent = '移行を開始します...';
    try {
        const lists = [
            { path: '/imgindex.json', type: 'image', baseUrl: `${location.origin}/imgs/` },
            { path: '/modelindex.json', type: 'model', baseUrl: `${location.origin}/models/` },
            { path: '/videoindex.json', type: 'video', baseUrl: `${location.origin}/videos/` }
        ];

        let total = 0, added = 0, skipped = 0;

        for (const listInfo of lists) {
            try {
                const res = await fetch(listInfo.path);
                if (!res.ok) continue;
                const arr = await res.json();
                if (!Array.isArray(arr)) continue;

                for (const item of arr) {
                    total++;
                    const filename = item.filename || item.name || '';
                    const url = item.url || (filename ? (listInfo.baseUrl + filename) : (item.url || ''));
                    // 変更: 重複確認を URL ベースに変更
                    const q = await firestore.collection('archive').where('url', '==', url).get();
                    if (!q.empty) {
                        skipped++;
                        msgEl.textContent = `スキップ: ${url}`;
                        await delay(150);
                        continue;
                    }

                    const doc = {
                        filename,
                        url,
                        description: item.description || item.title || filename,
                        detail: item.detail || '',
                        thumbnail: item.thumbnail || '',
                        author: item.author || '',
                        tags: Array.isArray(item.tags) ? item.tags : [],
                        type: listInfo.type,
                        owner: currentUser.uid,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    };

                    await firestore.collection('archive').add(doc);
                    (async () => {
                        try {
                            if (doc.url) {
                                const h = await computeContentHash(doc.url);
                                if (h) await firestore.collection('archive').doc(newDocRef.id).update({ contentHash: h });
                            }
                        } catch (e) {
                            console.warn('contentHash update failed', e);
                        }
                    })();
                    added++;
                    msgEl.textContent = `追加中: ${filename} (${added} 追加, ${skipped} スキップ)`;
                    await delay(200);
                }
            } catch (e) {
                console.warn('移行エラー', listInfo.path, e);
            }
        }

        msgEl.textContent = `移行完了: 合計 ${total} 件中 ${added} 件追加, ${skipped} 件スキップしました`;
        showToast('JSON → Firestore 移行が完了しました', 3000, '#4caf50');
        await loadFromFirestore();
        searchInput.dispatchEvent(new Event('input'));
    } catch (e) {
        console.error('移行失敗', e);
        msgEl.textContent = '移行に失敗しました';
        showToast('移行に失敗しました', 3000, '#f66');
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/* ===== GitHub API ユーティリティ (client-side) =====
   注意: PAT をクライアントに置くのはセキュリティリスクがあります。自己責任で使用してください。 */
let ghConfig = { owner: '', repo: '', branch: 'main', token: '' };

function ghSetFromUI() {
    const owner = document.getElementById('ghOwner')?.value?.trim() || '';
    const repo = document.getElementById('ghRepo')?.value?.trim() || '';
    const branch = document.getElementById('ghBranch')?.value?.trim() || 'main';
    const token = document.getElementById('ghToken')?.value?.trim() || '';
    ghConfig = { owner, repo, branch, token };
}

async function ghApi(path, method = 'GET', body = null) {
    if (!ghConfig.token) throw new Error('GitHub token not set');
    const url = `https://api.github.com/repos/${encodeURIComponent(ghConfig.owner)}/${encodeURIComponent(ghConfig.repo)}/contents/${path}`;
    const headers = {
        'Authorization': 'token ' + ghConfig.token,
        'Accept': 'application/vnd.github.v3+json'
    };
    const opt = { method, headers };
    if (body) opt.body = JSON.stringify(body);
    const res = await fetch(url, opt);
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`ghApi ${res.status} ${res.statusText}: ${txt}`);
    }
    return await res.json();
}

async function ghGetJsonFile(path) {
    const res = await ghApi(path, 'GET');
    if (!res || !res.content) throw new Error('file not found');
    const decoded = atob(res.content.replace(/\n/g, ''));
    return { json: JSON.parse(decoded), sha: res.sha };
}

async function ghPutJsonFile(path, newObj, message, sha) {
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(newObj, null, 2))));
    const body = {
        message: message || `Update ${path}`,
        content,
        branch: ghConfig.branch
    };
    if (sha) body.sha = sha;
    return await ghApi(path, 'PUT', body);
}

document.addEventListener('DOMContentLoaded', () => {
    const ghConnectBtn = document.getElementById('ghConnectBtn');
    const ghSyncBtn = document.getElementById('ghSyncBtn');
    const ghMsg = document.getElementById('ghMsg');
    if (ghConnectBtn) {
        ghConnectBtn.addEventListener('click', async () => {
            ghSetFromUI();
            ghMsg.textContent = '接続中...';
            try {
                await ghApi('', 'GET');
                ghMsg.textContent = '接続成功！';
                showToast('GitHub 接続に成功しました', 2000, '#4caf50');
            } catch (e) {
                ghMsg.textContent = '接続失敗';
                console.error('GitHub 接続エラー', e);
                showToast('GitHub 接続に失敗しました', 2000, '#f66');
            }
        });
    }
    if (ghSyncBtn) {
        ghSyncBtn.addEventListener('click', async () => {
            ghMsg.textContent = '同期中...';
            try {
                allImages = [];
                allModels = [];
                allVideos = [];
                await loadFromFirestore();
                await Promise.all([loadImages(), loadModels(), loadVideos()]);
                ghMsg.textContent = '同期完了';
                showToast('データの同期が完了しました', 2000, '#4caf50');
            } catch (e) {
                ghMsg.textContent = '同期失敗';
                console.error('データ同期エラー', e);
                showToast('データの同期に失敗しました', 2000, '#f66');
            }
        });
    }
});

function restoreSearchFromURL() {
    const q = getQueryParam('q');
    if (q) {
        searchInput.value = q;
        searchInput.dispatchEvent(new Event('input'));
    }
}

function restoreModalFromURL() {
    const img = getQueryParam('img');
    if (img && allImages.length) {
        const found = allImages.find(({ filename }) => filename === img);
        if (found) {
            openImageModal(
                found.filename,
                found.description,
                found.detail,
                found.author,
                found.tags || [],
                found.url
            );
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
                foundModel.tags || [],
                foundModel.url
            );
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
                foundVideo.tags || [],
                foundVideo.url
            );
        }
    }
    const website = getQueryParam('website');
    if (website && allImages.length) {
        const found = allImages.find(({ filename }) => filename === website);
        if (found && found.type === 'website') {
            openWebsiteModal(
                found.filename,
                found.description,
                found.detail,
                found.author,
                found.tags || [],
                found.url,
                found.thumbnail
            );
        }
    }
}

async function loadFirebaseConfigFromJson() {
    try {
        if (!window.FIREBASE_CONFIG) {
            const res = await fetch('/firestore.json', { cache: 'no-store' });
            if (res.ok) {
                const cfg = await res.json();
                if (cfg && cfg.projectId) {
                    window.FIREBASE_CONFIG = cfg;
                    console.log('FIREBASE_CONFIG loaded from /firestore.json');
                } else {
                    console.warn('firestore.json の内容が不正です');
                }
            } else {
                console.info('/firestore.json が見つかりません:', res.status);
            }
        }
    } catch (e) {
        console.warn('firestore.json の読み込みに失敗しました', e);
    }
}

function detectTypeFromFilename(filename) {
    const ext = (filename.split('.').pop() || '').toLowerCase();
    if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) return 'image';
    if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'audio';
    if (['glb', 'gltf', 'obj', 'fbx', 'dae'].includes(ext)) return 'model';
    return 'other';
}

async function computeContentHash(url) {
    try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return null;
        const buf = await res.arrayBuffer();
        const hbuf = await crypto.subtle.digest('SHA-1', buf);
        const arr = Array.from(new Uint8Array(hbuf));
        return arr.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
        console.warn('computeContentHash error', e);
        return null;
    }
}

(async () => {
    await loadFirebaseConfigFromJson();
    initFirebaseIfConfigured();

    if (firebaseAvailable) {
        await loadFromFirestore();
        subscribeArchiveRealtime();
    } else {
        if (ghConfig.token && ghConfig.owner && ghConfig.repo) {
            await loadFromGithubRaw();
        }
        await Promise.all([loadImages(), loadModels(), loadVideos()]);
    }

    restoreSearchFromURL();
    restoreModalFromURL();
})();

errorCloseBtn.addEventListener('click', () => {
    error_window.style.display = 'none';
});
error_window.addEventListener('click', e => {
    if (e.target === error_window) error_window.style.display = 'none';
});

const imgTypeSelect = document.querySelector('select[name="img-type"]');
if (imgTypeSelect) {
    imgTypeSelect.addEventListener('change', () => {
        const selectedType = imgTypeSelect.value.toLowerCase();
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
}

const imgCopyBtn = document.getElementById('img-copy-btn');
if (imgCopyBtn) {
    imgCopyBtn.addEventListener('click', () => {
        const url = document.getElementById('img-copy-btn').dataset.url;
        navigator.clipboard.writeText(url)
            .then(() => showToast('コピーしましたチュー！'))
            .catch(() => showToast('コピーに失敗したチュー…'));
    });
}

const modelCopyBtn = document.getElementById('model-copy-btn');
if (modelCopyBtn) {
    modelCopyBtn.addEventListener('click', () => {
        const url = document.getElementById('model-copy-btn').dataset.url;
        navigator.clipboard.writeText(url)
            .then(() => showToast('コピーしましたチュー！'))
            .catch(() => showToast('コピーに失敗したチュー…'));
    });
}

const videoCopyBtn = document.getElementById('video-copy-btn');
if (videoCopyBtn) {
    videoCopyBtn.addEventListener('click', () => {
        const url = document.getElementById('video-copy-btn').dataset.url;
        navigator.clipboard.writeText(url)
            .then(() => showToast('コピーしましたチュー！'))
            .catch(() => showToast('コピーに失敗したチュー…'));
    });
}

const websiteCopyBtn = document.getElementById('website-copy-btn');
if (websiteCopyBtn) {
    websiteCopyBtn.addEventListener('click', () => {
        const url = document.getElementById('website-copy-btn').dataset.url;
        navigator.clipboard.writeText(url)
            .then(() => showToast('URLをコピーしましたチュー！'))
            .catch(() => showToast('コピーに失敗したチュー…'));
    });
}

const modalClose = document.getElementById('modal-close');
if (modalClose) {
    modalClose.addEventListener('click', closeImageModal);
}

const modal = document.getElementById('modal');
if (modal) {
    modal.addEventListener('click', e => {
        if (e.target.id === 'modal') closeImageModal();
    });
}

const modelClose = document.getElementById('model-close');
if (modelClose) {
    modelClose.addEventListener('click', closeModelModal);
}

const modelModal = document.getElementById('model-modal');
if (modelModal) {
    modelModal.addEventListener('click', e => {
        if (e.target.id === 'model-modal') closeModelModal();
    });
}

const videoClose = document.getElementById('video-close');
if (videoClose) {
    videoClose.addEventListener('click', closeVideoModal);
}

const videoModal = document.getElementById('video-modal');
if (videoModal) {
    videoModal.addEventListener('click', e => {
        if (e.target.id === 'video-modal') closeVideoModal();
    });
}

const websiteClose = document.getElementById('website-close');
if (websiteClose) {
    websiteClose.addEventListener('click', closeWebsiteModal);
}

const websiteModal = document.getElementById('website-modal');
if (websiteModal) {
    websiteModal.addEventListener('click', e => {
        if (e.target.id === 'website-modal') closeWebsiteModal();
    });
}

if (searchInput) {
    searchInput.addEventListener('input', e => {
        searchAndFilter();
    });
}

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
    if (input === '@動画') {
        filtered = allItems.filter(item => item.type === 'video');
    } else if (input === '@画像') {
        filtered = allItems.filter(item => item.type === 'image');
    } else if (input === '@3d' || input === '@３ｄ') {
        filtered = allItems.filter(item => item.type === 'model');
    } else if (input === '@web' || input === '@website' || input === '@サイト') {
        filtered = allItems.filter(item => item.type === 'website');
    } else if (input.startsWith('#')) {
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

const mainTitle = document.getElementById("main-title");
if (mainTitle) {
    mainTitle.addEventListener("click", () => {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input'));
        setQueryParam('q', '');
        closeImageModal();
        closeModelModal();
        closeVideoModal();
        history.replaceState(null, '', window.location.pathname);
    });
}

const showFavoritesBtn = document.getElementById('show-favorites-btn');
const favoritesModal = document.getElementById('favorites-modal');
const favoritesCloseBtn = document.getElementById('favorites-close');
const favoritesListDiv = document.getElementById('favorites-list');

if (showFavoritesBtn) {
    showFavoritesBtn.addEventListener('click', () => {
        renderFavoritesList();
        favoritesModal.style.display = 'flex';
    });
}
if (favoritesCloseBtn) {
    favoritesCloseBtn.addEventListener('click', () => {
        favoritesModal.style.display = 'none';
    });
}
if (favoritesModal) {
    favoritesModal.addEventListener('click', e => {
        if (e.target === favoritesModal) favoritesModal.style.display = 'none';
    });
}

function renderFavoritesList() {
    const favs = getFavorites();
    if (!favs.length) {
        favoritesListDiv.innerHTML = '<p style="color:#999;">お気に入りはありません。</p>';
        return;
    }
    favoritesListDiv.innerHTML = favs.map(fav => {
        let icon = fav.type === 'image' ? '🖼️' : fav.type === 'model' ? '🧩' : '🎬';
        return `<div style="margin-bottom:10px;display:flex;align-items:center;">
            <span style="font-size:1.2em;margin-right:8px;">${icon}</span>
            <span style="flex:1;">${fav.description || fav.filename}</span>
            <button style="margin-left:8px;" onclick="window._favOpen('${fav.type}','${fav.filename}')">表示</button>
            <button style="margin-left:4px;" onclick="window._favRemove('${fav.type}','${fav.filename}')">削除</button>
        </div>`;
    }).join('');
}

window._favOpen = (type, filename) => {
    favoritesModal.style.display = 'none';
    if (type === 'image') {
        const found = allImages.find(i => i.filename === filename);
        if (found) openImageModal(found.filename, found.description, found.detail, found.author, found.tags || [], found.url);
    } else if (type === 'model') {
        const found = allModels.find(m => m.filename === filename);
        if (found) openModelModal(found.filename, found.description, found.detail, found.author, found.tags || [], found.url);
    } else if (type === 'video') {
        const found = allVideos.find(v => v.filename === filename);
        if (found) openVideoModal(found.filename, found.description, found.detail, found.author, found.tags || [], found.url);
    }
};
window._favRemove = (type, filename) => {
    let favs = getFavorites();
    favs = favs.filter(f => !(f.type === type && f.filename === filename));
    setFavorites(favs);
    renderFavoritesList();
    showToast('お気に入りから削除しました', 1200, '#666');
};
