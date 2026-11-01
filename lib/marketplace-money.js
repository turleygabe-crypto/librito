export const DEFAULT_COMMISSION_BASIS_POINTS = 500;

function validCents(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative integer number of cents.`);
  }
  return value;
}

function validBasisPoints(value) {
  if (!Number.isInteger(value) || value < 0 || value > 10000) {
    throw new TypeError("Commission must be between 0 and 10000 basis points.");
  }
  return value;
}

export function calculateCommissionCents(bookPriceCents, commissionBasisPoints = DEFAULT_COMMISSION_BASIS_POINTS) {
  validCents(bookPriceCents, "Book price");
  validBasisPoints(commissionBasisPoints);
  return Math.floor((bookPriceCents * commissionBasisPoints + 5000) / 10000);
}

export function calculateEstimatedSellerProceeds({
  bookPriceCents,
  shippingCents,
  taxCents = 0,
  estimatedProcessingFeeCents,
  commissionBasisPoints = DEFAULT_COMMISSION_BASIS_POINTS,
}) {
  validCents(bookPriceCents, "Book price");
  validCents(shippingCents, "Shipping");
  validCents(taxCents, "Tax");
  validCents(estimatedProcessingFeeCents, "Estimated processing fee");
  const commissionCents = calculateCommissionCents(bookPriceCents, commissionBasisPoints);
  const sellerProceedsCents = bookPriceCents + shippingCents - commissionCents - estimatedProcessingFeeCents;
  if (sellerProceedsCents < 0) {
    throw new RangeError("The estimated seller proceeds cannot be negative.");
  }
  return {
    bookPriceCents,
    shippingCents,
    taxCents,
    buyerTotalCents: bookPriceCents + shippingCents + taxCents,
    commissionCents,
    estimatedProcessingFeeCents,
    sellerProceedsCents,
  };
}

export function calculateActualSellerProceeds({
  bookPriceCents,
  shippingCents,
  taxCents = 0,
  actualProcessingFeeCents,
  commissionBasisPoints = DEFAULT_COMMISSION_BASIS_POINTS,
}) {
  validCents(actualProcessingFeeCents, "Actual processing fee");
  return calculateEstimatedSellerProceeds({
    bookPriceCents,
    shippingCents,
    taxCents,
    estimatedProcessingFeeCents: actualProcessingFeeCents,
    commissionBasisPoints,
  });
}
