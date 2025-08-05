let allImages = [];

// ★ normalizeText: ひらがな→カタカナ、大文字→小文字、全角→半角
function normalizeText(text) {
    return text
        .toLowerCase()
        .replace(/[ぁ-ん]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60))
        .normalize('NFKC');
}

async function loadImages() {
    try {
        const res = await fetch('imgs/imgindex.json');
        if (!res.ok) throw new Error('JSONファイルの読み込み失敗チュー');

        allImages = await res.json();
        renderImages(allImages);
    } catch (e) {
        console.error('画像の読み込みに失敗チュー:', e);
        const container = document.getElementById('imgContainer');
        container.textContent = '画像一覧を読み込めなかったチュー😭';
    }
}

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
            document.getElementById('modal').style.display = 'block';
            // モーダルのコピーボタン処理チュー！
            document.getElementById('copy-btn').addEventListener('click', () => {
                const url = document.getElementById('copy-btn').getAttribute('data-url');
                navigator.clipboard.writeText(url)
                    .then(() => {
                        showToast('コピーしましたチュー！');
                    })
                    .catch(err => {
                        console.error('コピー失敗チュー:', err);
                        showToast('コピーに失敗したチュー…');
                    });
            });
        });
    });
}


function showToast(message, duration = 2000) {
    // トースト要素を取得
    let toast = document.getElementById('toast');
    if (!toast) {
        // なければ作ってbodyに追加
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.style.position = 'fixed';
        toast.style.bottom = '20px';
        toast.style.left = '50%';
        toast.style.transform = 'translateX(-50%)';
        toast.style.backgroundColor = '#333';
        toast.style.color = '#fff';
        toast.style.padding = '10px 20px';
        toast.style.borderRadius = '5px';
        toast.style.fontSize = '14px';
        toast.style.opacity = '0.9';
        toast.style.zIndex = '10000';
        toast.style.display = 'none';
        document.body.appendChild(toast);
    }

    // メッセージセットして表示
    toast.textContent = message;
    toast.style.display = 'block';

    // 指定時間後に非表示にする
    setTimeout(() => {
        toast.style.display = 'none';
    }, duration);
}


document.getElementById('modal-close').addEventListener('click', () => {
    document.getElementById('modal').style.display = 'none';
});

document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal')) {
        document.getElementById('modal').style.display = 'none';
    }
});

// 🔍 入力時にフィルター
document.getElementById('searchInput').addEventListener('input', (e) => {
    const keyword = normalizeText(e.target.value);
    const filtered = allImages.filter(({ filename, description }) => {
        const text = normalizeText(description || filename);
        return text.includes(keyword);
    });
    renderImages(filtered);
});

loadImages();