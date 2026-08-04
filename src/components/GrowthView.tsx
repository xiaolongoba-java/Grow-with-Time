import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { Achievement, Goal, GoalEntry, GoalMilestone, GoalType } from "@/types";
import {
  addGoalEntry,
  createAchievement,
  createGoal,
  createGoalMilestone,
  fetchAchievements,
  fetchGoalEntries,
  fetchGoalMilestones,
  fetchGoals,
  reconcileGoalEntries,
  toggleAchievementPinned,
  updateGoal,
} from "@/lib/db";
import { useAppStore } from "@/store/app";
import { todayDateString } from "@/lib/dates";
import {
  activityLevel,
  calculateGoalProgress,
  currentDateStreak,
  longestDateStreak,
} from "@/lib/growth";

type GrowthTab = "overview" | "goals" | "achievements";

const GOAL_TYPES: { value: GoalType; label: string; unit: string }[] = [
  { value: "quantity", label: "累计数量", unit: "次" },
  { value: "change", label: "数值变化", unit: "kg" },
  { value: "frequency", label: "持续频率", unit: "次" },
  { value: "time", label: "累计时间", unit: "分钟" },
  { value: "project", label: "项目完成", unit: "%" },
  { value: "custom", label: "自定义", unit: "点" },
];

const COLORS = ["#2F6FED", "#6F83D6", "#3E9B78", "#D7864D", "#C35D77", "#7367A8"];
const GOAL_STATUS_LABEL: Record<Goal["status"], string> = {
  active: "进行中",
  paused: "已暂停",
  completed: "已完成",
  abandoned: "已放弃",
  archived: "已归档",
};

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayRange() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(today.getDate() - 364 - today.getDay());
  return Array.from({ length: 371 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

export function GrowthView() {
  const [tab, setTab] = useState<GrowthTab>("overview");
  const [goals, setGoals] = useState<Goal[]>([]);
  const [entries, setEntries] = useState<GoalEntry[]>([]);
  const [milestones, setMilestones] = useState<GoalMilestone[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [filterGoalId, setFilterGoalId] = useState("");
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [goalTitle, setGoalTitle] = useState("");
  const [goalType, setGoalType] = useState<GoalType>("quantity");
  const [targetValue, setTargetValue] = useState("24");
  const [startValue, setStartValue] = useState("0");
  const [unit, setUnit] = useState("本");
  const [targetDate, setTargetDate] = useState("");
  const [motivation, setMotivation] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [entryValue, setEntryValue] = useState("1");
  const [entryNote, setEntryNote] = useState("");
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneValue, setMilestoneValue] = useState("");
  const [achievementTitle, setAchievementTitle] = useState("");
  const [achievementDescription, setAchievementDescription] = useState("");
  const [weeklyTarget, setWeeklyTarget] = useState("3");
  const [projectId, setProjectId] = useState("");
  const projects = useAppStore((state) => state.projects);

  const refresh = async () => {
    const [nextGoals, nextEntries, nextMilestones, nextAchievements] = await Promise.all([
      fetchGoals(),
      fetchGoalEntries(),
      fetchGoalMilestones(),
      fetchAchievements(),
    ]);
    setGoals(nextGoals);
    setEntries(nextEntries);
    setMilestones(nextMilestones);
    setAchievements(nextAchievements);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const selectedGoal = goals.find((goal) => goal.id === selectedGoalId) ?? null;
  useEffect(() => {
    if (!selectedGoal) return;
    setEntryValue(
      selectedGoal.goal_type === "change"
        ? String(selectedGoal.current_value)
        : "1",
    );
  }, [selectedGoal?.id, selectedGoal?.goal_type]);
  const visibleEntries = filterGoalId
    ? entries.filter((entry) => entry.goal_id === filterGoalId)
    : entries;
  const entriesByDate = useMemo(() => {
    const result = new Map<string, GoalEntry[]>();
    for (const entry of visibleEntries) {
      const list = result.get(entry.entry_date) ?? [];
      list.push(entry);
      result.set(entry.entry_date, list);
    }
    return result;
  }, [visibleEntries]);
  const days = useMemo(dayRange, []);
  const activeDateKeys = [...entriesByDate.keys()].sort();
  const currentStreak = useMemo(
    () => currentDateStreak(activeDateKeys, todayDateString()),
    [activeDateKeys],
  );
  const longestStreak = useMemo(() => longestDateStreak(activeDateKeys), [activeDateKeys]);
  const activityEntries = (items: GoalEntry[]) => items.map((entry) => ({
    ...entry,
    value: goals.find((goal) => goal.id === entry.goal_id)?.goal_type === "change"
      ? 1
      : entry.value,
  }));
  const totalValue = activityEntries(visibleEntries)
    .reduce((sum, entry) => sum + Math.abs(Number(entry.value)), 0);

  const submitGoal = async () => {
    if (!goalTitle.trim()) return;
    if (goalType === "project" && !projectId) {
      useAppStore.getState().setToast("请先选择要跟踪的项目");
      return;
    }
    const values = {
      title: goalTitle,
      goal_type: goalType,
      start_value: goalType === "project" ? 0 : Number(startValue) || 0,
      current_value: goalType === "project" ? 0 : Number(startValue) || 0,
      target_value: goalType === "project" ? 100 : Number(targetValue) || 1,
      unit: goalType === "project" ? "%" : unit,
      target_date: targetDate || null,
      motivation,
      color,
      project_id: goalType === "project" ? projectId || null : null,
      weekly_target: goalType === "frequency" ? Math.max(1, Number(weeklyTarget) || 1) : 0,
    };
    if (editingGoalId) {
      await updateGoal(editingGoalId, values);
      await reconcileGoalEntries(editingGoalId);
    } else {
      await createGoal(values);
    }
    setGoalTitle("");
    setMotivation("");
    setShowCreate(false);
    setEditingGoalId(null);
    await refresh();
  };

  const openCreateGoal = () => {
    setEditingGoalId(null);
    setGoalTitle("");
    setGoalType("quantity");
    setStartValue("0");
    setTargetValue("24");
    setUnit("本");
    setTargetDate("");
    setMotivation("");
    setWeeklyTarget("3");
    setProjectId("");
    setColor(COLORS[0]);
    setShowCreate(true);
  };

  const openGoalEditor = (goal: Goal) => {
    setEditingGoalId(goal.id);
    setGoalTitle(goal.title);
    setGoalType(goal.goal_type);
    setStartValue(String(goal.start_value));
    setTargetValue(String(goal.target_value));
    setUnit(goal.unit);
    setTargetDate(goal.target_date ?? "");
    setMotivation(goal.motivation);
    setWeeklyTarget(String(goal.weekly_target || 3));
    setProjectId(goal.project_id ?? "");
    setColor(goal.color);
    setShowCreate(true);
  };

  const submitEntry = async () => {
    if (!selectedGoal) return;
    const numericValue = Number(entryValue);
    if (!Number.isFinite(numericValue)) {
      useAppStore.getState().setToast("请输入有效数值");
      return;
    }
    await addGoalEntry({
      goal_id: selectedGoal.id,
      entry_date: todayDateString(),
      value: numericValue,
      source_type: "manual",
      note: selectedGoal.goal_type === "change"
        ? entryNote || `当前值：${entryValue}${selectedGoal.unit}`
        : entryNote,
    });
    setEntryValue("1");
    setEntryNote("");
    await refresh();
  };

  return (
    <div className="growth-page">
      <header className="growth-header">
        <div>
          <span className="growth-eyebrow">GROW · 长期主义</span>
          <h2>看见每一天累积的成长</h2>
          <p>目标不是压力清单，而是你持续投入过的证据。</p>
        </div>
        <button className="btn-primary" type="button" onClick={openCreateGoal}>
          + 创建目标
        </button>
      </header>

      <nav className="growth-tabs">
        {(["overview", "goals", "achievements"] as GrowthTab[]).map((item) => (
          <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
            {item === "overview" ? "成长总览" : item === "goals" ? "目标" : "成就"}
          </button>
        ))}
      </nav>

      {tab === "overview" ? (
        <>
          <section className="growth-metrics">
            <article><span>活跃天数</span><strong>{activeDateKeys.length}</strong></article>
            <article><span>当前连续</span><strong>{currentStreak}<small> 天</small></strong></article>
            <article><span>最长连续</span><strong>{longestStreak}<small> 天</small></strong></article>
            <article><span>累计投入</span><strong>{Math.round(totalValue * 10) / 10}</strong></article>
          </section>
          <section className="growth-panel heatmap-panel">
            <div className="growth-panel-head">
              <div><h3>过去一年的投入</h3><p>点击格子回看当天完成的行动</p></div>
              <select value={filterGoalId} onChange={(event) => setFilterGoalId(event.target.value)}>
                <option value="">全部目标</option>
                {goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
              </select>
            </div>
            <div className="growth-heatmap" aria-label="年度成长热点图">
              {days.map((date) => {
                const key = toDateKey(date);
                const value = (entriesByDate.get(key) ?? []).reduce((sum, entry) => sum + Number(entry.value), 0);
                const level = activityLevel(activityEntries(entriesByDate.get(key) ?? []));
                return <button key={key} className={`heat-cell level-${level}`} title={`${key} · ${value || "无"}投入`} onClick={() => setSelectedDate(key)} />;
              })}
            </div>
            <div className="heatmap-legend"><span>少</span>{[0,1,2,3,4].map((level) => <i key={level} className={`heat-cell level-${level}`} />)}<span>多</span></div>
          </section>
          <section className="growth-columns">
            <div className="growth-panel"><div className="growth-panel-head"><h3>进行中的目标</h3><button onClick={() => setTab("goals")}>查看全部</button></div>{goals.filter((goal) => goal.status === "active").slice(0,4).map((goal) => <GoalCard key={goal.id} goal={goal} onOpen={() => { setSelectedGoalId(goal.id); setTab("goals"); }} />)}</div>
            <div className="growth-panel"><div className="growth-panel-head"><h3>最近成就</h3><button onClick={() => setTab("achievements")}>成就墙</button></div>{achievements.slice(0,4).map((achievement) => <AchievementCard key={achievement.id} achievement={achievement} />)}</div>
          </section>
        </>
      ) : null}

      {tab === "goals" ? (
        selectedGoal ? (
          <section className="goal-detail">
            <button className="text-btn" onClick={() => setSelectedGoalId(null)}>← 返回目标列表</button>
            <div className="goal-detail-hero" style={{ "--goal-color": selectedGoal.color } as CSSProperties}>
              <div><span>{GOAL_STATUS_LABEL[selectedGoal.status]}</span><h2>{selectedGoal.title}</h2><p>{selectedGoal.motivation || selectedGoal.description || "每一步都算数。"}</p></div>
              <strong>{Math.round(calculateGoalProgress(selectedGoal))}%</strong>
            </div>
            <div className="goal-progress-track"><i style={{ width: `${calculateGoalProgress(selectedGoal)}%`, background: selectedGoal.color }} /></div>
            <div className="goal-detail-actions">
              <input disabled={selectedGoal.status !== "active" || selectedGoal.goal_type === "project"} type="number" value={entryValue} onChange={(event) => setEntryValue(event.target.value)} />
              <input disabled={selectedGoal.status !== "active" || selectedGoal.goal_type === "project"} value={entryNote} placeholder={selectedGoal.goal_type === "change" ? "可选：记录测量说明" : selectedGoal.goal_type === "project" ? "项目进度由任务完成率自动计算" : "记录今天的进展"} onChange={(event) => setEntryNote(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submitEntry(); }} />
              <button disabled={selectedGoal.status !== "active" || selectedGoal.goal_type === "project"} className="btn-primary" onClick={() => void submitEntry()}>
                {selectedGoal.goal_type === "change"
                  ? `记录当前 ${entryValue}${selectedGoal.unit}`
                  : selectedGoal.goal_type === "project"
                    ? "项目自动计算"
                  : `记录 +${entryValue}${selectedGoal.unit}`}
              </button>
              {["active", "paused"].includes(selectedGoal.status) ? <button className="btn-ghost" onClick={() => void updateGoal(selectedGoal.id, { status: selectedGoal.status === "paused" ? "active" : "paused" }).then(refresh)}>{selectedGoal.status === "paused" ? "继续目标" : "暂停"}</button> : null}
              <button className="btn-ghost" onClick={() => openGoalEditor(selectedGoal)}>编辑</button>
              <button className="btn-ghost" onClick={() => void reconcileGoalEntries(selectedGoal.id).then((count) => { useAppStore.getState().setToast(count ? `已清理 ${count} 条不兼容贡献` : "贡献记录无需清理"); return refresh(); })}>检查贡献</button>
              {["active", "paused"].includes(selectedGoal.status) ? <button className="btn-ghost" onClick={() => void updateGoal(selectedGoal.id, { status: "completed" }).then(refresh)}>完成</button> : null}
              {["active", "paused"].includes(selectedGoal.status) ? <button className="btn-ghost danger" onClick={() => void updateGoal(selectedGoal.id, { status: "abandoned" }).then(refresh)}>放弃</button> : null}
              <button className="btn-ghost" onClick={() => void updateGoal(selectedGoal.id, { status: "archived" }).then(() => { setSelectedGoalId(null); return refresh(); })}>归档</button>
            </div>
            <div className="growth-columns">
              <section className="growth-panel"><h3>里程碑</h3><div className="goal-inline-form"><input value={milestoneTitle} placeholder="阶段目标" onChange={(event) => setMilestoneTitle(event.target.value)} /><input type="number" value={milestoneValue} placeholder="目标值" onChange={(event) => setMilestoneValue(event.target.value)} /><button onClick={() => { if (!milestoneTitle.trim()) return; void createGoalMilestone(selectedGoal.id, milestoneTitle, Number(milestoneValue)).then(() => { setMilestoneTitle(""); setMilestoneValue(""); return refresh(); }); }}>添加</button></div>{milestones.filter((item) => item.goal_id === selectedGoal.id).map((item) => <div key={item.id} className={`milestone-row ${item.completed_at ? "done" : ""}`}><i>{item.completed_at ? "✓" : "○"}</i><span>{item.title}</span><strong>{item.target_value}{selectedGoal.unit}</strong></div>)}</section>
              <section className="growth-panel"><h3>成长时间线</h3>{entries.filter((entry) => entry.goal_id === selectedGoal.id).slice(0,20).map((entry) => <div key={entry.id} className="growth-entry"><time>{entry.entry_date}</time><div><strong>{selectedGoal.goal_type === "change" ? `当前 ${entry.value}` : `+${entry.value}`}{selectedGoal.unit}</strong><p>{entry.note || entry.source_type}</p></div></div>)}</section>
            </div>
          </section>
        ) : (
          <section className="goal-grid">{goals.map((goal) => <GoalCard key={goal.id} goal={goal} onOpen={() => setSelectedGoalId(goal.id)} />)}{!goals.length ? <div className="empty-state">创建第一个长期目标，让每天的任务有更清晰的方向。</div> : null}</section>
        )
      ) : null}

      {tab === "achievements" ? (
        <section>
          <div className="achievement-compose growth-panel"><input value={achievementTitle} placeholder="记录一个值得纪念的成就" onChange={(event) => setAchievementTitle(event.target.value)} /><input value={achievementDescription} placeholder="写下这件事为什么重要" onChange={(event) => setAchievementDescription(event.target.value)} /><select value={selectedGoalId ?? ""} onChange={(event) => setSelectedGoalId(event.target.value || null)}><option value="">不关联目标</option>{goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</select><button className="btn-primary" onClick={() => { if (!achievementTitle.trim()) return; void createAchievement({ title: achievementTitle, description: achievementDescription, achieved_at: todayDateString(), goal_id: selectedGoalId, source_type: "manual" }).then(() => { setAchievementTitle(""); setAchievementDescription(""); return refresh(); }); }}>保存成就</button></div>
          <div className="achievement-grid">{achievements.map((achievement) => <AchievementCard key={achievement.id} achievement={achievement} onPin={() => void toggleAchievementPinned(achievement.id).then(refresh)} />)}</div>
        </section>
      ) : null}

      {showCreate ? <div className="modal-backdrop" onMouseDown={() => setShowCreate(false)}><div className="goal-create-modal" onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><h3>创建长期目标</h3><button onClick={() => setShowCreate(false)}>×</button></div><label>目标名称<input autoFocus value={goalTitle} placeholder="例如：今年读完24本书" onChange={(event) => setGoalTitle(event.target.value)} /></label><div className="form-row"><label>目标类型<select value={goalType} onChange={(event) => { const next = event.target.value as GoalType; setGoalType(next); setUnit(GOAL_TYPES.find((item) => item.value === next)?.unit ?? "次"); setStartValue("0"); }} >{GOAL_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>{goalType !== "project" ? <label>{goalType === "change" ? "起始值" : "当前值"}<input type="number" value={startValue} onChange={(event) => setStartValue(event.target.value)} /></label> : null}{goalType !== "project" ? <label>目标值<input type="number" value={targetValue} onChange={(event) => setTargetValue(event.target.value)} /></label> : null}{goalType !== "project" ? <label>单位<input value={unit} onChange={(event) => setUnit(event.target.value)} /></label> : null}</div>{goalType === "frequency" ? <label>每周目标次数<input type="number" min="1" value={weeklyTarget} onChange={(event) => setWeeklyTarget(event.target.value)} /></label> : null}{goalType === "project" ? <label>关联项目<select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">请选择项目</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label> : null}<label>目标日期<input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} /></label><label>为什么想完成它<textarea value={motivation} onChange={(event) => setMotivation(event.target.value)} /></label><div className="goal-color-picker">{COLORS.map((item) => <button key={item} className={color === item ? "active" : ""} style={{ background: item }} onClick={() => setColor(item)} />)}</div><button className="btn-primary" onClick={() => void submitGoal()}>创建目标</button></div></div> : null}

      {selectedDate ? <div className="modal-backdrop" onMouseDown={() => setSelectedDate(null)}><div className="day-activity-modal" onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span>成长回看</span><h3>{selectedDate}</h3></div><button onClick={() => setSelectedDate(null)}>×</button></div>{(entriesByDate.get(selectedDate) ?? []).map((entry) => { const goal = goals.find((item) => item.id === entry.goal_id); return <div className="day-activity-row" key={entry.id}><i style={{ background: goal?.color }} /><div><strong>{entry.note || "记录了一次成长"}</strong><span>{goal?.title} · +{entry.value}{goal?.unit}</span></div></div>; })}{!(entriesByDate.get(selectedDate) ?? []).length ? <div className="empty-state">这一天没有记录。空白不是失败，只是尚未留下足迹。</div> : null}</div></div> : null}
    </div>
  );
}

function GoalCard({ goal, onOpen }: { goal: Goal; onOpen: () => void }) {
  const progress = calculateGoalProgress(goal);
  const target = goal.goal_type === "frequency" && goal.weekly_target ? goal.weekly_target : goal.target_value;
  return <button className="goal-card" onClick={onOpen}><div className="goal-card-head"><i style={{ background: goal.color }} /><span>{GOAL_STATUS_LABEL[goal.status]}</span></div><h3>{goal.title}</h3><p>{goal.current_value}{goal.unit} / {target}{goal.unit}{goal.goal_type === "frequency" ? "（本周）" : ""}</p><div className="goal-progress-track"><i style={{ width: `${progress}%`, background: goal.color }} /></div><footer><span>{Math.round(progress)}%</span><span>{goal.target_date ? `目标 ${goal.target_date}` : "长期目标"}</span></footer></button>;
}

function AchievementCard({ achievement, onPin }: { achievement: Achievement; onPin?: () => void }) {
  return <article className="achievement-card"><div className="achievement-medal">✦</div><div><time>{achievement.achieved_at}</time><h3>{achievement.title}</h3><p>{achievement.description || "这一刻值得被记住。"}</p></div>{onPin ? <button className={achievement.pinned ? "active" : ""} onClick={onPin}>{achievement.pinned ? "已置顶" : "置顶"}</button> : null}</article>;
}
