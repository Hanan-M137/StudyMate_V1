import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { registerUser } from "../services/api";

function Register() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    password: "",
  });

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
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
    setSuccess("");

    // Basic frontend validation
    if (
      !formData.full_name.trim() ||
      !formData.email.trim() ||
      !formData.password.trim()
    ) {
      setError("Please fill in all fields.");
      return;
    }

    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    try {
      const result = await registerUser({
        full_name: formData.full_name.trim(),
        email: formData.email.trim(),
        password: formData.password,
      });

      setSuccess(
        result.message || "Account created successfully."
      );

      // Clear form after successful registration
      setFormData({
        full_name: "",
        email: "",
        password: "",
      });

      // Move to login page after a short delay
      setTimeout(() => {
        navigate("/login");
      }, 1200);
    } catch (error) {
      setError(
        error.message || "Registration failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">

        <div className="auth-header">
          <h1>Create your StudyMate account</h1>

          <p>
            Create an account to manage your study documents
            and use StudyMate.
          </p>
        </div>

        <form onSubmit={handleSubmit}>

          {/* Full Name */}
          <div className="form-group">
            <label htmlFor="full_name">
              Full Name
            </label>

            <input
              id="full_name"
              name="full_name"
              type="text"
              value={formData.full_name}
              onChange={handleChange}
              placeholder="Enter your full name"
              autoComplete="name"
              disabled={loading}
            />
          </div>

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
              autoComplete="new-password"
              disabled={loading}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="form-success" role="status">
              {success}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
          >
            {loading ? "Creating account..." : "Register"}
          </button>

        </form>

        <div className="auth-footer">
          <p>
            Already have an account?{" "}
            <Link to="/login">
              Login
            </Link>
          </p>
        </div>

      </div>
    </div>
  );
}

export default Register;