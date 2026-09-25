# Connecting Google Drive

ReWoo reads Google Drive with **read-only** access, and **only the folders you choose**. Everything happens between your computer and Google. There's no ReWoo server in the middle.

Because ReWoo runs on your own computer, you create your own free Google "OAuth client" once. This takes about 5 minutes.

## 1. Create a Google Cloud project and enable the Drive API

1. Go to <https://console.cloud.google.com/> and create a project (any name, e.g. "My ReWoo").
2. Open **APIs & Services → Library**, search for **Google Drive API**, and click **Enable**.

## 2. Set up the consent screen

1. **APIs & Services → OAuth consent screen** (on newer consoles, **Google Auth Platform → Branding / Audience**).
2. User type: **External**. Fill in an app name (e.g. "ReWoo") and your email.
3. Under **Audience → Test users**, add **your own Google account**. While the app is in "Testing", only test users can sign in, which is exactly what you want for a personal app.
4. Scopes: you can leave this empty. ReWoo requests `https://www.googleapis.com/auth/drive.readonly` at sign-in.

## 3. Create the OAuth client

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type: **Web application**.
3. **Authorized redirect URIs**: add exactly the address ReWoo shows on the Memory screen. By default that's:

   ```
   http://127.0.0.1:8787/api/drive/callback
   ```

   (If you set `REWOO_PUBLIC_URL` or a different port, use that address instead. It must match exactly.)
4. Click **Create** and copy the **Client ID** and **Client secret**.

## 4. Connect in ReWoo

Choose one:

- **In the app:** Memory → Google Drive → *Set up Google access* → paste the ID and secret → **Save** → **Connect Google Drive**.
- **Or in `.env`:**
  ```
  GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
  GOOGLE_CLIENT_SECRET=xxxx
  ```

Google will warn that the app "isn't verified". That's expected for a personal app you created yourself. Click **Continue**.

Then click **Choose folders**, tick the folders you want, and click **Sync now**.

## What gets read

| File type | How |
|---|---|
| Google Docs / Slides | exported as plain text |
| Google Sheets | exported as CSV |
| PDF, DOCX, TXT, Markdown, CSV, HTML, JSON | downloaded (≤ 15 MB) and converted to text |
| Images, videos, other | skipped |

Sync is **incremental**: unchanged files are skipped, changed files are re-indexed, and files you deleted or moved out of the chosen folders are removed from ReWoo's memory.

## Privacy controls

- **Private 🔒** toggle: Drive content is only shown to brains running on your computer (e.g. Ollama).
- **I can use this** toggle: turn Drive off without disconnecting.
- **Disconnect**: deletes the stored tokens and every indexed Drive document from ReWoo. You can also revoke access at <https://myaccount.google.com/permissions>.

## Troubleshooting

| Problem | Fix |
|---|---|
| `redirect_uri_mismatch` | The redirect URI in Google Cloud must match the one on ReWoo's Memory screen exactly (including `127.0.0.1` vs `localhost` and the port). |
| `access_denied` / "app not verified" blocks you | Add your account as a **Test user** on the consent screen. |
| "Google session expired" | Click Disconnect, then Connect again. |
| A file wasn't indexed | Check that it's in a chosen folder, under 15 MB, and a supported type. Scanned PDFs without a text layer have no text to read. |
