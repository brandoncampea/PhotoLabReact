# Variant Pricing Fix - Deployment Checklist

## Pre-Deployment Verification

### Code Quality
- [x] TypeScript compilation passes
- [x] No linting errors
- [x] Vite build successful
- [x] No JavaScript syntax errors
- [x] Code review ready

### Functionality
- [x] Variant detection logic correct
- [x] Database query syntax valid
- [x] Fallback logic in place
- [x] Null checks on all values
- [x] Logging added for debugging

### Backward Compatibility
- [x] Non-variant products unaffected
- [x] Existing orders immutable
- [x] Default pricing fallback works
- [x] No breaking changes
- [x] Rollback simple

### Documentation
- [x] Technical explanation written
- [x] Test plan created
- [x] Code changes documented
- [x] Visual guides created
- [x] API flows documented

## Testing Before Deployment

### Staging Environment
- [ ] Deploy code to staging
- [ ] Create test orders with variants
- [ ] Verify calculations in database
- [ ] Check server logs for variant pricing
- [ ] Test non-variant products still work
- [ ] Verify variant cost used in calculations

### Example Test Case
```
Product: "Premium Print 8x10"
Variants:
- Lustre Finish: base_cost $2.50, price $8.00
- Matte Finish: base_cost $3.00, price $9.00

Test Order:
1. Add photo with Lustre Finish, qty 2 @ $8.00 each = $16.00
   Expected: base_revenue_amount = $2.50 * 2 = $5.00
             studio_payout = $16.00 - $5.00 = $11.00

2. Add same photo with Matte Finish, qty 1 @ $9.00
   Expected: base_revenue_amount = $3.00 * 1 = $3.00
             studio_payout = $9.00 - $3.00 = $6.00
```

### Verification Queries
```sql
-- For test order above
SELECT 
  oi.id,
  oi.price * oi.quantity as total_revenue,
  oi.base_revenue_amount,
  oi.studio_payout_amount,
  oi.super_admin_share_amount
FROM order_items oi
WHERE oi.order_id = <test_order_id>
ORDER BY oi.id;

-- Expected results:
-- id | total_revenue | base_revenue | studio_payout | super_admin_share
-- 1  |     16.00     |    5.00      |    11.00      |      5.00
-- 2  |      9.00     |    3.00      |     6.00      |      3.00
```

## Deployment Steps

### 1. Pre-Deployment
- [ ] Backup database
- [ ] Notify support team
- [ ] Prepare rollback procedure
- [ ] Have DBA on standby

### 2. Code Deployment
```bash
# Pull latest code
git pull origin main

# Verify build
npm run build

# Check for errors
npm run lint

# Deploy to production
# (Your deployment process)
```

### 3. Post-Deployment
- [ ] Monitor server logs for errors
- [ ] Check for `[ORDER ITEM VARIANT PRICING]` logs
- [ ] Monitor order creation rate
- [ ] Check error rate in monitoring

### 4. Verification
- [ ] Create test orders with variants
- [ ] Verify calculations in database
- [ ] Spot-check 10 random orders
- [ ] Verify financial reports

## Rollback Procedure

If issues are discovered:

### Immediate Actions
1. **Stop accepting new orders** (if critical)
2. **Revert code**:
   ```bash
   git revert <commit_hash>
   npm run build
   # Deploy revert
   ```

### Recovery Steps
1. Revert changes to `server/routes/orders.js`
2. Rebuild and redeploy
3. All new orders will use default pricing
4. Existing orders unaffected

### Communication
- [ ] Notify stakeholders
- [ ] Update status page
- [ ] Document issue
- [ ] Plan remediation

## Monitoring & Alerts

### What to Monitor
- Order creation success rate
- Server error logs
- Database query performance
- Variant pricing log frequency
- Revenue calculations accuracy

### Alert Thresholds
- [ ] Order creation failures > 5%
- [ ] Server errors > 100/hour
- [ ] Query time > 100ms
- [ ] No variant pricing logs (check if variant products ordered)

## Post-Deployment Validation

### Day 1
- [ ] Monitor error logs
- [ ] Verify order creation working
- [ ] Check 20 random orders
- [ ] Verify calculations correct
- [ ] No customer complaints

### Week 1
- [ ] Monitor variant order creation
- [ ] Spot-check financial reports
- [ ] Verify studio payouts correct
- [ ] Check admin dashboard
- [ ] Get feedback from studios

### Ongoing
- [ ] Monthly revenue verification
- [ ] Quarterly financial audit
- [ ] Regular log review
- [ ] Performance monitoring

## Success Indicators

### Technical
✅ No errors in server logs
✅ Order creation success rate > 99.5%
✅ Variant pricing logs appearing
✅ Database queries fast (<10ms)

### Functional
✅ Orders with variants created successfully
✅ Studio payout calculations correct
✅ Non-variant products unaffected
✅ All financial reports accurate

### Business
✅ Studios report correct payouts
✅ Financial team reports accuracy
✅ No customer complaints about pricing
✅ Orders process normally

## Sign-Off Checklist

### Code Review
- [ ] Lead developer reviewed code
- [ ] Approved for deployment
- [ ] No concerns raised

### QA Testing
- [ ] QA team verified functionality
- [ ] Test cases passed
- [ ] Edge cases handled

### Product Owner
- [ ] Stakeholder aware of changes
- [ ] Approved for production
- [ ] Communication plan ready

### Deployment Team
- [ ] Deployment procedure ready
- [ ] Rollback plan verified
- [ ] Monitoring configured
- [ ] Team trained

## Deployment Authorization

**Code Change**: Variant Pricing Fix
**File Modified**: server/routes/orders.js
**Risk Level**: LOW
**Rollback Risk**: LOW (easy revert)
**Backward Compatible**: YES

**Approved By**: ___________________
**Date**: ___________________
**Deployed By**: ___________________
**Deployment Time**: ___________________

## Post-Deployment Sign-Off

**Deployment Status**: ☐ SUCCESSFUL  ☐ ISSUES FOUND  ☐ ROLLED BACK

**Issues Found** (if any): 
_________________________________________________________________

**Resolution**:
_________________________________________________________________

**Verified By**: ___________________
**Date**: ___________________
**Time**: ___________________

---

## Quick Reference

### If Something Goes Wrong
1. Check server logs for errors
2. Verify database connection
3. Check if variant products are ordered
4. Review sample order calculations
5. Examine console logs for `[ORDER ITEM VARIANT PRICING]`
6. If all else fails, execute rollback procedure

### Contact
- **Database Issues**: DBA on call
- **Server Issues**: DevOps on call
- **Business Questions**: Product owner
- **Financial Issues**: Finance team

### Additional Resources
- VARIANT_PRICING_FIX.md - Technical details
- VARIANT_PRICING_TEST_PLAN.md - Testing procedures
- CODE_CHANGE_REFERENCE.md - Code changes
- VARIANT_PRICING_VISUAL_GUIDE.md - Visual explanations
