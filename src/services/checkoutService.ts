import { roesService } from './roesService';
import { whccService } from './whccService';
import { mpixService } from './mpixService';

export interface CheckoutRequest {
  customer: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    address?: {
      addr1: string;
      addr2?: string;
      city: string;
      state: string;
      zip: string;
      country?: string;
    };
  };
  cartItems: any[];
  shippingAddress?: any;
  notes?: string;
}

/**
 * Handles checkout flow with WHCC, ROES, or standard backend
 * Routes based on which service is enabled
 */
export async function processCheckout(request: CheckoutRequest): Promise<any> {
  if (!request.customer.email) {
    throw new Error('Customer email is required');
  }

  if (!request.cartItems || request.cartItems.length === 0) {
    throw new Error('Cart is empty');
  }

  try {
    // Check which service is enabled (priority: WHCC > Mpix > ROES > standard)
    const whccEnabled = whccService.isEnabled();
    const mpixEnabled = mpixService.isEnabled();
    const roesEnabled = roesService.isEnabled();

    if (whccEnabled) {
      return await processWhccCheckout(request);
    } else if (mpixEnabled) {
      return await processMpixCheckout(request);
    } else if (roesEnabled) {
      return await processRoesCheckout(request);
    } else {
      return await processStandardCheckout(request);
    }
  } catch (error) {
    console.error('Checkout error:', error);
    throw error;
  }
}

/**
 * Process checkout through WHCC
 */
async function processWhccCheckout(request: CheckoutRequest): Promise<any> {
  whccService.logEvent('checkout_initiated', { method: 'whcc' });

  try {
    const orderId = `order-${Date.now()}`;
    const result = await whccService.submitCompleteOrder(
      request.cartItems,
      request.customer,
      orderId
    );

    whccService.logEvent('checkout_completed', {
      method: 'whcc',
      confirmationId: result.confirmationId,
      total: result.total,
    });

    return {
      success: true,
      provider: 'whcc',
      orderId: result.confirmationId,
      confirmationId: result.confirmationId,
      total: result.total,
      message: 'Order submitted to WHCC',
      ...result,
    };
  } catch (error) {
    whccService.logEvent('checkout_failed', { error: String(error) });
    throw error;
  }
}

/**
 * Process checkout through ROES
 */
async function processRoesCheckout(request: CheckoutRequest): Promise<any> {
  roesService.logEvent('checkout_initiated', { method: 'roes' });
  try {
    const roesPayload = roesService.convertCartToRoesOrder(
      request.cartItems,
      request.customer
    );
    
    if (request.notes) {
      roesPayload.notes = request.notes;
    }

    const response = await roesService.submitOrderThroughBackend(roesPayload);
    
    roesService.logEvent('checkout_completed', {
      method: 'roes',
      orderId: response.orderId,
      status: response.status,
    });
    
    return {
      success: true,
      provider: 'roes',
      ...response,
    };
  } catch (error) {
    roesService.logEvent('checkout_failed', { error: String(error) });
    throw error;
  }
}

/**
 * Process checkout through Mpix
 */
async function processMpixCheckout(request: CheckoutRequest): Promise<any> {
  try {
    const shippingAddress = {
      fullName: `${request.customer.firstName} ${request.customer.lastName}`,
      email: request.customer.email,
      phone: request.customer.phone,
      ...request.shippingAddress,
    };

    const response = await mpixService.submitCompleteOrder(
      request.cartItems,
      shippingAddress
    );

    if (!response.success) {
      throw new Error(response.message || 'Mpix order submission failed');
    }

    mpixService.logEvent('checkout_completed', {
      method: 'mpix',
      orderId: response.orderId,
      status: 'submitted',
    });

    return {
      success: true,
      provider: 'mpix',
      orderId: response.orderId,
      message: response.message,
    };
  } catch (error) {
    mpixService.logEvent('checkout_failed', { error: String(error) });
    throw error;
  }
}

/**
 * Process checkout through standard backend
 */
async function processStandardCheckout(request: CheckoutRequest): Promise<any> {
  try {
    const response = await submitOrderThroughStandardBackend(request);

    console.log('checkout_completed', {
      method: 'standard',
      orderId: response.orderId,
      status: response.status,
    });

    return {
      success: true,
      provider: 'standard',
      ...response,
    };
  } catch (error) {
    console.error('checkout_failed', { error: String(error) });
    throw error;
  }
}

/**
 * Submit order through standard backend endpoint
 * Replace /orders/submit with your actual endpoint
 */
async function submitOrderThroughStandardBackend(request: CheckoutRequest): Promise<any> {
  // Import api from your services
  const api = (await import('./api')).default;

  const response = await api.post('/orders/submit', {
    customer: request.customer,
    items: request.cartItems,
    shippingAddress: request.shippingAddress,
    notes: request.notes,
    timestamp: new Date().toISOString(),
  });

  return response.data;
}

/**
 * Hook-friendly checkout function
 * Use in your checkout component
 */
export function useCheckout() {
  const handleCheckout = async (request: CheckoutRequest) => {
    try {
      const result = await processCheckout(request);
      return { success: true, data: result };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  };

  return { handleCheckout };
}
