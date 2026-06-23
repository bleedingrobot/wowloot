import { useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useUserCollections } from "../hooks/useUserCollections";
import { replaceInventoryItems } from "../services/dataService";
import { parseDataStoreContainers, summarizeInventoryItems } from "../utils/dataStoreContainersParser";

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function characterKey(name, realm) {
  return `${normalize(name)}|${normalize(realm)}`;
}

function InventoryPage() {
  const { user } = useAuth();
  const { data } = useUserCollections(user?.uid);
  const fileInputRef = useRef(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  const searchResults = useMemo(() => {
    const query = normalize(searchTerm);
    const grouped = summarizeInventoryItems(data.inventoryItems, data.characters, data.accounts);

    if (!query) {
      return grouped.slice(0, 12);
    }

    return grouped.filter((group) => {
      return normalize(group.itemName).includes(query) || String(group.itemId || "") === query;
    });
  }, [data.accounts, data.characters, data.inventoryItems, searchTerm]);

  const totalOwners = useMemo(() => {
    const keys = new Set(data.inventoryItems.map((item) => characterKey(item.characterName, item.realm)));
    return keys.size;
  }, [data.inventoryItems]);

  const totalStacks = data.inventoryItems.length;

  if (!user) {
    return <p className="empty-panel">Sign in to upload container files and search inventory.</p>;
  }

  const onPickFiles = () => {
    fileInputRef.current?.click();
  };

  const onFilesSelected = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";

    if (!files.length) {
      return;
    }

    setIsImporting(true);
    setImportMessage("Reading container files...");

    try {
      const parsedItems = [];

      for (const file of files) {
        const text = await file.text();
        const items = parseDataStoreContainers(text, file.name);
        parsedItems.push(...items);
      }

      await replaceInventoryItems(user.uid, parsedItems);

      const importedCharacters = new Set(parsedItems.map((item) => characterKey(item.characterName, item.realm)));
      const visibleItems = new Set(parsedItems.map((item) => `${item.itemId}|${normalize(item.itemName)}`));

      setImportMessage(
        `Imported ${files.length} file(s), ${importedCharacters.size} character(s), and ${visibleItems.size} unique item(s).`
      );
    } catch {
      setImportMessage("Import failed. Make sure you selected DataStore_Containers.lua files.");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <section className="split-grid inventory-page">
      <article className="panel inventory-upload-panel">
        <div className="panel-heading">
          <div>
            <h2>Container Inventory</h2>
            <p className="subtitle">Upload DataStore_Containers.lua files to index bags and bank items.</p>
          </div>
        </div>

        <p className="subtitle">
          Select every character/account save you want searchable together. The current import replaces the
          previous inventory index.
        </p>

        <div className="row-actions inventory-actions">
          <button type="button" onClick={onPickFiles} disabled={isImporting}>
            {isImporting ? "Importing..." : "Upload Container Files"}
          </button>
          <input
            ref={fileInputRef}
            className="hidden-input"
            type="file"
            accept=".lua"
            multiple
            onChange={onFilesSelected}
          />
        </div>

        <div className="inventory-stats">
          <div>
            <strong>{totalOwners}</strong>
            <span>Characters indexed</span>
          </div>
          <div>
            <strong>{totalStacks}</strong>
            <span>Item stacks loaded</span>
          </div>
        </div>

        {importMessage ? <p className="subtitle">{importMessage}</p> : null}
      </article>

      <article className="panel inventory-search-panel">
        <div className="panel-heading">
          <div>
            <h2>Item Search</h2>
            <p className="subtitle">Search any item name or ID to see who has it in bags or bank.</p>
          </div>
        </div>

        <div className="stack-form">
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search for an item, like Mageblood Potion or 13444"
          />
        </div>

        {searchResults.length ? (
          <div className="inventory-results">
            {searchResults.map((group) => (
              <section key={`${group.itemId}-${group.itemName}`} className="inventory-result-card">
                <div className="inventory-result-header">
                  <div>
                    <h3>{group.itemName}</h3>
                    <p className="subtitle">Item ID {group.itemId}</p>
                  </div>
                  <span className="sync-pill success">{group.owners.length} owner(s)</span>
                </div>

                <div className="inventory-owner-grid">
                  {group.owners.map((owner) => (
                    <div key={`${owner.characterName}|${owner.realm}`} className="inventory-owner-card">
                      <strong>{owner.characterName}</strong>
                      <p>
                        {owner.realm || "Unknown realm"}
                        {owner.accountName ? ` · ${owner.accountName}` : ""}
                      </p>
                      <p>
                        Bags {owner.bags} · Bank {owner.bank} · Total {owner.total}
                      </p>
                      {owner.fileNames.length ? (
                        <p className="subtitle">Source: {owner.fileNames.join(", ")}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <p className="empty-panel">
            {searchTerm.trim()
              ? "No imported inventory matches that item."
              : "Upload inventory files, then search for an item to see who has it."}
          </p>
        )}
      </article>
    </section>
  );
}

export default InventoryPage;