import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  SLOT_LABELS,
  WARRIOR_SIM_PAYLOAD_KEY,
  getWarriorSimUrl
} from "../utils/warriorSim";

function WarriorSimPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [copyMessage, setCopyMessage] = useState("");
  const simUrl = useMemo(() => getWarriorSimUrl(), []);
  const isLocalBridgeMode = useMemo(() => simUrl.startsWith("/wowsims/"), [simUrl]);

  const payload = useMemo(() => {
    const statePayload = location.state?.simJsonText;
    if (typeof statePayload === "string" && statePayload.trim()) {
      return statePayload;
    }

    const stored = sessionStorage.getItem(WARRIOR_SIM_PAYLOAD_KEY)
      || localStorage.getItem(WARRIOR_SIM_PAYLOAD_KEY);
    if (stored && stored.trim()) {
      return stored;
    }

    return "";
  }, [location.state]);

  const missingSlots = useMemo(() => {
    const slots = location.state?.missingSlots;
    return Array.isArray(slots) ? slots.filter((slot) => Number.isFinite(Number(slot))) : [];
  }, [location.state]);

  useEffect(() => {
    if (location.state?.simJsonText) {
      sessionStorage.setItem(WARRIOR_SIM_PAYLOAD_KEY, location.state.simJsonText);
      localStorage.setItem(WARRIOR_SIM_PAYLOAD_KEY, location.state.simJsonText);
    }
  }, [location.state]);

  const onCopyPayload = async () => {
    if (!payload) {
      setCopyMessage("No Warrior payload found. Return to Characters and launch again.");
      return;
    }

    if (!navigator?.clipboard?.writeText) {
      setCopyMessage("Clipboard access is unavailable in this browser context.");
      return;
    }

    try {
      await navigator.clipboard.writeText(payload);
      setCopyMessage("Copied Warrior JSON. In the sim: Import > JSON Import > paste > Import.");
    } catch {
      setCopyMessage("Failed to copy payload. Please try again.");
    }
  };

  return (
    <section className="panel sim-page">
      <div className="panel-heading">
        <div>
          <h2>Integrated Warrior Sim</h2>
          <p className="subtitle">No file export needed. Launches WoWSims in-app with your current gear payload ready.</p>
        </div>
        <div className="row-actions">
          <button type="button" className="secondary-btn" onClick={() => navigate("/characters")}>Back to Characters</button>
          <button type="button" className="secondary-btn" onClick={onCopyPayload}>Copy Current Payload</button>
        </div>
      </div>

      {missingSlots.length ? (
        <p className="subtitle sync-warning">
          Missing worn items for: {missingSlots.map((slot) => SLOT_LABELS[slot] || `Slot ${slot}`).join(", ")}. Template fallback IDs were used.
        </p>
      ) : null}

      {copyMessage ? <p className="subtitle">{copyMessage}</p> : null}

      <div className="sim-tip-grid">
        <div className="sim-tip-card">
          <h3>Quick Import</h3>
          {isLocalBridgeMode ? (
            <>
              <p className="subtitle">Local bridge mode is active.</p>
              <p className="subtitle">Your current Warrior payload is auto-loaded into WoWSims on page load.</p>
            </>
          ) : (
            <>
              <p className="subtitle">1. Click Copy Current Payload.</p>
              <p className="subtitle">2. In WoWSims, use Import then JSON Import.</p>
              <p className="subtitle">3. Paste and import.</p>
            </>
          )}
        </div>
      </div>

      <div className="sim-embed-wrap">
        <iframe
          title="WoWSims Classic Warrior"
          src={simUrl}
          className="sim-embed-frame"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    </section>
  );
}

export default WarriorSimPage;
