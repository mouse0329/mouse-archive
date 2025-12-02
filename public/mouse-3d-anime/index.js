import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

// ----------------------------------------------------
// レンダラー
// ----------------------------------------------------
const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;                 // 影ON
renderer.shadowMap.type = THREE.PCFSoftShadowMap;  // ソフト影

// ----------------------------------------------------
// シーン
// ----------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeeeeee);

// ----------------------------------------------------
// カメラ
// ----------------------------------------------------
const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    2000
);
camera.position.set(3, 2, 3);

// ----------------------------------------------------
// Controls
// ----------------------------------------------------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
// カメラがオブジェクトにめり込まないようにするための設定
let minCameraDistance = 0;
// 初期カメラ位置・ターゲット（fitModelToView で設定）
let initialCameraPos = null;
let initialTarget = null;

// カメラを滑らかに初期位置に戻すための制御
let isReturningToInit = false;
let returnStartTime = 0;
const returnDuration = 1000; // ms
// カメラパン（横移動）アニメーション状態
let isPanning = false;
let panStartTime = 0;
let panDuration = 600; // ms
let panFromPos = null;
let panToPos = null;
let panFromTarget = null;
let panToTarget = null;

// ----------------------------------------------------
// 環境光（HDRIで金属反射を綺麗に）
// ----------------------------------------------------
new RGBELoader()
    .setPath("./")
    .load("studio_small_08_4k.hdr", function (hdr) {
        hdr.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = hdr;  // 金属反射が綺麗になる
    });

// ----------------------------------------------------
// ライト（影用）
// ----------------------------------------------------
const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(5, 10, 5);
light.castShadow = true;
light.shadow.mapSize.set(2048, 2048);
scene.add(light);

scene.add(new THREE.AmbientLight(0xffffff, 0.4));

// ---------------- UI elements ----------------
const colorPicker = document.getElementById('colorPicker');
const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');
let userAutoRotateSpeed = 1.2; // default speed, controlled by slider

// 追加フラグ & 保存用マップ
let metallicMode = true; // デフォルトは既存の見た目を維持 (メタリックON)
let noColorMode = false;
const originalMaterialProps = new WeakMap();

// --- color helper: blend with white to create a lighter tint for gradient ---
function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const bigint = parseInt(h, 16);
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
}

function rgbToHex(r, g, b) {
    return '#' + ((1 << 24) + (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b)).toString(16).slice(1);
}

function blendHex(hexA, hexB, t) {
    const a = hexToRgb(hexA);
    const b = hexToRgb(hexB);
    const r = a.r * (1 - t) + b.r * t;
    const g = a.g * (1 - t) + b.g * t;
    const bl = a.b * (1 - t) + b.b * t;
    return rgbToHex(r, g, bl);
}

function updateColorPickerBackground(hex) {
    if (!colorPicker) return;
    // Blend toward white for the second color stop (20% white)
    const light = blendHex(hex, '#ffffff', 0.22);
    colorPicker.style.background = `linear-gradient(145deg, ${hex}, ${light})`;
}

// 初期カラーピッカーバックグラウンドを設定（UI確認用）
if (colorPicker && colorPicker.value) {
    updateColorPickerBackground(colorPicker.value);
}

function setModelColor(hex) {
    if (noColorMode) return; // 色付けは無効化
    const root = model || displayedGroup;
    root.traverse((o) => {
        if (o.isMesh) {
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach(m => {
                if (m && m.color) {
                    m.color.set(hex);
                    m.needsUpdate = true;
                }
            });
        }
    });
}

if (colorPicker) {
    colorPicker.addEventListener('input', (e) => {
        const hex = e.target.value;
        setModelColor(hex);
        updateColorPickerBackground(hex);
    });
}

if (speedSlider) {
    speedSlider.addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        userAutoRotateSpeed = v;
        if (speedValue) speedValue.textContent = v.toFixed(2);
        controls.autoRotateSpeed = v;
    });
    // initialize display
    if (speedValue) speedValue.textContent = parseFloat(speedSlider.value).toFixed(2);
    userAutoRotateSpeed = parseFloat(speedSlider.value || 1.2);
    controls.autoRotateSpeed = userAutoRotateSpeed;
}

