import type { KeyboardEvent } from "react";

/**
 * ARIA tablist keyboard navigation with automatic activation.
 * Wire this to the role="tablist" container's onKeyDown, and set tabIndex={0}
 * on the active tab and -1 on the rest so focus roves between tabs.
 */
export function onTabsKeyDown(event: KeyboardEvent<HTMLDivElement>, activate: (index: number) => void) {
  const container = event.currentTarget;
  const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  if (!tabs.length) return;
  let current = tabs.indexOf(document.activeElement as HTMLButtonElement);
  if (current === -1) current = tabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true");
  if (current === -1) return;

  let next = -1;
  if (event.key === "ArrowRight") next = current + 1;
  else if (event.key === "ArrowLeft") next = current - 1;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = tabs.length - 1;
  if (next === -1) return;

  event.preventDefault();
  const wrapped = (next + tabs.length) % tabs.length;
  const target = tabs[wrapped];
  if (!target) return;
  activate(next);
  target.focus();
}
