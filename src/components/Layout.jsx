import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const links = [
  { to: "/", label: "Dashboard" },
  { to: "/characters", label: "Characters" },
  { to: "/raids", label: "Raids" },
  { to: "/loot", label: "Loot" },
  { to: "/settings", label: "Settings" }
];

function Layout({ children }) {
  const { user } = useAuth();

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div>
          <h1>Raid Loot Tracker</h1>
          <p className="subtitle">Who should you raid on next?</p>
        </div>
        <div className="user-pill">{user ? user.email : "Signed out"}</div>
      </header>

      <nav className="nav-bar">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === "/"}
            className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
          >
            {link.label}
          </NavLink>
        ))}
      </nav>

      <main>{children}</main>
    </div>
  );
}

export default Layout;
