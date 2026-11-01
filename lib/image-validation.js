const extensions = Object.freeze({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" });

export async function validateImageFile(file, maxBytes) {
  const extension = extensions[file.type];
  if (!extension || file.size === 0 || file.size > maxBytes) {
    throw new Error(`Choose a JPEG, PNG, or WebP photo up to ${Math.floor(maxBytes / (1024 * 1024))} MB.`);
  }
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const matches = extension === "jpg"
    ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : extension === "png"
      ? [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
      : String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
        && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!matches) throw new Error("This file is not a supported photo.");
  return extension;
}
