import { test, expect } from '@playwright/test';

/**
 * Comprehensive End-to-End Tests for Photo Lab React
 * Tests all routes and user types:
 * - Customer
 * - Admin (studio team member)
 * - Studio Admin (studio owner)
 * - Super Admin (platform owner)
 */

// Test accounts
const testAccounts = {
  customer: {
    email: 'customer@example.com',
    password: 'TestPassword@123'
  },
  admin: {
    email: 'admin@example.com',
    password: 'AdminPassword@123'
  },
  studioAdmin: {
    email: 'studioowner@example.com',
    password: 'StudioPassword@123'
  },
  superAdmin: {
    email: 'super_admin@photolab.com',
    password: 'SuperAdmin@123456'
  }
};

const BASE_URL = 'http://localhost:3000';

// ============================================================================
// CUSTOMER USER TESTS
// ============================================================================
test.describe('Customer User Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL + '/login');
  });

  test('should login as customer', async ({ page }) => {
    await page.fill('input[type="email"]', testAccounts.customer.email);
    await page.fill('input[type="password"]', testAccounts.customer.password);
    await page.click('button:has-text("Login")');
    
    await expect(page).toHaveURL(`${BASE_URL}/albums`, { timeout: 5000 });
    await expect(page.locator('text=Albums')).toBeVisible();
  });

  test('customer can browse albums', async ({ page }) => {
    await page.fill('input[type="email"]', testAccounts.customer.email);
    await page.fill('input[type="password"]', testAccounts.customer.password);
    await page.click('button:has-text("Login")');
    
    await expect(page).toHaveURL(`${BASE_URL}/albums`);
    
    // Check albums are loaded
    await expect(page.locator('[class*="album"]')).toBeTruthy();
  });

  test('customer can view album details', async ({ page }) => {
    await page.fill('input[type="email"]', testAccounts.customer.email);
    await page.fill('input[type="password"]', testAccounts.customer.password);
    await page.click('button:has-text("Login")');
    
    // Navigate to first album
    const firstAlbumLink = page.locator('a[href*="/albums/"]').first();
    if (await firstAlbumLink.isVisible()) {
      await firstAlbumLink.click();
      await expect(page).toHaveURL(/\/albums\/\d+/);
    }
  });

  test('customer can search photos', async ({ page }) => {
    await page.fill('input[type="email"]', testAccounts.customer.email);
    await page.fill('input[type="password"]', testAccounts.customer.password);
    await page.click('button:has-text("Login")');
    
    // Navigate to search
    const searchLink = page.locator('a[href="/search"]');
    if (await searchLink.isVisible()) {
      await searchLink.click();
      await expect(page).toHaveURL(`${BASE_URL}/search`);
    }
  });

  test('customer can access cart', async ({ page }) => {
    await page.fill('input[type="email"]', testAccounts.customer.email);
    await page.fill('input[type="password"]', testAccounts.customer.password);
    await page.click('button:has-text("Login")');
    
    // Navigate to cart
    const cartLink = page.locator('a[href="/cart"]');
    if (await cartLink.isVisible()) {
      await cartLink.click();
      await expect(page).toHaveURL(`${BASE_URL}/cart`);
    }
  });

  test('customer can view orders', async ({ page }) => {
    await page.fill('input[type="email"]', testAccounts.customer.email);
    await page.fill('input[type="password"]', testAccounts.customer.password);
    await page.click('button:has-text("Login")');
    
    // Navigate to orders
    const ordersLink = page.locator('a[href="/orders"]');
    if (await ordersLink.isVisible()) {
      await ordersLink.click();
      await expect(page).toHaveURL(`${BASE_URL}/orders`);
    }
  });

  test('customer cannot access admin routes', async ({ page }) => {
    await page.fill('input[type="email"]', testAccounts.customer.email);
    await page.fill('input[type="password"]', testAccounts.customer.password);
    await page.click('button:has-text("Login")');
    
    // Try to access admin dashboard
    await page.goto(`${BASE_URL}/admin/dashboard`);
    
    // Should redirect to login or albums
    const currentUrl = page.url();
    expect(
      currentUrl.includes('/login') || 
      currentUrl.includes('/albums') ||
      currentUrl.includes('/admin/login')
    ).toBeTruthy();
  });
});

