import { test, expect } from '@playwright/test';

// These tests assume the backend is running in WHCC sandbox mode and the API is reachable
// Adjust endpoints and payloads as needed for your environment

test.describe('WHCC Integration', () => {
  test('should create a customer order and send to WHCC', async ({ request }) => {
    // Simulate placing an order as a customer
    const loginRes = await request.post('/api/auth/login', {
      data: { email: 'playwright@example.com', password: 'playwrightpass' },
    });
    expect(loginRes.ok()).toBeTruthy();
    const cookies = loginRes.headers()['set-cookie'];

    // Add item to cart
    const addRes = await request.post('/api/cart/add', {
      data: { productId: 1, quantity: 1 },
      headers: { cookie: cookies },
    });
    expect(addRes.ok()).toBeTruthy();

    // Place order
    const orderRes = await request.post('/api/orders', {
      headers: { cookie: cookies },
    });
    expect(orderRes.ok()).toBeTruthy();
    const order = await orderRes.json();
    expect(order).toHaveProperty('whccOrderId');
    expect(order.whccStatus).toMatch(/submitted|processing|received/);
  });

  test('should fetch WHCC product list', async ({ request }) => {
    // Login and use cookie for authenticated request
    const loginRes = await request.post('/api/auth/login', {
      data: { email: 'playwright@example.com', password: 'playwrightpass' },
    });
    expect(loginRes.ok()).toBeTruthy();
    const cookies = loginRes.headers()['set-cookie'];
    const res = await request.get('/api/whcc/products', {
      headers: { cookie: cookies },
    });
    expect(res.ok()).toBeTruthy();
    const products = await res.json();
    expect(Array.isArray(products)).toBeTruthy();
    expect(products.length).toBeGreaterThan(0);
  });

  test('should get WHCC order status', async ({ request }) => {
    // Login and use cookie for authenticated request
    const loginRes = await request.post('/api/auth/login', {
      data: { email: 'playwright@example.com', password: 'playwrightpass' },
    });
    expect(loginRes.ok()).toBeTruthy();
    const cookies = loginRes.headers()['set-cookie'];
    // This assumes you have a test orderId from a previous test or fixture
    const testOrderId = 1;
    const res = await request.get(`/api/orders/${testOrderId}/status`, {
      headers: { cookie: cookies },
    });
    expect(res.ok()).toBeTruthy();
    const status = await res.json();
    expect(status).toHaveProperty('whccStatus');
  });

  test('should handle WHCC sandbox error', async ({ request }) => {
    // Simulate a known error scenario (e.g., invalid product)
    const res = await request.post('/api/orders', {
      data: { productId: -1 },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });
});
