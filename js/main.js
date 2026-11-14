import { OfficeNavigation, setNavigationThree } from "./collision.js";





// =================================================================
// 01 / COLLISION + PATHFINDING — будущий collision.js
// =================================================================

// =====================================================================
// 01 / INPUT SECURITY — future js/input-validation.js
// Client-side validation is UX and defense-in-depth, NOT server security.
// Do not treat localStorage or imported JSON as trusted server input.
// =====================================================================
const INPUT_RULES = Object.freeze({
  personName: {max:40, pattern:/^[\p{L}\p{M}0-9 .'-]+$/u},
  personRole: {max:50, pattern:/^[\p{L}\p{M}0-9 .()'/-]+$/u},
  personDepartment: {max:50, pattern:/^[\p{L}\p{M}0-9 .()'/-]+$/u},
  taskTitle: {max:60, pattern:/^[\p{L}\p{M}0-9 .,:;!?()№+\-]+$/u},
  taskPrompt: {max:500, multiline:true}
});
function cleanUserText(value, rule = {max:60}) {
  const max = rule.max || 60;
  let text = String(value ?? '').normalize('NFC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[<>]/g, '')
    .replace(rule.multiline ? /[ \t]{2,}/g : /\s+/g, ' ')
    .slice(0,max);
  if (!rule.multiline) text = text.replace(/[^\p{L}\p{M}0-9 .,:;!?()№+'\/-]/gu,'');
  return text;
}
function validatedText(id, {required = false} = {}) {
  const el = document.getElementById(id);
  if (!el) throw new Error('Поле не найдено: ' + id);
  const rule = INPUT_RULES[id] || {max:60};
  const cleaned = cleanUserText(el.value, rule).trim();
  if (required && !cleaned) throw new Error('Заполните поле: ' + (el.labels?.[0]?.textContent || id));
  if (rule.pattern && cleaned && !rule.pattern.test(cleaned)) throw new Error('Недопустимый формат: ' + id);
  if (cleaned !== el.value.trim()) el.value = cleaned;
  return cleaned;
}
// Input event works for keyboard, paste and mobile text entry.
document.addEventListener('input', e => {
  const el = e.target;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
  if (el.isComposing || !INPUT_RULES[el.id]) return;
  const cleaned = cleanUserText(el.value, INPUT_RULES[el.id]);
  if (cleaned !== el.value) el.value = cleaned;
});
document.addEventListener('compositionend', e => {
  const el=e.target;
  if (INPUT_RULES[el?.id]) el.value=cleanUserText(el.value,INPUT_RULES[el.id]);
});

// OfficeNavigation импортирован из ./collision.js.


// =================================================================
// 02 / GAME STATE + UTILITIES — будущий state.js
// =================================================================
const $ = id => document.getElementById(id);
const STORAGE = "sosiska-office-v3";

let THREE;
let OrbitControls;
let GLTFLoader;

let scene;
let renderer;
let camera;
let controls;
let raycaster;
let mouse;
let clock;
let loader;
let navigation;
let grid;

let officeRoot = null;
let personTemplate = null;
let selected = null;

let initialized = false;
let initializing = null;
let assetResults = { office: null, person: null };
let running = false;
let collisions = true;
let funds = 500;

const employees = [];
const keys = new Set();

let pointerDown = null;
let toastTimer = null;

function uid() {
  return crypto.randomUUID?.() ||
    String(Date.now() + Math.random());
}

function safe(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[c]
  );
}

function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(
    () => $("toast").classList.remove("show"),
    2500
  );
}

function progress(value, text) {
  window.dispatchEvent(new CustomEvent("office-loading",{detail:{value:Math.round(75+value*0.25),text}}));
  $("progressBar").style.width = value + "%";
  $("loadingText").textContent = text;
}

function modal(title, content) {
  $("modalTitle").textContent = title;
  $("modalBody").innerHTML = content;
  $("modal").classList.remove("hidden");
}

function closeModal() {
  $("modal")?.querySelector(".dialog")?.classList.remove("market-dialog");
  $("modal").classList.add("hidden");
  $("modalBody").replaceChildren();
}

$("closeModal").onclick = closeModal;

$("modal").addEventListener("pointerdown", e => {
  if (e.target === $("modal")) closeModal();
});

function tile(id, title, description, color = "blue") {
  return `
    <button id="${id}" class="tile tile-${color}">
      <strong>${safe(title)}</strong>
      <small>${safe(description)}</small>
    </button>
  `;
}

function field(label, id, value = "") {
  return `
    <div class="field">
      <label for="${id}">${safe(label)}</label>
      <input id="${id}" type="text" maxlength="60" minlength="1" autocomplete="off" spellcheck="false" inputmode="text"
             value="${safe(value)}">
    </div>
  `;
}

function updateCounts() {
  $("employeeCount").textContent =
    "Сотрудники: " + employees.length;

  $("taskCount").textContent =
    "Задания: " + employees.reduce(
      (sum, p) => sum + p.tasks.length, 0
    );
}

// --------------------------------------------
// СОЗДАНИЕ 3D ТОЛЬКО ПОСЛЕ СТАРТА
// --------------------------------------------


// =================================================================
// 03 / THREE.JS INITIALIZATION — будущий scene.js
// =================================================================
async function initialize3D() {
  if (initialized) return;
  if (initializing) return initializing;

  initializing = (async () => {
    progress(5, "Загрузка графического движка...");

    const [
      threeModule,
      controlsModule,
      loaderModule
    ] = await Promise.all([
      import("three"),
      import("three/addons/controls/OrbitControls.js"),
      import("three/addons/loaders/GLTFLoader.js")
    ]);

    THREE = threeModule;
    setNavigationThree(THREE);
    OrbitControls = controlsModule.OrbitControls;
    GLTFLoader = loaderModule.GLTFLoader;

    progress(20, "Создание 3D-пространства...");

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xa8bbcf);

    renderer = new THREE.WebGLRenderer({
      canvas: $("scene"),
      antialias: true
    });

    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, 2)
    );
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = false; // Тени отключены по запросу (включая 3D-сцену).
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    camera = new THREE.PerspectiveCamera(
      45, 1, 0.1, 500
    );
    camera.position.set(0, 25, 0.01); // Старт строго над офисом

    controls = new OrbitControls(camera, $("scene"));
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.minDistance = 1.2;
    controls.maxDistance = 50; // МЕТРЫ: максимальное расстояние камеры от controls.target (центра вращения) — 50 м. Three.js: 1 единица = 1 м.
    controls.maxPolarAngle = Math.PI / 2.03;
    controls.screenSpacePanning = true;
    controls.rotateSpeed = 0.8;
    controls.zoomSpeed = 1.1;
    controls.panSpeed = 1.2;

    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN
    };

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    clock = new THREE.Clock();
    loader = new GLTFLoader();
    navigation = new OfficeNavigation();

    scene.add(new THREE.HemisphereLight(
      0xffffff, 0x8094aa, 2
    ));

    const sun = new THREE.DirectionalLight(
      0xffffff, 2
    );
    sun.position.set(12, 28, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -35;
    sun.shadow.camera.right = 35;
    sun.shadow.camera.top = 35;
    sun.shadow.camera.bottom = -35;
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshStandardMaterial({
        color: 0xd6e0eb,
        roughness: 1
      })
    );

    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.025;
    ground.receiveShadow = true;
    ground.name = "OptionalBackgroundGround";
    ground.visible = false; // По умолчанию большой белый фон-пол отключён. Пол GLB-офиса остаётся видимым.
    scene.add(ground);
    window.officeGround = ground; // Настройки: можно включить большой фон-пол отдельно.

    grid = new THREE.GridHelper(
      70, 70, 0x8099b0, 0xc0cfdf
    );
    grid.visible = false;
    scene.add(grid);

    progress(40, "Загрузка модели офиса...");

    const office = await loadGLB("./models/office.glb", "office");

    if (office) {
      officeRoot = office;
      scene.add(officeRoot);
    } else {
      officeRoot = demoOffice();
    }

    navigation.build(officeRoot, !office);
    refreshBuildGrid();

    progress(75, "Загрузка персонажа...");

    const person = await loadGLB("./models/sosiska.glb", "person");

    if (person) {
      // Обёртка сохраняет поправку высоты при клонировании и перемещении.
      fitModel(person, 0.20);
      personTemplate = new THREE.Group();
      personTemplate.add(person);
    } else {
      personTemplate = demoPerson();
    }

    personTemplate.traverse(node => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });

    bindSceneControls();
    resize();

    new ResizeObserver(resize).observe($("viewport"));

    initialized = true;
    progress(100, "3D-сцена готова");
    // После фактической загрузки сразу показываем игровой мир.
    if (localStorage.getItem(STORAGE)) loadGame();
    if (!running) newGame();
    window.dispatchEvent(new Event("office-ready"));

    animate();
  })();

  try {
    await initializing;
  } finally {
    initializing = null;
  }
}

// Загрузка GLB из папки проекта. Показываем реальный результат в стартовом окне.
async function loadGLB(path, kind) {
  const status = document.querySelector(`[data-model="${kind}"]`);
  try {
    const gltf = await loader.loadAsync(path, event => {
      if (event.total > 0) {
        const percent = Math.round(event.loaded / event.total * 100);
        if (status) status.textContent = `Загрузка: ${percent}%`;
      }
    });
    if(!gltf.scene) throw Error('GLB не содержит сцены');
    let meshes=0, triangles=0;
    gltf.scene.traverse(o=>{if(o.isMesh){meshes++; const g=o.geometry; if(g?.index)triangles+=Math.floor(g.index.count/3);else if(g?.attributes?.position)triangles+=Math.floor(g.attributes.position.count/3);}});
    const bounds=new THREE.Box3().setFromObject(gltf.scene);
    const sz=bounds.getSize(new THREE.Vector3());
    if(!meshes || ![sz.x,sz.y,sz.z].every(Number.isFinite) || Math.max(sz.x,sz.y,sz.z)>10000)throw Error('Неверная геометрия GLB');
    console.info('[GLB]',path,{meshes,triangles,size:sz.toArray()});
    if(triangles>350000)console.warn('Тяжёлая модель, рекомендуется оптимизация:',path,triangles);
    assetResults[kind] = true;
    if (status) { status.textContent = "Загружена ✓"; status.style.color = "#78d9ae"; }
    return gltf.scene;
  } catch (error) {
    assetResults[kind] = false;
    if (status) { status.textContent = "Не найдена — демо"; status.style.color = "#e8b578"; }
    console.warn("Не удалось загрузить модель:", path, error);
    return null;
  }
}

function resize() {
  if (!renderer || !camera) return;

  const el = $("viewport");
  const width = el.clientWidth;
  const height = el.clientHeight;

  if (!width || !height) return;

  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function box(w, h, d, color, x, y, z, parent) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.75
    })
  );

  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);

  return mesh;
}

// --------------------------------------------
// ДЕМОНСТРАЦИОННЫЙ ОФИС
// --------------------------------------------


// =================================================================
// 04 / DEMO OFFICE — будущий demo-office.js
// =================================================================
function demoOffice() {
  const root = new THREE.Group();
  root.name = "Демонстрационный офис";
  scene.add(root);

  box(18, 0.25, 13, 0xb9c9d9, 0, -0.13, 0, root);
  box(18, 2.4, 0.18, 0xd8e5f0, 0, 1.1, -6.5, root);
  box(0.18, 2.4, 13, 0xd8e5f0, -9, 1.1, 0, root);

  for (let i = 0; i < 5; i++) {
    box(
      1.5, 1.3, 0.04, 0x91b9d8,
      -6.5 + i * 3, 1.2, -6.38, root
    );
  }

  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const x = -5.5 + col * 5.5;
      const z = -2.8 + row * 5.2;

      box(2.5, 0.15, 1.3, 0xaebfd0, x, 1, z, root);

      for (const dx of [-1, 1]) {
        for (const dz of [-0.45, 0.45]) {
          box(
            0.12, 0.95, 0.12, 0x748ba2,
            x + dx, 0.48, z + dz, root
          );
        }
      }

      box(0.9, 0.6, 0.08, 0x293c50, x, 1.45, z - 0.35, root);
      box(0.95, 0.06, 0.5, 0x8398b0, x, 1.06, z + 0.1, root);
      box(0.9, 0.12, 0.8, 0x58718e, x, 0.48, z + 1.2, root);
      box(0.12, 0.65, 0.12, 0x58718e, x, 0.8, z + 1.5, root);
    }
  }

  box(2.2, 1.8, 0.7, 0x7794b0, 7.1, 0.9, -4.6, root);
  return root;
}

// --------------------------------------------
// ДЕМОНСТРАЦИОННАЯ СОСИСКА
// --------------------------------------------


// =================================================================
// 05 / DEMO CHARACTER — будущий demo-person.js
// =================================================================
function demoPerson() {
  const root = new THREE.Group();

  const skin = new THREE.MeshStandardMaterial({
    color: 0xd78b69,
    roughness: 0.85
  });

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.43, 0.85, 8, 16),
    skin
  );
  body.position.y = 1.18;
  root.add(body);

  for (const x of [-0.18, 0.18]) {
    const leg = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.13, 0.38, 4, 10),
      skin
    );
    leg.position.set(x, 0.35, 0);
    root.add(leg);
  }

  for (const x of [-0.52, 0.52]) {
    const arm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.10, 0.55, 4, 10),
      skin
    );
    arm.position.set(x, 1.25, 0);
    arm.rotation.z = x > 0 ? -0.22 : 0.22;
    root.add(arm);
  }

  const eyeMaterial = new THREE.MeshStandardMaterial({
    color: 0x20242b
  });

  for (const x of [-0.16, 0.16]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 12, 8),
      eyeMaterial
    );
    eye.position.set(x, 1.64, 0.4);
    root.add(eye);
  }

  const mouth = new THREE.Mesh(
    new THREE.TorusGeometry(
      0.12, 0.025, 6, 16, Math.PI
    ),
    new THREE.MeshStandardMaterial({
      color: 0x743f3d
    })
  );

  mouth.position.set(0, 1.37, 0.43);
  mouth.rotation.z = Math.PI;
  root.add(mouth);

  return root;
}

function fitModel(group, height) {
  group.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(group);
  const size = bounds.getSize(new THREE.Vector3());

  if (size.y < 0.00001) return;

  group.scale.multiplyScalar(height / size.y);
  group.updateMatrixWorld(true);

  const bottom = new THREE.Box3().setFromObject(group).min.y;
  group.position.y -= bottom;
}

// --------------------------------------------
// СОТРУДНИКИ
// --------------------------------------------


