/**
 * ABOUTME: Custom hook for managing todo state with add, toggle, and delete operations
 * Persists todos to localStorage for cross-reload persistence
 */

import { useState, useCallback, useEffect } from "react";
import type { Todo } from "../types/todo";

const STORAGE_KEY = "todos";

function loadTodosFromStorage(): Todo[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors, return empty array
  }
  return [];
}

function saveTodosToStorage(todos: Todo[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  } catch {
    // Ignore storage errors (e.g., quota exceeded)
  }
}

export function useTodos(initialTodos: Todo[] = []) {
  const [todos, setTodos] = useState<Todo[]>(() => {
    const stored = loadTodosFromStorage();
    return stored.length > 0 ? stored : initialTodos;
  });

  // Persist todos to localStorage whenever they change
  useEffect(() => {
    saveTodosToStorage(todos);
  }, [todos]);

  const addTodo = useCallback((text: string) => {
    if (!text.trim()) return;
    
    const newTodo: Todo = {
      id: crypto.randomUUID(),
      text: text.trim(),
      completed: false,
      createdAt: Date.now(),
    };
    
    setTodos((prev) => [newTodo, ...prev]);
  }, []);

  const toggleTodo = useCallback((id: string) => {
    setTodos((prev) =>
      prev.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      )
    );
  }, []);

  const deleteTodo = useCallback((id: string) => {
    setTodos((prev) => prev.filter((todo) => todo.id !== id));
  }, []);

  return { todos, addTodo, toggleTodo, deleteTodo };
}
