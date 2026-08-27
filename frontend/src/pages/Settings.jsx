import { useState } from "react";

function Settings() {

  // =========================================================
  // STATE
  // =========================================================

  const [notifications, setNotifications] =
    useState(true);

  const [emailNotifications, setEmailNotifications] =
    useState(true);

  const [theme, setTheme] =
    useState("system");

  const [saved, setSaved] =
    useState(false);

  // =========================================================
  // SAVE SETTINGS
  // =========================================================

  function handleSave(event) {
    event.preventDefault();

    /*
      Settings are currently stored only
      in the frontend.

      A backend settings endpoint can be
      added later.
    */

    localStorage.setItem(
      "studymate_settings",
      JSON.stringify({
        notifications,
        emailNotifications,
        theme,
      })
    );

    setSaved(true);

    setTimeout(() => {
      setSaved(false);
    }, 2000);
  }

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <div className="settings-page">

      {/* =====================================================
          HEADER
      ====================================================== */}

      <div className="settings-header">

        <div>
          <h1>Settings</h1>

          <p>
            Manage your StudyMate preferences.
          </p>
        </div>

      </div>

      {/* =====================================================
          SETTINGS FORM
      ====================================================== */}

      <form
        className="settings-form"
        onSubmit={handleSave}
      >

        {/* ===================================================
            NOTIFICATIONS
        ==================================================== */}

        <section className="settings-section">

          <div className="settings-section-header">

            <h2>
              Notifications
            </h2>

            <p>
              Control how StudyMate notifies you.
            </p>

          </div>

          <label className="settings-option">

            <div>

              <strong>
                Notifications
              </strong>

              <span>
                Receive StudyMate notifications.
              </span>

            </div>

            <input
              type="checkbox"
              checked={notifications}
              onChange={(event) =>
                setNotifications(
                  event.target.checked
                )
              }
            />

          </label>

          <label className="settings-option">

            <div>

              <strong>
                Email Notifications
              </strong>

              <span>
                Receive important updates by email.
              </span>

            </div>

            <input
              type="checkbox"
              checked={emailNotifications}
              onChange={(event) =>
                setEmailNotifications(
                  event.target.checked
                )
              }
            />

          </label>

        </section>

        {/* ===================================================
            APPEARANCE
        ==================================================== */}

        <section className="settings-section">

          <div className="settings-section-header">

            <h2>
              Appearance
            </h2>

            <p>
              Choose how StudyMate looks.
            </p>

          </div>

          <div className="form-group">

            <label htmlFor="theme">
              Theme
            </label>

            <select
              id="theme"
              value={theme}
              onChange={(event) =>
                setTheme(
                  event.target.value
                )
              }
            >

              <option value="system">
                System Default
              </option>

              <option value="light">
                Light
              </option>

              <option value="dark">
                Dark
              </option>

            </select>

          </div>

        </section>

        {/* ===================================================
            SAVE
        ==================================================== */}

        <div className="settings-actions">

          <button
            type="submit"
          >
            Save Settings
          </button>

          {saved && (
            <span className="settings-saved">
              Settings saved.
            </span>
          )}

        </div>

      </form>

    </div>
  );
}

export default Settings;