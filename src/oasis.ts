import {
  ClickUpService,
  ClickUpTask,
  SimplifiedCommentContent,
} from './clickup';
import { logger } from './logger';

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
    logger.info(`${options?.method ?? 'GET'} ${url}`);

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
      let text;
      try {
        text = await res.text();
      } finally {
        throw new Error(
          `Oasis API error: ${res.status} ${res.statusText}${
            text ? `\n${text}` : ''
          }`,
        );
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

  async createCase(caseData: Partial<Case>): Promise<Case> {
    logger.debug(`creating case with data:`, caseData);
    // The trailing slash on `cases/` is important
    return this.fetch<Case>('cases/', {
      method: 'POST',
      json: caseData,
    });
  }

  constructDOB(
    year: string | null,
    month: string | null,
    day: string | null,
  ): string | null {
    return year
      ? `${year}${month ? `-${month}${day ? `-${day}` : ''}` : ''}`
      : null;
  }

  async importClickUpTask(
    clickUpService: ClickUpService,
    task: ClickUpTask,
  ): Promise<Case> {
    if (task.task.status.status?.toLowerCase() !== 'to-do') {
      throw new Error(
        `Task ${task.id} is not in TO-DO status, cannot import. Current status: ${task.task.status.status}`,
      );
    }
    let log = logger.child({ t: task.id });
    const jobLogs: SimplifiedCommentContent[] = [];
    const jLog = (...lines: SimplifiedCommentContent[]) => {
      for (const line of lines) {
        jobLogs.push(line);
        log.info(line);
      }
    };
    try {
      const existingCase = task.getString('case_url');
      if (existingCase) {
        throw new Error(`Task already has case: ${existingCase}`);
      }
      const hohCase = await this.createCase({
        first_name: task.getString('hoh_fn') || '',
        last_name: task.getString('hoh_lname') || '',
        date_of_birth:
          this.constructDOB(
            task.getDropdownString('hoh_dob_y'),
            task.getDropdownString('hoh_dob_m'),
            task.getDropdownString('hoh_dob'),
          ) || '',
        email: task.getString('hoh_email') || '',
        head_of_household: true,
        street_address: task.getString('hoh_add') || '',
        street_apt_number: task.getString('hoh_apt') || '',
        street_city: task.getString('hoh_city') || '',
        street_zip_code: task.getString('hoh_zip') || '',
      });
      log = log.child({ c: hohCase.id });
      const hohUrl = caseToUrl(hohCase);
      jLog(`HoH case created: ${hohUrl}`);
      log.debug(JSON.stringify(hohCase, null, 2));

      // Set case url on clickup task
      const clickUpFields = await clickUpService.getCustomFields(
        task.task.list.id,
      );
      const urlField = clickUpFields.find((f) => f.name === 'case_url');
      if (urlField?.id) {
        await clickUpService.fetch(`task/${task.id}/field/${urlField.id}`, {
          method: 'POST',
          json: {
            value: hohUrl,
          },
        });
        log.debug(`set case url(${hohUrl})`);
      }

      // Phone number
      const phoneDesc = task.getDropdownString('hoh_phone_type');
      const phoneNumRaw = task.getString('hoh_phone_number', 'phone');
      if (phoneDesc && phoneNumRaw) {
        // Format as expected if possible
        const match = phoneNumRaw.match(/\+1 (\d{3}) (\d{3}) (\d{4})/);
        const phoneNum = match
          ? `${match[1]}-${match[2]}-${match[3]}`
          : phoneNumRaw;
        try {
          await this.addPhoneNumber(hohCase, phoneDesc, phoneNum);
          log.info(`set phone number(${phoneDesc}, ${phoneNum})`);
        } catch (err) {
          jLog(
            `failed to set phone number(${phoneDesc}, ${phoneNum})`,
            err as Error,
          );
        }
      } else {
        log.debug('phone number not specified');
      }

      // Income
      const income = task.getString('hoh_income', 'currency');
      if (income) {
        try {
          await this.addIncomeSource(hohCase, income);
          log.info(`set income(${income})`);
        } catch (err) {
          jLog(`failed to set income(${income})`, err as Error);
        }
      } else {
        log.debug(`income not specified`);
      }

      // Demographics
      for (const groupName of Object.values(OasisGroup)) {
        const { detailNames, value } = mapDemographic(groupName, task);
        const logStr = `set demographic(${groupName}, ${detailNames}, ${value})`;
        try {
          await this.addCaseDetails(hohCase, groupName, detailNames, value);
          log.info(logStr);
        } catch (err) {
          jLog(`failed to ${logStr}`, err as Error);
        }
      }

      // set task status
      await clickUpService.fetch(`task/${task.id}`, {
        method: 'PUT',
        json: {
          status: 'in oasis',
        },
      });

      log.info(`job complete`);
      return hohCase;
    } catch (err) {
      // set task status
      await clickUpService.fetch(`task/${task.id}`, {
        method: 'PUT',
        json: {
          status: 'stuck',
        },
      });
      jLog('OASIS import failed:', err as Error);
      log.error(`job failed`, err);
      throw err;
    } finally {
      if (jobLogs.length) {
        // add comment to task
        await clickUpService
          .addTaskComment(task.id, jobLogs)
          .catch(logger.error);
      }
    }
  }

  async importClickUpTaskById(
    clickUpService: ClickUpService,
    taskId: string,
  ): Promise<Case> {
    const task = new ClickUpTask(await clickUpService.fetch(`task/${taskId}`));
    // (await import('fs')).writeFileSync(
    //   './src/fixtures/task.ts',
    //   JSON.stringify(task.task, null, 2),
    // );
    return this.importClickUpTask(clickUpService, task);
  }
}

