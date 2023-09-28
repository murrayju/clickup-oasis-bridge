import { ClickUpTask } from './clickup';

export enum OasisGroup {
  gender = 'Gender',
  ethnicity = 'Ethnicity',
  additionalQuestions = 'Additional Questions',
  proxy = 'Permanent Proxy (optional)',
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
      const taskVal = task.getDropdownString(oasisGroup);
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
      const taskValues = task.getLabelsStrings(
        'bec6d732-f6ab-4b18-b153-3faae8921635',
      );
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
    case OasisGroup.ethnicity: {
      const taskVal = task.getDropdownString(oasisGroup);
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
    case OasisGroup.proxy: {
      return {
        detailNames: 'Other',
        value: task.getString('Proxy'),
      };
    }
    default: {
      // @ts-expect-error OasisGroup should be exhaustive
      console.error(`Unmapped OasisGroup: ${oasisGroup.toString()}`);
      return {
        detailNames: task.getDropdownString(oasisGroup),
      };
    }
  }
};
