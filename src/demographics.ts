import { ClickUpTask } from './clickup';

export const mapDemographic = (
  oasisGroup: string,
  task: ClickUpTask,
): string | null => {
  switch (oasisGroup) {
    case 'Gender': {
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
    case 'Ethnicity':
    default: {
      return task.getDropdownString(oasisGroup);
    }
  }
};
