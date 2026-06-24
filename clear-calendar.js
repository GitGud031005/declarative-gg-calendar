import { google } from 'googleapis';
import { getAuthClient } from './auth.js';

async function main() {
  console.log('Authenticating with Google APIs...');
  const auth = await getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const targetName = 'P5Routine';
  console.log(`Searching for secondary calendar named "${targetName}"...`);
  
  const calendarList = await calendar.calendarList.list();
  const existing = calendarList.data.items.find(c => c.summary === targetName);

  if (existing) {
    console.log(`Found calendar "${targetName}" with ID: ${existing.id}`);
    console.log('Deleting calendar to remove all old events...');
    await calendar.calendars.delete({ calendarId: existing.id });
    console.log(`Calendar "${targetName}" deleted successfully.`);
  } else {
    console.log(`Calendar "${targetName}" not found.`);
  }
}

main().catch(err => {
  console.error('Error clearing calendar:', err.message);
  process.exit(1);
});
