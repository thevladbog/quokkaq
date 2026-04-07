# Security Configuration Guide

## JWT Secret Configuration

### Overview

The application uses JWT (JSON Web Tokens) for authentication. The JWT secret is **critical** for security - it signs all authentication tokens.

### Current Implementation

**Files that use JWT_SECRET:**
- `internal/services/auth_service.go` - Token generation
- `internal/middleware/auth.go` - Token validation

**Algorithm:** HS256 (HMAC with SHA-256)
**Token Expiry:** 24 hours

---

## ⚠️ CRITICAL: Set JWT_SECRET

### Security Risk

If `JWT_SECRET` is not set, the code falls back to:
```go
secret = "default_secret_please_change"  // ❌ INSECURE!
```

**This allows anyone to:**
- Generate valid tokens
- Impersonate any user
- Bypass authentication

### How to Set JWT_SECRET

#### Development (.env)

```bash
# Generate a random secret
openssl rand -hex 32

# Add to .env
JWT_SECRET=your_generated_secret_here
```

#### Production (.env.prod)

```bash
# Generate a strong secret (64 characters recommended)
openssl rand -base64 48

# Add to .env.prod
JWT_SECRET=your_strong_production_secret_here
```

**Example:**
```env
JWT_SECRET=7vXp9mK2nR8qW5tY6uZ3cD4eF1gH0iJ2kL3mN4oP5qR6sT7uV8wX9yZ0aB1cD2eF
```

---

## Docker Configuration

### Development (docker-compose.yml)

Add to backend service environment:
```yaml
backend:
  environment:
    JWT_SECRET: ${JWT_SECRET}
```

### Production (docker-compose.prod.yml)

Already configured:
```yaml
backend:
  environment:
    # ... other vars
    # JWT_SECRET is read from .env.prod
```

Ensure `.env.prod` contains:
```env
JWT_SECRET=YOUR_PRODUCTION_SECRET_HERE
```

---

## Best Practices

### ✅ DO

1. **Use a strong, random secret** (at least 32 characters)
2. **Generate with cryptographically secure methods:**
   ```bash
   openssl rand -base64 32
   # or
   openssl rand -hex 32
   ```
3. **Different secrets for dev/staging/prod**
4. **Store in environment variables** (never in code)
5. **Rotate periodically** (every 3-6 months)
6. **Keep backup of old secret** during rotation (for token migration)

### ❌ DON'T

1. ❌ Use weak/predictable secrets
2. ❌ Commit secrets to version control
3. ❌ Share secrets between environments
4. ❌ Use default/example values in production
5. ❌ Hardcode secrets in application code

---

## Secret Rotation Process

When rotating JWT secret:

1. **Generate new secret:**
   ```bash
   NEW_SECRET=$(openssl rand -base64 48)
   echo "JWT_SECRET=$NEW_SECRET"
   ```

2. **Support both secrets temporarily** (code change needed):
   ```go
   // Try new secret first, fallback to old
   secrets := []string{newSecret, oldSecret}
   ```

3. **Deploy with dual-secret support**

4. **Wait for all tokens to expire** (24 hours)

5. **Remove old secret** from configuration

6. **Deploy single-secret version**

---

## Verification

### Check if JWT_SECRET is set

```bash
# In container
docker compose exec backend env | grep JWT_SECRET

# Should output:
# JWT_SECRET=your_secret_here
```

### Test token generation

```bash
# Login and get token
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'

# Use token
curl http://localhost:3001/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

## Security Checklist

Before deploying to production:

- [ ] `JWT_SECRET` is set in `.env.prod`
- [ ] Secret is at least 32 characters long
- [ ] Secret is randomly generated (not a dictionary word)
- [ ] Different from development secret
- [ ] Not committed to version control
- [ ] Documented in secure location (password manager)
- [ ] Backup/disaster recovery plan exists

---

## Troubleshooting

### "Invalid or expired token" errors

**Possible causes:**
1. JWT_SECRET changed (users must re-login)
2. Token expired (24 hours)
3. Token malformed
4. Secret mismatch between instances (in load-balanced setup)

**Solution:**
- Ensure all instances use **same JWT_SECRET**
- Check token expiry time
- Clear tokens and re-login

### Fallback to default secret

**Symptom:**
```
Using default JWT secret - CHANGE THIS IN PRODUCTION!
```

**Solution:**
1. Set `JWT_SECRET` in `.env` or `.env.prod`
2. Restart application
3. Verify with `docker compose exec backend env | grep JWT_SECRET`

---

## Additional Security Measures (Future)

Consider implementing:

1. **Token Refresh:** Separate refresh tokens with longer expiry
2. **Token Blacklist:** Redis-based revocation list
3. **Multi-factor Auth:** TOTP or SMS verification
4. **Rate Limiting:** Prevent brute force attacks
5. **Audit Logging:** Track all authentication events
6. **IP Whitelisting:** Restrict access by IP
7. **Key Rotation:** Automated secret rotation

---

## Resources

- [JWT.io](https://jwt.io/) - JWT debugger
- [OWASP JWT Cheatsheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)
- [RFC 7519](https://tools.ietf.org/html/rfc7519) - JWT specification
