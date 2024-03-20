import {
  ClickUpService,
  ClickUpTask,
  SimplifiedCommentContent,
  Task,
} from './clickup.js';
import {
  CLICKUP_LIST_ID,
  CLICKUP_STATUS_ERROR,
  CLICKUP_STATUS_PROCESSING,
  CLICKUP_STATUS_SUCCESS,
  CLICKUP_STATUS_TODO,
  DEFAULT_COUNTY_NAME,
} from './env.js';
import { logger } from './logger.js';

const trimQuotes = (s: string | null | undefined) =>
  s?.replace(/^["' ]+|["' ]+$/g, '');

interface Options extends RequestInit {
  formData?: Record<string, string>;
  json?: Record<string, unknown>;
}

export class OasisService {
  private baseUrl: string;
  private token: string;
  private counties: County[] | null = null;
  private _countyMap: Map<string, County> = new Map();
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

  async fetchAllCounties(): Promise<Group[]> {
    return this.fetchPaged('counties/');
  }

  // cached
  async getCounties(refresh = false): Promise<County[]> {
    if (refresh) {
      this._countyMap.clear();
    }
    if (refresh || !this.counties) {
      this.counties = await this.fetchAllCounties();
    }
    return this.counties;
  }

  get countiesMap(): Map<string, County> {
    if (!this._countyMap.size && this.counties) {
      for (const county of this.counties) {
        this._countyMap.set(county.name.toLowerCase(), county);
      }
    }
    return this._countyMap;
  }

  setCounties(counties: County[]): County[] {
    this.counties = counties;
    this._countyMap.clear();
    return counties;
  }

  async addPhoneNumber(c: Case, description: string, number: string) {
    return this.fetch('phone_numbers/', {
      method: 'POST',
      json: {
        case: c.id,
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
        case: c.id,
        amount,
        interval,
        name,
      },
    });
  }

  async addCaseDetails(
    c: Case,
    groupName: string,
    detailNames: string[] | string,
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
      const detail = details.find((d) => d.group === group.id);
      if (!detail) {
        throw new Error(
          `Detail '${detailName}' not found in group ${groupName}`,
        );
      }
      results.push(
        await this.fetch('case_details/', {
          method: 'POST',
          json: {
            case: c.id,
            detail: detail.id,
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
    if (
      task.task.status.status?.toLowerCase() !==
      CLICKUP_STATUS_TODO.toLowerCase()
    ) {
      throw new Error(
        `Task ${task.id} is not in '${CLICKUP_STATUS_TODO}' status, cannot import. Current status: ${task.task.status.status}`,
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
      // set task status to processing
      await clickUpService.fetch(`task/${task.id}`, {
        method: 'PUT',
        json: {
          status: CLICKUP_STATUS_PROCESSING,
        },
      });

      const existingCase = task.getString('case_url');
      if (existingCase) {
        throw new Error(`Task already has case: ${existingCase}`);
      }

      // Check for duplicate tasks by email
      const email = task.getString('hoh_email');
      if (!email) {
        throw new Error(`Email is a required field. Cannot process.`);
      }
      const { tasks: existing } = await clickUpService.fetch<{ tasks: Task[] }>(
        `list/${CLICKUP_LIST_ID}/task`,
        {
          searchParams: {
            include_closed: 'true',
            custom_fields: JSON.stringify([
              {
                field_id: task.getField('hoh_email')?.id,
                operator: '=',
                value: email,
              },
            ]),
          },
        },
      );

      let clickUpDup = false;
      for (const t of existing) {
        if (t.id === task.id) {
          continue;
        }
        jLog(`Found existing task for email '${email}': ${t.url}`);
        clickUpDup = true;
      }
      if (clickUpDup) {
        throw new Error(
          `Found possible duplicate ClickUp tasks, aborting import`,
        );
      }

      const countyName = trimQuotes(
        (task.getString('hoh_county') || DEFAULT_COUNTY_NAME)?.toLowerCase(),
      );
      const counties = await this.getCounties();
      const countyId: number | undefined = countyName
        ? counties.find((c) => {
            const name = c.name.toLowerCase();
            return (
              name === countyName ||
              name.startsWith(countyName) ||
              countyName.startsWith(name)
            );
          })?.id
        : undefined;
      log.debug({
        countyName: countyName || null,
        countyId: countyId || null,
        default: DEFAULT_COUNTY_NAME,
        counties,
      });

      const address: Partial<Case> = {
        street_address: task.getString('hoh_add') || '',
        street_apt_number: task.getString('hoh_apt') || '',
        street_city: task.getString('hoh_city') || '',
        street_county: countyId,
        street_state: task.getString('hoh_state') || '',
        street_zip_code: task.getString('hoh_zip') || '',
      };
      const hohCase = await this.createCase({
        first_name: task.getString('hoh_fn') || '',
        last_name: task.getString('hoh_ln') || '',
        date_of_birth:
          this.constructDOB(
            task.getDropdownString('hoh_dob_y'),
            task.getDropdownString('hoh_dob_m'),
            task.getDropdownString('hoh_dob_d'),
          ) || '',
        email,
        head_of_household: true,
        ...address,
      });
      log = log.child({ c: hohCase.id });
      const hohUrl = this.caseToUrl(hohCase);
      jLog(`HoH case created: ${hohUrl}`);
      log.debug(JSON.stringify(hohCase, null, 2));

      // Record a note on the case
      try {
        await this.fetch('notes/', {
          method: 'POST',
          json: {
            case: hohCase.id,
            description: `Imported from ClickUp task ${task.task.url}`,
            entry_agent: hohCase.entry_agent,
            mod_agent: hohCase.mod_agent,
          },
        });
        log.info(`added case note`);
      } catch (err) {
        jLog(`Failed to add case note`, err as Error);
      }

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
        if (!detailNames) {
          log.debug(`no ${groupName} specified`);
          continue;
        }
        const logStr = `set demographic(${groupName}, ${detailNames}, ${value})`;
        try {
          await this.addCaseDetails(hohCase, groupName, detailNames, value);
          log.info(logStr);
        } catch (err) {
          jLog(`failed to ${logStr}`, err as Error);
        }
      }

      // additional household members
      const numInHouseholdStr = task.getDropdownString('num_in_household');
      const numInHousehold =
        (numInHouseholdStr && parseInt(numInHouseholdStr, 10)) || 1;
      if (numInHousehold > 1) {
        for (let n = 1; n < numInHousehold; n++) {
          const hhmCase = await this.createCase({
            first_name: task.getString(`hhm_${n}_fn`) || '',
            last_name: task.getString(`hhm_${n}_ln`) || '',
            date_of_birth: new Date(
              parseInt(task.getString(`hhm_${n}_dob`) || '', 10),
            )
              .toISOString()
              .split('T')[0],
            head_of_household: false,
            household: hohCase.household,
            ...address,
          });
          const hhmUrl = this.caseToUrl(hhmCase);
          jLog(`HHM ${n} case created: ${hhmUrl}`);
          log.debug(JSON.stringify(hhmCase, null, 2));

          // Record a note on the case
          try {
            await this.fetch('notes/', {
              method: 'POST',
              json: {
                case: hhmCase.id,
                description: `Imported from ClickUp task ${task.task.url}`,
                entry_agent: hhmCase.entry_agent,
                mod_agent: hhmCase.mod_agent,
              },
            });
            log.info(`added case note`);
          } catch (err) {
            jLog(`Failed to add case note - HHM ${n}`, err as Error);
          }

          // Demographics
          for (const groupName of [OasisGroup.ethnicity, OasisGroup.gender]) {
            const { detailNames, value } = mapDemographic(
              groupName,
              task,
              `hhm_${n}_`,
            );
            if (!detailNames) {
              log.debug(`no ${groupName} specified`);
              continue;
            }
            const logStr = `set demographic(${groupName}, ${detailNames}, ${value}) - hhm_${n}`;
            try {
              await this.addCaseDetails(hhmCase, groupName, detailNames, value);
              log.info(logStr);
            } catch (err) {
              jLog(`failed to ${logStr}`, err as Error);
            }
          }

          // Relationship
          try {
            const relationship = task.getString(`hhm_${n}_r`);
            await this.fetch('case_relationships/', {
              method: 'POST',
              json: {
                from_case: hohCase.id,
                to_case: hhmCase.id,
                relationship,
                dependant: true,
              },
            });
            log.info(`set relationship(${relationship}) - hhm_${n}`);
          } catch (err) {
            jLog(`failed to set relationship`, err as Error);
          }
        }
      }

      // set task status
      await clickUpService.fetch(`task/${task.id}`, {
        method: 'PUT',
        json: {
          status: CLICKUP_STATUS_SUCCESS,
        },
      });

      log.info(`job complete`);
      return hohCase;
    } catch (err) {
      // set task status
      await clickUpService.fetch(`task/${task.id}`, {
        method: 'PUT',
        json: {
          status: CLICKUP_STATUS_ERROR,
        },
      });
      jLog('OASIS import failed:', err as Error);
      log.error(`job failed`, err);
      throw err;
    } finally {
      if (jobLogs.length) {
        // add comment to task
        await clickUpService.addTaskComment(task.id, jobLogs).catch((err) => {
          logger.error(err);
        });
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

  private caseToUrl(c: Case) {
    return this.caseToApiUrl(c).replace(/\/api\/v1/, '');
  }

  private caseToApiUrl(c: Case) {
    return `${this.baseUrl}cases/${c.id}/`;
  }
}

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
  id: number;
  group: number;
  name: string;
  index: number;
  template_key: string;
  other_input: boolean;
  show_groups: string[];
  import_id: string;
  import_date: null | string;
}

export interface Group {
  id: number;
  name: string;
  index: number;
  template_key: string;
  group_type: string;
  case_tab: string;
  section: number;
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

export interface County {
  id: number;
  name: string;
}

export interface Case {
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
  street_county: County['id'];
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
  prefix = 'hoh_',
): DemographicInfo => {
  switch (oasisGroup) {
    case OasisGroup.gender: {
      const taskVal = task.getDropdownString(`${prefix}gen`);
      return {
        detailNames:
          {
            1: 'Female',
            2: 'Male',
            3: 'Transgender',
            4: 'Non-binary',
            5: 'Other',
          }[taskVal?.[0] || ''] || null,
        value: task.getString(`${prefix}gen_other`),
      };
    }
    case OasisGroup.additionalQuestions: {
      const taskValues = task.getLabelsStrings(`${prefix}demog`);
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
      const taskValues = task.getLabelsStrings(`${prefix}benefits`);
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
      const taskVal = task.getDropdownString(`${prefix}eth`);
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
        value: task.getString(`${prefix}eth_other`),
      };
    }
    case OasisGroup.language: {
      return {
        detailNames: 'Other',
        value: task.getString(`${prefix}lang`),
      };
    }
    case OasisGroup.proxy: {
      return {
        detailNames: 'Other',
        value: task.getString(`${prefix}proxy`),
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
