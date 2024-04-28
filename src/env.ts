import dotenv from 'dotenv';

const { error } = dotenv.config();
if (error) {
  console.error('Invalid .env file', error);
  process.exit(1);
}

if (!process.env.CLICKUP_API_TOKEN) {
  throw new Error('Missing CLICKUP_API_TOKEN in .env');
}
if (!process.env.CLICKUP_TEAM_ID) {
  throw new Error('Missing CLICKUP_TEAM_ID in .env');
}
if (!process.env.OASIS_API_TOKEN) {
  throw new Error('Missing OASIS_API_TOKEN in .env');
}
if (!process.env.OASIS_BASE_URL) {
  throw new Error('Missing OASIS_BASE_URL in .env');
}

export const {
  CLICKUP_API_TOKEN,
  CLICKUP_TEAM_ID,
  CLICKUP_LIST_ID,
  CLICKUP_POLL_INTERVAL,
  CLICKUP_STATUS_TODO = 'to-do',
  CLICKUP_STATUS_ERROR = 'stuck',
  CLICKUP_STATUS_PROCESSING = 'processing',
  CLICKUP_STATUS_SUCCESS = 'in oasis',
  DEFAULT_COUNTY_NAME,
  OASIS_API_TOKEN,
  OASIS_BASE_URL,
  USE_CACHED_COUNTIES,
  USE_CACHED_DETAILS,
  USE_CACHED_GROUPS,
  WEBHOOK_HEALTHCHECK_INTERVAL,
  DELETE_EXISTING_WEBHOOKS,
  IMPORT_TEST_CASE_AND_EXIT,
  LOG_LEVEL = 'info',
  NGROK_AUTH_TOKEN,
  PORT = '80',
  PUBLIC_URL,
  WEBHOOK_IMPORT_DELAY_SEC = '10',
} = process.env;
