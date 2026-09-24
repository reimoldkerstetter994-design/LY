import { useEffect, useMemo, useState } from "react";
import {
  addTodo,
  clearCompleted,
  filterTodos,
  remainingCount,
  removeTodo,
  toggleTodo,
  type Filter,
  type Todo,
} from "./lib/todos";
import "./App.css";

const STORAGE_KEY = "ly.todos.v1";

function loadTodos(): Todo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultTodos();
    const parsed = JSON.parse(raw) as Todo[];
    return Array.isArray(parsed) ? parsed : defaultTodos();
  } catch {
    return defaultTodos();
  }
}

function defaultTodos(): Todo[] {
  return [
    {
      id: "seed-1",
      title: "Explore the LY starter",
      completed: true,
      createdAt: Date.now() - 2000,
    },
    {
      id: "seed-2",
      title: "Add your first task",
      completed: false,
      createdAt: Date.now() - 1000,
    },
  ];
}

const FILTERS: Filter[] = ["all", "active", "completed"];

export default function App() {
  const [todos, setTodos] = useState<Todo[]>(loadTodos);
  const [filter, setFilter] = useState<Filter>("all");
  const [draft, setDraft] = useState("");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  }, [todos]);

  const visible = useMemo(() => filterTodos(todos, filter), [todos, filter]);
  const remaining = remainingCount(todos);

  function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    setTodos((current) => addTodo(current, draft));
    setDraft("");
  }

  return (
    <div className="app">
      <header className="hero">
        <span className="badge">Vite · React · TypeScript</span>
        <h1>LY Task Board</h1>
        <p className="subtitle">
          A minimal starter that proves the development environment runs end to
          end.
        </p>
      </header>

      <main className="card">
        <form className="add-form" onSubmit={handleAdd}>
          <input
            aria-label="New task"
            className="add-input"
            placeholder="What needs to be done?"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button className="add-button" type="submit">
            Add
          </button>
        </form>

        <div className="toolbar">
          <span className="count" data-testid="remaining-count">
            {remaining} {remaining === 1 ? "task" : "tasks"} left
          </span>
          <div className="filters" role="tablist" aria-label="Filter tasks">
            {FILTERS.map((option) => (
              <button
                key={option}
                role="tab"
                aria-selected={filter === option}
                className={`filter ${filter === option ? "is-active" : ""}`}
                onClick={() => setFilter(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <ul className="todo-list">
          {visible.length === 0 && (
            <li className="empty">Nothing here yet — add a task above.</li>
          )}
          {visible.map((todo) => (
            <li
              key={todo.id}
              className={`todo ${todo.completed ? "is-done" : ""}`}
            >
              <label className="todo-label">
                <input
                  type="checkbox"
                  checked={todo.completed}
                  onChange={() =>
                    setTodos((current) => toggleTodo(current, todo.id))
                  }
                />
                <span className="todo-title">{todo.title}</span>
              </label>
              <button
                className="delete"
                aria-label={`Delete ${todo.title}`}
                onClick={() =>
                  setTodos((current) => removeTodo(current, todo.id))
                }
              >
                ×
              </button>
            </li>
          ))}
        </ul>

        <footer className="card-footer">
          <button
            className="clear"
            onClick={() => setTodos((current) => clearCompleted(current))}
          >
            Clear completed
          </button>
        </footer>
      </main>

      <p className="footnote">Edit src/App.tsx and save to hot-reload.</p>
    </div>
  );
}
