import { validateImageFile } from "./image-validation.js";

export const MARKETPLACE_PHOTO_BUCKET = "marketplace-listing-photos";
export const MARKETPLACE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

function checked(result) {
  if (result.error) throw result.error;
  return result.data;
}

export async function uploadMarketplaceListingPhoto(client, userId, listingId, file, position = 0) {
  const extension = await validateImageFile(file, MARKETPLACE_PHOTO_MAX_BYTES);
  const path = `${userId}/${listingId}/${crypto.randomUUID()}.${extension}`;
  checked(await client.storage.from(MARKETPLACE_PHOTO_BUCKET).upload(path, file, {
    contentType: file.type, cacheControl: "0", upsert: false,
  }));
  try {
    checked(await client.from("marketplace_listing_photos").insert({
      listing_id: listingId, seller_id: userId, storage_path: path, position,
    }));
  } catch (error) {
    const cleanup = await client.storage.from(MARKETPLACE_PHOTO_BUCKET).remove([path]);
    if (cleanup.error) console.error("Could not remove an unassociated marketplace photo", cleanup.error);
    throw error;
  }
  return path;
}

export async function createMarketplacePhotoUrl(client, path) {
  const result = checked(await client.storage.from(MARKETPLACE_PHOTO_BUCKET).createSignedUrl(path, 300));
  if (!result?.signedUrl) throw new Error("Could not open this listing photo.");
  return result.signedUrl;
}

export async function removeMarketplaceListingPhotos(client, paths) {
  if (!paths.length) return;
  checked(await client.storage.from(MARKETPLACE_PHOTO_BUCKET).remove(paths));
}

export async function removeAccountMarketplaceListingPhotos(client, userId) {
  const paths = [];
  for (let offset = 0; ; offset += 100) {
    const result = await client.from("marketplace_listing_photos")
      .select("storage_path").eq("seller_id", userId).range(offset, offset + 99);
    paths.push(...checked(result).map((photo) => photo.storage_path));
    if (result.data.length < 100) break;
  }
  for (let offset = 0; offset < paths.length; offset += 100) {
    await removeMarketplaceListingPhotos(client, paths.slice(offset, offset + 100));
  }
}