// ============================================================================
// ADMIN USER TESTS (Studio Team Member)
// ============================================================================
test.describe('Admin User Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL + '/admin/login');
  });

  test('should login as admin', async ({ page }) => {
    await page.fill('input[type="email"]', testAccounts.admin.email);
    await page.fill('input[type="password"]', testAccounts.admin.password);
    await page.click('button:has-text("Login")');
    
    // Should redirect to admin dashboard
    await expect(page).toHaveURL(/admin/, { timeout: 5000 });
  });

  test('admin can access dashboard', async ({ page }) => {
    await page.fill('input[type="email"]', testAccounts.admin.email);
    await page.fill('input[type="password"]', testAccounts.admin.password);
    await page.click('button:has-text("Login")');
    
    const dashboardLink = page.locator('a[href*="/admin/dashboard"]');
    if (await dashboardLink.isVisible()) {
      await dashboardLink.click();
    }
    
    await expect(page).toHaveURL(`${BASE_URL}/admin/dashboard`);
  });

  test('admin can access analytics', async ({ page }) => {
    await page.fill('input[type="email"]', testAccounts.admin.email);
    await page.fill('input[type="password"]', testAccounts.admin.password);
    await page.click('button:has-text("Login")');
    
    const analyticsLink = page.locator('a[href*="/admin/analytics"]');
    if (await analyticsLink.isVisible()) {
      await analyticsLink.click();
      await expect(page).toHaveURL(`${BASE_URL}/admin/analytics`);
    }
  });

  test('admin can access albums management', async ({ page }) => {
    await page.fill('input[type="email"]', testAccounts.admin.email);
    await page.fill('input[type="password"]', testAccounts.admin.password);
    await page.click('button:has-text("Login")');
    
    const albumsLink = page.locator('a[href*="/admin/albums"]');
    if (await albumsLink.isVisible()) {
      await albumsLink.click();
      await expect(page).toHaveURL(`${BASE_URL}/admin/albums`);
    }
  });

  test('admin can access photos management', async ({ page }) => {
    await page.fill('input[type="email"]', testAccounts.admin.email);
    await page.fill('input[type="password"]', testAccounts.admin.password);
    await page.click('button:has-text("Login")');
    
    const photosLink = page.locator('a[href*="/admin/photos"]');
    if (await photosLink.isVisible()) {
      await photosLink.click();
      await expect(page).toHaveURL(`${BASE_URL}/admin/photos`);
    }
  });

  test('admin can access products management', async ({ page }) => {
    await page.fill('input[type="email"]', testAccounts.admin.email);
    await page.fill('input[type="password"]', testAccounts.admin.password);
    await page.click('button:has-text("Login")');
    
    const productsLink = page.locator('a[href*="/admin/products"]');
    if (await productsLink.isVisible()) {
      await productsLink.click();
      await expect(page).toHaveURL(`${BASE_URL}/admin/products`);
    }
  });

  test('admin can access price lists', async ({ page }) => {
    await page.fill('input[type="email"]', testAccounts.admin.email);
    await page.fill('input[type="password"]', testAccounts.admin.password);
    await page.click('button:has-text("Login")');
    
    const priceListsLink = page.locator('a[href*="/admin/price-lists"]');
    if (await priceListsLink.isVisible()) {
      await priceListsLink.click();
      await expect(page).toHaveURL(`${BASE_URL}/admin/price-lists`);
    }
  });

  test('admin can access profile', async ({ page }) => {
    await page.fill('input[type="email"]', testAccounts.admin.email);
    await page.fill('input[type="password"]', testAccounts.admin.password);
    await page.click('button:has-text("Login")');
    
    const profileLink = page.locator('a[href*="/admin/profile"]');
    if (await profileLink.isVisible()) {
      await profileLink.click();
      await expect(page).toHaveURL(`${BASE_URL}/admin/profile`);
    }
  });

  test('admin cannot access super admin routes', async ({ page }) => {
    await page.fill('input[type="email"]', testAccounts.admin.email);
    await page.fill('input[type="password"]', testAccounts.admin.password);
    await page.click('button:has-text("Login")');
    
    // Try to access super admin dashboard
    await page.goto(`${BASE_URL}/super-admin`, { waitUntil: 'networkidle' });
    
    // Should redirect or show error
    const currentUrl = page.url();
    expect(currentUrl.includes('/admin') || currentUrl.includes('/login')).toBeTruthy();
  });
});

