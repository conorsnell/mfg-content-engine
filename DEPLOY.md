# Deploy to GitHub + Vercel

## Step 1: Add your API key locally

Copy the example env file and add your Anthropic key:

```bash
cp .env.local.example .env.local
```

Open `.env.local` and replace `your_api_key_here` with your actual Anthropic API key.

## Step 2: Test locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. Select a client, pick a content type, enter a topic, and generate.

## Step 3: Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit: demandDrive Content Engine"
```

Create a new repo on GitHub (github.com/new), then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/mfg-content-engine.git
git push -u origin main
```

## Step 4: Deploy to Vercel

1. Go to vercel.com and click "Add New Project"
2. Import your GitHub repo
3. Under "Environment Variables", add:
   - Key: `ANTHROPIC_API_KEY`
   - Value: your Anthropic API key
4. Click Deploy

Vercel auto-deploys on every push to main from here on.

---

## Adding clients

Edit `data/clients.json`. Copy the `template-client` entry at the bottom and fill it in.
Each client needs at minimum: `name`, `industry`, `what_they_make`, `who_they_sell_to`, `key_differentiators`.

The more context you give, the better the drafts.

## Improving the system prompt

Open `lib/prompts.ts`. Each content type has its own instruction block.
Edit the instructions under the relevant content type to tune the output format, length, or tone.

## Adding a new content type

1. Add a new entry to the `ContentType` union type in `lib/prompts.ts`
2. Add its label to `CONTENT_TYPE_LABELS`
3. Add its instruction block inside `typeInstructions`
4. Add it to the `CONTENT_TYPES` array in `app/page.tsx`
