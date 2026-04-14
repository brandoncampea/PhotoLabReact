import api from './api';

export const updateStripeFee = async (orderId: string) => {
  // PATCH to backend to update Stripe fee for the given order
  const response = await api.patch(`/orders/update-stripe-fee/${orderId}`);
  return response.data;
};
