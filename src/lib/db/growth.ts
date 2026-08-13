import type {
  Achievement,
  Goal,
  GoalEntry,
  GoalMilestone,
} from "@/types";
import { createId, nowIso, todayDateString } from "@/lib/dates";
import { goalAcceptsSource, localDateKey, localWeekStartKey } from "@/lib/growth";
import { getDb } from "./client";

/* Growth goals, contributions, milestones and achievements */
export async function fetchGoals(includeArchived = false): Promise<Goal[]> {
  const db = await getDb();
  return db.select<Goal[]>(
    `SELECT * FROM goals ${includeArchived ? "" : "WHERE status != 'archived'"}
     ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,
              updated_at DESC`,
  );
}

export async function createGoal(
  draft: Partial<Goal> & Pick<Goal, "title">,
): Promise<Goal> {
  const db = await getDb();
  const stamp = nowIso();
  const goal: Goal = {
    id: createId(),
    title: draft.title.trim(),
    description: draft.description?.trim() ?? "",
    icon: draft.icon ?? "target",
    color: draft.color ?? "#2F6FED",
    goal_type: draft.goal_type ?? "quantity",
    start_date: draft.start_date ?? todayDateString(),
    target_date: draft.target_date ?? null,
    start_value: Number(draft.start_value ?? 0),
    target_value: Math.max(1, Number(draft.target_value ?? 1)),
    current_value: Number(draft.current_value ?? draft.start_value ?? 0),
    unit: draft.unit?.trim() || "次",
    status: draft.status ?? "active",
    motivation: draft.motivation?.trim() ?? "",
    project_id: draft.project_id ?? null,
    weekly_target: Math.max(0, Number(draft.weekly_target ?? 0)),
    manual_completion: draft.status === "completed" ? 1 : 0,
    created_at: stamp,
    updated_at: stamp,
  };
  await db.execute(
    `INSERT INTO goals
     (id,title,description,icon,color,goal_type,start_date,target_date,start_value,
      target_value,current_value,unit,status,motivation,project_id,weekly_target,
      manual_completion,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
    [
      goal.id, goal.title, goal.description, goal.icon, goal.color,
      goal.goal_type, goal.start_date, goal.target_date, goal.start_value,
      goal.target_value, goal.current_value, goal.unit, goal.status,
      goal.motivation, goal.project_id, goal.weekly_target, goal.manual_completion,
      goal.created_at, goal.updated_at,
    ],
  );
  if (goal.goal_type === "project") await refreshGoalProgress(goal.id);
  return goal;
}

export async function updateGoal(
  id: string,
  updates: Partial<Goal>,
): Promise<void> {
  const db = await getDb();
  const rows = await db.select<Goal[]>("SELECT * FROM goals WHERE id=$1", [id]);
  if (!rows[0]) return;
  const next = {
    ...rows[0],
    ...updates,
    manual_completion: updates.status === "completed"
      ? 1
      : updates.status !== undefined
        ? 0
        : rows[0].manual_completion ?? 0,
    updated_at: nowIso(),
  };
  await db.execute(
    `UPDATE goals SET title=$1,description=$2,icon=$3,color=$4,goal_type=$5,
     start_date=$6,target_date=$7,start_value=$8,target_value=$9,current_value=$10,
     unit=$11,status=$12,motivation=$13,project_id=$14,weekly_target=$15,
     manual_completion=$16,updated_at=$17 WHERE id=$18`,
    [
      next.title, next.description, next.icon, next.color, next.goal_type,
      next.start_date, next.target_date, next.start_value, next.target_value,
      next.current_value, next.unit, next.status, next.motivation,
      next.project_id, next.weekly_target, next.manual_completion, next.updated_at, id,
    ],
  );
}

export async function fetchGoalEntries(goalId?: string): Promise<GoalEntry[]> {
  const db = await getDb();
  return goalId
    ? db.select<GoalEntry[]>(
        "SELECT * FROM goal_entries WHERE goal_id=$1 ORDER BY entry_date DESC, created_at DESC",
        [goalId],
      )
    : db.select<GoalEntry[]>(
        "SELECT * FROM goal_entries ORDER BY entry_date DESC, created_at DESC",
      );
}

export async function refreshGoalProgress(goalId: string): Promise<void> {
  const db = await getDb();
  const goalRows = await db.select<Goal[]>("SELECT * FROM goals WHERE id=$1", [goalId]);
  if (!goalRows[0]) return;
  const goal = goalRows[0];
  let current = Number(goal.start_value);
  if (goal.goal_type === "change") {
    const latest = await db.select<{ value: number }[]>(
      `SELECT value FROM goal_entries
       WHERE goal_id=$1 AND source_type='manual'
       ORDER BY entry_date DESC, created_at DESC LIMIT 1`,
      [goalId],
    );
    current = latest.length ? Number(latest[0].value) : Number(goal.start_value);
  } else if (goal.goal_type === "frequency") {
    const sums = await db.select<{ total: number | null }[]>(
      "SELECT SUM(value) AS total FROM goal_entries WHERE goal_id=$1 AND entry_date >= $2",
      [goalId, localWeekStartKey()],
    );
    current = Number(sums[0]?.total ?? 0);
  } else if (goal.goal_type === "project" && goal.project_id) {
    const counts = await db.select<{ total: number; done: number }[]>(
      `SELECT COUNT(*) AS total,
       SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS done
       FROM tasks WHERE project_id=$1 AND deleted_at IS NULL AND parent_id IS NULL`,
      [goal.project_id],
    );
    current = counts[0]?.total
      ? Math.round((Number(counts[0].done ?? 0) / Number(counts[0].total)) * 1000) / 10
      : 0;
  } else {
    const sums = await db.select<{ total: number | null }[]>(
      "SELECT SUM(value) AS total FROM goal_entries WHERE goal_id=$1",
      [goalId],
    );
    current = Number(goal.start_value) + Number(sums[0]?.total ?? 0);
  }
  const effectiveTarget = goal.goal_type === "frequency" && goal.weekly_target > 0
    ? Number(goal.weekly_target)
    : Number(goal.target_value);
  const reached = goal.goal_type === "frequency"
    ? false
    : effectiveTarget >= Number(goal.start_value)
      ? current >= effectiveTarget
      : current <= effectiveTarget;
  await db.execute(
    `UPDATE goals SET current_value=$1,
     status=CASE
       WHEN $2=1 AND status='active' THEN 'completed'
       WHEN $2=0 AND status='completed' AND manual_completion=0 THEN 'active'
       ELSE status END,
     updated_at=$3 WHERE id=$4`,
    [current, reached ? 1 : 0, nowIso(), goalId],
  );
  const ascending = Number(goalRows[0].target_value) >= Number(goalRows[0].start_value);
  const allMilestones = await db.select<GoalMilestone[]>(
    "SELECT * FROM goal_milestones WHERE goal_id=$1",
    [goalId],
  );
  const reverted = allMilestones.filter(
    (milestone) => milestone.completed_at &&
      (ascending ? current < milestone.target_value : current > milestone.target_value),
  );
  for (const milestone of reverted) {
    await db.execute("UPDATE goal_milestones SET completed_at=NULL WHERE id=$1", [milestone.id]);
    await db.execute(
      "DELETE FROM achievements WHERE source_type='milestone' AND source_id=$1",
      [milestone.id],
    );
  }
  const milestones = allMilestones.filter(
    (milestone) => !milestone.completed_at &&
      (ascending ? current >= milestone.target_value : current <= milestone.target_value),
  );
  for (const milestone of milestones) {
    const stamp = nowIso();
    await db.execute(
      "UPDATE goal_milestones SET completed_at=$1 WHERE id=$2",
      [stamp, milestone.id],
    );
    await createAchievement({
      goal_id: goalId,
      title: milestone.title,
      description: `达成阶段目标：${milestone.target_value}${goalRows[0].unit}`,
      achieved_at: localDateKey(new Date(stamp)),
      source_type: "milestone",
      source_id: milestone.id,
    });
  }
  if (reached) {
    await createAchievement({
      goal_id: goalId,
      title: `完成目标：${goalRows[0].title}`,
      description: `累计达到 ${current}${goalRows[0].unit}`,
      achieved_at: todayDateString(),
      source_type: "goal",
      source_id: goalId,
    });
  } else {
    await db.execute(
      "DELETE FROM achievements WHERE source_type='goal' AND source_id=$1",
      [goalId],
    );
  }
}

export async function addGoalEntry(
  input: Pick<GoalEntry, "goal_id" | "entry_date" | "value" | "source_type"> &
    Partial<Pick<GoalEntry, "source_id" | "note">>,
): Promise<boolean> {
  const db = await getDb();
  const goals = await db.select<Goal[]>("SELECT * FROM goals WHERE id=$1 LIMIT 1", [input.goal_id]);
  const goal = goals[0];
  if (!goal || !goalAcceptsSource(goal, input.source_type)) return false;
  const result = await db.execute(
    `INSERT OR IGNORE INTO goal_entries
     (id,goal_id,entry_date,value,source_type,source_id,note,created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      createId(), input.goal_id, input.entry_date, Number(input.value),
      input.source_type, input.source_id ?? null, input.note?.trim() ?? "", nowIso(),
    ],
  );
  await refreshGoalProgress(input.goal_id);
  return result.rowsAffected > 0;
}

