# Content Approval System

Editors submit reference-video links, **Abdullah** (Content Director) approves or declines them, and editors track each approved video through **Approved → In progress → Done**. When an editor marks a video Done, they must paste its **Trello card link**. All times are in **Pacific time** (PST/PDT).

It runs free on **Supabase** (the database, so data is saved permanently) and **Vercel** (hosting).

**Team:** Abdullah (director, PIN `0011`), Amir Mahdi, Alizera, Sahan, Thomas, Jhully and Dhruv. Editors sign in by picking their name; no PIN needed.

---

## What's in it

| Who | What they get |
|---|---|
| **Editor** | A summary card ("ready to edit"), a status breakdown, a form to send new references, and their own board: *Waiting · Approved · In progress · Done · Not approved*. They can edit or delete their own cards, comment, and set progress on approved ones. Marking Done asks for the Trello card link. |
| **Abdullah** | The dashboard: references waiting for review, quick stats (approved, in progress, done, declined, average review time, average edit time), a team-activity heatmap, a status breakdown, the full board with a filter for each editor, a recent-activity feed and a Team table. He can approve, decline, comment, edit or delete anything, add or deactivate editors, and change his PIN. |

- **Light and dark mode.** The moon/sun button switches it, and each device remembers its choice.
- **Nothing is lost.** Every submission, comment and status change is stored in Supabase with a timestamp. **Delete only hides a card**: the row stays in the database (`deleted_at` is set) and can be restored from Supabase → Table Editor → `submissions` by clearing `deleted_at`.
- Boards refresh on their own every 30 seconds.

---

## Put it online (about 15 minutes, one time)

### 1. Database: Supabase
1. Go to <https://supabase.com>, sign in with GitHub, and click **New project**. Choose the Free plan and a region near the team (e.g. West US).
2. Open **SQL Editor → New query**, paste the whole of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. This creates the tables and adds the team.
3. Open **Project Settings → API Keys** and copy two values:
   - **Project URL**, e.g. `https://abcd1234.supabase.co`
   - **Secret key** (`sb_secret_…`), or the legacy **service_role** key. Keep it private.

### 2. Code: GitHub
Create a **private** repository on GitHub and push this folder to it. GitHub Desktop is the easiest way: *File → Add local repository*, then **Publish repository**.

### 3. Hosting: Vercel
1. Go to <https://vercel.com>, sign in with GitHub, click **Add New → Project**, and import the repository.
2. Under **Environment Variables**, add:

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | your Project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | your secret key |
   | `SESSION_SECRET` | any long random string, 32+ characters |

3. Click **Deploy**. Share the `*.vercel.app` link with the team.

Every time you push changes to GitHub, Vercel redeploys automatically.

---

## Try it on your computer

```bash
npm install
```
```bash
npm run dev
```
Then open <http://localhost:3000>. With no Supabase settings it runs in **demo mode**: sample data saved to `.demo-data.json` on your computer (delete that file to reset). Abdullah's demo PIN is `0011`. Demo mode never runs on Vercel.

To run locally against the real database instead, copy `.env.example` to `.env.local` and fill in the three values.

---

## Good to know
- **Supabase free tier pauses** a project after about a week with no activity. Normal daily use keeps it awake. If it does pause, click **Restore** in the Supabase dashboard; no data is lost.
- **Forgot Abdullah's PIN?** Run this in the Supabase SQL Editor:
  ```sql
  select public.set_member_pin(id, '0011') from public.members where name = 'Abdullah';
  ```
- **Security:** Row Level Security is on with no public access, so only the website's server (using the secret key) can read or write data. Abdullah's PIN is stored as a bcrypt hash. Editors have no PIN by design, so anyone with the link can pick an editor's name; keep the link within the team.
