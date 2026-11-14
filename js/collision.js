// Извлечено из исходного V14 без изменения методов.
// THREE передаётся из main.js после динамической загрузки.
let THREE;
export function setNavigationThree(threeModule) { THREE = threeModule; }

class OfficeNavigation {
  constructor() {
    this.bounds = {
      minX: -8.5, maxX: 8.5,
      minZ: -6, maxZ: 6
    };
    this.obstacles = [];
    this.radius = 0.32;
    this.cell = 0.4;
    this.debug = null;
  }

  addBox(x, z, width, depth, name = "Препятствие") {
    this.obstacles.push({
      minX: x - width / 2,
      maxX: x + width / 2,
      minZ: z - depth / 2,
      maxZ: z + depth / 2,
      name
    });
  }

  build(root, demo = false) {
    this.obstacles = [];

    if (demo) {
      this.bounds = {
        minX: -8.55, maxX: 8.55,
        minZ: -6.05, maxZ: 6.05
      };

      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 3; col++) {
          const x = -5.5 + col * 5.5;
          const z = -2.8 + row * 5.2;

          this.addBox(x, z, 2.9, 1.6, "Рабочий стол");
          this.addBox(x, z + 1.2, 1.0, 0.9, "Кресло");
        }
      }

      this.addBox(7.1, -4.6, 2.3, 0.85, "Шкаф");
      return;
    }

    root.updateMatrixWorld(true);

    const full = new THREE.Box3().setFromObject(root);
    // V14: границы по геометрии пола, а не по всему офису и декорациям.
    const floorBox = new THREE.Box3(); let floorCount=0;
    root.traverse(node=>{
      if(!node.isMesh || !/floor|ground|пол|основан|плитк/i.test(node.name))return;
      const box=new THREE.Box3().setFromObject(node), size=box.getSize(new THREE.Vector3());
      if(size.x>2 && size.z>2 && size.y<1.2){floorBox.union(box);floorCount++}
    });
    if(floorCount && !floorBox.isEmpty()) full.copy(floorBox);
    const size = full.getSize(new THREE.Vector3());

    if (size.x > 2 && size.z > 2) {
      this.bounds = {
        minX: full.min.x + 0.4,
        maxX: full.max.x - 0.4,
        minZ: full.min.z + 0.4,
        maxZ: full.max.z - 0.4
      };
    }

    root.traverse(node => {
      if (!node.isMesh) return;
      if (node.userData.walkable === true) return;
      if (node.userData.collision === false) return;

      const name = node.name.toLowerCase();

      if (/floor|ground|ceiling|roof|пол|потол|ковер|ковёр/.test(name)) {
        return;
      }

      const box = new THREE.Box3().setFromObject(node);
      const s = box.getSize(new THREE.Vector3());

      if (box.max.y < 0.35 || box.min.y > 2.1) return;
      if (s.y < 0.3) return;

      const wall =
        /wall|partition|pillar|стен|колон|перегород/.test(name);

      const furniture =
        /desk|table|chair|sofa|cabinet|shelf|plant|locker|стол|стул|диван|шкаф|полк|растен/.test(name);

      const smallObject =
        s.x < 4 && s.z < 4 &&
        box.min.y < 1.5 && box.max.y > 0.4;

      if (
        !wall &&
        !furniture &&
        !smallObject &&
        node.userData.collision !== true
      ) return;

      this.obstacles.push({
        minX: box.min.x,
        maxX: box.max.x,
        minZ: box.min.z,
        maxZ: box.max.z,
        name: node.name
      });
    });
  }

  canStand(x, z, radius = this.radius) {
    const b = this.bounds;

    if (
      x - radius < b.minX ||
      x + radius > b.maxX ||
      z - radius < b.minZ ||
      z + radius > b.maxZ
    ) return false;

    for (const o of this.obstacles) {
      const px = Math.max(o.minX, Math.min(x, o.maxX));
      const pz = Math.max(o.minZ, Math.min(z, o.maxZ));

      const dx = x - px;
      const dz = z - pz;

      if (dx * dx + dz * dz < radius * radius) {
        return false;
      }
    }

    return true;
  }

  move(from, dx, dz) {
    const steps = Math.max(
      1,
      Math.ceil(Math.hypot(dx, dz) / 0.1)
    );

    let x = from.x;
    let z = from.z;

    for (let i = 0; i < steps; i++) {
      const sx = dx / steps;
      const sz = dz / steps;

      if (this.canStand(x + sx, z + sz)) {
        x += sx;
        z += sz;
      } else {
        if (this.canStand(x + sx, z)) x += sx;
        if (this.canStand(x, z + sz)) z += sz;
      }
    }

    return new THREE.Vector3(x, 0, z);
  }

  nearestFree(x, z) {
    if (this.canStand(x, z)) {
      return new THREE.Vector3(x, 0, z);
    }

    for (let r = 0.25; r <= 8; r += 0.25) {
      for (let i = 0; i < 32; i++) {
        const angle = i * Math.PI / 16;
        const px = x + Math.cos(angle) * r;
        const pz = z + Math.sin(angle) * r;

        if (this.canStand(px, pz)) {
          return new THREE.Vector3(px, 0, pz);
        }
      }
    }

    return null;
  }

  path(start, target) {
    const finish = this.nearestFree(target.x, target.z);
    if (!finish) return null;

    const b = this.bounds;
    const cell = this.cell;

    const cols = Math.ceil((b.maxX - b.minX) / cell) + 1;
    const rows = Math.ceil((b.maxZ - b.minZ) / cell) + 1;

    if (cols * rows > 80000) return null;

    const grid = (x, z) => [
      Math.max(0, Math.min(cols - 1,
        Math.round((x - b.minX) / cell))),
      Math.max(0, Math.min(rows - 1,
        Math.round((z - b.minZ) / cell)))
    ];

    const world = (i, j) => new THREE.Vector3(
      b.minX + i * cell,
      0,
      b.minZ + j * cell
    );

    const [si, sj] = grid(start.x, start.z);
    const [ei, ej] = grid(finish.x, finish.z);

    const key = (i, j) => `${i},${j}`;
    const startKey = key(si, sj);
    const endKey = key(ei, ej);

    const open = [{ i: si, j: sj, f: 0 }];
    const came = new Map();
    const scores = new Map([[startKey, 0]]);
    const closed = new Set();

    const dirs = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1]
    ];

    let found = false;
    let iterations = 0;

    while (open.length && iterations++ < 30000) {
      open.sort((a, b) => a.f - b.f);

      const current = open.shift();
      const ck = key(current.i, current.j);

      if (closed.has(ck)) continue;

      if (ck === endKey) {
        found = true;
        break;
      }

      closed.add(ck);

      for (const [di, dj] of dirs) {
        const i = current.i + di;
        const j = current.j + dj;

        if (
          i < 0 || j < 0 ||
          i >= cols || j >= rows
        ) continue;

        const next = world(i, j);
        const nk = key(i, j);

        if (closed.has(nk)) continue;
        if (!this.canStand(next.x, next.z)) continue;

        if (di !== 0 && dj !== 0) {
          const sideA = world(current.i + di, current.j);
          const sideB = world(current.i, current.j + dj);

          if (
            !this.canStand(sideA.x, sideA.z) ||
            !this.canStand(sideB.x, sideB.z)
          ) continue;
        }

        const cost =
          scores.get(ck) + Math.hypot(di, dj);

        if (cost < (scores.get(nk) ?? Infinity)) {
          came.set(nk, ck);
          scores.set(nk, cost);

          open.push({
            i, j,
            f: cost + Math.hypot(ei - i, ej - j)
          });
        }
      }
    }

    if (!found) return null;

    const points = [finish];
    let current = endKey;

    while (current !== startKey) {
      const [i, j] = current.split(",").map(Number);
      points.push(world(i, j));
      current = came.get(current);

      if (!current) return null;
    }

    points.reverse();

    // Убираем лишние точки, но оставляем
    // промежуточные точки обхода препятствий.
    const result = [];
    let index = 0;

    while (index < points.length) {
      let furthest = index + 1;

      for (let j = points.length - 1; j > index; j--) {
        if (this.lineClear(
          index === 0 ? start : points[index],
          points[j]
        )) {
          furthest = j;
          break;
        }
      }

      result.push(points[furthest] || finish);
      index = furthest;

      if (index >= points.length - 1) break;
    }

    return result;
  }

  lineClear(a, b) {
    const distance = a.distanceTo(b);
    const steps = Math.max(1, Math.ceil(distance / 0.1));

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;

      if (!this.canStand(x, z)) return false;
    }

    return true;
  }

  toggleDebug(scene) {
    if (this.debug) {
      scene.remove(this.debug);
      this.debug = null;
      return false;
    }

    const group = new THREE.Group();

    const material = new THREE.MeshBasicMaterial({
      color: 0xffa43d,
      transparent: true,
      opacity: 0.28,
      depthWrite: false
    });

    for (const o of this.obstacles) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(
          Math.max(0.02, o.maxX - o.minX),
          0.1,
          Math.max(0.02, o.maxZ - o.minZ)
        ),
        material
      );

      mesh.position.set(
        (o.minX + o.maxX) / 2,
        0.12,
        (o.minZ + o.maxZ) / 2
      );

      group.add(mesh);
    }

    scene.add(group);
    this.debug = group;
    return true;
  }
}



export { OfficeNavigation };
