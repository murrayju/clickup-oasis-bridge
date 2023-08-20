import fetch, { type RequestInit } from 'node-fetch';

interface Options extends RequestInit {
  json?: Record<string, unknown>;
}

export class ClickUpService {
  private baseUrl = 'https://api.clickup.com/api/v2/';
  private token: string;
  private teamId: string;

  constructor(token: string, teamId: string) {
    this.token = token;
    this.teamId = teamId;
  }

  async fetch(route: string, { json, ...options }: Options = {}) {
    const url = `${this.baseUrl}${route}`;

    console.info(`${options?.method ?? 'GET'} ${url}`);
    const res = await fetch(url, {
      ...(json && { body: JSON.stringify(json) }),
      ...options,
      headers: {
        Authorization: this.token,
        ...(json && { 'Content-Type': 'application/json' }),
        ...options.headers,
      },
    });

    if (!res.ok) {
      throw new Error(`ClickUp API error: ${res.status} ${res.statusText}`);
    }

    return res.json();
  }

  async teamFetch(route: string, options?: Options) {
    return this.fetch(`team/${this.teamId}/${route}`, options);
  }
}

export interface ClickUpWebhook {
  id: string;
  webhook: {
    id: string;
    userid: number;
    team_id: number;
    endpoint: string;
    client_id: string;
    events: string[];
    task_id: string | null;
    list_id: number | null;
    folder_id: number | null;
    space_id: number | null;
    health: {
      status: string;
      fail_count: number;
    };
    secret: string;
  };
}