// =================================================================
// 06 / EMPLOYEE CREATION — будущий employees.js
// =================================================================
function spawn(data = {}) {
  if (!personTemplate) return null;

  if (employees.length >= 30) {
    toast("Максимум 30 сотрудников");
    return null;
  }

  const id = data.id || uid();
  const root = personTemplate.clone(true);

  const x = Number(
    data.x ?? (-4 + employees.length % 5 * 2)
  );

  const z = Number(
    data.z ?? (3 + Math.floor(employees.length / 5) * 2)
  );

  const position = navigation.nearestFree(x, z);

  if (!position) {
    toast("Нет свободного места");
    return null;
  }

  root.position.copy(position);
  // Ставим модель подошвами над полом, независимо от origin импортированного GLB.
  root.updateMatrixWorld(true);
  const spawnBounds = new THREE.Box3().setFromObject(root);
  if (!spawnBounds.isEmpty()) root.position.y += officeFloorHeight() + 0.035 - spawnBounds.min.y;
  root.rotation.y = Number(data.heading || 0);

  root.traverse(node => {
    node.userData.employeeId = id;
  });

  scene.add(root);

  const bounds = new THREE.Box3().setFromObject(root);

  const person = {
    id,
    root,
    name: data.name ||
      ["Алекс", "Макс", "Дэн", "Лео", "Ник"][employees.length % 5],
    role: data.role || "Сотрудник",
    department: data.department || "Офис",
    tasks: Array.isArray(data.tasks) ? data.tasks : [],
    headHeight: Math.max(
      0.5,
      bounds.max.y - root.position.y
    ),
    emotionName: data.emotionName || "Нейтрально",
    emotion: null,
    emotionIcon: null,
    emotionUntil: 0,
    nextEmotionAt: performance.now() + 1000 * (10 + Math.random() * 5),
    // Независимый контроллер поведения каждого сотрудника
    ai: { nextWalkAt: performance.now() + 1500 + Math.random() * 5500,
          manualUntil: 0, idleUntil: 0, lastPosition: null },
    path: [],
    target: null
  };

  employees.push(person);

  if (!selected) selected = person;

  // Значок появляется по таймеру; сохранённое название остаётся в данных.


  updateCounts();
  return person;
}

function clearPeople() {
  for (const person of employees) {
    scene.remove(person.root);

    if (person.emotion) {
      scene.remove(person.emotion);
      person.emotion.material.map?.dispose();
      person.emotion.material.dispose();
    }
    person.emotionIcon?.remove();
  }

  employees.length = 0;
  selected = null;
  updateCounts();
}

function newGame() {
  clearPeople();
  funds = 500;
  clearFurniture();

  for (let i = 0; i < 5; i++) spawn();

  running = true;
  $("start").classList.add("hidden");
  toast("Новая игра запущена");
}


// =================================================================
// 07 / SAVE + LOAD — будущий storage.js
// =================================================================
function serialize() {
  return {
    version: 3,
    funds,
    employees: employees.map(p => ({
      id: p.id,
      name: p.name,
      role: p.role,
      department: p.department,
      x: p.root.position.x,
      z: p.root.position.z,
      heading: p.root.rotation.y,
      tasks: p.tasks,
      emotionName: p.emotionName
    })),
    furniture: furnitureSerialize(),
    buildCell: buildCellSize,
    camera: {
      position: camera.position.toArray(),
      target: controls.target.toArray()
    }
  };
}

function save() {
  if (!initialized) return;

  try {
    localStorage.setItem(
      STORAGE,
      JSON.stringify(serialize())
    );

    $("saveStatus").textContent = "Сохранено";
    toast("Сохранение выполнено");
  } catch (error) {
    toast("Ошибка сохранения: " + error.message);
  }
}

function loadGame() {
  const raw = localStorage.getItem(STORAGE);

  if (!raw) {
    toast("Сохранение отсутствует");
    return;
  }

  try {
    const data = JSON.parse(raw);

    if (!Array.isArray(data.employees)) {
      throw new Error("Неверный формат сотрудников");
    }

    clearPeople();

    funds = Number.isFinite(Number(data.funds)) ? Math.max(0,Math.min(10000000,Number(data.funds))) : 500;
    restoreFurniture(data.furniture, data.buildCell);

    for (const record of data.employees) {
      spawn(record);
    }

    if (
      Array.isArray(data.camera?.position) &&
      Array.isArray(data.camera?.target)
    ) {
      camera.position.fromArray(data.camera.position);
      controls.target.fromArray(data.camera.target);
      controls.update();
    }

    running = true;
    $("start").classList.add("hidden");
    toast("Игра загружена");
  } catch (error) {
    toast("Ошибка загрузки: " + error.message);
  }
}

// --------------------------------------------
// СТАРТОВЫЕ КНОПКИ
// --------------------------------------------

async function start(mode) {
  $("newGame").disabled = true;
  $("continueGame").disabled = true;

  try {
    await bootOffice();

    if (mode === "new") {
      newGame();
    } else {
      loadGame();
    }
  } catch (error) {
    console.error(error);
    progress(0, "Ошибка: " + error.message);
  } finally {
    $("newGame").disabled = false;
    $("continueGame").disabled =
      !localStorage.getItem(STORAGE);
  }
}

$("newGame").onclick = () => start("new");
$("continueGame").onclick = () => start("load");

$("continueGame").disabled =
  !localStorage.getItem(STORAGE);

$("fullscreen").onclick = async () => {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  } catch (error) {
    toast(error.message);
  }
};

// --------------------------------------------
// ВЫБОР И ПЕРЕМЕЩЕНИЕ
// --------------------------------------------

function setMouse(event) {
  const rect = $("scene").getBoundingClientRect();

  mouse.set(
    (event.clientX - rect.left) / rect.width * 2 - 1,
    -(event.clientY - rect.top) / rect.height * 2 + 1
  );

  raycaster.setFromCamera(mouse, camera);
}

function pickPerson(event) {
  setMouse(event);

  const hits = raycaster.intersectObjects(
    employees.map(p => p.root),
    true
  );

  for (const hit of hits) {
    const id = hit.object.userData.employeeId;
    const person = employees.find(p => p.id === id);
    if (person) return person;
  }

  return null;
}

function floorPoint(event) {
  setMouse(event);

  const point = new THREE.Vector3();

  const plane = new THREE.Plane(
    new THREE.Vector3(0, 1, 0),
    0
  );

  return raycaster.ray.intersectPlane(plane, point)
    ? point
    : null;
}

function setDestination(person, point) {
  // Ручной приказ имеет приоритет над автономным перемещением.
  if (person.ai) {
    person.ai.manualUntil = performance.now() + 20000;
    person.ai.nextWalkAt = person.ai.manualUntil + 2000;
  }
  const route = navigation.path(
    person.root.position,
    point
  );

  if (!route || !route.length) {
    toast("Маршрут заблокирован");
    return;
  }

  person.path = route;
  person.target = person.path.shift();
  toast("Маршрут построен");
}

function movePerson(person, dx, dz) {
  const old = person.root.position.clone();

  const next = navigation.move(old, dx, dz); // V14: границы и стены действуют всегда
  // Купленная мебель блокирует движение независимо от переключателя
  // «Коллизии»: выключение относится только к препятствиям офисного GLB.
  if (!collisions && furnitureBlocked(next.x, next.z, navigation.radius)) {
    const xOnly = old.x + dx, zOnly = old.z + dz;
    if (!furnitureBlocked(xOnly, old.z, navigation.radius)) next.x = xOnly;
    else if (!furnitureBlocked(old.x, zOnly, navigation.radius)) next.z = zOnly;
  }

  // Границы офиса действуют даже при
  // отключённых столкновениях с мебелью.
  if (!collisions) {
    const b = navigation.bounds;
    next.x = THREE.MathUtils.clamp(
      next.x, b.minX + 0.32, b.maxX - 0.32
    );
    next.z = THREE.MathUtils.clamp(
      next.z, b.minZ + 0.32, b.maxZ - 0.32
    );
  }

  person.root.position.set(next.x, old.y, next.z);

  const moved = old.distanceTo(next);

  if (moved > 0.00001) {
    person.root.rotation.y = Math.atan2(dx, dz);
  }

  return moved;
}


// =================================================================
// 08 / CAMERA + POINTER CONTROLS — будущий controls.js
// =================================================================
function bindSceneControls() {
  const canvas = $("scene");

  canvas.addEventListener("pointerdown", event => {
    pointerDown = {
      x: event.clientX,
      y: event.clientY,
      button: event.button
    };

    if (event.button === 0) {
      controls.mouseButtons.LEFT =
        event.shiftKey || keys.has("Space")
          ? THREE.MOUSE.PAN
          : THREE.MOUSE.ROTATE;
    }
  }, true);

  canvas.addEventListener("pointerup", event => {
    if (!running || !pointerDown) return;
    if (pointerDown.button !== 0) return;

    const distance = Math.hypot(
      event.clientX - pointerDown.x,
      event.clientY - pointerDown.y
    );

    if (distance > 5) return;

    const person = pickPerson(event);

    if (person) {
      selected = person;
      employeeCard(person);
    } else if (selected) {
      const point = floorPoint(event);
      if (point) setDestination(selected, point);
    }
  });

  canvas.addEventListener("contextmenu", event => {
    event.preventDefault();

    if (!running) return;

    const person = pickPerson(event);

    if (person) {
      selected = person;
      employeeCard(person);
    }
  });
}

// --------------------------------------------
// КАРТОЧКА СОТРУДНИКА
// --------------------------------------------


// =================================================================
// 09 / EMPLOYEE PANELS — будущий panels.js
// =================================================================
function employeeCard(person) {
  selected = person;

  modal("Карточка сотрудника", `
    ${field("Имя", "personName", person.name)}
    ${field("Должность", "personRole", person.role)}
    ${field("Отдел", "personDepartment", person.department)}

    <p class="muted">
      ID: ${safe(person.id)} ·
      Заданий: ${person.tasks.length}
    </p>

    <div class="actions">
      ${tile("pSave", "Сохранить", "Данные сотрудника", "gold")}
      ${tile("pTasks", "Задания", "Проекты и поручения", "blue")}
      ${tile("pEmotion", "Эмоции", "Мимика персонажа", "purple")}
      ${tile("pFocus", "Найти", "Камера на сотрудника", "green")}
      ${tile("pRotate", "Повернуть", "Поворот на 45°", "slate")}
      ${tile("pStop", "Остановить", "Прекратить движение", "slate")}
      ${tile("pDelete", "Удалить", "Убрать из офиса", "red")}
    </div>
  `);

  $("pSave").onclick = () => {
    person.name =
      validatedText("personName") || person.name;

    person.role =
      validatedText("personRole") || person.role;

    person.department =
      validatedText("personDepartment") || person.department;

    save();
    employeeCard(person);
  };

  $("pTasks").onclick = () => taskList(person);
  $("pEmotion").onclick = () => emotionMenu(person);

  $("pFocus").onclick = () => {
    focusPerson(person);
    closeModal();
  };

  $("pRotate").onclick = () => {
    person.root.rotation.y += Math.PI / 4;
    save();
    employeeCard(person);
  };

  $("pStop").onclick = () => {
    person.path = [];
    person.target = null;
    closeModal();
    toast(person.name + " остановлен");
  };

  $("pDelete").onclick = () => {
    if (!confirm("Удалить " + person.name + "?")) return;

    scene.remove(person.root);

    if (person.emotion) {
      scene.remove(person.emotion);
      person.emotion.material.map?.dispose();
      person.emotion.material.dispose();
    }
    person.emotionIcon?.remove();

    employees.splice(employees.indexOf(person), 1);
    selected = employees[0] || null;

    updateCounts();
    save();
    staffList();
  };
}

function staffList() {
  modal("Сотрудники", `
    <div class="list">
      ${employees.map(p => `
        <div class="item">
          <div>
            <strong>${safe(p.name)}</strong>
            <small>
              ${safe(p.role)} · ${safe(p.department)}
            </small>
          </div>
          <button data-person="${safe(p.id)}">Открыть</button>
        </div>
      `).join("") || '<p class="muted">Сотрудников нет</p>'}
    </div>

    <div class="actions">
      ${tile("addStaff", "+ Сотрудник", "Добавить персонажа", "gold")}
    </div>
  `);

  $("modalBody")
    .querySelectorAll("[data-person]")
    .forEach(button => {
      button.onclick = () => {
        const p = employees.find(
          x => x.id === button.dataset.person
        );
        if (p) employeeCard(p);
      };
    });

  $("addStaff").onclick = () => {
    const p = spawn();

    if (p) {
      save();
      employeeCard(p);
    }
  };
}

// --------------------------------------------
// ЗАДАНИЯ
// --------------------------------------------

function taskList(person) {
  modal("Задания: " + person.name, `
    <div class="list">
      ${person.tasks.map(task => `
        <div class="item">
          <div>
            <strong>${safe(task.title)}</strong>
            <small>${safe(task.status)}</small>
          </div>
          <button data-task="${safe(task.id)}">Открыть</button>
        </div>
      `).join("") || '<p class="muted">Заданий нет</p>'}
    </div>

    <div class="actions">
      ${tile("newTask", "Новое задание", "Создать поручение", "gold")}
      ${tile("backPerson", "Назад", "К сотруднику", "slate")}
    </div>
  `);

  $("modalBody")
    .querySelectorAll("[data-task]")
    .forEach(button => {
      button.onclick = () => {
        const task = person.tasks.find(
          t => t.id === button.dataset.task
        );
        taskDetail(person, task);
      };
    });

  $("newTask").onclick = () => taskEditor(person);
  $("backPerson").onclick = () => employeeCard(person);
}

function taskEditor(person) {
  modal("Создать задание", `
    <div class="field">
      <label>Тип задания</label>
      <select id="taskType">
        <option value="custom">Обычное поручение</option>
        <option value="walk">Перемещение по офису</option>
        <option value="image">ИИ-изображение (API не подключён)</option>
        <option value="chat">ИИ-чат (API не подключён)</option>
        <option value="read">Документ (обработчик не подключён)</option>
      </select>
    </div>

    ${field("Название", "taskTitle")}

    <div class="field">
      <label>Описание / промпт</label>
      <textarea id="taskPrompt" maxlength="500" spellcheck="false" placeholder="Текст задания (до 500 символов)"></textarea>
    </div>

    <div class="actions">
      ${tile("createTask", "Создать", "Добавить задание", "gold")}
      ${tile("cancelTask", "Назад", "Список заданий", "slate")}
    </div>
  `);

  $("createTask").onclick = () => {
    const title = validatedText("taskTitle");

    if (!title) {
      toast("Введите название");
      return;
    }

    if (person.tasks.length >= 25) {
      toast("Максимум 25 заданий");
      return;
    }

    const task = {
      id: uid(),
      title,
      type: $("taskType").value,
      prompt: validatedText("taskPrompt"),
      status: "Создано"
    };

    person.tasks.push(task);
    updateCounts();
    save();
    taskDetail(person, task);
  };

  $("cancelTask").onclick = () => taskList(person);
}

function taskDetail(person, task) {
  if (!task) return taskList(person);

  modal("Задание", `
    <h3>${safe(task.title)}</h3>
    <p class="muted">Статус: ${safe(task.status)}</p>
    <p style="white-space:pre-wrap">
      ${safe(task.prompt || "Описание отсутствует")}
    </p>

    <div class="actions">
      ${tile("completeTask", "Завершить", "Отметить вручную", "green")}
      ${tile("deleteTask", "Удалить", "Удалить задание", "red")}
      ${tile("backTasks", "Назад", "Список заданий", "slate")}
    </div>
  `);

  $("completeTask").onclick = () => {
    task.status = "Выполнено вручную";
    save();
    taskDetail(person, task);
  };

  $("deleteTask").onclick = () => {
    person.tasks.splice(person.tasks.indexOf(task), 1);
    updateCounts();
    save();
    taskList(person);
  };

  $("backTasks").onclick = () => taskList(person);
}