// ----------------------------------------------------
// GLB 読み込み
// ----------------------------------------------------
const loader = new GLTFLoader();
let model;

// ここで URL クエリを読み、model パラメータがあればそれを使う
(function determineModelUrl() {
    const params = new URLSearchParams(window.location.search);
    const qModel = params.get('model') || params.get('src') || null;
    const defaultUrl = "https://mouse-archive.web.app/models/cheese-umbrella-v4.glb";

    if (!qModel) {
        window.__mouseModelUrl = defaultUrl;
        return;
    }

    let decoded = decodeURIComponent(qModel).trim();

    // 既に絶対URLならそのまま
    if (/^https?:\/\//i.test(decoded)) {
        window.__mouseModelUrl = decoded;
        return;
    }

    // 先頭にスラッシュがなければサイトルートからの絶対パスとして補完
    if (!decoded.startsWith('/')) {
        decoded = '/' + decoded;
    }

    // これで /models/xxx.glb のようになるはず
    window.__mouseModelUrl = decoded || defaultUrl;
    console.log('[mouse-3d-anime] model URL resolved to:', window.__mouseModelUrl);
})();

// モデル一覧（JSON から読み込む）
let modelList = [];
let currentIndex = 0;
// 元メタ情報を保存する（項目がオブジェクトの場合にサムネや説明を保持するため）
let modelMetaList = [];
// キャッシュ: URL -> { scene, animations }
const modelCache = new Map();
// インスタンスごとの AnimationMixer を管理
const instanceMixerMap = new WeakMap();
const activeMixers = new Set();
const clock = new THREE.Clock();
// 表示用グループ（現在見ているモデルと左右のモデルをここに配置）
const displayedGroup = new THREE.Group();
scene.add(displayedGroup);
// モデル間の間隔倍率（大きいほど横の隙間が広がる）
let spacingMultiplier = 2.0;

function resolveModelUrlFromEntry(entry) {
    // entry can be a string or object like { filename: 'x.glb', url: '...', path: '...' }
    if (!entry) return null;
    if (typeof entry === 'string') return entry;
    if (typeof entry === 'object') {
        // prefer explicit url
        if (entry.url && typeof entry.url === 'string') return entry.url;
        if (entry.path && typeof entry.path === 'string') return entry.path;
        if (entry.filename && typeof entry.filename === 'string') {
            // make a sensible default path: /models/<filename> unless the filename is already an absolute URL or starts with /
            const fn = entry.filename;
            if (/^https?:\/\//i.test(fn) || fn.startsWith('/')) return fn;
            return '/models/' + fn;
        }
    }
    return null;
}

async function fetchModelsJson() {
    try {
        const resp = await fetch('/modelindex.json');
        if (!resp.ok) throw new Error('models.json not found');
        const j = await resp.json();
        // 柔軟に対応: { models: [...] } か単純配列
        const rawList = Array.isArray(j.models) ? j.models : (Array.isArray(j) ? j : []);
        // store meta list as-is for later UI use
        modelMetaList = rawList.slice();
        // normalize to URL strings
        const normalized = rawList.map(item => resolveModelUrlFromEntry(item)).filter(u => !!u);
        return normalized;
    } catch (e) {
        console.warn('[mouse-3d-anime] models.json not loaded:', e.message);
        return [];
    }
}

function loadModelAsync(url) {
    return new Promise((resolve, reject) => {
        loader.load(url, (gltf) => resolve({ scene: gltf.scene, animations: gltf.animations || [] }), undefined, (err) => reject(err));
    });
}

// 自動正規化オプション: スケールをターゲットサイズに合わせる
const autoNormalizeInstances = true;
const normalizeTargetMaxSize = 1.8; // モデルの最大辺がこれに収まるようにスケール

async function getInstanceForUrl(url) {
    // return a cloned instance (materials cloned) for safe per-instance modification
    let base = modelCache.get(url);
    if (!base) {
        base = await loadModelAsync(url);
        modelCache.set(url, base);
    }
    const baseScene = base.scene || base;
    // deep clone nodes but ensure materials are cloned to avoid cross-instance sharing
    // Use SkeletonUtils.clone if model contains SkinnedMesh to preserve skeletons correctly
    let inst;
    let hasSkinned = false;
    baseScene.traverse(o => { if (o.isSkinnedMesh) hasSkinned = true; });
    if (hasSkinned) {
        inst = SkeletonUtils.clone(baseScene);
    } else {
        inst = baseScene.clone(true);
    }
    inst.traverse(o => {
        if (o.isMesh) {
            if (Array.isArray(o.material)) {
                o.material = o.material.map(m => m ? m.clone() : m);
            } else if (o.material) {
                o.material = o.material.clone();
            }
            // スキンメッシュの場合はジオメトリやスケールの変更が
            // ボーンやバインド情報を壊す可能性があるため、ジオメトリの
            // クローンもスケーリングも慎重に扱う
            if (o.geometry && !o.isSkinnedMesh) {
                try {
                    o.geometry = o.geometry.clone();
                    o.geometry.computeBoundingBox();
                    o.geometry.computeBoundingSphere();
                } catch (e) {
                    console.warn('[mouse-3d-anime] geometry clone failed', e);
                }
            }
        }
    });

    // optional: normalize overall scale so the model fits a target max size
    // スキンメッシュを含むモデルはスケールを自動変更しない（アニメーションを保護）
    if (autoNormalizeInstances && !hasSkinned) {
        inst.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(inst);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z, 0.0001);
        const scaleFactor = normalizeTargetMaxSize / maxDim;
        // clamp scale factor to avoid extreme upscales
        const clamped = Math.min(Math.max(scaleFactor, 0.25), 4.0);
        inst.scale.multiplyScalar(clamped);
        inst.updateMatrixWorld(true);
    }
    // アニメーションがあれば AnimationMixer を作り、インスタンスに紐付けるのは呼び出し側で行う
    return { object: inst, animations: base.animations || [] };
}

