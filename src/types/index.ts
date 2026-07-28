export type TaskStatus =
  | "draft"
  | "pending"
  | "in_progress"
  | "waiting"
  | "blocked"
  | "completed"
  | "cancelled";
export type TaskPriority = 1 | 2 | 3 | 4;
export type ThemeMode = "light" | "dark" | "system";
export type ViewMode = "list" | "board" | "calendar";
export type DateScope = "day" | "week" | "month";

export type NavId =
  | "today"
  | "myday"
  | "inbox"
  | "completed"
  | "all"
  | "board"
  | "calendar"
  | "tags"
  | "habits"
  | "reminders"
  | "review"
  | "memos"
  | "trash"
  | "settings"
  | "projects"
  | "smart";

/** @deprecated use NavId */
export type ViewId = NavId;

export type RepeatFrequency = "daily" | "weekly" | "monthly" | "custom";

export interface RepeatRule {
  frequency: RepeatFrequency;
  interval: number;
  /** 0=Sun .. 6=Sat for weekly */
  weekdays?: number[];
  /** day of month 1-31, or -1 for last */
  monthDay?: number;
  /** e.g. last Friday of month */
  nthWeekday?: { n: -1 | 1 | 2 | 3 | 4; weekday: number };
}

export interface Task {
  id: string;
  title: string;
  description: string;
  notes: string;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string | null;
  due_time: string | null;
  /** Optional end time HH:mm; due_time is start */
  end_time: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  deleted_at: string | null;
  parent_id: string | null;
  repeat_rule: string | null;
  remind_minutes: number | null;
  reminder_minutes: number[];
  estimated_minutes: number | null;
  project_id: string | null;
  my_day_date: string | null;
  blocked_by_id: string | null;
  completion_criteria: string;
  energy_level: "low" | "medium" | "high";
  flexible: number;
  actual_minutes: number;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface Attachment {
  id: string;
  task_id: string;
  kind: "file" | "url" | "image";
  name: string;
  path: string;
  created_at: string;
}

export interface SmartList {
  id: string;
  name: string;
  filter_json: string;
  created_at: string;
}

export interface FilterState {
  keyword: string;
  dateFrom: string | null;
  dateTo: string | null;
  priorities: TaskPriority[];
  tagIds: string[];
}

export interface Habit {
  id: string;
  title: string;
  target_per_week: number;
  created_at: string;
}

export interface HabitCheck {
  id: string;
  habit_id: string;
  check_date: string;
}

export interface Memo {
  id: string;
  title: string;
  content: string;
  pinned: number;
  created_at: string;
  updated_at: string;
}

export type TimerKind = "interval" | "task";

export interface Timer {
  id: string;
  kind: TimerKind;
  title: string;
  interval_sec: number;
  remaining_sec: number;
  running: number;
  enabled: number;
  task_id: string | null;
  ends_at: string | null;
  last_fired_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimerDraft {
  kind: TimerKind;
  title: string;
  interval_sec: number;
  task_id?: string | null;
  /** If true, start running immediately. */
  start?: boolean;
}

export interface TaskDraft {
  title: string;
  description?: string;
  notes?: string;
  priority?: TaskPriority;
  due_date?: string | null;
  due_time?: string | null;
  end_time?: string | null;
  parent_id?: string | null;
  repeat_rule?: string | null;
  remind_minutes?: number | null;
  reminder_minutes?: number[];
  estimated_minutes?: number | null;
  project_id?: string | null;
  my_day_date?: string | null;
  relative_due_days?: number;
  subtasks?: TaskDraft[];
  blocked_by_id?: string | null;
  completion_criteria?: string;
  energy_level?: Task["energy_level"];
  flexible?: number;
  tagIds?: string[];
}

export interface TaskUpdate {
  title?: string;
  description?: string;
  notes?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  due_date?: string | null;
  due_time?: string | null;
  end_time?: string | null;
  parent_id?: string | null;
  repeat_rule?: string | null;
  remind_minutes?: number | null;
  reminder_minutes?: number[];
  estimated_minutes?: number | null;
  project_id?: string | null;
  my_day_date?: string | null;
  blocked_by_id?: string | null;
  completion_criteria?: string;
  energy_level?: Task["energy_level"];
  flexible?: number;
  actual_minutes?: number;
  sort_order?: number;
}

export interface AiSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface AppSettings {
  theme: ThemeMode;
  notifyAhead: number;
  autostart: boolean;
  privacyMode: boolean;
  autoBackup: boolean;
  ai: AiSettings;
  karma: number;
  streak: number;
  lastCompleteDate: string | null;
  onboardingComplete: boolean;
}

export interface Project {
  id: string;
  name: string;
  color: string;
  due_date: string | null;
  archived: number;
  created_at: string;
  updated_at: string;
  goal: string;
  success_criteria: string;
}

export interface TaskEvent {
  id: string;
  task_id: string;
  event_type: string;
  before_json: string | null;
  after_json: string | null;
  note: string;
  created_at: string;
}

export interface FocusSession {
  id: string;
  task_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_sec: number;
  interruption_reason: string | null;
  created_at: string;
}

export interface DaySnapshot {
  id: string;
  plan_date: string;
  morning_json: string;
  evening_json: string | null;
  planned_minutes: number;
  completed_minutes: number;
  reflection: string;
  created_at: string;
  updated_at: string;
}

export interface Milestone {
  id: string;
  project_id: string;
  title: string;
  due_date: string | null;
  completed: number;
  created_at: string;
}

export interface TaskTemplate {
  id: string;
  name: string;
  task_json: string;
  created_at: string;
  updated_at: string;
}

export interface AppNotification {
  id: string;
  task_id: string | null;
  kind: "reminder" | "missed" | "system";
  title: string;
  body: string;
  scheduled_at: string | null;
  status: "pending" | "delivered" | "read" | "dismissed";
  snoozed_until: string | null;
  created_at: string;
}

export interface BackupPayload {
  version: 2 | 3;
  exportedAt: string;
  tasks: Task[];
  tags: Tag[];
  taskTags: { task_id: string; tag_id: string }[];
  attachments: Attachment[];
  smartLists: SmartList[];
  habits: Habit[];
  habitChecks: HabitCheck[];
  memos?: Memo[];
  projects?: Project[];
  taskTemplates?: TaskTemplate[];
  notifications?: AppNotification[];
  taskEvents?: TaskEvent[];
  focusSessions?: FocusSession[];
  daySnapshots?: DaySnapshot[];
  milestones?: Milestone[];
  settings: Record<string, string>;
}