function allTasks() {
  modal("Все задания", `
    <div class="list">
      ${employees.flatMap(p =>
        p.tasks.map(t => `
          <div class="item">
            <div>
              <strong>${safe(t.title)}</strong>
              <small>${safe(p.name)} · ${safe(t.status)}</small>
            </div>
            <button data-owner="${safe(p.id)}"
                    data-task="${safe(t.id)}">
              Открыть
            </button>
          </div>
        `)
      ).join("") || '<p class="muted">Заданий нет</p>'}
    </div>

    <div class="actions">
      ${tile("allNewTask", "Создать", "Новое задание", "gold")}
    </div>
  `);

  $("modalBody")
    .querySelectorAll("[data-owner]")
    .forEach(button => {
      button.onclick = () => {
        const p = employees.find(
          x => x.id === button.dataset.owner
        );

        const t = p?.tasks.find(
          x => x.id === button.dataset.task
        );

        if (p && t) taskDetail(p, t);
      };
    });

  $("allNewTask").onclick = () => {
    if (selected) taskEditor(selected);
    else toast("Добавьте сотрудника");
  };
}

// --------------------------------------------
// ЭМОЦИИ НАД ГОЛОВОЙ
// --------------------------------------------

function emotionMenu(person) {
  const emotions = [
    "Радость",
    "Смех",
    "Грусть",
    "Удивление",
    "Сон",
    "Вопрос",
    "Нейтрально"
  ];

  modal("Эмоции: " + person.name, `
    <p class="muted">
      Эмоция находится непосредственно над головой.
    </p>

    <div class="actions">
      ${emotions.map((name, i) =>
        tile("emotion" + i, name, "Применить", "purple")
      ).join("")}
    </div>

    <button id="emotionBack">Назад</button>
  `);

  emotions.forEach((name, i) => {
    $("emotion" + i).onclick = () => {
      setEmotion(person, name);
      save();
      closeModal();
    };
  });

  $("emotionBack").onclick = () => employeeCard(person);
}

// Четыре изображения из папки emotion (регистр важен на GitHub Pages). Названия файлов можно менять здесь.
const EMOTION_ICONS = [
  {name:'Информация', file:'emo1.png', description:'Сведения о сотруднике: должность, отдел, задачи и текущее состояние.'},
  {name:'Внимание', file:'emo2.png', description:'Важное событие или предупреждение: проверьте задачи и маршрут сотрудника.'},
  {name:'Переживание', file:'emo3.png', description:'Сотрудник испытывает напряжение или усталость. Проверьте его текущую работу.'},
  {name:'Достижение', file:'emo4.png', description:'Положительное событие: успех, завершение работы или достижение.'}
];
const EMOTION_MIN_MS = 10000;
const EMOTION_MAX_MS = 15000;
const EMOTION_VISIBLE_MS = 3000;
const EMOTION_GAP = 0.015; // МЕТРЫ: 8 см от макушки до нижнего края иконки.
const EMOTION_ICON_SPACING_PX = 3; // ПИКСЕЛИ: расстояние между иконками при отображении нескольких рядом.
const EMOTION_ICON_SIZE_PX = 28; // ПИКСЕЛИ: единый экранный размер значка независимо от масштаба камеры.
let emotionProject = null; // THREE загружается асинхронно

function removeEmotionIcon(person) {
  person.emotionIcon?.remove();
  person.emotionIcon = null;
  person.emotion = null;
}
function showEmotionIcon(person, emotion = EMOTION_ICONS[Math.floor(Math.random()*EMOTION_ICONS.length)]) {
  removeEmotionIcon(person);
  person.emotionName = emotion.name;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'emotion-bubble';
  button.style.width = EMOTION_ICON_SIZE_PX + 'px';
  button.style.height = EMOTION_ICON_SIZE_PX + 'px';
  button.title = emotion.name;
  button.setAttribute('aria-label', emotion.name + ': ' + person.name);
  const img = document.createElement('img');
  img.alt = emotion.name;
  img.src = './emotion/' + emotion.file;
  img.onerror = () => { console.error('Не удалось загрузить эмоцию:', img.src); img.onerror = null; img.removeAttribute('src'); img.alt = emotion.name; };
  button.append(img);
  button.addEventListener('click', event => {
    event.stopPropagation();
    selected = person;
    emotionDetails(person, emotion);
  });
  $('emotionLayer').append(button);
  person.emotionIcon = button;
  person.emotionUntil = performance.now() + EMOTION_VISIBLE_MS;
}
function emotionDetails(person, emotion) {
  modal(emotion.name + ' — ' + person.name, `
    <p>${safe(emotion.description)}</p>
    <p class="muted">Сотрудник: ${safe(person.name)} · ${safe(person.role)} · ${safe(person.department)}</p>
    <p class="muted">Заданий: ${person.tasks.length}</p>
    <div class="actions">
      ${tile('emotionOpenEmployee','Карточка сотрудника','Подробнее о сотруднике','blue')}
      ${tile('emotionOpenTasks','Задания','Посмотреть задачи','gold')}
    </div>`);
  $('emotionOpenEmployee').onclick = () => employeeCard(person);
  $('emotionOpenTasks').onclick = () => taskList(person);
}
function setEmotion(person, name, notify = true) {
  if (name === 'Нейтрально') { removeEmotionIcon(person); person.emotionName = name; }
  else {
    const emotion = EMOTION_ICONS.find(e => e.name === name) || EMOTION_ICONS[0];
    showEmotionIcon(person, emotion);
  }
  if (notify) toast('Эмоция: ' + name);
}
function updateEmotionIcons(now) {
  if (!running || !camera) return;
  if (!emotionProject) emotionProject = new THREE.Vector3();
  const viewport = $('viewport');
  const w = viewport.clientWidth, h = viewport.clientHeight;
  for (const person of employees) {
    if (now >= person.nextEmotionAt) {
      showEmotionIcon(person);
      person.nextEmotionAt = now + EMOTION_MIN_MS + Math.random() * (EMOTION_MAX_MS - EMOTION_MIN_MS);
    }
    if (person.emotionIcon && now >= person.emotionUntil) {
      removeEmotionIcon(person);
    }
    if (!person.emotionIcon) continue;
    // Привязка к макушке персонажа: учитываем текущую мировую позицию, а не только локальную.
    person.root.getWorldPosition(emotionProject);
    emotionProject.y += Math.min(person.headHeight, 1.9) + EMOTION_GAP;
    emotionProject.project(camera);
    const visible = emotionProject.z > -1 && emotionProject.z < 1 && Math.abs(emotionProject.x) < 1.15 && Math.abs(emotionProject.y) < 1.15;
    person.emotionIcon.style.display = visible ? '' : 'none';
    if (visible) {
      person.emotionIcon.style.left = ((emotionProject.x+1)*0.5*w)+'px';
      person.emotionIcon.style.top = ((1-emotionProject.y)*0.5*h)+'px';
    }
  }
}

// --------------------------------------------
// КАМЕРА
// --------------------------------------------

function focusPerson(person) {
  controls.target.copy(person.root.position);

  camera.position.copy(person.root.position).add(
    new THREE.Vector3(6, 9, 9)
  );

  controls.update();
}

function setView(view) {
  if (view === "top") {
    camera.position.copy(controls.target).add(
      new THREE.Vector3(0.01, 25, 0.01)
    );
  }

  if (view === "angle") {
    camera.position.copy(controls.target).add(
      new THREE.Vector3(16, 20, 22)
    );
  }

  if (view === "side") {
    camera.position.copy(controls.target).add(
      new THREE.Vector3(0, 6, 24)
    );
  }

  if (view === "center") {
    controls.target.set(0, 0, 0);
    camera.position.set(0, 25, 0.01); // Старт строго над офисом
  }

  if (view === "focus" && selected) {
    focusPerson(selected);
  }

  if (view === "left" || view === "right") {
    const offset = camera.position.clone()
      .sub(controls.target);

    offset.applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      view === "left" ? -0.26 : 0.26
    );

    camera.position.copy(controls.target).add(offset);
  }

  if (view === "near" || view === "far") {
    camera.position.sub(controls.target)
      .multiplyScalar(view === "near" ? 0.8 : 1.25)
      .add(controls.target);
  }

  controls.update();
}

function cameraMenu() {
  const views = [
    ["top", "Сверху"],
    ["angle", "Под углом"],
    ["side", "Сбоку"],
    ["center", "Центр"],
    ["focus", "На сотрудника"],
    ["left", "Влево"],
    ["right", "Вправо"],
    ["near", "Приблизить"],
    ["far", "Отдалить"]
  ];

  modal("Камера", `
    <div class="actions">
      ${views.map(([id, name]) => `
        <button class="tile tile-blue"
                data-view="${id}">
          <strong>${name}</strong>
          <small>Изменить положение камеры</small>
        </button>
      `).join("")}
    </div>

    <p class="muted">
      ЛКМ + перетаскивание — вращение.<br>
      Shift + ЛКМ — панорама.<br>
      Колесо — приближение.<br>
      Стрелки — движение камеры.<br>
      F — фокус на сотруднике.
    </p>
  `);

  $("modalBody")
    .querySelectorAll("[data-view]")
    .forEach(button => {
      button.onclick = () => {
        setView(button.dataset.view);
        toast("Камера обновлена");
      };
    });
}

// --------------------------------------------
// НАСТРОЙКИ
// --------------------------------------------

function settingsMenu() {
  modal("Настройки игры", `
    <div class="actions">
      ${tile("gridToggle", "Сетка", "Показать / скрыть", "blue")}
      ${tile("groundToggle", "Фоновый пол", "Показать / скрыть плоскость", "slate")}
      ${tile("shadowToggle", "Тени", "Включить / выключить", "slate")}
      ${tile("debugToggle", "Коллизии", "Показать препятствия", "gold")}
      ${tile("collisionToggle", "Столкновения", "Вкл. / выкл.", "green")}
      ${tile("cameraReset", "Камера", "Сбросить положение", "blue")}
      ${tile("exportJSON", "Экспорт", "Скачать JSON", "purple")}
      ${tile("importJSON", "Импорт", "Загрузить JSON", "purple")}
      ${tile("deleteSave", "Очистить", "Удалить сохранение", "red")}
    </div>

    <input type="file" id="jsonFile"
           accept=".json,application/json" hidden>

    <p class="muted">
      Оранжевые области показывают обнаруженные препятствия.
      Для сложной GLB-модели коллизии необходимо уточнять.
    </p>
  `);

  $("gridToggle").onclick = () => {
    grid.visible = !grid.visible;
    toast(grid.visible ? "Сетка включена" : "Сетка скрыта");
  };

  $("groundToggle").onclick = () => {
    if (!window.officeGround) return;
    window.officeGround.visible = !window.officeGround.visible;
    toast(window.officeGround.visible ? "Фоновый пол включён" : "Фоновый пол скрыт");
  };

  $("shadowToggle").onclick = () => {
    renderer.shadowMap.enabled = !renderer.shadowMap.enabled;
    renderer.shadowMap.needsUpdate = true;
    toast("Настройка теней изменена");
  };

  $("debugToggle").onclick = () => {
    const visible = navigation.toggleDebug(scene);
    toast(visible ? "Препятствия показаны" : "Препятствия скрыты");
  };

  $("collisionToggle").onclick = () => {
    collisions = !collisions;

    toast(
      collisions
        ? "Столкновения включены"
        : "Столкновения с мебелью отключены"
    );
  };

  $("cameraReset").onclick = () => {
    setView("center");
    toast("Камера сброшена");
  };

  $("exportJSON").onclick = () => {
    const blob = new Blob(
      [JSON.stringify(serialize(), null, 2)],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "sosiska-save.json";
    link.click();

    setTimeout(() => URL.revokeObjectURL(url), 500);
  };

  $("importJSON").onclick = () => $("jsonFile").click();

  $("jsonFile").onchange = async event => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      if (file.size > 1024 * 1024 || !/\.json$/i.test(file.name)) throw new Error("Только JSON до 1 МБ");
      const data = JSON.parse(await file.text());
      if (typeof data !== "object" || !data || data.employees?.length > 30) throw new Error("Неверные данные сотрудников");

      if (!Array.isArray(data.employees)) {
        throw new Error("Нет массива employees");
      }

      localStorage.setItem(STORAGE, JSON.stringify(data));
      loadGame();
      closeModal();
    } catch (error) {
      toast("Ошибка импорта: " + error.message);
    }
  };

  $("deleteSave").onclick = () => {
    if (!confirm("Удалить сохранение?")) return;

    localStorage.removeItem(STORAGE);
    $("saveStatus").textContent = "Не сохранено";
    toast("Сохранение удалено");
  };
}

// --------------------------------------------
// ГЛАВНОЕ МЕНЮ
// --------------------------------------------

document.querySelectorAll("[data-action]")
  .forEach(button => {
    button.onclick = () => {
      const action = button.dataset.action;
      setToolbarActive(action);

      if (action === "ai") { openAIHelper(); return; }
      if (action === "shop") { openFurnitureShop(); return; }
      if (action === "build") { openBuildSettings(); return; }
      if (action === "home") {
        closeModal();
        $("start").classList.remove("hidden");
        progress(100, "Сцена уже загружена");
        return;
      }

      if (!initialized || !running) {
        toast("Сначала начните игру");
        return;
      }

      if (action === "staff") staffList();

      if (action === "add") {
        const person = spawn();

        if (person) {
          save();
          employeeCard(person);
        }
      }

      if (action === "tasks") allTasks();
      if (action === "camera") cameraMenu();
      if (action === "settings") renderProfileSettings();
      if (action === "save") save();
    };
  });

// --------------------------------------------
// КЛАВИАТУРА
// --------------------------------------------

window.addEventListener("keydown", event => {
  const tag = document.activeElement?.tagName;

  if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
    return;
  }

  if ([
    "Space",
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight"
  ].includes(event.code)) {
    event.preventDefault();
  }

  keys.add(event.code);

  if (event.code === "Escape") closeModal();

  if (event.ctrlKey && event.code === "KeyS") {
    event.preventDefault();
    save();
  }

  if (event.code === "KeyF" && selected && initialized) {
    focusPerson(selected);
  }
});

window.addEventListener("keyup", event => {
  keys.delete(event.code);
});

window.addEventListener("blur", () => keys.clear());

// --------------------------------------------
// ИНДИВИДУАЛЬНОЕ АВТОНОМНОЕ ПОВЕДЕНИЕ NPC
// Каждый сотрудник сам выбирает свободную точку и строит маршрут.
// Ручное управление и клик по полу временно отключают автопрогулку.
// --------------------------------------------
function updateEmployeeAI(person, now) {
  if (!person.ai || !navigation || !running) return;
  const ai = person.ai;
  if (now < ai.manualUntil || now < ai.nextWalkAt) return;
  if (person.target || person.path.length) return;

  const b = navigation.bounds;
  const start = person.root.position;
  for (let attempt = 0; attempt < 12; attempt++) {
    // Чаще выбираем близкие точки, иногда — дальнюю часть офиса.
    const range = Math.random() < 0.78 ? 4 : 11;
    const x = Math.max(b.minX + 0.45, Math.min(b.maxX - 0.45,
      start.x + (Math.random() * 2 - 1) * range));
    const z = Math.max(b.minZ + 0.45, Math.min(b.maxZ - 0.45,
      start.z + (Math.random() * 2 - 1) * range));
    if (Math.hypot(x - start.x, z - start.z) < 1.2) continue;
    if (!navigation.canStand(x, z)) continue;
    const route = navigation.path(start, new THREE.Vector3(x, 0, z));
    if (!route || !route.length) continue;
    person.path = route;
    person.target = person.path.shift() || null;
    ai.nextWalkAt = now + 4000 + Math.random() * 6000;
    return;
  }
  ai.nextWalkAt = now + 1500 + Math.random() * 3500;
}

