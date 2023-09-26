import crypto from 'crypto';
import dotenv from 'dotenv';
import express, { NextFunction, type Request, type Response } from 'express';
import Router from 'express-promise-router';
import ngrok from 'ngrok';
import fs from 'fs';

import {
  ClickUpService,
  TaskCreatedEvent,
  type ClickUpWebhook,
  ClickUpTask,
} from './clickup';
import { Case, OasisService } from './oasis';

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
})) as ClickUpWebhook;
console.info('registered webhook', webhook.id);

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
    if (req.body.event === 'taskCreated') {
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
      console.log('posting data:', data);

      // The trailing slash on `cases/` is important
      const result: Case = await oasisService.fetch('cases/', {
        json: data,
        method: 'POST',
      });
      console.info(`Case created: ${result.url}`);
      console.info(`Case: ${JSON.stringify(result, null, 2)}`);
    }

    res.sendStatus(200);
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
