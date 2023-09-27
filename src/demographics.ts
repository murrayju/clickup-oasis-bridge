import { ClickUpTask } from './clickup';

export enum OasisGroup {
  gender = 'Gender',
  ethnicity = 'Ethnicity',
  additionalQuestions = 'Additional Questions',
}

export const mapDemographic = (
  oasisGroup: OasisGroup,
  task: ClickUpTask,
): string[] | string | null => {
  switch (oasisGroup) {
    case OasisGroup.gender: {
      const taskVal = task.getDropdownString(oasisGroup);
      return (
        {
          1: 'Female',
          2: 'Male',
          3: 'Transgender',
          4: 'Non-binary',
          5: 'Other',
        }[taskVal?.[0] || ''] || null
      );
    }
    case OasisGroup.additionalQuestions: {
      const taskValues = task.getLabelsStrings(
        'bec6d732-f6ab-4b18-b153-3faae8921635',
      );
      if (!taskValues) {
        return null;
      }
      return taskValues
        .map(
          (taskVal) =>
            ({
              1: 'Disabled',
              2: 'Homeless',
              3: 'Veteran',
              4: 'Active Military',
            })[taskVal?.[0] || ''] || null,
        )
        .filter((v): v is string => !!v);
    }
    case OasisGroup.ethnicity: {
      const taskVal = task.getDropdownString(oasisGroup);
      return (
        {
          1: 'African-American/Black',
          2: 'Asian',
          3: 'Caucasian/White',
          4: 'Hispanic/Latinx',
          5: 'Native American/Native Alaskan',
          6: 'Native Hawaiian/Pacific Islander',
          7: 'Multi-race (2 or more)',
          8: 'Other',
        }[taskVal?.[0] || ''] || null
      );
    }
    default: {
      // @ts-expect-error OasisGroup should be exhaustive
      console.error(`Unmapped OasisGroup: ${oasisGroup.toString()}`);
      return task.getDropdownString(oasisGroup);
    }
  }
};
