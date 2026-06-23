import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { COLLECTIONS, deleteAllUserData, subscribeAllCollection } from "../services/dataService";

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString();
}

function AdminPage() {
  const { user, isAdmin, hasFirebaseConfig } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [lootItems, setLootItems] = useState([]);
  const [raidStatuses, setRaidStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return () => {};
    }

    setLoading(true);
    const unsubscribers = [];

    unsubscribers.push(
      subscribeAllCollection(COLLECTIONS.accounts, (docs) => {
        setAccounts(docs);
      })
    );
    unsubscribers.push(
      subscribeAllCollection(COLLECTIONS.characters, (docs) => {
        setCharacters(docs);
      })
    );
    unsubscribers.push(
      subscribeAllCollection(COLLECTIONS.inventoryItems, (docs) => {
        setInventoryItems(docs);
      })
    );
    unsubscribers.push(
      subscribeAllCollection(COLLECTIONS.lootItems, (docs) => {
        setLootItems(docs);
      })
    );
    unsubscribers.push(
      subscribeAllCollection(COLLECTIONS.raidStatuses, (docs) => {
        setRaidStatuses(docs);
        setLoading(false);
      })
    );

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [isAdmin]);

  const users = useMemo(() => {
    const map = new Map();

    const addCount = (uid, key, increment = 1) => {
      if (!uid) {
        return;
      }

      if (!map.has(uid)) {
        map.set(uid, {
          uid,
          accounts: 0,
          characters: 0,
          inventoryItems: 0,
          lootItems: 0,
          raidStatuses: 0,
          accountHints: new Set()
        });
      }

      const row = map.get(uid);
      row[key] += increment;
    };

    accounts.forEach((item) => {
      addCount(item.userId, "accounts");
      if (item.userId && item.battleNetId) {
        map.get(item.userId)?.accountHints.add(item.battleNetId);
      }
    });
    characters.forEach((item) => addCount(item.userId, "characters"));
    inventoryItems.forEach((item) => addCount(item.userId, "inventoryItems"));
    lootItems.forEach((item) => addCount(item.userId, "lootItems"));
    raidStatuses.forEach((item) => addCount(item.userId, "raidStatuses"));

    return [...map.values()]
      .map((item) => ({
        ...item,
        accountHints: [...item.accountHints],
          totalDocs: item.accounts + item.characters + item.inventoryItems + item.lootItems + item.raidStatuses
      }))
      .sort((a, b) => b.totalDocs - a.totalDocs || a.uid.localeCompare(b.uid));
        }, [accounts, characters, inventoryItems, lootItems, raidStatuses]);

  useEffect(() => {
    if (!users.length) {
      setSelectedUserId("");
      return;
    }

    if (!selectedUserId || !users.some((entry) => entry.uid === selectedUserId)) {
      setSelectedUserId(users[0].uid);
    }
  }, [users, selectedUserId]);

  const selectedCharacters = useMemo(
    () => characters.filter((item) => item.userId === selectedUserId),
    [characters, selectedUserId]
  );
  const selectedAccounts = useMemo(
    () => accounts.filter((item) => item.userId === selectedUserId),
    [accounts, selectedUserId]
  );
  const selectedLoot = useMemo(
    () => lootItems.filter((item) => item.userId === selectedUserId),
    [lootItems, selectedUserId]
  );
  const selectedInventory = useMemo(
    () => inventoryItems.filter((item) => item.userId === selectedUserId),
    [inventoryItems, selectedUserId]
  );

  const onDeleteUserData = async () => {
    if (!selectedUserId || isDeleting) {
      return;
    }

    const confirmed = window.confirm(
      `Delete ALL stored data for user ${selectedUserId}? This cannot be undone.`
    );
    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteAllUserData(selectedUserId);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!hasFirebaseConfig) {
    return <p className="empty-panel">Add Firebase keys in your .env to enable Admin tools.</p>;
  }

  if (!user) {
    return <p className="empty-panel">Sign in to use admin tools.</p>;
  }

  if (!isAdmin) {
    return <p className="empty-panel">You do not have admin access.</p>;
  }

  if (loading) {
    return <p className="empty-panel">Loading admin data...</p>;
  }

  return (
    <section>
      <div className="panel-heading">
        <div>
          <h2>Admin Console</h2>
          <p className="subtitle">Manage user datasets and inspect cross-user activity.</p>
        </div>
      </div>

      <div className="panel admin-panel">
        <h3>Users ({users.length})</h3>
        {!users.length ? (
          <p className="empty-panel">No user documents found yet.</p>
        ) : (
          <div className="raid-table-wrapper">
            <table className="raid-table">
              <thead>
                <tr>
                  <th>User ID</th>
                  <th>Account Hints</th>
                  <th>Characters</th>
                  <th>Inventory</th>
                  <th>Loot Items</th>
                  <th>Raid Statuses</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {users.map((entry) => (
                  <tr
                    key={entry.uid}
                    className={entry.uid === selectedUserId ? "admin-row-selected" : ""}
                    onClick={() => setSelectedUserId(entry.uid)}
                  >
                    <td>{entry.uid}</td>
                    <td>{entry.accountHints.join(", ") || "-"}</td>
                    <td>{entry.characters}</td>
                    <td>{entry.inventoryItems}</td>
                    <td>{entry.lootItems}</td>
                    <td>{entry.raidStatuses}</td>
                    <td>{entry.totalDocs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedUserId ? (
        <div className="split-grid admin-grid">
          <div className="panel">
            <div className="panel-heading">
              <h3>Selected User</h3>
              <button type="button" className="danger" onClick={onDeleteUserData} disabled={isDeleting}>
                {isDeleting ? "Deleting..." : "Delete All User Data"}
              </button>
            </div>
            <p className="subtitle">{selectedUserId}</p>
            <h4>Accounts</h4>
            <ul className="simple-list">
              {selectedAccounts.length ? (
                selectedAccounts.map((item) => (
                  <li key={item.id}>
                    <span>{item.battleNetId || "Unknown account"}</span>
                    <span>{formatDate(item.createdAt)}</span>
                  </li>
                ))
              ) : (
                <li>No accounts</li>
              )}
            </ul>
          </div>

          <div className="panel">
            <h3>Characters ({selectedCharacters.length})</h3>
            <ul className="simple-list">
              {selectedCharacters.length ? (
                selectedCharacters
                  .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
                  .map((item) => (
                    <li key={item.id}>
                      <span>{item.name || "Unknown"} ({item.realm || "-"})</span>
                      <span>Lvl {item.level ?? "-"}</span>
                    </li>
                  ))
              ) : (
                <li>No characters</li>
              )}
            </ul>
          </div>

          <div className="panel">
            <h3>Inventory Items ({selectedInventory.length})</h3>
            <ul className="simple-list">
              {selectedInventory.length ? (
                selectedInventory.slice(0, 100).map((item) => (
                  <li key={item.id}>
                    <span>{item.itemName || "Unnamed item"}</span>
                    <span>
                      {item.characterName || "Unknown"} / {item.locationGroup || "-"}
                    </span>
                  </li>
                ))
              ) : (
                <li>No inventory items</li>
              )}
            </ul>
            {selectedInventory.length > 100 ? <p className="subtitle">Showing first 100 items.</p> : null}
          </div>

          <div className="panel">
            <h3>Loot Items ({selectedLoot.length})</h3>
            <ul className="simple-list">
              {selectedLoot.length ? (
                selectedLoot.slice(0, 100).map((item) => (
                  <li key={item.id}>
                    <span>{item.itemName || "Unnamed item"}</span>
                    <span>{item.raidName || "-"}</span>
                  </li>
                ))
              ) : (
                <li>No loot items</li>
              )}
            </ul>
            {selectedLoot.length > 100 ? (
              <p className="subtitle">Showing first 100 items.</p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="panel">
        <h3>Admin Limits</h3>
        <p className="subtitle">
          This UI can manage Firestore data. Managing Firebase Auth users (create/disable/delete sign-in accounts)
          requires a trusted backend with Firebase Admin SDK.
        </p>
      </div>
    </section>
  );
}

export default AdminPage;
