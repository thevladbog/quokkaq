# Migration Checklist

This checklist helps ensure a smooth migration to the monorepo.

## ✅ Completed

- [x] Initialize Nx monorepo with pnpm
- [x] Create apps/ and packages/ structure
- [x] Migrate quokkaq-frontend to apps/frontend
- [x] Migrate quokkaq-go-backend to apps/backend
- [x] Migrate quokkaq-kiosk-desktop to apps/kiosk-desktop
- [x] Create packages/shared-types with API types
- [x] Create packages/ui-kit with 31 UI components
- [x] Create packages/kiosk-lib with utilities
- [x] Configure Nx with affected detection
- [x] Setup GitHub Actions workflows
  - [x] CI workflow with affected builds/tests
  - [x] Frontend deployment workflow
  - [x] Backend deployment workflow
  - [x] Kiosk desktop release workflow
- [x] Configure independent versioning per app
- [x] Create comprehensive README
- [x] Create developer setup guide

## 🔄 To Complete

### 1. Update Imports in Apps

Apps still use old import paths. Update them to use monorepo packages:

**In apps/frontend:**
```typescript
// Old
import { Button } from '@/components/ui/button';
import type { Ticket } from '@/lib/api';

// New
import { Button } from '@quokkaq/ui-kit';
import type { Ticket } from '@quokkaq/shared-types';
```

Files to update:
- `apps/frontend/components/**/*.tsx`
- `apps/frontend/app/**/*.tsx`
- `apps/kiosk-desktop/src/**/*.tsx` (if applicable)

### 2. Install Dependencies

```bash
cd /path/to/quokkaq
pnpm install
```

This will:
- Install all dependencies for packages and apps
- Link workspace packages correctly
- Setup Nx cache

### 3. Test Local Builds

```bash
# Build packages first
pnpm nx build shared-types
pnpm nx build ui-kit
pnpm nx build kiosk-lib

# Build apps
pnpm nx build frontend
pnpm nx build backend
pnpm nx build kiosk-desktop
```

Fix any compilation errors that arise.

### 4. Setup Git Remote

```bash
cd /path/to/quokkaq

# If migrating to a new repository
git remote add origin <new-repo-url>
git push -u origin main

# Or if keeping the same repository
# (backup old branches first!)
git push --force origin main
```

### 5. Configure GitHub Secrets

In GitHub repository settings → Secrets and variables → Actions, add:

**Yandex Cloud:**
- `YC_SA_JSON_CREDENTIALS` - Service account JSON key
- `YC_REGISTRY_ID` - Container registry ID

**Deployment:**
- `VM_HOST` - Deployment server IP/hostname
- `VM_USERNAME` - SSH username
- `VM_SSH_KEY` - SSH private key

**Frontend:**
- `NEXT_PUBLIC_API_URL` - API URL for frontend
- `NEXT_PUBLIC_WS_URL` - WebSocket URL

**Backend:**
- `POSTGRES_PASSWORD`
- `REDIS_PASSWORD`
- `MINIO_ROOT_USER`
- `MINIO_ROOT_PASSWORD`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE`
- `JWT_SECRET`
- `APP_BASE_URL`
- `AWS_S3_BUCKET`
- `ACME_EMAIL`

### 6. Test CI/CD

**Test affected detection:**
```bash
# Make a small change to frontend
echo "// test" >> apps/frontend/app/page.tsx

