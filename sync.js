import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { google } from 'googleapis';
import { getAuthClient } from './auth.js';

const CONFIG_PATH = path.resolve('config.json');
const EVENTS_PATH = path.resolve('events.json');

// Helper to hash local event IDs into valid Google Calendar event IDs
// Google Calendar IDs must be base32hex (a-v, 0-9), hex (0-9, a-f) is a subset of this.
function getGCalEventId(localId) {
  return crypto.createHash('md5').update(localId).digest('hex');
}

// Format local start/end values into date or dateTime objects for GCal API
function formatDateTime(val, timeZone) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    return { date: val };
  }
  return { 
    dateTime: val,
    timeZone: timeZone
  };
}

// Compare a local time string with a Google Calendar start/end time object
function datesAreEqual(localTime, remoteTimeObj) {
  const isLocalAllDay = !localTime.includes('T');
  const isRemoteAllDay = !!remoteTimeObj.date;

  if (isLocalAllDay !== isRemoteAllDay) {
    return false;
  }

  if (isRemoteAllDay) {
    return localTime === remoteTimeObj.date;
  }

  try {
    return new Date(localTime).getTime() === new Date(remoteTimeObj.dateTime).getTime();
  } catch (e) {
    return false;
  }
}

function getRecurrenceArray(recurrence) {
  if (!recurrence) return undefined;
  if (Array.isArray(recurrence)) return recurrence;
  if (typeof recurrence === 'string') return [recurrence];
  return undefined;
}

