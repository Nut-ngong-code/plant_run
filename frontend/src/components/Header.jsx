import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { clearUserId } from "../lib/session.js";

const links = [
  { to: "/", label: "แดชบอร์ด", end: true },
  { to: "/devices/new", label: "เพิ่มกระถาง" },
  { to: "/history", label: "ประวัติ" },
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
    `relative px-3 py-1.5 rounded-lg text-sm transition ${
      isActive
        ? "text-plant-800 font-semibold bg-white/70 shadow-soft"
        : "text-plant-800/70 hover:text-plant-800 hover:bg-white/50"
    }`;

  return (
    <header
      className={`sticky top-0 z-20 transition-all duration-300 ${
        scrolled
          ? "bg-white/70 backdrop-blur-xl border-b border-white/60 shadow-soft"
          : "bg-white/40 backdrop-blur-md border-b border-transparent"
      }`}
    >
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
        <Link
          to="/"
          className="flex items-center gap-2.5 min-w-0 group"
          onClick={() => setMenuOpen(false)}
        >
          <span className="grid place-items-center h-9 w-9 rounded-xl bg-gradient-to-br from-plant-400 to-plant-700 shadow-glow-plant text-white text-lg group-hover:scale-105 transition" aria-hidden>
            🌱
          </span>
          <span className="font-bold text-plant-800 truncate hidden xs:inline">
            วิ่งเพื่อชีวิต<span className="grad-text">ต้นไม้</span>
          </span>
        </Link>

        {user && (
          <nav className="hidden md:flex items-center gap-1">
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
              <span className="hidden sm:inline-flex items-center gap-2 chip bg-white/60 border border-white/70 text-plant-800">
                <span className="h-2 w-2 rounded-full bg-plant-500 animate-pulse" />
                <span className="max-w-[140px] truncate">{user.displayName ?? "นักวิ่ง"}</span>
              </span>
              <button
                onClick={logout}
                className="hidden md:inline btn-ghost"
                title="ออกจากระบบ"
              >
                ออกจากระบบ
              </button>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="md:hidden p-2 rounded-lg hover:bg-white/60"
                aria-label="เมนู"
              >
                <HamburgerIcon open={menuOpen} />
              </button>
            </>
          )}
        </div>
      </div>

      {user && menuOpen && (
        <nav className="md:hidden border-t border-white/60 bg-white/80 backdrop-blur-xl">
          <div className="max-w-5xl mx-auto px-4 py-2 flex flex-col">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `px-3 py-2.5 rounded-lg text-sm ${
                    isActive ? "bg-plant-100 text-plant-800 font-semibold" : "text-plant-800/80"
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
            <button
              onClick={logout}
              className="mt-1 px-3 py-2.5 text-sm text-left text-gray-500 hover:text-gray-800"
            >
              ออกจากระบบ
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
