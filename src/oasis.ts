interface Options extends RequestInit {
  formData?: Record<string, string>;
  json?: Record<string, unknown>;
}

export class OasisService {
  private baseUrl: string;
  private token: string;
  private groups: Group[] | null = null;
  private _groupMap: Map<string, Group> = new Map();
  private details: Detail[] | null = null;
  private _detailsMap: Map<string, Detail[]> = new Map();

  constructor(token: string, baseUrl: string) {
    this.token = token;
    this.baseUrl = baseUrl;
  }

  async fetch<T>(
    route: string,
    { formData: passedFormData, json, ...options }: Options = {},
  ): Promise<T> {
    const url = route.startsWith(this.baseUrl)
      ? route
      : `${this.baseUrl}${route}`;
    console.info(`${options?.method ?? 'GET'} ${url}`);

    let formData;
    if (passedFormData) {
      formData = new FormData();
      for (const [key, value] of Object.entries(passedFormData)) {
        formData.set(key, value);
      }
    }

    const res = await fetch(url, {
      ...(formData && { body: formData }),
      ...(json && { body: JSON.stringify(json) }),
      ...options,
      headers: {
        Authorization: `Token ${this.token}`,
        ...(json && { 'Content-Type': 'application/json' }),
        ...options.headers,
      },
    });

    if (!res.ok) {
      try {
        console.error(await res.text());
      } finally {
        throw new Error(`Oasis API error: ${res.status} ${res.statusText}`);
      }
    }

    return res.json() as Promise<T>;
  }

  async fetchPaged<T>(route: string): Promise<T[]> {
    let next: string | null = route;
    const results: T[] = [];
    do {
      const response: PagedResponse<T> = await this.fetch(next);
      results.push(...response.results);
      next = response.next;
    } while (next);
    return results;
  }

  async fetchAllDetails(): Promise<Detail[]> {
    return this.fetchPaged('details/');
  }

  // cached
  async getDetails(refresh = false): Promise<Detail[]> {
    if (refresh) {
      this._detailsMap.clear();
    }
    if (refresh || !this.details) {
      this.details = await this.fetchAllDetails();
    }
    return this.details;
  }

  get detailsMap(): Map<string, Detail[]> {
    if (!this._detailsMap.size && this.details) {
      for (const detail of this.details) {
        const detailName = detail.name.toLowerCase();
        if (!this._detailsMap.has(detailName)) {
          this._detailsMap.set(detailName, []);
        }
        this._detailsMap.get(detailName)!.push(detail);
      }
    }
    return this._detailsMap;
  }

  setDetails(details: Detail[]): Detail[] {
    this.details = details;
    this._detailsMap.clear();
    return details;
  }

  async fetchAllGroups(): Promise<Group[]> {
    return this.fetchPaged('groups/');
  }

  // cached
  async getGroups(refresh = false): Promise<Group[]> {
    if (refresh) {
      this._groupMap.clear();
    }
    if (refresh || !this.groups) {
      this.groups = await this.fetchAllGroups();
    }
    return this.groups;
  }

  get groupMap(): Map<string, Group> {
    if (!this._groupMap.size && this.groups) {
      for (const group of this.groups) {
        this._groupMap.set(group.name.toLowerCase(), group);
      }
    }
    return this._groupMap;
  }

  setGroups(groups: Group[]): Group[] {
    this.groups = groups;
    this._groupMap.clear();
    return groups;
  }

  async addPhoneNumber(c: Case, description: string, number: string) {
    return this.fetch('phone_numbers/', {
      method: 'POST',
      json: {
        case: c.url,
        description,
        number,
      },
    });
  }

  async addIncomeSource(
    c: Case,
    amount: string,
    interval = 'month',
    name = 'Unspecified',
  ) {
    return this.fetch('income_sources/', {
      method: 'POST',
      json: {
        case: c.url,
        amount,
        interval,
        name,
      },
    });
  }

  async addCaseDetails(
    c: Case,
    groupName: string,
    detailNames: string[] | string | null,
    value?: string | null,
  ): Promise<Detail[]> {
    if (!detailNames) {
      throw new Error(`No detail name provided`);
    }
    await this.getGroups();
    const group = this.groupMap.get(groupName.toLowerCase());
    if (!group) {
      throw new Error(`Group not found: ${groupName}`);
    }
    await this.getDetails();

    const results: Detail[] = [];
    for (const detailName of Array.isArray(detailNames)
      ? detailNames
      : [detailNames]) {
      const details = this.detailsMap.get(detailName.toLowerCase());
      if (!details) {
        throw new Error(`No details found matching: ${detailName}`);
      }
      const detail = details.find((d) => d.group === group.url);
      if (!detail) {
        throw new Error(
          `Detail '${detailName}' not found in group ${groupName}`,
        );
      }
      results.push(
        await this.fetch('case_details/', {
          method: 'POST',
          json: {
            case: c.url,
            detail: detail.url,
            value,
          },
        }),
      );
    }
    return results;
  }
}

export interface Detail {
  url: string;
  group: string;
  name: string;
  index: number;
  template_key: string;
  other_input: boolean;
  show_groups: string[];
  import_id: string;
  import_date: null | string;
}

export interface Group {
  url: string;
  name: string;
  index: number;
  template_key: string;
  group_type: string;
  case_tab: string;
  section: string;
  special_function: string;
  allow_other: boolean;
  required: boolean;
  auto_copy: boolean;
  report_summary: boolean;
  searchable: boolean;
  display_in_relationships: boolean;
  display_in_sidebar: boolean;
  display_in_barcode: boolean;
  alternate_label: string;
  quick_add_members: boolean;
  disabled: boolean;
  hide_by_default: boolean;
  import_id: string;
  import_date: null | string;
  export_filter: boolean;
}

export interface PagedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface Case {
  url: string;
  id: number;
  first_name: string;
  middle_name: string;
  last_name: string;
  suffix: string;
  nickname: string;
  maiden_name: string;
  date_of_birth: string;
  email: string;
  head_of_household: boolean;
  mailing_address: string;
  mailing_apt_number: string;
  mailing_city: string;
  mailing_state: string;
  mailing_zip_code: string;
  ss_number: string;
  street_address: string;
  street_apt_number: string;
  street_city: string;
  street_state: string;
  street_zip_code: string;
  yearly_expenses: number;
  yearly_income: number;
  mod_date: string;
  roi_exp_date: null | string;
  deceased: boolean;
  entry_date: string;
  private: boolean;
  entry_agent: string;
  mod_agent: string;
  group: Record<string, unknown>;
  household: string;
  casedetail_set: null[];
  phonenumber_set: null[];
  expense_set: null[];
  identificationnumber_set: null[];
  incomesource_set: null[];
  releaseofinformation_set: null[];
  relationship_set: null[];
  reverse_relationship_set: null[];
}
