// Purpose: useDebouncedCommit.js provides exports: useDebouncedCommit.
// Interacts with: imports: react.
// Role: UI layer module within the broader app graph.
import { useCallback, useEffect, useRef } from "react";

export function useDebouncedCommit(fn, delayMs = 200) {
  const timeoutRef = useRef(null);
  const lastValueRef = useRef();

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const schedule = useCallback((value) => {
    lastValueRef.current = value;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      fn(lastValueRef.current);
    }, delayMs);
  }, [fn, delayMs]);

  const flush = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      fn(lastValueRef.current);
    }
  }, [fn]);

  useEffect(() => () => cancel(), [cancel]);

  return { schedule, flush, cancel };
}
