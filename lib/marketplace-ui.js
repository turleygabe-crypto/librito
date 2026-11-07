import {
  createMarketplacePhotoUrl,
  removeMarketplaceListingPhotos,
  uploadMarketplaceListingPhoto,
} from "./marketplace-photos.js";
import { normalizePlan } from "./entitlements.js";
import { escapeCsvCell } from "./csv.js";

const conditions = [
  ["like_new", "Like new"],
  ["very_good", "Very good"],
  ["good", "Good"],
  ["acceptable", "Acceptable"],
];
const conditionLabels = Object.fromEntries(conditions);
const MAX_LISTING_PHOTOS = 5;
const MARKETPLACE_PAGE_SIZE = 24;

function checked(result) {
  if (result.error) throw result.error;
  return result.data;
}

function node(tag, text = "", className = "") {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function button(text, action, className = "action-btn") {
  const element = node("button", text, className);
  element.type = "button";
  element.addEventListener("click", action);
  return element;
}

function sectionHeader(title, description = "") {
  const header = node("header", "", "page-header");
  header.append(node("h1", title));
  if (description) header.append(node("p", description, "page-description"));
  return header;
}

function dollars(cents) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format((cents || 0) / 100);
}

function ensureSignedIn(user, openAuth, toast) {
  if (user) return true;
  toast("Sign in to use marketplace tools.");
  openAuth();
  return false;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"' && cell.length === 0) quoted = true;
    else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += character;
  }
  if (quoted) throw new Error("The inventory CSV has an unfinished quoted field.");
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  if (rows.length < 2) throw new Error("Add a header row and at least one inventory row.");
  const headers = rows[0].map((value) => value.trim().toLowerCase());
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() || ""])));
}

function csvEscape(value) {
  return escapeCsvCell(value);
}

