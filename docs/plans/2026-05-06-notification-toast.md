# Notification Toast Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the inline diagram error overlay with a top-right toast notification so parser feedback stays visible without covering the ER canvas.

**Architecture:** Keep parsing and export diagnostics in the existing hooks, but route user-facing messages through a small notification state in `App.tsx`. Render a lightweight toast layer above the main layout, with warning notices auto-dismissing and error notices staying visible until closed.

**Tech Stack:** React 19, TypeScript, Vitest, existing app CSS.

---

### Task 1: Add notification rules

**Files:**
- Create: `src/notifications.ts`
- Test: `src/test/notification.test.ts`

**Steps:**
1. Write failing tests for empty-input, partial-success, and failed-parse toast rules.
2. Implement the small pure helper that maps parser results to toast metadata.
3. Verify with `pnpm exec vitest run src/test/notification.test.ts`.

### Task 2: Route UI feedback through toast state

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/hooks/useGraph.ts`
- Modify: `css/style.css`

**Steps:**
1. Replace canvas error overlay rendering with a fixed toast container.
2. Keep warning notices auto-dismissed and error notices manually dismissible.
3. Preserve existing export error entry points by routing them to error notices.

### Task 3: Verify full project remains green

**Commands:**
- `pnpm run check`
- `pnpm run build`
