import { useNavigate } from "react-router-dom";

function Navbar() {
  const navigate = useNavigate();

  return (
    <nav className="navbar">

      {/* =====================================================
          BRAND
      ====================================================== */}

      <div
        className="navbar-brand"
        onClick={() => navigate("/documents")}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            navigate("/documents");
          }
        }}
      >
        <span className="navbar-logo">
          S
        </span>

        <span className="navbar-title">
          StudyMate
        </span>
      </div>

      {/* =====================================================
          NAVIGATION
      ====================================================== */}

      <div className="navbar-links">

        <button
          type="button"
          onClick={() => navigate("/documents")}
        >
          Documents
        </button>

        <button
          type="button"
          onClick={() => navigate("/quizzes")}
        >
          Quizzes
        </button>

        <button
          type="button"
          onClick={() => navigate("/settings")}
        >
          Settings
        </button>

      </div>

    </nav>
  );
}

export default Navbar;