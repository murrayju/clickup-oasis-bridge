import { TaskCreatedEvent } from '../clickup';

export const taskCreated: TaskCreatedEvent = {
  event: 'taskCreated',
  history_items: [
    {
      id: '3670439876782343235',
      type: 1,
      date: '1694571404658',
      field: 'status',
      parent_id: '901100406486',
      data: {
        status_type: 'open',
      },
      source: null,
      user: {
        id: 75327902,
        username: 'Justin',
        email: 'justin@p4t.llc',
        color: '#5d4037',
        initials: 'J',
        profilePicture: null,
      },
      before: {
        status: null,
        color: '#000000',
        type: 'removed',
        orderindex: -1,
      },
      after: {
        status: 'to-do',
        color: '#d3d3d3',
        orderindex: 0,
        type: 'open',
      },
    },
    {
      id: '3670439876765566018',
      type: 1,
      date: '1694571404658',
      field: 'task_creation',
      parent_id: '901100406486',
      data: {
        via: 'form',
        trace_id: '4823806543942410626',
        subcategory_id: '901100406486',
      },
      source: 'form',
      user: {
        id: 75327902,
        username: 'Justin',
        email: 'justin@p4t.llc',
        color: '#5d4037',
        initials: 'J',
        profilePicture: null,
      },
      before: null,
      after: null,
    },
  ],
  task_id: '8685k5x49',
  webhook_id: '1e4bbb49-0c5b-41e3-b77e-d8f855422c00',
};
