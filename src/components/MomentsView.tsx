import { useEffect, useMemo, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { useAppStore } from "@/store/app";
import {
  createFutureLetter,
  createInspiration,
  fetchDailyReflections,
  fetchFutureLetters,
  fetchInspirations,
  openFutureLetter,
  saveDailyReflection,
  updateInspirationStatus,
} from "@/lib/db";
import { todayDateString, nowTimeString, parseTimeToMinutes } from "@/lib/dates";
import { buildDailyMomentSummary, daysUntilMoment, parseMomentTags } from "@/lib/moments";
import { findFirstAvailableTimeSlot } from "@/lib/planning";
import type { DailyReflection, FutureLetter, Inspiration } from "@/types";

type MomentMode = "today" | "ideas" | "letters";
type IdeaFilter = "inbox" | "processed" | "all";
const MOODS = ["愉快", "平静", "充实", "疲惫", "低落"] as const;
const MOOD_MARKS: Record<(typeof MOODS)[number], string> = { 愉快: "☀", 平静: "≈", 充实: "●", 疲惫: "◐", 低落: "☂" };

function formatDay(date: string) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date(`${date}T12:00:00`));
}

export function MomentsView({ mode }: { mode: MomentMode }) {
  const tasks = useAppStore((state) => state.tasks);
  const addTask = useAppStore((state) => state.addTask);
  const setToast = useAppStore((state) => state.setToast);
  const setNavigationGuard = useAppStore((state) => state.setNavigationGuard);
  const [reflections, setReflections] = useState<DailyReflection[]>([]);
  const [ideas, setIdeas] = useState<Inspiration[]>([]);
  const [letters, setLetters] = useState<FutureLetter[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [ideaFilter, setIdeaFilter] = useState<IdeaFilter>("inbox");
  const [showComposer, setShowComposer] = useState(false);
  const [reflectionEditing, setReflectionEditing] = useState(false);
  const [ideaComposing, setIdeaComposing] = useState(false);
  const today = todayDateString();
  const current = reflections.find((item) => item.reflection_date === today);
  const [harvest, setHarvest] = useState("");
  const [highlight, setHighlight] = useState("");
  const [mood, setMood] = useState<(typeof MOODS)[number]>("平静");
  const [tomorrow, setTomorrow] = useState("");
  const [idea, setIdea] = useState("");
  const [letterTitle, setLetterTitle] = useState("");
  const [letterContent, setLetterContent] = useState("");
  const [deliverAt, setDeliverAt] = useState("");

  const refresh = async () => {
    setLoading(true);
    try {
      if (mode === "today") setReflections(await fetchDailyReflections());
      if (mode === "ideas") setIdeas(await fetchInspirations(true));
      if (mode === "letters") setLetters(await fetchFutureLetters());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, [mode]);
  useEffect(() => {
    if (!current) return;
    setHarvest(current.harvest);
    setHighlight(current.highlight);
    setMood((current.mood as typeof mood) || "平静");
    setTomorrow(current.tomorrow_note);
  }, [current?.id]);

  const summary = useMemo(() => {
    return buildDailyMomentSummary(tasks, today);
  }, [tasks, today]);
  const reflectionDirty = harvest !== (current?.harvest ?? "") || highlight !== (current?.highlight ?? "") || mood !== (current?.mood || "平静") || tomorrow !== (current?.tomorrow_note ?? "");

  useEffect(() => {
    if (mode !== "today" || !reflectionEditing || !reflectionDirty) {
      setNavigationGuard(null);
      return;
    }
    const confirmLeave = () => window.confirm("今日拾光还有未保存的内容，确定离开吗？");
    const warnBeforeClose = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    setNavigationGuard(confirmLeave);
    window.addEventListener("beforeunload", warnBeforeClose);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeClose);
      if (useAppStore.getState().navigationGuard === confirmLeave) {
        useAppStore.getState().setNavigationGuard(null);
      }
    };
  }, [mode, reflectionEditing, reflectionDirty, setNavigationGuard]);

  const saveReflection = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await saveDailyReflection(today, { harvest, highlight, mood, tomorrow_note: tomorrow, auto_summary: summary });
      await refresh(); setReflectionEditing(false); setToast("今天的拾光已保存");
    } finally { setBusy(false); }
  };

  const saveIdea = async () => {
    if (!idea.trim() || busy) return;
    setBusy(true);
    try { await createInspiration(idea); setIdea(""); setIdeaComposing(false); await refresh(); setToast("灵感已拾起"); }
    finally { setBusy(false); }
  };

  const turnIntoTask = async (item: Inspiration) => {
    if (busy) return;
    setBusy(true);
    try {
      const today = todayDateString();
      const now = parseTimeToMinutes(nowTimeString(false)) ?? 9 * 60;
      const slot = findFirstAvailableTimeSlot(tasks, today, 30, Math.max(9 * 60, now));
      const task = await addTask({
        title: item.content.replace(/#[^\s#]+/g, "").trim() || item.content,
        due_date: today,
        my_day_date: today,
        due_time: slot?.start ?? null,
        end_time: slot?.end ?? null,
        estimated_minutes: 30,
      });
      if (!task) {
        setToast("创建任务失败，灵感仍保留在拾念箱");
        return;
      }
      await updateInspirationStatus(item.id, "processed");
      await refresh();
      setToast(slot ? `已加入今日计划 · ${slot.start}` : "已加入今日计划");
    } finally {
      setBusy(false);
    }
  };

  const saveLetter = async () => {
    if (!letterTitle.trim() || !letterContent.trim() || !deliverAt || busy) return;
    setBusy(true);
    try {
      await createFutureLetter(letterTitle, letterContent, new Date(deliverAt).toISOString());
      setLetterTitle(""); setLetterContent(""); setDeliverAt(""); setShowComposer(false);
      await refresh(); setToast("信件已交给时间保管");
    } finally { setBusy(false); }
  };

  if (loading) return <main className="main-workspace moments-page"><div className="moments-loading" aria-live="polite">正在拾起时光…</div></main>;
  if (mode === "today") return <TodayReflectionPage reflections={reflections} today={today} summary={summary} harvest={harvest} highlight={highlight} mood={mood} tomorrow={tomorrow} dirty={reflectionDirty} busy={busy} hasEntry={Boolean(current)} editing={reflectionEditing} onEdit={() => setReflectionEditing(true)} onCancel={() => { setHarvest(current?.harvest ?? ""); setHighlight(current?.highlight ?? ""); setMood((current?.mood as typeof mood) || "平静"); setTomorrow(current?.tomorrow_note ?? ""); setReflectionEditing(false); }} onHarvest={setHarvest} onHighlight={setHighlight} onMood={setMood} onTomorrow={setTomorrow} onSave={saveReflection} />;

  const visibleIdeas = ideas.filter((item) => ideaFilter === "all" ? item.status !== "archived" : item.status === ideaFilter);
  if (mode === "ideas") return <main className="main-workspace moments-page ideas-page">
    <PageHeading eyebrow="拾光 · 灵感" title="拾念箱" description="这里收着你曾经闪过的念头。" action="记录念头" onAction={() => setIdeaComposing(true)} />
    <nav className="idea-filters" aria-label="拾念筛选">{([['inbox','未整理'],['processed','已转任务'],['all','全部']] as const).map(([id,label]) => <button key={id} className={ideaFilter === id ? "active" : ""} onClick={() => setIdeaFilter(id)}>{label}</button>)}</nav>
      {visibleIdeas.length ? <section className="idea-masonry">{visibleIdeas.map((item) => <article className="idea-note" key={item.id}><div className="idea-tags">{parseMomentTags(item.tags_json).map((tag) => <span key={tag}>#{tag}</span>)}</div><p>{item.content}</p><time>{new Date(item.created_at).toLocaleString()}</time><footer><button disabled={busy} onClick={() => void turnIntoTask(item)}>{busy ? "处理中…" : "转为任务"}</button><button disabled={busy} onClick={() => void updateInspirationStatus(item.id,"archived").then(refresh)}>归档</button></footer></article>)}</section> : <EmptyMoment title="这里还没有待整理的念头" description="第一条灵感会从这里开始被好好收藏。" action="现在记录" onAction={() => setIdeaComposing(true)} />}
    {ideaComposing ? <div className="modal-backdrop" onMouseDown={() => !busy && setIdeaComposing(false)}><section className="idea-composer-dialog" role="dialog" aria-modal="true" aria-labelledby="idea-compose-title" onMouseDown={(event) => event.stopPropagation()}><header><div><span>新拾一念</span><h2 id="idea-compose-title">记下此刻想到的</h2></div><button aria-label="关闭记录窗口" onClick={() => setIdeaComposing(false)}>×</button></header><textarea autoFocus aria-label="灵感内容" value={idea} onChange={(event) => setIdea(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void saveIdea(); } }} placeholder="可以用 #标签 随手分类" /><footer><span>Enter 保存 · Shift+Enter 换行</span><div><button className="btn-ghost" onClick={() => setIdeaComposing(false)}>取消</button><button className="btn-primary" disabled={!idea.trim() || busy} onClick={() => void saveIdea()}>{busy ? "拾取中…" : "收进拾念箱"}</button></div></footer></section></div> : null}
  </main>;

  const waiting = letters.filter((item) => item.status === "waiting");
  const arrived = letters.filter((item) => item.status !== "waiting");
  const nextLetter = [...waiting].sort((a,b) => a.deliver_at.localeCompare(b.deliver_at))[0];
  return <main className="main-workspace moments-page letters-page">
    <PageHeading eyebrow="拾光 · 时间信箱" title="拾光变迁" description="把现在的心意封存，交给未来某一天的自己。" action="写给未来" onAction={() => setShowComposer(true)} />
    <section className="letter-next">
      <div className="letter-next-copy"><span>{nextLetter ? "下一封信" : "时间信箱"}</span><strong>{nextLetter ? `${daysUntilMoment(nextLetter.deliver_at)} 天后抵达` : "还没有等待送达的信"}</strong><p>{nextLetter ? nextLetter.title : "写下一封信，让未来收到今天的你。"}</p></div>
      <div className="letter-countdown" aria-hidden="true"><span>{nextLetter ? daysUntilMoment(nextLetter.deliver_at) : "∞"}</span><small>{nextLetter ? "DAYS" : "TIME"}</small></div>
    </section>
    <section className="letter-section"><header><h3>等待送达</h3><span>{waiting.length} 封</span></header>{waiting.length ? <div className="letter-envelope-grid">{waiting.map((item) => <article className="letter-envelope" key={item.id}><span>已封存</span><h3>{item.title}</h3><time>{new Date(item.deliver_at).toLocaleString()} 送达</time><p>内容由时间暂时保管。</p></article>)}</div> : <EmptyMoment title="还没有等待送达的信" description="写下此刻的愿望、提醒或勇气，未来会替你打开。" action="写第一封" onAction={() => setShowComposer(true)} />}</section>
    {arrived.length ? <section className="letter-section"><header><h3>已经抵达</h3><span>{arrived.length} 封</span></header><div className="arrived-letter-list">{arrived.map((item) => <article className="arrived-letter" key={item.id}><div><span>来自 {new Date(item.created_at).toLocaleDateString()}</span><h3>{item.title}</h3><p>{item.content}</p></div>{item.status === "delivered" ? <button onClick={() => void openFutureLetter(item.id).then(refresh)}>收下这封信</button> : <span className="letter-kept">已珍藏</span>}</article>)}</div></section> : null}
    {showComposer ? <div className="modal-backdrop" onMouseDown={() => !busy && setShowComposer(false)}><section className="letter-composer" role="dialog" aria-modal="true" aria-labelledby="letter-compose-title" onMouseDown={(event) => event.stopPropagation()}><header><div><span>写给未来</span><h2 id="letter-compose-title">把今天交给时间</h2></div><button aria-label="关闭写信窗口" onClick={() => setShowComposer(false)}>×</button></header><label>信件标题<input autoFocus value={letterTitle} onChange={(event) => setLetterTitle(event.target.value)} placeholder="例如：写给完成项目后的我" /></label><label>想说的话<textarea value={letterContent} onChange={(event) => setLetterContent(event.target.value)} placeholder="此刻的你，想给未来留下什么？" /></label><label>送达时间<input type="datetime-local" value={deliverAt} onChange={(event) => setDeliverAt(event.target.value)} /></label><footer><button className="btn-ghost" onClick={() => setShowComposer(false)}>取消</button><button className="btn-primary" disabled={!letterTitle.trim() || !letterContent.trim() || !deliverAt || busy} onClick={() => void saveLetter()}>{busy ? "封存中…" : "交给时间"}</button></footer></section></div> : null}
  </main>;
}

function PageHeading({ eyebrow, title, description, action, onAction }: { eyebrow: string; title: string; description: string; action?: string; onAction?: () => void }) {
  return <header className="moment-page-heading"><div className="moment-heading-copy"><span>{eyebrow}</span><h2 tabIndex={-1}>{title}</h2><p>{description}</p></div>{action ? <button className="btn-primary" onClick={onAction}>{action}</button> : null}</header>;
}

function EmptyMoment({ title, description, action, onAction }: { title: string; description: string; action: string; onAction: () => void }) {
  return <section className="moment-empty"><strong>{title}</strong><p>{description}</p><button onClick={onAction}>{action}</button></section>;
}

function TodayReflectionPage(props: { reflections: DailyReflection[]; today: string; summary: string; harvest: string; highlight: string; mood: string; tomorrow: string; dirty: boolean; busy: boolean; hasEntry: boolean; editing: boolean; onEdit:()=>void; onCancel:()=>void; onHarvest: (v:string)=>void; onHighlight:(v:string)=>void; onMood:(v:any)=>void; onTomorrow:(v:string)=>void; onSave:()=>Promise<void> }) {
  const day = new Date(`${props.today}T12:00:00`);
  return <main className="main-workspace moments-page reflection-page journal-page">
    <header className="journal-page-head"><div><span>今日拾光</span><h2>{props.hasEntry ? "今天留下的这一页" : "今天，想留下些什么？"}</h2></div><div className="journal-page-head-actions"><p>{props.hasEntry ? "翻开今天，看看那些值得记住的小事。" : "不必写得完整，一句话也能让今天留下来。"}</p>{props.hasEntry && !props.editing ? <button className="moment-icon-button" aria-label="编辑今日拾光" title="编辑今日拾光" onClick={props.onEdit}><AppIcon name="edit" size={17} /></button> : null}</div></header>
    {!props.hasEntry && !props.editing ? <section className="journal-empty-cover"><span>{formatDay(props.today)}</span><strong>今天还是一张空白页</strong><p>等你愿意时，写下一点收获、一个瞬间，或一句给明天的话。</p><button className="btn-primary" onClick={props.onEdit}>写下今天</button></section> : <article className={`journal-book ${props.editing ? "is-editing" : "is-reading"}`} data-mood={props.mood}>
      <aside className="journal-left-page">
        <div className="journal-date-card"><strong>{String(day.getDate()).padStart(2,"0")}</strong><div><span>{day.toLocaleDateString("zh-CN", { month: "long" })}</span><small>{day.toLocaleDateString("zh-CN", { weekday: "long", year: "numeric" })}</small></div></div>
        <section className="journal-mood"><span>今天的心情</span>{props.editing ? <div className="mood-picker" role="group" aria-label="今日心情">{MOODS.map((item) => <button key={item} aria-label={item} title={item} aria-pressed={props.mood === item} className={props.mood === item ? "active" : ""} onClick={() => props.onMood(item)}><i>{MOOD_MARKS[item]}</i><small>{item}</small></button>)}</div> : <div className="journal-mood-display"><i>{MOOD_MARKS[props.mood as keyof typeof MOOD_MARKS] || MOOD_MARKS.平静}</i><strong>{props.mood}</strong></div>}</section>
        <section className="journal-day-slip"><span>今天的行动小票</span><p>{props.summary}</p></section>
        <blockquote>“平常的一天，也值得被认真收藏。”</blockquote>
      </aside>
      <section className="journal-right-page">
        <div className="journal-page-number">{formatDay(props.today)} · PAGE {props.reflections.length + 1}</div>
        {props.editing ? <><label className="journal-main-entry"><span>今天有什么收获？</span><textarea autoFocus value={props.harvest} onChange={(event) => props.onHarvest(event.target.value)} placeholder="写下学到的、完成的、突然明白的，或者只是今天吹过的一阵风……" /></label><label className="journal-line-entry"><span>今天最想留住的一个瞬间</span><input value={props.highlight} onChange={(event) => props.onHighlight(event.target.value)} placeholder="一句话、一个人、一件小小的事" /></label><label className="journal-line-entry journal-tomorrow"><span>写给明天</span><input value={props.tomorrow} onChange={(event) => props.onTomorrow(event.target.value)} placeholder="明天继续向前时，别忘了……" /></label><footer><span>{props.dirty ? "这一页还没有收好" : "内容没有变化"}</span><div><button className="btn-ghost" disabled={props.busy} onClick={props.onCancel}>取消</button><button className="btn-primary" disabled={!props.dirty || props.busy} onClick={() => void props.onSave()}>{props.busy ? "正在收好…" : "收好这一页"}</button></div></footer></> : <div className="journal-reading"><section className="journal-reading-entry"><span>今日收获</span><p>{props.harvest || "今天没有写下收获，但这一天依然被好好记住了。"}</p></section><section className="journal-reading-highlight"><span>最想留住的瞬间</span><strong>{props.highlight || "一个安静而普通的瞬间"}</strong></section><section className="journal-reading-tomorrow"><span>写给明天</span><p>{props.tomorrow || "明天也慢慢来。"}</p></section></div>}
      </section>
    </article>}
    {props.reflections.length ? <section className="journal-archive"><header><div><span>日记索引</span><h3>最近写下的日子</h3></div><small>共 {props.reflections.length} 篇</small></header><div>{props.reflections.slice(0,8).map((item) => <article key={item.id}><time><strong>{item.reflection_date.slice(8)}</strong><span>{item.reflection_date.slice(5,7)}月</span></time><div><small>{item.mood || "平静"}</small><h4>{item.highlight || item.harvest || "安静的一天"}</h4><p>{item.harvest || item.tomorrow_note}</p></div></article>)}</div></section> : null}
  </main>;
}
