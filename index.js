let allImages = [];
const searchInput = document.getElementById('searchInput');

const normalizeText = t =>
    t.normalize('NFKC').toLowerCase().replace(/[ぁ-ん]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60));

const getSearchText = (filename, desc) => normalizeText(desc || filename.replace(/\.[^.]+$/, ''));

const showToast = (msg, dur = 2000) => {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.style.display = 'block';
    setTimeout(() => t.style.display = 'none', dur);
};

const showResultCount = c => {
    if (searchInput.value.trim() === '') {
        document.getElementById('resultCount').textContent = '';
        return;
    }
    document.getElementById('resultCount').textContent = `${c}件ヒットしましたチュー！`;
};

// モーダル開く関数（URLパラメータもセット）
const openModal = (filename, description) => {
    const url = `${location.origin}/imgs/${filename}`;
    const modal = document.getElementById('modal');
    document.getElementById('modal-img').src = url;
    document.getElementById('modal-caption').textContent = description || filename;
    document.getElementById('copy-btn').setAttribute('data-url', url);

    const downloadBtn = document.getElementById('download-btn');
    downloadBtn.href = url;
    downloadBtn.download = filename;

    modal.style.display = 'flex';

    // URLにimgパラメータをセット
    const params = new URLSearchParams(window.location.search);
    params.set('img', filename);
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    history.replaceState(null, '', newUrl);
};

// モーダル閉じる関数（URLのimgパラメータ削除）
const closeModal = () => {
    document.getElementById('modal').style.display = 'none';

    const params = new URLSearchParams(window.location.search);
    params.delete('img');
    const newUrl = params.toString()
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;
    history.replaceState(null, '', newUrl);
};

const renderImages = imgs => {
    const container = document.getElementById('imgContainer');
    container.innerHTML = '';

    imgs.forEach(({ filename, description }) => {
        const div = document.createElement('div');
        div.className = 'img-item';

        const img = document.createElement('img');
        img.src = `imgs/${filename}`;
        img.alt = description || filename;
        img.loading = 'lazy';

        const cap = document.createElement('p');
        cap.textContent = description || filename;

        div.append(img, cap);
        container.appendChild(div);

        div.addEventListener('click', () => {
            openModal(filename, description);
        });
    });
};

// URLのクエリパラメータを取得
const getQueryParam = (key) => {
    const params = new URLSearchParams(window.location.search);
    return params.get(key) || '';
};

// URLのクエリパラメータをセット・更新
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
        const res = await fetch('imgs/imgindex.json');
        if (!res.ok) throw new Error();
        allImages = await res.json();
        renderImages(allImages);
    } catch {
        console.error('画像の読み込みに失敗チュー');
        document.getElementById('imgContainer').textContent = '画像一覧を読み込めなかったチュー…';
    }
};

// URLから検索語を復元して検索実行
const restoreSearchFromURL = () => {
    const query = getQueryParam('q');
    if (query) {
        searchInput.value = query;
        searchInput.dispatchEvent(new Event('input'));
    } else {
        showResultCount(allImages.length);
    }
};

// URLからimgパラメータ復元してモーダル開く
const restoreModalFromURL = () => {
    const params = new URLSearchParams(window.location.search);
    const img = params.get('img');
    if (img && allImages.length) {
        const found = allImages.find(({ filename }) => filename === img);
        if (found) {
            openModal(found.filename, found.description);
        }
    }
};

document.getElementById('copy-btn').addEventListener('click', () => {
    const url = document.getElementById('copy-btn').dataset.url;
    navigator.clipboard.writeText(url)
        .then(() => showToast('コピーしましたチュー！'))
        .catch(() => showToast('コピーに失敗したチュー…'));
});

document.getElementById('modal-close').addEventListener('click', () => {
    closeModal();
});
document.getElementById('modal').addEventListener('click', e => {
    if (e.target.id === 'modal') closeModal();
});

searchInput.addEventListener('input', e => {
    const rawInput = e.target.value.trim();
    const input = normalizeText(rawInput);
    setQueryParam('q', rawInput);

    if (!input) {
        showResultCount(allImages.length);
        renderImages(allImages);
        return;
    }

    let filtered = [];
    if (/(\s|^)or(\s|$)/i.test(input)) {
        const orKeys = input.split(/\s+or\s+/i).map(k => k.trim());
        filtered = allImages.filter(({ filename, description }) =>
            orKeys.some(k => getSearchText(filename, description).includes(k))
        );
    } else {
        const andKeys = input.split(/\s+/);
        filtered = allImages.filter(({ filename, description }) =>
            andKeys.every(k => getSearchText(filename, description).includes(k))
        );
    }

    showResultCount(filtered.length);
    if (filtered.length) {
        renderImages(filtered);
    } else {
        document.getElementById('imgContainer').innerHTML = `
      <p>
        <img src="imgs/404.webp" alt="404画像" style="width:60%;margin:20px auto;display:block;border-radius:10px;box-shadow:0 4px 10px rgba(0,0,0,0.1);">
        <br>該当する画像はありませんチュー…
      </p>`;
    }
});

// 画像読み込み後にURLから状態復元
loadImages().then(() => {
    restoreSearchFromURL();
    restoreModalFromURL();
});
