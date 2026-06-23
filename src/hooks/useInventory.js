import { useCallback, useEffect, useState } from "react";
import { INVENTORY_UPDATED_EVENT, loadInventoryItems } from "../utils/inventoryLocalStore";

export function useInventory() {
  const [inventoryItems, setInventoryItems] = useState([]);

  const refresh = useCallback(() => {
    loadInventoryItems().then(setInventoryItems).catch(() => setInventoryItems([]));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    window.addEventListener(INVENTORY_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(INVENTORY_UPDATED_EVENT, refresh);
  }, [refresh]);

  return inventoryItems;
}
