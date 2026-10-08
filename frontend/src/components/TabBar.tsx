import { NavLink } from "react-router-dom";
import { CalendarDays, Inbox, CircleSlash, UserRound } from "lucide-react";
import { usePending } from "../hooks";

export function TabBar() {
  const pending = usePending();
  const waiting = pending.data?.waiting_me.length ?? 0;
  const tabs = [
    { to: "/", label: "Agenda", icon: CalendarDays, end: true },
    { to: "/pedidos", label: "Pedidos", icon: Inbox, badge: waiting },
    { to: "/recusados", label: "Recusados", icon: CircleSlash },
    { to: "/perfil", label: "Perfil", icon: UserRound },
  ];
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 backdrop-blur">
      <ul className="mx-auto flex max-w-lg justify-around">
        {tabs.map(({ to, label, icon: Icon, end, badge }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `relative flex flex-col items-center gap-0.5 pt-2 pb-1 text-[12px] font-bold ${
                  isActive ? "text-ink" : "text-muted"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={24} strokeWidth={isActive ? 2.5 : 2} aria-hidden />
                  {label}
                  {!!badge && (
                    <span className="absolute top-1 left-1/2 ml-2 grid min-w-5 place-items-center rounded-full bg-sun px-1 text-[12px] text-[#2a2205]">
                      {badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
