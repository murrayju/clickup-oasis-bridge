import fetch, { type RequestInit } from 'node-fetch';

interface Options extends RequestInit {
  json?: Record<string, unknown>;
}

export class OasisService {
  private baseUrl: string;
  private token: string;

  constructor(token: string, baseUrl: string) {
    this.token = token;
    this.baseUrl = baseUrl;
  }

  async fetch(route: string, { json, ...options }: Options = {}) {
    const url = `${this.baseUrl}${route}`;

    console.info(`${options?.method ?? 'GET'} ${url}`);
    const res = await fetch(url, {
      ...(json && { body: JSON.stringify(json) }),
      ...options,
      headers: {
        Authorization: `Token ${this.token}`,
        ...(json && { 'Content-Type': 'application/json' }),
        ...options.headers,
      },
    });

    if (!res.ok) {
      throw new Error(`ClickUp API error: ${res.status} ${res.statusText}`);
    }

    return res.json();
  }
}
