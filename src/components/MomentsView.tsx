import { useEffect, useMemo, useState } from "react";
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
import { todayDateString } from "@/lib/dates";
import { buildDailyMomentSummary, daysUntilMoment, parseMomentTags } from "@/lib/moments";
import type { DailyReflection, FutureLetter, Inspiration } from "@/types";

type MomentMode = "today" | "ideas" | "letters";
type IdeaFilter = "inbox" | "processed" | "all";
const MOODS = ["愉快", "平静", "充实", "疲惫", "低落"] as const;

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
    if (mode !== "today" || !reflectionDirty) {
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
  }, [mode, reflectionDirty, setNavigationGuard]);

  const saveReflection = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await saveDailyReflection(today, { harvest, highlight, mood, tomorrow_note: tomorrow, auto_summary: summary });
      await refresh(); setToast("今天的拾光已保存");
    } finally { setBusy(false); }
  };

  const saveIdea = async () => {
    if (!idea.trim() || busy) return;
    setBusy(true);
    try { await createInspiration(idea); setIdea(""); await refresh(); setToast("灵感已拾起"); }
    finally { setBusy(false); }
  };

  const turnIntoTask = async (item: Inspiration) => {
    await addTask({ title: item.content, due_date: null });
    await updateInspirationStatus(item.id, "processed");
    await refresh(); setToast("已转为待办任务");
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
  if (mode === "today") return <TodayReflectionPage reflections={reflections} today={today} summary={summary} harvest={harvest} highlight={highlight} mood={mood} tomorrow={tomorrow} dirty={reflectionDirty} busy={busy} onHarvest={setHarvest} onHighlight={setHighlight} onMood={setMood} onTomorrow={setTomorrow} onSave={saveReflection} />;

  const visibleIdeas = ideas.filter((item) => ideaFilter === "all" ? item.status !== "archived" : item.status === ideaFilter);
  if (mode === "ideas") return <main className="main-workspace moments-page ideas-page">
    <PageHeading eyebrow="拾光 · 灵感" title="拾念箱" description="先把念头留下，再决定它要去哪里。" />
    <section className="idea-capture" aria-label="快速记录灵感"><textarea aria-label="灵感内容" value={idea} onChange={(event) => setIdea(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void saveIdea(); } }} placeholder="现在想到了什么？可以用 #标签 随手分类" /><button disabled={!idea.trim() || busy} onClick={() => void saveIdea()}>{busy ? "拾取中…" : "拾起"}</button><span>Enter 保存 · Shift+Enter 换行</span></section>
    <nav className="idea-filters" aria-label="拾念筛选">{([['inbox','未整理'],['processed','已转任务'],['all','全部']] as const).map(([id,label]) => <button key={id} className={ideaFilter === id ? "active" : ""} onClick={() => setIdeaFilter(id)}>{label}</button>)}</nav>
      {visibleIdeas.length ? <section className="idea-masonry">{visibleIdeas.map((item) => <article className="idea-note" key={item.id}><div className="idea-tags">{parseMomentTags(item.tags_json).map((tag) => <span key={tag}>#{tag}</span>)}</div><p>{item.content}</p><time>{new Date(item.created_at).toLocaleString()}</time><footer><button onClick={() => void turnIntoTask(item)}>转为任务</button><button onClick={() => void updateInspirationStatus(item.id,"archived").then(refresh)}>归档</button></footer></article>)}</section> : <EmptyMoment title="这里还没有待整理的念头" description="按 Ctrl/Cmd + Shift + Space，随时拾起第一条灵感。" action="现在记录" onAction={() => document.querySelector<HTMLTextAreaElement>(".idea-capture textarea")?.focus()} />}
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
  return <header className="moment-page-heading"><div className="moment-heading-copy"><span>{eyebrow}</span><h2 tabIndex={-1}>{title}</h2><p>{description}</p></div><div className="moment-heading-orbit" aria-hidden="true"><i /><i /><i /></div>{action ? <button className="btn-primary" onClick={onAction}>{action}</button> : null}</header>;
}

function EmptyMoment({ title, description, action, onAction }: { title: string; description: string; action: string; onAction: () => void }) {
  return <section className="moment-empty"><strong>{title}</strong><p>{description}</p><button onClick={onAction}>{action}</button></section>;
}

function TodayReflectionPage(props: { reflections: DailyReflection[]; today: string; summary: string; harvest: string; highlight: string; mood: string; tomorrow: string; dirty: boolean; busy: boolean; onHarvest: (v:string)=>void; onHighlight:(v:string)=>void; onMood:(v:any)=>void; onTomorrow:(v:string)=>void; onSave:()=>Promise<void> }) {
  return <main className="main-workspace moments-page reflection-page"><PageHeading eyebrow="拾光 · 今日回望" title="今日拾光" description="不必写得完整，只留下今天最值得记住的一点。" /><article className="reflection-sheet" data-mood={props.mood}><header><div className="reflection-date"><time>{formatDay(props.today)}</time><h3>今天，想留下些什么？</h3></div><div className="mood-picker" role="group" aria-label="今日心情">{MOODS.map((item) => <button key={item} aria-pressed={props.mood === item} className={props.mood === item ? "active" : ""} onClick={() => props.onMood(item)}>{item}</button>)}</div></header><p className="reflection-summary">{props.summary}</p><label><span>今天有什么收获？</span><textarea value={props.harvest} onChange={(event) => props.onHarvest(event.target.value)} placeholder="学到的、完成的、突然明白的……" /></label><label><span>最值得记住的一件事</span><input value={props.highlight} onChange={(event) => props.onHighlight(event.target.value)} placeholder="一个瞬间、一句话，或一个小小的突破" /></label><label><span>给明天留一句话</span><input value={props.tomorrow} onChange={(event) => props.onTomorrow(event.target.value)} placeholder="明天继续向前时，别忘了……" /></label><footer><span>{props.dirty ? "有尚未保存的变化" : "今天的拾光已安放"}</span><button className="btn-primary" disabled={!props.dirty || props.busy} onClick={() => void props.onSave()}>{props.busy ? "保存中…" : "保存今日拾光"}</button></footer></article>{props.reflections.length ? <section className="reflection-timeline"><header><h3>最近拾光</h3><span>{props.reflections.length} 天</span></header><div>{props.reflections.slice(0,7).map((item) => <article key={item.id}><time>{item.reflection_date.slice(5).replace("-",".")}</time><strong>{item.highlight || item.harvest || "安静的一天"}</strong><p>{item.harvest}</p></article>)}</div></section> : <EmptyMoment title="今天是第一束光" description="写下一点收获，之后的每一天会在这里连成时间线。" action="开始书写" onAction={() => document.querySelector<HTMLTextAreaElement>(".reflection-sheet textarea")?.focus()} />}</main>;
}
