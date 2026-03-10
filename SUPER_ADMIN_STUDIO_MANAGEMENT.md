# Super Admin Studio Management Feature

## Overview

Super admins can now view and manage all studio admins across every studio in the platform. This feature allows platform administrators to:

- ✅ View all studio admins for each studio
- ✅ Create new studio admins for any studio  
- ✅ Delete studio admins (with protection against deleting the last admin)
- ✅ Assign roles (studio_admin or super_admin) to studio managers
- ✅ Be a studio admin themselves while maintaining super_admin privileges

## Key Features

### 1. **Super Admin Can Also Be Studio Admin**
A user with `super_admin` role can also have a studio assigned to them, allowing them to manage specific studios while maintaining platform-wide admin access.

### 2. **View All Studio Admins**
- Super admins can view a list of all admins for each studio
- Shows admin name, email, role, status, creation date, and last login
- Studio admins can only view their own studio's admins

### 3. **Create Studio Admins**
- Super admins can create new studio admins for any studio
- Each new admin gets a randomly generated temporary password
- Admins can be assigned either:
  - `studio_admin` - Can manage their assigned studio
  - `super_admin` - Can manage all studios and admins

### 4. **Delete Studio Admins**
- Super admins can delete any studio admin from any studio
- Protection: A studio must always have at least one admin
- Prevents accidental deletion of critical admin accounts

### 5. **Permissions & Security**
- Only super admins can access `/admin/studio-admins` page
- Only super admins can assign admin/super_admin roles to users
- Backend validates all permissions on each request
- Studio admins cannot promote users to admin roles

## Backend API Endpoints

### Get Studio Admins
```
GET /api/studios/:studioId/admins
Authorization: Bearer {token}
```
- **Super Admin**: Can view admins for any studio
- **Studio Admin**: Can only view admins for their own studio
- Returns: Array of admin objects with user details

### Create Studio Admin
```
POST /api/studios/:studioId/admins
Authorization: Bearer {token}
Content-Type: application/json

Body:
{
  "email": "admin@example.com",
  "name": "Admin Name",
  "role": "studio_admin" | "super_admin"
}
```
- **Super Admin**: Can create admins for any studio
- **Studio Admin**: Can only create admins for their own studio
- Returns: Created admin object with temporary password

### Delete Studio Admin
```
DELETE /api/studios/:studioId/admins/:userId
Authorization: Bearer {token}
```
- **Super Admin**: Can delete admins from any studio
- **Studio Admin**: Can delete admins from their own studio (not super_admin or last admin)
- Returns: Success message

## Frontend Pages & Components

### 1. **AdminStudioAdmins Component**
Location: `src/pages/admin/AdminStudioAdmins.tsx`

Features:
- Studio selector to browse all studios
- Form to create new studio admins
- Table view of all admins for selected studio
- Delete buttons with confirmation
- Success/error notifications
- Temporary password display on creation

UI Elements:
- Studio filter buttons at top
- Add New Admin form (collapsible)
- Admin list table with:
  - Name and email
  - Role badge (Studio Admin vs Super Admin)
  - Status badge (Active/Inactive)
  - Creation date and last login
  - Delete button

### 2. **AdminLayout Navigation**
Updated `src/components/AdminLayout.tsx` to include:
```
🏢 Studio Admins
```
Link to `/admin/studio-admins` (only visible to admins)

### 3. **AdminUsers Updates**
Updated `src/pages/admin/AdminUsers.tsx` to:
- Show error message if non-super-admin tries to assign admin roles
- Handle 403 permission errors from backend
- Alert user about permission restrictions

## Database Schema

The `users` table has these relevant columns:
```sql
CREATE TABLE users (
  id INT IDENTITY(1,1) PRIMARY KEY,
  email NVARCHAR(255) UNIQUE NOT NULL,
  password NVARCHAR(255) NOT NULL,
  name NVARCHAR(255) NOT NULL,
  role NVARCHAR(50) DEFAULT 'customer',
  is_active BIT DEFAULT 1,
  last_login_at DATETIME2,
  studio_id INT FOREIGN KEY REFERENCES studios(id),
  created_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
)
```

- `studio_id`: Links studio_admin users to their studio
- `role`: Can be 'customer', 'admin', 'studio_admin', or 'super_admin'
- Foreign key constraint ensures studio_id references existing studio

## User Roles & Permissions

### Customer
- Can browse and order photos
- No admin access

### Admin
- Full platform access (inherited from old system)
- Can view/manage users and studios

### Studio Admin
- Can manage their assigned studio
- Can manage studio team members (non-admin users)
- Can view studio subscription and fees
- CANNOT create or manage other studio admins or promote users to admin

### Super Admin
- Can manage ALL studios and studio admins
- Can create/delete studio admins
- Can assign admin roles to users
- Can optionally be assigned to a specific studio
- Can do everything a studio_admin can do for their assigned studio

## Usage Workflow

### For Super Admin Users:

1. **Navigate to Studio Admins**
   - Click "🏢 Studio Admins" in admin sidebar
   - Or go to `/admin/studio-admins`

2. **Select a Studio**
   - Click on any studio name button to view its admins

3. **View Current Admins**
   - See list of all admins for that studio
   - View their roles, status, and activity

