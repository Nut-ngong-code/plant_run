import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { clearUserId } from "../lib/session.js";

const links = [
  { to: "/", label: "DASHBOARD", end: true },
  { to: "/devices/new", label: "DEVICES" },
  { to: "/history", label: "HISTORY" },
];

export function Header({ user }) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const logout = () => {
    clearUserId();
    navigate("/login");
  };

  const navClass = ({ isActive }) =>
    `relative px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-[0.18em] transition ${
      isActive
        ? "text-plant-700 bg-plant-100/80 border border-plant-300/50"
        : "text-forest-500 hover:text-forest-800 hover:bg-white/55 border border-transparent"
    }`;

  return (
    <header
      className={`sticky top-0 z-30 transition-all duration-300 ${
        scrolled
          ? "bg-white/65 backdrop-blur-xl border-b border-white/70 shadow-soft"
          : "bg-white/30 backdrop-blur-md border-b border-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
        <Link
          to="/"
          className="flex items-center gap-2.5 min-w-0 group"
          onClick={() => setMenuOpen(false)}
        >
          <span
            className="grid place-items-center h-9 w-9 rounded-xl bg-gradient-to-br from-plant-400 to-plant-600 shadow-glow-plant text-white font-black text-sm group-hover:scale-105 transition"
            aria-hidden
          >
            R⇢
          </span>
          <span className="font-display font-bold text-forest-900 truncate hidden xs:inline tracking-wide">
            RUN<span className="grad-text">→</span>GROW
          </span>
        </Link>

        {user && (
          <nav className="hidden md:flex items-center gap-1.5">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={navClass}>
                {l.label}
              </NavLink>
            ))}
          </nav>
        )}

        <div className="flex items-center gap-2">
          {user && (
            <>
              <span className="hidden sm:inline-flex items-center gap-2 chip surface-flat text-forest-700">
                <span className="h-1.5 w-1.5 rounded-full bg-plant-500 shadow-[0_0_8px_rgba(14,161,90,0.6)] animate-pulse" />
                <span className="max-w-[140px] truncate normal-case tracking-normal text-xs font-medium">
                  {user.displayName ?? "RUNNER"}
                </span>
              </span>
              <button
                onClick={logout}
                className="hidden md:inline btn-ghost text-[11px] uppercase tracking-wider"
                title="ออกจากระบบ"
              >
                LOGOUT
              </button>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="md:hidden p-2 rounded-lg hover:bg-white/55 text-forest-700"
                aria-label="เมนู"
              >
                <HamburgerIcon open={menuOpen} />
              </button>
            </>
          )}
        </div>
      </div>

      {user && menuOpen && (
        <nav className="md:hidden border-t border-white/70 bg-white/85 backdrop-blur-xl">
          <div className="max-w-6xl mx-auto px-4 py-2 flex flex-col">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `px-3 py-2.5 rounded-lg text-sm font-semibold tracking-wider ${
                    isActive
                      ? "bg-plant-100 text-plant-700 border border-plant-300/40"
                      : "text-forest-600 border border-transparent"
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
            <button
              onClick={logout}
              className="mt-1 px-3 py-2.5 text-sm text-left text-forest-500 hover:text-forest-800"
            >
              LOGOUT
            </button>
          </div>
        </nav>
      )}
    </header>
  );
}

function HamburgerIcon({ open }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
      {open ? (
        <>
          <path d="M5.5 5.5L16.5 16.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M16.5 5.5L5.5 16.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M3 7H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M3 11H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M3 15H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
