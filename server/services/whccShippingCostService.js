const DESTINATION_LABELS = {
  LOWER_48: 'DS Lower 48',
  ALASKA: 'DS Alaska',
  HAWAII: 'DS Hawaii',
  MILITARY: 'Military',
  PO_BOX: 'PO Box',
  US_TERRITORIES: 'US Territories',
  CANADA: 'Canada',
  INTERNATIONAL: 'International',
};

const DROP_SHIP_LOWEST_COST_PRODUCT_GROUP = 'Drop Ship Lowest Cost';

// Derived from "WHCC Shipping Rubric.xlsx" using only
// the "Drop Ship Lowest Cost" rules by destination.
const DROP_SHIP_LOWEST_COSTS = {
  [DESTINATION_LABELS.LOWER_48]: 9.95,
  [DESTINATION_LABELS.ALASKA]: 16.4425,
  [DESTINATION_LABELS.HAWAII]: 17.4425,
  [DESTINATION_LABELS.MILITARY]: 9.95,
  [DESTINATION_LABELS.PO_BOX]: 9.95,
  [DESTINATION_LABELS.US_TERRITORIES]: 2.0,
  [DESTINATION_LABELS.CANADA]: 10.945,
  [DESTINATION_LABELS.INTERNATIONAL]: 9.95,
};

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const roundCurrency = (value) => Math.round((toNumber(value, 0) + Number.EPSILON) * 100) / 100;

const normalize = (value) => String(value || '').trim().toUpperCase();

const isPoBox = (addressLine1, addressLine2) => {
  const line = `${String(addressLine1 || '')} ${String(addressLine2 || '')}`.toUpperCase();
  return /\bP\.?\s*O\.?\s*BOX\b/.test(line) || /\bPOST\s+OFFICE\s+BOX\b/.test(line);
};

const isMilitaryAddress = (city, state, zipCode) => {
  const cityNorm = normalize(city);
  const stateNorm = normalize(state);
  if (['APO', 'FPO', 'DPO'].includes(cityNorm)) return true;
  if (['AE', 'AA', 'AP'].includes(stateNorm)) return true;
  return false;
};

const isUsTerritory = (state) => ['PR', 'GU', 'VI', 'AS', 'MP'].includes(normalize(state));

const normalizeCountry = (country) => {
  const c = String(country || '').trim().toUpperCase();
  if (!c) return 'US';
  if (['US', 'USA', 'UNITED STATES', 'UNITED STATES OF AMERICA'].includes(c)) return 'US';
  if (['CA', 'CANADA'].includes(c)) return 'CA';
  return c;
};

export const classifyDestinationFromAddress = (address = {}) => {
  const country = normalizeCountry(address.country);
  const state = normalize(address.state);

  if (country === 'US') {
    if (isMilitaryAddress(address.city, state, address.zipCode)) return DESTINATION_LABELS.MILITARY;
    if (isPoBox(address.addressLine1, address.addressLine2)) return DESTINATION_LABELS.PO_BOX;
    if (isUsTerritory(state)) return DESTINATION_LABELS.US_TERRITORIES;
    if (state === 'AK') return DESTINATION_LABELS.ALASKA;
    if (state === 'HI') return DESTINATION_LABELS.HAWAII;
    return DESTINATION_LABELS.LOWER_48;
  }

  if (country === 'CA') return DESTINATION_LABELS.CANADA;
  return DESTINATION_LABELS.INTERNATIONAL;
};

export const resolveWhccProductGroup = (productCategories = []) => {
  return DROP_SHIP_LOWEST_COST_PRODUCT_GROUP;
};

export const lookupWhccRubricCost = ({ productGroup, destinationLabel }) => {
  const directHit = DROP_SHIP_LOWEST_COSTS[destinationLabel];
  if (Number.isFinite(directHit)) return roundCurrency(directHit);

  return roundCurrency(DROP_SHIP_LOWEST_COSTS[DESTINATION_LABELS.LOWER_48]);
};

export const calculateWhccShippingQuote = ({
  shippingOption,
  destinationAddress,
  productCategories,
  studioConfig,
}) => {
  const destinationLabel = classifyDestinationFromAddress(destinationAddress || {});
  const productGroup = DROP_SHIP_LOWEST_COST_PRODUCT_GROUP;
  const whccShippingCost = lookupWhccRubricCost({ productGroup, destinationLabel });

  const directPricingMode = String(studioConfig?.directPricingMode || 'flat_fee').toLowerCase() === 'flat_fee'
    ? 'flat_fee'
    : 'pass_through';

  const flatFee = toNumber(
    studioConfig?.directFlatFee,
    toNumber(studioConfig?.directShippingCharge, whccShippingCost)
  );

  const isBatch = shippingOption === 'batch';
  const customerShippingCost = isBatch
    ? 0
    : directPricingMode === 'flat_fee'
      ? roundCurrency(flatFee)
      : roundCurrency(whccShippingCost);

  const studioShippingCost = roundCurrency(whccShippingCost);
  const studioShippingDelta = roundCurrency(customerShippingCost - studioShippingCost);

  return {
    shippingOption: isBatch ? 'batch' : 'direct',
    destinationLabel,
    productGroup,
    whccShippingCost: roundCurrency(whccShippingCost),
    customerShippingCost,
    studioShippingCost,
    studioShippingDelta,
    directPricingMode,
    directFlatFee: roundCurrency(flatFee),
    rubricSource: 'WHCC Shipping Rubric.xlsx',
  };
};

export const getWhccRubricSummary = () => ({
  source: 'WHCC Shipping Rubric.xlsx',
  matrix: {
    [DROP_SHIP_LOWEST_COST_PRODUCT_GROUP]: DROP_SHIP_LOWEST_COSTS,
  },
  destinations: DESTINATION_LABELS,
});