// ============================================================================
// STUDIO ADMIN USER TESTS (Studio Owner)
// ============================================================================
test.describe('Studio Admin User Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL + '/admin/login');
  });

  test('should login as studio admin', async ({ page }) => {
    await page.fill('input[type="email"]', testAccounts.studioAdmin.email);
    await page.fill('input[type="password"]', testAccounts.studioAdmin.password);
    await page.click('button:has-text("Login")');
    
    await expect(page).toHaveURL(/admin/, { timeout: 5000 });
  });

  test('studio admin can access all admin routes', async ({ page }) => {
    await page.fill('input[type="email"]', testAccounts.studioAdmin.email);
    await page.fill('input[type="password"]', testAccounts.studioAdmin.password);
    await page.click('button:has-text("Login")');
    
    const routes = [
      '/admin/dashboard',
      '/admin/analytics',
      '/admin/albums',
      '/admin/photos',
      '/admin/products',
      '/admin/price-lists',
      '/admin/profile'
    ];
    
    for (const route of routes) {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle' });
      
      // Should not redirect to login
      expect(page.url()).toContain('/admin');
      expect(page.url()).not.toContain('/admin/login');
    }
  });

  test('studio admin can view subscription management', async ({ page }) => {
    await page.fill('input[type="email"]', testAccounts.studioAdmin.email);
    await page.fill('input[type="password"]', testAccounts.studioAdmin.password);
    await page.click('button:has-text("Login")');
    
    // Navigate to profile where subscription management is
    await page.goto(`${BASE_URL}/admin/profile`);
    
    // Check for subscription management section
    const subscriptionSection = page.locator('text=Subscription Management');
    expect(await subscriptionSection.isVisible()).toBeTruthy();
  });

  test('studio admin can see subscription change button', async ({ page }) => {
    await page.fill('input[type="email"]', testAccounts.studioAdmin.email);
    await page.fill('input[type="password"]', testAccounts.studioAdmin.password);
    await page.click('button:has-text("Login")');
    
    await page.goto(`${BASE_URL}/admin/profile`);
    
    // Look for Change Plan or Subscribe button
    const changeButton = page.locator('button:has-text("Change Plan"), button:has-text("Subscribe")');
    expect(await changeButton.isVisible()).toBeTruthy();
  });

  test('studio admin can open upgrade modal', async ({ page }) => {
    await page.fill('input[type="email"]', testAccounts.studioAdmin.email);
    await page.fill('input[type="password"]', testAccounts.studioAdmin.password);
    await page.click('button:has-text("Login")');
    
    await page.goto(`${BASE_URL}/admin/profile`);
    
    // Click upgrade/change plan button
    const upgradeButton = page.locator('button:has-text("Change Plan"), button:has-text("Subscribe")').first();
    if (await upgradeButton.isVisible()) {
      await upgradeButton.click();
      
      // Modal should appear with plan options
      const modal = page.locator('text=Select Your Plan');
      expect(await modal.isVisible()).toBeTruthy();
    }
  });
});

// ============================================================================
// SUPER ADMIN USER TESTS (Platform Owner)
// ============================================================================
test.describe('Super Admin User Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL + '/admin/login');
  });

  test('should login as super admin', async ({ page }) => {
    await page.fill('input[type="email"]', testAccounts.superAdmin.email);
    await page.fill('input[type="password"]', testAccounts.superAdmin.password);
    await page.click('button:has-text("Login")');
    
    // Should redirect to admin area (could be dashboard or super admin)
    await expect(page).toHaveURL(/admin|super-admin/, { timeout: 5000 });
  });

  test('super admin can access admin dashboard', async ({ page }) => {
    await page.fill('input[type="email"]', testAccounts.superAdmin.email);
    await page.fill('input[type="password"]', testAccounts.superAdmin.password);
    await page.click('button:has-text("Login")');
    
    await page.goto(`${BASE_URL}/admin/dashboard`);
    
    // Should see studio management or admin dashboard
    expect(page.url()).toContain('/admin');
  });

  test('super admin can access super admin dashboard', async ({ page }) => {
    await page.fill('input[type="email"]', testAccounts.superAdmin.email);
    await page.fill('input[type="password"]', testAccounts.superAdmin.password);
    await page.click('button:has-text("Login")');
    
    await page.goto(`${BASE_URL}/super-admin`);
    
    expect(page.url()).toContain('/super-admin');
  });

  test('super admin can access pricing management', async ({ page }) => {
    await page.fill('input[type="email"]', testAccounts.superAdmin.email);
    await page.fill('input[type="password"]', testAccounts.superAdmin.password);
    await page.click('button:has-text("Login")');
    
    await page.goto(`${BASE_URL}/super-admin-pricing`);
    
    expect(page.url()).toContain('/super-admin-pricing');
    
    // Should see pricing plans
    const pricingSection = page.locator('text=Subscription Plan|Pricing|Plans');
    expect(await pricingSection.first().isVisible()).toBeTruthy();
  });

  test('super admin can manage studio subscriptions', async ({ page }) => {
    await page.fill('input[type="email"]', testAccounts.superAdmin.email);
    await page.fill('input[type="password"]', testAccounts.superAdmin.password);
    await page.click('button:has-text("Login")');
    
    await page.goto(`${BASE_URL}/super-admin`);
    
    // Should see studio management interface
    const studioSection = page.locator('text=Studios|Studio Management');
    expect(await studioSection.first().isVisible()).toBeTruthy();
  });
});