function applyInitialPropsToModel(m) {
    m.traverse((o) => {
        if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            if (o.material) {
                const mats = Array.isArray(o.material) ? o.material : [o.material];
                mats.forEach(mat => {
                    if (!mat) return;
                    if (!originalMaterialProps.has(mat)) {
                        originalMaterialProps.set(mat, {
                            color: mat.color ? mat.color.clone() : null,
                            metalness: ('metalness' in mat) ? mat.metalness : undefined,
                            roughness: ('roughness' in mat) ? mat.roughness : undefined,
                            transparent: ('transparent' in mat) ? mat.transparent : undefined,
                            opacity: ('opacity' in mat) ? mat.opacity : undefined
                        });
                    }
                    if (metallicMode && ('metalness' in mat)) mat.metalness = 1.0;
                    if (metallicMode && ('roughness' in mat)) mat.roughness = 0.15;
                });
            }
        }
    });
}

function ensureMaterialTransparency(mat, enable) {
    if (!mat) return;
    if (!originalMaterialProps.has(mat)) {
        originalMaterialProps.set(mat, {
            color: mat.color ? mat.color.clone() : null,
            metalness: ('metalness' in mat) ? mat.metalness : undefined,
            roughness: ('roughness' in mat) ? mat.roughness : undefined,
            transparent: ('transparent' in mat) ? mat.transparent : undefined,
            opacity: ('opacity' in mat) ? mat.opacity : undefined
        });
    }
    if (enable) {
        mat.transparent = true;
    }
}

