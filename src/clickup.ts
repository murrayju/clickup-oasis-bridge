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

  async fetch<T>(
    route: string,
    { json, ...options }: Options = {},
  ): Promise<T> {
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

    return res.json() as Promise<T>;
  }

  async teamFetch(route: string, options?: Options) {
    return this.fetch(`team/${this.teamId}/${route}`, options);
  }
}

export interface ClickUpWebhook {
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
}

export interface ClickUpWebhookResponse {
  id: string;
  webhook: ClickUpWebhook;
}

export interface ClickUpWebhooksResponse {
  webhooks: ClickUpWebhook[];
}

interface Status {
  id?: string;
  status: string | null;
  color: string;
  type: string;
  orderindex: number;
}

interface User {
  id: number;
  username: string;
  email: string;
  color: string;
  initials?: string;
  profilePicture: string | null;
}

export interface HistoryItem {
  id: string;
  type: number;
  date: string;
  field: string;
  parent_id: string;
  data: {
    status_type?: string;
    via?: string;
    trace_id?: string;
    subcategory_id?: string;
  };
  source: string | null;
  user: User;
  before: Status | null;
  after: Status | null;
}

export interface TaskCreatedEvent {
  event: 'taskCreated';
  history_items: HistoryItem[];
  task_id: string;
  webhook_id: string;
}

interface Checklist {
  id: string;
  name: string;
  orderindex: number;
  task_id: string;
  date_created: string;
  date_updated: string;
  resolved: number;
  items: {
    id: string;
    content: string;
    resolved: boolean;
    orderindex: number;
  }[];
}

interface BaseField {
  id: string;
  name: string;
  type: string;
  date_created: string;
  required: boolean;
  hide_from_guests: boolean;
  type_config: Record<string, unknown>;
}

interface LabelsOption {
  id: string;
  label: string;
  color: string | null;
}

interface LabelsField extends BaseField {
  type: 'labels';
  type_config: {
    options: LabelsOption[];
  };
  value: string[];
}

interface UrlField extends BaseField {
  type: 'url';
  value?: string;
}

interface CheckboxField extends BaseField {
  type: 'checkbox';
  value?: boolean;
}

interface TextField extends BaseField {
  type: 'short_text' | 'location' | 'date' | 'email' | 'phone';
  value?: string;
}

interface DropDownOption {
  id: string;
  name: string;
  color: string | null;
  orderindex: number;
}

export interface DropDownField extends BaseField {
  type: 'drop_down';
  type_config: {
    default: number;
    placeholder: string | null;
    new_drop_down?: boolean;
    options: DropDownOption[];
  };
  value?: number;
}

interface CurrencyField extends BaseField {
  type: 'currency';
  type_config: {
    default: null | string;
    precision: number;
    currency_type: string;
  };
  value?: string;
}

type Field =
  | LabelsField
  | UrlField
  | CheckboxField
  | TextField
  | DropDownField
  | CurrencyField;

export interface Task {
  id: string;
  custom_id: string | null;
  name: string;
  text_content: string;
  description: string;
  status: Status;
  orderindex: string;
  date_created: string;
  date_updated: string;
  date_closed: string | null;
  date_done: string | null;
  archived: boolean;
  creator: User;
  assignees: User[];
  watchers: User[];
  checklists: Checklist[];
  tags: string[];
  parent: null;
  priority: null;
  due_date: string | null;
  start_date: string | null;
  points: null;
  time_estimate: null;
  time_spent: number;
  custom_fields: Field[];
  dependencies: null[];
  linked_tasks: null[];
  team_id: string;
  url: string;
  sharing: {
    public: boolean;
    public_share_expires_on: string | null;
    public_fields: string[];
    token: string | null;
    seo_optimized: boolean;
  };
  permission_level: string;
  list: {
    id: string;
    name: string;
    access: boolean;
  };
  project: {
    id: string;
    name: string;
    hidden: boolean;
    access: boolean;
  };
  folder: {
    id: string;
    name: string;
    hidden: boolean;
    access: boolean;
  };
  space: {
    id: string;
  };
  attachments: null[];
}

export class ClickUpTask {
  task: Task;

  constructor(task: Task) {
    this.task = task;
  }

  get id(): string {
    return this.task.id;
  }

  getField(name: string, type?: string): Field | null {
    let prefixMatch = null;
    for (const field of this.task.custom_fields) {
      if (type && field.type !== type) {
        continue;
      }
      if (field.id === name || field.name === name) {
        return field;
      }
      if (field.name.startsWith(name) && !prefixMatch) {
        prefixMatch = field;
      }
    }
    return prefixMatch;
  }

  getDropdownOption(name: string): DropDownOption | null {
    const field = this.getField(name, 'drop_down');
    if (field?.value == null || field.type !== 'drop_down') {
      return null;
    }
    return field.type_config.options[field.value];
  }

  getDropdownString(name: string): string | null {
    return this.getDropdownOption(name)?.name || null;
  }

  getLabelsOptions(name: string): LabelsOption[] | null {
    const field = this.getField(name, 'labels');
    if (field?.value == null || field.type !== 'labels') {
      return null;
    }
    return field.value
      .map((v) => field.type_config.options.find((o) => o.id === v))
      .filter((v): v is LabelsOption => !!v);
  }

  getLabelsStrings(name: string): string[] | null {
    return this.getLabelsOptions(name)?.map((o) => o.label) || null;
  }

  getString(name: string, type?: string): string | null {
    const field = this.getField(name, type);
    if (
      field?.value == null ||
      (field.type !== 'short_text' &&
        field.type !== 'location' &&
        field.type !== 'date' &&
        field.type !== 'email' &&
        field.type !== 'currency' &&
        field.type !== 'phone')
    ) {
      return null;
    }
    return field.value || null;
  }

  getNumber(name: string, type?: string): number | null {
    const field = this.getField(name, type);
    if (field?.value == null || field.type !== 'currency') {
      return null;
    }
    return parseFloat(field.value);
  }
}
