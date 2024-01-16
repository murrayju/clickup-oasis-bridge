import crypto from 'crypto';
import dotenv from 'dotenv';
import express, { NextFunction, type Request, type Response } from 'express';
import ngrok from 'ngrok';

import {
  ClickUpService,
  TaskCreatedEvent,
  ClickUpWebhookResponse,
  ClickUpWebhooksResponse,
  Task,
  ClickUpTask,
} from './clickup.js';
import { OasisService } from './oasis.js';
import { logger } from './logger.js';
import {
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
  PORT,
  PUBLIC_URL,
  CLICKUP_STATUS_TODO,
  NGROK_AUTH_TOKEN,
} from './env.js';

const clickUpService = new ClickUpService(CLICKUP_API_TOKEN, CLICKUP_TEAM_ID);
const oasisService = new OasisService(OASIS_API_TOKEN, OASIS_BASE_URL);
const port = parseInt(PORT, 10);
const publicUrl =
  PUBLIC_URL ||
  (await ngrok.connect({ addr: port, authtoken: NGROK_AUTH_TOKEN }));
logger.info(`Using public URL: ${publicUrl}`);
const webhookEndpoint = `${publicUrl}/webhook`;

if (DELETE_EXISTING_WEBHOOKS) {
  const { webhooks } = (await clickUpService.teamFetch(
    `webhook`,
  )) as ClickUpWebhooksResponse;
  const filters = DELETE_EXISTING_WEBHOOKS.split(',');
  const onlyFailing = filters.includes('failing');
  const onlyMatching = filters.includes('matching');
  for (const webhook of webhooks) {
    if (
      (onlyFailing && webhook.health?.status !== 'failing') ||
      (onlyMatching && webhook.endpoint !== webhookEndpoint)
    ) {
      continue;
    }
    await clickUpService.fetch(`webhook/${webhook.id}`, {
      method: 'DELETE',
    });
    logger.info(`deleted webhook ${webhook.id}`);
  }
}

const groups = USE_CACHED_GROUPS
  ? oasisService.setGroups((await import('./fixtures/groups.js')).groups)
  : await oasisService.getGroups();
logger.info(`Loaded ${groups.length} Groups`);

const details = USE_CACHED_DETAILS
  ? oasisService.setDetails((await import('./fixtures/details.js')).details)
  : await oasisService.getDetails();
logger.info(`Loaded ${details.length} Details`);

if (IMPORT_TEST_CASE_AND_EXIT) {
  await oasisService.importClickUpTaskById(
    clickUpService,
    IMPORT_TEST_CASE_AND_EXIT,
  );
  process.exit(0);
}

const { webhook } = (await clickUpService.teamFetch('webhook', {
  method: 'POST',
  json: {
    endpoint: webhookEndpoint,
    events: ['taskCreated'],
  },
})) as ClickUpWebhookResponse;
logger.info(`registered webhook: ${webhook.id}`);

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
        logger.info(
          `webhook health check: ${health.status}, ${health.fail_count}`,
        );
      } catch (err) {
        logger.error('webhook health check failed:', err);
      }
    },
    parseInt(WEBHOOK_HEALTHCHECK_INTERVAL, 10) * 1000,
  );
}

const processingTasks: Map<string, Promise<void>> = new Map();
const processTaskWithLock = async <T>(
  taskId: string,
  task: () => Promise<T>,
): Promise<T> => {
  await processingTasks.get(taskId);
  const promise = task();
  processingTasks.set(
    taskId,
    promise
      .then(
        () => {},
        () => {},
      )
      .finally(() => {
        processingTasks.delete(taskId);
      }),
  );
  return promise;
};

let pollInterval: NodeJS.Timeout | null = null;
let processingList: null | Promise<void> = null;
if (CLICKUP_POLL_INTERVAL && CLICKUP_LIST_ID) {
  pollInterval = setInterval(
    () => {
      if (processingList) {
        logger.warn('still processing from previous interval');
        return;
      }
      processingList = (async () => {
        const { tasks } = await clickUpService.fetch<{ tasks: Task[] }>(
          `list/${CLICKUP_LIST_ID}/task`,
          {
            searchParams: {
              'statuses[]': CLICKUP_STATUS_TODO,
            },
          },
        );
        logger.info(`found ${tasks.length} task(s) to process`);

        // process in series to avoid oasis rate limiting
        for (const task of tasks) {
          logger.info(`processing task ${task.id}`);
          await processTaskWithLock(task.id, () =>
            oasisService
              .importClickUpTask(clickUpService, new ClickUpTask(task))
              .catch(() => {
                // already logged, keep processing list
              }),
          );
        }
      })()
        .catch((err) => {
          logger.error(err);
        })
        .finally(() => {
          processingList = null;
        });
    },
    parseInt(CLICKUP_POLL_INTERVAL, 10) * 1000,
  );
}

const app = express();

app.post(
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
        logger.warn('webhook signature mismatch');
        return res.sendStatus(400);
      }
      req.body = JSON.parse(data);
      if (req.body.webhook_id !== webhook.id) {
        logger.warn('webhook id mismatch');
        return res.sendStatus(400);
      }

      next();
    });
  },
  // handle webhook request
  (req: Request, res: Response) => {
    // logger.debug('webhook received:', req.body.event);

    // clickup retries webhooks if we don't respond within 7 seconds
    // so just respond to consider it handled, whether we succeed or not below
    res.sendStatus(200);

    // processing is async to the http request itself
    (async () => {
      switch (req.body.event) {
        case 'taskCreated': {
          const taskCreated: TaskCreatedEvent = req.body;
          const taskId = taskCreated.task_id;
          logger.info(`webhook(taskCreated): ${taskId}`);

          await processTaskWithLock(taskId, () =>
            oasisService.importClickUpTaskById(clickUpService, taskId),
          );
          break;
        }
        default: {
          logger.warn(`unhandled webhook event: ${req.body.event}`);
          res.sendStatus(200);
          break;
        }
      }
    })().catch((err) => {
      logger.error(err);
    });
  },
);

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error(err);
  res.sendStatus(500);
});

const server = app.listen(port, () => {
  logger.info(`Server listening on port ${port}`);
});

// delete webhook on process exit
process.on('SIGINT', async () => {
  logger.info('shutting down');
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
    logger.info('webhook deleted');
  } catch (err) {
    logger.error(err);
  }
  await ngrok.kill();
  process.exit(0);
});
