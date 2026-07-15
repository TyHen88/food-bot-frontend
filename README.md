# 🍽️ Food Bot — Frontend App

This is a modern React/TypeScript Next.js application designed to serve as the Admin Panel and Telegram Mini App interface for the Telegram Food Poll Bot.

## 🚀 Preparing for Deployment on Vercel

Vercel provides native, zero-configuration hosting for Next.js. Follow these simple steps to deploy:

### 1. Import Repository
- Connect your GitHub account to Vercel.
- Select and import the `food-bot-frontend` repository.

### 2. Configure Environment Variables
In the **Environment Variables** section of the Vercel project setup, add the following variables:

| Variable | Description | Value (Production) | Value (Local Dev) |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | The HTTPS URL of your FastAPI backend server | `https://your-backend.railway.app` (or Render/VPS URL) | `http://localhost:8000` |
| `NEXT_PUBLIC_DEV_MODE` | Set to bypass Telegram WebView authentication requirements during testing | `false` | `true` |

> [!IMPORTANT]
> - For production, ensure `NEXT_PUBLIC_DEV_MODE` is set to `false` (or left blank) so that the app correctly validates requests using the official Telegram WebApp authentication signatures.
> - Ensure your FastAPI backend has the corresponding CORS configuration updated to allow requests from your Vercel deployment domain (e.g. `https://food-bot-frontend.vercel.app`).

### 3. Deploy
- Click **Deploy**. Vercel will automatically download dependencies, compile the TypeScript code, run lint audits, optimize images, and host your app on global edge locations!

---

## 🛠️ Local Development

To run the Next.js development server locally:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

- Modify `app/page.tsx` to edit the main dashboard layout.
- The theme configurations and design variables are customizable inside `app/globals.css`.
