import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const links = [
  { to: "/", label: "Dashboard" },
  { to: "/characters", label: "Characters" },
  { to: "/raids", label: "Raids" },
  { to: "/loot", label: "Loot" },
  { to: "/inventory", label: "Inventory" },
  { to: "/rested", label: "Rested XP" },
  { to: "/settings", label: "Settings" }
];

function Layout({ children }) {
  const { user, isAdmin } = useAuth();
  const navLinks = isAdmin ? [...links, { to: "/admin", label: "Admin" }] : links;

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
        {navLinks.map((link) => (
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
