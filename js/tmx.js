// Minimal TMX parser for the web port of Eason-F/Blade-Hymn.
//
// Provides the small slice of pytmx the game uses: get_layer_by_name(...).tiles()
// for CSV tile layers (yielding [x, y, image]) and object layers with x, y,
// name and custom properties. Tilesets are the external .tsx files referenced
// by the maps; their image paths resolve to the hosted asset tree.

const TILESET_CACHE = new Map();

async function loadTileset(source, baseDir) {
  const path = normalize(baseDir + "/" + source);
  if (TILESET_CACHE.has(path)) return TILESET_CACHE.get(path);
  const promise = (async () => {
    const res = await fetch(path);
    const text = await res.text();
    const xml = new DOMParser().parseFromString(text, "text/xml");
    const tsx = xml.documentElement;
    const tileset = {
      firstgid: null, // filled by the caller per-map
      tileWidth: +tsx.getAttribute("tilewidth"),
      tileHeight: +tsx.getAttribute("tileheight"),
      columns: +(tsx.getAttribute("columns") || 0),
      image: null,
      tiles: new Map(), // tile id -> image (image-collection tilesets)
    };
    const imageEl = tsx.querySelector(":scope > image");
    if (imageEl) {
      tileset.image = await loadImage(normalize(resolveRelative(path, imageEl.getAttribute("source"))));
    }
    for (const tileEl of tsx.querySelectorAll("tile")) {
      const id = +tileEl.getAttribute("id");
      const img = tileEl.querySelector("image");
      if (img) {
        tileset.tiles.set(id, await loadImage(normalize(resolveRelative(path, img.getAttribute("source")))));
      }
    }
    return tileset;
  })();
  TILESET_CACHE.set(path, promise);
  return promise;
}

function loadImage(url) {
  const attempt = (path) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("failed to load " + path));
    img.src = path;
  });
  // Eason's repo was built on Windows, so a few TSX references carry
  // different casing (../../Assets/Graphics/...). Linux hosting is
  // case-sensitive; fall back to the all-lowercase path once.
  return attempt(normalize(url)).catch(() => attempt(normalize(url).toLowerCase()));
}

// Collapse ./ and ../ segments against a base file path.
function resolveRelative(baseFile, relative) {
  const base = baseFile.split("/").slice(0, -1);
  for (const part of relative.split("/")) {
    if (part === "." || part === "") continue;
    if (part === "..") base.pop();
    else base.push(part);
  }
  return base.join("/");
}