// --------------------------------------------
// ИГРОВОЙ ЦИКЛ
// --------------------------------------------

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);

  const typing = ["INPUT", "TEXTAREA", "SELECT"]
    .includes(document.activeElement?.tagName);

  const modalClosed =
    $("modal").classList.contains("hidden");

  const startClosed =
    $("start").classList.contains("hidden");

  if (
    running &&
    !typing &&
    modalClosed &&
    startClosed
  ) {
    if (selected) {
      const x =
        Number(keys.has("KeyD")) -
        Number(keys.has("KeyA"));

      const z =
        Number(keys.has("KeyS")) -
        Number(keys.has("KeyW"));

      if (x || z) {
        const length = Math.hypot(x, z);

        selected.path = [];
        selected.target = null;
        if (selected.ai) {
          selected.ai.manualUntil = performance.now() + 15000;
          selected.ai.nextWalkAt = selected.ai.manualUntil + 2000;
        }

        movePerson(
          selected,
          x / length * 2.5 * dt,
          z / length * 2.5 * dt
        );
      }
    }

    const cx =
      Number(keys.has("ArrowRight")) -
      Number(keys.has("ArrowLeft"));

    const cz =
      Number(keys.has("ArrowDown")) -
      Number(keys.has("ArrowUp"));

    if (cx || cz) {
      const movement = new THREE.Vector3(
        cx * dt * 8,
        0,
        cz * dt * 8
      );

      controls.target.add(movement);
      camera.position.add(movement);
    }

    for (const person of employees) {
      updateEmployeeAI(person, performance.now());
      if (person.target) {
        const direction = person.target.clone()
          .sub(person.root.position);

        direction.y = 0;
        const distance = direction.length();

        if (distance < 0.12) {
          person.target = person.path.shift() || null;
          if (!person.target && person.ai) person.ai.nextWalkAt = performance.now() + 2500 + Math.random() * 6500;
        } else {
          direction.normalize();

          const step = Math.min(distance, 2 * dt);

          const moved = movePerson(
            person,
            direction.x * step,
            direction.z * step
          );

          if (moved < 0.00001) {
            person.path = [];
            person.target = null;
            if (person.ai) person.ai.nextWalkAt = performance.now() + 1200 + Math.random() * 3000;
          }
        }
      }


    }
  }

  controls.update();
  updateEmotionIcons(performance.now());
  renderer.render(scene, camera);
}

// =====================================================================
// 09 / ASSET PIPELINE — future js/asset-loader.js
// ORDER: splash -> menu PNG -> emotion PNG -> audio -> Three.js + GLB.
// Missing optional images/audio show fallbacks; missing GLB uses demo models.
// Progress represents completed loading phases, not a fake countdown.
// =====================================================================
const ASSET_PATHS = {
  splash: './Preview/officefonload.png',
  menu: [
    './menu_game/Офисные UI-плитки с иконками_edited (1).png',
    './menu_game/Офисные UI-плитки с иконками_edited (2).png',
    './menu_game/Офисные UI-плитки с иконками_edited (3).png',
    './menu_game/Офисные UI-плитки с иконками_edited (4).png',
    './menu_game/Офисные UI-плитки с иконками_edited (5).png',
    './menu_game/Офисные UI-плитки с иконками_edited.png'
  ],
  emotions: [
    './emotion/emo1.png',
    './emotion/emo2.png',
    './emotion/emo3.png',
    './emotion/emo4.png'
  ]
};
function assetProgress(value, text) {
  window.dispatchEvent(new CustomEvent('office-loading', {detail:{value,text}}));
}
async function preloadImage(path) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = async () => { try { await img.decode?.(); } catch {} resolve(true); };
    img.onerror = () => { console.warn('Изображение не найдено:',path); resolve(false); };
    img.src = path;
  });
}
let assetBootPromise = null;
function bootOffice() {
  if (assetBootPromise) return assetBootPromise;
  assetBootPromise = (async () => {
    const warnings=[];
    assetProgress(0,'Загрузка заставки');
    if (!await preloadImage(ASSET_PATHS.splash)) warnings.push('фон');
    else document.getElementById('integratedLoader').style.backgroundImage = `url("${ASSET_PATHS.splash}")`;
    assetProgress(12,'Загрузка графических кнопок');
    for (let i=0;i<ASSET_PATHS.menu.length;i++) {
      if (!await preloadImage(ASSET_PATHS.menu[i])) warnings.push('кнопка '+(i+1));
      assetProgress(12+Math.round((i+1)*23/ASSET_PATHS.menu.length),'Кнопки '+(i+1)+'/'+ASSET_PATHS.menu.length);
    }
    for (let i=0;i<ASSET_PATHS.emotions.length;i++) {
      if (!await preloadImage(ASSET_PATHS.emotions[i])) warnings.push('эмоция '+(i+1));
      assetProgress(35+Math.round((i+1)*20/ASSET_PATHS.emotions.length),'Эмоции '+(i+1)+'/'+ASSET_PATHS.emotions.length);
    }
    imageMenuRender();
    assetProgress(57,'Загрузка аудио');
    await menuAutoSound();
    assetProgress(75,'Загрузка 3D-движка и моделей');
    await initialize3D();
    if (warnings.length) console.warn('Необязательные ресурсы отсутствуют:',warnings.join(', '));
  })().catch(error => {
    console.error('Ошибка загрузки игры:',error);
    window.dispatchEvent(new CustomEvent('office-error',{detail:String(error.message||error)}));
    throw error;
  });
  return assetBootPromise;
}
window.addEventListener('DOMContentLoaded',()=>{bootOffice().catch(()=>{});});


// ==============================================================
// BROWSER INPUT POLICY / Обработка стандартных действий браузера
// ==============================================================
// Отключаем только системное контекстное меню. ПКМ на 3D-сцене
// продолжает работать: существующий bindSceneControls() сам
// обрабатывает событие contextmenu и открывает карточку персонажа.
document.addEventListener('contextmenu', event => {
  event.preventDefault();
});

// Запрет системного перетаскивания картинок (ghost image).
// Перетаскивание камеры Three.js при этом не блокируется.
document.addEventListener('dragstart', event => {
  if (event.target.closest?.('#officeImageMenu, #emotionLayer, #scene')) {
    event.preventDefault();
  }
});

// Блокируем выделение только в интерактивной части игры,
// сохраняя копирование текста в информационных окнах и полях ввода.
document.addEventListener('selectstart', event => {
  if (event.target.closest?.('#officeImageMenu, #emotionLayer, #scene')) {
    event.preventDefault();
  }
});

// ===== ГРАФИЧЕСКОЕ МЕНЮ: сохраняет оригинальные обработчики 3D-игры =====
const imageMenuItems=[
 {name:'Компьютер',file:'./menu_game/Офисные UI-плитки с иконками_edited (1).png',icon:'▣',description:'Рабочие компьютеры, приложения и документы.',actions:[['Открыть меню сотрудников','staff'],['Задания','tasks']]},
 {name:'Сотрудники',file:'./menu_game/Офисные UI-плитки с иконками_edited (2).png',icon:'♟',description:'Управление сотрудниками, задачами и эмоциями.',actions:[['Сотрудники','staff'],['Добавить сотрудника','add']]},
 {name:'Помещения',file:'./menu_game/Офисные UI-плитки с иконками_edited (3).png',icon:'▤',description:'Осмотр 3D-офиса и перемещение камеры.',actions:[['Камера','camera'],['Главная','home']]},
 {name:'Задания',file:'./menu_game/Офисные UI-плитки с иконками_edited (4).png',icon:'★',description:'Задачи и достижения сотрудников.',actions:[['Открыть задания','tasks'],['Сохранить','save']]},
 {name:'Склад',file:'./menu_game/Офисные UI-плитки с иконками_edited (5).png',icon:'▥',description:'Склад и оборудование офиса. Для склада отдельная игровая механика пока не задана.',actions:[['Главная','home'],['Сохранить','save']]},
 {name:'Настройки',file:'./menu_game/Офисные UI-плитки с иконками_edited.png',icon:'⚙',description:'Настройки игры, управление камерой и сохранениями.',actions:[['Настройки','settings'],['Камера','camera']]}
];
// V10: Единый реестр настроек. Новые параметры добавляются в DEFAULT_GAME_SETTINGS.
const DEFAULT_GAME_SETTINGS = Object.freeze({soundEnabled:true, clickVolume:65, stickerCount:10, stickerMotion:true, accentColor:'#f5c78d', userName:'Игрок', userPhoto:''});
const GAME_SETTINGS_KEY='aranima_game_settings_v11';
function loadGameSettings(){try{const x=JSON.parse(localStorage.getItem(GAME_SETTINGS_KEY)||'{}');return {...DEFAULT_GAME_SETTINGS,...Object.fromEntries(Object.entries(x).filter(([k])=>k in DEFAULT_GAME_SETTINGS))}}catch{return {...DEFAULT_GAME_SETTINGS}}}
const gameSettings=loadGameSettings();
function applyAccent(){const c=/^#[0-9a-fA-F]{6}$/.test(gameSettings.accentColor)?gameSettings.accentColor:'#f5c78d';document.documentElement.style.setProperty('--game-accent',c)}
applyAccent();
function persistGameSettings(){try{localStorage.setItem(GAME_SETTINGS_KEY,JSON.stringify(gameSettings))}catch(e){console.warn('Настройки не сохранены',e)}}
let menuAudioContext=null,menuBuffer=null,menuCurrent=null,menuCustomImages=[];
function menuContext(){return menuAudioContext ||= new (window.AudioContext||window.webkitAudioContext)()}
function menuStop(){if(menuCurrent){try{menuCurrent.stop()}catch{}menuCurrent.disconnect();menuCurrent=null}}
function menuPlay(){menuStop();if(!gameSettings.soundEnabled)return;const ac=menuContext();if(ac.state==='suspended')ac.resume();const gain=ac.createGain();gain.gain.value=Math.max(0,Math.min(100,Number(gameSettings.clickVolume)))/100;gain.connect(ac.destination);if(menuBuffer){const src=ac.createBufferSource();src.buffer=menuBuffer;src.connect(gain);menuCurrent=src;src.onended=()=>{if(menuCurrent===src)menuCurrent=null};src.start();return}const osc=ac.createOscillator();osc.type='sine';osc.frequency.setValueAtTime(630,ac.currentTime);osc.frequency.exponentialRampToValueAtTime(380,ac.currentTime+.065);gain.gain.setValueAtTime(.0001,ac.currentTime);gain.gain.exponentialRampToValueAtTime(.12,ac.currentTime+.008);gain.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+.075);osc.connect(gain);menuCurrent=osc;osc.start();osc.stop(ac.currentTime+.08)}
async function menuDecode(file){try{menuBuffer=await menuContext().decodeAudioData(await file.arrayBuffer())}catch(e){console.warn('Невозможно декодировать звук:',e)}}
async function menuAutoSound(){for(const path of ['./audio_klick/klick.wav']){try{const r=await fetch(path);if(!r.ok)continue;const b=await r.arrayBuffer();menuBuffer=await menuContext().decodeAudioData(b);return}catch{}}console.info('WAV не найден; используется встроенный короткий звук')}

// =================================================================
// 10 / IMAGE MENU — будущий image-menu.js
// =================================================================
function imageMenuRender(){const host=document.getElementById('officeImageTiles');host.replaceChildren();imageMenuItems.forEach((item,i)=>{const button=document.createElement('button');button.className='office-image-tile';button.title=item.name;button.setAttribute('aria-label',item.name);const img=document.createElement('img');img.alt='';const fallback=document.createElement('span');fallback.textContent=item.icon;img.onload=()=>fallback.hidden=true;img.onerror=()=>{img.hidden=true;fallback.hidden=false};img.src=menuCustomImages[i]||item.file;button.append(img,fallback);button.addEventListener('click',()=>{menuPlay();host.querySelectorAll('button').forEach(b=>b.classList.remove('active'));button.classList.add('active');document.getElementById('imageInfoPanel').hidden=false;document.getElementById('imageInfoTitle').textContent=item.name;const body=document.getElementById('imageInfoBody');body.replaceChildren();const p=document.createElement('p');p.textContent=item.description;const actions=document.createElement('div');actions.className='panel-actions';item.actions.forEach(([label,action])=>{const b=document.createElement('button');b.textContent=label;b.onclick=()=>{menuPlay();document.getElementById('imageInfoPanel').hidden=true;document.querySelector(`.toolbar [data-action="${action}"]`)?.click()};actions.append(b)});body.append(p,actions)});host.append(button)})}
document.getElementById('imageInfoClose').onclick=()=>{menuPlay();document.getElementById('imageInfoPanel').hidden=true};

// Звуковые переключатели теперь создаются внутри профиля (renderProfileSettings).
document.getElementById('menuSoundFile').onchange=e=>{if(e.target.files[0] && e.target.files[0].size<=5*1024*1024 && /^(audio\/|.*\.wav$)/i.test(e.target.files[0].type || e.target.files[0].name))menuDecode(e.target.files[0]);else toast("Аудио до 5 МБ")};
// Menu is rendered after the preload phase, not before it.
// Процент связан с фактическими этапами загрузки 3D, а не с таймером.
window.addEventListener('office-loading',e=>{const v=Math.max(0,Math.min(100,Number(e.detail.value)||0));document.getElementById('integratedLoadFill').style.width=v+'%';document.getElementById('integratedLoadPercent').textContent=v+'%';document.getElementById('integratedLoadDetail').textContent=e.detail.text;document.getElementById('integratedLoadTitle').textContent=v===100?'Офис готов':'Подготовка 3D-офиса...'});
window.addEventListener('office-ready',()=>setTimeout(()=>document.getElementById('integratedLoader').classList.add('finished'),350));
window.addEventListener('office-error',e=>{document.getElementById('integratedLoadTitle').textContent='Ошибка загрузки';document.getElementById('integratedLoadDetail').textContent=e.detail;document.getElementById('integratedRetry').hidden=false});
document.getElementById('integratedRetry').onclick=()=>location.reload();