function crossfadeModels(oldM, newM, duration = 600) {
    if (!newM) return Promise.resolve();
    return new Promise((resolve) => {
        const start = performance.now();
        // collect materials
        const newMats = [];
        newM.traverse(o => {
            if (o.isMesh && o.material) {
                const arr = Array.isArray(o.material) ? o.material : [o.material];
                arr.forEach(m => { if (m) { ensureMaterialTransparency(m, true); m.opacity = 0; m.needsUpdate = true; newMats.push(m); } });
            }
        });

        const oldMats = [];
        if (oldM) oldM.traverse(o => {
            if (o.isMesh && o.material) {
                const arr = Array.isArray(o.material) ? o.material : [o.material];
                arr.forEach(m => { if (m) { ensureMaterialTransparency(m, true); m.opacity = (typeof m.opacity === 'number') ? m.opacity : 1.0; m.needsUpdate = true; oldMats.push(m); } });
            }
        });

        scene.add(newM);

        function step() {
            const now = performance.now();
            const t = Math.min(1, (now - start) / duration);
            // fade in new
            newMats.forEach(m => { m.opacity = t; m.needsUpdate = true; });
            // fade out old
            oldMats.forEach(m => { m.opacity = 1 - t; m.needsUpdate = true; });
            if (t < 1) requestAnimationFrame(step);
            else {
                // remove old model
                if (oldM) scene.remove(oldM);
                // restore opacity/transparent from originalMaterialProps where appropriate
                newM.traverse(o => {
                    if (o.isMesh && o.material) {
                        const arr = Array.isArray(o.material) ? o.material : [o.material];
                        arr.forEach(m => {
                            const orig = originalMaterialProps.get(m);
                            if (orig && typeof orig.transparent !== 'undefined') {
                                m.transparent = orig.transparent;
                            }
                            if (orig && typeof orig.opacity !== 'undefined') {
                                m.opacity = orig.opacity;
                            }
                            m.needsUpdate = true;
                        });
                    }
                });
                model = newM;
                resolve();
            }
        }

        step();
    });
}

