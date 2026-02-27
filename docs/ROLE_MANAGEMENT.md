# Role Management in KSU CSOS

This document explains how role management works in the KSU CSOS system.

## Overview

The KSU CSOS uses a role-based access control (RBAC) system with Row-Level Security (RLS) policies to ensure users can only access data relevant to their role and portfolio.

## Available Roles

| Role | Description | Typical Users |
|------|-------------|---------------|
| `executive` | Full system access, executive dashboards | AD, Deputy AD Revenue |
| `major_gifts` | Access to major gift prospects and opportunities | Major Gifts Officers |
| `ticketing` | Access to ticket holders and renewals | Ticketing Staff |
| `corporate` | Access to corporate partnerships | Corporate Partnerships Team |
| `marketing` | Access to constituent data for campaigns | Marketing Team |
| `revenue_ops` | Cross-functional access, reporting | Revenue Operations |
| `admin` | System administration, role management | System Administrators |

## Role Assignment

### Via Edge Function (Recommended)

Use the `role_assign` Edge Function to assign or remove roles:

```typescript
// Example: Assign a role
const response = await fetch(`${SUPABASE_URL}/functions/v1/role_assign`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${userJWT}`
  },
  body: JSON.stringify({
    targetUserId: '22222222-2222-2222-2222-222222222222',
    role: 'major_gifts',
    action: 'assign'
  })
})
```

### Via SQL (Direct Database Access)

For initial setup or emergency access:

```sql
-- Assign a role
INSERT INTO user_role (user_id, role, assigned_by, assigned_at)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  'major_gifts',
  '11111111-1111-1111-1111-111111111111',
  NOW()
);

-- Remove a role
DELETE FROM user_role
WHERE user_id = '22222222-2222-2222-2222-222222222222'
  AND role = 'major_gifts';
```

## Querying Roles

### Check if user has a role

```typescript
import { hasRole } from '../_shared/supabase.ts'

const isMajorGifts = await hasRole(supabase, userId, 'major_gifts')
if (isMajorGifts) {
  // User has major_gifts role
}
```

### Get all roles for a user

```typescript
import { getUserRoles } from '../_shared/supabase.ts'

const roles = await getUserRoles(supabase, userId)
// Returns: ['major_gifts', 'marketing']
```

### Require a role

```typescript
import { requireRole } from '../_shared/supabase.ts'

// Throws error if user doesn't have one of the allowed roles
await requireRole(supabase, userId, ['admin', 'executive'])
```

## Multi-Role Users

Users can have multiple roles simultaneously. This is useful for:

1. **Cross-functional staff**: e.g., Major Gifts Officer who also helps with Marketing
2. **Management**: Executives who need visibility across multiple areas
3. **Training**: New staff who shadow multiple roles

**Example**: A Major Gifts Officer might have both `major_gifts` and `marketing` roles.

```sql
-- User with multiple roles
SELECT user_id, array_agg(role) as roles
FROM user_role
WHERE user_id = '22222222-2222-2222-2222-222222222222'
GROUP BY user_id;
```

Result:
```
user_id                              | roles
-------------------------------------|-------------------------
22222222-2222-2222-2222-222222222222 | {major_gifts, marketing}
```

## How RLS Uses Roles

Row-Level Security policies use the `user_role` table to filter data:

### Example: Constituent Access

```sql
-- Users can see constituents in their portfolio
CREATE POLICY "role_based_read" ON constituent_master FOR SELECT
  USING (
    is_exec() OR -- Executives see everything
    (has_role('major_gifts') AND primary_owner_role = 'major_gifts') OR
    (has_role('ticketing') AND primary_owner_role = 'ticketing') OR
    (has_role('corporate') AND primary_owner_role = 'corporate')
  );
```

### Helper Functions

These PostgreSQL functions are used in RLS policies:

```sql
-- Check if current user is an executive
CREATE FUNCTION is_exec() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_role
    WHERE user_id = auth.uid()
      AND role = 'executive'
  );
$$ LANGUAGE SQL SECURITY DEFINER;

