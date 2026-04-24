import { useState } from "react";
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

  const logout = () => {
    clearUserId();
    navigate("/login");
  };

  const navClass = ({ isActive }) =>
    `px-3 py-1.5 rounded-md text-sm transition ${
      isActive ? "bg-plant-100 text-plant-700 font-medium" : "text-gray-600 hover:bg-gray-100"
    }`;

  return (
    <header className="bg-white border-b border-plant-100 sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
        <Link
          to="/"
          className="flex items-center gap-2 font-semibold text-plant-700 min-w-0"
          onClick={() => setMenuOpen(false)}
        >
          <span className="text-2xl" aria-hidden>🌱</span>
          <span className="truncate hidden xs:inline sm:inline">วิ่งเพื่อชีวิตต้นไม้</span>
        </Link>

        {/* Desktop nav */}
        {user && (
          <nav className="hidden md:flex items-center gap-1">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={navClass}>
                {l.label}
              </NavLink>
            ))}
          </nav>
        )}

        {/* Right side */}
        <div className="flex items-center gap-2">
          {user && (
            <>
              <span className="hidden sm:inline text-sm text-gray-600 max-w-[140px] truncate">
                สวัสดี, {user.displayName ?? "นักวิ่ง"}
              </span>
              <button
                onClick={logout}
                className="hidden md:inline text-sm text-gray-500 hover:text-gray-800 underline underline-offset-2"
              >
                ออกจากระบบ
              </button>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="md:hidden p-2 rounded-md hover:bg-gray-100"
                aria-label="เมนู"
              >
                <HamburgerIcon open={menuOpen} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Mobile menu */}
      {user && menuOpen && (
        <nav className="md:hidden border-t border-plant-100 bg-white">
          <div className="max-w-5xl mx-auto px-4 py-2 flex flex-col">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `px-2 py-2 rounded text-sm ${
                    isActive ? "bg-plant-100 text-plant-700 font-medium" : "text-gray-700"
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
            <button
              onClick={logout}
              className="mt-1 px-2 py-2 text-sm text-left text-gray-500 hover:text-gray-800"
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
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      {open ? (
        <>
          <path d="M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M3 6H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M3 10H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M3 14H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