// 表示用: 中央のモデルと左右のモデル（存在すれば）を横に並べて表示し、カメラをフィットさせる
async function updateDisplayedModels(centerIdx, options = {}) {
    if (!modelList || modelList.length === 0) return;
    if (centerIdx < 0 || centerIdx >= modelList.length) return;

    const indices = [];
    // 左, 中央, 右（存在するものだけ）
    if (centerIdx - 1 >= 0) indices.push(centerIdx - 1);
    indices.push(centerIdx);
    if (centerIdx + 1 < modelList.length) indices.push(centerIdx + 1);

    // 一旦既存表示をクリア
    while (displayedGroup.children.length) {
        const child = displayedGroup.children[0];
        // dispose mixer if any
        const mx = instanceMixerMap.get(child);
        if (mx) {
            activeMixers.delete(mx);
            try { mx.stopAllAction(); } catch (e) { }
            instanceMixerMap.delete(child);
        }
        displayedGroup.remove(child);
    }

    const instances = [];
    for (const i of indices) {
        const url = modelList[i];
        try {
            const res = await getInstanceForUrl(url);
            const inst = res.object;
            const animations = res.animations || [];
            applyInitialPropsToModel(inst);
            // apply color if needed
            if (colorPicker && colorPicker.value && !noColorMode) {
                inst.traverse(o => {
                    if (o.isMesh && o.material) {
                        const arr = Array.isArray(o.material) ? o.material : [o.material];
                        arr.forEach(m => { if (m && m.color) m.color.set(colorPicker.value); });
                    }
                });
            }
            // create AnimationMixer for this instance if it has animations
            if (animations && animations.length > 0) {
                const mixer = new THREE.AnimationMixer(inst);
                animations.forEach(clip => {
                    try {
                        const useClip = (clip && clip.clone) ? clip.clone() : clip;
                        const action = mixer.clipAction(useClip);
                        action.reset().play();
                    } catch (e) {
                        console.warn('[mouse-3d-anime] failed to play clip', e);
                    }
                });
                instanceMixerMap.set(inst, mixer);
                activeMixers.add(mixer);
            }
            instances.push({ idx: i, obj: inst });
            displayedGroup.add(inst);
        } catch (e) {
            console.warn('[mouse-3d-anime] failed to load for display', url, e);
        }
    }

    // 各インスタンスをそれぞれのローカル中心に揃え、横並び配置
    const sizes = [];
    for (const it of instances) {
        it.obj.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(it.obj);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        // 中心を原点に合わせる
        it.obj.position.x += (it.obj.position.x - center.x);
        it.obj.position.y += (it.obj.position.y - center.y);
        it.obj.position.z += (it.obj.position.z - center.z);
        sizes.push(size.x || 1);
    }

    // 合計幅を計算して中央に配置
    const spacing = Math.max(...sizes) * spacingMultiplier;
    const totalWidth = sizes.reduce((a, b) => a + b, 0) + spacing * (sizes.length - 1);
    let cursor = -totalWidth / 2;
    for (let i = 0; i < instances.length; i++) {
        const it = instances[i];
        const w = sizes[i];
        // place center of this model at cursor + w/2
        it.obj.position.x += cursor + w / 2;
        cursor += w + spacing;
    }

    // 中央モデルのみにカメラをフィット（ユーザー要求: 今見ているモデル以外は距離計算に含めない）
    let centerObj = null;
    for (const it of instances) {
        if (it.idx === centerIdx) { centerObj = it.obj; break; }
    }

    // fallback: 全体を使う
    displayedGroup.updateMatrixWorld(true);
    const overall = new THREE.Box3().setFromObject(displayedGroup);
    const overallCenter = overall.getCenter(new THREE.Vector3());

    let useCenterCenter = overallCenter;
    let radius = 0.0001;
    if (centerObj) {
        const box = new THREE.Box3().setFromObject(centerObj);
        const sph = box.getBoundingSphere(new THREE.Sphere());
        radius = Math.max(sph.radius, 0.0001);
        useCenterCenter = box.getCenter(new THREE.Vector3());
    } else {
        const sph = overall.getBoundingSphere(new THREE.Sphere());
        radius = Math.max(sph.radius, 0.0001);
    }

    // カメラの FOV を考慮して必要な距離を計算（縦/横のどちらか広い方に合わせる）
    const vFOV = (camera.fov * Math.PI) / 180; // radians
    const aspect = camera.aspect;
    const hFOV = 2 * Math.atan(Math.tan(vFOV / 2) * aspect);
    const distByV = radius / Math.sin(vFOV / 2);
    const distByH = radius / Math.sin(hFOV / 2);
    const distance = Math.max(distByV, distByH) * 1.25;

    // カメラを中央モデルの中心から斜め上方に配置（ただし即時移動はせずパンアニメーションで移動する）
    const dir = new THREE.Vector3(1, 0.6, 1).normalize();
    const desiredPos = new THREE.Vector3().copy(useCenterCenter).addScaledVector(dir, distance);
    const desiredTarget = useCenterCenter.clone();
    if (options.skipPan) {
        // 直接配置（パンなし）
        camera.position.copy(desiredPos);
        controls.target.copy(desiredTarget);
        controls.update();
        initialCameraPos = camera.position.clone();
        initialTarget = controls.target.clone();
    } else {
        // パンを開始（現在位置 -> desiredPos）
        panFromPos = camera.position.clone();
        panToPos = desiredPos.clone();
        panFromTarget = controls.target.clone();
        panToTarget = desiredTarget.clone();
        panStartTime = performance.now();
        isPanning = true;
        // パン中はユーザー操作を一時無効化
        controls.enabled = false;
        controls.autoRotate = false;
    }

    // カメラ最小距離を更新（モデルに近づきすぎないようにする）
    const boundingRadius = radius;
    minCameraDistance = Math.max(boundingRadius * 0.75, distance * 0.25);
    controls.minDistance = minCameraDistance;
    controls.maxDistance = Math.max(controls.maxDistance || 0, boundingRadius * 20, distance * 5);
    // 保存
    initialCameraPos = camera.position.clone();
    initialTarget = controls.target.clone();

    // set current index
    currentIndex = centerIdx;
    window.__mouseModelUrl = modelList[centerIdx];
    // グローバル `model` を現在の中央モデルに更新して既存のUI/操作と整合
    model = centerObj || null;
    // UI にモデル情報を表示
    try { updateModelInfo(currentIndex); } catch (e) { }
    // ブラウザのURLを更新（クエリパラメータ model に現在のモデルURLを設定）
    try {
        const u = new URL(window.location.href);

        u.searchParams.set('model', modelList[centerIdx]);

        window.history.replaceState(null, '', u.toString());
    } catch (e) {
        // ignore if URL API not available
    }
}

async function setModelByIndex(idx) {
    // wrapper kept for compatibility; now uses updateDisplayedModels
    await updateDisplayedModels(idx);
}

async function initModelList() {
    const list = await fetchModelsJson();
    if (list && list.length > 0) {
        modelList = list;
    } else {
        modelList = [window.__mouseModelUrl];
    }
    // 現在の URL に合わせて index を選定
    const idx = modelList.findIndex(u => u === window.__mouseModelUrl);
    currentIndex = idx >= 0 ? idx : 0;
    await setModelByIndex(currentIndex);
}