-- Check if current user has a specific role
CREATE FUNCTION has_role(role_name TEXT) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_role
    WHERE user_id = auth.uid()
      AND role = role_name
  );
$$ LANGUAGE SQL SECURITY DEFINER;
```

## Security Best Practices

### 1. Principle of Least Privilege

Assign only the roles users need to perform their job:

❌ **Bad**: Give everyone `admin` role
✅ **Good**: Give `major_gifts` role to major gifts officers, `admin` only to IT staff

### 2. Audit Trail

All role assignments are logged to `audit_log`:

```sql
-- View role assignment history
SELECT
  al.created_at,
  al.action,
  al.user_id as admin_user,
  al.metadata->>'target_user_id' as target_user,
  al.new_values->>'role' as role_assigned,
  al.old_values->>'role' as role_removed
FROM audit_log al
WHERE al.table_name = 'user_role'
  AND al.action IN ('role_assign', 'role_remove')
ORDER BY al.created_at DESC;
```

### 3. Prevent Self-Sabotage

The `role_assign` function prevents users from removing their own `admin` role:

```typescript
// This will be blocked
if (action === 'remove' && role === 'admin' && targetUserId === userId) {
  return errorResponse('Cannot remove your own admin role', 403)
}
```

### 4. Regular Review

Periodically review assigned roles:

```sql
-- Find users with multiple roles
SELECT
  user_id,
  array_agg(role ORDER BY role) as roles,
  COUNT(*) as role_count
FROM user_role
GROUP BY user_id
HAVING COUNT(*) > 1
ORDER BY role_count DESC;

-- Find users who haven't logged in recently but still have roles
SELECT
  ur.user_id,
  array_agg(ur.role) as roles,
  au.last_sign_in_at
FROM user_role ur
LEFT JOIN auth.users au ON ur.user_id = au.id
WHERE au.last_sign_in_at < NOW() - INTERVAL '90 days'
  OR au.last_sign_in_at IS NULL
GROUP BY ur.user_id, au.last_sign_in_at;
```

## Frontend Integration

### React Hook Example

```typescript
// hooks/useRoles.ts
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useRoles() {
  const [roles, setRoles] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchRoles() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setRoles([])
        setLoading(false)
        return
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/role_list?userId=${user.id}`,
        {
          headers: {
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
          }
        }
      )

      const result = await response.json()
      setRoles(result.data?.roles || [])
      setLoading(false)
    }

    fetchRoles()
  }, [])

  return { roles, loading, hasRole: (role: string) => roles.includes(role) }
}
```

### Usage in Components

```typescript
// components/MajorGiftsPage.tsx
import { useRoles } from '../hooks/useRoles'

export function MajorGiftsPage() {
  const { roles, hasRole, loading } = useRoles()

  if (loading) return <div>Loading...</div>

  if (!hasRole('major_gifts') && !hasRole('executive')) {
    return <div>Access Denied: You need major_gifts or executive role</div>
  }

  return (
    <div>
      <h1>Major Gifts Dashboard</h1>
      {/* ... */}
    </div>
  )
}
```

## Troubleshooting

### User can't access data they should see

1. Check if they have the correct role:
   ```sql
   SELECT * FROM user_role WHERE user_id = '<user-id>';
   ```

2. Check if the constituent is assigned to their role:
   ```sql
   SELECT primary_owner_role FROM constituent_master WHERE id = '<constituent-id>';
   ```

3. Verify RLS policies are active:
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'constituent_master';
   ```

### Role assignment fails

1. Check if user performing assignment has `admin` or `executive` role
2. Verify the target user ID is valid
3. Check audit_log for error details
4. Ensure the role name is valid (see Available Roles section)

### User has role but still gets "Insufficient permissions"

1. Clear browser cache and re-login (JWT might be stale)
2. Verify RLS policies are correctly using `has_role()` function
3. Check if the function uses `SECURITY DEFINER` (required for RLS)

## API Reference

See detailed API documentation:
- [role_assign API](../supabase/functions/role_assign/README.md)
- [role_list API](../supabase/functions/role_list/README.md)
