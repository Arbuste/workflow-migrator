import React, { createContext, useContext, useEffect, useState } from "react";
import { view, invoke } from "@forge/bridge";
import { Router, Route, Routes, useNavigate } from "react-router";
import Configuration from "./pages/Configuration";
import ListWorkflows from "./pages/ListWorkflows";
import Fields from "./pages/Fields";

// 1. Création du Contexte (exporté pour être accessible ailleurs si besoin)
export const AppContext = createContext(null);

// 2. Un hook personnalisé exporté pour faciliter l'utilisation dans vos pages
export function useAppConfig() {
  return useContext(AppContext);
}

function Link({ to, children }) {
  const navigate = useNavigate();
  return (
    <a
      href={to}
      onClick={(event) => {
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

function App() {
  const [historyState, setHistoryState] = useState(null);
  const [navigator, setNavigator] = useState(null);
  const historyCleanupRef = React.useRef(null);

  useEffect(() => {
    (async () => {
      // 1. Initialisation de l'historique Forge pour la navigation
      const history = await view.createHistory();
      setNavigator(history);

      setHistoryState({
        action: history.action,
        location: history.location,
      });

      const unsubscribe = await history.listen((location, action) => {
        setHistoryState({
          action,
          location,
        });
      });

      historyCleanupRef.current = unsubscribe;
    })();
  }, []);

  const handleUnload = () => {
    if (historyCleanupRef.current) {
      historyCleanupRef.current();
    }
  };

  useEffect(() => {
    window.addEventListener('unload', handleUnload);
    return () => {
      window.removeEventListener('unload', handleUnload);
    };
  }, []);

  if (!navigator || !historyState) {
    return <div>Loading...</div>;
  }

  return (
    /* 3. On enveloppe TOUTE l'application (incluant le Router et les Routes) avec le Provider */
    <AppContext.Provider>
      <div>
        <Router
          navigator={navigator}
          navigationType={historyState.action}
          location={historyState.location}
        >
          <Routes>
            <Route path="/workflows" element={<ListWorkflows />} />
            <Route path="/configuration" element={<Configuration />} />
            <Route path="/fields" element={<Fields />} />
          </Routes>
        </Router>
      </div>
    </AppContext.Provider>
  );
}

export default App;