export async function refreshProjectGoals(projectId: string): Promise<void> {
  const db = await getDb();
  const goals = await db.select<{ id: string }[]>(
    "SELECT id FROM goals WHERE goal_type='project' AND project_id=$1",
    [projectId],
  );
  for (const goal of goals) await refreshGoalProgress(goal.id);
}

export async function reconcileGoalEntries(goalId: string): Promise<number> {
  const db = await getDb();
  const goals = await db.select<Goal[]>("SELECT * FROM goals WHERE id=$1 LIMIT 1", [goalId]);
  const goal = goals[0];
  if (!goal) return 0;
  const entries = await db.select<GoalEntry[]>("SELECT * FROM goal_entries WHERE goal_id=$1", [goalId]);
  const invalid = entries.filter((entry) => !goalAcceptsSource({ ...goal, status: "active" }, entry.source_type));
  for (const entry of invalid) {
    await db.execute("DELETE FROM goal_entries WHERE id=$1", [entry.id]);
  }
  await refreshGoalProgress(goalId);
  return invalid.length;
}

export async function removeGoalEntryBySource(
  goalId: string,
  sourceType: GoalEntry["source_type"],
  sourceId: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "DELETE FROM goal_entries WHERE goal_id=$1 AND source_type=$2 AND source_id=$3",
    [goalId, sourceType, sourceId],
  );
  await refreshGoalProgress(goalId);
}