# Check what's affected
git add .
git commit -m "test: check affected detection"
pnpm nx affected:graph
```

**Test workflows:**
1. Create a test PR
2. Verify CI runs and tests only affected projects
3. Merge PR to main
4. Verify deployment workflows trigger for affected apps

### 7. Validate Deployments

After first deployment to main:

**Frontend:**
1. Check Docker image built: `cr.yandex/<registry>/quokkaq-frontend:latest`
2. Verify app deployed to VM
3. Check frontend accessible at configured URL
4. Verify version tag created: `v0.1.0-frontend`

**Backend:**
1. Check Docker image built: `cr.yandex/<registry>/quokkaq-backend:latest`
2. Verify API deployed to VM
3. Test API endpoints
4. Verify version tag created: `v0.0.1-backend`

**Kiosk:**
1. Check GitHub Release created
2. Verify artifacts uploaded for all platforms
3. Download and test installers
4. Verify version tag created: `v0.1.1-kiosk`

### 8. Update Team Documentation

1. Share README.md with team
2. Share SETUP.md with developers
3. Conduct team walkthrough of new structure
4. Update any CI/CD documentation
5. Update deployment runbooks

### 9. Archive Old Repositories

Once monorepo is stable:

1. Archive old repositories on GitHub
2. Add README to archived repos pointing to monorepo
3. Update any external links
4. Keep old repos for reference (don't delete!)

### 10. Performance Optimization (Optional)

**Enable Nx Cloud (recommended):**
```bash
pnpm nx connect-to-nx-cloud
```

Benefits:
- Distributed caching across team
- CI performance insights
- Faster CI builds

**Setup pre-commit hooks:**
```bash
# Install husky
pnpm add -D husky

# Setup hooks
npx husky install

# Add pre-commit hook for affected lint
npx husky add .husky/pre-commit "pnpm nx affected -t lint --uncommitted"
```

## Common Issues

### Apps Not Building

**Issue:** Apps can't find shared packages

**Fix:**
```bash
# Rebuild all packages
pnpm nx run-many -t build --projects=shared-types,ui-kit,kiosk-lib

# Clear Nx cache
pnpm nx reset

# Try building app again
pnpm nx build frontend
```

### Workflows Not Triggering

**Issue:** GitHub Actions not detecting affected apps

**Fix:**
- Ensure `fetch-depth: 0` in checkout action
- Check that affected detection logic is correct
- Verify paths in workflow triggers
- Test locally: `pnpm nx affected:apps --base=HEAD~1 --head=HEAD`

### Version Bumping Fails

**Issue:** Version bump script fails in CI

**Fix:**
- Check GitHub token has write permissions
- Verify `[skip ci]` in bump commit message
- Check git config in workflow

### Docker Build Fails

**Issue:** Docker build can't find files

**Fix:**
- Update Dockerfile context to use monorepo structure
- Copy necessary files from root if needed
- Check .dockerignore doesn't exclude required files

## Rollback Plan

If critical issues occur:

1. **Immediate rollback:**
   ```bash
   cd /path/to/quokkaq-old
   # Reactivate old workflows
   git checkout prod-release
   git push origin prod-release
   ```

2. **DNS/Load Balancer:**
   - Point traffic back to old deployment

3. **Time to rollback:** ~15-30 minutes

4. **Debugging:**
   - Monorepo stays available for investigation
   - No data loss (databases unchanged)
   - Can fix and redeploy quickly

## Success Criteria

Migration is successful when:

- [ ] All apps build successfully locally
- [ ] CI runs without errors on PRs
- [ ] Affected detection works correctly
- [ ] Frontend deploys successfully
- [ ] Backend deploys successfully
- [ ] Kiosk releases successfully
- [ ] All services running in production
- [ ] No regressions in functionality
- [ ] Team can develop effectively
- [ ] Documentation is clear and helpful

## Timeline

Estimated time for complete migration:

- **Initial setup:** 4-6 hours (✅ done)
- **Import updates:** 2-4 hours
- **Testing & fixes:** 4-8 hours
- **CI/CD validation:** 2-4 hours
- **Production deployment:** 2-4 hours
- **Team onboarding:** 2-4 hours

**Total:** 16-30 hours spread over 2-3 days

## Support

If you encounter issues:

1. Check this checklist
2. Review README.md and SETUP.md
3. Check Nx documentation: https://nx.dev
4. Create an issue in the repository
5. Contact the team

Good luck with the migration! 🚀
