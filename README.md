# P5Routine Google Calendar Sync

A simple, lightweight Node.js script that allows you to manage and synchronize your calendar schedule declaratively from a single JSON file.

## Features

- **Single Source of Truth**: Manage all calendar events inside `events.json`.
- **Declarative Sync**: Checks the state of local events against your Google Calendar and automatically calculates:
  - **Insertions** for new events.
  - **Updates** for modified events (handles changes in titles, descriptions, times, and locations).
  - **Deletions** for events removed from `events.json` (only removes events originally created by this script).
- **Secondary Calendar Focus**: Automatically creates and manages a dedicated secondary calendar named `P5Routine` to keep your primary calendar clean.
- **Dry-run Support**: Preview synchronization changes before applying them.

---

## File Structure

```text
├── config.json       # General settings (e.g., target calendar name)
├── events.json       # The single file containing your calendar events
├── auth.js           # Google OAuth2 client authentication module
├── sync.js           # Core diffing and synchronization script
├── SETUP.md          # Step-by-step Google Cloud Console credentials setup guide
├── README.md         # This readme file
└── .gitignore        # Ignores sensitive key files (credentials.json, token.json)
```

---

## Quick Start

1. **Configure Google Cloud Credentials**:
   Follow the detailed guide in [SETUP.md](SETUP.md) to enable the Google Calendar API, download `credentials.json`, and place it in this directory.

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Authenticate**:
   ```bash
   npm run auth
   ```
   *This will open a browser for you to log in and save your credentials to `token.json`.*

4. **Synchronize Events**:
   - Preview changes (Recommended first step):
     ```bash
     npm run dry-run
     ```
   - Push changes to Google Calendar:
     ```bash
     npm run sync
     ```

---

## Event Schema (`events.json`)

To add/edit events, modify `events.json` using the following format:

```json
[
  {
    "id": "morning-exercise",
    "summary": "Morning Exercise",
    "description": "Start the day with a healthy workout.",
    "start": "2026-06-24T07:00:00+07:00",
    "end": "2026-06-24T08:00:00+07:00",
    "location": "Local Gym / Park"
  }
]
```

- `id`: Must be a unique alphanumeric string (e.g., `meeting-1`, `focus-block-monday`). Do not change the `id` of an event once pushed, as the script uses it to map future updates or deletions.
- `start` / `end`: Can be ISO-8601 timestamps (e.g., `YYYY-MM-DDTHH:MM:SS+Offset`) or date strings for all-day events (e.g., `YYYY-MM-DD`).
