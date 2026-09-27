import { useState, type ReactNode } from "react";

function load(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(`open:${key}`);
    return v == null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

/** Card whose body folds away; the open state is remembered per card on this computer. */
export function Collapsible({ id, title, aside, defaultOpen = true, children }: { id: string; title: ReactNode; aside?: ReactNode; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(() => load(id, defaultOpen));
  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem(`open:${id}`, open ? "0" : "1");
    } catch {
      /* per-viewer convenience only */
    }
  };
  return (
    <section className={`card collapsible ${open ? "open" : "closed"}`}>
      <button className="collapse-head" onClick={toggle} aria-expanded={open}>
        <span className="chev">{open ? "▾" : "▸"}</span>
        <h3>{title}</h3>
        {aside && <span className="muted small collapse-aside">{aside}</span>}
      </button>
      {open && <div className="collapse-body">{children}</div>}
    </section>
  );
}