// ================================================================
// V4 / BUILD SYSTEM — магазин, 3D, сетка, коллизии, маршруты, ZIP
// Встроено в исходный модуль V3. Не требует отдельных CSS/JS.
// ================================================================
// СТАНДАРТНЫЕ ГАБАРИТЫ МАГАЗИНА: w=ширина, d=глубина, h=высота (метры).
// Количество занятых клеток = ceil(w / buildCellSize) × ceil(d / buildCellSize).
// Для цветов закреплено 1×1, для доски 2×1 при стандартной клетке 0.5 м.
const FURNITURE_CATALOG = [
 {id:'desk',name:'Стол с ПК',price:180,w:1.6,d:.85,h:.8,modelScale: 0.15,color:0xa77a56,icon:'device-desktop'},
 {id:'chair',name:'Кресло',price:95,w:.7,d:.7,h:1.05,modelScale: 0.15,color:0x395b7d,icon:'armchair'},
 {id:'sofa',name:'Диван',price:360,w:2.2,d:.9,h:.85,modelScale: 0.15,color:0x65769b,icon:'sofa'},
 {id:'cabinet',name:'Шкаф',price:270,w:1.1,d:.6,h:2,modelScale: 0.15,color:0x8796a8,icon:'archive'},
 {id:'plant',name:'Цветок',price:45,w:.3,d:.3,h:0.8,modelScale: 0.05,color:0x387a52,icon:'plant'},
 {id:'board',name:'Доска',price:110,w:1,d:.5,h:1.8,modelScale: 0.15,color:0xe9eef4,icon:'chalkboard'},
 {id:'meeting',name:'Стол переговоров',price:420,w:2.4,d:1.3,h:.78,modelScale: 0.15,color:0xb28a5b,icon:'table'},
 {id:'coffee',name:'Кофемашина',price:190,w:.75,d:.7,h:1.2,modelScale: 0.15,color:0x49586b,icon:'coffee'},
 {id:'lamp',name:'Торшер',price:70,w:.45,d:.45,h:1.7,modelScale: 0.15,color:0xffc96e,icon:'lamp'}
];
const furnitureItems=new Map(), importedTemplates=new Map();
let buildCellSize=.5, buildPlacement=null, furnitureCounter=0;
const FURNITURE_LIMIT=250;
let furnitureRoot=null;
// Модуль исполняется до initialize3D, поэтому создаём Group только при готовности.
window.addEventListener('office-ready',()=>{furnitureRoot=new THREE.Group();furnitureRoot.name='Покупная мебель';scene.add(furnitureRoot);});
function furnitureDef(id){return FURNITURE_CATALOG.find(x=>x.id===id)}
function furnitureSize(item,rot){
 // Приводим все предметы к ЦЕЛОМУ числу клеток, без частичных перекрытий.
 const cw=item.id==='plant'?1:item.id==='board'?2:Math.max(1,Math.ceil(item.w/buildCellSize));
 const cd=(item.id==='plant'||item.id==='board')?1:Math.max(1,Math.ceil(item.d/buildCellSize));
 const w=cw*buildCellSize,d=cd*buildCellSize;
 return Math.abs(Math.round(rot/(Math.PI/2)))%2?[d,w]:[w,d];
}
function furnitureRect(item,x,z,rot=0){const [w,d]=furnitureSize(item,rot);return {minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2}}
function rectOverlap(a,b,pad=0){return a.minX<b.maxX+pad&&a.maxX>b.minX-pad&&a.minZ<b.maxZ+pad&&a.maxZ>b.minZ-pad}
function furnitureCanPlace(item,x,z,rot=0,ignore=null){
 if(!navigation)return false;
 const r=furnitureRect(item,x,z,rot), b=navigation.bounds;
 if(r.minX<b.minX+.15||r.maxX>b.maxX-.15||r.minZ<b.minZ+.15||r.maxZ>b.maxZ-.15)return false;
 if(navigation.obstacles.some(o=>rectOverlap(r,o,.06)))return false;
 for(const o of furnitureItems.values())if(o.id!==ignore&&rectOverlap(r,furnitureRect(o.item,o.x,o.z,o.rot),.06))return false;
 // Не ставим мебель прямо на сотрудника.
 for(const p of employees){const q=p.root.position;if(q.x>r.minX-.34&&q.x<r.maxX+.34&&q.z>r.minZ-.34&&q.z<r.maxZ+.34)return false;}
 return true;
}
function furnitureBlocked(x,z,r=.32){for(const o of furnitureItems.values()){const b=furnitureRect(o.item,o.x,o.z,o.rot);const px=Math.max(b.minX,Math.min(x,b.maxX)),pz=Math.max(b.minZ,Math.min(z,b.maxZ));if((x-px)**2+(z-pz)**2<r*r)return true;}return false;}
// Расширяем существующую навигацию, не заменяя алгоритм A*.
const _officeCanStand=OfficeNavigation.prototype.canStand;
OfficeNavigation.prototype.canStand=function(x,z,r=this.radius){return _officeCanStand.call(this,x,z,r)&&!furnitureBlocked(x,z,r)};
function furnitureMesh(item){
 if(importedTemplates.has(item.id)){
  const obj=importedTemplates.get(item.id).clone(true);
  obj.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(obj),size=bounds.getSize(new THREE.Vector3());
  const [targetW,targetD]=furnitureSize(item,0);const scale=Math.min(targetW/Math.max(size.x,.001),targetD/Math.max(size.z,.001),item.h/Math.max(size.y,.001));
  obj.scale.multiplyScalar(scale);obj.updateMatrixWorld(true);
  const bottom=new THREE.Box3().setFromObject(obj).min.y;obj.position.y-=bottom;
  return obj;
 }
 const root=new THREE.Group();
 const make=(w,h,d,color,x,y,z)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness:.78}));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;root.add(m)};
 if(item.id==='plant'){
  make(.38,.38,.38,0x8e6a54,0,.2,0);
  const leaf=new THREE.Mesh(new THREE.SphereGeometry(.42,12,8),new THREE.MeshStandardMaterial({color:0x33835a}));leaf.position.y=.78;root.add(leaf);
 }else if(item.id==='board'){
  make(item.w,1.25,.08,0xe8eef3,0,1.12,0);
  make(item.w+.08,.055,.13,0x647d93,0,1.77,0);
 }else if(item.id==='desk'||item.id==='meeting'){
  make(item.w,.12,item.d,item.color,0,.75,0);
  for(const x of [-item.w*.38,item.w*.38])for(const z of [-item.d*.35,item.d*.35])make(.09,.7,.09,0x64768a,x,.35,z);
  if(item.id==='desk')make(.55,.43,.06,0x283d56,0,1.02,-.15);
 }else if(item.id==='chair'){
  make(.62,.14,.62,item.color,0,.45,0);make(.62,.6,.13,item.color,0,.79,-.25);make(.08,.4,.08,0x445268,0,.2,0);
 }else if(item.id==='sofa'){
  make(item.w,.43,item.d,item.color,0,.25,0);make(item.w,.5,.2,item.color,0,.63,-.35);
 }else if(item.id==='lamp'){
  make(.3,.08,.3,0x66778a,0,.04,0);make(.06,1.4,.06,0x8793a1,0,.75,0);make(.4,.3,.4,item.color,0,1.55,0);
 }else make(item.w,item.h,item.d,item.color,0,item.h/2,0);
 return root;
}
function furnitureCreate(id,item,x,z,rot){
 const mesh=scaleVisualFurniture(furnitureMesh(item),item);mesh.position.x=x;mesh.position.z=z;mesh.rotation.y=rot;mesh.updateMatrixWorld(true);const floorBounds=new THREE.Box3().setFromObject(mesh);if(!floorBounds.isEmpty())mesh.position.y+=officeFloorHeight()+.012-floorBounds.min.y;
 // V14: НЕ создаём белую плоскость на 3D-доске; рисунки живут только в редакторе.
 mesh.traverse(n=>{n.userData.furnitureId=id;if(n.isMesh){n.castShadow=true;n.receiveShadow=true}});
 furnitureRoot.add(mesh);const obj={id,item,x,z,rot,mesh,wateredAt:plantWaterTimes[id]||0};furnitureItems.set(id,obj);return obj;
}
function clearFurniture(){for(const o of furnitureItems.values())furnitureRoot?.remove(o.mesh);furnitureItems.clear();cancelFurniturePlacement();}
function furnitureSerialize(){return [...furnitureItems.values()].map(o=>({id:o.id,type:o.item.id,x:o.x,z:o.z,rot:o.rot,wateredAt:o.wateredAt||0,boardImage:boardImages[o.id]||null}))}
let pendingFurniture=[];
function restoreFurniture(rows,cell){
 clearFurniture();if(Number.isFinite(cell)&&cell>=.2&&cell<=2)buildCellSize=cell;
 pendingFurniture=Array.isArray(rows)?rows.slice(0,FURNITURE_LIMIT):[];
 restorePendingFurniture();
}
function restorePendingFurniture(){
 if(!initialized||!navigation||!furnitureRoot?.parent||!catalogModelsReady)return;
 const pending=pendingFurniture;pendingFurniture=[];
 for(const row of pending){const item=furnitureDef(row.type);if(!item||typeof row.id!=='string'||![row.x,row.z,row.rot].every(Number.isFinite))continue;
 if(row.type==='board'&&typeof row.boardImage==='string'&&row.boardImage.length<1500000&&/^data:image\/png;base64,/.test(row.boardImage))boardImages[row.id]=row.boardImage;
 if(row.type==='plant'&&Number.isFinite(row.wateredAt))plantWaterTimes[row.id]=row.wateredAt;
 if(furnitureCanPlace(item,row.x,row.z,row.rot))furnitureCreate(row.id,item,row.x,row.z,row.rot);
 }
 rerouteEmployees();
}
function rerouteEmployees(){for(const p of employees){p.path=[];p.target=null;p.ai.nextWalkAt=performance.now()+500}}
// MARKET V6 — карточки создаются из исходного каталога и не изменяют GLB-модели.
const MARKET_CATEGORIES={all:'Все товары',work:'Рабочие места',rest:'Зона отдыха',decor:'Декор',learning:'Обучение',storage:'Хранение',kitchen:'Кухня'};
const MARKET_CATEGORY_BY_ID={desk:'work',chair:'work',sofa:'rest',cabinet:'storage',plant:'decor',board:'learning',meeting:'work',coffee:'kitchen',lamp:'decor'};
// PNG/WebP помещаются в папку assets/market/; если картинки нет — показывается иконка.
// Имена файлов ТОЧНО как в папке shop (регистр важен на GitHub Pages).
// Файлы: shop/bard_shop.png, shop/flower_shop.png, shop/stul_shop.png,
// shop/work_table_shop.png, shop/price.png, shop/buy.png.
// price.png оставлен как запасной фон; цену выводим HTML-текстом поверх карточки.
const SHOP_ASSETS = Object.freeze({
 board:'shop/bard_shop.png',
 plant:'shop/flower_shop.png',
 chair:'shop/stul_shop.png',
 desk:'shop/work_table_shop.png'
});
const SHOP_BUY_IMAGE='shop/buy.png';
const SHOP_PRICE_IMAGE='shop/price.png';
// Отсутствующие в проекте PNG не запрашиваются: для этих товаров показывается штатная иконка.
const MARKET_IMAGES={desk:SHOP_ASSETS.desk,chair:SHOP_ASSETS.chair,sofa:'',cabinet:'',plant:SHOP_ASSETS.plant,board:SHOP_ASSETS.board,meeting:'',coffee:'',lamp:''};
let marketCategory='all',marketSearch='';
function marketCards(){
 const wrap=$('marketGrid');if(!wrap)return;
 const items=FURNITURE_CATALOG.filter(o=>(marketCategory==='all'||(MARKET_CATEGORY_BY_ID[o.id]||'decor')===marketCategory)&&o.name.toLocaleLowerCase('ru').includes(marketSearch));
 wrap.innerHTML=items.map(o=>{
 const size=furnitureSize(o,0),cw=Math.round(size[0]/buildCellSize),cd=Math.round(size[1]/buildCellSize);
 const image=MARKET_IMAGES[o.id]||'';
 if(SHOP_ASSETS[o.id]){
  return `<article class="market-card market-art-card" data-product="${safe(o.id)}">
   <img class="market-art" src="${safe(image)}" alt="" loading="lazy">
   <h3 class="market-art-name">${safe(o.name)}</h3>
   <div class="market-art-price"><span class="market-coin">◉</span><span>${o.price.toLocaleString('ru-RU')}</span></div>
   <button class="market-art-buy" type="button" data-fbuy="${safe(o.id)}" aria-label="Купить ${safe(o.name)}" ${funds<o.price?'disabled':''}>
    <span><i class="ti ti-shopping-cart"></i> Купить</span>
   </button>
  </article>`;
 }
 return `<article class="market-card" data-product="${safe(o.id)}"><h3>${safe(o.name)}</h3><span class="market-icon"><i class="ti ti-${safe(o.icon||'box')}"></i></span><div class="market-photo">${image?`<img loading="lazy" src="${safe(image)}" alt="${safe(o.name)}" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="market-placeholder" hidden><i class="ti ti-${safe(o.icon||'box')}"></i></span>`:`<span class="market-placeholder"><i class="ti ti-${safe(o.icon||'box')}"></i></span>`}</div><div class="market-spec">▣ ${o.w.toFixed(2)} × ${o.d.toFixed(2)} × ${o.h.toFixed(2)} м<br>▦ ${cw} × ${cd} клетки</div><div class="market-price"><span class="market-coin">◉</span>${o.price.toLocaleString('ru-RU')}</div><button class="market-buy" data-fbuy="${safe(o.id)}" ${funds<o.price?'disabled':''}>Купить</button></article>`;
 }).join('')||'<p>Товары не найдены.</p>';
 wrap.querySelectorAll('[data-fbuy]').forEach(b=>b.onclick=()=>{const item=furnitureDef(b.dataset.fbuy);if(item)beginFurniturePlacement(item)});
}
function openFurnitureShop(){
 modal('Маркет офиса',`<div class="market-top"><input id="marketSearch" class="market-search" type="search" maxlength="60" placeholder="Поиск товаров..." aria-label="Поиск товаров"><span class="market-wallet">◉ ${funds.toLocaleString('ru-RU')}</span></div><div id="marketTabs" class="market-tabs">${Object.entries(MARKET_CATEGORIES).map(([id,label])=>`<button class="market-tab ${marketCategory===id?'active':''}" data-cat="${id}">${label}</button>`).join('')}</div><div id="marketGrid" class="market-grid"></div><div class="market-foot">Клетка: ${buildCellSize} м · Объектов: ${furnitureItems.size}/${FURNITURE_LIMIT}. Оплата после размещения.</div><label class="market-foot">Импорт моделей из ZIP <input id="furnitureZip" type="file" accept=".zip,application/zip"></label>`);
 $('modal').querySelector('.dialog').classList.add('market-dialog');
 $('marketSearch').value=marketSearch;
 $('marketSearch').oninput=e=>{marketSearch=e.target.value.slice(0,60).toLocaleLowerCase('ru');marketCards()};
 $('marketTabs').querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{marketCategory=b.dataset.cat;openFurnitureShop()});
 $('furnitureZip').onchange=async e=>{const file=e.target.files?.[0];if(file)try{await importFurnitureZip(file,true);openFurnitureShop();toast('Архив импортирован')}catch(err){toast(err.message);console.error(err)}};
 marketCards();
}