const caseToUrl = (c: Case) => c.url.replace(/\/api\/v1/, '');

// Key is arbitrary, value must match the Oasis group name
export enum OasisGroup {
  additionalQuestions = 'Additional Questions',
  benefits = 'Public Benefits',
  ethnicity = 'Ethnicity',
  gender = 'Gender',
  language = 'Primary Language',
  proxy = 'Permanent Proxy (optional)',
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

export interface DemographicInfo {
  detailNames: string[] | string | null;
  value?: string | null;
}

export const mapDemographic = (
  oasisGroup: OasisGroup,
  task: ClickUpTask,
): DemographicInfo => {
  switch (oasisGroup) {
    case OasisGroup.gender: {
      const taskVal = task.getDropdownString('hoh_gen');
      return {
        detailNames:
          {
            1: 'Female',
            2: 'Male',
            3: 'Transgender',
            4: 'Non-binary',
            5: 'Other',
          }[taskVal?.[0] || ''] || null,
      };
    }
    case OasisGroup.additionalQuestions: {
      const taskValues = task.getLabelsStrings('hoh_demog');
      if (!taskValues) {
        return { detailNames: null };
      }
      return {
        detailNames: taskValues
          .map(
            (taskVal) =>
              ({
                1: 'Disabled',
                2: 'Homeless',
                3: 'Veteran',
                4: 'Active Military',
              })[taskVal?.[0] || ''] || null,
          )
          .filter((v): v is string => !!v),
      };
    }
    case OasisGroup.benefits: {
      const taskValues = task.getLabelsStrings('hoh_benefits');
      if (!taskValues) {
        return { detailNames: null };
      }
      return {
        detailNames: taskValues
          .map(
            (taskVal) =>
              ({
                1: 'CalFresh',
                2: 'WIC',
                3: 'Disability',
                4: 'Medicare/Medi-Cal',
                5: 'Social Security',
              })[taskVal?.[0] || ''] || null,
          )
          .filter((v): v is string => !!v),
      };
    }
    case OasisGroup.ethnicity: {
      const taskVal = task.getDropdownString('hoh_eth');
      return {
        detailNames:
          {
            1: 'African-American/Black',
            2: 'Asian',
            3: 'Caucasian/White',
            4: 'Hispanic/Latinx',
            5: 'Native American/Native Alaskan',
            6: 'Native Hawaiian/Pacific Islander',
            7: 'Multi-race (2 or more)',
            8: 'Other',
          }[taskVal?.[0] || ''] || null,
      };
    }
    case OasisGroup.language: {
      return {
        detailNames: 'Other',
        value: task.getString('hoh_lang'),
      };
    }
    case OasisGroup.proxy: {
      return {
        detailNames: 'Other',
        value: task.getString('hoh_proxy'),
      };
    }
    default: {
      // @ts-expect-error OasisGroup should be exhaustive
      logger.error(`Unmapped OasisGroup: ${oasisGroup.toString()}`);
      return {
        detailNames: task.getDropdownString(oasisGroup),
      };
    }
  }
};
