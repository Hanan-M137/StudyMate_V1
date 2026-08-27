import { NavLink } from "react-router-dom";

function Sidebar() {

  // =========================================================
  // NAVIGATION ITEMS
  // =========================================================

  const navigationItems = [
    {
      label: "Dashboard",
      path: "/dashboard",
      icon: "⌂",
    },
    {
      label: "Documents",
      path: "/documents",
      icon: "▣",
    },
    {
      label: "AI Chat",
      path: "/chat",
      icon: "◉",
    },
    {
      label: "Quizzes",
      path: "/quizzes",
      icon: "✓",
    },
  ];

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <aside className="sidebar">

      {/* =====================================================
          LOGO
      ====================================================== */}

      <div className="sidebar-logo">

        <div className="sidebar-logo-icon">
          S
        </div>

        <div className="sidebar-logo-text">
          <strong>
            StudyMate
          </strong>

          <span>
            AI Study Assistant
          </span>
        </div>

      </div>

      {/* =====================================================
          NAVIGATION
      ====================================================== */}

      <nav className="sidebar-navigation">

        <p className="sidebar-section-title">
          MENU
        </p>

        {navigationItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `sidebar-link ${
                isActive
                  ? "sidebar-link-active"
                  : ""
              }`
            }
          >

            <span className="sidebar-link-icon">
              {item.icon}
            </span>

            <span className="sidebar-link-label">
              {item.label}
            </span>

          </NavLink>
        ))}

      </nav>

      {/* =====================================================
          BOTTOM
      ====================================================== */}

      <div className="sidebar-bottom">

        <NavLink
          to="/profile"
          className={({ isActive }) =>
            `sidebar-link ${
              isActive
                ? "sidebar-link-active"
                : ""
            }`
          }
        >

          <span className="sidebar-link-icon">
            ◯
          </span>

          <span className="sidebar-link-label">
            Profile
          </span>

        </NavLink>

      </div>

    </aside>
  );
}

export default Sidebar;