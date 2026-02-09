# Super Admin Pricing Management

Super admins can now manage subscription plan pricing directly from the admin dashboard.

## Features

✅ **View all subscription plans** with current pricing and features
✅ **Edit plan pricing** - Change monthly price
✅ **Manage features** - Add/remove features from each plan
✅ **Update descriptions** - Change plan descriptions
✅ **Toggle active status** - Enable/disable plans
✅ **Real-time updates** - Changes apply immediately to all new signups

## Accessing Pricing Management

1. Log in as super admin (`super_admin@photolab.com`)
2. Navigate to `/super-admin` (Super Admin Dashboard)
3. Click **"💰 Manage Pricing"** button
4. Or go directly to `/super-admin-pricing`

## How to Edit a Plan

1. Click **"Edit Pricing"** on any plan card
2. Modify:
   - **Monthly Price** ($) - Update the subscription cost
   - **Description** - Change the plan tagline
   - **Features** - Add new features or remove existing ones
   - **Active** - Toggle to enable/disable the plan
3. Click **"Save"** to apply changes
4. Click **"Cancel"** to discard changes

## Adding/Removing Features

### Add Feature
1. In edit mode, enter feature text in the input field
2. Click **"Add"** or press **Enter**
3. Feature appears in the list below

### Remove Feature
1. Click **"Remove"** next to the feature
2. Feature is deleted from the list

### Example Features
- "Unlimited albums"
- "Advanced photo editing"
- "24/7 premium support"
- "Custom watermarks"
- "API access"

## API Endpoints

### Get All Plans
```bash
GET /api/subscription-plans

Response: Array of plan objects with pricing and features
```

### Get Single Plan
```bash
GET /api/subscription-plans/:planId

Response: Single plan object
```

### Update Plan (Super Admin Only)
```bash
PATCH /api/subscription-plans/:planId
Authorization: Bearer <token>
Content-Type: application/json

Body:
{
  "monthly_price": 99,
  "description": "Updated description",
  "features": ["Feature 1", "Feature 2"],
  "is_active": true
}

Response: Updated plan object with success message
```

## Plan Structure

```javascript
{
  id: "basic" | "professional" | "enterprise",
  name: "Plan Name",
  description: "Plan description",
  monthly_price: 29,
  max_albums: 5,
  max_storage_gb: 50,
  features: ["Feature 1", "Feature 2"],
  is_active: true
}
```

## Security

- ✅ Only super admins can update pricing
- ✅ Requires valid JWT token
- ✅ All changes are logged and auditable
- ✅ Price validation (must be >= 0)

## What Happens When You Update Pricing

1. **Existing subscriptions** - Not affected
2. **New signups** - Use new pricing immediately
3. **Studio admins** - Will see updated prices in their upgrade options
4. **Stripe** - You'll need to manually update Stripe products if prices change significantly

## Best Practices

1. **Test changes first** - Use test/staging before updating production
2. **Update features wisely** - Clear descriptions help customers understand value
3. **Price strategically** - Consider market rates and your costs
4. **Monitor signups** - Track which plans are most popular
5. **Synchronize with Stripe** - Update Stripe pricing separately if needed

## Examples

### Set Starter Plan at $9.99/month
1. Go to Pricing Management
2. Click "Edit Pricing" on Starter
3. Change monthly_price to 9.99
4. Click Save

### Add Enterprise Features
1. Edit Enterprise plan
2. Add features:
   - "Dedicated account manager"
   - "SLA guarantee"
   - "Custom integrations"
3. Click Save

### Disable a Plan (Temporarily)
1. Edit the plan
2. Uncheck "Active" checkbox
3. Save
4. Plan no longer appears in signup/upgrade flows

## Troubleshooting

**Changes not showing up?**
- Make sure you're logged in as super_admin
- Verify the token hasn't expired
- Check browser console for errors
- Refresh the page

**Can't edit a plan?**
- Verify you have super_admin role
- Check that the plan ID exists
- Look for error messages displayed

**Price changes not affecting checkout?**
- Frontend caches plans on page load
- Refresh studio signup/upgrade pages
- New browser sessions will see new pricing

## Future Enhancements

- 🔄 Sync pricing with Stripe automatically
- 📊 Price history and change logs
- 💰 Per-studio custom pricing
- 🔔 Email notifications on price changes
- 📈 Analytics on plan popularity
