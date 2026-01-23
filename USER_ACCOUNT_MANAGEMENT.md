# User Account Management System

## Overview
The Photo Lab React application now includes a comprehensive user account management system with role-based access control. This allows customers to create accounts, and administrators to manage those accounts including promoting users to admin roles.

## Features Implemented

### 1. User Roles
- **Customer Role**: Default role for all new registrations
  - Can browse albums and photos
  - Can add items to cart and place orders
  - Can view their own order history
  - Redirected to `/albums` after login

- **Admin Role**: Elevated permissions for administrators
  - Full access to admin portal at `/admin/*`
  - Can manage albums, photos, products, watermarks
  - Can view all orders and customer information
  - Can manage user accounts (promote/demote roles, activate/deactivate)
  - Redirected to `/admin/dashboard` after login

### 2. Account Management Features

#### Customer Features:
- **Registration**: New users automatically receive 'customer' role
- **Login**: Role-based redirect (customers → albums, admins → dashboard)
- **Account Status**: Active accounts can login; deactivated accounts cannot

#### Admin Features:
- **User Management Page** (`/admin/users`):
  - View all user accounts in a table
  - Filter by role (All, Customers, Admins)
  - See user statistics (orders, spending, registration date)
  - Promote customers to admin role
  - Demote admins to customer role
  - Activate/deactivate user accounts

### 3. Database Structure

#### User Type:
```typescript
interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: 'customer' | 'admin';
  isActive: boolean;
  token?: string;
}
```

#### UserAccount Type (Admin View):
```typescript
interface UserAccount {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: 'customer' | 'admin';
  registeredDate: string;
  totalOrders: number;
  totalSpent: number;
  isActive: boolean;
  lastLoginDate: string;
}
```

## Default Test Accounts

### Customer Account:
- **Email**: demo@example.com
- **Password**: (any password in mock mode)
- **Role**: customer
- **Status**: Active

### Admin Account:
- **Email**: admin@photolab.com
- **Password**: (any password in mock mode)
- **Role**: admin
- **Status**: Active

## API Endpoints (Mock)

### Authentication:
- `POST /api/auth/login` - Login with email and password
  - Returns user object with role
  - Checks if account is active
  - Throws error if account is deactivated

- `POST /api/auth/register` - Register new customer account
  - Creates new user with 'customer' role
  - Sets isActive to true by default

### Admin User Management:
- `GET /api/admin/users` - Get all user accounts
- `PUT /api/admin/users/:id` - Update user account details
- `POST /api/admin/users/:id/toggle-active` - Activate/deactivate account
- `POST /api/admin/users/:id/change-role` - Promote/demote user role

## Implementation Details

### Authentication Context
- Updated to return `User` object from login/register methods
- Allows pages to access user role and status immediately after authentication

### Role-Based Routing
- Login page checks user.role and redirects appropriately
- Admin routes protected by existing ProtectedRoute component
- Customer routes accessible by both customers and admins

### Security Considerations
- Only users with 'admin' role can access admin portal
- Account deactivation prevents login
- Role changes take effect on next login
- Token validation should be implemented when connecting to real backend

## Usage

### For Customers:
1. Register at `/register`
2. Login at `/login` (redirects to `/albums`)
3. Browse photos and place orders

### For Admins:
1. Login at `/login` with admin account (redirects to `/admin/dashboard`)
2. Navigate to "👥 Users" to manage accounts
3. Filter users, promote/demote roles, activate/deactivate accounts

### Promoting a Customer to Admin:
1. Login as admin
2. Go to Admin Portal → Users
3. Find the customer account
4. Click ⬆️ (promote) button
5. Confirm the action
6. Customer can now login and access admin portal

### Deactivating an Account:
1. Login as admin
2. Go to Admin Portal → Users
3. Find the user account
4. Click 🔒 (deactivate) button
5. User will not be able to login until reactivated

## Future Enhancements

When connecting to a real ASP.NET backend:
- Implement password hashing and validation
- Add email verification for new registrations
- Implement password reset functionality
- Add audit logging for role changes
- Add pagination for user list
- Add search/filter by email or name
- Add bulk operations for user management
- Implement proper JWT token validation
- Add account deletion (soft delete)
- Add user profile editing
- Add two-factor authentication for admin accounts

## Files Modified

### Type Definitions:
- `src/types/index.ts` - Added role and isActive to User, created UserAccount type

### Services:
- `src/services/mockApi.ts` - Updated login to check isActive, register creates customer role
- `src/services/adminMockApi.ts` - Added users API with management methods

### Contexts:
- `src/contexts/AuthContext.tsx` - Updated login/register to return User object

### Pages:
- `src/pages/Login.tsx` - Added role-based redirect and account status check
- `src/pages/admin/AdminUsers.tsx` - New user management page

### App Structure:
- `src/App.tsx` - Added /admin/users route
- `src/components/AdminLayout.tsx` - Added Users navigation link
