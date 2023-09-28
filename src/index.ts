import crypto from 'crypto';
import dotenv from 'dotenv';
import express, { NextFunction, type Request, type Response } from 'express';
import Router from 'express-promise-router';
import ngrok from 'ngrok';

import {
  ClickUpService,
  TaskCreatedEvent,
  type ClickUpWebhook,
  ClickUpTask,
  ClickUpWebhookResponse,
  ClickUpWebhooksResponse,
} from './clickup';
import { Case, OasisService } from './oasis';
import { OasisGroup, mapDemographic } from './demographics';

const { error } = dotenv.config();
if (error) {
  console.error('Invalid .env file', error);
  process.exit(1);
}

const {
  CLICKUP_API_TOKEN,
  CLICKUP_TEAM_ID,
  OASIS_API_TOKEN,
  OASIS_BASE_URL,
  USE_CACHED_DETAILS,
  USE_CACHED_GROUPS,
  WEBHOOK_HEALTHCHECK_INTERVAL,
  DELETE_EXISTING_WEBHOOKS,
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

if (WEBHOOK_HEALTHCHECK_INTERVAL) {
  setInterval(
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
    parseInt(WEBHOOK_HEALTHCHECK_INTERVAL, 10),
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
        const task = new ClickUpTask(
          await clickUpService.fetch(`task/${taskCreated.task_id}`),
        );
        console.info(`taskCreated: ${task.id}`);

        const data = {
          first_name: `${task.getString('First Name')}`,
          last_name: `${task.getString('Last Name')}`,
          date_of_birth: `${task.getDropdownString(
            'Date of Birth Year',
          )}-${task.getDropdownString(
            'Date of Birth Month',
          )}-${task.getDropdownString('Date of Birth Day')}`,
          email: `${task.getString('Email')}`,
          head_of_household: true,
          street_address: `${task.getString('Address')}`,
          street_city: `${task.getString('City')}`,
          street_zip_code: `${task.getString('Zip Code')}`,
          yearly_income:
            (task.getNumber('Gross Household Income (Monthly)', 'currency') ??
              0) * 12,
        };
        console.debug(`t[${task.id}] creating case with data:`, data);
        // The trailing slash on `cases/` is important
        const newCase: Case = await oasisService.fetch('cases/', {
          json: data,
          method: 'POST',
        });
        console.info(`t[${task.id}] case created: ${newCase.url}`);
        const cLog = (str: string) => `c[${newCase.id}] ${str}`;
        console.debug(cLog(JSON.stringify(newCase, null, 2)));

        // consider successful if we created a case
        // clickup is quick to retry if we take too long
        res.sendStatus(200);

        // Phone number
        const phoneDesc = task.getDropdownString('Phone Number');
        const phoneNumRaw = task.getString('Phone Number', 'phone');
        if (phoneDesc && phoneNumRaw) {
          // Format as expected if possible
          const match = phoneNumRaw.match(/\+1 (\d{3}) (\d{3}) (\d{4})/);
          const phoneNum = match
            ? `${match[1]}-${match[2]}-${match[3]}`
            : phoneNumRaw;
          try {
            await oasisService.addPhoneNumber(newCase, phoneDesc, phoneNum);
            console.debug(cLog(`set phone number(${phoneDesc}, ${phoneNum})`));
          } catch (err) {
            console.error(
              cLog(`failed to set phone number(${phoneDesc}, ${phoneNum})`),
              err,
            );
          }
        } else {
          console.info(cLog('missing phone number'));
        }

        // Income
        const income = task.getString(
          'Gross Household Income (Monthly)',
          'currency',
        );
        if (income) {
          try {
            await oasisService.addIncomeSource(newCase, income);
            console.debug(cLog(`set income(${income})`));
          } catch (err) {
            console.error(cLog(`failed to set income(${income})`), err);
          }
        } else {
          console.info(cLog(`income not specified`));
        }

        // Demographics
        for (const groupName of Object.values(OasisGroup)) {
          const { detailNames, value } = mapDemographic(groupName, task);
          const logStr = `set demographic(${groupName}, ${detailNames}, ${value})`;
          try {
            await oasisService.addCaseDetails(
              newCase,
              groupName,
              detailNames,
              value,
            );
            console.debug(cLog(logStr));
          } catch (err) {
            console.error(cLog(`failed to ${logStr}`), err);
          }
        }
        console.info(cLog(`job complete`));
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