// UI / キーボード操作
const prevBtn = document.getElementById('prevModel');
const nextBtn = document.getElementById('nextModel');

// DOM 要素参照（モデル情報表示）
const modelNameEl = document.getElementById('modelName');
const modelAuthorEl = document.getElementById('modelAuthor');

function extractNameFromUrl(url) {
    try {
        const u = url.split('/').pop();
        return decodeURIComponent(u || url);
    } catch (e) { return url; }
}

function updateModelInfo(idx) {
    if (!modelNameEl) return;
    const meta = (modelMetaList && modelMetaList[idx]) ? modelMetaList[idx] : null;
    let name = null;
    let author = null;
    if (meta) {
        if (typeof meta === 'string') {
            name = extractNameFromUrl(meta);
        } else if (typeof meta === 'object') {
            name = meta.name || meta.title || meta.filename || null;
            author = meta.author || meta.creator || null;
        }
    }
    // fallback to modelList URL
    if (!name && modelList && modelList[idx]) name = extractNameFromUrl(modelList[idx]);
    modelNameEl.textContent = name ? String(name) : '---';
    if (modelAuthorEl) {
        modelAuthorEl.textContent = author ? '作者: ' + String(author) : '';
    }
}

if (prevBtn) prevBtn.addEventListener('click', () => {
    if (!modelList || modelList.length === 0) return;
    const ni = (currentIndex - 1 + modelList.length) % modelList.length;
    switchToIndexWithSidePan(ni, 'left');
});
if (nextBtn) nextBtn.addEventListener('click', () => {
    if (!modelList || modelList.length === 0) return;
    const ni = (currentIndex + 1) % modelList.length;
    switchToIndexWithSidePan(ni, 'right');
});

window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
        prevBtn && prevBtn.click();
    } else if (e.key === 'ArrowRight') {
        nextBtn && nextBtn.click();
    }
});

// 切替: まず現在の側面モデル位置へパンして、その間に次のモデルをプリロードし、
// パン完了後に表示を中心を新しいインデックスへ更新（パンなしでリビルド）
async function switchToIndexWithSidePan(targetIdx, direction) {
    if (isPanning) return; // 既にパン中は無視
    // 方向に応じた sideIdx を探す（現在の displayedGroup にあるモデルの index）
    const sideIdx = targetIdx; // targetIdx is the index we want to center after switching

    // find the side object's world center (the object that currently occupies that side)
    let sideObj = null;
    for (const child of displayedGroup.children) {
        // children don't store idx, but instances array contained idx earlier; workaround: approximate by position x
        // find the child whose x position is positive for right, negative for left (closest to that side)
        // compute child world center
        const box = new THREE.Box3().setFromObject(child);
        const c = box.getCenter(new THREE.Vector3());
        if (direction === 'right' && c.x > 0) { sideObj = child; break; }
        if (direction === 'left' && c.x < 0) { sideObj = child; break; }
    }

    // preload the target's neighbors (especially the new side) to reduce waiting
    const preloadIdx = (direction === 'right') ? targetIdx + 1 : targetIdx - 1;
    if (preloadIdx >= 0 && preloadIdx < modelList.length) {
        const preloadUrl = modelList[preloadIdx];
        // start preload but don't await fully (cache will fill when available)
        getInstanceForUrl(preloadUrl).catch(() => { });
    }

    if (!sideObj) {
        // fallback: just update immediately
        await updateDisplayedModels(targetIdx, { skipPan: true });
        return;
    }

    // compute side center and decide camera desired position relative to it
    const sideBox = new THREE.Box3().setFromObject(sideObj);
    const sideCenter = sideBox.getCenter(new THREE.Vector3());
    const sideSphere = sideBox.getBoundingSphere(new THREE.Sphere());
    const sideRadius = Math.max(sideSphere.radius, 0.0001);

    // compute distance using FOV like before
    const vFOV = (camera.fov * Math.PI) / 180;
    const aspect = camera.aspect;
    const hFOV = 2 * Math.atan(Math.tan(vFOV / 2) * aspect);
    const distByV = sideRadius / Math.sin(vFOV / 2);
    const distByH = sideRadius / Math.sin(hFOV / 2);
    const distance = Math.max(distByV, distByH) * 1.1; // slightly tighter when panning to side

    const dirVec = new THREE.Vector3(direction === 'right' ? 1 : -1, 0.6, 1).normalize();
    const desiredPos = new THREE.Vector3().copy(sideCenter).addScaledVector(dirVec, distance);

    // start pan to side
    panFromPos = camera.position.clone();
    panToPos = desiredPos.clone();
    panFromTarget = controls.target.clone();
    panToTarget = sideCenter.clone();
    panStartTime = performance.now();
    isPanning = true;
    controls.enabled = false;

    // wait for pan to finish
    await new Promise((resolve) => {
        const check = () => {
            if (!isPanning) resolve();
            else requestAnimationFrame(check);
        };
        check();
    });

    // after pan complete, rebuild displayed models centered at targetIdx without pan
    await updateDisplayedModels(targetIdx, { skipPan: true });
}