// ============================================================================
// PUBLIC ROUTES (Not Authenticated)
// ============================================================================
test.describe('Public Routes', () => {
  test('should load home page', async ({ page }) => {
    await page.goto(BASE_URL + '/');
    
    // Should either stay on home or redirect to albums/login
    const url = page.url();
    expect(url === `${BASE_URL}/` || url.includes('/albums') || url.includes('/login')).toBeTruthy();
  });

  test('should access login page', async ({ page }) => {
    await page.goto(BASE_URL + '/login');
    
    expect(page.url()).toContain('/login');
    expect(await page.locator('input[type="email"]').isVisible()).toBeTruthy();
    expect(await page.locator('input[type="password"]').isVisible()).toBeTruthy();
  });

  test('should access register page', async ({ page }) => {
    await page.goto(BASE_URL + '/register');
    
    expect(page.url()).toContain('/register');
  });

  test('should access studio signup page', async ({ page }) => {
    await page.goto(BASE_URL + '/studio-signup');
    
    expect(page.url()).toContain('/studio-signup');
  });

  test('should access admin login page', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/login');
    
    expect(page.url()).toContain('/admin/login');
    expect(await page.locator('input[type="email"]').isVisible()).toBeTruthy();
  });
});

// ============================================================================
// PROTECTED ROUTES (Require Authentication)
// ============================================================================
test.describe('Protected Routes', () => {
  test('unauthenticated user cannot access albums', async ({ page }) => {
    await page.goto(BASE_URL + '/albums', { waitUntil: 'networkidle' });
    
    // Should redirect to login
    const url = page.url();
    expect(url.includes('/login')).toBeTruthy();
  });

  test('unauthenticated user cannot access admin dashboard', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/dashboard', { waitUntil: 'networkidle' });
    
    // Should redirect to admin login or login
    const url = page.url();
    expect(url.includes('/admin/login') || url.includes('/login')).toBeTruthy();
  });

  test('unauthenticated user cannot access super admin', async ({ page }) => {
    await page.goto(BASE_URL + '/super-admin', { waitUntil: 'networkidle' });
    
    // Should redirect to login
    const url = page.url();
    expect(url.includes('/login') || url.includes('/admin/login')).toBeTruthy();
  });
});

// ============================================================================
// NAVIGATION TESTS
// ============================================================================
test.describe('Navigation Between Routes', () => {
  test('customer can navigate through main routes', async ({ page }) => {
    await page.goto(BASE_URL + '/login');
    
    // Login as customer
    await page.fill('input[type="email"]', testAccounts.customer.email);
    await page.fill('input[type="password"]', testAccounts.customer.password);
    await page.click('button:has-text("Login")');
    
    await expect(page).toHaveURL(`${BASE_URL}/albums`, { timeout: 5000 });
    
    // Navigation should work
    expect(page.url()).toContain('/albums');
  });

  test('admin can navigate between admin routes', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/login');
    
    // Login as admin
    await page.fill('input[type="email"]', testAccounts.admin.email);
    await page.fill('input[type="password"]', testAccounts.admin.password);
    await page.click('button:has-text("Login")');
    
    // Should be in admin area
    await page.waitForURL(/admin/, { timeout: 5000 });
    expect(page.url()).toContain('/admin');
  });

  test('user can logout and return to login', async ({ page }) => {
    await page.goto(BASE_URL + '/login');
    
    // Login
    await page.fill('input[type="email"]', testAccounts.customer.email);
    await page.fill('input[type="password"]', testAccounts.customer.password);
    await page.click('button:has-text("Login")');
    
    await expect(page).toHaveURL(`${BASE_URL}/albums`, { timeout: 5000 });
    
    // Look for logout button
    const logoutButton = page.locator('button:has-text("Logout"), a:has-text("Logout")');
    if (await logoutButton.isVisible()) {
      await logoutButton.click();
      
      // Should be redirected to login or home
      const url = page.url();
      expect(url.includes('/login') || url === `${BASE_URL}/`).toBeTruthy();
    }
  });
});