function downloadCsv(filename, rows) {
  const content = rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = node("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function loadMarketplaceListings(client, query = "", pageNumber = 0) {
  const { data, error } = await client.rpc("marketplace_search_listings", {
    search_text: query.trim() || null,
    page_offset: pageNumber * MARKETPLACE_PAGE_SIZE,
    page_size: MARKETPLACE_PAGE_SIZE + 1,
  });
  if (error) throw error;
  const pageRows = data || [];
  const hasNext = pageRows.length > MARKETPLACE_PAGE_SIZE;
  const listings = pageRows.slice(0, MARKETPLACE_PAGE_SIZE);
  const sellerIds = [...new Set(listings.map((listing) => listing.seller_id))];
  const listingIds = listings.map((listing) => listing.id);
  const [sellerResult, photoResult] = await Promise.all([
    sellerIds.length
      ? client.from("seller_profiles").select("user_id,display_name,location,seller_type").in("user_id", sellerIds)
      : Promise.resolve({ data: [], error: null }),
    listingIds.length
      ? client.from("marketplace_listing_photos").select("listing_id,storage_path,position")
        .in("listing_id", listingIds).order("position")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (sellerResult.error) throw sellerResult.error;
  if (photoResult.error) throw photoResult.error;
  const sellers = new Map((sellerResult.data || []).map((seller) => [seller.user_id, seller]));
  const photos = new Map();
  for (const photo of photoResult.data || []) {
    if (!photos.has(photo.listing_id)) photos.set(photo.listing_id, []);
    const listingPhotos = photos.get(photo.listing_id);
    if (listingPhotos.length < 5) listingPhotos.push(photo.storage_path);
  }
  return {
    listings: await Promise.all(listings.map(async (listing) => ({
      ...listing,
      seller: sellers.get(listing.seller_id),
      photoUrls: await Promise.all((photos.get(listing.id) || [])
        .map((path) => createMarketplacePhotoUrl(client, path))),
    }))),
    hasNext,
  };
}

export async function renderMarketplacePage({
  page, client, user, profile, route, params, navigate, openAuth, toast,
}) {
  page.replaceChildren();
  page.classList.add("marketplace-page");
  const plan = normalizePlan(profile?.tier);
  const isPro = plan === "bookshop_pro";
  const refresh = () => renderMarketplacePage({
    page, client, user, profile, route, params, navigate, openAuth, toast,
  });
  const showError = (error, message = "Marketplace could not complete that request.") => {
    console.error(message, error);
    toast(error?.message || message);
  };
  const addNavigation = (target, label) => page.append(button(label, () => navigate(target), "secondary-btn"));
  const root = node("div", "", "marketplace-content");
  page.append(root);

  if (!client) {
    root.append(sectionHeader("Marketplace", "Connect to Librito to browse seller listings."));
    return;
  }

  const loadListings = (query = "", pageNumber = 0) => loadMarketplaceListings(client, query, pageNumber);

  function listingCard(listing) {
    const card = node("article", "", "media-card marketplace-listing-card");
    const image = node("img", "", "marketplace-listing-photo");
    image.alt = `Seller photograph of ${listing.title}`;
    image.loading = "lazy";
    if (listing.photoUrls?.length) image.src = listing.photoUrls[0];
    else image.hidden = true;
    card.append(image);
    if (listing.photoUrls?.length > 1) {
      const additionalPhotos = node("div", "", "marketplace-listing-additional-photos");
      for (const [index, url] of listing.photoUrls.slice(1).entries()) {
        const additionalImage = node("img", "", "marketplace-listing-additional-photo");
        additionalImage.src = url;
        additionalImage.alt = `Additional seller photograph ${index + 2} of ${listing.title}`;
        additionalImage.loading = "lazy";
        additionalPhotos.append(additionalImage);
      }
      card.append(additionalPhotos);
    }
    const title = node("h2", listing.title);
    const author = node("p", listing.author || "Author not provided", "marketplace-listing-author");
    const price = node("p", dollars(listing.price_cents), "marketplace-listing-price");
    const details = node("p", `${conditionLabels[listing.condition] || listing.condition} · Shipping ${dollars(listing.shipping_cents)}`);
    const seller = node("p", `Sold by ${listing.seller?.display_name || "Librito reader"}${listing.seller?.location ? ` · ${listing.seller.location}` : ""}`);
    const open = button("View listing", () => navigate("marketplace-listing", { id: listing.id }));
    card.append(title, author, price, details, seller, open);
    return card;
  }

  async function browse() {
    root.append(sectionHeader("Marketplace", "Find a pre-loved copy from another reader. Every listing photo is uploaded by its seller."));
    const actions = node("div", "", "marketplace-actions");
    actions.append(
      button("Sell a book", () => navigate("marketplace-sell")),
      button("My orders", () => navigate("marketplace-orders"), "secondary-btn"),
      button("Wishlist & alerts", () => navigate("marketplace-wishlist"), "secondary-btn"),
      button("Messages", () => navigate("marketplace-messages"), "secondary-btn"),
    );
    if (isPro) actions.append(button("Bookshop dashboard", () => navigate("marketplace-pro"), "secondary-btn"));
    root.append(actions);
    const form = node("form", "", "marketplace-search");
    const search = node("input");
    search.type = "search";
    search.placeholder = "Search title, author, or ISBN";
    search.value = params.get("q") || "";
    const submit = node("button", "Search", "action-btn");
    submit.type = "submit";
    form.append(search, submit);
    root.append(form);
    const results = node("div", "", "marketplace-grid");
    root.append(results);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      params.set("q", search.value.trim());
      params.set("page", "0");
      await refresh();
    });
    const pageNumber = Math.max(0, Number.parseInt(params.get("page") || "0", 10) || 0);
    const result = await loadListings(search.value, pageNumber);
    const listings = result.listings;
    if (!listings.length) {
      results.append(node("p", "No active listings match your search yet.", "empty-state"));
    } else {
      listings.forEach((listing) => results.append(listingCard(listing)));
    }
    if (pageNumber > 0 || result.hasNext) {
      const pagination = node("nav", "", "marketplace-pagination");
      pagination.setAttribute("aria-label", "Marketplace listing pages");
      if (pageNumber > 0) {
        pagination.append(button("Previous page", async () => {
          params.set("page", String(pageNumber - 1));
          await refresh();
        }, "secondary-btn"));
      }
      pagination.append(node("span", `Page ${pageNumber + 1}`));
      if (result.hasNext) {
        pagination.append(button("Next page", async () => {
          params.set("page", String(pageNumber + 1));
          await refresh();
        }, "secondary-btn"));
      }
      root.append(pagination);
    }
  }

  async function getListing(id) {
    const listing = checked(await client.from("marketplace_listings").select("*").eq("id", id).maybeSingle());
    if (!listing) throw new Error("This listing is no longer available.");
    const [sellerResult, photoResult] = await Promise.all([
      client.from("seller_profiles").select("user_id,display_name,location,seller_type").eq("user_id", listing.seller_id).maybeSingle(),
      client.from("marketplace_listing_photos").select("storage_path,position").eq("listing_id", id).order("position"),
    ]);
    if (sellerResult.error) throw sellerResult.error;
    if (photoResult.error) throw photoResult.error;
    const photos = await Promise.all((photoResult.data || []).map((photo) => createMarketplacePhotoUrl(client, photo.storage_path)));
    return { ...listing, seller: sellerResult.data, photoUrls: photos };
  }

  async function openConversation(listing) {
    if (!ensureSignedIn(user, openAuth, toast)) return;
    const existing = checked(await client.from("marketplace_conversations").select("id")
      .eq("listing_id", listing.id).eq("buyer_id", user.id).maybeSingle());
    if (existing) {
      navigate("marketplace-messages", { conversation: existing.id });
      return;
    }
    const result = await client.from("marketplace_conversations").insert({
      listing_id: listing.id, buyer_id: user.id, seller_id: listing.seller_id,
    }).select("id").single();
    if (result.error?.code === "23505") {
      const retry = checked(await client.from("marketplace_conversations").select("id")
        .eq("listing_id", listing.id).eq("buyer_id", user.id).single());
      navigate("marketplace-messages", { conversation: retry.id });
      return;
    }
    const conversation = checked(result);
    navigate("marketplace-messages", { conversation: conversation.id });
  }

  async function reportListing(listing) {
    if (!ensureSignedIn(user, openAuth, toast)) return;
    const reason = window.prompt("Tell us why this listing needs review:");
    if (reason === null) return;
    checked(await client.from("marketplace_reports").insert({
      reporter_id: user.id, listing_id: listing.id, reason: reason.trim(),
    }));
    toast("Thank you. The report was sent to Librito for review.");
  }

  async function reportSeller(listing) {
    if (!ensureSignedIn(user, openAuth, toast)) return;
    const reason = window.prompt("Tell us why this seller needs review:");
    if (reason === null) return;
    checked(await client.from("marketplace_reports").insert({
      reporter_id: user.id, seller_id: listing.seller_id, reason: reason.trim(),
    }));
    toast("Thank you. The report was sent to Librito for review.");
  }

  async function listingDetail() {
    const listing = await getListing(params.get("id"));
    root.append(sectionHeader(listing.title, `${listing.author} · ${conditionLabels[listing.condition] || listing.condition}`));
    addNavigation("marketplace", "Back to marketplace");
    const photos = node("div", "", "marketplace-photo-gallery");
    for (const [index, url] of listing.photoUrls.entries()) {
      const image = node("img", "", "marketplace-detail-photo");
      image.src = url;
      image.alt = `Seller photograph ${index + 1} of ${listing.title}`;
      photos.append(image);
    }
    root.append(photos);
    const details = node("section", "", "marketplace-detail");
    details.append(
      node("p", listing.description || "No additional description."),
      node("p", `Book price: ${dollars(listing.price_cents)}`),
      node("p", `Shipping: ${dollars(listing.shipping_cents)}`),
      node("p", `Seller: ${listing.seller?.display_name || "Librito reader"}${listing.seller?.location ? ` · ${listing.seller.location}` : ""}`),
    );
    const actions = node("div", "", "marketplace-actions");
    actions.append(
      button("Message seller", () => openConversation(listing)),
      button("Save listing", async () => {
        if (!ensureSignedIn(user, openAuth, toast)) return;
        try {
          checked(await client.from("marketplace_saved_listings").insert({ user_id: user.id, listing_id: listing.id }));
          toast("Listing saved.");
        } catch (error) {
          if (error.code === "23505") toast("This listing is already saved.");
          else showError(error, "Could not save this listing.");
        }
      }, "secondary-btn"),
      button("Report listing", () => reportListing(listing), "text-btn"),
      button("Report seller", () => reportSeller(listing), "text-btn"),
    );
    const quote = checked(await client.rpc("marketplace_admin_quote", { target_listing: listing.id }));
    const fee = node("p", `Estimated seller proceeds: ${dollars(quote.estimated_seller_proceeds_cents)} after the ${quote.commission_basis_points / 100}% commission on book price and estimated payment processing. Actual processing fees can differ.`);
    const buyerTotal = node("p", `Buyer total before any required tax: ${dollars(quote.buyer_total_cents)}.`);
    details.append(fee, buyerTotal);
    if (quote.mock_checkout_enabled) {
      actions.append(button("Place test-only order", () => checkout(listing), "action-btn"));
      details.append(node("p", "Test simulation only. This does not charge a payment method or create a real shipment.", "marketplace-test-notice"));
    } else {
      actions.append(button("Checkout unavailable", () => {}, "secondary-btn"));
      details.append(node("p", "Marketplace payment checkout is not enabled. Librito is completing seller-payment and dispute safeguards before accepting live payments.", "marketplace-test-notice"));
    }
    details.append(actions);
    root.append(details);
  }

  async function checkout(listing) {
    if (!ensureSignedIn(user, openAuth, toast)) return;
    const form = node("form", "", "marketplace-checkout-form book-form");
    form.append(node("h2", "Shipping details"));
    const fields = [
      ["recipient_name", "Name", true],
      ["address_line_1", "Address", true],
      ["address_line_2", "Apartment or unit", false],
      ["city", "City", true],
      ["region", "State / region", false],
      ["postal_code", "Postal code", true],
      ["country_code", "Country code (2 letters)", true],
    ];
    const values = {};
    for (const [name, label, required] of fields) {
      const wrapper = node("label", label);
      const input = node("input");
      input.name = name;
      input.required = required;
      input.autocomplete = name === "address_line_1" ? "shipping address-line1"
        : name === "recipient_name" ? "shipping name"
          : name === "postal_code" ? "shipping postal-code"
            : name === "country_code" ? "shipping country" : "shipping address-level2";
      if (name === "country_code") {
        input.value = Intl.DateTimeFormat().resolvedOptions().locale?.split("-")[1] || "US";
        input.maxLength = 2;
      }
      wrapper.append(input);
      form.append(wrapper);
      values[name] = input;
    }
    const submit = node("button", "Confirm test order", "action-btn");
    submit.type = "submit";
    form.append(submit);
    root.append(form);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      submit.disabled = true;
      try {
        const requestKey = crypto.randomUUID();
        const result = checked(await client.rpc("marketplace_admin_create_mock_order", {
          target_listing: listing.id,
          request_key: requestKey,
          recipient_name: values.recipient_name.value.trim(),
          address_line_1: values.address_line_1.value.trim(),
          address_line_2: values.address_line_2.value.trim(),
          city: values.city.value.trim(),
          region: values.region.value.trim(),
          postal_code: values.postal_code.value.trim(),
          country_code: values.country_code.value.trim().toUpperCase(),
        }));
        toast("Test order created. No payment was collected.");
        navigate("marketplace-orders", { order: result });
      } catch (error) {
        submit.disabled = false;
        showError(error, "Could not place this test order.");
      }
    });
  }

  async function sell() {
    root.append(sectionHeader("Sell a book", "Free accounts can create and manage personal listings. Marketplace sales do not require Book Lover."));
    addNavigation("marketplace", "Back to marketplace");
    if (!ensureSignedIn(user, openAuth, toast)) {
      root.append(node("p", "Sign in to create your listing."));
      return;
    }
    const form = node("form", "", "marketplace-listing-form book-form");
    const formFields = [
      ["title", "Title", "text", true],
      ["author", "Author", "text", true],
      ["isbn", "ISBN (optional)", "text", false],
      ["edition_id", "Edition ID (optional)", "text", false],
      ["price_cents", "Book price in cents", "number", true],
      ["shipping_cents", "Shipping in cents", "number", true],
    ];
    const inputs = {};
    for (const [name, label, type, required] of formFields) {
      const wrapper = node("label", label);
      const input = node("input");
      input.name = name;
      input.type = type;
      input.required = required;
      if (name.endsWith("_cents")) {
        input.min = name === "price_cents" ? "1" : "0";
        input.step = "1";
      }
      wrapper.append(input);
      form.append(wrapper);
      inputs[name] = input;
    }
    const conditionLabel = node("label", "Book condition");
    const condition = node("select");
    condition.name = "condition";
    condition.required = true;
    conditions.forEach(([value, label]) => {
      const option = node("option", label);
      option.value = value;
      condition.append(option);
    });
    conditionLabel.append(condition);
    form.append(conditionLabel);
    const descriptionLabel = node("label", "Description");
    const description = node("textarea");
    description.name = "description";
    description.maxLength = 4000;
    description.rows = 4;
    descriptionLabel.append(description);
    form.append(descriptionLabel);
    const photoLabel = node("label", "Photos of the exact physical copy (required)");
    const photoInput = node("input");
    photoInput.type = "file";
    photoInput.accept = "image/jpeg,image/png,image/webp";
    photoInput.multiple = true;
    photoInput.required = true;
    photoLabel.append(photoInput);
    photoLabel.append(node("span", "Upload up to five seller-taken photos. Catalog cover art, stock photos, and photos of another copy are not accepted.", "field-hint"));
    form.append(photoLabel);
    const submit = node("button", "Create listing", "action-btn");
    submit.type = "submit";
    form.append(submit);
    root.append(form);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!ensureSignedIn(user, openAuth, toast)) return;
      const files = [...photoInput.files];
      if (!files.length || files.length > MAX_LISTING_PHOTOS) {
        toast(`Choose between one and ${MAX_LISTING_PHOTOS} seller photos.`);
        return;
      }
      submit.disabled = true;
      let listingId = null;
      const uploadedPaths = [];
      try {
        let seller = checked(await client.from("seller_profiles").select("user_id").eq("user_id", user.id).maybeSingle());
        if (!seller) {
          checked(await client.from("seller_profiles").insert({
            user_id: user.id, seller_type: "personal",
            display_name: profile?.full_name || user.user_metadata?.full_name || user.email || "Librito reader",
          }));
        }
        const listing = checked(await client.from("marketplace_listings").insert({
          seller_id: user.id,
          title: inputs.title.value.trim(),
          author: inputs.author.value.trim(),
          isbn: inputs.isbn.value.trim() || null,
          edition_id: inputs.edition_id.value.trim() || null,
          condition: condition.value,
          description: description.value.trim(),
          price_cents: Number(inputs.price_cents.value),
          shipping_cents: Number(inputs.shipping_cents.value),
          quantity: 1,
          status: "draft",
        }).select("id").single());
        listingId = listing.id;
        for (const [position, file] of files.entries()) {
          uploadedPaths.push(await uploadMarketplaceListingPhoto(client, user.id, listingId, file, position));
        }
        checked(await client.from("marketplace_listings").update({ status: "active" })
          .eq("id", listingId).eq("seller_id", user.id));
        toast("Your book is listed.");
        navigate("marketplace-listing", { id: listingId });
      } catch (error) {
        try {
          await removeMarketplaceListingPhotos(client, uploadedPaths);
        } catch (cleanupError) {
          console.error("Could not clean up marketplace photos for an unpublished listing", cleanupError);
        }
        if (listingId) {
          const cleanup = await client.from("marketplace_listings").delete()
            .eq("id", listingId).eq("seller_id", user.id).eq("status", "draft");
          if (cleanup.error) console.error("Could not clean up an incomplete listing draft", cleanup.error);
        }
        submit.disabled = false;
        showError(error, "Could not publish your listing.");
      }
    });
  }

  async function orders() {
    root.append(sectionHeader("Marketplace orders", "Track purchases and sales made through Librito."));
    addNavigation("marketplace", "Back to marketplace");
    if (!ensureSignedIn(user, openAuth, toast)) return;
    const result = await client.from("marketplace_orders").select("*")
      .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
      .order("created_at", { ascending: false }).limit(100);
    const orders = checked(result) || [];
    if (!orders.length) {
      root.append(node("p", "Your marketplace orders will appear here.", "empty-state"));
      return;
    }
    for (const order of orders) {
      const card = node("article", "", "account-card marketplace-order");
      card.append(
        node("h2", order.buyer_id === user.id ? "Purchase" : "Sale"),
        node("p", `Order ${order.id}`),
        node("p", `Status: ${order.status === "test_simulated" ? "Test simulation only" : order.status}`),
        node("p", `Total: ${dollars(order.buyer_total_cents)}`),
      );
      const items = checked(await client.from("marketplace_order_items").select("listing_title,listing_author,condition,book_price_cents,shipping_cents").eq("order_id", order.id));
      for (const item of items || []) {
        card.append(node("p", `${item.listing_title}${item.listing_author ? ` — ${item.listing_author}` : ""} · ${conditionLabels[item.condition] || item.condition} · ${dollars(item.book_price_cents)}`));
      }
      if (order.seller_id === user.id) {
        const shipment = checked(await client.from("marketplace_shipments").select("carrier,tracking_number,shipped_at").eq("order_id", order.id).maybeSingle());
        const shipping = checked(await client.from("marketplace_order_shipping").select("recipient_name,address_line_1,address_line_2,city,region,postal_code,country_code")
          .eq("order_id", order.id).maybeSingle());
        if (shipping) card.append(node("p", `${shipping.recipient_name} · ${shipping.address_line_1}${shipping.address_line_2 ? `, ${shipping.address_line_2}` : ""} · ${shipping.city}${shipping.region ? `, ${shipping.region}` : ""} ${shipping.postal_code} ${shipping.country_code}`));
        if (shipment) {
          card.append(node("p", shipment.tracking_number ? `Tracking: ${shipment.carrier || "Carrier"} ${shipment.tracking_number}` : "No shipment tracking added."));
          const trackingForm = node("form", "", "marketplace-message-form");
          const carrier = node("input");
          carrier.placeholder = "Carrier";
          carrier.value = shipment.carrier || "";
          const tracking = node("input");
          tracking.placeholder = "Tracking number";
          tracking.value = shipment.tracking_number || "";
          tracking.required = true;
          const saveTracking = node("button", "Save tracking", "secondary-btn");
          saveTracking.type = "submit";
          trackingForm.append(carrier, tracking, saveTracking);
          trackingForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            try {
              checked(await client.from("marketplace_shipments").update({
                carrier: carrier.value.trim() || null,
                tracking_number: tracking.value.trim(),
                shipped_at: new Date().toISOString(),
              }).eq("order_id", order.id).eq("seller_id", user.id));
              toast("Tracking details saved.");
              await refresh();
            } catch (error) { showError(error, "Could not save tracking details."); }
          });
          card.append(trackingForm);
        }
      }
      root.append(card);
    }
  }

  async function messages() {
    root.append(sectionHeader("Marketplace messages", "Keep buyer and seller conversations in Librito."));
    addNavigation("marketplace", "Back to marketplace");
    if (!ensureSignedIn(user, openAuth, toast)) return;
    let conversations = checked(await client.from("marketplace_conversations").select("*")
      .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`).order("created_at", { ascending: false }).limit(100)) || [];
    const selectedId = params.get("conversation");
    if (!conversations.length) {
      root.append(node("p", "No marketplace conversations yet.", "empty-state"));
      return;
    }
    for (const conversation of conversations) {
      const card = node("section", "", `marketplace-conversation${conversation.id === selectedId ? " is-selected" : ""}`);
      const listing = checked(await client.from("marketplace_listings").select("title").eq("id", conversation.listing_id).maybeSingle());
      card.append(node("h2", listing?.title || "Book listing"));
      const thread = node("div", "", "marketplace-thread");
      const messagesResult = await client.from("marketplace_messages").select("id,sender_id,body,created_at")
        .eq("conversation_id", conversation.id).order("created_at");
      for (const message of checked(messagesResult) || []) {
        thread.append(node("p", `${message.sender_id === user.id ? "You" : "Reader"}: ${message.body}`));
      }
      const form = node("form", "", "marketplace-message-form");
      const input = node("textarea");
      input.maxLength = 4000;
      input.required = true;
      input.rows = 2;
      input.setAttribute("aria-label", "Message");
      const send = node("button", "Send", "action-btn");
      send.type = "submit";
      form.append(input, send);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        send.disabled = true;
        try {
          checked(await client.from("marketplace_messages").insert({
            conversation_id: conversation.id, sender_id: user.id, body: input.value.trim(),
          }));
          await refresh();
        } catch (error) {
          send.disabled = false;
          showError(error, "Could not send this message.");
        }
      });
      for (const message of checked(messagesResult) || []) {
        const report = button("Report message", async () => {
          const reason = window.prompt("Tell us why this message needs review:");
          if (reason === null) return;
          try {
            checked(await client.from("marketplace_reports").insert({
              reporter_id: user.id, message_id: message.id, reason: reason.trim(),
            }));
            toast("Thank you. The report was sent to Librito for review.");
          } catch (error) { showError(error, "Could not report this message."); }
        }, "text-btn");
        report.setAttribute("aria-label", "Report message");
        thread.append(report);
      }
      card.append(thread, form);
      root.append(card);
    }
  }

  async function wishlist() {
    root.append(sectionHeader("Wishlist & alerts", "Save books you are looking for and see when a matching seller listing appears."));
    addNavigation("marketplace", "Back to marketplace");
    if (!ensureSignedIn(user, openAuth, toast)) return;
    const form = node("form", "", "marketplace-search");
    const title = node("input");
    title.placeholder = "Book title";
    title.required = true;
    const author = node("input");
    author.placeholder = "Author (optional)";
    const isbn = node("input");
    isbn.placeholder = "ISBN (optional)";
    const submit = node("button", "Save alert", "action-btn");
    submit.type = "submit";
    form.append(title, author, isbn, submit);
    root.append(form);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      submit.disabled = true;
      try {
        checked(await client.from("marketplace_wishlist_alerts").insert({
          user_id: user.id, isbn: isbn.value.trim() || null,
          normalized_title: title.value.trim().toLowerCase().replace(/\s+/g, " "),
          normalized_author: author.value.trim().toLowerCase().replace(/\s+/g, " "),
        }));
        await refresh();
      } catch (error) {
        submit.disabled = false;
        showError(error, "Could not save this wishlist alert.");
      }
    });
    const [alertsResult, notificationsResult] = await Promise.all([
      client.from("marketplace_wishlist_alerts").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      client.from("marketplace_notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
    ]);
    root.append(node("h2", "Saved searches"));
    for (const alert of checked(alertsResult) || []) {
      const row = node("div", "", "marketplace-alert-row");
      row.append(node("span", `${alert.normalized_title}${alert.normalized_author ? ` — ${alert.normalized_author}` : ""}`));
      row.append(button("Remove", async () => {
        try {
          checked(await client.from("marketplace_wishlist_alerts").delete().eq("id", alert.id).eq("user_id", user.id));
          await refresh();
        } catch (error) { showError(error, "Could not remove this alert."); }
      }, "text-btn"));
      root.append(row);
    }
    root.append(node("h2", "Matching listings"));
    for (const notification of checked(notificationsResult) || []) {
      const listing = checked(await client.from("marketplace_listings").select("id,status,title").eq("id", notification.listing_id).maybeSingle());
      const row = node("div", "", "marketplace-alert-row");
      row.append(node("span", `${notification.payload?.title || listing?.title || "A book"} is available.`));
      if (listing?.status === "active") row.append(button("View", () => navigate("marketplace-listing", { id: listing.id }), "text-btn"));
      if (!notification.read_at) {
        row.append(button("Mark read", async () => {
          try {
            checked(await client.from("marketplace_notifications").update({ read_at: new Date().toISOString() }).eq("id", notification.id));
            await refresh();
          } catch (error) { showError(error, "Could not update this notification."); }
        }, "text-btn"));
      }
      root.append(row);
    }
  }

  async function storefront() {
    const sellerId = params.get("id");
    const store = checked(await client.from("seller_storefronts").select("*")
      .eq("seller_id", sellerId).eq("published", true).maybeSingle());
    if (!store) throw new Error("This bookstore storefront is not available.");
    root.append(sectionHeader(store.store_name, store.description || store.location));
    addNavigation("marketplace", "Back to marketplace");
    const listingResult = await client.from("marketplace_listings").select("*")
      .eq("seller_id", sellerId).eq("status", "active").gt("quantity", 0)
      .order("created_at", { ascending: false }).limit(200);
    const shopListings = checked(listingResult) || [];
    const photosResult = shopListings.length
      ? await client.from("marketplace_listing_photos").select("listing_id,storage_path,position")
        .in("listing_id", shopListings.map((item) => item.id)).order("position")
      : { data: [], error: null };
    const firstPhoto = new Map();
    for (const photo of checked(photosResult) || []) {
      if (!firstPhoto.has(photo.listing_id)) firstPhoto.set(photo.listing_id, photo.storage_path);
    }
    for (const listing of shopListings) {
      listing.seller = { display_name: store.store_name, location: store.location, seller_type: "bookshop" };
      listing.photoUrl = firstPhoto.has(listing.id) ? await createMarketplacePhotoUrl(client, firstPhoto.get(listing.id)) : null;
    }
    if (shopListings.length) shopListings.forEach((listing) => root.append(listingCard(listing)));
    else root.append(node("p", "This bookstore has no active listings right now.", "empty-state"));
  }

  async function proDashboard() {
    root.append(sectionHeader("Bookshop Pro", "Professional tools for independent bookstores and booksellers."));
    addNavigation("marketplace", "Back to marketplace");
    if (!ensureSignedIn(user, openAuth, toast)) return;
    if (!isPro) {
      root.append(
        node("p", "Business storefronts, bulk inventory, and sales reports require Bookshop Pro. Personal marketplace sales remain free."),
        button("View plans", () => navigate("upgrade")),
      );
      return;
    }
    const sellerResult = await client.from("seller_profiles").select("user_id,seller_type,display_name,location")
      .eq("user_id", user.id).maybeSingle();
    let seller = checked(sellerResult);
    if (!seller) {
      seller = checked(await client.from("seller_profiles").insert({
        user_id: user.id, seller_type: "bookshop",
        display_name: profile?.full_name || user.email || "Bookshop",
      }).select("user_id,seller_type,display_name,location").single());
    } else if (seller.seller_type !== "bookshop") {
      const confirmUpgrade = window.confirm("Enable the professional bookstore profile for this account?");
      if (!confirmUpgrade) return;
      seller = checked(await client.from("seller_profiles").update({ seller_type: "bookshop" })
        .eq("user_id", user.id).select("user_id,seller_type,display_name,location").single());
    }
    const storeForm = node("form", "", "marketplace-listing-form book-form");
    const storeNameLabel = node("label", "Store name");
    const storeName = node("input");
    storeName.required = true;
    storeNameLabel.append(storeName);
    const storeDescriptionLabel = node("label", "Store description");
    const storeDescription = node("textarea");
    storeDescription.maxLength = 2000;
    storeDescriptionLabel.append(storeDescription);
    const publishLabel = node("label", "Public storefront");
    const publish = node("input");
    publish.type = "checkbox";
    publishLabel.append(publish);
    const saveStore = node("button", "Save storefront", "action-btn");
    saveStore.type = "submit";
    storeForm.append(storeNameLabel, storeDescriptionLabel, publishLabel, saveStore);
    root.append(node("h2", "Storefront"));
    root.append(storeForm);
    let existingStore = checked(await client.from("seller_storefronts").select("*").eq("seller_id", user.id).maybeSingle());
    if (existingStore) {
      storeName.value = existingStore.store_name;
      storeDescription.value = existingStore.description;
      publish.checked = existingStore.published;
    }
    storeForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const slug = storeName.value.trim().toLowerCase().normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        if (!slug) throw new Error("Add a store name with letters or numbers.");
        const values = {
          seller_id: user.id, slug, store_name: storeName.value.trim(),
          description: storeDescription.value.trim(), location: seller.location || "",
          published: publish.checked,
        };
        if (existingStore) {
          checked(await client.from("seller_storefronts").update(values).eq("seller_id", user.id));
        } else {
          checked(await client.from("seller_storefronts").insert({ ...values, published: false }));
          if (values.published) {
            checked(await client.from("seller_storefronts").update({ published: true }).eq("seller_id", user.id));
          }
        }
        existingStore = { ...values };
        toast("Storefront saved.");
      } catch (error) { showError(error, "Could not save your storefront."); }
    });
    const inventory = checked(await client.from("marketplace_listings").select("*")
      .eq("seller_id", user.id).order("created_at", { ascending: false }).limit(500)) || [];
    const orders = checked(await client.from("marketplace_orders").select("id,buyer_total_cents,status,created_at")
      .eq("seller_id", user.id).order("created_at", { ascending: false }).limit(500)) || [];
    root.append(node("h2", "Inventory & sales"));
    root.append(node("p", `${inventory.length} listings · ${orders.length} orders · ${dollars(orders.reduce((sum, order) => sum + order.buyer_total_cents, 0))} gross order value`));
    const exportButton = button("Export inventory CSV", () => downloadCsv("librito-inventory.csv", [
      ["title", "author", "isbn", "condition", "price_cents", "shipping_cents", "quantity", "status"],
      ...inventory.map((item) => [item.title, item.author, item.isbn, item.condition, item.price_cents, item.shipping_cents, item.quantity, item.status]),
    ]));
    const importInput = node("input");
    importInput.type = "file";
    importInput.accept = ".csv,text/csv";
    importInput.setAttribute("aria-label", "Import inventory CSV");
    const importButton = button("Import inventory CSV", () => importInput.click(), "secondary-btn");
    root.append(exportButton, importButton, importInput);
    importInput.addEventListener("change", async () => {
      const file = importInput.files?.[0];
      if (!file) return;
      try {
        if (file.size > 1024 * 1024) throw new Error("Inventory CSV files must be 1 MB or smaller.");
        const rows = parseCsv(await file.text());
        if (rows.length > 100) throw new Error("Import up to 100 inventory rows at a time.");
        const required = ["title", "author", "condition", "price_cents"];
        const createdIds = [];
        const errors = [];
        for (const [index, row] of rows.entries()) {
          const price = Number(row.price_cents);
          const quantity = Number(row.quantity || 1);
          if (required.some((key) => !row[key]) || !conditions.some(([value]) => value === row.condition)
            || !Number.isSafeInteger(price) || price <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
            errors.push({ row: index + 2, message: "Invalid required fields, condition, price, or quantity." });
            continue;
          }
          const insertion = await client.from("marketplace_listings").insert({
            seller_id: user.id, title: row.title, author: row.author,
            isbn: row.isbn || null, condition: row.condition, price_cents: price,
            shipping_cents: Number.isSafeInteger(Number(row.shipping_cents || 0)) ? Number(row.shipping_cents || 0) : 0,
            quantity, description: row.description || "", status: "draft",
          }).select("id").single();
          if (insertion.error) errors.push({ row: index + 2, message: insertion.error.message });
          else createdIds.push(insertion.data.id);
        }
        checked(await client.from("marketplace_import_jobs").insert({
          seller_id: user.id, status: errors.length ? "failed" : "completed",
          row_count: rows.length, error_rows: errors, created_listing_ids: createdIds,
          completed_at: new Date().toISOString(),
        }));
        toast(`${createdIds.length} draft listings imported. Add actual seller photos before publishing.`);
        await refresh();
      } catch (error) { showError(error, "Could not import inventory CSV."); }
    });
    if (!inventory.length) root.append(node("p", "No inventory yet. Import a CSV or create an individual listing.", "empty-state"));
    for (const item of inventory) {
      const row = node("article", "", "account-card marketplace-inventory-row");
      row.append(node("h3", item.title), node("p", `${item.status} · ${item.quantity} available · ${dollars(item.price_cents)}`));
      if (item.status === "draft") {
        const photoInput = node("input");
        photoInput.type = "file";
        photoInput.accept = "image/jpeg,image/png,image/webp";
        photoInput.multiple = true;
        const attach = button("Add seller photos and publish", async () => {
          const files = [...photoInput.files];
          if (!files.length || files.length > MAX_LISTING_PHOTOS) {
            toast(`Choose between one and ${MAX_LISTING_PHOTOS} actual seller photos.`);
            return;
          }
          attach.disabled = true;
          try {
            for (const [position, photo] of files.entries()) {
              await uploadMarketplaceListingPhoto(client, user.id, item.id, photo, position);
            }
            checked(await client.from("marketplace_listings").update({ status: "active" }).eq("id", item.id));
            await refresh();
          } catch (error) {
            attach.disabled = false;
            showError(error, "Could not publish this inventory item.");
          }
        });
        row.append(photoInput, attach);
      } else if (item.status === "active") {
        row.append(button("Pause listing", async () => {
          try {
            checked(await client.from("marketplace_listings").update({ status: "paused" }).eq("id", item.id));
            await refresh();
          } catch (error) { showError(error, "Could not pause this listing."); }
        }, "secondary-btn"));
      }
      root.append(row);
    }
  }

  try {
    if (route === "marketplace") await browse();
    else if (route === "marketplace-listing") await listingDetail();
    else if (route === "marketplace-sell") await sell();
    else if (route === "marketplace-orders") await orders();
    else if (route === "marketplace-messages") await messages();
    else if (route === "marketplace-wishlist") await wishlist();
    else if (route === "marketplace-storefront") await storefront();
    else if (route === "marketplace-pro") await proDashboard();
  } catch (error) {
    showError(error);
    if (!root.children.length) root.append(sectionHeader("Marketplace unavailable", error.message));
  }
}
