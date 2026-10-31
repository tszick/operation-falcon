import { Vec3, Quat, DEG } from './math.js';
import { groundMesh } from './groundModels.js';
let deck, markings;
const origin = new Vec3(),
  identity = new Quat();
export function carrierDeckMeshes() {
  if (!deck) {
    deck = {
      points: [
        [-34, 20.18, -157],
        [34, 20.18, -157],
        [34, 20.18, 150],
        [-34, 20.18, 150],
      ].map((p) => new Vec3(...p)),
      faces: [[0, 1, 2, 3]],
      details: [],
      radius: 165,
    };
    const points = [],
      details = [],
      line = (a, b) => {
        details.push([points.length, points.length + 1]);
        points.push(new Vec3(...a), new Vec3(...b));
      },
      q = Quat.euler(-8 * DEG, 0, 0),
      p = (x, z) => q.rotate(new Vec3(x, 0, z)).add(new Vec3(-7, 20.4, -10));
    for (const x of [-13, 13]) line(Object.values(p(x, -140)), Object.values(p(x, 135)));
    for (let z = -140; z < 130; z += 20) line(Object.values(p(0, z)), Object.values(p(0, z + 10)));
    for (const z of [-90, -78, -66, -54]) line(Object.values(p(-13, z)), Object.values(p(13, z)));
    line([-7, 20.4, -115], [-7, 20.4, 40]);
    markings = { points, details, faces: [], radius: 170 };
  }
  return { deck, markings };
}
export function renderCarrier(r, position = origin, orientation = identity) {
  const { deck, markings } = carrierDeckMeshes();
  r.mesh(groundMesh('carrier'), position, orientation, 1, '#aeb7b8', null, 'concrete');
  r.mesh(deck, position, orientation, 1, '#d2d5c2', null, 'asphalt');
  r.mesh(markings, position, orientation, 1, '#e4e2cd', null, 'runway');
}
