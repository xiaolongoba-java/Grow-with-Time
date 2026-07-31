import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/store/app";
import type { Milestone } from "@/types";
import {
  createMilestone,
  fetchMilestones,
  toggleMilestone,
  updateProject,
} from "@/lib/db";

export function ProjectsView() {
  const projects = useAppStore((state) => state.projects);
  const templates = useAppStore((state) => state.taskTemplates);
  const tasks = useAppStore((state) => state.tasks);
  const addProject = useAppStore((state) => state.addProject);
  const archiveProject = useAppStore((state) => state.archiveProject);
  const useTemplate = useAppStore((state) => state.useTemplate);
  const removeTemplate = useAppStore((state) => state.removeTemplate);
  const selectTask = useAppStore((state) => state.selectTask);
  const [name, setName] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const refreshMilestones = async () => setMilestones(await fetchMilestones());
  const createProject = async () => {
    const projectName = name.trim();
    if (!projectName) {
      nameInputRef.current?.focus();
      useAppStore.getState().setToast("请先输入项目名称");
      return;
    }
    await addProject(projectName);
    setName("");
    nameInputRef.current?.focus();
  };

  useEffect(() => {
    void refreshMilestones();
  }, []);

  return (
    <main className="main-workspace projects-view">
      <div className="workspace-top">
        <div>
          <h2>项目与模板</h2>
          <p className="workspace-subtitle">组织长期事项，复用常见任务结构</p>
        </div>
      </div>

      <div className="projects-scroll">
        <section>
          <div className="section-title-row">
            <h3>项目</h3>
            <div className="inline-create">
              <input
                ref={nameInputRef}
                className="field"
                value={name}
                placeholder="新项目名称"
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || !name.trim()) return;
                  void createProject();
                }}
              />
              <button
                type="button"
                className="btn-primary"
                onClick={() => void createProject()}
              >
                创建
              </button>
            </div>
          </div>

          <div className="project-grid">
            {projects.map((project) => {
              const projectTasks = tasks.filter(
                (task) => task.project_id === project.id && !task.deleted_at,
              );
              const done = projectTasks.filter(
                (task) => task.status === "completed",
              ).length;
              const progress = projectTasks.length
                ? Math.round((done / projectTasks.length) * 100)
                : 0;
              return (
                <article key={project.id} className="project-card">
                  <div className="project-card-head">
                    <span style={{ background: project.color }} />
                    <strong>{project.name}</strong>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => void archiveProject(project.id)}
                    >
                      归档
                    </button>
                  </div>
                  <p>{projectTasks.length} 项任务 · 已完成 {done}</p>
                  {project.goal ? (
                    <p className="project-goal">{project.goal}</p>
                  ) : (
                    <button
                      type="button"
                      className="project-inline-action"
                      onClick={() => {
                        const goal = window.prompt("项目目标");
                        if (goal?.trim()) {
                          void updateProject(project.id, {
                            goal: goal.trim(),
                          }).then(() => useAppStore.getState().refreshAll());
                        }
                      }}
                    >
                      ＋ 添加项目目标
                    </button>
                  )}
                  <div className="progress-bar">
                    <span style={{ width: `${progress}%` }} />
                  </div>
                  <div className="project-task-links">
                    {projectTasks.slice(0, 4).map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => selectTask(task.id)}
                      >
                        {task.status === "completed" ? "✓" : "○"} {task.title}
                      </button>
                    ))}
                  </div>
                  <div className="milestone-list">
                    {milestones
                      .filter((item) => item.project_id === project.id)
                      .map((item) => (
                        <label key={item.id}>
                          <input
                            type="checkbox"
                            checked={Boolean(item.completed)}
                            onChange={(event) =>
                              void toggleMilestone(
                                item.id,
                                event.target.checked,
                              ).then(refreshMilestones)
                            }
                          />
                          <span>{item.title}</span>
                        </label>
                      ))}
                    <button
                      type="button"
                      className="project-inline-action"
                      onClick={() => {
                        const title = window.prompt("里程碑名称");
                        if (title?.trim()) {
                          void createMilestone(
                            project.id,
                            title.trim(),
                          ).then(refreshMilestones);
                        }
                      }}
                    >
                      ＋ 添加里程碑
                    </button>
                  </div>
                </article>
              );
            })}
            {!projects.length ? (
              <div className="scope-empty">创建第一个项目来组织相关任务。</div>
            ) : null}
          </div>
        </section>

        <section>
          <div className="section-title-row">
            <h3>任务模板</h3>
            <span>可在任务详情中保存当前任务为模板</span>
          </div>
          <div className="template-grid">
            {templates.map((template) => (
              <article key={template.id} className="template-card">
                <strong>{template.name}</strong>
                <div>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void useTemplate(template.id)}
                  >
                    使用模板
                  </button>
                  <button
                    type="button"
                    className="btn-ghost danger"
                    onClick={() => void removeTemplate(template.id)}
                  >
                    删除
                  </button>
                </div>
              </article>
            ))}
            {!templates.length ? (
              <div className="scope-empty">还没有保存的任务模板。</div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
