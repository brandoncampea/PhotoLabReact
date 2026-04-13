// Centralized profit calculation logic for orders and studios

function calculateOrderProfit({ items, stripeFeeAmount = 0, subscriptionRevenue = 0 }) {
  let studioRevenue = 0;
  let baseRevenue = 0;
  let productionCost = 0;
  let grossStudioMarkup = 0;
  let superAdminProfit = 0;
  let studioProfit = 0;

  for (const item of items) {
    const price = Number(item.price) || 0;
    const basePrice = Number(item.basePrice) || 0;
    const cost = Number(item.cost) || 0;
    const qty = Number(item.quantity) || 0;
    studioRevenue += price * qty;
    baseRevenue += basePrice * qty;
    productionCost += cost * qty;
    superAdminProfit += (basePrice - cost) * qty;
  }
  grossStudioMarkup = studioRevenue - baseRevenue;
  studioProfit = grossStudioMarkup - stripeFeeAmount;
  superAdminProfit += subscriptionRevenue;

  return {
    studioRevenue,
    baseRevenue,
    productionCost,
    grossStudioMarkup,
    stripeFeeAmount,
    studioProfit,
    superAdminProfit,
  };
}

module.exports = {
  calculateOrderProfit,
};
