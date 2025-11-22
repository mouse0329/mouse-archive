import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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

function setModelColor(hex) {
    if (!model) return;
    model.traverse((o) => {
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

loader.load(
    "https://mouse-archive.web.app/models/cheese-umbrella-v4.glb",
    (gltf) => {
        model = gltf.scene;

        // 影 ON
        model.traverse((o) => {
            if (o.isMesh) {
                o.castShadow = true;
                o.receiveShadow = true;

                // 金属っぽい質感
                if (o.material) {
                    o.material.metalness = 1.0;
                    o.material.roughness = 0.15;
                }
            }
        });

        // カラーピッカーの値があれば初期色として適用
        if (colorPicker && colorPicker.value) {
            setModelColor(colorPicker.value);
            updateColorPickerBackground(colorPicker.value);
        }

        scene.add(model);

        // 自動フィット
        fitModelToView();
    }
);

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

// ----------------------------------------------------
// ループ
// ----------------------------------------------------
function animate() {
    requestAnimationFrame(animate);
    updateAutoRotate();
    controls.update();
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
