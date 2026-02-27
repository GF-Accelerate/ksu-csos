# Role List Edge Function

Lists roles for users in the KSU CSOS system.

## Endpoint

`GET /functions/v1/role_list`

## Authentication

Requires authentication. Authorization depends on the query:
- **Get own roles**: Any authenticated user can query their own roles
- **Get other user's roles**: Requires `admin` or `executive` role
- **List all user-role mappings**: Requires `admin` or `executive` role

## Query Parameters

- `userId` (optional): UUID of the user to query roles for
  - If provided: Returns roles for that specific user
  - If omitted: Returns all user-role mappings (admin only)

## Response

### Get specific user's roles (200)

```json
{
  "success": true,
  "data": {
    "userId": "uuid-of-user",
    "roles": [
      "major_gifts",
      "marketing"
    ]
  }
}
```

### List all user-role mappings (200)

```json
{
  "success": true,
  "data": {
    "totalUsers": 5,
    "users": [
      {
        "userId": "11111111-1111-1111-1111-111111111111",
        "roles": ["executive"],
        "assignments": [
          {
            "role": "executive",
            "assignedBy": "11111111-1111-1111-1111-111111111111",
            "assignedAt": "2026-02-25T10:00:00Z"
          }
        ]
      },
      {
        "userId": "22222222-2222-2222-2222-222222222222",
        "roles": ["major_gifts", "marketing"],
        "assignments": [
          {
            "role": "major_gifts",
            "assignedBy": "11111111-1111-1111-1111-111111111111",
            "assignedAt": "2026-02-25T10:05:00Z"
          },
          {
            "role": "marketing",
            "assignedBy": "11111111-1111-1111-1111-111111111111",
            "assignedAt": "2026-02-25T10:10:00Z"
          }
        ]
      }
    ]
  }
}
```

### Error (400/500)

```json
{
  "error": "Error message describing what went wrong"
}
```

## Error Codes

- `400` - Bad request (insufficient permissions)
- `500` - Internal server error

## Examples

### Get your own roles

```bash
curl -X GET "http://localhost:54321/functions/v1/role_list?userId=22222222-2222-2222-2222-222222222222" \
  -H "Authorization: Bearer <your-jwt-token>"
```

### Get another user's roles (admin only)

```bash
curl -X GET "http://localhost:54321/functions/v1/role_list?userId=33333333-3333-3333-3333-333333333333" \
  -H "Authorization: Bearer <admin-jwt-token>"
```

### List all user-role mappings (admin only)

```bash
curl -X GET "http://localhost:54321/functions/v1/role_list" \
  -H "Authorization: Bearer <admin-jwt-token>"
```

## Testing

Run unit tests:

```bash
cd supabase/functions/role_list
deno test --allow-all
```

## Use Cases

1. **User profile page**: Display current user's roles
2. **Admin dashboard**: List all users and their roles
3. **Role verification**: Check if a user has a specific role before granting access
4. **Audit review**: See who assigned which roles and when

## Related Functions

- `role_assign`: Assign or remove roles from users
- See `supabase/functions/_shared/supabase.ts` for helper functions:
  - `hasRole(supabase, userId, role)`: Check if user has a specific role
  - `getUserRoles(supabase, userId)`: Get all roles for a user
  - `requireRole(supabase, userId, allowedRoles)`: Require user to have one of the allowed roles
