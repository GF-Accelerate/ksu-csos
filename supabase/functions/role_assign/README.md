# Role Assignment Edge Function

Assigns or removes roles from users in the KSU CSOS system.

## Endpoint

`POST /functions/v1/role_assign`

## Authentication

Requires authentication with `admin` or `executive` role.

## Request Body

```json
{
  "targetUserId": "uuid-of-target-user",
  "role": "major_gifts",
  "action": "assign"
}
```

### Parameters

- `targetUserId` (string, required): UUID of the user to assign/remove role
- `role` (string, required): Role to assign/remove. Valid roles:
  - `executive`
  - `major_gifts`
  - `ticketing`
  - `corporate`
  - `marketing`
  - `revenue_ops`
  - `admin`
- `action` (string, required): Either `assign` or `remove`

## Response

### Success (200)

```json
{
  "success": true,
  "message": "Role \"major_gifts\" assigned to user successfully",
  "data": {
    "targetUserId": "uuid-of-target-user",
    "role": "major_gifts",
    "action": "assign"
  }
}
```

### Error (400/403/500)

```json
{
  "error": "Error message describing what went wrong"
}
```

## Error Codes

- `400` - Bad request (missing fields, invalid role, invalid action)
- `403` - Forbidden (insufficient permissions, self-removal of admin role)
- `409` - Conflict (role already assigned)
- `500` - Internal server error

## Security Features

1. **Admin-only access**: Only users with `admin` or `executive` role can assign/remove roles
2. **Self-protection**: Users cannot remove their own admin role
3. **Audit logging**: All role changes are logged to `audit_log` table
4. **Idempotency**: Assigning an already-assigned role returns a 409 error

## Examples

### Assign a role

```bash
curl -X POST http://localhost:54321/functions/v1/role_assign \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-jwt-token>" \
  -d '{
    "targetUserId": "22222222-2222-2222-2222-222222222222",
    "role": "major_gifts",
    "action": "assign"
  }'
```

### Remove a role

```bash
curl -X POST http://localhost:54321/functions/v1/role_assign \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-jwt-token>" \
  -d '{
    "targetUserId": "22222222-2222-2222-2222-222222222222",
    "role": "ticketing",
    "action": "remove"
  }'
```

## Testing

Run unit tests:

```bash
cd supabase/functions/role_assign
deno test --allow-all
```

## Audit Trail

All role assignments and removals are logged to the `audit_log` table with:
- `action`: `role_assign` or `role_remove`
- `user_id`: The admin who performed the action
- `table_name`: `user_role`
- `record_id`: `{targetUserId}:{role}`
- `metadata`: Contains `target_user_id`
- `new_values` or `old_values`: The role that was assigned/removed

Query audit trail:

```sql
SELECT * FROM audit_log
WHERE table_name = 'user_role'
  AND action IN ('role_assign', 'role_remove')
ORDER BY created_at DESC;
```