function arraysAreEqual(arr1, arr2) {
  const a = arr1 || [];
  const b = arr2 || [];
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function getReminders(event) {
  if (event.reminders) {
    return event.reminders;
  }
  const isWakeup = event.id.toLowerCase().includes('wakeup') || event.summary.toLowerCase().includes('wakeup');
  if (isWakeup) {
    return {
      useDefault: false,
      overrides: []
    };
  }
  return {
    useDefault: false,
    overrides: [
      { method: 'popup', minutes: 10 },
      { method: 'email', minutes: 10 }
    ]
  };
}

function remindersAreEqual(localReminders, remoteReminders) {
  const localUseDefault = localReminders.useDefault ?? false;
  const remoteUseDefault = remoteReminders.useDefault ?? false;
  if (localUseDefault !== remoteUseDefault) return false;

  const localOverrides = localReminders.overrides || [];
  const remoteOverrides = remoteReminders.overrides || [];

  if (localOverrides.length !== remoteOverrides.length) return false;

  for (let i = 0; i < localOverrides.length; i++) {
    const lo = localOverrides[i];
    const ro = remoteOverrides[i];
    if (lo.method !== ro.method || lo.minutes !== ro.minutes) return false;
  }

  return true;
}

// Determine if a local event has differences compared to its remote counterpart
function needsUpdate(local, remote) {
  if (local.summary !== (remote.summary || '')) return true;
  if ((local.description || '') !== (remote.description || '')) return true;
  if ((local.location || '') !== (remote.location || '')) return true;
  if ((local.colorId || '') !== (remote.colorId || '')) return true;
  if (!datesAreEqual(local.start, remote.start)) return true;
  if (!datesAreEqual(local.end, remote.end)) return true;
  
  const localRec = getRecurrenceArray(local.recurrence);
  const remoteRec = remote.recurrence;
  if (!arraysAreEqual(localRec, remoteRec)) return true;

  const localRem = getReminders(local);
  const remoteRem = remote.reminders || { useDefault: true };
  if (!remindersAreEqual(localRem, remoteRem)) return true;
  
  return false;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (dryRun) {
    console.log('=== DRY RUN ACTIVE (No changes will be written to Google Calendar) ===\n');
  }

  // 1. Read configurations and local events
  let config = {};
  try {
    config = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'));
  } catch (err) {
    console.warn(`Warning: Could not read config.json, using defaults.`, err.message);
  }

  let localEvents = [];
  try {
    localEvents = JSON.parse(await fs.readFile(EVENTS_PATH, 'utf8'));
  } catch (err) {
    console.error(`Error: Could not read events.json. Make sure the file exists and is valid JSON.`);
    process.exit(1);
  }

  // Validate local events
  const seenIds = new Set();
  for (const event of localEvents) {
    if (!event.id) {
      console.error('Error: Every event in events.json must have a unique "id" field.', event);
      process.exit(1);
    }
    if (seenIds.has(event.id)) {
      console.error(`Error: Duplicate event ID "${event.id}" found in events.json.`);
      process.exit(1);
    }
    seenIds.add(event.id);

    if (!event.start || !event.end) {
      console.error(`Error: Event "${event.id}" must have both "start" and "end" fields.`);
      process.exit(1);
    }
  }

  // 2. Authenticate
  console.log('Authenticating with Google APIs...');
  let auth;
  try {
    auth = await getAuthClient();
  } catch (err) {
    console.error('Authentication error:', err.message);
    process.exit(1);
  }

  const calendar = google.calendar({ version: 'v3', auth });

  // 3. Resolve target calendar ID
  let calendarId = config.calendarId;
  const targetName = config.calendarName || 'P5Routine';

  if (!calendarId || calendarId === 'auto-create') {
    console.log(`Checking for existing secondary calendar named "${targetName}"...`);
    try {
      const calendarList = await calendar.calendarList.list();
      const existing = calendarList.data.items.find(c => c.summary === targetName);
      
      if (existing) {
        calendarId = existing.id;
        console.log(`Found existing calendar "${targetName}" with ID: ${calendarId}`);
      } else {
        console.log(`Calendar "${targetName}" not found. Creating a new one...`);
        if (dryRun) {
          console.log(`[DRY RUN] Would create a new secondary calendar named "${targetName}"`);
          calendarId = 'dry-run-temp-id';
        } else {
          const newCalendar = await calendar.calendars.insert({
            requestBody: { summary: targetName }
          });
          calendarId = newCalendar.data.id;
          console.log(`Created calendar "${targetName}" with ID: ${calendarId}`);
        }
      }
    } catch (err) {
      console.error('Error finding/creating calendar:', err.message);
      process.exit(1);
    }
  } else {
    console.log(`Using configured calendar ID: ${calendarId}`);
  }

  // Retrieve calendar time zone
  let timeZone = 'Asia/Ho_Chi_Minh';
  if (calendarId !== 'dry-run-temp-id') {
    try {
      const calInfo = await calendar.calendars.get({ calendarId });
      timeZone = calInfo.data.timeZone || 'Asia/Ho_Chi_Minh';
      console.log(`Using calendar time zone: ${timeZone}`);
    } catch (err) {
      console.warn(`Warning: Could not fetch calendar time zone. Defaulting to ${timeZone}.`, err.message);
    }
  }

  // 4. Fetch existing sync-managed events
  let remoteEvents = [];
  if (calendarId !== 'dry-run-temp-id') {
    console.log('Fetching existing events from Google Calendar...');
    try {
      const res = await calendar.events.list({
        calendarId,
        privateExtendedProperty: 'syncSource=gg-calendar-cli',
        showDeleted: true,
        singleEvents: false,
        maxResults: 250
      });
      remoteEvents = res.data.items || [];
    } catch (err) {
      console.error(`Error listing events:`, err.message);
      process.exit(1);
    }
  }

  console.log(`Found ${remoteEvents.length} existing script-managed events on calendar.`);

  // 5. Diff local & remote events
  const localEventsMap = new Map(localEvents.map(e => [getGCalEventId(e.id), e]));
  const remoteEventsMap = new Map(remoteEvents.map(e => [e.id, e]));

  const toInsert = [];
  const toUpdate = [];
  const toDelete = [];

  for (const localEvent of localEvents) {
    const gcalId = getGCalEventId(localEvent.id);
    const remoteEvent = remoteEventsMap.get(gcalId);

    if (!remoteEvent || remoteEvent.status === 'cancelled') {
      if (!remoteEvent) {
        toInsert.push(localEvent);
      } else {
        toUpdate.push({ local: localEvent, remote: remoteEvent });
      }
    } else {
      if (needsUpdate(localEvent, remoteEvent)) {
        toUpdate.push({ local: localEvent, remote: remoteEvent });
      }
    }
  }

  for (const remoteEvent of remoteEvents) {
    if (remoteEvent.status !== 'cancelled' && !localEventsMap.has(remoteEvent.id)) {
      toDelete.push(remoteEvent);
    }
  }

  // 6. Execute operations
  console.log('\nSynchronization plan:');
  console.log(` - To Insert: ${toInsert.length}`);
  console.log(` - To Update: ${toUpdate.length}`);
  console.log(` - To Delete: ${toDelete.length}`);
  console.log('==================================================');

  // Insertions
  for (const event of toInsert) {
    const gcalId = getGCalEventId(event.id);
    console.log(`[INSERT] "${event.summary}" (ID: ${event.id})`);
    if (!dryRun) {
      try {
        await calendar.events.insert({
          calendarId,
          requestBody: {
            id: gcalId,
            summary: event.summary,
            description: event.description,
            location: event.location,
            colorId: event.colorId,
            start: formatDateTime(event.start, timeZone),
            end: formatDateTime(event.end, timeZone),
            recurrence: getRecurrenceArray(event.recurrence),
            reminders: getReminders(event),
            extendedProperties: {
              private: {
                syncSource: 'gg-calendar-cli',
                localId: event.id
              }
            }
          }
        });
      } catch (err) {
        console.error(`Failed to insert "${event.summary}":`, err.message);
      }
    }
  }

  // Updates
  for (const { local, remote } of toUpdate) {
    const gcalId = getGCalEventId(local.id);
    console.log(`[UPDATE] "${local.summary}" (ID: ${local.id})`);
    if (!dryRun) {
      try {
        await calendar.events.update({
          calendarId,
          eventId: gcalId,
          requestBody: {
            summary: local.summary,
            description: local.description,
            location: local.location,
            colorId: local.colorId,
            start: formatDateTime(local.start, timeZone),
            end: formatDateTime(local.end, timeZone),
            recurrence: getRecurrenceArray(local.recurrence),
            reminders: getReminders(local),
            status: 'confirmed',
            extendedProperties: {
              private: {
                syncSource: 'gg-calendar-cli',
                localId: local.id
              }
            }
          }
        });
      } catch (err) {
        console.error(`Failed to update "${local.summary}":`, err.message);
      }
    }
  }

  // Deletions
  for (const event of toDelete) {
    const localId = event.extendedProperties?.private?.localId || 'unknown';
    console.log(`[DELETE] "${event.summary}" (ID: ${localId})`);
    if (!dryRun) {
      try {
        await calendar.events.delete({
          calendarId,
          eventId: event.id
        });
      } catch (err) {
        console.error(`Failed to delete "${event.summary}":`, err.message);
      }
    }
  }

  console.log('\n==================================================');
  if (dryRun) {
    console.log('Dry run complete. No modifications were made.');
  } else {
    console.log('Synchronization complete!');
  }
}

main().catch(err => {
  console.error('Fatal error during execution:', err);
  process.exit(1);
});