function openBuildSettings(){
 modal('Конструктор офиса',`<p class="build-summary">Сетка и мебель: X/Z в метрах. Размер клетки влияет на привязку объектов, а путь сотрудников рассчитывается существующим A*.</p><label>Размер клетки (0.2–2 м)<input id="buildCellInput" class="build-input" type="number" min="0.2" max="2" step="0.1" value="${buildCellSize}"></label><div class="actions"><button id="buildShowGrid">Сетка вкл/выкл</button><button id="buildShop">Магазин</button><button id="buildInventory">Объекты (${furnitureItems.size})</button><button id="buildSave">Сохранить</button></div>`);
 $('buildCellInput').onchange=e=>{const n=Number(e.target.value);if(n<.2||n>2||!Number.isFinite(n)){toast('Размер 0.2–2 м');e.target.value=buildCellSize;return}if(furnitureItems.size){toast('Для смены размера клетки сначала уберите купленную мебель');e.target.value=buildCellSize;return}buildCellSize=n;refreshBuildGrid();save()};
 $('buildShowGrid').onclick=()=>{grid.visible=!grid.visible;toast(grid.visible?'Сетка включена':'Сетка скрыта')};
 $('buildShop').onclick=openFurnitureShop;$('buildInventory').onclick=openFurnitureInventory;$('buildSave').onclick=save;
}
// V14: определяем высоту верхней поверхности офисного пола.
function officeFloorHeight(){
 if(!officeRoot)return 0;
 let top=-Infinity;
 officeRoot.traverse(n=>{
  if(!n.isMesh||!/floor|ground|пол|плитк|основан/i.test(n.name))return;
  const b=new THREE.Box3().setFromObject(n),sz=b.getSize(new THREE.Vector3());
  if(sz.x>2&&sz.z>2&&sz.y<1.2&&b.max.y<3)top=Math.max(top,b.max.y);
 });
 return Number.isFinite(top)?top:0;
}
function refreshBuildGrid(){
 if(!grid||!navigation)return;
 const b=navigation.bounds;
 // GridHelper использует квадратную область, поэтому делаем прямоугольную сетку линиями.
 const lines=[]; const floorY=officeFloorHeight(); const y=floorY+.025;
 const minX=Math.ceil(b.minX/buildCellSize)*buildCellSize;
 const maxX=Math.floor(b.maxX/buildCellSize)*buildCellSize;
 const minZ=Math.ceil(b.minZ/buildCellSize)*buildCellSize;
 const maxZ=Math.floor(b.maxZ/buildCellSize)*buildCellSize;
 for(let x=minX;x<=maxX+.0001;x+=buildCellSize)lines.push(x,y,minZ,x,y,maxZ);
 for(let z=minZ;z<=maxZ+.0001;z+=buildCellSize)lines.push(minX,y,z,maxX,y,z);
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(lines,3));
 const replacement=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0x3699db,transparent:true,opacity:.65,depthWrite:false}));
 replacement.name='Сетка строительства';replacement.visible=grid.visible;
 scene.remove(grid);grid.geometry?.dispose();grid.material?.dispose();grid=replacement;scene.add(grid);
}
function openFurnitureInventory(){
 modal('Объекты на карте',`<div class="build-list">${[...furnitureItems.values()].map(o=>`<div class="build-product"><i class="ti ti-${safe(o.item.icon)}"></i><div><b>${safe(o.item.name)}</b><small>${safe(o.id)} · X:${o.x.toFixed(2)} Z:${o.z.toFixed(2)}</small></div><button data-fselect="${safe(o.id)}">Открыть</button></div>`).join('')||'<p class="muted">Мебель не куплена.</p>'}</div>`);
 document.querySelectorAll('[data-fselect]').forEach(b=>b.onclick=()=>openFurnitureObject(b.dataset.fselect));
}
function openFurnitureObject(id){const o=furnitureItems.get(id);if(!o)return;modal(o.item.name,`<p class="build-summary">ID: ${safe(id)}<br>X: ${o.x.toFixed(2)} м · Z: ${o.z.toFixed(2)} м<br>Поворот: ${Math.round(o.rot*180/Math.PI)}°</p><div class="actions">${o.item.id==='plant'?'<button id="fwater">Полить</button><button id="fzoom">Приблизить</button><button id="fphoto">Фото сбоку</button>':''}${o.item.id==='board'?'<button id="fdraw">Рисовать / стикеры</button>':''}<button id="frotate">Повернуть на 90°</button><button id="fmove">Переместить</button><button id="fsell">Продать за ${Math.floor(o.item.price*.5)}</button><button id="fback">К списку</button></div>`);
 if($('fwater'))$('fwater').onclick=()=>{o.wateredAt=Date.now();plantWaterTimes[id]=o.wateredAt;save();toast('Цветок полит');openFurnitureObject(id)};
 if($('fzoom'))$('fzoom').onclick=()=>{focusFurniture(o);closeModal()};
 if($('fphoto'))$('fphoto').onclick=()=>photoFurniture(o);
 if($('fdraw'))$('fdraw').onclick=()=>openBoardEditor(id);
 $('frotate').onclick=()=>{const rot=o.rot+Math.PI/2;if(!furnitureCanPlace(o.item,o.x,o.z,rot,id))return toast('Поворот невозможен: занято');o.rot=rot;o.mesh.rotation.y=rot;rerouteEmployees();save();openFurnitureObject(id)};
 $('fmove').onclick=()=>beginFurniturePlacement(o.item,id);$('fback').onclick=openFurnitureInventory;
 $('fsell').onclick=()=>{furnitureRoot.remove(o.mesh);furnitureItems.delete(id);delete boardImages[id];delete plantWaterTimes[id];funds+=Math.floor(o.item.price*.5);rerouteEmployees();save();openFurnitureInventory();toast('Мебель продана')};
}
function beginFurniturePlacement(item,moveId=null){
 if(!initialized)return toast('Сцена ещё загружается');
 if(!moveId&&funds<item.price)return toast('Недостаточно средств');
 if(!moveId&&furnitureItems.size>=FURNITURE_LIMIT)return toast('Достигнут лимит мебели');
 cancelFurniturePlacement();const old=moveId?furnitureItems.get(moveId):null;
 const [sw,sd]=furnitureSize(item,old?.rot??0);
 buildPlacement={item,moveId,x:old?.x??(Math.round(sw/buildCellSize)%2?buildCellSize/2:0),z:old?.z??(Math.round(sd/buildCellSize)%2?buildCellSize/2:0),rot:old?.rot??0,preview:null,valid:false};
 $('buildHud').hidden=false;$('buildTitle').textContent=(moveId?'Перемещение: ':'Покупка: ')+item.name;closeModal();refreshBuildGrid();grid.visible=true;updateFurniturePreview();
}
function updateFurniturePreview(){
 const p=buildPlacement;if(!p)return;
 if(p.preview)scene.remove(p.preview);
 p.valid=furnitureCanPlace(p.item,p.x,p.z,p.rot,p.moveId);
 const mesh=scaleVisualFurniture(furnitureMesh(p.item),p.item);mesh.position.set(p.x,0,p.z);mesh.rotation.y=p.rot;mesh.updateMatrixWorld(true);const previewBounds=new THREE.Box3().setFromObject(mesh);if(!previewBounds.isEmpty())mesh.position.y+=.025-previewBounds.min.y;
 mesh.traverse(n=>{if(n.isMesh){n.material=n.material.clone();n.material.color.set(p.valid?0x268fff:0xff3f55);n.material.transparent=true;n.material.opacity=.55;n.material.depthWrite=false}});
 scene.add(mesh);p.preview=mesh;
 $('buildHint').textContent=p.valid?'Синий: можно разместить':'Красный: нельзя разместить';$('buildHint').style.color=p.valid?'#79c3ff':'#ff7a8a';$('buildApply').disabled=!p.valid;
}
function cancelFurniturePlacement(){if(buildPlacement?.preview)scene?.remove(buildPlacement.preview);buildPlacement=null;$('buildHud').hidden=true;if(grid)grid.visible=false;}
function applyFurniturePlacement(){
 const p=buildPlacement;if(!p||!p.valid)return;
 if(!furnitureCanPlace(p.item,p.x,p.z,p.rot,p.moveId))return toast('Место занято');
 if(!p.moveId&&funds<p.item.price)return toast('Недостаточно средств');
 if(p.moveId){const old=furnitureItems.get(p.moveId);if(!old)return cancelFurniturePlacement();furnitureRoot.remove(old.mesh);furnitureItems.delete(old.id)}
 else funds-=p.item.price;
 furnitureCreate(p.moveId||'furniture_'+(++furnitureCounter),p.item,p.x,p.z,p.rot);
 cancelFurniturePlacement();rerouteEmployees();save();toast('Мебель размещена');
}
$('buildTurnL').onclick=()=>{if(buildPlacement){buildPlacement.rot-=Math.PI/2;updateFurniturePreview()}};
$('buildTurnR').onclick=()=>{if(buildPlacement){buildPlacement.rot+=Math.PI/2;updateFurniturePreview()}};
$('buildApply').onclick=applyFurniturePlacement;$('buildCancel').onclick=cancelFurniturePlacement;
// Перехватываем только короткие нажатия при размещении; обычное вращение камеры сохраняется.
let buildPointer=null;
$('scene').addEventListener('pointerdown',e=>{if(buildPlacement)buildPointer={x:e.clientX,y:e.clientY}},true);
$('scene').addEventListener('pointerup',e=>{if(!buildPlacement||!buildPointer)return;const d=Math.hypot(e.clientX-buildPointer.x,e.clientY-buildPointer.y);buildPointer=null;if(d>9)return;const p=floorPoint(e);if(!p)return;const [fw,fd]=furnitureSize(buildPlacement.item,buildPlacement.rot);
 // Центр прямоугольника привязывается к клеткам с учётом чётной/нечётной ширины.
 buildPlacement.x=(Math.floor(p.x/buildCellSize)+.5)*buildCellSize + (Math.round(fw/buildCellSize)%2===0 ? buildCellSize/2 : 0);
 buildPlacement.z=(Math.floor(p.z/buildCellSize)+.5)*buildCellSize + (Math.round(fd/buildCellSize)%2===0 ? buildCellSize/2 : 0);updateFurniturePreview();e.stopImmediatePropagation()},true);
