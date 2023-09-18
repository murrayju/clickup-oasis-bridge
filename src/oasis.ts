interface Options extends RequestInit {
  formData?: Record<string, string>;
  json?: Record<string, unknown>;
}

export class OasisService {
  private baseUrl: string;
  private token: string;

  constructor(token: string, baseUrl: string) {
    this.token = token;
    this.baseUrl = baseUrl;
  }

  async fetch<T>(
    route: string,
    { formData: passedFormData, json, ...options }: Options = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${route}`;
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
