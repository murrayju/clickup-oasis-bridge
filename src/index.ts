import crypto from 'crypto';
import dotenv from 'dotenv';
import express, { NextFunction, type Request, type Response } from 'express';
import Router from 'express-promise-router';
import ngrok from 'ngrok';

import {
  ClickUpService,
  TaskCreatedEvent,
  ClickUpWebhookResponse,
  ClickUpWebhooksResponse,
  Task,
  ClickUpTask,
} from './clickup';
import { OasisService } from './oasis';

const { error } = dotenv.config();
if (error) {
  console.error('Invalid .env file', error);
  process.exit(1);
}

const {
  CLICKUP_API_TOKEN,
  CLICKUP_TEAM_ID,
  CLICKUP_LIST_ID,
  CLICKUP_POLL_INTERVAL,
  OASIS_API_TOKEN,
  OASIS_BASE_URL,
  USE_CACHED_DETAILS,
  USE_CACHED_GROUPS,
  WEBHOOK_HEALTHCHECK_INTERVAL,
  DELETE_EXISTING_WEBHOOKS,
  IMPORT_TEST_CASE_AND_EXIT,
} = process.env;
if (!CLICKUP_API_TOKEN) {
  throw new Error('Missing CLICKUP_API_TOKEN in .env');
}
if (!CLICKUP_TEAM_ID) {
  throw new Error('Missing CLICKUP_TEAM_ID in .env');
}
if (!OASIS_API_TOKEN) {
  throw new Error('Missing OASIS_API_TOKEN in .env');
}
if (!OASIS_BASE_URL) {
  throw new Error('Missing OASIS_BASE_URL in .env');
}
const clickUpService = new ClickUpService(CLICKUP_API_TOKEN, CLICKUP_TEAM_ID);
const oasisService = new OasisService(OASIS_API_TOKEN, OASIS_BASE_URL);

if (DELETE_EXISTING_WEBHOOKS) {
  const { webhooks } = (await clickUpService.teamFetch(
    `webhook`,
  )) as ClickUpWebhooksResponse;
  for (const webhook of webhooks) {
    await clickUpService.fetch(`webhook/${webhook.id}`, {
      method: 'DELETE',
    });
    console.info(`deleted webhook ${webhook.id}`);
  }
}

const groups = USE_CACHED_GROUPS
  ? oasisService.setGroups((await import('./fixtures/groups')).groups)
  : await oasisService.getGroups();
console.info(`Loaded ${groups.length} Groups`);

const details = USE_CACHED_DETAILS
  ? oasisService.setDetails((await import('./fixtures/details')).details)
  : await oasisService.getDetails();
console.info(`Loaded ${details.length} Details`);

if (IMPORT_TEST_CASE_AND_EXIT) {
  await oasisService.importClickUpTaskById(
    clickUpService,
    IMPORT_TEST_CASE_AND_EXIT,
  );
  process.exit(0);
}

const port = parseInt(process.env.PORT || '80', 10);
const publicUrl = process.env.PUBLIC_URL || (await ngrok.connect(port));
console.info('Using public URL:', publicUrl);

const { webhook } = (await clickUpService.teamFetch('webhook', {
  method: 'POST',
  json: {
    endpoint: `${publicUrl}/webhook`,
    events: ['taskCreated'],
  },
})) as ClickUpWebhookResponse;
console.info('registered webhook', webhook.id);

let healthInterval: NodeJS.Timeout | null = null;
if (WEBHOOK_HEALTHCHECK_INTERVAL) {
  healthInterval = setInterval(
    async () => {
      try {
        const { webhooks } = (await clickUpService.teamFetch(
          `webhook`,
        )) as ClickUpWebhooksResponse;
        const health = webhooks?.find((w) => w.id === webhook.id)?.health;
        if (!health) {
          throw new Error('webhook not found');
        }
        console.info(
          `webhook health check: ${health.status}, ${health.fail_count}`,
        );
      } catch (err) {
        console.error('webhook health check failed:', err);
      }
    },
    parseInt(WEBHOOK_HEALTHCHECK_INTERVAL, 10) * 1000,
  );
}

let pollInterval: NodeJS.Timeout | null = null;
let processing = false;
if (CLICKUP_POLL_INTERVAL && CLICKUP_LIST_ID) {
  pollInterval = setInterval(
    async () => {
      if (processing) {
        console.warn('still processing from previous interval');
        return;
      }
      try {
        const { tasks } = await clickUpService.fetch<{ tasks: Task[] }>(
          `list/${CLICKUP_LIST_ID}/task`,
          {
            searchParams: {
              'statuses[]': 'TO-DO',
            },
          },
        );
        console.info(`found ${tasks.length} task(s) to process`);
        for (const task of tasks) {
          console.info(`processing task ${task.id}`);
          try {
            await oasisService.importClickUpTask(
              clickUpService,
              new ClickUpTask(task),
            );
          } catch (err) {
            // already logged
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        processing = false;
      }
    },
    parseInt(CLICKUP_POLL_INTERVAL, 10) * 1000,
  );
}

const app = express();
const router = Router();
app.use(router);

router.post(
  '/webhook',
  // verify webhook signature
  (req: Request, res: Response, next: NextFunction) => {
    let data = '';
    req.on('data', function (chunk) {
      data += chunk;
    });
    req.on('end', function () {
      const hash = crypto
        .createHmac('sha256', webhook.secret)
        .update(data)
        .digest('hex');
      if (req.headers['x-signature'] !== hash) {
        console.warn('webhook signature mismatch');
        return res.sendStatus(400);
      }
      req.body = JSON.parse(data);
      if (req.body.webhook_id !== webhook.id) {
        console.warn('webhook id mismatch');
        return res.sendStatus(400);
      }

      next();
    });
  },
  // handle webhook request
  async (req: Request, res: Response) => {
    console.log('webhook received:', req.body.event);

    switch (req.body.event) {
      case 'taskCreated': {
        const taskCreated: TaskCreatedEvent = req.body;
        const taskId = taskCreated.task_id;
        console.info(`taskCreated: ${taskId}`);
        await oasisService.importClickUpTaskById(clickUpService, taskId, () => {
          // consider successful if we created a case
          // clickup retries webhooks if we don't respond in 7 seconds
          res.sendStatus(200);
        });
        break;
      }
      default: {
        console.warn('unhandled event', req.body.event);
        res.sendStatus(200);
        break;
      }
    }
  },
);

router.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err);
  res.sendStatus(500);
});

const server = app.listen(port, () => {
  console.info(`Server listening on port ${port}`);
});

// delete webhook on process exit
process.on('SIGINT', async () => {
  console.info('shutting down');
  if (healthInterval) {
    clearInterval(healthInterval);
  }
  if (pollInterval) {
    clearInterval(pollInterval);
  }
  server.close();
  try {
    await clickUpService.fetch(`webhook/${webhook.id}`, {
      method: 'DELETE',
    });
    console.info('webhook deleted');
  } catch (err) {
    console.error(err);
  }
  await ngrok.kill();
  process.exit(0);
});