// Клик по установленной мебели открывает её свойства.
$('scene').addEventListener('pointerup',e=>{if(buildPlacement||!running||!pointerDown||pointerDown.button!==0)return;if(Math.hypot(e.clientX-pointerDown.x,e.clientY-pointerDown.y)>5)return;setMouse(e);const hits=raycaster.intersectObjects([...furnitureItems.values()].map(o=>o.mesh),true);const id=hits.find(h=>h.object.userData.furnitureId)?.object.userData.furnitureId;if(id){const obj=furnitureItems.get(id);if(obj?.item.id==='board')openBoardEditor(id);else openFurnitureObject(id);e.stopImmediatePropagation()}},true);
// V14: ПКМ на мебели — настройки объекта. Удержание 600 мс — то же меню.
function pickFurnitureAt(e){setMouse(e);const hits=raycaster.intersectObjects([...furnitureItems.values()].map(o=>o.mesh),true);return hits.find(h=>h.object.userData.furnitureId)?.object.userData.furnitureId||null}
$('scene').addEventListener('contextmenu',e=>{if(!running||buildPlacement)return;const id=pickFurnitureAt(e);if(id){e.preventDefault();e.stopImmediatePropagation();openFurnitureObject(id)}},true);
let furnitureHoldTimer=null, furnitureHoldStart=null;
$('scene').addEventListener('pointerdown',e=>{if(e.button!==0||buildPlacement)return;const id=pickFurnitureAt(e);if(!id)return;furnitureHoldStart={x:e.clientX,y:e.clientY};furnitureHoldTimer=setTimeout(()=>{furnitureHoldTimer=null;openFurnitureObject(id);furnitureHoldStart=null},600)},true);
$('scene').addEventListener('pointermove',e=>{if(furnitureHoldStart&&Math.hypot(e.clientX-furnitureHoldStart.x,e.clientY-furnitureHoldStart.y)>9){clearTimeout(furnitureHoldTimer);furnitureHoldTimer=null;furnitureHoldStart=null}},true);
['pointerup','pointercancel','pointerleave'].forEach(type=>$('scene').addEventListener(type,()=>{clearTimeout(furnitureHoldTimer);furnitureHoldTimer=null;furnitureHoldStart=null},true));
// IndexedDB хранит ZIP для восстановления после перезагрузки (если браузер разрешает).
async function furnitureDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open('aranima-furniture-v4',1);r.onupgradeneeded=()=>r.result.createObjectStore('files');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function storeFurnitureZip(file){const db=await furnitureDB();return new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').put(file,'last');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
async function readFurnitureZip(){const db=await furnitureDB();return new Promise((resolve,reject)=>{const r=db.transaction('files','readonly').objectStore('files').get('last');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function importFurnitureZip(file,persist=false){
 if(file.size>80*1024*1024)throw Error('ZIP больше 80 МБ');
 const {default:JSZip}=await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm');const zip=await JSZip.loadAsync(file);
 const entries=Object.values(zip.files).filter(x=>!x.dir&&/\.glb$/i.test(x.name)&&!x.name.includes('..')).slice(0,40);
 const totalUncompressed=entries.reduce((n,e)=>n+(e._data?.uncompressedSize||0),0);if(totalUncompressed>300*1024*1024)throw Error('Распакованные модели превышают 300 МБ');
 if(!entries.length)throw Error('В ZIP не найдены GLB');
 let count=0;
 for(const entry of entries){try{const data=await entry.async('arraybuffer');if(data.byteLength>30*1024*1024)continue;const model=await new Promise((resolve,reject)=>loader.parse(data,'',g=>resolve(g.scene),reject));const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3());if(![size.x,size.y,size.z].every(v=>Number.isFinite(v)&&v>0))continue;
 const id='zip_'+entry.name.replace(/[^a-z0-9]/gi,'_').slice(0,48),def={id,name:entry.name.split('/').pop().replace(/\.glb$/i,'').slice(0,48),price:150,w:Math.max(.2,Math.min(6,size.x)),d:Math.max(.2,Math.min(6,size.z)),h:Math.max(.2,Math.min(6,size.y)),color:0x708ba8,icon:'cube'};
 const index=FURNITURE_CATALOG.findIndex(x=>x.id===id);if(index<0)FURNITURE_CATALOG.push(def);else FURNITURE_CATALOG[index]=def;importedTemplates.set(id,model);count++;
 }catch(err){console.warn('GLB пропущен:',entry.name,err)}}
 if(!count)throw Error('Не удалось прочитать модели');
 if(persist)await storeFurnitureZip(file);
 restorePendingFurniture();return count;
}
// Импорт архива должен завершиться до восстановления расстановки мебели.
window.addEventListener('office-ready',async()=>{await loadCatalogModels();try{const file=await readFurnitureZip();if(file)await importFurnitureZip(file,false)}catch(err){console.warn('ZIP не восстановлен',err)}restorePendingFurniture()});


// ================================================================
// V5 / GLB КАТАЛОГ И ИНТЕРАКТИВНЫЕ ЦВЕТЫ / ДОСКА
// ================================================================
const MODEL_PATHS={plant:'./models/flower.glb',board:'./models/board.glb'};
const catalogLoadStatus={plant:'(загрузка GLB)',board:'(загрузка GLB)'};
let catalogModelsReady=false;
const boardImages=Object.create(null),plantWaterTimes=Object.create(null);
async function loadCatalogModels(){
 await Promise.all(Object.entries(MODEL_PATHS).map(async([id,path])=>{
  try{const gltf=await loader.loadAsync(path);importedTemplates.set(id,gltf.scene);catalogLoadStatus[id]='✓ GLB';}
  catch(err){catalogLoadStatus[id]='(резервная модель)';console.warn('Модель не загружена:',path,err)}
 }));
 catalogModelsReady=true;
}
// V14: attachBoardSurface удалена — никаких внешних белых листов.
function focusFurniture(o){
 const center=new THREE.Box3().setFromObject(o.mesh).getCenter(new THREE.Vector3());
 controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(2.1,1.5,2.5));controls.update();
}
function photoFurniture(o){
 focusFurniture(o);renderer.render(scene,camera);
 try{const url=renderer.domElement.toDataURL('image/png');const a=document.createElement('a');a.href=url;a.download=o.item.id+'-photo.png';a.click();toast('Фото сохранено')}
 catch(err){toast('Снимок недоступен: '+err.message)}
}
// V14 / board-editor.js — отдельные листы, без текстуры на 3D-объекте.
const BOARD_MAX_IMAGE_BYTES=2*1024*1024,BOARD_MAX_PAGES=12;
function boardStorageKey(id){return 'aranima-board-pages-v14-'+id}
function boardGetPages(id){
 try{const p=JSON.parse(localStorage.getItem(boardStorageKey(id))||'[]');return Array.isArray(p)?p.filter(x=>typeof x==='string'&&x.startsWith('data:image/png;base64,')).slice(0,BOARD_MAX_PAGES):[]}catch{return []}
}
function openBoardEditor(id){
 const o=furnitureItems.get(id);if(!o)return;
 modal('Доска · редактор листов',`<div class="board-page-bar"><button id="bprev" title="Предыдущий лист">‹</button><span id="bpageLabel">Лист 1 / 1</span><button id="bnext" title="Следующий лист">›</button><button id="bnew" title="Новый лист">+ Лист</button><button id="bdelete" title="Удалить лист">Удалить</button></div>
 <div class="board-tools">
 <button id="bpen" class="board-tool active" title="Маркер"><i class="ti ti-pencil"></i><span>Маркер</span></button>
 <button id="berase" class="board-tool" title="Ластик"><i class="ti ti-eraser"></i><span>Ластик</span></button>
 <input id="bcolor" type="color" value="#263c56" title="Цвет маркера"><input id="bwidth" type="range" min="2" max="40" value="6" title="Толщина">
 <button id="bsticker" class="board-tool" title="Стикер"><i class="ti ti-note"></i><span>Стикер</span></button>
 <button id="btext" class="board-tool" title="Текст"><i class="ti ti-typography"></i><span>Текст</span></button>
 <button id="bphoto" title="Добавить изображение"><i class="ti ti-photo-plus"></i><span>Фото</span></button>
 <input id="bfile" type="file" accept="image/png,image/jpeg,image/webp" hidden>
 <button id="bundo" title="Отменить"><i class="ti ti-arrow-back-up"></i></button>
 <button id="bredo" title="Повторить"><i class="ti ti-arrow-forward-up"></i></button>
 <button id="bdownload" title="Скачать PNG"><i class="ti ti-download"></i></button>
 <button id="bclear" title="Очистить лист"><i class="ti ti-trash"></i></button></div>
 <canvas id="boardEditor" width="1024" height="640" aria-label="Редактор доски"></canvas>
 <div class="actions"><button id="bsave" class="primary">Сохранить лист</button><button id="bcancel">Закрыть</button></div><p class="muted">Листы сохраняются в этом браузере. PNG, JPG, WebP до 2 МБ. Фото и стикеры размещаются внутри холста.</p>`);
 const canvas=$('boardEditor'),ctx=canvas.getContext('2d',{willReadFrequently:true});
 const blank=()=>{ctx.fillStyle='#f7f8f4';ctx.fillRect(0,0,1024,640)};
 let pages=boardGetPages(id),index=0,mode='pen',drawing=false,last=null,history=[],future=[];
 if(!pages.length){blank();pages=[canvas.toDataURL('image/png')]}else{blank()}
 const restore=url=>new Promise(resolve=>{const img=new Image();img.onload=()=>{blank();ctx.drawImage(img,0,0,1024,640);resolve()};img.onerror=resolve;img.src=url});
 const snapshot=()=>{history.push(canvas.toDataURL('image/png'));if(history.length>20)history.shift();future=[]};
 const persist=()=>{pages[index]=canvas.toDataURL('image/png');try{localStorage.setItem(boardStorageKey(id),JSON.stringify(pages));boardImages[id]=pages[index];save();return true}catch(e){toast('Недостаточно места для сохранения листов');return false}};
 const label=()=>{$('bpageLabel').textContent=`Лист ${index+1} / ${pages.length}`;$('bprev').disabled=index===0;$('bnext').disabled=index===pages.length-1};
 const switchPage=async n=>{if(n<0||n>=pages.length)return;persist();index=n;history=[];future=[];await restore(pages[index]);label()};
 $('bprev').onclick=()=>switchPage(index-1);$('bnext').onclick=()=>switchPage(index+1);
 $('bnew').onclick=()=>{if(pages.length>=BOARD_MAX_PAGES)return toast('Максимум 12 листов');persist();blank();pages.push(canvas.toDataURL('image/png'));index=pages.length-1;history=[];future=[];label();persist()};
 $('bdelete').onclick=async()=>{if(!confirm('Удалить текущий лист?'))return;pages.splice(index,1);if(!pages.length){blank();pages=[canvas.toDataURL('image/png')]}index=Math.min(index,pages.length-1);await restore(pages[index]);label();persist()};
 const choose=next=>{mode=next;document.querySelectorAll('.board-tool').forEach(b=>b.classList.toggle('active',b.id==='b'+next))};
 $('bpen').onclick=()=>choose('pen');$('berase').onclick=()=>choose('erase');$('bsticker').onclick=()=>choose('sticker');$('btext').onclick=()=>choose('text');
 $('bundo').onclick=async()=>{if(!history.length)return;future.push(canvas.toDataURL('image/png'));await restore(history.pop())};
 $('bredo').onclick=async()=>{if(!future.length)return;history.push(canvas.toDataURL('image/png'));await restore(future.pop())};
 $('bclear').onclick=()=>{snapshot();blank()};
 $('bdownload').onclick=()=>{const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download=`aranima-board-${index+1}.png`;a.click()};
 $('bphoto').onclick=()=>$('bfile').click();
 $('bfile').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>BOARD_MAX_IMAGE_BYTES){toast('Только PNG/JPG/WebP до 2 МБ');e.target.value='';return}
  const url=URL.createObjectURL(file);try{const img=await createImageBitmap(file);snapshot();const k=Math.min(650/img.width,430/img.height,1);const w=img.width*k,h=img.height*k;ctx.drawImage(img,(1024-w)/2,(640-h)/2,w,h);img.close();toast('Фото добавлено на лист')}catch{toast('Не удалось открыть изображение')}finally{URL.revokeObjectURL(url);e.target.value=''}
 };
 const point=e=>{const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*1024/r.width,y:(e.clientY-r.top)*640/r.height}};
 canvas.onpointerdown=e=>{const p=point(e);if(mode==='sticker'){snapshot();ctx.fillStyle='#f6d66b';ctx.fillRect(p.x-60,p.y-48,120,96);ctx.fillStyle='#76521c';ctx.font='19px Arial';ctx.fillText('Заметка',p.x-45,p.y-12);return}
 if(mode==='text'){const value=prompt('Текст (до 100 символов):','');if(!value)return;snapshot();ctx.fillStyle=$('bcolor').value;ctx.font='32px Arial';ctx.fillText(value.replace(/[<>\u0000-\u001f]/g,'').slice(0,100),p.x,p.y,900);return}
 snapshot();drawing=true;last=p;canvas.setPointerCapture(e.pointerId)};
 canvas.onpointermove=e=>{if(!drawing)return;const p=point(e);ctx.strokeStyle=mode==='erase'?'#f7f8f4':$('bcolor').value;ctx.lineWidth=mode==='erase'?40:Number($('bwidth').value);ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();last=p};
 canvas.onpointerup=canvas.onpointercancel=()=>{drawing=false;last=null};
 $('bsave').onclick=()=>{if(persist())toast('Лист сохранён')};$('bcancel').onclick=()=>{persist();closeModal()};
 if(boardImages[id]&&pages.length===1&&pages[0]!==boardImages[id]){pages[0]=boardImages[id]}
 restore(pages[0]).then(label);
}

