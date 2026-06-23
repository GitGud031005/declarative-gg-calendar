# Google Calendar Sync Setup Instructions

Follow these steps to connect the script to your Google Calendar account.

## Step 1: Create a Google Cloud Project & Enable Google Calendar API

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Log in with your Google Account.
3. Click on the project dropdown in the top-left (near the logo) and click **New Project**. Name it `P5Routine Calendar Sync` (or similar) and click **Create**.
4. Make sure your newly created project is selected in the top dropdown.
5. In the left navigation menu or the top search bar, search for **Google Calendar API** and click on it.
6. Click **Enable**.

---

## Step 2: Configure the OAuth Consent Screen

Since this is a personal script, you will run it in "testing" mode.
1. In the left-hand menu, navigate to **APIs & Services** > **OAuth consent screen**.
2. Select **External** as the User Type and click **Create**.
3. Fill in the required app details:
   - **App name**: `P5Routine Sync`
   - **User support email**: Select your email.
   - **Developer contact information**: Enter your email.
4. Click **Save and Continue**.
5. **Scopes page**: Click **Add or Remove Scopes**.
   - Search for `../auth/calendar` (or check the box for `.../auth/calendar` which allows read, write, and delete access to calendars).
   - Scroll down and click **Update**.
   - Click **Save and Continue**.
6. **Test Users page**: Click **Add Users**.
   - Enter your own Gmail address (the calendar account you want to sync to).
   - Click **Add** / **Save** and click **Save and Continue**.
7. Click **Back to Dashboard**.

---

## Step 3: Create OAuth 2.0 Credentials (Desktop Client)

1. In the left menu, click **Credentials**.
2. Click **+ Create Credentials** at the top and select **OAuth client ID**.
3. Under **Application type**, select **Desktop app**.
4. Name it `P5Routine Desktop Client` and click **Create**.
5. A popup will show "OAuth client created". Click **Download JSON** or click the download icon next to the client ID in the list.
6. Rename this downloaded file to `credentials.json` and move it to the root of your project directory (`c:\Users\phucl\OneDrive\Desktop\phuc\Projects\gg-calendar\credentials.json`).

---

## Step 4: First Initialization (Authorization)

1. In your terminal/console, install dependencies:
   ```bash
   npm install
   ```
2. Run the authentication script:
   ```bash
   npm run auth
   ```
3. The script will print a URL or attempt to open a browser window.
4. Log in with the test email address you configured in Step 2.
5. You may see a warning screen saying "Google hasn't verified this app" (this is normal for self-created test apps). Click **Advanced** and then click **Go to P5Routine Sync (unsafe)**.
6. Grant permission to access your Google Calendar.
7. After authorizing, you will be redirected to a localhost page or given a code. The script will automatically receive the code or prompt you, saving it to `token.json`.
8. Once `token.json` is generated, you are ready to synchronize!

---

## Step 5: Push Calendar Events

1. Open `events.json` and customize your events.
2. Run a dry run to check what changes will be made:
   ```bash
   npm run dry-run
   ```
3. Run the synchronization:
   ```bash
   npm run sync
   ```