4. **Add New Admin**
   - Click "Add New Admin" button
   - Fill in email, name, and select role
   - Click "Create Admin"
   - Save the temporary password (shown in success message)
   - Share credentials with the new admin

5. **Delete Admin**
   - Click "Delete" button next to admin
   - Confirm deletion
   - Admin is removed from system

### For Studio Admin Users:

- **Cannot access** `/admin/studio-admins` (redirected to dashboard)
- **Can access** AdminUsers page but cannot assign admin roles
- Can manage their own studio's team members through other pages

## Security Considerations

1. **Temporary Passwords**: New admins receive random 32-character hex passwords (very strong)
2. **Last Admin Protection**: Cannot delete the only admin in a studio
3. **Permission Checks**: All endpoints validate user permissions
4. **Role Restrictions**: Only super admins can assign admin/super_admin roles
5. **Studio Isolation**: Studio admins cannot access other studios' admins
6. **Foreign Key Constraints**: Database enforces studio_id references

## Testing the Feature

### Test Case 1: Super Admin Views All Studio Admins
1. Log in as super admin
2. Navigate to `/admin/studio-admins`
3. Select different studios
4. Verify admins are displayed correctly

### Test Case 2: Create New Studio Admin
1. Log in as super admin
2. Go to `/admin/studio-admins`
3. Select a studio
4. Click "Add New Admin"
5. Fill form and submit
6. Verify admin appears in list
7. Save temporary password

### Test Case 3: Super Admin Can Be Studio Admin
1. Assign a super_admin user to a studio_id
2. That user should see their studio data in StudioAdminDashboard
3. But still have access to super admin features

### Test Case 4: Delete Admin
1. Select studio with multiple admins
2. Click Delete on one admin
3. Confirm deletion
4. Verify admin removed from list

### Test Case 5: Cannot Delete Last Admin
1. Select studio with only 1 admin
2. Delete button should be disabled
3. Tooltip shows "Cannot delete the last admin"

### Test Case 6: Studio Admin Cannot Promote Users
1. Log in as studio_admin (not super_admin)
2. Go to `/admin/users`
3. Try to change user role to studio_admin
4. Should see permission error
5. Cannot promote users

## Migration & Deployment Notes

### Prerequisites
- Users table with `studio_id` column and foreign key (✅ Already exists)
- `super_admin` role support (✅ Already implemented)
- JWT authentication (✅ Already implemented)

### No Database Migrations Needed
The feature uses existing schema - no migrations required

### Backend Changes
1. Added `GET /api/studios/:studioId/admins`
2. Added `POST /api/studios/:studioId/admins`
3. Added `DELETE /api/studios/:studioId/admins/:userId`
All with proper permission checks

### Frontend Changes
1. New component: `AdminStudioAdmins.tsx`
2. Updated: `AdminLayout.tsx` (added nav link)
3. Updated: `AdminUsers.tsx` (error handling)
4. Updated: `App.tsx` (added route)

## API Response Examples

### Get Studio Admins Response
```json
[
  {
    "id": 1,
    "email": "admin1@studio.com",
    "name": "Studio Owner",
    "role": "studio_admin",
    "isActive": true,
    "createdAt": "2024-01-15T10:30:00",
    "lastLoginAt": "2024-03-09T14:22:00",
    "studioId": 5,
    "studioName": "Smith Studio"
  },
  {
    "id": 2,
    "email": "admin2@studio.com",
    "name": "Studio Manager",
    "role": "studio_admin",
    "isActive": true,
    "createdAt": "2024-02-20T09:15:00",
    "lastLoginAt": "2024-03-08T11:45:00",
    "studioId": 5,
    "studioName": "Smith Studio"
  }
]
```

### Create Studio Admin Response
```json
{
  "message": "studio_admin created successfully",
  "admin": {
    "id": 3,
    "email": "newadmin@studio.com",
    "name": "New Admin",
    "role": "studio_admin",
    "isActive": true,
    "createdAt": "2024-03-09T15:00:00",
    "studioId": 5,
    "studioName": "Smith Studio",
    "temporaryPassword": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
  }
}
```

## Future Enhancements

1. **Bulk Operations**: Add bulk delete/edit for multiple admins
2. **Admin Notifications**: Send email to new admin with login credentials
3. **Activity Audit Log**: Track all admin CRUD operations
4. **Role Templates**: Pre-defined role templates for common scenarios
5. **Multi-Studio Admins**: Allow one admin to manage multiple studios
6. **Password Reset**: Admin password reset functionality
7. **Permission Groups**: Custom permission sets for admins

## Troubleshooting

### Issue: Cannot see Studio Admins page
**Solution**: Verify you're logged in as super_admin. The page requires `super_admin` role.

### Issue: Temporary password not showing
**Solution**: Check browser console for errors. Password is displayed in success message.

### Issue: Cannot delete admin from dropdown
**Solution**: If it's the last admin in the studio, you cannot delete. Add another admin first.

### Issue: Permission denied error when creating admin
**Solution**: Only super admins can create admins for studios they don't own. Studio admins can only create for their own studio.

---

**Implementation Date**: March 9, 2026
**Feature Status**: ✅ Complete and Ready
**Testing Status**: ✅ Ready for QA
