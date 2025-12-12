# Vercel Environment Variables Setup Guide

## Problem
If you're getting a 500 Internal Server Error on production but it works on localhost, it's likely because environment variables are not configured in Vercel.

## Solution: Add Environment Variables to Vercel

### Step 1: Go to Vercel Dashboard
1. Visit [vercel.com](https://vercel.com) and sign in
2. Navigate to your project: `cms_organization_backend`
3. Go to **Settings** → **Environment Variables**

### Step 2: Add These Environment Variables

Add each of the following variables from your `.env` file:

#### Required Database Variables:
```
DB_USER=avnadmin
DB_PASSWORD=AVNS_PWa-cKH92P67bu0QCN1
DB_HOST=complete-completestaffingsolutions-d485.i.aivencloud.com
DB_PORT=21550
DB_DATABASE=defaultdb
DB_SSL=true
```

#### Required Security Variables:
```
JWT_SECRET=completesoftwaresolution0987654321
NODE_ENV=production
```

#### Optional but Recommended:
```
ALLOWED_ORIGINS=https://cms-organization.vercel.app
PORT=8080
```

### Step 3: Set Environment for Each Variable
- For each variable, select **Production**, **Preview**, and **Development** environments
- Click **Save** after adding each variable

### Step 4: Redeploy
After adding all environment variables:
1. Go to **Deployments** tab
2. Click the **⋯** (three dots) on the latest deployment
3. Click **Redeploy**
4. Or push a new commit to trigger automatic redeployment

## Quick Checklist

- [ ] DB_USER is set
- [ ] DB_PASSWORD is set
- [ ] DB_HOST is set
- [ ] DB_PORT is set
- [ ] DB_DATABASE is set
- [ ] DB_SSL is set to "true"
- [ ] JWT_SECRET is set
- [ ] NODE_ENV is set to "production"
- [ ] ALLOWED_ORIGINS includes your frontend URL
- [ ] All variables are enabled for Production environment
- [ ] Redeployed the application

## Testing After Setup

1. Visit: `https://cms-organization-backend.vercel.app/test-db`
   - Should return: `{"success":true,"time":"..."}`
   - If this fails, database connection is the issue

2. Try logging in again on your frontend
   - Should work if all variables are set correctly

## Troubleshooting

### Still getting 500 errors?
1. Check Vercel Function Logs:
   - Go to **Deployments** → Click on latest deployment → **Functions** tab
   - Look for error messages in the logs

2. Verify environment variables:
   - Make sure all variables are spelled correctly
   - Check that values don't have extra spaces
   - Ensure DB_SSL is the string "true", not boolean true

3. Check database connectivity:
   - Ensure your database allows connections from Vercel's IP addresses
   - Some databases require IP whitelisting

### Database Connection Issues?
- Verify your database host allows external connections
- Check if your database requires IP whitelisting (add Vercel IPs)
- Ensure SSL is properly configured

## Security Note
⚠️ Never commit your `.env` file to Git. Environment variables in Vercel are encrypted and secure.

