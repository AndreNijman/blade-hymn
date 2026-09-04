// Asset loading for the web port of Eason-F/Blade-Hymn.
//
// Mirrors utility.import_subfolders: every animation folder's frames are
// sorted numerically (1.png, 2.png, ...) exactly like the original, using the
// manifest generated from the same directory walk.

import manifestJson from "./asset-manifest.json" with { type: "json" };

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("failed to load " + url));
    img.src = url;
  });
}

export async function loadAssets() {
  const folders = {};
  const jobs = [];
  for (const [folder, files] of Object.entries(manifestJson.folders)) {
    jobs.push(
      Promise.all(files.map(loadImage)).then((frames) => {
        folders[folder] = frames;
      })
    );
  }
  await Promise.all(jobs);

  return { folders };
}

// Resolves "assets/graphics/player/idle" style keys directly.
export function framesFor(assets, ...parts) {
  return assets.folders[parts.join("/")];
}

export { manifestJson };