// 初期化実行
initModelList();

// 追加: メタリック適用/復元
function applyMetallicMode(enabled) {
    metallicMode = !!enabled;
    const root = model || displayedGroup;
    root.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m => {
            if (!m) return;
            // 元情報が無ければ現在値を元情報として初期化しておく
            if (!originalMaterialProps.has(m)) {
                originalMaterialProps.set(m, {
                    color: m.color ? m.color.clone() : null,
                    metalness: ('metalness' in m) ? m.metalness : undefined,
                    roughness: ('roughness' in m) ? m.roughness : undefined
                });
            }
            const orig = originalMaterialProps.get(m);
            if (orig) {
                if ('metalness' in m && typeof orig.metalness !== 'undefined') {
                    m.metalness = metallicMode ? 1.0 : orig.metalness;
                }
                if ('roughness' in m && typeof orig.roughness !== 'undefined') {
                    m.roughness = metallicMode ? 0.15 : orig.roughness;
                }
                m.needsUpdate = true;
            }
        });
    });
}

// 追加: 色なしモードの適用（色の復元／無効化）
function applyNoColorMode(enabled) {
    noColorMode = !!enabled;
    if (colorPicker) colorPicker.disabled = noColorMode;
    const root = model || displayedGroup;
    root.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m => {
            if (!m) return;
            // 元情報が無ければ現在の色を元情報として保存
            if (!originalMaterialProps.has(m)) {
                originalMaterialProps.set(m, {
                    color: m.color ? m.color.clone() : null,
                    metalness: ('metalness' in m) ? m.metalness : undefined,
                    roughness: ('roughness' in m) ? m.roughness : undefined
                });
            }
            const orig = originalMaterialProps.get(m);
            if (orig && orig.color) {
                // 色は常に元に戻す（noColor:true では元色、false ではカラーピッカー色を適用）
                if (noColorMode) {
                    m.color.copy(orig.color);
                } else if (colorPicker && colorPicker.value) {
                    m.color.set(colorPicker.value);
                }
                m.needsUpdate = true;
            }
        });
    });
}

// UI イベントを追加
const metallicToggle = document.getElementById('metallicToggle');
const noColorToggle = document.getElementById('noColorToggle');

if (metallicToggle) {
    metallicToggle.checked = metallicMode;
    metallicToggle.addEventListener('change', (e) => {
        console.log('[mouse-3d-anime] metallicToggle change ->', e.target.checked);
        applyMetallicMode(e.target.checked);
    });
}

if (noColorToggle) {
    noColorToggle.checked = noColorMode;
    noColorToggle.addEventListener('change', (e) => {
        console.log('[mouse-3d-anime] noColorToggle change ->', e.target.checked);
        applyNoColorMode(e.target.checked);
    });
}

// colorPicker の既存イベントは残るが、適用時に noColorMode をチェックする（上で setModelColor を修正済み）
// ----------------------------------------------------
// モデルを画面にフィットする
// ----------------------------------------------------
function fitModelToView() {
    if (!model) return;

    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3()).length();
    const center = box.getCenter(new THREE.Vector3());

    model.position.x += (model.position.x - center.x);
    model.position.y += (model.position.y - center.y);
    model.position.z += (model.position.z - center.z);

    camera.position.set(size * 1.2, size * 0.8, size * 1.2);
    controls.target.copy(center);
    // モデルの大きさからカメラの最小距離を設定（少し余裕を持たせる）
    const boundingRadius = size * 0.5;
    minCameraDistance = boundingRadius * 1.05; // 5%の余裕
    controls.minDistance = minCameraDistance;
    // 任意で最大距離も設定しておく
    controls.maxDistance = Math.max(controls.maxDistance || 0, boundingRadius * 10);
    // 初期カメラ位置とターゲットを保存（戻す際に使う）
    initialCameraPos = camera.position.clone();
    initialTarget = controls.target.clone();
}

