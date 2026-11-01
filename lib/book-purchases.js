import { createMarketplacePhotoUrl } from "./marketplace-photos.js";

export function getBookRetailers(searchTerm) {
  const search = encodeURIComponent(searchTerm);
  return [
    { name: "Amazon", description: "Shop new and used editions", url: `https://www.amazon.com/s?k=${search}&i=stripbooks` },
    { name: "Bookshop.org", description: "Support independent bookstores", url: `https://bookshop.org/search?keywords=${search}` },
    { name: "Barnes & Noble", description: "Browse books and editions", url: `https://www.barnesandnoble.com/s/${search}` },
    { name: "ThriftBooks", description: "Find pre-owned copies", url: `https://www.thriftbooks.com/browse/?b.search=${search}` },
    { name: "Better World Books", description: "Shop new and used books", url: `https://www.betterworldbooks.com/search/results?q=${search}` },
  ];
}

function checked(result) {
  if (result.error) throw result.error;
  return result.data || [];
}

const normalizeTitle = (value) => (value || "").trim().replace(/\s+/g, " ").toLowerCase();

export async function loadMarketplaceBookListings(client, book) {
  const available = () => client.from("marketplace_listings")
    .select("id,seller_id,title,author,isbn,condition,book_format,price_cents,shipping_cents,created_at")
    .eq("status", "active").gt("quantity", 0)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(12);
  const queries = [];
  const isbns = [...new Set([book.isbn, ...(book.isbnList || [])].flat().filter(Boolean)
    .flatMap((value) => {
      const isbn = String(value);
      return [isbn, isbn.replace(/[^0-9X]/gi, "").toUpperCase()];
    }))];
  if (isbns.length) queries.push(available().in("isbn", isbns));
  if (book.title && book.author) {
    queries.push(available().eq("normalized_title", normalizeTitle(book.title))
      .eq("normalized_author", normalizeTitle(book.author)));
  }
  const matches = (await Promise.all(queries)).flatMap(checked);
  const listings = [...new Map(matches.map((listing) => [listing.id, listing])).values()]
    .sort((first, second) => second.created_at.localeCompare(first.created_at) || second.id.localeCompare(first.id))
    .slice(0, 12);
  if (!listings.length) return [];
  const [sellerResult, photoResult] = await Promise.all([
    client.from("seller_profiles").select("user_id,display_name")
      .in("user_id", [...new Set(listings.map((listing) => listing.seller_id))]),
    client.from("marketplace_listing_photos").select("listing_id,storage_path,position")
      .in("listing_id", listings.map((listing) => listing.id)).order("position"),
  ]);
  const sellers = new Map(checked(sellerResult).map((seller) => [seller.user_id, seller.display_name]));
  const photos = new Map();
  for (const photo of checked(photoResult)) {
    if (!photos.has(photo.listing_id)) photos.set(photo.listing_id, []);
    const listingPhotos = photos.get(photo.listing_id);
    if (listingPhotos.length < 5) listingPhotos.push(photo.storage_path);
  }
  return Promise.all(listings.map(async (listing) => ({
    ...listing,
    sellerName: sellers.get(listing.seller_id) || "Librito reader",
    photoUrls: await Promise.all((photos.get(listing.id) || [])
      .map((path) => createMarketplacePhotoUrl(client, path))),
  })));
}