// V6 / Keyboard controls and compact layout
window.addEventListener('keydown',e=>{
 if(!buildPlacement || ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
 if(e.code==='KeyR'){e.preventDefault();buildPlacement.rot+=Math.PI/2;updateFurniturePreview()}
 if(e.code==='Enter'){e.preventDefault();applyFurniturePlacement()}
 if(e.code==='Escape'){e.preventDefault();cancelFurniturePlacement()}
});
window.addEventListener('office-ready',()=>{
 refreshBuildGrid();
 // Отдельная настройка масштаба через кнопку конструктора.
});


// =====================================================================
// V7 / ui-menu.js — меню, профиль, информация, поддержка, донат
// =====================================================================
const SUPPORT_ENDPOINT = ''; // ВПИШИТЕ URL вашего API: https://domain.tld/api/support
const SUPPORT_MAX_FILES = 3;
const SUPPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;
const SUPPORT_MAX_TOTAL_BYTES = 12 * 1024 * 1024;
const SUPPORT_ALLOWED_EXT = new Set(['png','jpg','jpeg','webp','pdf','txt','log']);
const SUPPORT_ALLOWED_MIME = new Set(['image/png','image/jpeg','image/webp','application/pdf','text/plain']);
const SUPPORT_TAGS = ['#ошибка','#оплата','#сотрудники','#мебель','#строительство','#загрузка','#сохранение','#предложение'];
// V10 / 3-menu: обложки и PNG стикеры (пути относительно index.html)
const MORE_ART=Object.freeze({
 about:{cover:'3-menu/info.png',sticker:'stiker/space.png',icon:'info-circle'},
 support:{cover:'3-menu/tehcentr.png',sticker:'stiker/coffe.png',icon:'headset'},
 donate:{cover:'3-menu/donat.png',sticker:'stiker/coin.png',icon:'heart-handshake'}
});
function infoArt(type){
 const cfg=MORE_ART[type];if(!cfg)return '';
 // DOM-разметка формируется только из констант разработчика.
 const count=Math.max(5,Math.min(15,Math.round(Number(gameSettings.stickerCount)||10)));
 const stickers=Array.from({length:count},(_,i)=>{
  const x=6+((i*37+11)%87),y=9+((i*23+7)%64),size=19+(i*7)%20;
  return `<img class="floating-sticker" src="${cfg.sticker}" alt="" draggable="false" style="--x:${x}%;--y:${y}%;--size:${size}px;--opacity:${(0.66+(i%4)*.1).toFixed(2)};--duration:${2.3+(i%5)*.43}s;--delay:-${(i%7)*.35}s;animation-play-state:${gameSettings.stickerMotion?'running':'paused'}">`;
 }).join('');
 return `<div class="hero-sticker-wrap"><div class="info-hero info-hero-art"><img src="${cfg.cover}" alt="Иллюстрация раздела" onerror="this.parentElement.classList.add('is-missing')"><span class="hero-fallback"><i class="ti ti-${cfg.icon}"></i></span></div><div class="sticker-field" aria-hidden="true">${stickers}</div></div>`;
}
// V10 / Настройки профиля: независимая секция для будущих параметров.
function renderProfileSettings(){
 modal('Профиль и настройки',`<div class="profile-settings">
 <details class="profile-group" open><summary><i class="ti ti-user-circle"></i> Игрок</summary><p class="muted">Сотрудники: ${employees.length} · Баланс: ${funds}</p>
 <div class="field"><label for="userNameInput">Имя игрока</label><input id="userNameInput" maxlength="40" value="${safe(gameSettings.userName)}"></div>
 <div class="field"><label for="userPhotoInput">Фотография (PNG/JPEG/WebP, до 1 МБ)</label><input id="userPhotoInput" type="file" accept="image/png,image/jpeg,image/webp"></div>
 <img id="userPhotoPreview" src="${gameSettings.userPhoto||''}" alt="Аватар" style="width:64px;height:64px;object-fit:cover;border-radius:50%;${gameSettings.userPhoto?'':'display:none'}">
 </details><details class="profile-group"><summary><i class="ti ti-wallet"></i> TON-кошелёк</summary><p class="muted" id="tonStatus">Не подключён</p><button type="button" id="tonConnect">Подключить TON</button><button type="button" id="tonDisconnect">Отключить</button><p class="muted">Нужен публичный HTTPS-сайт и tonconnect-manifest.json. Подключение не означает оплату.</p></details>
 <details class="profile-group"><summary><i class="ti ti-volume"></i> Звук интерфейса</summary>
 <label class="profile-setting-row">Звук нажатий <input id="profileSoundEnabled" type="checkbox" ${gameSettings.soundEnabled?'checked':''}></label>
 <label class="profile-setting-row">Громкость <input id="profileClickVolume" type="range" min="0" max="100" value="${gameSettings.clickVolume}"><output id="profileVolumeValue">${gameSettings.clickVolume}%</output></label>
 <button id="profileTestSound" type="button">Прослушать звук</button> <button id="profileUploadSound" type="button">Загрузить WAV</button>
 </details><details class="profile-group"><summary><i class="ti ti-palette"></i> Оформление</summary><label class="profile-setting-row">Цвет активных кнопок <input id="profileAccentColor" type="color" value="${gameSettings.accentColor}"></label>
 <label class="profile-setting-row">Количество стикеров (5–15) <input id="profileStickerCount" type="range" min="5" max="15" step="1" value="${gameSettings.stickerCount}"><output id="profileStickerValue">${gameSettings.stickerCount}</output></label>
 <label class="profile-setting-row">Анимация стикеров <input id="profileStickerMotion" type="checkbox" ${gameSettings.stickerMotion?'checked':''}></label>
 </details><details class="profile-group"><summary><i class="ti ti-device-gamepad-2"></i> Настройки игры</summary><p class="muted">Сетка, коллизии, камера, импорт и экспорт сохранения.</p><button id="profileAdvancedSettings" type="button">Расширенные настройки 3D</button></details>
 </div>`);
 $('modal').querySelector('.dialog').classList.add('info-dialog');
 document.querySelectorAll('.profile-group').forEach(group=>group.addEventListener('toggle',()=>{
   if(group.open)document.querySelectorAll('.profile-group').forEach(other=>{if(other!==group)other.open=false});
 }));
 const set=(id,key,convert=x=>x)=>{$(id).addEventListener('input',e=>{gameSettings[key]=convert(e.target.type==='checkbox'?e.target.checked:e.target.value);persistGameSettings();if(key==='clickVolume')$('profileVolumeValue').textContent=gameSettings.clickVolume+'%';if(key==='stickerCount')$('profileStickerValue').textContent=gameSettings.stickerCount;if(key==='soundEnabled'&&!gameSettings.soundEnabled)menuStop()})};
 set('profileSoundEnabled','soundEnabled');set('profileClickVolume','clickVolume',Number);set('profileStickerCount','stickerCount',Number);set('profileStickerMotion','stickerMotion');
 $('profileAccentColor').oninput=e=>{gameSettings.accentColor=e.target.value;persistGameSettings();applyAccent()};
 $('userNameInput').onchange=e=>{gameSettings.userName=cleanUserText(e.target.value,{max:40}).trim()||'Игрок';e.target.value=gameSettings.userName;persistGameSettings();refreshAvatar()};
 $('userPhotoInput').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;if(!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>1024*1024){toast('Фото: PNG/JPEG/WebP до 1 МБ');return}const reader=new FileReader();reader.onload=()=>{gameSettings.userPhoto=reader.result;persistGameSettings();$('userPhotoPreview').src=reader.result;$('userPhotoPreview').style.display='block';refreshAvatar()};reader.readAsDataURL(f)};
 $('tonConnect').onclick=connectTonWallet;$('tonDisconnect').onclick=disconnectTonWallet;updateTonStatus();
 $('profileTestSound').onclick=menuPlay;
 $('profileUploadSound').onclick=()=>$('menuSoundFile').click();
 $('profileAdvancedSettings').onclick=settingsMenu;
}
const moreWrap = $('moreWrap'), moreDropdown = $('moreDropdown'), moreButton = $('moreButton');
function closeMore(){moreDropdown.hidden=true;moreButton.setAttribute('aria-expanded','false')}
moreButton.addEventListener('click',e=>{e.stopPropagation();moreDropdown.hidden=!moreDropdown.hidden;moreButton.setAttribute('aria-expanded',String(!moreDropdown.hidden))});
document.addEventListener('pointerdown',e=>{if(!moreWrap.contains(e.target))closeMore()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMore()});
moreDropdown.addEventListener('click',e=>{const b=e.target.closest('[data-info]');if(!b)return;closeMore();openInfoPanel(b.dataset.info)});
function openInfoPanel(type){
 const hero=(icon)=>`<div class="info-hero" aria-hidden="true"><i class="ti ti-${icon}"></i></div>`;
 if(type==='about'){
  modal('Об игре «Аранима»',infoArt('about')+`<div class="info-copy"><h3>Офис-конструктор</h3><p>Создавайте офис, расставляйте мебель по клеткам, управляйте сотрудниками и выполняйте задания. В 3D-сцене можно вращать камеру, выбирать объекты и менять планировку.</p><h3>Управление</h3><p>ЛКМ — выбор; перетаскивание — вращение камеры; колесо — масштаб; Shift + ЛКМ — панорама. В режиме строительства выберите предмет, наведите на клетку и подтвердите размещение. R — поворот, Enter — установка, Esc — отмена.</p><p>Сохранение выполняется в браузере на текущем устройстве. Для синхронизации между устройствами понадобится сервер.</p></div>`);
 } else if(type==='donate'){
  modal('Поддержать проект',infoArt('donate')+`<div class="info-copy"><h3>Развитие «Аранима»</h3><p>Поддержка проекта помогает создавать новые офисные помещения, модели мебели, задания и игровые функции.</p><p>Платёжная система пока не подключена. Не вводите платёжные данные в это окно.</p><button id="donateMore" class="primary wide">Связаться с разработчиком</button></div>`);
  $('donateMore').onclick=()=>openInfoPanel('support');
 } else if(type==='support'){
  modal('Техническая поддержка',infoArt('support')+`<form id="supportForm" novalidate><div class="field"><label for="supportTopic">Тема обращения</label><select id="supportTopic" required><option value="">Выберите тему</option>${SUPPORT_TAGS.map(t=>`<option value="${t}">${t}</option>`).join('')}</select></div><div class="support-tags" id="supportTags">${SUPPORT_TAGS.map(t=>`<button type="button" data-tag="${t}">${t}</button>`).join('')}</div><div class="field"><label for="supportEmail">Электронная почта для ответа (необязательно)</label><input id="supportEmail" type="email" maxlength="120" autocomplete="email" placeholder="name@example.com"></div><div class="field"><label for="supportMessage">Описание проблемы (20–1000 символов)</label><textarea id="supportMessage" minlength="20" maxlength="1000" rows="5" required placeholder="Что произошло? Как повторить проблему? Что ожидалось?"></textarea><div class="support-count" id="supportCount">0 / 1000</div></div><div class="field"><label for="supportFiles">Вложения: до 3 файлов, каждый до 5 МБ, всего до 12 МБ</label><input id="supportFiles" type="file" multiple accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.log,image/png,image/jpeg,image/webp,application/pdf,text/plain"><div class="support-files" id="supportFileList">Файлы не выбраны</div></div><p class="support-error" id="supportError" role="alert"></p><button id="supportSubmit" type="submit" class="primary wide">Отправить обращение</button><p class="muted">Не отправляйте пароли, токены и персональные документы. Вложения проверяются также на сервере.</p></form>`);
  const topic=$('supportTopic'),msg=$('supportMessage'),files=$('supportFiles'),err=$('supportError');
  $('supportTags').querySelectorAll('[data-tag]').forEach(b=>b.onclick=()=>{topic.value=b.dataset.tag;updateTags()});
  function updateTags(){$('supportTags').querySelectorAll('[data-tag]').forEach(b=>b.classList.toggle('active',b.dataset.tag===topic.value))}
  topic.onchange=updateTags;
  msg.oninput=()=>{$('supportCount').textContent=`${msg.value.length} / 1000`};
  function validateFiles(){const list=[...files.files];if(list.length>SUPPORT_MAX_FILES)throw Error('Не более трёх файлов');let total=0;for(const f of list){const ext=f.name.split('.').pop().toLowerCase();if(!SUPPORT_ALLOWED_EXT.has(ext)|| (f.type&&!SUPPORT_ALLOWED_MIME.has(f.type)))throw Error('Недопустимый формат файла: '+f.name);if(f.size>SUPPORT_MAX_FILE_BYTES)throw Error('Файл больше 5 МБ: '+f.name);total+=f.size}if(total>SUPPORT_MAX_TOTAL_BYTES)throw Error('Общий размер вложений больше 12 МБ');return list}
  files.onchange=()=>{try{const list=validateFiles();err.textContent='';$('supportFileList').textContent=list.length?list.map(f=>`${f.name} (${(f.size/1024/1024).toFixed(2)} МБ)`).join(' · '):'Файлы не выбраны'}catch(ex){err.textContent=ex.message;files.value='';$('supportFileList').textContent='Файлы не выбраны'}};
  $('supportForm').onsubmit=async e=>{e.preventDefault();err.textContent='';const text=msg.value.normalize('NFC').trim();const email=$('supportEmail').value.trim();if(!SUPPORT_TAGS.includes(topic.value)){err.textContent='Выберите тему';return}if(text.length<20||text.length>1000||/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)){err.textContent='Описание должно содержать 20–1000 корректных символов';return}if(email&&(email.length>120||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))){err.textContent='Неверный адрес почты';return}let selected;try{selected=validateFiles()}catch(ex){err.textContent=ex.message;return}if(!SUPPORT_ENDPOINT){err.textContent='Отправка пока не настроена: укажите SUPPORT_ENDPOINT и подключите серверный обработчик.';return}const body=new FormData();body.append('topic',topic.value);body.append('message',text);body.append('email',email);selected.forEach(f=>body.append('files',f,f.name));const submit=$('supportSubmit');submit.disabled=true;submit.textContent='Отправка...';try{const response=await fetch(SUPPORT_ENDPOINT,{method:'POST',body,credentials:'omit'});if(!response.ok)throw Error(`Сервер вернул HTTP ${response.status}`);const result=await response.json();if(result?.ok!==true)throw Error('Сервер не подтвердил приём обращения');modal('Обращение принято',hero('circle-check')+`<p class="info-copy">Сервер подтвердил получение обращения. Номер заявки: ${safe(String(result.ticketId??'не указан'))}.</p>`)}catch(ex){err.textContent='Не удалось отправить: '+ex.message;submit.disabled=false;submit.textContent='Отправить обращение'}};
 }
 $('modal').querySelector('.dialog').classList.add('info-dialog');
}
// После закрытия любых модальных окон очищаем специальный класс.
const originalCloseModalV7=closeModal;
// Существующая closeModal объявлена как функция, поэтому класс удаляем наблюдателем.
new MutationObserver(()=>{if($('modal').classList.contains('hidden'))$('modal').querySelector('.dialog').classList.remove('info-dialog')}).observe($('modal'),{attributes:true,attributeFilter:['class']});
$('fixedProfile').onclick=renderProfileSettings;

// V11 / Функциональные расширения интерфейса
function setToolbarActive(action){
 document.querySelectorAll('#toolbarLoop [data-action]').forEach(b=>{const active=b.dataset.action===action;b.classList.toggle('selected-tool',active);b.setAttribute('aria-pressed',String(active))});
}
function refreshAvatar(){const b=document.getElementById('fixedProfile');if(!b)return;const i=b.querySelector('i');let img=b.querySelector('img.user-avatar');if(gameSettings.userPhoto){if(!img){img=document.createElement('img');img.className='user-avatar';b.prepend(img)}img.src=gameSettings.userPhoto;if(i)i.hidden=true}else{img?.remove();if(i)i.hidden=false}b.title='Профиль: '+gameSettings.userName}
refreshAvatar();
// AI — локальный конструктор промптов; не выдаёт себя за подключённую языковую модель.
function openAIHelper(){
 modal('AI / Помощник офиса',`<div class="field"><label for="aiMode">Тип задачи</label><select id="aiMode"><option value="document">Документ</option><option value="design">Планировка</option><option value="staff">Задание сотруднику</option><option value="report">Отчёт</option></select></div><div class="field"><label for="aiRequest">Описание задачи</label><textarea id="aiRequest" maxlength="500" placeholder="Что требуется выполнить?"></textarea></div><button id="aiCreate" class="primary wide">Сформировать промпт</button><div class="field"><label for="aiResult">Результат</label><textarea id="aiResult" readonly></textarea></div><button id="aiCopy">Копировать</button><p class="muted">Генерация промпта выполняется локально. Для ответов ИИ потребуется отдельный API или локальная модель.</p>`);
 $('aiCreate').onclick=()=>{const request=cleanUserText($('aiRequest').value,{max:500,multiline:true}).trim();if(!request){toast('Введите задачу');return}const modes={document:'Составь офисный документ',design:'Разработай планировку офиса',staff:'Сформулируй рабочее задание сотруднику',report:'Подготовь структурированный отчёт'};$('aiResult').value=`${modes[$('aiMode').value]}. Контекст: офисная экономическая игра «Аранима». Задача: ${request}. Ответ: цель, шаги, ресурсы, критерии завершения.`};
 $('aiCopy').onclick=async()=>{const value=$('aiResult').value;if(!value)return;try{await navigator.clipboard.writeText(value);toast('Промпт скопирован')}catch{ $('aiResult').select();toast('Выделите и скопируйте текст')}};
}
// TON Connect: подключение через официальный клиентский SDK, без запроса seed-фразы.
let tonUI=null,tonWallet=null;
async function ensureTonSDK(){if(window.TON_CONNECT_UI)return;await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://unpkg.com/@tonconnect/ui@2.3.1/dist/tonconnect-ui.min.js';script.onload=resolve;script.onerror=()=>reject(Error('SDK TON Connect недоступен'));document.head.append(script)})}
function updateTonStatus(){const el=document.getElementById('tonStatus');if(el)el.textContent=tonWallet?.account?.address?'Подключён: '+tonWallet.account.address.slice(0,10)+'…':'Не подключён'}
async function connectTonWallet(){try{if(!['https:','http:'].includes(location.protocol)||location.hostname==='localhost'){throw Error('Опубликуйте игру по HTTPS с manifest.json для подключения кошелька')}await ensureTonSDK();if(!tonUI){tonUI=new window.TON_CONNECT_UI.TonConnectUI({manifestUrl:new URL('./tonconnect-manifest.json',location.href).href});tonUI.onStatusChange(wallet=>{tonWallet=wallet;updateTonStatus()})}await tonUI.openModal()}catch(e){toast('TON: '+e.message)}}
async function disconnectTonWallet(){if(!tonUI){toast('Кошелёк не подключён');return}try{await tonUI.disconnect();tonWallet=null;updateTonStatus()}catch(e){toast('TON: '+e.message)}}
// Предотвращаем нативное перетаскивание графики и синее выделение только на игровых элементах.
document.addEventListener('dragstart',e=>{if(e.target.closest('#viewport img,.toolbar img,.office-image-tile,.emotion-bubble'))e.preventDefault()});

// =====================================================================
// V7 / infinite-toolbar.js — бесконечный циклический скролл
// =====================================================================
const rail=$('toolbarRail'),loop=$('toolbarLoop');
const baseButtons=[...loop.children];
// Клоны в обе стороны. Делегирование событий не зависит от клонирования.
const addSet=(where)=>{const frag=document.createDocumentFragment();baseButtons.forEach(b=>{const clone=b.cloneNode(true);clone.removeAttribute('id');clone.dataset.loopClone='1';frag.append(clone)});if(where==='start')loop.prepend(frag);else loop.append(frag)};
addSet('start');addSet('end');
let loopWidth=0,railAdjusting=false;
function measureLoop(){const children=[...loop.children];if(children.length<3)return;const first=children[0].getBoundingClientRect();const next=children[baseButtons.length].getBoundingClientRect();loopWidth=next.left-first.left;if(loopWidth>0&&(!rail.scrollLeft||rail.scrollLeft<loopWidth*.3))rail.scrollLeft=loopWidth}
requestAnimationFrame(measureLoop);
window.addEventListener('resize',()=>requestAnimationFrame(measureLoop));
rail.addEventListener('scroll',()=>{if(!loopWidth||railAdjusting)return;const x=rail.scrollLeft;if(x<loopWidth*.5||x>loopWidth*1.5){railAdjusting=true;rail.scrollLeft=x+(x<loopWidth*.5?loopWidth:-loopWidth);railAdjusting=false}},{passive:true});
// Клонированные кнопки вызывают обработчик оригинала, не дублируя логику игры.
loop.addEventListener('click',e=>{const clone=e.target.closest('[data-loop-clone="1"]');if(!clone)return;const action=clone.dataset.action;const original=baseButtons.find(b=>b.dataset.action===action);if(original){e.stopImmediatePropagation();original.click()}},true);
// =====================================================================
// V7 / grid-scale.js — раздельно: сетка, коллизия, визуальный GLB
// =====================================================================
// ВАЖНО: visualScale меняет только отображение, не footprint для коллизий.
// Пример: 0.72 = 72% исходного масштаба, предмет остаётся в тех же клетках.
const OBJECT_VISUAL_SCALE={desk:.80,chair:.82,sofa:.82,cabinet:.85,plant:.75,board:.82,meeting:.85,coffee:.85,lamp:.80};
const originalFurnitureMeshV7=furnitureMesh;
// Нельзя переопределять функцию-объявление через const с тем же именем.
// Поэтому коэффициенты применяются при создании и при обновлении предпросмотра.
function scaleVisualFurniture(mesh,item){
 const scale=OBJECT_VISUAL_SCALE[item.id]??1;
 mesh.scale.multiplyScalar(scale);
 mesh.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(mesh);
 if(!bounds.isEmpty())mesh.position.y+=0.012-bounds.min.y;
 return mesh;
}
const originalFurnitureCreateV7=furnitureCreate;
// Событие готовности для настройки существующей сцены.
window.addEventListener('office-ready',()=>{if(grid){grid.visible=false}const b=navigation?.bounds;if(b)console.info('Сетка офиса:',b,'размер клетки',buildCellSize)});