export async function fetchGoalMilestones(goalId?: string): Promise<GoalMilestone[]> {
  const db = await getDb();
  return goalId
    ? db.select<GoalMilestone[]>(
        "SELECT * FROM goal_milestones WHERE goal_id=$1 ORDER BY sort_order,target_value",
        [goalId],
      )
    : db.select<GoalMilestone[]>("SELECT * FROM goal_milestones ORDER BY created_at DESC");
}

export async function createGoalMilestone(
  goalId: string,
  title: string,
  targetValue: number,
  targetDate: string | null = null,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO goal_milestones
     (id,goal_id,title,target_value,target_date,completed_at,sort_order,created_at)
     VALUES ($1,$2,$3,$4,$5,NULL,$6,$7)`,
    [createId(), goalId, title.trim(), targetValue, targetDate, Date.now(), nowIso()],
  );
  await refreshGoalProgress(goalId);
}

export async function fetchAchievements(): Promise<Achievement[]> {
  const db = await getDb();
  return db.select<Achievement[]>(
    "SELECT * FROM achievements ORDER BY pinned DESC, achieved_at DESC, created_at DESC",
  );
}

export async function createAchievement(
  input: Pick<Achievement, "title" | "achieved_at" | "source_type"> &
    Partial<Omit<Achievement, "id" | "title" | "achieved_at" | "source_type" | "created_at">>,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT OR IGNORE INTO achievements
     (id,goal_id,title,description,achieved_at,image_path,source_type,source_id,pinned,created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      createId(), input.goal_id ?? null, input.title.trim(),
      input.description?.trim() ?? "", input.achieved_at,
      input.image_path ?? null, input.source_type, input.source_id ?? null,
      input.pinned ?? 0, nowIso(),
    ],
  );
}

export async function toggleAchievementPinned(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE achievements SET pinned=CASE pinned WHEN 1 THEN 0 ELSE 1 END WHERE id=$1",
    [id],
  );
}
