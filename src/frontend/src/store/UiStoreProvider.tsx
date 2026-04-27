import { useReducer } from "react";
import type { ReactNode } from "react";
import { UiStoreContext, initialState, uiReducer } from "./uiStore";

export function UiStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(uiReducer, initialState);

  return (
    <UiStoreContext.Provider value={{ state, dispatch }}>
      {children}
    </UiStoreContext.Provider>
  );
}
