import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { loginUser } from "../services/api";

function Login() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // ---------------------------------------------------------
  // Handle input changes
  // ---------------------------------------------------------

  function handleChange(event) {
    const { name, value } = event.target;

    setFormData((previousData) => ({
      ...previousData,
      [name]: value,
    }));
  }

  // ---------------------------------------------------------
  // Handle form submission
  // ---------------------------------------------------------

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");

    // Basic frontend validation
    if (
      !formData.email.trim() ||
      !formData.password.trim()
    ) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);

    try {
      await loginUser(
        formData.email.trim(),
        formData.password
      );

      // loginUser() stores the JWT token in localStorage.
      // After successful login, go to the documents page.
      navigate("/documents");
    } catch (error) {
      setError(
        error.message ||
          "Login failed. Please check your email and password."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">

        <div className="auth-header">
          <h1>Welcome to StudyMate</h1>

          <p>
            Sign in to access your study documents
            and AI study tools.
          </p>
        </div>

        <form onSubmit={handleSubmit}>

          {/* Email */}
          <div className="form-group">
            <label htmlFor="email">
              Email
            </label>

            <input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="Enter your email"
              autoComplete="email"
              disabled={loading}
            />
          </div>

          {/* Password */}
          <div className="form-group">
            <label htmlFor="password">
              Password
            </label>

            <input
              id="password"
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Enter your password"
              autoComplete="current-password"
              disabled={loading}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
          >
            {loading ? "Signing in..." : "Login"}
          </button>

        </form>

        <div className="auth-footer">
          <p>
            Don't have an account?{" "}
            <Link to="/register">
              Register
            </Link>
          </p>
        </div>

      </div>
    </div>
  );
}

export default Login;