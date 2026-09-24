import { describe, expect, it } from "vitest";
import {
  addTodo,
  clearCompleted,
  filterTodos,
  remainingCount,
  removeTodo,
  toggleTodo,
  type Todo,
} from "./todos";

function seed(): Todo[] {
  return [
    { id: "1", title: "Write docs", completed: false, createdAt: 1 },
    { id: "2", title: "Ship feature", completed: true, createdAt: 2 },
  ];
}

describe("todos", () => {
  it("adds a trimmed todo to the front", () => {
    const result = addTodo(seed(), "  New task  ");
    expect(result).toHaveLength(3);
    expect(result[0].title).toBe("New task");
    expect(result[0].completed).toBe(false);
  });

  it("ignores empty titles", () => {
    const todos = seed();
    expect(addTodo(todos, "   ")).toBe(todos);
  });

  it("toggles completion", () => {
    const result = toggleTodo(seed(), "1");
    expect(result.find((t) => t.id === "1")?.completed).toBe(true);
  });

  it("removes a todo", () => {
    const result = removeTodo(seed(), "1");
    expect(result.map((t) => t.id)).toEqual(["2"]);
  });

  it("clears completed todos", () => {
    expect(clearCompleted(seed()).map((t) => t.id)).toEqual(["1"]);
  });

  it("filters todos", () => {
    const todos = seed();
    expect(filterTodos(todos, "active").map((t) => t.id)).toEqual(["1"]);
    expect(filterTodos(todos, "completed").map((t) => t.id)).toEqual(["2"]);
    expect(filterTodos(todos, "all")).toHaveLength(2);
  });

  it("counts remaining active todos", () => {
    expect(remainingCount(seed())).toBe(1);
  });
});
