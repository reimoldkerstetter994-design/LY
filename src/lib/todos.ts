export type Filter = "all" | "active" | "completed";

export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  createdAt: number;
}

export function createTodo(title: string): Todo {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2),
    title: title.trim(),
    completed: false,
    createdAt: Date.now(),
  };
}

export function addTodo(todos: Todo[], title: string): Todo[] {
  const trimmed = title.trim();
  if (!trimmed) return todos;
  return [createTodo(trimmed), ...todos];
}

export function toggleTodo(todos: Todo[], id: string): Todo[] {
  return todos.map((t) =>
    t.id === id ? { ...t, completed: !t.completed } : t,
  );
}

export function removeTodo(todos: Todo[], id: string): Todo[] {
  return todos.filter((t) => t.id !== id);
}

export function clearCompleted(todos: Todo[]): Todo[] {
  return todos.filter((t) => !t.completed);
}

export function filterTodos(todos: Todo[], filter: Filter): Todo[] {
  switch (filter) {
    case "active":
      return todos.filter((t) => !t.completed);
    case "completed":
      return todos.filter((t) => t.completed);
    default:
      return todos;
  }
}

export function remainingCount(todos: Todo[]): number {
  return todos.filter((t) => !t.completed).length;
}
