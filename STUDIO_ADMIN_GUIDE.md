# Studio Admin Subscription Management

## Overview
Studio admins can now manage their subscription directly from the unified `/admin/dashboard` page. The studio admin functionality has been fully integrated with the regular admin interface.

## How to Access Subscription Management

1. **Log In as Studio Admin**
   - Go to: `http://localhost:3000/admin/login`
   - Email: Your studio admin email (e.g., `studioowner@example.com`)
   - Password: Your studio admin password

2. **View Dashboard**
   - You'll be redirected to `/admin/dashboard`
   - Scroll down to the **"📋 Subscription Status"** section
   - This shows your current subscription plan and renewal information

## Subscription Information Displayed

The dashboard shows:
- **Current Plan**: Your active subscription plan (e.g., "Professional")
- **Price**: Monthly or yearly pricing based on your billing cycle
- **Status**: Whether your subscription is active or pending cancellation
- **Renewal Date**: When your next billing cycle starts

## Managing Your Subscription

### Cancel Subscription
1. Click the **"Cancel Subscription"** button (red button)
2. Confirm the cancellation when prompted
3. Your subscription will remain **active until the renewal date**
4. After renewal date, you'll revert to the free tier

### Reactivate Subscription
1. If you've scheduled a cancellation, you'll see a warning banner
2. Click **"✓ Reactivate Subscription"** to cancel the cancellation request
3. Your subscription will continue to renew automatically

## Role-Based Permissions

| Action | Studio Admin | Regular Admin |
|--------|-------------|---|
| View subscription status | ✅ Yes | ✅ Yes (read-only) |
| Cancel subscription | ✅ Yes | ❌ No |
| Reactivate subscription | ✅ Yes | ❌ No |
| Manage studio albums | ✅ Yes | ✅ Yes |
| View studio orders | ✅ Yes | ✅ Yes |

## Common Questions

### Q: Can I access both dashboards?
**A:** No, there is only one unified dashboard at `/admin/dashboard`. Both studio admins and regular admins use the same interface. The subscription management features are only visible to studio admins.

### Q: Will I lose access if my subscription is cancelled?
**A:** No! Your studio will continue to have full access until your renewal date. After the renewal date passes, you'll revert to free-tier functionality.

### Q: Where's the old `/studio-admin` page?
**A:** It has been deprecated and merged into `/admin/dashboard`. All traffic to `/studio-admin` is automatically redirected to the new unified dashboard.

### Q: What happens if I'm a regular admin, can I see subscriptions?
**A:** Yes, you can view your studio's subscription status in read-only mode. Only studio admins (studio owners) can cancel or reactivate subscriptions.

## Technical Details

- **Backend Endpoint**: `GET /api/studios/:studioId/subscription`
- **Authentication**: JWT token stored in `localStorage.authToken`
- **Permissions**: Requires either `studio_admin` or `admin` role for your studio

## Troubleshooting

### I don't see the subscription section
1. Make sure you're logged in as a `studio_admin` (studio owner)
2. Check browser console (F12) for any API errors
3. Verify the backend server is running on `http://localhost:3001`

### The subscription shows as inactive
1. Go to `http://localhost:3001/super-admin` as a super admin
2. Edit your studio subscription manually
3. Or contact your platform administrator

