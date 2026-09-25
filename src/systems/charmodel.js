// Detailed hand-drawn-style character model: jointed limbs, expressive blinking eyes,
// layered hair, explorer clothing and ink outlines (inverted-hull) for an anime look.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toon, glowMat } from '../world/kit.js';
import { clamp } from '../core/noise.js';

const INK = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: { color: { value: new THREE.Color('#2b1d19') }, thickness: { value: 0.011 } },
  vertexShader: /* glsl */ `uniform float thickness;
    void main(){ vec3 p = position + normalize(normal) * thickness; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
  fragmentShader: /* glsl */ `uniform vec3 color; void main(){ gl_FragColor = vec4(color, 1.0); }`,
});
INK.userData.shared = true;

const shade = (c, k) => new THREE.Color(c).multiplyScalar(k);

export function buildCharacter(opts = {}) {
  const {
    gender = 'female', top = '#5d93c9', bottom = gender === 'female' ? '#f4efe4' : '#3d4358',
    skin = '#f3cfae', hair = '#2a1b17', shoes = '#6b4a33', hat = false, beard = false, apron = null,
    backpack = false, child = false, elder = false, scarf = null, robe = null, eyesClosed = false,
    lite = false, eyeColor = '#3a2418',
  } = opts;
  const explorer = backpack;
  const outline = !lite;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const P = {};
  const mats = {};
  const mat = (c) => (mats[c] ||= toon(c));
  const skinM = mat(skin);
  const hairM = mat(elder ? '#d9d4ca' : hair);
  const hairDark = mat('#' + shade(elder ? '#d9d4ca' : hair, 0.7).getHexString());

  /** Add a mesh with optional ink outline. */
  const add = (parent, geo, m, x = 0, y = 0, z = 0, ink = outline) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    if (ink) {
      const o = new THREE.Mesh(geo, INK);
      o.castShadow = false;
      o.raycast = () => {};
      mesh.add(o);
    }
    parent.add(mesh);
    return mesh;
  };
  const sph = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
  const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 6, 12);

  const hipY = 0.84;
  // trousers: a light "skirt" colour becomes practical dark cloth on the male explorer
  const pants = gender === 'male' && new THREE.Color(bottom).getHSL({}).l > 0.6 ? '#4a4038' : bottom;
  const legCol = gender === 'female' && !robe ? '#4a3f4a' : pants;
  const bootCol = explorer ? '#6b4a33' : shoes;

  // ------------------------------------------------------------- legs (hip → knee → boot)
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.095, hipY, 0);
    add(hip, cap(0.072, 0.26), mat(legCol), 0, -0.2, 0);
    const knee = new THREE.Group();
    knee.position.y = -0.4;
    hip.add(knee);
    add(knee, cap(0.06, 0.22), mat(legCol), 0, -0.15, 0);
    // boot
    const boot = add(knee, new THREE.CylinderGeometry(0.075, 0.07, 0.18, 14), mat(bootCol), 0, -0.3, 0);
    boot.castShadow = true;
    const toe = add(knee, sph(0.075), mat(bootCol), 0, -0.37, 0.06);
    toe.scale.set(1, 0.7, 1.35);
    add(knee, new THREE.BoxGeometry(0.15, 0.03, 0.26), mat('#2e2320'), 0, -0.405, 0.035, false);
    if (explorer) add(knee, new THREE.TorusGeometry(0.075, 0.018, 6, 16), mat('#8a6444'), 0, -0.21, 0, false).rotation.x = Math.PI / 2;
    body.add(hip);
    P[side < 0 ? 'legL' : 'legR'] = hip;
    P[side < 0 ? 'kneeL' : 'kneeR'] = knee;
  }

  // ------------------------------------------------------------- torso (lathed, with waist)
  const torsoG = new THREE.Group();
  torsoG.position.y = hipY;
  body.add(torsoG);
  P.torso = torsoG;
  const prof = gender === 'female'
    ? [[0.001, -0.02], [0.19, -0.02], [0.185, 0.08], [0.16, 0.2], [0.185, 0.34], [0.2, 0.46], [0.17, 0.56], [0.09, 0.61], [0.001, 0.62]]
    : [[0.001, -0.02], [0.2, -0.02], [0.2, 0.1], [0.195, 0.22], [0.215, 0.38], [0.23, 0.5], [0.19, 0.58], [0.09, 0.62], [0.001, 0.63]];
  const torsoGeo = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 20);
  const chest = add(torsoG, torsoGeo, mat(top));
  chest.scale.set(1, 1, 0.82);
  P.chest = chest;

  if (explorer) {
    // open jacket front, collar, buttons, rolled sleeves feel
    const accent = '#' + shade(top, 0.72).getHexString();
    const placket = add(torsoG, new THREE.BoxGeometry(0.035, 0.46, 0.02), mat(accent), 0, 0.3, 0.165, false);
    placket.rotation.x = -0.06;
    for (let i = 0; i < 3; i++) add(torsoG, sph(0.012, 8, 6), mat('#e8d7a8'), 0.03, 0.18 + i * 0.12, 0.172, false);
    for (const side of [-1, 1]) {
      const lap = add(torsoG, new THREE.BoxGeometry(0.1, 0.14, 0.02), mat(accent), side * 0.07, 0.52, 0.14);
      lap.rotation.set(-0.35, 0, side * 0.5);
      const pocket = add(torsoG, new THREE.BoxGeometry(0.08, 0.07, 0.015), mat(accent), side * 0.1, 0.36, 0.16, false);
      pocket.rotation.x = -0.1;
    }
  }
  const collar = add(torsoG, new THREE.CylinderGeometry(0.1, 0.13, 0.07, 16, 1, true), mat(explorer ? '#f5efe4' : top), 0, 0.6, 0);
  collar.material.side = THREE.DoubleSide;

  // lower garment
  if (robe) {
    const r = add(torsoG, new THREE.CylinderGeometry(0.21, 0.44, 0.92, 22, 1, true), mat(robe), 0, -0.4, 0);
    r.material.side = THREE.DoubleSide;
    add(torsoG, new THREE.TorusGeometry(0.44, 0.02, 6, 30), mat('#' + shade(robe, 0.7).getHexString()), 0, -0.84, 0, false).rotation.x = Math.PI / 2;
    P.skirt = r;
  } else if (gender === 'female') {
    const skirt = add(torsoG, new THREE.CylinderGeometry(0.2, 0.38, 0.6, 22, 3, true), mat(bottom), 0, -0.27, 0);
    skirt.material.side = THREE.DoubleSide;
    // soft folds
    const sp = skirt.geometry.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const x = sp.getX(i), z = sp.getZ(i), y = sp.getY(i);
      const a = Math.atan2(z, x), k = 1 + Math.sin(a * 9) * 0.04 * (0.3 - y) * 2;
      sp.setXYZ(i, x * k, y, z * k);
    }
    skirt.geometry.computeVertexNormals();
    add(torsoG, new THREE.TorusGeometry(0.38, 0.018, 6, 36), mat(scarf || '#f2703c'), 0, -0.565, 0, false).rotation.x = Math.PI / 2;
    P.skirt = skirt;
  } else {
    add(torsoG, new THREE.CylinderGeometry(0.2, 0.215, 0.14, 18), mat(pants), 0, -0.02, 0);
  }
  if (explorer || !robe) {
    add(torsoG, new THREE.CylinderGeometry(0.195, 0.195, 0.05, 20), mat('#4a3426'), 0, 0.05, 0, false);
    add(torsoG, new THREE.BoxGeometry(0.06, 0.05, 0.02), mat('#e0c070'), 0, 0.05, 0.19, false);
    if (explorer) {
      const pouch = add(torsoG, new RoundedBoxGeometry(0.1, 0.1, 0.06, 2, 0.02), mat('#7a5a3e'), 0.17, 0.0, 0.08);
      pouch.rotation.y = 0.9;
    }
  }
  if (apron) add(torsoG, new THREE.BoxGeometry(0.3, 0.62, 0.02), mat(apron), 0, 0.1, 0.18);

  // scarf (sways)
  const scarfCol = scarf || (explorer ? '#f2703c' : null);
  if (scarfCol) {
    add(torsoG, new THREE.TorusGeometry(0.11, 0.045, 8, 18), mat(scarfCol), 0, 0.6, 0).rotation.x = Math.PI / 2;
    const tail = new THREE.Group();
    tail.position.set(0.08, 0.58, -0.1);
    add(tail, new RoundedBoxGeometry(0.07, 0.24, 0.025, 2, 0.01), mat(scarfCol), 0, -0.11, 0);
    torsoG.add(tail);
    P.scarf = tail;
  }

  // ------------------------------------------------------------- backpack
  if (backpack) {
    const bp = add(torsoG, new RoundedBoxGeometry(0.32, 0.36, 0.17, 3, 0.05), mat('#7a5e44'), 0, 0.33, -0.25);
    bp.castShadow = true;
    add(torsoG, new RoundedBoxGeometry(0.26, 0.12, 0.06, 2, 0.02), mat('#8a6a4c'), 0, 0.24, -0.34);
    const roll = add(torsoG, new THREE.CylinderGeometry(0.065, 0.065, 0.36, 12), mat('#a9203e'), 0, 0.55, -0.25);
    roll.rotation.z = Math.PI / 2;
    add(torsoG, new THREE.BoxGeometry(0.2, 0.035, 0.02), glowMat('#f2703c', 2.2), 0, 0.4, -0.337, false);
    const tank = add(torsoG, new THREE.CylinderGeometry(0.045, 0.045, 0.3, 12), mat('#dcd6c8'), 0.2, 0.33, -0.25);
    add(tank, new THREE.CylinderGeometry(0.02, 0.02, 0.05, 8), mat('#8a8f98'), 0, 0.17, 0, false);
    for (const side of [-1, 1]) {
      const strap = add(torsoG, new THREE.BoxGeometry(0.04, 0.42, 0.02), mat('#5a4230'), side * 0.1, 0.36, 0.16, false);
      strap.rotation.set(-0.12, 0, side * -0.05);
    }
  }

  // ------------------------------------------------------------- arms (shoulder → elbow → hand)
  const sleeve = mat(top);
  for (const side of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(side * 0.235, 0.52, 0);
    add(sh, sph(0.07), sleeve, 0, 0, 0, false);
    add(sh, cap(0.056, 0.17), sleeve, 0, -0.13, 0);
    const elbow = new THREE.Group();
    elbow.position.y = -0.27;
    sh.add(elbow);
    add(elbow, cap(0.05, 0.15), robe && !explorer ? mat(top) : sleeve, 0, -0.1, 0);
    add(elbow, new THREE.TorusGeometry(0.05, 0.016, 6, 14), mat(explorer ? '#f5efe4' : '#' + shade(top, 0.75).getHexString()), 0, -0.19, 0, false).rotation.x = Math.PI / 2;
    const hand = add(elbow, sph(0.052), skinM, 0, -0.25, 0.005);
    hand.scale.set(0.85, 1.1, 0.75);
    add(elbow, sph(0.022, 8, 6), skinM, side * -0.035, -0.235, 0.03, false);
    sh.rotation.z = side * 0.14;
    elbow.rotation.x = -0.15;
    torsoG.add(sh);
    P[side < 0 ? 'armL' : 'armR'] = sh;
    P[side < 0 ? 'elbowL' : 'elbowR'] = elbow;
  }

  // ------------------------------------------------------------- head
  const head = new THREE.Group();
  head.position.y = 0.64;
  torsoG.add(head);
  P.head = head;
  add(head, new THREE.CylinderGeometry(0.055, 0.065, 0.1, 12), skinM, 0, -0.01, 0, false);
  const skull = add(head, sph(0.2, 28, 22), skinM, 0, 0.16, 0);
  skull.scale.set(1, 1.02, 0.97);
  const jaw = add(head, sph(0.165, 22, 16), skinM, 0, 0.095, 0.03, false);
  jaw.scale.set(1, 0.9, 0.95);
  for (const side of [-1, 1]) {
    const ear = add(head, sph(0.04, 10, 8), skinM, side * 0.198, 0.14, -0.01);
    ear.scale.set(0.5, 1, 0.8);
  }
  // face
  const eyes = new THREE.Group();
  head.add(eyes);
  const white = new THREE.MeshBasicMaterial({ color: '#fbf7f0' });
  const iris = new THREE.MeshBasicMaterial({ color: eyeColor });
  const pupil = new THREE.MeshBasicMaterial({ color: '#120b08' });
  const shine = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const lid = toon('#' + shade(skin, 0.9).getHexString());
  const browM = mat(elder ? '#b8b2a8' : hair);
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(side * 0.072, 0.152, 0.172);
    eye.rotation.y = side * 0.3;
    if (eyesClosed) {
      const line = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 12, Math.PI), pupil);
      line.rotation.z = Math.PI;
      line.position.z = 0.012;
      eye.add(line);
    } else {
      const sc = new THREE.Mesh(sph(0.036, 14, 10), white);
      sc.scale.set(0.95, 1.2, 0.45);
      eye.add(sc);
      const ir = new THREE.Mesh(sph(0.026, 14, 10), iris);
      ir.scale.set(0.95, 1.2, 0.4);
      ir.position.set(0, -0.004, 0.011);
      eye.add(ir);
      const pu = new THREE.Mesh(sph(0.014, 10, 8), pupil);
      pu.scale.set(1, 1.2, 0.4);
      pu.position.set(0, -0.004, 0.018);
      eye.add(pu);
      const hi = new THREE.Mesh(sph(0.007, 8, 6), shine);
      hi.position.set(side * 0.006 + 0.008, 0.012, 0.022);
      eye.add(hi);
      // upper lid line
      const ul = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.0065, 6, 14, Math.PI * 0.9), pupil);
      ul.position.set(0, 0.003, 0.012);
      ul.rotation.z = Math.PI * 0.05;
      ul.scale.set(1, 1.25, 1);
      eye.add(ul);
    }
    eyes.add(eye);
    const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.045, 3, 6), browM);
    brow.position.set(side * 0.074, 0.212, 0.172);
    brow.rotation.set(0, side * 0.3, Math.PI / 2 + side * (eyesClosed ? 0.25 : 0.12));
    head.add(brow);
    const blush = new THREE.Mesh(new THREE.CircleGeometry(0.03, 14), new THREE.MeshBasicMaterial({ color: '#f09a86', transparent: true, opacity: 0.45, depthWrite: false }));
    blush.position.set(side * 0.112, 0.095, 0.162);
    blush.rotation.y = side * 0.55;
    head.add(blush);
    if (!eyesClosed) P[side < 0 ? 'eyeL' : 'eyeR'] = eye;
  }
  P.eyes = eyes;
  const nose = new THREE.Mesh(sph(0.016, 8, 6), lid);
  nose.scale.set(0.8, 1, 0.9);
  nose.position.set(0, 0.11, 0.198);
  head.add(nose);
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 5, 12, Math.PI), new THREE.MeshBasicMaterial({ color: '#8a3a32' }));
  mouth.position.set(0, 0.065, 0.186);
  mouth.rotation.z = Math.PI;
  mouth.scale.set(1, eyesClosed ? 0.3 : 0.6, 1);
  head.add(mouth);
  P.mouth = mouth;

  // hair
  const hcap = add(head, new THREE.SphereGeometry(0.212, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM, 0, 0.175, -0.012);
  hcap.rotation.x = -0.34;
  const back = add(head, sph(0.207, 24, 18), hairM, 0, 0.15, -0.055);
  back.scale.set(1.03, gender === 'female' ? 1.06 : 0.92, 0.9);
  // fringe: a shell over the forehead with a scalloped, hand-cut lower edge
  const fr = new THREE.SphereGeometry(0.218, 32, 10, Math.PI * 0.05, Math.PI * 0.9, Math.PI * 0.12, Math.PI * (gender === 'female' ? 0.3 : 0.24));
  const fp = fr.attributes.position;
  const tmp = new THREE.Vector3();
  for (let i = 0; i < fp.count; i++) {
    tmp.fromBufferAttribute(fp, i);
    const phi = Math.atan2(tmp.x, tmp.z);
    const lower = THREE.MathUtils.clamp((0.13 - tmp.y) / 0.12, 0, 1);
    tmp.y += Math.abs(Math.sin(phi * (gender === 'female' ? 5.5 : 7))) * 0.035 * lower + (Math.abs(phi) < 0.35 ? 0.012 * lower : 0);
    tmp.multiplyScalar(1 + lower * 0.04);
    fp.setXYZ(i, tmp.x, tmp.y, tmp.z);
  }
  fr.computeVertexNormals();
  const fringe = add(head, fr, hairM, 0, 0.168, 0.0);
  fringe.material.side = THREE.DoubleSide;
  fringe.rotation.x = -0.08;
  if (gender === 'female') {
    for (const side of [-1, 1]) {
      const lock = add(head, cap(0.035, 0.2), hairM, side * 0.175, 0.04, 0.05);
      lock.rotation.z = side * 0.12;
      const lock2 = add(head, cap(0.03, 0.16), hairDark, side * 0.16, 0.03, -0.06, false);
      lock2.rotation.z = side * 0.18;
    }
    const bun = add(head, sph(0.09, 16, 12), hairM, 0, 0.29, -0.17);
    bun.scale.set(1, 0.9, 1);
    add(head, new THREE.TorusGeometry(0.06, 0.016, 6, 16), mat(scarfCol || '#a9203e'), 0, 0.25, -0.13, false).rotation.x = 0.9;
  } else {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 1.4 - Math.PI * 0.2;
      const tuft = add(head, new THREE.ConeGeometry(0.06, 0.16, 8), i % 2 ? hairDark : hairM, Math.cos(a) * 0.14, 0.3, -Math.sin(a) * 0.12 - 0.04, false);
      tuft.rotation.set(-0.5 - Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.7);
    }
  }
  if (explorer) {
    // goggles pushed up on the hair
    const band = add(head, new THREE.TorusGeometry(0.212, 0.013, 6, 30), mat('#4a3426'), 0, 0.28, -0.02, false);
    band.rotation.x = Math.PI / 2 - 0.35;
    for (const side of [-1, 1]) {
      const rim = add(head, new THREE.CylinderGeometry(0.042, 0.042, 0.035, 16), mat('#c9a860'), side * 0.06, 0.345, 0.15);
      rim.rotation.x = Math.PI / 2 - 0.9;
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.033, 16), glowMat('#8fd0ff', 0.9));
      lens.position.set(side * 0.06, 0.358, 0.165);
      lens.rotation.x = -0.9;
      head.add(lens);
    }
  }
  if (beard) {
    const b = add(head, sph(0.13, 16, 12), mat(elder ? '#ece8df' : '#6d5a4a'), 0, 0.04, 0.1);
    b.scale.set(1, 0.9, 0.7);
    const mst = add(head, cap(0.02, 0.08), mat(elder ? '#ece8df' : '#5d4a3a'), 0, 0.085, 0.19, false);
    mst.rotation.z = Math.PI / 2;
    mouth.visible = false;
  }
  if (hat) {
    const straw = mat(hat === true ? '#e6c77a' : hat);
    add(head, new THREE.CylinderGeometry(0.42, 0.44, 0.025, 30), straw, 0, 0.31, 0);
    add(head, new THREE.CylinderGeometry(0.17, 0.21, 0.17, 22), straw, 0, 0.4, 0);
    add(head, new THREE.CylinderGeometry(0.212, 0.212, 0.045, 22), mat('#a9203e'), 0, 0.335, 0, false);
  }

  const scale = child ? 0.66 : elder ? 0.95 : 1;
  root.scale.setScalar(scale);
  head.scale.setScalar(child ? 1.3 : 1.1);
  if (elder) torsoG.rotation.x = 0.1;

  // carried basket (hidden by default)
  const basket = new THREE.Group();
  const bk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.18, 14, 1, true), toon('#a67c4e', { side: THREE.DoubleSide }));
  basket.add(bk);
  const contents = [];
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Mesh(sph(0.075, 10, 8), toon('#f28a3c'));
    c.position.set(Math.cos(i) * 0.1, 0.06 + (i % 2) * 0.04, Math.sin(i) * 0.1);
    c.visible = false;
    basket.add(c);
    contents.push(c);
  }
  basket.position.set(0, 0.2, 0.32);
  basket.visible = false;
  torsoG.add(basket);

  let phase = 0, blinkT = 1 + Math.random() * 3;
  const swingK = gender === 'female' && !robe ? 0.5 : 0.62;
  const api = {
    group: root,
    parts: P,
    setCarry(n, color) {
      basket.visible = n > 0;
      contents.forEach((c, i) => {
        c.visible = i < n;
        if (color) c.material.color.set(color);
      });
    },
    animate(dt, speed, t) {
      const k = clamp(speed / 3, 0, 2.1);
      const carrying = basket.visible;
      P.armL.rotation.z = -0.14; P.armR.rotation.z = 0.14;
      if (k > 0.05) {
        phase += dt * (4 + speed * 1.6);
        const sw = Math.sin(phase);
        const amp = swingK * Math.min(k, 1.25);
        P.legL.rotation.x = sw * amp;
        P.legR.rotation.x = -sw * amp;
        P.kneeL.rotation.x = Math.max(0, Math.sin(phase + 1.2)) * 0.9 * Math.min(k, 1.3);
        P.kneeR.rotation.x = Math.max(0, -Math.sin(phase + 1.2)) * 0.9 * Math.min(k, 1.3);
        P.armL.rotation.x = carrying ? -0.9 : -sw * 0.55 * Math.min(k, 1.2);
        P.armR.rotation.x = carrying ? -0.9 : sw * 0.55 * Math.min(k, 1.2);
        P.elbowL.rotation.x = carrying ? -0.7 : -0.25 - Math.max(0, sw) * 0.5 * Math.min(k, 1.2);
        P.elbowR.rotation.x = carrying ? -0.7 : -0.25 - Math.max(0, -sw) * 0.5 * Math.min(k, 1.2);
        body.position.y = Math.abs(Math.cos(phase)) * 0.045 * Math.min(k, 1.3);
        torsoG.rotation.x = (elder ? 0.1 : 0) + 0.06 * Math.min(k, 1.5);
        torsoG.rotation.y = sw * 0.06 * Math.min(k, 1);
        if (P.skirt) P.skirt.rotation.z = sw * 0.035;
        if (P.scarf) P.scarf.rotation.x = 0.3 + k * 0.35 + Math.sin(t * 9) * 0.1 * k;
      } else {
        const damp = Math.min(1, dt * 8);
        for (const n of ['legL', 'legR', 'kneeL', 'kneeR']) P[n].rotation.x *= 1 - damp;
        P.armL.rotation.x = carrying ? -0.9 : P.armL.rotation.x * (1 - damp) + Math.sin(t * 1.5) * 0.01;
        P.armR.rotation.x = carrying ? -0.9 : P.armR.rotation.x * (1 - damp) - Math.sin(t * 1.5) * 0.01;
        P.elbowL.rotation.x += ((carrying ? -0.7 : -0.15) - P.elbowL.rotation.x) * damp;
        P.elbowR.rotation.x += ((carrying ? -0.7 : -0.15) - P.elbowR.rotation.x) * damp;
        body.position.y *= 1 - damp;
        P.chest.scale.y = 1 + Math.sin(t * 2.1) * 0.012;
        torsoG.rotation.x = elder ? 0.1 : 0;
        torsoG.rotation.y *= 1 - damp;
        if (P.scarf) P.scarf.rotation.x = 0.1 + Math.sin(t * 1.3) * 0.06;
      }
      // blink
      blinkT -= dt;
      const bl = blinkT < 0 ? (blinkT < -0.13 ? ((blinkT = 2 + Math.random() * 3.5), 1) : 0.12) : 1;
      if (P.eyeL) { P.eyeL.scale.y = bl; P.eyeR.scale.y = bl; }
    },
    /** Mid-air pose: knees tucked on the way up, legs reaching for the ground on the way down. */
    jumpPose(vy) {
      const up = clamp(vy / 6, -1, 1);
      const tuck = 0.5 + up * 0.4;
      P.legL.rotation.x = -0.7 * tuck; P.legR.rotation.x = -0.35 * tuck;
      P.kneeL.rotation.x = 1.3 * tuck; P.kneeR.rotation.x = 0.9 * tuck;
      P.armL.rotation.x = -1.3 * (0.4 + up * 0.4); P.armR.rotation.x = -1.3 * (0.4 + up * 0.4);
      P.armL.rotation.z = -0.5; P.armR.rotation.z = 0.5;
      body.position.y = 0;
    },
    /** Point the head toward a world position (for NPCs noticing the player). */
    lookAt(target, dt) {
      const local = root.worldToLocal(target.clone());
      const yaw = clamp(Math.atan2(local.x, local.z), -0.9, 0.9);
      head.rotation.y += (yaw - head.rotation.y) * Math.min(1, dt * 4);
    },
    /** Seated pose (dinner table). */
    sit() {
      P.legL.rotation.x = P.legR.rotation.x = -1.5;
      P.kneeL.rotation.x = P.kneeR.rotation.x = 1.5;
      P.armL.rotation.x = P.armR.rotation.x = -0.6;
      P.elbowL.rotation.x = P.elbowR.rotation.x = -0.9;
      api.animate = (dt, _s, t) => {
        blinkT -= dt;
        const bl = blinkT < 0 ? (blinkT < -0.13 ? ((blinkT = 2 + Math.random() * 3.5), 1) : 0.12) : 1;
        if (P.eyeL) { P.eyeL.scale.y = bl; P.eyeR.scale.y = bl; }
        P.chest.scale.y = 1 + Math.sin(t * 2.1) * 0.012;
      };
    },
  };
  return api;
}
