let allImages = [];

// ひらがな→カタカナ、大文字→小文字、全角→半角 正規化チュー
function normalizeText(text) {
    return text
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[ぁ-ん]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}

// ファイル名の拡張子を除去して説明文かファイル名を正規化して返すチュー
function getSearchText(filename, description) {
    const nameOnly = filename.replace(/\.[^.]+$/, '');
    return normalizeText(description || nameOnly);
}

// 画像読み込み＆表示チュー
async function loadImages() {
    try {
        const res = await fetch('imgs/imgindex.json');
        if (!res.ok) throw new Error('JSONファイルの読み込み失敗チュー');

        allImages = await res.json();
        renderImages(allImages);
    } catch (e) {
        console.error('画像の読み込みに失敗チュー:', e);
        const container = document.getElementById('imgContainer');
        container.textContent = '画像一覧を読み込めなかったチュー…';
    }
}

// 画像レンダリングチュー
function renderImages(images) {
    const container = document.getElementById('imgContainer');
    container.innerHTML = '';

    images.forEach(({ filename, description }) => {
        const div = document.createElement('div');
        div.className = 'img-item';

        const img = document.createElement('img');
        img.src = `imgs/${filename}`;
        img.alt = description || filename;

        const caption = document.createElement('p');
        caption.textContent = description || filename;

        div.appendChild(img);
        div.appendChild(caption);
        container.appendChild(div);

        div.addEventListener('click', () => {
            const imageUrl = `${location.origin}/imgs/${filename}`;
            document.getElementById('modal-img').src = imageUrl;
            document.getElementById('modal-caption').textContent = description || filename;
            document.getElementById('copy-btn').setAttribute('data-url', imageUrl);
            document.getElementById('modal').style.display = 'flex';
        });
    });
}

// コピーイベントはここで一度だけセットチュー！
document.getElementById('copy-btn').addEventListener('click', () => {
    const url = document.getElementById('copy-btn').getAttribute('data-url');
    navigator.clipboard.writeText(url)
        .then(() => showToast('コピーしましたチュー！'))
        .catch(err => {
            console.error('コピー失敗チュー:', err);
            showToast('コピーに失敗したチュー…');
        });
});

// トースト表示チュー
function showToast(message, duration = 2000) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.style.display = 'block';
    setTimeout(() => {
        toast.style.display = 'none';
    }, duration);
}

// モーダル閉じるボタン
document.getElementById('modal-close').addEventListener('click', () => {
    document.getElementById('modal').style.display = 'none';
});

// モーダル背景クリックで閉じる
document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal')) {
        document.getElementById('modal').style.display = 'none';
    }
});

// 検索入力イベント
document.getElementById('searchInput').addEventListener('input', (e) => {
    const input = e.target.value.trim();
    if (!input) {
        showResultCount(allImages.length);
        renderImages(allImages);
        return;
    }

    const normalizedInput = normalizeText(input);

    let filtered = [];
    if (/(\s|^)or(\s|$)/i.test(normalizedInput)) {
        const orKeywords = normalizedInput.split(/\s+or\s+/i).map(k => k.trim()).filter(Boolean);

        filtered = allImages.filter(({ filename, description }) => {
            const text = getSearchText(filename, description);
            return orKeywords.some(keyword => text.includes(keyword));
        });
    } else {
        const andKeywords = normalizedInput.split(/\s+/).filter(Boolean);

        filtered = allImages.filter(({ filename, description }) => {
            const text = getSearchText(filename, description);
            return andKeywords.every(keyword => text.includes(keyword));
        });
    }
    showResultCount(filtered.length);
    if (filtered.length === 0) {
        const container = document.getElementById('imgContainer');
        container.innerHTML = '<p><img src="imgs/404.webp" alt="404画像" id="404-img" style="width: 60%;margin: 20px auto;display: block;border-radius: 10px;box-shadow: 0 4px 10px rgba(0, 0,0, 0.1);transition: transform 0.3s ease;transform: scale(1);"><br>該当する画像はありませんチュー…</p>';
        return;
    } else {
        renderImages(filtered);
    }
});
function showResultCount(count) {
    const countEl = document.getElementById('resultCount');
    countEl.textContent = `${count}件ヒットしましたチュー！`;
}


loadImages();