// ----------------------------------------------------
// カメラ自動回転（5秒無操作で復帰）
// ----------------------------------------------------
let lastMoveTime = Date.now();
let autoRotate = true;
let prevAutoRotate = autoRotate;

controls.addEventListener("start", () => {
    autoRotate = false;
    lastMoveTime = Date.now();
});

controls.addEventListener("end", () => {
    lastMoveTime = Date.now();
});

function updateAutoRotate() {
    if (!autoRotate && Date.now() - lastMoveTime > 5000) {
        autoRotate = true;
    }

    // 自動回転復帰の検出と復帰アニメーションの開始
    if (autoRotate && !prevAutoRotate) {
        // autoRotate が false -> true に変化したとき
        if (initialCameraPos && initialTarget) {
            isReturningToInit = true;
            returnStartTime = performance.now();
            // 復帰中は controls の手入力を一時的に無効化
            controls.enabled = false;
            controls.autoRotate = false;
        } else {
            controls.autoRotate = true;
        }
    }

    // 継続的に autoRotate フラグに応じて速度を設定
    if (!isReturningToInit) {
        controls.autoRotate = !!autoRotate;
        controls.autoRotateSpeed = userAutoRotateSpeed;
    }

    prevAutoRotate = autoRotate;
}

function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ----------------------------------------------------
// ループ
// ----------------------------------------------------
function animate() {
    requestAnimationFrame(animate);
    updateAutoRotate();
    controls.update();
    // AnimationMixers update
    const delta = clock.getDelta();
    if (activeMixers.size > 0) {
        activeMixers.forEach(m => { try { m.update(delta); } catch (e) { console.warn('mixer update failed', e); } });
    }
    // カメラパンの進行処理
    if (isPanning) {
        const now = performance.now();
        const tRaw = Math.min(1, (now - panStartTime) / panDuration);
        const t = easeInOutCubic(tRaw);
        if (panFromPos && panToPos) camera.position.lerpVectors(panFromPos, panToPos, t);
        if (panFromTarget && panToTarget) controls.target.lerpVectors(panFromTarget, panToTarget, t);
        // 終了処理
        if (tRaw >= 1) {
            isPanning = false;
            controls.enabled = true;
            controls.update();
            // 保存
            initialCameraPos = camera.position.clone();
            initialTarget = controls.target.clone();
            // 自動回転フラグを復元
            controls.autoRotate = autoRotate;
            controls.autoRotateSpeed = userAutoRotateSpeed;
        }
    }
    // カメラがターゲットに近づきすぎていないかチェックして補正
    if (minCameraDistance > 0) {
        const toCamera = new THREE.Vector3().subVectors(camera.position, controls.target);
        const dist = toCamera.length();
        if (dist < minCameraDistance) {
            toCamera.setLength(minCameraDistance);
            camera.position.copy(controls.target).add(toCamera);
        }
    }

    // 初期位置への滑らかな復帰処理
    if (isReturningToInit && initialCameraPos && initialTarget) {
        const now = performance.now();
        const t = Math.min(1, (now - returnStartTime) / returnDuration);

        // カメラ位置とターゲットを補間
        camera.position.lerpVectors(camera.position, initialCameraPos, t);
        controls.target.lerpVectors(controls.target, initialTarget, t);

        // 補間完了時の処理
        if (t >= 1) {
            isReturningToInit = false;
            controls.enabled = true;
            controls.update();
            // 復帰が完了したら自動回転を有効にする
            controls.autoRotate = true;
            controls.autoRotateSpeed = userAutoRotateSpeed;
        }
    }

    renderer.render(scene, camera);
}
animate();

// ----------------------------------------------------
// リサイズ
// ----------------------------------------------------
window.addEventListener("resize", () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
});