function normalize(path) {
  // The TMX files reference "../../Data/tsx/..." (Windows casing); the repo
  // and the web host use lowercase, so correct that when resolving.
  const parts = path.split("/").map((p) => (p === "Data" ? "data" : p));
  const out = [];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

export class TiledMap {
  constructor() {
    this.width = 0;
    this.height = 0;
    this.tilewidth = 16;
    this.tileheight = 16;
    this.layers = new Map(); // name -> layer
  }

  getLayer(name) {
    return this.layers.get(name);
  }
}

class TileLayer {
  constructor(map, el) {
    this.map = map;
    this.name = el.getAttribute("name");
    const csv = el.querySelector("data").textContent.trim();
    this.gids = csv.split(",").map((n) => parseInt(n, 10));
    this.width = +el.getAttribute("width");
    this.properties = readProperties(el);
  }

  // pytmx .tiles(): [x, y, image] for every non-empty cell, row-major.
  *tiles() {
    const map = this.map;
    for (let i = 0; i < this.gids.length; i++) {
      const gid = this.gids[i];
      if (!gid) continue;
      const image = map.imageForGid(gid);
      if (!image) continue;
      yield [i % this.width, Math.floor(i / this.width), image];
    }
  }
}

class ObjectLayer {
  constructor(el) {
    this.name = el.getAttribute("name");
    this.properties = readProperties(el);
    this.objects = [];
    for (const objEl of el.querySelectorAll("object")) {
      const properties = readProperties(objEl);
      let y = +objEl.getAttribute("y");
      // Tiled anchors tile objects (gid) by their bottom edge; pytmx reports
      // the top-left position by subtracting the object height, and the game
      // places sprites from the top-left.
      if (objEl.hasAttribute("gid")) {
        y -= +objEl.getAttribute("height");
      }
      this.objects.push({
        name: objEl.getAttribute("name"),
        type: objEl.getAttribute("type") || "",
        // what pytmx would report
        x: +objEl.getAttribute("x"),
        y,
        properties,
        get context() { return properties.context; },
        get tag() { return properties.tag; },
        get hp() { return properties.hp; },
      });
    }
  }
}

function readProperties(el) {
  const props = {};
  for (const p of el.querySelectorAll(":scope > properties > property")) {
    const value = p.getAttribute("value");
    props[p.getAttribute("name")] = p.getAttribute("type") === "int" ? parseInt(value, 10) : value;
  }
  return props;
}

export async function loadTmx(path) {
  const res = await fetch(path);
  const text = await res.text();
  const xml = new DOMParser().parseFromString(text, "text/xml");
  const root = xml.documentElement;

  const map = new TiledMap();
  map.width = +root.getAttribute("width");
  map.height = +root.getAttribute("height");
  map.tilewidth = +root.getAttribute("tilewidth");
  map.tileheight = +root.getAttribute("tileheight");

  // tilesets: firstgid from the map, definition from the external .tsx
  const tilesets = [];
  for (const tsEl of root.querySelectorAll("tileset")) {
    const firstgid = +tsEl.getAttribute("firstgid");
    const source = tsEl.getAttribute("source");
    if (source) {
      const tileset = await loadTileset(source, path.split("/").slice(0, -1).join("/"));
      tilesets.push({ firstgid, tileset: { ...tileset } });
    }
  }
  tilesets.sort((a, b) => a.firstgid - b.firstgid);

  // gid -> image, highest firstgid <= gid wins. Tiled packs flip/rotate bits
  // into the high bits of the gid; pytmx applies them to the tile image
  // (util_pygame: diagonal = rotate 270 then flip horizontally, then H/V).
  map.imageForGid = (rawGid) => {
    const flipped_h = rawGid & 0x80000000;
    const flipped_v = rawGid & 0x40000000;
    const flipped_d = rawGid & 0x20000000;
    const gid = rawGid & 0x1FFFFFFF;
    for (let i = tilesets.length - 1; i >= 0; i--) {
      const { firstgid, tileset } = tilesets[i];
      if (gid >= firstgid) {
        const localId = gid - firstgid;
        let image;
        if (tileset.image) {
          // single-sheet tileset: slice by grid position
          image = sheetTile(tileset, localId);
        } else {
          image = tileset.tiles.get(localId) || null;
        }
        if (!image) return null;
        return orientTile(image, flipped_h, flipped_v, flipped_d);
      }
    }
    return null;
  };

  for (const layerEl of root.querySelectorAll(":scope > layer, :scope > objectgroup")) {
    const tag = layerEl.tagName.toLowerCase();
    if (tag === "layer") {
      map.layers.set(layerEl.getAttribute("name"), new TileLayer(map, layerEl));
    } else {
      map.layers.set(layerEl.getAttribute("name"), new ObjectLayer(layerEl));
    }
  }
  return map;
}

// Cache the sliced tiles of sheet tilesets so each gid yields one Image.
const sheetCache = new WeakMap();
function sheetTile(tileset, localId) {
  if (!tileset.image) return null;
  let cache = sheetCache.get(tileset.image);
  if (!cache) {
    cache = new Map();
    sheetCache.set(tileset.image, cache);
  }
  if (cache.has(localId)) return cache.get(localId);
  const columns = tileset.columns || Math.floor(tileset.image.width / tileset.tileWidth);
  const sx = (localId % columns) * tileset.tileWidth;
  const sy = Math.floor(localId / columns) * tileset.tileHeight;
  const c = document.createElement("canvas");
  c.width = tileset.tileWidth;
  c.height = tileset.tileHeight;
  const ctx = c.getContext("2d");
  ctx.drawImage(tileset.image, sx, sy, tileset.tileWidth, tileset.tileHeight, 0, 0, tileset.tileWidth, tileset.tileHeight);
  cache.set(localId, c);
  return c;
}

// pygame.transform.rotate(270) + pygame.transform.flip equivalents, cached.
const orientCache = new Map();
function orientTile(image, h, v, d) {
  const key = image;
  let cache = orientCache.get(key);
  if (!cache) {
    cache = new Map();
    orientCache.set(key, cache);
  }
  const sig = `${h ? 1 : 0}${v ? 1 : 0}${d ? 1 : 0}`;
  if (cache.has(sig)) return cache.get(sig);
  let out = image;
  if (d) out = flipImage(rotate270(out), true, false); // pytmx util_pygame order
  if (h || v) out = flipImage(out, Boolean(h), Boolean(v));
  cache.set(sig, out);
  return out;
}

function transformImage(image, w, h, fn) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  fn(c.getContext("2d"));
  return c;
}

function rotate270(image) {
  // pygame.transform.rotate(image, 270): 270° counterclockwise = 90° clockwise
  return transformImage(image, image.height, image.width, (ctx) => {
    ctx.translate(image.height, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(image, 0, 0);
  });
}

function flipImage(image, horizontally, vertically) {
  return transformImage(image, image.width, image.height, (ctx) => {
    ctx.translate(horizontally ? image.width : 0, vertically ? image.height : 0);
    ctx.scale(horizontally ? -1 : 1, vertically ? -1 : 1);
    ctx.drawImage(image, 0, 0);
  });
}
