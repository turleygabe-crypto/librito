export const BOOK_PHOTO_BUCKET = "private-book-photos";
export const BOOK_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function checked(result) {
  if (result.error) throw result.error;
  return result.data;
}

export async function listBookPhotos(client, userId, bookId) {
  const bucket = client.storage.from(BOOK_PHOTO_BUCKET);
  const prefix = bookId ? `${userId}/${bookId}` : userId;
  const files = [];
  for (let offset = 0; ; offset += 100) {
    const page = checked(await bucket.list(prefix, {
      limit: 100, offset, sortBy: { column: "name", order: "asc" },
    }));
    files.push(...page.map((file) => ({ ...file, path: `${prefix}/${file.name}` })));
    if (page.length < 100) return files;
  }
}

export async function uploadBookPhoto(client, userId, bookId, file) {
  const extension = Object.hasOwn(extensions, file.type) ? extensions[file.type] : null;
  if (!extension || file.size === 0 || file.size > BOOK_PHOTO_MAX_BYTES) {
    throw new Error("Choose a JPEG, PNG, or WebP photo up to 5 MB.");
  }
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const matches = extension === "jpg"
    ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : extension === "png"
      ? [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
      : String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
        && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!matches) throw new Error("This file is not a supported photo.");
  const path = `${userId}/${bookId}/${crypto.randomUUID()}.${extension}`;
  checked(await client.storage.from(BOOK_PHOTO_BUCKET).upload(path, file, {
    contentType: file.type, cacheControl: "0", upsert: false,
  }));
  return path;
}

export async function downloadBookPhoto(client, path) {
  return checked(await client.storage.from(BOOK_PHOTO_BUCKET).download(path));
}

export async function removeBookPhotos(client, paths) {
  for (let offset = 0; offset < paths.length; offset += 100) {
    checked(await client.storage.from(BOOK_PHOTO_BUCKET).remove(paths.slice(offset, offset + 100)));
  }
}

export async function removeAccountBookPhotos(client, userId) {
  const folders = await listBookPhotos(client, userId);
  for (const folder of folders) {
    const files = await listBookPhotos(client, userId, folder.name);
    await removeBookPhotos(client, files.map((file) => file.path));
  }
}
